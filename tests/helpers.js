// Môi trường kiểm thử: máy chủ Worker thật chạy trên SQLite trong bộ nhớ (thay cho D1) và
// "trình duyệt" giả lập nạp các file js của app bằng vm. Không cần cài thư viện hay chạy wrangler.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { pbkdf2Sync, randomBytes, createHash } from 'node:crypto';
import worker from '../worker/index.js';

const ROOT = path.join(import.meta.dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'db/schema.sql'), 'utf8');
const ORIGIN = 'https://farm.test';

// Giả lập D1 bằng node:sqlite (cùng SQL của SQLite)
function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  const isRead = (sql) => /^\s*select/i.test(sql);
  const stmt = (sql) => ({
    params: [],
    bind(...p) { this.params = p; return this; },
    _exec() {
      const s = db.prepare(sql);
      if (isRead(sql)) return { results: s.all(...this.params).map((r) => ({ ...r })), meta: { changes: 0 } };
      return { results: [], meta: { changes: Number(s.run(...this.params).changes) } };
    },
    async first() { const r = db.prepare(sql).get(...this.params); return r ? { ...r } : null; },
    async all() { return this._exec(); },
    async run() { return this._exec(); }
  });
  return {
    prepare: stmt,
    async batch(list) {
      db.exec('BEGIN');
      try {
        const out = list.map((s) => s._exec());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    _raw: db
  };
}

const deriveKey = (username, password) => pbkdf2Sync(password, 'duifarm|' + username, 150000, 32, 'sha256').toString('base64');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function makeServer() {
  const env = { DB: makeD1() };
  const jar = { cookie: '' };

  async function call(method, urlPath, body, { cookie, headers = {}, csrf = true } = {}) {
    const h = { ...headers };
    if (body !== undefined) h['content-type'] = 'application/json';
    if (csrf && method !== 'GET') h['x-requested-with'] = 'duifarm';
    const ck = cookie === undefined ? jar.cookie : cookie;
    if (ck) h.cookie = ck;
    const res = await worker.fetch(new Request(ORIGIN + urlPath, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
    const sc = res.headers.get('set-cookie');
    if (sc && cookie === undefined) {
      const first = sc.split(';')[0];
      jar.cookie = first.endsWith('=') ? '' : first;
    }
    let data = null;
    try { data = await res.clone().json(); } catch (e) { /* không có thân JSON */ }
    return { status: res.status, data, headers: res.headers };
  }

  // Tạo tài khoản trực tiếp trong DB (giống file seed)
  function seedUser(username, role, password, { mustChange = 0, active = 1 } = {}) {
    const salt = randomBytes(16).toString('hex');
    env.DB._raw.prepare('INSERT INTO users (username, display_name, role, active, must_change, salt, hash, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(username, username.toUpperCase(), role, active, mustChange, salt, sha256(`${salt}:${deriveKey(username, password)}`), new Date().toISOString());
  }

  const login = (username, password, opts) => call('POST', '/api/login', { username, key: deriveKey(username, password) }, opts);

  return { env, call, seedUser, login, deriveKey, jar };
}

// "Trình duyệt" giả: nạp các file js vào một ngữ cảnh riêng, fetch đi thẳng vào Worker kèm cookie riêng
export function load(files, server, preset = {}) {
  const storage = new Map(Object.entries(preset));
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => { storage.set(k, String(v)); },
    removeItem: (k) => { storage.delete(k); },
    _map: storage
  };
  const jar = { cookie: '' };
  const state = { offline: false };
  const win = {
    localStorage,
    crypto: globalThis.crypto,
    dispatchEvent: () => true,
    addEventListener: () => {},
    showToast: (m, t) => { win._toasts.push({ m, t }); },
    _toasts: [],
    farmServer: server
  };
  const fetchImpl = async (p, init = {}) => {
    if (state.offline) throw new TypeError('Failed to fetch');
    const headers = { ...(init.headers || {}) };
    if (jar.cookie) headers.cookie = jar.cookie;
    const res = await worker.fetch(new Request(ORIGIN + p, { method: init.method || 'GET', headers, body: init.body }), server.env);
    const sc = res.headers.get('set-cookie');
    if (sc) {
      const first = sc.split(';')[0];
      jar.cookie = first.endsWith('=') ? '' : first;
    }
    return res;
  };
  const ctx = {
    window: win,
    localStorage,
    fetch: fetchImpl,
    navigator: { onLine: true },
    document: { getElementById: () => null, querySelector: () => null, hidden: false, addEventListener: () => {} },
    location: { reload: () => { win._reloaded = true; } },
    crypto: globalThis.crypto,
    TextEncoder, btoa, atob, console, Date, Math, JSON,
    setInterval: () => 0,
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; },
    clearTimeout,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    removeVietnameseTones: (s) => s
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  files.forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  });
  ctx.state = state;
  return ctx;
}

export const CLIENT = { auth: 'public/js/auth.js', db: 'public/js/db.js', sync: 'public/js/sync.js' };
