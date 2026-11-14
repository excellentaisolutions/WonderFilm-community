const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { _electron } = require('playwright');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { call } = require('../agents/client.cjs');
const desktop = path.resolve(__dirname, '..');
const root = process.env.WONDERFILM_QA_TEMP || require('node:os').tmpdir();
fs.mkdirSync(root, { recursive: true });
const temp = fs.mkdtempSync(path.join(root, 'wonderfilm-agents-'));
const report = { at: new Date().toISOString(), cases: [], errors: [] };
const output = path.join(desktop, 'qa', 'artifacts', 'agents');
fs.mkdirSync(output, { recursive: true });
let app, page, mcp;
const connection = path.join(temp, 'profile', 'agent-connection.json');
const options = { connection, client: 'qa-agent' };
const invoke = (method, params = {}, extra = {}) => call(method, params, { ...options, ...extra });
async function check(name, run) { const evidence = await run(); report.cases.push({ name, passed: true, evidence }); }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function job(id) {
  for (let i = 0; i < 240; i++) { const j = await invoke('jobs.status', { jobId: id }); if (!['running', 'cancelling'].includes(j.status)) return j; await delay(250); }
  throw new Error('Trabajo sin terminar');
}
(async () => {
  try {
    const env = { ...process.env, WONDERFILM_E2E_DIR: temp, WONDERFILM_E2E_BACKGROUND: '1', TMP: temp, TEMP: temp }; delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ executablePath: process.env.WONDERFILM_QA_EXE || require('electron'), args: [...(process.env.WONDERFILM_QA_EXE ? [] : [desktop]), '--user-data-dir=' + path.join(temp, 'profile')], env });
    page = await app.firstWindow(); page.setDefaultTimeout(15000);
    app.process().stderr?.on('data', data => { const message = data.toString(); if (/Uncaught Exception|UnhandledPromiseRejection|Error occurred in handler/.test(message)) report.errors.push(message.slice(0, 1500)); });
    page.on('pageerror', e => report.errors.push(e.message));
    await page.waitForFunction(() => Boolean(window.wonderfilm));
    await check('Desactivada por defecto y activación visible', async () => {
      await assert.rejects(invoke('project.get'), /Activa/);
      await page.getByRole('button', { name: 'Integraciones IA', exact: true }).click();
      await page.getByLabel('Permitir conexiones locales').click();
      await page.waitForFunction(() => document.querySelector('input[type=checkbox]')?.checked);
      await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
      return { enabled: (await page.evaluate(() => window.wonderfilm.agentStatus())).enabled };
    });
    await check('HTTP rechaza credenciales, Origin y parámetros desconocidos', async () => {
      const c = JSON.parse(fs.readFileSync(connection, 'utf8'));
      const raw = headers => new Promise((resolve, reject) => {
        const req = require('node:http').request({ hostname: '127.0.0.1', port: c.port, path: '/call', method: 'POST', headers }, res => { res.resume(); res.on('end', () => resolve({ status: res.statusCode })); });
        req.on('error', reject); req.end('{}');
      });
      assert.equal((await raw({})).status, 403);
      assert.equal((await raw({ Authorization: `Bearer ${c.token}`, Origin: 'https://example.com' })).status, 403);
      assert.equal((await raw({ Authorization: `Bearer ${c.token}`, Host: 'localhost' })).status, 403);
      await assert.rejects(invoke('project.get', { unexpected: true }));
      return { unauthorized: true, origin: true, host: true, strictSchema: true };
    });
    await check('MCP handshake, catálogo y llamada real', async () => {
      const status = await page.evaluate(() => window.wonderfilm.agentStatus());
      const config = status.mcp.mcpServers.wonderfilm;
      mcp = new Client({ name: 'qa', version: '1.0.0' });
      await mcp.connect(new StdioClientTransport({ command: config.command, args: config.args, env: { ...process.env, ...config.env }, stderr: 'pipe' }));
      const tools = await mcp.listTools(); assert(tools.tools.some(t => t.name === 'clip_add'));
      const result = await mcp.callTool({ name: 'capabilities_get', arguments: {} }); assert(!result.isError);
      return { tools: tools.tools.length, realMcp: true };
    });
    await invoke('project.create', { name: 'Demo QA', width: 640, height: 360, fps: { num: 25, den: 1 } });
    const original = process.env.WONDERFILM_QA_INPUT || path.join(temp, 'original.mp4');
    if (!process.env.WONDERFILM_QA_INPUT) execFileSync(require('ffmpeg-static'), ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25:d=3', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=3', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', original], { windowsHide: true });
    const hash = createHash('sha256').update(fs.readFileSync(original)).digest('hex');
    const imported = await invoke('media.import', { paths: [original] });
    let state = await invoke('project.get');
    const track = state.sequence.tracks.filter(t => t.kind === 'visual').at(-1);
    const { clipId } = await invoke('clip.add', { mediaId: imported[0].id, trackId: track.id, at: 0 });
    if (process.env.WONDERFILM_QA_AUDIO) {
      const audio = await invoke('media.import', { paths: [process.env.WONDERFILM_QA_AUDIO] });
      const audioTrack = state.sequence.tracks.find(t => t.kind === 'audio');
      await invoke('clip.add', { mediaId: audio[0].id, trackId: audioTrack.id, at: 0, duration: Math.min(audio[0].duration, imported[0].duration) / 1000000 });
    }
    await check('Edición de agentes aparece en UI, admite historial y reabre fielmente', async () => {
      assert.equal(await page.locator('[data-clip-id]').count(), process.env.WONDERFILM_QA_AUDIO ? 2 : 1);
      await invoke('clip.update', { clipId, volume: 70, fadeIn: 0.3, effects: ['warm'] });
      await invoke('history.undo'); assert.equal((await invoke('project.get')).sequence.clips.find(c => c.id === clipId).volume, 100);
      await invoke('history.redo'); assert.equal((await invoke('project.get')).sequence.clips.find(c => c.id === clipId).volume, 70);
      const titleTrack = await invoke('track.add', { kind: 'visual', name: 'Títulos IA' });
      await invoke('title.add', { trackId: titleTrack.trackId, text: 'WonderFilm · Demo', at: 0, duration: 2, color: '#f5a524' });
      const file = path.join(temp, 'montaje.wonderfilm');
      await invoke('project.save', { path: file });
      const before = (await invoke('project.get')).sequence;
      await invoke('project.open', { path: file });
      assert.deepEqual((await invoke('project.get')).sequence, before);
      await assert.rejects(invoke('project.save', { path: file }), /overwrite/);
      return { undoRedo: true, visibleClips: await page.locator('[data-clip-id]').count(), reopened: true, overwriteProtected: true };
    });
    await check('Reintentos idempotentes y conflicto de requestId', async () => {
      const requestId = randomUUID();
      const before = (await invoke('project.get')).sequence.tracks.length;
      const params = { kind: 'audio', name: 'Una sola pista' };
      const [a, b] = await Promise.all([invoke('track.add', params, { requestId }), invoke('track.add', params, { requestId })]);
      assert.equal(a.trackId, b.trackId); assert.equal((await invoke('project.get')).sequence.tracks.length, before + 1);
      await assert.rejects(invoke('track.add', { ...params, name: 'Otra' }, { requestId }), /requestId/);
      return { noDuplicateMutation: true };
    });
    await check('CLI distribuida consulta el proyecto', async () => {
      const status = await page.evaluate(() => window.wonderfilm.agentStatus());
      const config = status.mcp.mcpServers.wonderfilm;
      const text = execFileSync(config.command, [config.args[0], '--cli', 'project.get'], { encoding: 'utf8', windowsHide: true, env: { ...process.env, ...config.env } });
      assert.equal(JSON.parse(text).result.name, 'Demo QA');
      return { realCli: true };
    });
    await check('Exportación asíncrona, rechazo concurrente y original intacto', async () => {
      // La entrega no hereda la resolución ni los efectos de las regresiones.
      if (process.env.WONDERFILM_QA_DELIVER) {
        const info = JSON.parse(execFileSync(require('ffprobe-static').path, ['-v', 'error', '-show_streams', '-of', 'json', original], { windowsHide: true })).streams.find(s => s.codec_type === 'video');
        const [num, den] = info.r_frame_rate.split('/').map(Number);
        await invoke('project.configure', { width: info.width, height: info.height, fps: { num, den } });
        await invoke('clip.update', { clipId, effects: [], volume: 100, fadeIn: 0, fadeOut: 0 });
        const state = await invoke('project.get');
        const titles = state.sequence.clips.filter(c => state.media.find(m => m.id === c.mediaId)?.kind === 'text').map(c => c.id);
        if (titles.length) await invoke('clips.delete', { clipIds: titles });
      }
      const file = path.join(temp, 'demo.mp4');
      const { jobId } = await invoke('export.start', { path: file, format: 'mp4', quality: process.env.WONDERFILM_QA_DELIVER ? 'max' : 'high', useGpu: false });
      await assert.rejects(invoke('track.add', { kind: 'audio' }), /operación/);
      const result = await job(jobId); assert.equal(result.status, 'completed', JSON.stringify(result));
      execFileSync(require('ffmpeg-static'), ['-v', 'error', '-i', file, '-f', 'null', '-'], { windowsHide: true });
      assert.equal(createHash('sha256').update(fs.readFileSync(original)).digest('hex'), hash);
      if (process.env.WONDERFILM_QA_DELIVER) {
        fs.mkdirSync(process.env.WONDERFILM_QA_DELIVER, { recursive: true });
        fs.copyFileSync(file, path.join(process.env.WONDERFILM_QA_DELIVER, 'wonderfilm-demo.mp4'));
        await invoke('project.save', { path: path.join(process.env.WONDERFILM_QA_DELIVER, 'wonderfilm-demo.wonderfilm'), overwrite: true });
      }
      return { jobCompleted: true, decoded: true, originalPreserved: true };
    });
    for (const mode of ['agent', 'panel']) await check(`Cancelar trabajo desde ${mode} libera el editor`, async () => {
      const s = await invoke('project.get');
      await invoke('project.configure', { width: 1920, height: 1080, fps: { num: 60, den: 1 } });
      const visual = s.sequence.tracks.find(t => t.kind === 'visual');
      const title = await invoke('title.add', { trackId: visual.id, text: 'Cancelación QA', at: 4, duration: 120 });
      const file = path.join(temp, 'cancel-agent.mp4');
      const { jobId } = await invoke('export.start', { path: file, format: 'mp4', quality: 'max', useGpu: false });
      for (let i = 0; i < 100; i++) { const j = await invoke('jobs.status', { jobId }); if (j.progress > 0 || j.status !== 'running') break; await delay(50); }
      if (mode === 'agent') await invoke('jobs.cancel', { jobId });
      else {
        await page.getByRole('button', { name: 'Ver actividad', exact: true }).click();
        await page.getByRole('button', { name: 'Cancelar exportación', exact: true }).click();
      }
      const result = await job(jobId);
      assert.equal(result.status, 'cancelled', JSON.stringify(result));
      assert.equal(fs.existsSync(file), false);
      if (mode === 'panel') await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
      await invoke('clips.delete', { clipIds: [title.clipId] });
      await invoke('project.configure', { width: s.sequence.width, height: s.sequence.height, fps: s.sequence.fps });
      return { cancelled: true, partialRemoved: true, subsequentEdit: true };
    });
    const duration = Number(process.env.WONDERFILM_QA_SOAK_MS || 0);
    if (duration > 0) await check('Sesión sostenida de edición, guardado y consulta', async () => {
      const start = Date.now(); let cycles = 0;
      while (Date.now() - start < duration) {
        await invoke('clip.update', { clipId, volume: cycles % 2 ? 70 : 60 });
        await invoke('history.undo'); await invoke('history.redo');
        await invoke('project.save', { path: path.join(temp, 'soak.wonderfilm'), overwrite: true });
        assert.equal((await invoke('project.get')).sequence.clips.find(c => c.id === clipId).volume, cycles % 2 ? 70 : 60);
        cycles++; if (cycles % 60 === 0) console.log(`Sesión sostenida: ${cycles} ciclos completados`); await delay(1000);
      }
      return { elapsedMs: Date.now() - start, cycles, errors: report.errors.length };
    });
    await check('Revocación invalida el acceso anterior', async () => {
      const old = JSON.parse(fs.readFileSync(connection, 'utf8'));
      await page.evaluate(() => window.wonderfilm.agentRevoke());
      const res = await fetch(`http://127.0.0.1:${old.port}/call`, { method: 'POST', headers: { Authorization: `Bearer ${old.token}` }, body: '{}' });
      assert.equal(res.status, 403); return { revoked: true };
    });
    await check('Abrir archivo por argumento carga el proyecto al arrancar', async () => {
      await app.evaluate(({ app }) => app.exit()); await app.close().catch(() => {});
      app = await _electron.launch({ executablePath: process.env.WONDERFILM_QA_EXE || require('electron'), args: [...(process.env.WONDERFILM_QA_EXE ? [] : [desktop]), '--user-data-dir=' + path.join(temp, 'profile'), path.join(temp, 'montaje.wonderfilm')], env });
      page = await app.firstWindow(); page.setDefaultTimeout(10000);
      await page.getByLabel('Nombre del proyecto').waitFor();
      assert.equal(await page.getByLabel('Nombre del proyecto').inputValue(), 'Demo QA');
      return { fileArgumentOpened: true };
    });
    assert.deepEqual(report.errors, []);
  } catch (e) { report.failure = e.stack; process.exitCode = 1; }
  finally {
    await mcp?.close().catch(() => {});
    if (app) { await app.evaluate(({ app }) => app.exit()).catch(() => {}); await app.close().catch(() => {}); }
    if (path.dirname(path.resolve(temp)) === path.resolve(root) && path.basename(temp).startsWith('wonderfilm-agents-')) fs.rmSync(temp, { recursive: true, force: true });
    report.cleaned = !fs.existsSync(temp);
    fs.writeFileSync(path.join(output, process.env.WONDERFILM_QA_EXE ? 'packaged.json' : durationName()), JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify(report, null, 2));
})();
function durationName() { return process.env.WONDERFILM_QA_SOAK_MS ? 'soak.json' : process.env.WONDERFILM_QA_INPUT ? 'pipeline.json' : 'report.json'; }
