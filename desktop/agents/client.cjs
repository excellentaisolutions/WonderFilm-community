const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

async function call(method, params = {}, options = {}) {
  const connection = options.connection || process.env.WONDERFILM_CONNECTION;
  if (!connection || !path.isAbsolute(connection)) throw new Error('Define WONDERFILM_CONNECTION con la ruta absoluta del perfil, desde Integraciones IA.');
  const { port, token, enabled } = JSON.parse(fs.readFileSync(connection, 'utf8'));
  if (!enabled) throw new Error('Activa Integraciones IA en WonderFilm.');
  if (!Number.isInteger(port) || port < 1 || port > 65535 || typeof token !== 'string') throw new Error('Conexión local inválida.');
  const response = await fetch(`http://127.0.0.1:${port}/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ method, params, client: options.client || process.env.WONDERFILM_CLIENT || 'wonderfilm-cli', requestId: options.requestId || randomUUID() }),
    signal: AbortSignal.timeout(600000)
  });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || `HTTP ${response.status}`);
  return result.result;
}
module.exports = { call };
