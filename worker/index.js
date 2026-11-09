/**
 * Máy chủ API của Dúi Farm (Cloudflare Worker + D1).
 * - Đăng nhập nội bộ, KHÔNG có đăng ký. Tài khoản do Admin tạo.
 * - Trình duyệt tự băm mật khẩu (PBKDF2) thành "khóa" 44 ký tự rồi mới gửi lên. Máy chủ chỉ lưu
 *   SHA-256(muối + khóa) nên không bao giờ thấy mật khẩu gốc và không tốn CPU băm nặng.
 * - Phiên đăng nhập là cookie HttpOnly; chỉ lưu băm của token trong D1.
 * - Dữ liệu trang trại lưu theo từng mục (animals, pens, ...) trong bảng farm_data, có số phiên bản
 *   để hai người sửa cùng lúc không ghi đè thầm lặng lên nhau.
 */
import { ROLES, USERNAME_RE, KEY_RE, HttpError, json, sha256Hex, randomHex, safeEqual, getCookie, canonical } from './util.js';

const COOKIE = 'duifarm_session';
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_BODY = 4_000_000;
const MAX_VALUE = 1_900_000; // D1 giới hạn khoảng 2MB mỗi dòng
const MAP_KEYS = ['farm_map', 'farm_map_revisions', 'pens', 'zones'];
const KEY_NAME_RE = /^[a-z][a-z0-9_]{0,39}$/;
const BAD_LOGIN = 'Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.';

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status, e.headers);
      console.error(e);
      return json({ error: 'Lỗi máy chủ. Hãy thử lại sau.' }, 500);
    }
  }
};

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Dữ liệu gửi lên quá lớn.');
  try {
    const body = JSON.parse(text || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('x');
    return body;
  } catch (e) {
    throw new HttpError(400, 'Yêu cầu không hợp lệ.');
  }
}

function sessionCookie(url, token, maxAgeSec) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${url.protocol === 'https:' ? '; Secure' : ''}`;
}

const publicUser = (u) => ({ username: u.username, display_name: u.display_name, role: u.role, must_change: !!u.must_change });

async function currentUser(request, env) {
  const token = getCookie(request, COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const th = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT u.username, u.display_name, u.role, u.active, u.must_change
       FROM sessions s JOIN users u ON u.username = s.username
      WHERE s.token_hash = ? AND s.expires_at > ?`
  ).bind(th, Date.now()).first();
  if (!row || !row.active) return null;
  return { ...row, token_hash: th };
}

async function requireUser(request, env, { allowMustChange = false, admin = false } = {}) {
  const me = await currentUser(request, env);
  if (!me) throw new HttpError(401, 'Bạn chưa đăng nhập hoặc phiên đã hết hạn.', 'unauthenticated');
  if (me.must_change && !allowMustChange) throw new HttpError(403, 'Hãy đặt mật khẩu mới trước khi tiếp tục.', 'must_change');
  if (admin && me.role !== 'ADMIN') throw new HttpError(403, 'Quyền bị từ chối: chỉ Admin quản lý tài khoản.');
  return me;
}

function checkKey(key, label = 'Mật khẩu') {
  if (typeof key !== 'string' || !KEY_RE.test(key)) throw new HttpError(400, `${label} không hợp lệ.`);
}

const passwordHash = (salt, key) => sha256Hex(`${salt}:${key}`);

async function route(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.replace(/\/+$/, '');

  if (!path.startsWith('/api/')) throw new HttpError(404, 'Không tìm thấy.');

  if (method !== 'GET' && method !== 'HEAD') {
    // Chặn giả mạo yêu cầu từ trang web khác (CSRF)
    if (request.headers.get('x-requested-with') !== 'duifarm') throw new HttpError(403, 'Yêu cầu không hợp lệ.');
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) throw new HttpError(403, 'Yêu cầu không hợp lệ.');
  }

  if (path === '/api/login' && method === 'POST') return login(request, env, url);
  if (path === '/api/logout' && method === 'POST') return logout(request, env, url);
  if (path === '/api/me' && method === 'GET') return me(request, env);
  if (path === '/api/password' && method === 'POST') return changePassword(request, env);
  if (path === '/api/version' && method === 'GET') return getVersion(request, env);
  if (path === '/api/data' && method === 'GET') return getData(request, env);
  if (path === '/api/data' && method === 'PUT') return putData(request, env);
  if (path === '/api/users' && method === 'GET') return listUsers(request, env);
  if (path === '/api/users' && method === 'POST') return addUser(request, env);
  const m = path.match(/^\/api\/users\/([a-z0-9._-]{3,32})$/);
  if (m && method === 'PATCH') return patchUser(request, env, m[1]);
  if (m && method === 'DELETE') return deleteUser(request, env, m[1]);

  throw new HttpError(404, 'Không tìm thấy.');
}

// ---------- Phiên đăng nhập ----------
async function login(request, env, url) {
  const body = await readBody(request);
  const username = String(body.username || '').trim().toLowerCase();
  const key = body.key;
  if (!USERNAME_RE.test(username) || typeof key !== 'string' || !KEY_RE.test(key)) throw new HttpError(401, BAD_LOGIN);

  const now = Date.now();
  const att = await env.DB.prepare('SELECT fails, locked_until FROM login_attempts WHERE username = ?').bind(username).first();
  if (att && att.locked_until > now) {
    const wait = Math.ceil((att.locked_until - now) / 1000);
    throw new HttpError(429, `Đăng nhập sai nhiều lần. Thử lại sau ${wait} giây.`, 'locked', { 'retry-after': String(wait) });
  }

  const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  // Luôn tính băm để thời gian phản hồi không lộ tài khoản có tồn tại hay không
  const computed = await passwordHash(user ? user.salt : 'x'.repeat(32), key);
  const ok = !!user && user.active === 1 && safeEqual(computed, user.hash);

  if (!ok) {
    const fails = ((att && att.fails) || 0) + 1;
    const lockedUntil = fails >= 5 ? now + Math.min(15 * 60 * 1000, 30000 * Math.pow(2, fails - 5)) : 0;
    await env.DB.prepare(
      'INSERT INTO login_attempts (username, fails, locked_until) VALUES (?, ?, ?) ON CONFLICT(username) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until'
    ).bind(username, fails, lockedUntil).run();
    throw new HttpError(401, BAD_LOGIN);
  }

  const token = randomHex(32);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_attempts WHERE username = ?').bind(username),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('INSERT INTO sessions (token_hash, username, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256Hex(token), username, now, now + SESSION_MS)
  ]);
  return json({ user: publicUser(user) }, 200, { 'set-cookie': sessionCookie(url, token, SESSION_MS / 1000) });
}

async function logout(request, env, url) {
  const me = await currentUser(request, env);
  if (me) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(me.token_hash).run();
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(url, '', 0) });
}

async function me(request, env) {
  const u = await requireUser(request, env, { allowMustChange: true });
  return json({ user: publicUser(u) });
}

async function changePassword(request, env) {
  const u = await requireUser(request, env, { allowMustChange: true });
  const body = await readBody(request);
  checkKey(body.old_key, 'Mật khẩu hiện tại');
  checkKey(body.new_key, 'Mật khẩu mới');
  const row = await env.DB.prepare('SELECT salt, hash FROM users WHERE username = ?').bind(u.username).first();
  if (!safeEqual(await passwordHash(row.salt, body.old_key), row.hash)) throw new HttpError(400, 'Mật khẩu hiện tại không đúng.');
  if (body.old_key === body.new_key) throw new HttpError(400, 'Mật khẩu mới phải khác mật khẩu hiện tại.');
  const salt = randomHex(16);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET salt = ?, hash = ?, must_change = 0, updated_at = ? WHERE username = ?').bind(salt, await passwordHash(salt, body.new_key), new Date().toISOString(), u.username),
    env.DB.prepare('DELETE FROM sessions WHERE username = ? AND token_hash != ?').bind(u.username, u.token_hash)
  ]);
  return json({ ok: true });
}

// ---------- Dữ liệu trang trại ----------
async function getVersion(request, env) {
  await requireUser(request, env);
  const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'data_version'").first();
  return json({ version: row ? row.value : 0 });
}

async function getData(request, env) {
  await requireUser(request, env);
  const [meta, rows] = await env.DB.batch([
    env.DB.prepare("SELECT value FROM meta WHERE key = 'data_version'"),
    env.DB.prepare('SELECT key, value FROM farm_data')
  ]);
  const version = meta.results.length ? meta.results[0].value : 0;
  if (!rows.results.length) return json({ version, data: null });
  const data = {};
  for (const r of rows.results) data[r.key] = JSON.parse(r.value);
  return json({ version, data });
}

async function putData(request, env) {
  const u = await requireUser(request, env);
  if (u.role === 'VIEWER') throw new HttpError(403, 'Tài khoản Viewer chỉ có quyền xem dữ liệu.');
  const body = await readBody(request);
  const base = body.base_version;
  const data = body.data;
  if (!Number.isInteger(base) || base < 0) throw new HttpError(400, 'Thiếu số phiên bản dữ liệu.');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Dữ liệu không đúng cấu trúc.');
  const keys = Object.keys(data);
  if (keys.length === 0 || keys.length > 60) throw new HttpError(400, 'Dữ liệu không đúng cấu trúc.');

  const next = new Map();
  for (const k of keys) {
    if (!KEY_NAME_RE.test(k)) throw new HttpError(400, `Tên mục dữ liệu không hợp lệ: ${k}`);
    const s = JSON.stringify(data[k]);
    if (s === undefined) continue;
    if (s.length > MAX_VALUE) throw new HttpError(413, `Mục dữ liệu "${k}" quá lớn để lưu. Hãy sao lưu và dọn bớt.`);
    next.set(k, s);
  }

  const existingRows = (await env.DB.prepare('SELECT key, value FROM farm_data').all()).results;
  const existing = new Map(existingRows.map((r) => [r.key, r.value]));

  if (existing.size === 0 && u.role !== 'ADMIN') throw new HttpError(403, 'Chỉ Admin được khởi tạo dữ liệu lần đầu.');

  const changed = [...next.entries()].filter(([k, s]) => existing.get(k) !== s);
  const removed = [...existing.keys()].filter((k) => !next.has(k));

  if (u.role !== 'ADMIN' && u.role !== 'MANAGER') {
    for (const k of MAP_KEYS) {
      const before = existing.has(k) ? canonical(JSON.parse(existing.get(k))) : null;
      const after = next.has(k) ? canonical(JSON.parse(next.get(k))) : null;
      if (before !== after) throw new HttpError(403, 'Quyền bị từ chối: chỉ Admin và Manager mới được chỉnh sửa sơ đồ và chuồng.');
    }
  }

  const current = await env.DB.prepare("SELECT value FROM meta WHERE key = 'data_version'").first();
  const currentVersion = current ? current.value : 0;

  if (changed.length === 0 && removed.length === 0) {
    if (currentVersion !== base) throw new HttpError(409, 'Dữ liệu đã được người khác cập nhật.', 'conflict');
    return json({ version: currentVersion, unchanged: true });
  }

  const guard = "(SELECT value FROM meta WHERE key = 'data_version') = ?";
  const now = new Date().toISOString();
  const stmts = [];
  for (const [k, s] of changed) {
    stmts.push(env.DB.prepare(
      `INSERT INTO farm_data (key, value, updated_at, updated_by) SELECT ?, ?, ?, ? WHERE ${guard}
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).bind(k, s, now, u.username, base));
  }
  for (const k of removed) stmts.push(env.DB.prepare(`DELETE FROM farm_data WHERE key = ? AND ${guard}`).bind(k, base));
  stmts.push(env.DB.prepare("UPDATE meta SET value = value + 1 WHERE key = 'data_version' AND value = ?").bind(base));

  const results = await env.DB.batch(stmts);
  const bumped = results[results.length - 1].meta.changes === 1;
  if (!bumped) throw new HttpError(409, 'Dữ liệu đã được người khác cập nhật.', 'conflict');
  return json({ version: base + 1 });
}

// ---------- Quản lý tài khoản (chỉ Admin) ----------
const publicRow = (u) => ({ username: u.username, display_name: u.display_name, role: u.role, active: u.active === 1, must_change: u.must_change === 1, created_at: u.created_at });

async function listUsers(request, env) {
  await requireUser(request, env, { admin: true });
  const rows = (await env.DB.prepare('SELECT username, display_name, role, active, must_change, created_at FROM users ORDER BY created_at, username').all()).results;
  return json({ users: rows.map(publicRow) });
}

async function otherActiveAdmins(env, exceptUsername) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN' AND active = 1 AND username != ?").bind(exceptUsername).first();
  return r.n;
}

function cleanName(v, fallback) {
  const s = String(v == null ? '' : v).trim().slice(0, 60);
  return s || fallback;
}

async function addUser(request, env) {
  await requireUser(request, env, { admin: true });
  const b = await readBody(request);
  const username = String(b.username || '').trim().toLowerCase();
  if (!USERNAME_RE.test(username)) throw new HttpError(400, 'Tên đăng nhập 3-32 ký tự, chỉ gồm chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.');
  if (!ROLES.includes(b.role)) throw new HttpError(400, 'Vai trò không hợp lệ.');
  checkKey(b.key);
  const exists = await env.DB.prepare('SELECT 1 AS x FROM users WHERE username = ?').bind(username).first();
  if (exists) throw new HttpError(409, 'Tên đăng nhập đã tồn tại.');
  const salt = randomHex(16);
  await env.DB.prepare(
    'INSERT INTO users (username, display_name, role, active, must_change, salt, hash, created_at) VALUES (?, ?, ?, 1, 1, ?, ?, ?)'
  ).bind(username, cleanName(b.display_name, username), b.role, salt, await passwordHash(salt, b.key), new Date().toISOString()).run();
  return json({ ok: true }, 201);
}

async function patchUser(request, env, username) {
  const me = await requireUser(request, env, { admin: true });
  const b = await readBody(request);
  const target = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  if (!target) throw new HttpError(404, 'Không tìm thấy tài khoản.');
  const isSelf = me.username === username;
  const stmts = [];
  const now = new Date().toISOString();
  let dropSessions = false;
  let losesAdmin = false;

  if (b.role !== undefined) {
    if (!ROLES.includes(b.role)) throw new HttpError(400, 'Vai trò không hợp lệ.');
    if (target.role === 'ADMIN' && target.active === 1 && b.role !== 'ADMIN') losesAdmin = true;
    stmts.push(env.DB.prepare('UPDATE users SET role = ?, updated_at = ? WHERE username = ?').bind(b.role, now, username));
  }
  if (b.active !== undefined) {
    if (typeof b.active !== 'boolean') throw new HttpError(400, 'Yêu cầu không hợp lệ.');
    if (!b.active && isSelf) throw new HttpError(400, 'Không thể tự khóa tài khoản đang đăng nhập.');
    if (!b.active && target.role === 'ADMIN' && target.active === 1) losesAdmin = true;
    if (!b.active) dropSessions = true;
    stmts.push(env.DB.prepare('UPDATE users SET active = ?, updated_at = ? WHERE username = ?').bind(b.active ? 1 : 0, now, username));
  }
  if (b.display_name !== undefined) {
    stmts.push(env.DB.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE username = ?').bind(cleanName(b.display_name, username), now, username));
  }
  if (b.key !== undefined) {
    if (isSelf) throw new HttpError(400, 'Hãy dùng "Đổi mật khẩu" cho tài khoản của chính bạn.');
    checkKey(b.key);
    const salt = randomHex(16);
    stmts.push(env.DB.prepare('UPDATE users SET salt = ?, hash = ?, must_change = 1, updated_at = ? WHERE username = ?').bind(salt, await passwordHash(salt, b.key), now, username));
    dropSessions = true;
  }
  if (!stmts.length) throw new HttpError(400, 'Không có thay đổi nào.');
  if (losesAdmin && (await otherActiveAdmins(env, username)) === 0) throw new HttpError(400, 'Phải còn ít nhất một Admin đang hoạt động.');
  if (dropSessions) stmts.push(env.DB.prepare('DELETE FROM sessions WHERE username = ?').bind(username));
  await env.DB.batch(stmts);
  return json({ ok: true });
}

async function deleteUser(request, env, username) {
  const me = await requireUser(request, env, { admin: true });
  if (me.username === username) throw new HttpError(400, 'Không thể tự xóa tài khoản đang đăng nhập.');
  const target = await env.DB.prepare('SELECT role, active FROM users WHERE username = ?').bind(username).first();
  if (!target) throw new HttpError(404, 'Không tìm thấy tài khoản.');
  if (target.role === 'ADMIN' && target.active === 1 && (await otherActiveAdmins(env, username)) === 0) {
    throw new HttpError(400, 'Phải còn ít nhất một Admin đang hoạt động.');
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE username = ?').bind(username),
    env.DB.prepare('DELETE FROM users WHERE username = ?').bind(username)
  ]);
  return json({ ok: true });
}
