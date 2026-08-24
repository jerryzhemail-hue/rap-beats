import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = process.env.MONITOR_CONFIG || path.join(__dirname, 'config.json');
const STATE_PATH = path.join(__dirname, 'state.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const ERROR_RE = /\b(error|fatal|exception|throw|unhandled|rejection|crash|panic|failed|denied|refused|invalid|timeout|econnrefused|eaddrinuse|eacces|enospc|oom|killed|uncaught)\b|\b(5\d\d)\b/i;

// ── 配置 ────────────────────────────────────────────────────────────────
function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  const cfg = JSON.parse(raw);
  cfg.fastIntervalSec = cfg.fastIntervalSec || 15;
  cfg.slowIntervalSec = cfg.slowIntervalSec || 60;
  return cfg;
}
const config = loadConfig();

// ── 状态 ────────────────────────────────────────────────────────────────
function defaultState() {
  return {
    startedAt: Date.now(),
    targets: {},
    production: { containers: [], sshError: null, lastCheckAt: 0 },
    incidents: [],
    logs: {},
  };
}
let state = defaultState();
try {
  const saved = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  // 只保留累计计数与事件，时间戳字段由运行期更新
  state = { ...defaultState(), targets: saved.targets || {}, incidents: saved.incidents || [] };
  state.startedAt = Date.now(); // 本轮启动时间
} catch {
  state = defaultState();
}

function saveState() {
  try {
    const tmp = STATE_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, STATE_PATH);
  } catch (e) {
    console.error('[monitor] save state failed:', e.message);
  }
}

function ensureTarget(t) {
  if (!state.targets[t.id]) {
    state.targets[t.id] = {
      id: t.id, name: t.name, group: t.group,
      status: 'unknown', ms: null, error: null,
      lastCheckAt: 0, lastOkAt: 0, downSince: null,
      totalChecks: 0, upChecks: 0, downChecks: 0,
    };
  }
  return state.targets[t.id];
}

function uptimePct(st) {
  const n = st.upChecks + st.downChecks;
  return n === 0 ? null : Math.round((st.upChecks / n) * 1000) / 10;
}

// ── 工具 ────────────────────────────────────────────────────────────────
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: opts.timeoutMs || 15000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err ? (err.code ?? 1) : 0, stdout: stdout || '', stderr: stderr || '', err });
    });
  });
}

async function httpCheck(t) {
  const started = Date.now();
  try {
    const res = await fetch(t.url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(t.timeoutMs || 5000),
    });
    const ms = Date.now() - started;
    let bodyText = '';
    let bodyJson = null;
    try { bodyText = await res.text(); } catch {}
    try { bodyJson = JSON.parse(bodyText); } catch {}
    if (res.status >= 200 && res.status < 300) {
      return { status: 'ok', ms, error: null };
    }
    if (res.status === 503) {
      const svc = bodyJson?.services;
      const bad = svc ? Object.entries(svc).filter(([, v]) => v?.status !== 'ok').map(([k]) => k).join(',') : '';
      return { status: 'degraded', ms, error: bad ? `服务降级: ${bad}` : 'HTTP 503' };
    }
    return { status: 'down', ms, error: `HTTP ${res.status}` };
  } catch (e) {
    const ms = Date.now() - started;
    return { status: 'down', ms, error: e.name === 'TimeoutError' ? '超时' : (e.cause?.code || e.message) };
  }
}

function tcpCheck(t) {
  return new Promise((resolve) => {
    const started = Date.now();
    const sock = net.connect({ host: t.host, port: t.port, timeout: t.timeoutMs || 3000 });
    sock.once('connect', () => {
      const ms = Date.now() - started;
      sock.destroy();
      resolve({ status: 'ok', ms, error: null });
    });
    sock.once('timeout', () => {
      sock.destroy();
      resolve({ status: 'down', ms: Date.now() - started, error: '连接超时' });
    });
    sock.once('error', (e) => {
      resolve({ status: 'down', ms: Date.now() - started, error: e.code || e.message });
    });
  });
}

function sshArgs() {
  const s = config.ssh;
  return ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-o', 'StrictHostKeyChecking=accept-new',
    '-p', String(s.port || 22), `${s.user}@${s.host}`];
}

async function sshRun(remoteCmd) {
  const r = await run('ssh', [...sshArgs(), remoteCmd], { timeoutMs: config.ssh.timeoutMs || 15000 });
  return r;
}

async function checkProduction() {
  if (!config.ssh?.enabled) return;
  const ps = await sshRun(`cd ${config.ssh.deployDir} && docker compose ps --format '{{.Names}}\\t{{.State}}\\t{{.Status}}' 2>&1`);
  if (!ps.ok) {
    state.production.sshError = ps.stderr || ps.stdout || 'SSH 连接失败';
    state.production.containers = [];
    state.production.lastCheckAt = Date.now();
    return;
  }
  const containers = [];
  for (const line of ps.stdout.split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const name = parts[0].trim();
    const st = parts[1].trim().toLowerCase();
    const statusText = (parts[2] || '').trim();
    const healthy = /healthy/.test(statusText);
    const unhealthy = /unhealthy|exited|restarting/.test(statusText);
    let status = 'unknown';
    if (st === 'running') status = unhealthy ? 'degraded' : 'ok';
    else if (st === 'exited') status = 'down';
    else if (st === 'dead' || st === 'paused') status = 'down';
    else status = st;
    containers.push({ name, status, healthy, statusText });
  }
  state.production.containers = containers;
  state.production.sshError = null;
  state.production.lastCheckAt = Date.now();
}

async function collectSshLogs() {
  if (!config.ssh?.enabled) return;
  const tail = config.ssh.logTail || 80;
  const r = await sshRun(`cd ${config.ssh.deployDir} && docker compose logs --tail=${tail} --timestamps 2>&1 | tail -${tail * 3}`);
  if (!r.ok) return;
  const src = 'prod';
  ensureLogSource(src, '生产容器日志');
  const fresh = r.stdout.split('\n').map(s => s.trim()).filter(Boolean);
  appendLogLines(src, fresh);
}

// ── 日志 ────────────────────────────────────────────────────────────────
function ensureLogSource(id, name) {
  if (!state.logs[id]) state.logs[id] = { id, name, seen: new Set(), entries: [] };
  else if (!state.logs[id].seen) state.logs[id].seen = new Set();
  return state.logs[id];
}
// JSON 序列化会丢 Set,持久化前转数组
function setToArray(s) { return s ? Array.from(s).slice(-2000) : []; }
function arrayToSet(a) { return new Set(a || []); }

function appendLogLines(sourceId, lines) {
  const src = ensureLogSource(sourceId, sourceId);
  const seen = src.seen instanceof Set ? src.seen : arrayToSet(src.seen);
  const entries = Array.isArray(src.entries) ? src.entries : [];
  const now = new Date().toISOString();
  for (const line of lines) {
    if (!line || seen.has(line)) continue;
    seen.add(line);
    if (!ERROR_RE.test(line)) continue;
    entries.unshift({ t: now, line: line.slice(0, 600) });
  }
  src.seen = seen;
  src.entries = entries.slice(0, config.errorLogLimit);
  state.logs[sourceId] = src;
}

function collectLocalLogs() {
  for (const lc of config.logs || []) {
    ensureLogSource(lc.id, lc.name);
    let content = '';
    try {
      content = fs.readFileSync(lc.path, 'utf8');
    } catch {
      if (!lc.optional) {
        state.logs[lc.id].missing = true;
        state.logs[lc.id].path = lc.path;
      }
      continue;
    }
    state.logs[lc.id].missing = false;
    const lines = content.split('\n').slice(-400).map(s => s.trim()).filter(Boolean);
    appendLogLines(lc.id, lines);
  }
}

// ── 状态更新 ────────────────────────────────────────────────────────────
function applyResult(t, result) {
  const st = ensureTarget(t);
  const prev = st.status;
  st.lastCheckAt = Date.now();
  st.ms = result.ms ?? null;
  st.error = result.error || null;
  st.status = result.status;
  st.totalChecks += 1;
  if (result.status === 'ok') {
    st.upChecks += 1;
    st.lastOkAt = Date.now();
    if (prev === 'down' || prev === 'degraded' || prev === 'unknown') {
      st.downSince = null;
      addIncident(t, 'recovered', prev, 'ok', result.error || null);
    }
  } else {
    st.downChecks += 1;
    if (st.downSince == null) st.downSince = Date.now();
    if (prev === 'ok' || prev === 'unknown' || prev === 'degraded') {
      addIncident(t, 'down', prev, result.status, result.error || null);
    }
  }
}

function addIncident(t, kind, from, to, message) {
  state.incidents.unshift({
    at: new Date().toISOString(),
    targetId: t.id, targetName: t.name, group: t.group,
    kind, from, to, message,
  });
  state.incidents = state.incidents.slice(0, config.incidentLimit);
}

async function checkTarget(t) {
  let result;
  if (t.type === 'http') result = await httpCheck(t);
  else if (t.type === 'tcp') result = await tcpCheck(t);
  else result = { status: 'down', ms: null, error: '未知类型' };
  applyResult(t, result);
}

// ── 轮询 ────────────────────────────────────────────────────────────────
let lastFast = 0;
let lastSlow = 0;

async function tick() {
  const now = Date.now();
  const doFast = now - lastFast >= config.fastIntervalSec * 1000;
  const doSlow = now - lastSlow >= config.slowIntervalSec * 1000;

  const jobs = [];
  for (const t of config.targets) {
    const intervalMs = (t.slow ? config.slowIntervalSec : config.fastIntervalSec) * 1000;
    const last = (state.targets[t.id] && state.targets[t.id].lastCheckAt) || 0;
    if (now - last >= intervalMs) jobs.push(checkTarget(t));
  }
  await Promise.all(jobs);

  if (doFast) {
    lastFast = now;
    collectLocalLogs();
  }
  if (doSlow) {
    lastSlow = now;
    await checkProduction();
    await collectSshLogs();
  }
  saveState();
}

// ── 序列化（把 Set 处理干净） ────────────────────────────────────────────
function overviewPayload() {
  const targets = config.targets.map(t => {
    const st = state.targets[t.id] || ensureTarget(t);
    return {
      id: t.id, name: t.name, group: t.group, type: t.type,
      status: st.status, ms: st.ms, error: st.error,
      lastCheckAt: st.lastCheckAt, downSince: st.downSince,
      uptimePct: uptimePct(st), totalChecks: st.totalChecks,
    };
  });

  const productionEnabled = !!config.ssh?.enabled;
  const containers = state.production.containers || [];
  const prodAllOk = containers.every(c => c.status === 'ok');
  const production = {
    enabled: productionEnabled,
    sshError: state.production.sshError,
    lastCheckAt: state.production.lastCheckAt,
    // 生产监控关闭时不参与总体判定
    ok: !productionEnabled ? true : (containers.length > 0 && prodAllOk && !state.production.sshError),
    containers,
  };

  const logSources = Object.values(state.logs).map(l => ({
    id: l.id, name: l.name, missing: l.missing || false, path: l.path || null,
    count: (l.entries || []).length,
  }));
  const logEntries = Object.values(state.logs)
    .flatMap(l => (l.entries || []).map(e => ({ source: l.id, sourceName: l.name, t: e.t, line: e.line })))
    .sort((a, b) => (a.t < b.t ? 1 : -1))
    .slice(0, config.errorLogLimit);

  const downTargets = targets.filter(t => t.status === 'down' || t.status === 'degraded');
  return {
    now: new Date().toISOString(),
    monitor: { startedAt: state.startedAt, uptimeSec: Math.round((Date.now() - state.startedAt) / 1000) },
    summary: { allOk: downTargets.length === 0 && production.ok, downCount: downTargets.length },
    targets,
    production,
    incidents: state.incidents.slice(0, 50),
    logSources,
    logEntries,
  };
}

// ── HTTP 服务 ────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  const sendJson = (obj, code = 200) => {
    const body = JSON.stringify(obj);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(body);
  };

  if (p === '/api/overview') return sendJson(overviewPayload());
  if (p === '/api/health') return sendJson({ status: 'ok', now: new Date().toISOString() });
  if (p === '/' || p === '/index.html') {
    try {
      const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('dashboard missing: ' + e.message);
    }
  }
  sendJson({ error: 'not found' }, 404);
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`[monitor] listening on http://127.0.0.1:${config.port}`);
  tick(); // 启动立即跑一轮
});
server.on('error', (e) => { console.error('[monitor] listen error:', e.message); process.exit(1); });

setInterval(tick, 5000);

// 退出前落盘
process.on('SIGTERM', () => { saveState(); process.exit(0); });
process.on('SIGINT', () => { saveState(); process.exit(0); });
