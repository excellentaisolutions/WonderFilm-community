const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { _electron } = require('playwright');
const ffmpeg = require('ffmpeg-static');
const ffprobe = require('ffprobe-static').path;
const desktop = path.resolve(__dirname, '..');
const output = path.resolve(process.env.WONDERFILM_QA_OUTPUT || path.join(desktop, 'qa', 'artifacts'));
fs.mkdirSync(output, { recursive: true });
const temporaryRoot = path.resolve(process.env.WONDERFILM_QA_TEMP || os.tmpdir());
fs.mkdirSync(temporaryRoot, { recursive: true });
const temporary = fs.mkdtempSync(path.join(temporaryRoot, 'wonderfilm-qa-'));
const report = { date: new Date().toISOString(), target: 'current source build (out/)', cases: [], errors: [] };
let app, page;
async function check(name, run) {
  try { const evidence = await run(); report.cases.push({ name, status: 'passed', evidence }); }
  catch (error) { report.cases.push({ name, status: 'failed', error: error.stack }); throw error; }
}
async function snapshot(name) { if (process.env.WONDERFILM_QA_CAPTURE === '1') await page.screenshot({ path: path.join(temporary, name + '.png') }); }
async function save() {
  const file = path.join(temporary, 'Auditoría ñ.wonderfilm');
  const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).savedAt : null;
  await page.keyboard.press('Control+s');
  for (let attempt = 0; attempt < 100; attempt++) {
    if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).savedAt !== previous) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.notEqual(JSON.parse(fs.readFileSync(file, 'utf8')).savedAt, previous, 'Debe finalizar un guardado nuevo');
  await page.getByText('Guardado hace un momento', { exact: false }).waitFor();
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
(async () => {
  try {
    const input = path.join(temporary, 'sample.mp4');
    execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', input], { windowsHide: true });
    const env = { ...process.env, WONDERFILM_E2E_DIR: temporary, WONDERFILM_E2E_OFFSCREEN: '1', WONDERFILM_E2E_BACKGROUND: '1', TMP: temporary, TEMP: temporary }; delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ executablePath: require('electron'), args: [desktop, '--user-data-dir=' + path.join(temporary, 'profile')], env });
    assert.equal(path.resolve(await app.evaluate(({ app }) => app.getPath('temp'))), path.resolve(temporary));
    page = await app.firstWindow(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.wonderfilm));
    await check('Pasarela desactivada en perfil nuevo', async () => {
      const state = await page.evaluate(() => window.wonderfilm.agentStatus());
      assert.equal(state.enabled, false); assert.equal(state.busy, false);
    });
    await snapshot('01-start');
    await check('Nuevo proyecto mediante interfaz', async () => {
      await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click();
      await page.getByLabel('Nombre', { exact: true }).fill('Auditoría ñ');
      await page.getByRole('dialog').locator('select').nth(0).selectOption('4');
      await page.getByRole('dialog').locator('select').nth(1).selectOption('2');
      await page.getByRole('button', { name: 'Crear proyecto' }).click();
      await page.getByLabel('Nombre del proyecto').waitFor();
      await snapshot('02-new');
    });
    await check('Importar vídeo real y añadir por doble clic', async () => {
      await page.evaluate(() => { window.qaMedia = {}; window.wonderfilm.onMediaEvent(e => { if (e.type === 'added') window.qaMedia[e.item.id] = e.item; if (e.type === 'updated') Object.assign(window.qaMedia[e.id], e.patch); }); });
      assert.equal(await page.evaluate(p => window.wonderfilm.importMedia([p]), input), 1);
      await page.waitForFunction(() => Object.values(window.qaMedia).some(m => m.status === 'ready'), null, { timeout: 60000 });
      const media = await page.evaluate(() => Object.values(window.qaMedia)[0]);
      assert(fs.existsSync(media.source.thumbPath)); assert(fs.existsSync(media.source.peaksPath));
      await page.getByText('sample.mp4', { exact: true }).dblclick();
      assert.equal(await page.locator('[data-clip-id]').count(), 1);
      await snapshot('03-import');
      return { duration: media.duration, thumbnail: true, waveform: true, importVia: 'preload', placementVia: 'double click' };
    });
    await check('Visor decodifica y mantiene el vídeo alineado con el cabezal', async () => {
      await page.getByRole('button', { name: 'Ir al inicio', exact: true }).click();
      for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Fotograma siguiente', exact: true }).click();
      await page.waitForFunction(() => {
        const video = document.querySelector('video');
        return video && video.readyState >= 2 && !video.seeking && Math.abs(video.currentTime - 0.4) < 0.05;
      });
      await page.getByRole('button', { name: 'Reproducir', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.9);
      await page.getByRole('button', { name: 'Pausar', exact: true }).click();
      const media = await page.locator('video').evaluate(v => ({ time: v.currentTime, width: v.videoWidth, paused: v.paused, error: v.error?.message }));
      const counter = await page.getByRole('button', { name: 'Ir al inicio', exact: true }).locator('../..').locator('span').first().textContent();
      const [hours, minutes, seconds, frames] = counter.split(':').map(Number);
      const head = hours * 3600 + minutes * 60 + seconds + frames / 25;
      assert.equal(media.width, 640); assert.equal(media.paused, true); assert.equal(media.error, undefined);
      assert(Math.abs(media.time - head) <= 0.25);
      await page.getByRole('button', { name: 'Ir al inicio', exact: true }).click();
      return { pausedSeekSeconds: 0.4, decodedWidth: media.width, driftSeconds: Math.abs(media.time - head), listening: 'not verified' };
    });
    await check('Recortar con ratón y deshacer conserva la fuente', async () => {
      const before = await save();
      const clip = page.locator('[data-clip-id]');
      const box = await clip.boundingBox();
      await page.mouse.move(box.x + box.width - 3, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.65, box.y + box.height / 2, { steps: 10 });
      await page.mouse.up();
      const trimmed = await save();
      assert(trimmed.sequence.clips[0].sourceOut < before.sequence.clips[0].sourceOut);
      assert.equal(trimmed.sequence.clips[0].sourceIn, before.sequence.clips[0].sourceIn);
      await page.keyboard.press('Control+z');
      assert.deepEqual((await save()).sequence, before.sequence);
      return { beforeUs: before.sequence.clips[0].sourceOut, afterUs: trimmed.sequence.clips[0].sourceOut, undoRestores: true };
    });
    await check('Arrastre vertical entre pistas conserva tiempos y permite deshacer', async () => {
      const before = await save();
      const original = before.sequence.clips[0];
      const target = before.sequence.tracks.find(t => t.kind === 'visual' && t.id !== original.trackId && !t.locked);
      assert(target, 'Se necesita otra pista visual');
      const box = await page.locator('[data-clip-id]').boundingBox();
      const row = await page.locator(`[data-track-id="${target.id}"]`).boundingBox();
      const x = box.x + box.width / 2;
      await page.mouse.move(x, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(x, row.y + row.height / 2, { steps: 10 });
      await page.mouse.up();
      const moved = (await save()).sequence.clips[0];
      assert.equal(moved.trackId, target.id);
      assert.equal(moved.start, original.start);
      assert.equal(moved.sourceIn, original.sourceIn);
      assert.equal(moved.sourceOut, original.sourceOut);
      await page.keyboard.press('Control+z');
      assert.deepEqual((await save()).sequence, before.sequence);
      return { verticalOnly: true, timesPreserved: true, undoRestores: true };
    });
    await check('Selección, duplicar, deshacer y rehacer con atajos', async () => {
      await page.locator('[data-clip-id]').click();
      assert.equal(await page.locator('[data-clip-id]').getAttribute('aria-pressed'), 'true');
      await page.keyboard.press('Control+d'); assert.equal(await page.locator('[data-clip-id]').count(), 2);
      await page.keyboard.press('Control+z'); assert.equal(await page.locator('[data-clip-id]').count(), 1);
      await page.keyboard.press('Control+Shift+z'); assert.equal(await page.locator('[data-clip-id]').count(), 2);
      const doc = await save(); assert.equal(doc.sequence.clips.length, 2); assert.equal(doc.sequence.fps.num, 25);
      await snapshot('04-edited');
    });
    await check('Guardar, recientes y reapertura desde interfaz', async () => {
      const before = await save();
      await page.getByRole('button', { name: 'Volver al inicio', exact: true }).click();
      await page.getByText('Auditoría ñ', { exact: true }).click();
      await page.getByLabel('Nombre del proyecto').waitFor();
      assert.equal(await page.locator('[data-clip-id]').count(), 2);
      const after = await save(); assert.deepEqual(after.sequence, before.sequence);
      return { faithfulSequence: true };
    });
    await check('Exportar desde interfaz y decodificar vídeo y audio', async () => {
      await page.getByRole('button', { name: 'Exportar', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Exportar', exact: true }).click();
      await page.getByText('Vídeo exportado', { exact: true }).waitFor({ timeout: 120000 });
      const file = path.join(temporary, 'Auditoría ñ.mp4');
      const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8', windowsHide: true }));
      const video = probe.streams.find(s => s.codec_type === 'video');
      assert.equal(video.width, 1280); assert.equal(video.height, 720); assert.equal(video.r_frame_rate, '25/1');
      assert(Math.abs(Number(probe.format.duration) - 4) < 0.15); assert(probe.streams.some(s => s.codec_type === 'audio'));
      execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-'], { windowsHide: true });
      execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-frames:v', '1', '-y', path.join(temporary, 'export-frame.png')], { windowsHide: true });
      await snapshot('05-export');
      await page.getByRole('button', { name: 'Listo', exact: true }).click();
      return { width: video.width, height: video.height, fps: video.r_frame_rate, seconds: probe.format.duration, decoded: true, listening: 'not verified' };
    });
    await check('Archivo de proyecto inválido devuelve error', async () => {
      const file = path.join(temporary, 'invalid.wonderfilm'); fs.writeFileSync(file, '{}');
      const result = await page.evaluate(p => window.wonderfilm.openProject(p), file);
      assert(result.error); return { error: result.error };
    });
    await check('Proyecto con clip malformado se rechaza antes de entrar al editor', async () => {
      const doc = await save();
      doc.sequence.clips[0].transform = null;
      const file = path.join(temporary, 'malformed.wonderfilm'); fs.writeFileSync(file, JSON.stringify(doc));
      const result = await page.evaluate(p => window.wonderfilm.openProject(p), file);
      assert(result.error, 'Un clip sin transformación no debe entrar al renderer');
      return { rejected: true };
    });
    await check('Exportar sobre un original se rechaza sin modificarlo', async () => {
      const doc = await save();
      const before = createHash('sha256').update(fs.readFileSync(input)).digest('hex');
      const result = await page.evaluate(req => window.wonderfilm.startExport(req), { sequence: doc.sequence, media: doc.media, output: input, format: 'mp4', quality: 'high', useGpu: false });
      assert.equal(result.ok, false);
      assert(fs.existsSync(input), 'El original debe seguir existiendo');
      assert.equal(createHash('sha256').update(fs.readFileSync(input)).digest('hex'), before);
      return { rejected: true, originalUnchanged: true };
    });
    await check('Importación múltiple de audio, imagen y vídeo con proxy', async () => {
      const audio = path.join(temporary, 'tono.wav');
      const image = path.join(temporary, 'imagen.png');
      const proxyInput = path.join(temporary, 'proxy.avi');
      const run = args => execFileSync(ffmpeg, ['-v', 'error', ...args], { windowsHide: true });
      run(['-f', 'lavfi', '-i', 'sine=frequency=880:duration=1', audio]);
      run(['-f', 'lavfi', '-i', 'color=c=red:s=320x180', '-frames:v', '1', image]);
      run(['-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=25:d=1', '-c:v', 'mpeg4', proxyInput]);
      assert.equal(await page.evaluate(paths => window.wonderfilm.importMedia(paths), [audio, image, proxyInput]), 3);
      await page.waitForFunction(() => ['tono.wav', 'imagen.png', 'proxy.avi'].every(name => Object.values(window.qaMedia).some(m => m.name === name && m.status === 'ready')), null, { timeout: 60000 });
      const items = await page.evaluate(() => Object.values(window.qaMedia));
      const sound = items.find(m => m.name === 'tono.wav');
      const still = items.find(m => m.name === 'imagen.png');
      const video = items.find(m => m.name === 'proxy.avi');
      assert.equal(sound.kind, 'audio'); assert(fs.existsSync(sound.source.peaksPath));
      assert.equal(still.kind, 'image'); assert.equal(still.duration, null); assert(fs.existsSync(still.source.thumbPath));
      assert.equal(video.source.proxy, true); assert.notEqual(video.source.path, video.source.playPath);
      const metadata = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_streams', '-of', 'json', video.source.playPath], { encoding: 'utf8', windowsHide: true }));
      assert.equal(metadata.streams[0].codec_name, 'h264');
      execFileSync(ffmpeg, ['-v', 'error', '-i', video.source.playPath, '-f', 'null', '-'], { windowsHide: true });
      const doc = await save();
      for (const name of ['tono.wav', 'imagen.png', 'proxy.avi']) assert(doc.media.some(m => m.name === name));
      return { imported: 3, waveform: true, thumbnail: true, proxyCodec: 'h264', proxyDecoded: true };
    });
    await check('Volumen del inspector se guarda y reduce la amplitud exportada', async () => {
      await page.locator('[data-clip-id]').first().click();
      const baseline = await save();
      const volume = page.getByRole('slider', { name: /^Volumen/ });
      await volume.fill('49'); await volume.press('ArrowRight');
      const reduced = await save();
      const id = baseline.sequence.clips[0].id;
      assert.equal(reduced.sequence.clips.find(c => c.id === id).volume, 50);
      async function renderRms(doc, name) {
        const output = path.join(temporary, name + '.mp4');
        const result = await page.evaluate(req => window.wonderfilm.startExport(req), { sequence: doc.sequence, media: doc.media, output, format: 'mp4', quality: 'high', useGpu: false });
        assert.equal(result.ok, true, JSON.stringify(result));
        const pcm = execFileSync(ffmpeg, ['-v', 'error', '-i', output, '-ss', '0.2', '-t', '1.4', '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { windowsHide: true });
        assert(pcm.length > 0);
        let sum = 0;
        for (let i = 0; i < pcm.length; i += 4) sum += pcm.readFloatLE(i) ** 2;
        return Math.sqrt(sum / (pcm.length / 4));
      }
      const full = await renderRms(baseline, 'volume-full');
      const half = await renderRms(reduced, 'volume-half');
      assert(full > 0.01); assert(Math.abs(half / full - 0.5) < 0.03);
      await volume.blur();
      await page.keyboard.press('Control+z');
      assert.deepEqual((await save()).sequence, baseline.sequence);
      return { volume: 50, amplitudeRatio: half / full, exportVia: 'preload', listening: 'not verified', undoRestores: true };
    });
    await check('Fundidos del inspector atenúan inicio y final del audio exportado', async () => {
      await page.locator('[data-clip-id]').first().click();
      const before = await save();
      for (const name of ['Fundido entrada', 'Fundido salida']) {
        const slider = page.getByRole('slider', { name: new RegExp('^' + name) });
        await slider.fill('0.4'); await slider.press('ArrowRight'); await slider.blur();
      }
      const faded = await save();
      assert.equal(faded.sequence.clips[0].fadeIn, 500000);
      assert.equal(faded.sequence.clips[0].fadeOut, 500000);
      const output = path.join(temporary, 'fades.mp3');
      const result = await page.evaluate(req => window.wonderfilm.startExport(req), { sequence: faded.sequence, media: faded.media, output, format: 'mp3', quality: 'high', useGpu: false });
      assert.equal(result.ok, true, JSON.stringify(result));
      function rms(at) {
        const pcm = execFileSync(ffmpeg, ['-v', 'error', '-i', output, '-ss', String(at), '-t', '0.1', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { windowsHide: true });
        assert.equal(pcm.length, 4800 * 4);
        let sum = 0;
        for (let i = 0; i < pcm.length; i += 4) sum += pcm.readFloatLE(i) ** 2;
        return Math.sqrt(sum / 4800);
      }
      const center = rms(0.95), entrance = rms(0.05) / center, exit = rms(1.85) / center;
      assert(center > 0.01); assert(entrance > 0.1 && entrance < 0.35); assert(exit > 0.1 && exit < 0.35);
      await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
      assert.deepEqual((await save()).sequence, before.sequence);
      return { fadeUs: 500000, entranceRelativeRms: entrance, exitRelativeRms: exit, undoRestores: true, listening: 'not verified' };
    });
    await check('Bloqueo de pista impide arrastrar y se guarda', async () => {
      const before = await save();
      const clip = before.sequence.clips[0];
      const row = page.locator(`[data-track-id="${clip.trackId}"]`).locator('..');
      await row.getByRole('button', { name: 'Bloquear pista', exact: true }).click();
      const locked = await save();
      assert.equal(locked.sequence.tracks.find(t => t.id === clip.trackId).locked, true);
      const box = await page.locator(`[data-clip-id="${clip.id}"]`).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 10 });
      await page.mouse.up();
      assert.deepEqual((await save()).sequence, locked.sequence);
      await page.keyboard.press('Control+z');
      assert.deepEqual((await save()).sequence, before.sequence);
      return { dragBlocked: true, persisted: true, undoRestores: true };
    });
    await check('Silencio de pista de audio persiste y se deshace', async () => {
      const initial = await save();
      await page.getByText('tono.wav', { exact: true }).dblclick();
      const before = await save();
      const media = before.media.find(m => m.name === 'tono.wav');
      const tone = before.sequence.clips.find(c => c.mediaId === media.id);
      assert(tone, 'El tono debe estar colocado en la timeline');
      const track = before.sequence.tracks.find(t => t.id === tone.trackId);
      assert.equal(track.kind, 'audio');
      const row = page.locator(`[data-track-id="${track.id}"]`).locator('..');
      await row.getByRole('button', { name: 'Silenciar pista', exact: true }).click();
      const muted = await save();
      assert.equal(muted.sequence.tracks.find(t => t.id === track.id).muted, true);
      const reopened = await page.evaluate(p => window.wonderfilm.openProject(p), path.join(temporary, 'Auditoría ñ.wonderfilm'));
      assert.equal(reopened.doc.sequence.tracks.find(t => t.id === track.id).muted, true);
      async function toneAmplitude(doc, name) {
        const output = path.join(temporary, name + '.mp3');
        const result = await page.evaluate(req => window.wonderfilm.startExport(req), { sequence: doc.sequence, media: doc.media, output, format: 'mp3', quality: 'high', useGpu: false });
        assert.equal(result.ok, true, JSON.stringify(result));
        const pcm = execFileSync(ffmpeg, ['-v', 'error', '-i', output, '-ss', String(tone.start / 1000000 + 0.2), '-t', '0.6', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { windowsHide: true });
        const n = pcm.length / 4;
        assert(n > 20000);
        let real = 0, imaginary = 0;
        for (let i = 0; i < n; i++) {
          const phase = 2 * Math.PI * 880 * i / 48000;
          real += pcm.readFloatLE(i * 4) * Math.cos(phase);
          imaginary += pcm.readFloatLE(i * 4) * Math.sin(phase);
        }
        return 2 * Math.hypot(real, imaginary) / n;
      }
      const audible = await toneAmplitude(before, 'track-audible');
      const silent = await toneAmplitude(muted, 'track-muted');
      assert(audible > 0.02); assert(silent < audible * 0.01);
      await page.keyboard.press('Control+z');
      assert.deepEqual((await save()).sequence, before.sequence);
      await page.keyboard.press('Control+z');
      assert.deepEqual((await save()).sequence, initial.sequence);
      return { mutePersisted: true, undoRestores: true, tone880HzBefore: audible, tone880HzMuted: silent, listening: 'not verified' };
    });
    await check('Reabrir con original ausente conserva montaje y marca el medio', async () => {
      const before = await save();
      const moved = path.join(temporary, 'sample-moved.mp4');
      fs.renameSync(input, moved);
      try {
        const opened = await page.evaluate(p => window.wonderfilm.openProject(p), path.join(temporary, 'Auditoría ñ.wonderfilm'));
        assert(!opened.error);
        const doc = opened.doc;
        assert.equal(doc.media.find(m => m.name === 'sample.mp4').status, 'missing');
        assert.deepEqual(doc.sequence, before.sequence);
        return { missingDetected: true, sequencePreserved: true, via: 'preload openProject' };
      } finally { fs.renameSync(moved, input); }
    });
    await check('Cancelar con FFmpeg activo limpia la salida y permite volver a exportar', async () => {
      const doc = await save();
      const title = { id: 'qa-cancel-title', name: 'Prueba cancelación', kind: 'text', duration: null, hue: 40, status: 'ready' };
      const clip = { ...doc.sequence.clips[0], id: 'qa-cancel-clip', mediaId: title.id, start: 0, sourceIn: 0, sourceOut: 12000000, text: 'Prueba de cancelación' };
      const output = path.join(temporary, 'cancelled.mp4');
      const req = { sequence: { ...doc.sequence, width: 1920, height: 1080, fps: { num: 60, den: 1 }, clips: [clip] }, media: [title], output, format: 'mp4', quality: 'max', useGpu: false };
      const evidence = await page.evaluate(async req => {
        let fraction = null;
        const off = window.wonderfilm.onExportProgress(value => {
          if (fraction === null && value >= 0.5 && value < 1) {
            fraction = value;
            void window.wonderfilm.cancelExport();
          }
        });
        try { return { result: await window.wonderfilm.startExport(req), fraction }; }
        finally { off(); }
      }, req);
      assert.equal(evidence.result.cancelled, true);
      assert(evidence.fraction >= 0.5 && evidence.fraction < 1);
      assert.equal(fs.existsSync(output), false);
      assert.equal(fs.readdirSync(temporary).filter(name => name.startsWith('wonderfilm-export-')).length, 0);
      const retry = await page.evaluate(req => window.wonderfilm.startExport(req), { ...req, sequence: doc.sequence, media: doc.media, quality: 'high' });
      assert.equal(retry.ok, true, JSON.stringify(retry));
      execFileSync(ffmpeg, ['-v', 'error', '-i', output, '-f', 'null', '-'], { windowsHide: true });
      return { cancelledAtFraction: evidence.fraction, partialOutputRemoved: true, workDirectoriesRemoved: true, retryDecoded: true, via: 'preload' };
    });
    await check('Cancelar sustitución conserva el proyecto sin guardar', async () => {
      await page.getByLabel('Nombre del proyecto').fill('Cambios pendientes');
      await page.getByLabel('Nombre del proyecto').blur();
      await page.keyboard.press('Control+n');
      await page.getByLabel('Nombre', { exact: true }).fill('Proyecto sustituto');
      await page.getByRole('button', { name: 'Crear proyecto' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Seguir editando', exact: true }).last().click();
      await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
      assert.equal(await page.getByLabel('Nombre del proyecto').inputValue(), 'Cambios pendientes');
      assert.equal(await page.locator('[data-clip-id]').count(), 2);
      return { customConfirmation: true, clipsPreserved: 2 };
    });
    await check('Aceptar descarte crea el proyecto nuevo', async () => {
      await page.keyboard.press('Control+n');
      await page.getByLabel('Nombre', { exact: true }).fill('Proyecto sustituto');
      await page.getByRole('button', { name: 'Crear proyecto' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar cambios', exact: true }).click();
      assert.equal(await page.getByLabel('Nombre del proyecto').inputValue(), 'Proyecto sustituto');
      assert.equal(await page.locator('[data-clip-id]').count(), 0);
    });
    await check('Autoguardado conserva los cambios en el archivo existente', async () => {
      const file = path.join(temporary, 'Proyecto sustituto.wonderfilm');
      await page.keyboard.press('Control+s');
      await page.getByText('Guardado hace un momento', { exact: false }).waitFor();
      assert(fs.existsSync(file));
      await page.getByRole('button', { name: 'Volver al inicio', exact: true }).click();
      await page.clock.install();
      await page.getByText('Proyecto sustituto', { exact: true }).click();
      await page.getByLabel('Nombre del proyecto').fill('Autoguardado ñ');
      await page.getByLabel('Nombre del proyecto').blur();
      await page.clock.fastForward(120_001);
      await page.getByText('Guardado hace un momento', { exact: false }).waitFor();
      assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).name, 'Autoguardado ñ');
      return { timerAdvancedMs: 120001, existingPathPreserved: true };
    });
    await page.clock.resume();
    await check('Guardar y continuar conserva el proyecto antes de sustituirlo', async () => {
      await page.getByLabel('Nombre del proyecto').fill('Antes de continuar');
      await page.getByLabel('Nombre del proyecto').blur();
      await page.keyboard.press('Control+n');
      await page.getByLabel('Nombre', { exact: true }).fill('Nueva sesión');
      await page.getByRole('button', { name: 'Crear proyecto' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Guardar y continuar' }).click();
      await page.getByRole('alertdialog').waitFor({ state: 'detached' });
      assert.equal(await page.getByLabel('Nombre del proyecto').inputValue(), 'Nueva sesión');
      const file = path.join(temporary, 'Proyecto sustituto.wonderfilm');
      assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).name, 'Antes de continuar');
      await page.getByRole('button', { name: 'Volver al inicio', exact: true }).click();
      await page.getByText('Antes de continuar', { exact: true }).click();
      return { savedBeforeReplacement: true };
    });
    await check('Cierre real muestra diálogo propio y Escape conserva el proyecto', async () => {
      await page.getByLabel('Nombre del proyecto').fill('Cierre pendiente');
      await page.getByLabel('Nombre del proyecto').blur();
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
      const dialog = page.getByRole('alertdialog');
      await dialog.waitFor();
      assert.equal(await dialog.getByRole('heading').textContent(), '¿Guardar antes de salir?');
      if (process.env.WONDERFILM_QA_PREVIEW) await page.screenshot({ path: process.env.WONDERFILM_QA_PREVIEW });
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Shift+Tab');
      assert(await dialog.evaluate(el => el.contains(document.activeElement)));
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await page.getByLabel('Nombre del proyecto').inputValue(), 'Cierre pendiente');
      return { realWindowClose: true, escapePreserves: true, focusContained: true };
    });
    await check('Fallo al guardar mantiene abierto y reintentar permite guardar y salir', async () => {
      const file = path.join(temporary, 'Proyecto sustituto.wonderfilm');
      const backup = path.join(temporary, 'saved-backup.wonderfilm');
      fs.renameSync(file, backup); fs.mkdirSync(file);
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
      const dialog = page.getByRole('alertdialog');
      await dialog.getByRole('button', { name: 'Guardar y salir', exact: true }).click();
      await dialog.getByRole('button', { name: 'Reintentar guardado', exact: true }).waitFor();
      assert.equal(page.isClosed(), false);
      await dialog.locator('summary').click();
      assert.match(await dialog.locator('details').textContent(), /No se pudo guardar/);
      fs.rmdirSync(file); fs.renameSync(backup, file);
      const closed = page.waitForEvent('close');
      await dialog.getByRole('button', { name: 'Reintentar guardado', exact: true }).click().catch(error => { if (!page.isClosed()) throw error; });
      await closed;
      assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).name, 'Cierre pendiente');
      return { writeFailurePreservesWindow: true, retrySavedBeforeClosing: true };
    });
    await check('Salir sin guardar cierra y conserva la última versión del archivo', async () => {
      await app.close().catch(() => {});
      app = await _electron.launch({ executablePath: require('electron'), args: [desktop, '--user-data-dir=' + path.join(temporary, 'profile')], env });
      page = await app.firstWindow(); page.setDefaultTimeout(15000);
      page.on('pageerror', error => report.errors.push(error.message));
      await page.getByText('Cierre pendiente', { exact: true }).click();
      await page.getByLabel('Nombre del proyecto').fill('Cambio descartado');
      await page.getByLabel('Nombre del proyecto').blur();
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
      const closed = page.waitForEvent('close');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Salir sin guardar', exact: true }).click().catch(error => { if (!page.isClosed()) throw error; });
      await closed;
      assert.equal(JSON.parse(fs.readFileSync(path.join(temporary, 'Proyecto sustituto.wonderfilm'), 'utf8')).name, 'Cierre pendiente');
      return { closed: true, lastSavedVersionPreserved: true };
    });
    assert.deepEqual(report.errors, []);
  } catch (error) { report.failure = error.stack; process.exitCode = 1; }
  finally {
    if (app) { await app.evaluate(({ app }) => app.exit()).catch(() => {}); await app.close().catch(() => {}); }
    const resolved = path.resolve(temporary);
    if (path.dirname(resolved) === temporaryRoot && path.basename(resolved).startsWith('wonderfilm-qa-')) fs.rmSync(resolved, { recursive: true, force: true });
    report.temporaryFilesRemoved = !fs.existsSync(resolved);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify(report, null, 2));
})();
