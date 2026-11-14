const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { _electron } = require('playwright');
const { call } = require('../agents/client.cjs');
const root = process.env.WONDERFILM_QA_TEMP || require('node:os').tmpdir();
const temp = fs.mkdtempSync(path.join(root, 'wonderfilm-preview-'));
const ff = require('ffmpeg-static');
const desktop = path.resolve(__dirname, '..');
const report = { at: new Date().toISOString(), errors: [], cases: [] };
let app;
const invoke = (method, params = {}) => call(method, params, { connection: path.join(temp, 'profile', 'agent-connection.json'), client: 'preview-qa' });
(async () => {
  try {
    const source = path.join(temp, 'source.mp4');
    execFileSync(ff, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=12', '-f', 'lavfi', '-i', 'aevalsrc=0.1*sin(2*PI*(300*t+20*t*t)):s=48000:d=12', '-c:v', 'libx264', '-crf', '18', '-c:a', 'aac', '-shortest', source], { windowsHide: true });
    const env = { ...process.env, WONDERFILM_E2E_DIR: temp, WONDERFILM_E2E_BACKGROUND: '1', WONDERFILM_E2E_OFFSCREEN: '1', TMP: temp, TEMP: temp }; delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ executablePath: process.env.WONDERFILM_QA_EXE || require('electron'), args: [...(process.env.WONDERFILM_QA_EXE ? [] : [desktop]), '--user-data-dir=' + path.join(temp, 'profile')], env });
    await app.context().addInitScript(() => {
      window.qaOutputs = [];
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function(destination, ...args) {
        if (destination === this.context.destination && this instanceof GainNode) {
          const analyser = this.context.createAnalyser(); analyser.fftSize = 2048;
          const silent = this.context.createGain(); silent.gain.value = 0;
          connect.call(this, analyser); connect.call(analyser, silent); connect.call(silent, destination);
          window.qaOutputs.push({ gain: this, analyser }); return destination;
        }
        return connect.call(this, destination, ...args);
      };
    });
    const page = await app.firstWindow(); await page.reload(); page.setDefaultTimeout(15000);
    page.on('pageerror', e => report.errors.push(e.message));
    await page.waitForFunction(() => Boolean(window.wonderfilm));
    await page.evaluate(() => window.wonderfilm.agentEnable(true));
    await invoke('project.create', { name: 'Preview QA', width: 320, height: 180, fps: { num: 25, den: 1 } });
    await invoke('media.import', { paths: [source] });
    let state = await invoke('project.get');
    const media = state.media.find(m => m.source?.path === source);
    const track = state.sequence.tracks.find(t => t.kind === 'visual');
    const added = await invoke('clip.add', { mediaId: media.id, trackId: track.id, at: 0 });
    await invoke('playback.set', { at: 1, playing: true });
    async function rms(volume) {
      await invoke('clip.update', { clipId: added.clipId, volume });
      await invoke('playback.set', { at: 1, playing: true });
      await page.waitForFunction(() => {
        const out = window.qaOutputs.at(-1), video = document.querySelector('video');
        if (!out || !video || video.paused || video.readyState < 3 || out.gain.context.state !== 'running') return false;
        const samples = new Float32Array(2048); out.analyser.getFloatTimeDomainData(samples);
        return samples.some(value => Math.abs(value) > .01);
      }, null, { timeout: 10000 });
      await page.waitForTimeout(200); // llenar una ventana completa después de empezar a decodificar
      return page.evaluate(() => {
        const out = window.qaOutputs.at(-1); const samples = new Float32Array(2048); out.analyser.getFloatTimeDomainData(samples);
        return { gain: out.gain.gain.value, rms: Math.sqrt(samples.reduce((s, x) => s + x * x, 0) / samples.length) };
      });
    }
    const low = await rms(50), high = await rms(150);
    assert(low.rms > 0.01, JSON.stringify(low)); assert(Math.abs(high.rms / low.rms - 3) < 0.12, JSON.stringify({ low, high }));
    report.cases.push({ name: 'Ganancia real del visor 50→150%', ratio: high.rms / low.rms });
    await invoke('playback.set', { playing: false, at: 0 });
    await invoke('clip.update', { clipId: added.clipId, reversed: true, volume: 100 });
    await page.waitForFunction(() => { const v = document.querySelector('video'); return v && v.src.includes('wonderfilm-reverse-') && v.readyState >= 2; }, null, { timeout: 60000 });
    const reversed = await page.locator('video').evaluate(v => decodeURIComponent(new URL(v.src).pathname.slice(1)));
    const expected = path.join(temp, 'expected.mp4');
    execFileSync(ff, ['-v', 'error', '-i', source, '-vf', 'reverse', '-af', 'areverse', '-c:v', 'libx264', '-crf', '18', '-c:a', 'aac', expected], { windowsHide: true });
    const metric = spawnSync(ff, ['-i', expected, '-i', reversed, '-filter_complex', '[0:v][1:v]ssim', '-an', '-f', 'null', '-'], { windowsHide: true, encoding: 'utf8' });
    assert.equal(metric.status, 0, metric.stderr);
    const ssim = Number(metric.stderr.match(/All:([\d.]+)/)[1]); assert(ssim > .99, String(ssim));
    await invoke('playback.set', { at: 1, playing: true }); await page.waitForTimeout(700);
    const video = await page.locator('video').evaluate(v => ({ time: v.currentTime, paused: v.paused, duration: v.duration }));
    assert(video.time > 1.3 && !video.paused, JSON.stringify(video));
    report.cases.push({ name: 'Inversa por bloques y reproducción real', ssim, ...video });
    await invoke('playback.set', { playing: false });
    await invoke('project.create', { name: 'Crossfade QA', width: 320, height: 180, fps: { num: 25, den: 1 }, discardChanges: true });
    const colors = [];
    for (const color of ['red', 'blue']) {
      const file = path.join(temp, color + '.mp4');
      execFileSync(ff, ['-v', 'error', '-f', 'lavfi', '-i', `color=${color}:s=320x180:r=25:d=2`, '-c:v', 'libx264', file], { windowsHide: true }); colors.push(file);
    }
    await invoke('media.import', { paths: colors }); state = await invoke('project.get');
    const first = await invoke('clip.add', { mediaId: state.media.find(m => m.name === 'red.mp4').id, trackId: state.sequence.tracks.find(t => t.kind === 'visual').id, at: 0 });
    await invoke('clip.add', { mediaId: state.media.find(m => m.name === 'blue.mp4').id, trackId: state.sequence.tracks.find(t => t.kind === 'visual').id, at: 2 });
    await invoke('clip.transition', { clipId: first.clipId, name: 'Fundido cruzado' });
    await invoke('playback.set', { at: 2 });
    await page.waitForTimeout(350);
    const alpha = await page.locator('video').last().evaluate(v => Number(getComputedStyle(v.parentElement).opacity));
    assert(Math.abs(alpha - 0.5) < 0.01, String(alpha));
    const cross = path.join(temp, 'cross.mp4');
    const { jobId } = await invoke('export.start', { path: cross, format: 'mp4', quality: 'max', useGpu: false });
    let job;
    for (let i = 0; i < 240; i++) { job = await invoke('jobs.status', { jobId }); if (job.status !== 'running') break; await page.waitForTimeout(250); }
    assert.equal(job.status, 'completed', JSON.stringify(job));
    const rgb = execFileSync(ff, ['-v', 'error', '-ss', '2', '-i', cross, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { windowsHide: true });
    assert(rgb[0] > 90 && rgb[2] > 90 && rgb[1] < 15, String(rgb));
    report.cases.push({ name: 'Fundido cruzado mezcla ambas imágenes sin negro', previewAlpha: alpha, exportMidpointRGB: [...rgb] });
    for (const name of ['Fundido a negro', 'Barrido lateral', 'Zoom suave', 'Deslizar arriba', 'Desenfoque']) {
      await invoke('clip.transition', { clipId: first.clipId, name });
      await invoke('playback.set', { at: 2 });
      const appearance = await page.locator('video').last().evaluate(v => { const s = getComputedStyle(v.parentElement); return { opacity: s.opacity, transform: s.transform, clipPath: s.clipPath, filter: s.filter }; });
      const output = path.join(temp, name + '.mp4');
      const started = await invoke('export.start', { path: output, format: 'mp4', quality: 'max', useGpu: false });
      for (let i = 0; i < 240; i++) { job = await invoke('jobs.status', { jobId: started.jobId }); if (job.status !== 'running') break; await page.waitForTimeout(250); }
      assert.equal(job.status, 'completed', JSON.stringify(job));
      const pixel = runPixel(output);
      if (name === 'Fundido a negro') assert(pixel.every(x => x < 10), String(pixel));
      else assert(pixel[0] > 40 && pixel[2] > 40, String(pixel));
      if (name === 'Barrido lateral') assert(appearance.clipPath.includes('50%'), JSON.stringify(appearance));
      if (name === 'Desenfoque') assert(appearance.filter.includes('blur(4px)'), JSON.stringify(appearance));
      report.cases.push({ name, appearance, exportMidpointRGB: [...pixel] });
    }
    const expectedAudio = execFileSync(ff, ['-v', 'error', '-i', source, '-af', 'atrim=0:12,areverse', '-vn', '-ar', '48000', '-ac', '1', '-f', 'f32le', '-'], { windowsHide: true, maxBuffer: 5000000 });
    const actualAudio = execFileSync(ff, ['-v', 'error', '-i', reversed, '-vn', '-ar', '48000', '-ac', '1', '-f', 'f32le', '-'], { windowsHide: true, maxBuffer: 5000000 });
    let dot = 0, aa = 0, bb = 0;
    for (let i = 0; i < Math.min(expectedAudio.length, actualAudio.length) - 3; i += 4) {
      const a = expectedAudio.readFloatLE(i), b = actualAudio.readFloatLE(i); dot += a*b; aa += a*a; bb += b*b;
    }
    const correlation = dot / Math.sqrt(aa * bb);
    report.reverseAudio = { correlation, expectedSamples: expectedAudio.length / 4, actualSamples: actualAudio.length / 4 };
    assert(correlation > .98, JSON.stringify(report.reverseAudio));
    report.cases.push({ name: 'Audio inverso entre bloques', correlation });
    const wav = path.join(temp, 'audio-only.wav');
    execFileSync(ff, ['-v', 'error', '-i', source, '-vn', '-c:a', 'pcm_s16le', wav], { windowsHide: true });
    const audioOnly = await page.evaluate(p => window.wonderfilm.reversePreview(p, 1, 7), wav);
    assert(audioOnly.path, JSON.stringify(audioOnly));
    const streams = JSON.parse(execFileSync(require('ffprobe-static').path, ['-v', 'error', '-show_streams', '-of', 'json', audioOnly.path], { windowsHide: true })).streams;
    assert(streams.some(s => s.codec_type === 'audio') && !streams.some(s => s.codec_type === 'video'));
    assert(Math.abs(Number(streams[0].duration) - 6) < .05);
    report.cases.push({ name: 'Inversa de archivo solo audio y recorte 1–7s', seconds: Number(streams[0].duration) });
    const reverseDir = path.dirname(reversed);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].destroy());
    await app.close().catch(() => {}); app = undefined;
    assert(!fs.existsSync(reverseDir), 'Cache inversa no eliminada al cerrar');
    assert.deepEqual(report.errors, []); report.passed = true;
  } catch (e) { report.failure = e.stack; process.exitCode = 1; }
  finally {
    if (app) { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.destroy())).catch(() => {}); await app.close().catch(() => {}); }
    if (path.dirname(path.resolve(temp)) === path.resolve(root) && path.basename(temp).startsWith('wonderfilm-preview-')) fs.rmSync(temp, { recursive: true, force: true });
    report.cleaned = !fs.existsSync(temp);
    fs.writeFileSync((fs.mkdirSync(path.join(desktop, 'qa', 'artifacts'), { recursive: true }), path.join(desktop, 'qa', 'artifacts', 'preview-quality.json')), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  }
})();
function runPixel(file) { return execFileSync(ff, ['-v', 'error', '-ss', '2', '-i', file, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { windowsHide: true }); }
