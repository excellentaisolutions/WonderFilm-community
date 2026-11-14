#!/usr/bin/env node
const fs = require('node:fs');
const { call } = require('./client.cjs');

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--mcp')) {
    const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
    const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
    const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
    const server = new Server({ name: 'wonderfilm', version: require('../package.json').version }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: await call('tools') }));
    server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
      try {
        const available = await call('tools');
        if (!available.some(tool => tool.name === params.name)) throw new Error('Herramienta desconocida');
        const result = await call(params.name.replaceAll('_', '.'), params.arguments || {});
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
    });
    await server.connect(new StdioServerTransport());
    return;
  }
  const index = args.indexOf('--cli');
  const method = args[index + 1];
  if (index < 0 || !method) throw new Error('Uso: node agents/entry.cjs --mcp | --cli METHOD [--file argumentos.json] [--request-id UUID]');
  const fileAt = args.indexOf('--file'), idAt = args.indexOf('--request-id');
  const params = fileAt < 0 ? {} : JSON.parse(fs.readFileSync(args[fileAt + 1], 'utf8'));
  const result = await call(method, params, { requestId: idAt < 0 ? undefined : args[idAt + 1] });
  process.stdout.write(JSON.stringify({ result }) + '\n');
}
main().catch(error => { process.stderr.write(JSON.stringify({ error: error.message }) + '\n'); process.exitCode = 1; });
