#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const ROOT = process.cwd();
const HOST = process.env.CAREER_OS_MCP_HOST || '127.0.0.1';
const PORT = Number(process.env.CAREER_OS_MCP_PORT || 4318);
const TOKEN = process.env.CAREER_OS_MCP_TOKEN || '';
const STATE_DIR = path.join(ROOT, '.career-os-control');
const LOG_DIR = path.join(STATE_DIR, 'logs');
const PID_FILE = path.join(STATE_DIR, 'supervisor.pid');

fs.mkdirSync(LOG_DIR, { recursive: true });

function text(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

function safeRead(file, maxBytes = 200_000) {
  const resolved = path.resolve(file);
  if (!resolved.startsWith(ROOT + path.sep)) throw new Error('Path is outside CareerOS runtime.');
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error('Path is not a file.');
  const start = Math.max(0, stat.size - maxBytes);
  const fd = fs.openSync(resolved, 'r');
  try {
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    return buffer.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function recentFiles(dir, limit = 25) {
  const resolved = path.resolve(dir);
  if (!resolved.startsWith(ROOT + path.sep) || !fs.existsSync(resolved)) return [];
  return fs.readdirSync(resolved, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(resolved, entry.name);
      if (entry.isDirectory()) return recentFiles(full, limit);
      const stat = fs.statSync(full);
      return [{ path: path.relative(ROOT, full), size: stat.size, modifiedAt: stat.mtime.toISOString() }];
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    .slice(0, limit);
}

function runCommand(name, args, { timeoutMs = 30 * 60_000, env = {} } = {}) {
  const allowed = new Set(['npm', 'git', 'node']);
  if (!allowed.has(name)) throw new Error(`Command not allowed: ${name}`);
  const id = `${Date.now()}-${crypto.randomUUID()}`;
  const logPath = path.join(LOG_DIR, `${id}.log`);
  const out = fs.createWriteStream(logPath, { flags: 'a', mode: 0o600 });
  const child = spawn(name, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
  child.on('exit', () => {
    clearTimeout(timer);
    out.end();
  });
  return { id, pid: child.pid, log: path.relative(ROOT, logPath) };
}

function makeServer() {
  const server = new McpServer({ name: 'career-os-control-plane', version: '1.0.0' });

  server.registerTool('career_os_health', {
    title: 'CareerOS Health',
    description: 'Use this when you need the current CareerOS worker, repository, and control-plane health. Read-only.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => {
    const pid = fs.existsSync(PID_FILE) ? Number(fs.readFileSync(PID_FILE, 'utf8').trim()) : null;
    let supervisorRunning = false;
    if (pid) {
      try { process.kill(pid, 0); supervisorRunning = true; } catch {}
    }
    return text({
      root: ROOT,
      node: process.version,
      platform: process.platform,
      supervisorRunning,
      recentEvidence: recentFiles(path.join(ROOT, '.career-os-ci'), 10),
      recentControlLogs: recentFiles(LOG_DIR, 10),
    });
  });

  server.registerTool('career_os_run_canary', {
    title: 'Run One CareerOS Canary',
    description: 'Use this when authorized to execute exactly one controlled production application canary. Preserves existing CAPTCHA, MFA, legal, identity, duplicate, and email-confirmation gates.',
    inputSchema: z.object({ repair: z.boolean().default(true) }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, async ({ repair }) => {
    const script = repair ? 'supervisor' : 'worker:run-once';
    return text({ status: 'started', command: `npm run ${script}`, ...runCommand('npm', ['run', script], { env: { CAREER_OS_DAILY_LIMIT: '1' } }) });
  });

  server.registerTool('career_os_worker_health', {
    title: 'Check Browser Worker',
    description: 'Use this when you need the browser-worker health and queue state. Read-only.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => text({ status: 'started', ...runCommand('npm', ['run', 'worker:health'], { timeoutMs: 120_000 }) }));

  server.registerTool('career_os_latest_report', {
    title: 'Read Latest Production Report',
    description: 'Use this when you need the newest CareerOS production report or execution log. Read-only.',
    inputSchema: z.object({ path: z.string().optional() }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ path: requested }) => {
    if (requested) return text({ path: requested, content: safeRead(path.join(ROOT, requested)) });
    const candidates = recentFiles(ROOT, 250).filter((file) => /production-report|worker-run-once|supervisor|\.log$/i.test(file.path));
    if (!candidates.length) return text({ found: false });
    return text({ ...candidates[0], content: safeRead(path.join(ROOT, candidates[0].path)) });
  });

  server.registerTool('career_os_list_evidence', {
    title: 'List CareerOS Evidence',
    description: 'Use this when you need recent logs, Playwright traces, screenshots, reports, or artifacts. Read-only.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(30) }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ limit }) => text(recentFiles(ROOT, 1000).filter((file) => /screenshot|trace|report|\.log$|\.zip$/i.test(file.path)).slice(0, limit)));

  server.registerTool('career_os_sync_main', {
    title: 'Sync CareerOS Main',
    description: 'Use this when authorized to fast-forward the local runtime to origin/main. Refuses to overwrite tracked local changes.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async () => text({ status: 'started', ...runCommand('git', ['pull', '--ff-only', 'origin', 'main'], { timeoutMs: 180_000 }) }));

  return server;
}

if (!TOKEN || TOKEN.length < 32) {
  console.error('CAREER_OS_MCP_TOKEN must be set to a random value of at least 32 characters.');
  process.exit(2);
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  if (req.path === '/healthz') return next();
  const provided = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
  const a = Buffer.from(provided);
  const b = Buffer.from(TOKEN);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'unauthorized' });
  next();
});

app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'career-os-control-plane' }));

const transports = new Map();
app.post('/mcp', async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'];
    let transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id) => transports.set(id, transport),
      });
      transport.onclose = () => {
        if (transport.sessionId) transports.delete(transport.sessionId);
      };
      await makeServer().connect(transport);
    }
    if (!transport) return res.status(400).json({ error: 'missing or invalid MCP session' });
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ error: 'mcp request failed' });
  }
});
app.get('/mcp', async (req, res) => {
  const transport = transports.get(req.headers['mcp-session-id']);
  if (!transport) return res.status(400).send('invalid session');
  await transport.handleRequest(req, res);
});
app.delete('/mcp', async (req, res) => {
  const transport = transports.get(req.headers['mcp-session-id']);
  if (!transport) return res.status(400).send('invalid session');
  await transport.handleRequest(req, res);
});

http.createServer(app).listen(PORT, HOST, () => {
  console.log(`CareerOS MCP listening on http://${HOST}:${PORT}/mcp`);
});
