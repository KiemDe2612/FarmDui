/**
 * Đăng nhập nội bộ (js/auth.js)
 * - KHÔNG có đăng ký công khai. Tài khoản đầu tiên (Admin) được thiết lập một lần khi mở app lần đầu,
 *   sau đó chỉ Admin mới thêm / khóa / đặt lại mật khẩu cho người khác.
 * - Mật khẩu được băm bằng PBKDF2-SHA256 (muối ngẫu nhiên) trước khi lưu, không lưu mật khẩu gốc.
 * - Tài khoản lưu ở khóa riêng, KHÔNG nằm trong file sao lưu dữ liệu trang trại.
 *
 * GIỚI HẠN: app chạy hoàn toàn trên trình duyệt (chưa có máy chủ) nên đây là lớp chặn người dùng thông
 * thường, không chống được người am hiểu kỹ thuật mở công cụ nhà phát triển trên chính thiết bị đó.
 * Muốn bảo mật thật sự và dùng chung nhiều máy cần backend xác thực.
 */
(function () {
  const USERS_KEY = 'FARM_AUTH_USERS_V1';
  const SESSION_KEY = 'FARM_AUTH_SESSION_V1';
  const LOCK_KEY = 'FARM_AUTH_LOCK_V1';
  const ITERATIONS = 150000;
  const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
  const ROLES = ['ADMIN', 'MANAGER', 'STAFF', 'VIEWER'];
  const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

  const enc = new TextEncoder();
  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  async function hashPassword(password, saltB64) {
    if (!window.crypto || !crypto.subtle) {
      throw new Error('Trình duyệt không hỗ trợ mã hóa. Hãy mở app qua https:// hoặc localhost.');
    }
    const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
    return { salt: toB64(salt), hash: toB64(bits) };
  }

  function checkPasswordRules(password) {
    if (typeof password !== 'string' || password.length < 8) {
      throw new Error('Mật khẩu cần ít nhất 8 ký tự.');
    }
  }

  function checkUsername(username) {
    if (!USERNAME_RE.test(username)) {
      throw new Error('Tên đăng nhập 3-32 ký tự, chỉ gồm chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.');
    }
  }

  class FarmAuth {
    constructor() {
      this.ROLES = ROLES;
    }

    _users() {
      const list = readJSON(USERS_KEY, []);
      return Array.isArray(list) ? list : [];
    }

    _save(users) {
      if (!writeJSON(USERS_KEY, users)) throw new Error('Không ghi được tài khoản vào bộ nhớ máy.');
    }

    hasUsers() {
      return this._users().length > 0;
    }

    publicUser(u) {
      return { username: u.username, display_name: u.display_name, role: u.role, active: u.active !== false, created_at: u.created_at };
    }

    listUsers() {
      return this._users().map((u) => this.publicUser(u));
    }

    getSessionUser() {
      const s = readJSON(SESSION_KEY, null);
      if (!s || !s.username || !s.expires_at || s.expires_at < Date.now()) return null;
      const u = this._users().find((x) => x.username === s.username);
      if (!u || u.active === false) return null;
      return this.publicUser(u);
    }

    _startSession(username) {
      writeJSON(SESSION_KEY, { username, expires_at: Date.now() + SESSION_MS });
    }

    logout() {
      try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* bỏ qua */ }
    }

    // Chỉ chạy được khi CHƯA có tài khoản nào: thiết lập quản trị viên đầu tiên.
    async createFirstAdmin({ username, display_name, password }) {
      if (this.hasUsers()) throw new Error('Hệ thống đã có tài khoản. Hãy đăng nhập.');
      username = String(username || '').trim().toLowerCase();
      checkUsername(username);
      checkPasswordRules(password);
      const h = await hashPassword(password);
      this._save([{ username, display_name: String(display_name || '').trim() || username, role: 'ADMIN', active: true, created_at: new Date().toISOString(), salt: h.salt, hash: h.hash }]);
      this._startSession(username);
    }

    _lockRemainingMs() {
      const l = readJSON(LOCK_KEY, { fails: 0, until: 0 });
      return Math.max(0, (l.until || 0) - Date.now());
    }

    async login(username, password) {
      const wait = this._lockRemainingMs();
      if (wait > 0) throw new Error(`Đăng nhập sai nhiều lần. Thử lại sau ${Math.ceil(wait / 1000)} giây.`);
      username = String(username || '').trim().toLowerCase();
      const u = this._users().find((x) => x.username === username);
      let ok = false;
      if (u && u.active !== false) {
        const h = await hashPassword(String(password || ''), u.salt);
        ok = h.hash === u.hash;
      } else {
        await hashPassword(String(password || '')); // giữ thời gian xử lý tương đương
      }
      if (!ok) {
        const l = readJSON(LOCK_KEY, { fails: 0, until: 0 });
        l.fails = (l.fails || 0) + 1;
        if (l.fails >= 5) l.until = Date.now() + Math.min(15 * 60 * 1000, 30000 * Math.pow(2, l.fails - 5));
        writeJSON(LOCK_KEY, l);
        throw new Error('Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.');
      }
      writeJSON(LOCK_KEY, { fails: 0, until: 0 });
      this._startSession(username);
      return this.publicUser(u);
    }

    _requireAdmin() {
      const me = this.getSessionUser();
      if (!me || me.role !== 'ADMIN') throw new Error('Quyền bị từ chối: chỉ Admin quản lý tài khoản.');
      return me;
    }

    _activeAdmins(users) {
      return users.filter((u) => u.role === 'ADMIN' && u.active !== false);
    }

    async addUser({ username, display_name, role, password }) {
      this._requireAdmin();
      username = String(username || '').trim().toLowerCase();
      checkUsername(username);
      checkPasswordRules(password);
      if (!ROLES.includes(role)) throw new Error('Vai trò không hợp lệ.');
      const users = this._users();
      if (users.some((u) => u.username === username)) throw new Error('Tên đăng nhập đã tồn tại.');
      const h = await hashPassword(password);
      users.push({ username, display_name: String(display_name || '').trim() || username, role, active: true, created_at: new Date().toISOString(), salt: h.salt, hash: h.hash });
      this._save(users);
    }

    async resetPassword(username, newPassword) {
      this._requireAdmin();
      checkPasswordRules(newPassword);
      const users = this._users();
      const u = users.find((x) => x.username === username);
      if (!u) throw new Error('Không tìm thấy tài khoản.');
      const h = await hashPassword(newPassword);
      u.salt = h.salt;
      u.hash = h.hash;
      this._save(users);
    }

    async changeOwnPassword(oldPassword, newPassword) {
      const me = this.getSessionUser();
      if (!me) throw new Error('Bạn chưa đăng nhập.');
      checkPasswordRules(newPassword);
      const users = this._users();
      const u = users.find((x) => x.username === me.username);
      const check = await hashPassword(String(oldPassword || ''), u.salt);
      if (check.hash !== u.hash) throw new Error('Mật khẩu hiện tại không đúng.');
      const h = await hashPassword(newPassword);
      u.salt = h.salt;
      u.hash = h.hash;
      this._save(users);
    }

    setRole(username, role) {
      this._requireAdmin();
      if (!ROLES.includes(role)) throw new Error('Vai trò không hợp lệ.');
      const users = this._users();
      const u = users.find((x) => x.username === username);
      if (!u) throw new Error('Không tìm thấy tài khoản.');
      const wasAdmin = u.role === 'ADMIN';
      u.role = role;
      if (wasAdmin && this._activeAdmins(users).length === 0) throw new Error('Phải còn ít nhất một Admin đang hoạt động.');
      this._save(users);
    }

    setActive(username, active) {
      const me = this._requireAdmin();
      if (!active && me.username === username) throw new Error('Không thể tự khóa tài khoản đang đăng nhập.');
      const users = this._users();
      const u = users.find((x) => x.username === username);
      if (!u) throw new Error('Không tìm thấy tài khoản.');
      u.active = !!active;
      if (this._activeAdmins(users).length === 0) throw new Error('Phải còn ít nhất một Admin đang hoạt động.');
      this._save(users);
    }

    removeUser(username) {
      const me = this._requireAdmin();
      if (me.username === username) throw new Error('Không thể tự xóa tài khoản đang đăng nhập.');
      const users = this._users().filter((u) => u.username !== username);
      if (this._activeAdmins(users).length === 0) throw new Error('Phải còn ít nhất một Admin đang hoạt động.');
      this._save(users);
    }
  }

  window.farmAuth = new FarmAuth();
})();
