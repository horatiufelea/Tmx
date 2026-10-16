// TMX Tolmács — live EN/RO → HU voice translation for trainings, powered by Palabra.
// The server keeps the Palabra API key secret, creates one translation session per
// training, gives the publisher token to the trainer (PIN-protected) and a unique
// subscriber token to each listener.

import express from 'express';
import QRCode from 'qrcode';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- config (.env, no extra dependency) ------------------------------------
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.PALABRA_API_KEY || '';
const API_BASE = process.env.PALABRA_API_BASE || 'https://api.palabra.ai';
const TRAINER_PIN = process.env.TRAINER_PIN || '1234';
const MAX_LISTENERS = Number(process.env.MAX_LISTENERS || 100);
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

if (!API_KEY) {
  console.error('\n  Lipsește PALABRA_API_KEY în fișierul .env\n');
  process.exit(1);
}

// --- session state -----------------------------------------------------------
/** @type {null | {id:string, webrtcUrl:string, publisher:string, pool:string[], assigned:Map<string,{token:string,last:number}>, sourceLang:string, startedAt:number}} */
let session = null;

async function palabra(method, urlPath, body) {
  const res = await fetch(API_BASE + urlPath, {
    method,
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { ok: false, raw: text }; }
  if (!res.ok || json.ok === false) {
    const detail = json.errors?.map(e => e.detail || e.title).join('; ') || json.raw || res.statusText;
    throw new Error(`Palabra ${res.status}: ${detail}`);
  }
  return json;
}

async function createSession(subscriberCount) {
  const json = await palabra('POST', '/session-storage/session', {
    data: { publisher_count: 1, subscriber_count: subscriberCount, publisher_can_subscribe: true },
  });
  const d = json.data;
  return {
    id: d.id,
    webrtcUrl: d.webrtc_url,
    publisher: d.publisher,
    pool: [...(d.subscriber || [])],
    assigned: new Map(),
    sourceLang: 'en',
    startedAt: Date.now(),
  };
}

async function deleteSession() {
  if (!session) return;
  const id = session.id;
  session = null;
  try { await palabra('DELETE', `/session-storage/sessions/${id}`); }
  catch (e) { console.warn('Nu am putut închide sesiunea Palabra:', e.message); }
}

function requirePin(req, res, next) {
  if (req.get('x-trainer-pin') === TRAINER_PIN) return next();
  res.status(401).json({ error: 'PIN greșit' });
}

// --- app --------------------------------------------------------------------
const app = express();
app.use(express.json());
// Static files: `public/` in the full repo; in the flat upload package the files sit next to server.js,
// so only the page assets are exposed there (never server.js, package files or .env).
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, { extensions: ['html'] }));
} else {
  const allowed = /^\/[\w.-]+\.(html|css|js)$/;
  const blocked = new Set(['/server.js', '/build.mjs']);
  app.use((req, res, next) => {
    const p = req.path === '/trainer' || req.path === '/hallgato' || req.path === '/test' ? req.path + '.html' : req.path;
    if (!allowed.test(p) || blocked.has(p)) return next();
    res.sendFile(path.join(__dirname, p), (err) => err && next());
  });
}

app.get('/', (_req, res) => res.redirect('/hallgato'));

// Trainer: check PIN
app.post('/api/trainer/login', requirePin, (_req, res) => res.json({ ok: true, active: !!session }));

// Trainer: start (or resume) the training session
app.post('/api/trainer/start', requirePin, async (req, res) => {
  try {
    if (!session) {
      // The plan may cap subscribers per session — step down until Palabra accepts.
      const sizes = [...new Set([MAX_LISTENERS, 50, 30, 20, 10].filter(n => n <= MAX_LISTENERS))];
      let lastErr;
      for (const n of sizes) {
        try { session = await createSession(n); break; }
        catch (e) { lastErr = e; console.warn(`Sesiune cu ${n} ascultători refuzată: ${e.message}`); }
      }
      if (!session) throw lastErr;
      console.log(`Sesiune pornită: ${session.id} (${session.pool.length} locuri pentru ascultători)`);
    }
    if (req.body?.sourceLang) session.sourceLang = req.body.sourceLang;
    res.json({ streamUrl: session.webrtcUrl, accessToken: session.publisher, capacity: session.pool.length + session.assigned.size });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: e.message });
  }
});

app.post('/api/trainer/language', requirePin, (req, res) => {
  if (session && ['en', 'ro'].includes(req.body?.sourceLang)) session.sourceLang = req.body.sourceLang;
  res.json({ ok: true });
});

app.post('/api/trainer/stop', requirePin, async (_req, res) => {
  await deleteSession();
  res.json({ ok: true });
});

app.get('/api/trainer/status', requirePin, (_req, res) => {
  if (!session) return res.json({ active: false });
  const now = Date.now();
  const online = [...session.assigned.values()].filter(a => now - a.last < 30_000).length;
  res.json({ active: true, listeners: online, capacity: session.pool.length + session.assigned.size, since: session.startedAt });
});

app.get('/api/trainer/qr', requirePin, async (req, res) => {
  const url = listenerUrl(req);
  res.json({ url, svg: await QRCode.toString(url, { type: 'svg', margin: 1, width: 320 }) });
});

// Listener: get a subscriber token (same device keeps the same token on reconnect)
app.post('/api/listen', (req, res) => {
  const clientId = String(req.body?.clientId || '').slice(0, 64);
  if (!session) return res.json({ active: false });
  if (!clientId) return res.status(400).json({ error: 'clientId lipsă' });

  let entry = session.assigned.get(clientId);
  if (!entry) {
    let token = session.pool.shift();
    if (!token) {
      // Pool exhausted: recycle the token of a listener silent for > 2 minutes.
      const stale = [...session.assigned.entries()].find(([, a]) => Date.now() - a.last > 120_000);
      if (stale) { session.assigned.delete(stale[0]); token = stale[1].token; }
    }
    if (!token) return res.json({ active: true, full: true });
    entry = { token, last: Date.now() };
    session.assigned.set(clientId, entry);
  }
  entry.last = Date.now();
  res.json({ active: true, streamUrl: session.webrtcUrl, accessToken: entry.token, sessionId: session.id });
});

// Listener heartbeat (counts who is online, tells them if the session ended)
app.post('/api/heartbeat', (req, res) => {
  const clientId = String(req.body?.clientId || '');
  const entry = session?.assigned.get(clientId);
  if (entry) entry.last = Date.now();
  res.json({ active: !!session, sessionId: session?.id || null });
});

function lanAddress() {
  for (const ifs of Object.values(os.networkInterfaces())) {
    for (const i of ifs || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return 'localhost';
}

function listenerUrl(req) {
  if (PUBLIC_URL) return `${PUBLIC_URL}/hallgato`;
  let host = req?.get('host') || `${lanAddress()}:${PORT}`;
  // Trainer opened the page on localhost — phones need the laptop's network address instead.
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host)) host = `${lanAddress()}:${PORT}`;
  const proto = req?.get('x-forwarded-proto') || req?.protocol || 'http';
  return `${proto}://${host}/hallgato`;
}

process.on('SIGINT', async () => { await deleteSession(); process.exit(0); });
process.on('SIGTERM', async () => { await deleteSession(); process.exit(0); });

app.listen(PORT, () => {
  const lan = lanAddress();
  console.log(`\n  TMX Tolmács pornit\n`);
  console.log(`  Trainer:      http://localhost:${PORT}/trainer   (PIN din .env)`);
  console.log(`  Participanți: ${PUBLIC_URL ? PUBLIC_URL : `http://${lan}:${PORT}`}/hallgato\n`);
});

export { app };
