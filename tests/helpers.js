// Nạp js/db.js và js/auth.js vào một môi trường giả lập trình duyệt (không cần cài thư viện nào).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m
  };
}

function load(files, { storage } = {}) {
  const win = {
    localStorage: storage || makeStorage(),
    crypto: globalThis.crypto,
    dispatchEvent: () => true,
    addEventListener: () => {}
  };
  const ctx = {
    window: win,
    localStorage: win.localStorage,
    navigator: { onLine: true },
    crypto: globalThis.crypto,
    TextEncoder, btoa, atob, console, Date, Math, JSON,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    removeVietnameseTones: (s) => s
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  files.forEach((f) => {
    const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  });
  return ctx;
}

// Đăng nhập giả: ghi thẳng phiên cho một tài khoản đã có
async function loginAs(ctx, username, role) {
  const A = ctx.window.farmAuth;
  if (!A.hasUsers()) await A.createFirstAdmin({ username: 'admin', display_name: 'Admin', password: 'matkhau-test-1' });
  if (username !== 'admin') {
    await A.addUser({ username, display_name: username, role, password: 'matkhau-test-2' });
    await A.login(username, 'matkhau-test-2');
  }
}

module.exports = { load, loginAs, makeStorage };
