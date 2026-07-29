#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from 'fs';
import { spawn } from 'child_process';
import { join } from 'path';

const TOKEN_PATH = join(process.env.TEMP || process.env.TMP, 'tauri-mcp.sock.token');

let tokenLoaded = false;
if (existsSync(TOKEN_PATH)) {
  const token = readFileSync(TOKEN_PATH, 'utf-8').trim();
  if (token) {
    process.env.TAURI_MCP_AUTH_TOKEN = token;
    console.error(`Auth token loaded from ${TOKEN_PATH} (${token.length} chars)`);
    tokenLoaded = true;
  }
}

if (!tokenLoaded) {
  console.error(`Token file not found at ${TOKEN_PATH}`);
}

const npxCache = join(process.env.LOCALAPPDATA, 'npm-cache', '_npx');
let indexJs = null;
for (const dir of readdirSync(npxCache)) {
  const candidate = join(npxCache, dir, 'node_modules', 'tauri-plugin-mcp-server', 'build', 'index.js');
  if (existsSync(candidate)) { indexJs = candidate; break; }
}

if (!indexJs) {
  console.error('tauri-plugin-mcp-server not found in npx cache');
  process.exit(1);
}

console.error(`Server: ${indexJs}`);
console.error(`AUTH_TOKEN env set: ${!!process.env.TAURI_MCP_AUTH_TOKEN}`);

const server = spawn(process.execPath, [indexJs], { stdio: 'inherit', env: process.env });
server.on('exit', (code) => process.exit(code ?? 1));
