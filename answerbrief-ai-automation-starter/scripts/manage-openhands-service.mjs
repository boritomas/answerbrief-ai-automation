#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const STATE_DIR = path.join(ROOT, '.career-os-control');
const PID_FILE = path.join(STATE_DIR, 'openhands.pid');
const LOG_FILE = path.join(STATE_DIR, 'openhands.log');
const PORT = Number(process.env.CAREER_OS_OPENHANDS_PORT || 3000);
const HOST = process.env.CAREER_OS_OPENHANDS_HOST || '127.0.0.1';

fs.mkdirSync(STATE_DIR, { recursive: true });

function commandExists(name) {
  return spawnSync('sh', ['-lc', `command -v ${name}`], { encoding: 'utf8' }).status === 0;
}

function readPid() {
  if (!fs.existsSync(PID_FILE)) return null;
  const pid = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function processRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function probe(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port: PORT, path: '/', timeout: timeoutMs }, (res) => {
      res.resume();
      resolve({ online: true, statusCode: res.statusCode || 0 });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ online: false, reason: 'timeout' });
    });
    req.on('error', (error) => resolve({ online: false, reason: error.message }));
  });
}

async function status() {
  const pid = readPid();
  const httpStatus = await probe();
  return {
    installed: commandExists('openhands'),
    pid,
    managedProcessRunning: processRunning(pid),
    url: `http://${HOST}:${PORT}`,
    ...httpStatus,
    log: path.relative(ROOT, LOG_FILE),
  };
}

async function start() {
  const current = await status();
  if (current.online) return { ...current, action: 'already_running' };
  if (!current.installed) throw new Error('OpenHands CLI is not installed.');

  const out = fs.openSync(LOG_FILE, 'a', 0o600);
  const child = spawn('openhands', ['serve', '--mount-cwd'], {
    cwd: ROOT,
    env: { ...process.env, OPENHANDS_SUPPRESS_BANNER: '1' },
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid), { mode: 0o600 });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const currentStatus = await status();
    if (currentStatus.online) return { ...currentStatus, action: 'started' };
    if (!processRunning(child.pid)) break;
  }
  throw new Error(`OpenHands did not become available. Check ${LOG_FILE}`);
}

async function stop() {
  const pid = readPid();
  if (pid && processRunning(pid)) {
    process.kill(pid, 'SIGTERM');
    for (let attempt = 0; attempt < 10 && processRunning(pid); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (fs.existsSync(PID_FILE)) fs.rmSync(PID_FILE, { force: true });
  return { ...(await status()), action: 'stopped_managed_process' };
}

const action = (process.argv[2] || 'status').toLowerCase();
try {
  let result;
  if (action === 'status') result = await status();
  else if (action === 'start') result = await start();
  else if (action === 'stop') result = await stop();
  else if (action === 'restart') {
    await stop();
    result = await start();
    result.action = 'restarted';
  } else {
    throw new Error(`Unknown action: ${action}`);
  }
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, action, message: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
}
