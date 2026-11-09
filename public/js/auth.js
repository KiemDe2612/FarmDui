/**
 * Đăng nhập nội bộ phía trình duyệt (public/js/auth.js).
 * - KHÔNG có đăng ký công khai. Tài khoản do Admin tạo; lần đầu đăng nhập phải đặt mật khẩu mới.
 * - Việc kiểm tra mật khẩu, phiên đăng nhập và phân quyền nằm trên máy chủ (worker/index.js, D1).
 * - Trình duyệt băm mật khẩu bằng PBKDF2 thành "khóa" rồi mới gửi đi, máy chủ không thấy mật khẩu gốc.
 * - Chỉ lưu thông tin hiển thị (tên, vai trò) trong bộ nhớ máy để mở app khi mất mạng; phiên thật là
 *   cookie HttpOnly mà JavaScript không đọc được.
 */
(function () {
  const CACHE_KEY = 'FARM_AUTH_SESSION_V1';
  const ITERATIONS = 150000;
  const ROLES = ['ADMIN', 'MANAGER', 'STAFF', 'VIEWER'];
  const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

  const enc = new TextEncoder();
  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const u = raw ? JSON.parse(raw) : null;
      return u && u.username && ROLES.includes(u.role) ? u : null;
    } catch (e) {
      return null;
    }
  }

  function writeCache(user) {
    try {
      if (user) localStorage.setItem(CACHE_KEY, JSON.stringify(user));
      else localStorage.removeItem(CACHE_KEY);
    } catch (e) { /* bỏ qua */ }
  }

  // Gọi API cùng tên miền. Lỗi mạng có err.network = true, lỗi máy chủ có err.status / err.code.
  async function api(method, path, body) {
    let res;
    try {
      res = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'duifarm' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (e) {
      const err = new Error('Không kết nối được máy chủ. Hãy kiểm tra mạng.');
      err.network = true;
      throw err;
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* không phải JSON */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Lỗi máy chủ (${res.status}).`);
      err.status = res.status;
      err.code = data && data.code;
      throw err;
    }
    return data;
  }

  async function deriveKey(username, password) {
    if (!window.crypto || !crypto.subtle) {
      throw new Error('Trình duyệt không hỗ trợ mã hóa. Hãy mở app qua https:// hoặc localhost.');
    }
    const salt = enc.encode('duifarm|' + username);
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
    return toB64(bits);
  }

  function checkPasswordRules(password) {
    if (typeof password !== 'string' || password.length < 8) {
      throw new Error('Mật khẩu cần ít nhất 8 ký tự.');
    }
  }

  function normUsername(username) {
    const u = String(username || '').trim().toLowerCase();
    if (!USERNAME_RE.test(u)) {
      throw new Error('Tên đăng nhập 3-32 ký tự, chỉ gồm chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.');
    }
    return u;
  }

  class FarmAuth {
    constructor() {
      this.ROLES = ROLES;
      this.user = readCache();
    }

    getSessionUser() {
      return this.user;
    }

    _set(user) {
      this.user = user || null;
      writeCache(this.user);
    }

    // Hỏi máy chủ xem phiên còn hiệu lực không. Trả về 'ok' | 'anon' | 'offline'.
    async refresh() {
      try {
        const data = await api('GET', '/api/me');
        this._set(data.user);
        return 'ok';
      } catch (e) {
        if (e.network && this.user) return 'offline';
        this._set(null);
        return 'anon';
      }
    }

    async login(username, password) {
      const u = normUsername(username);
      const key = await deriveKey(u, String(password || ''));
      const data = await api('POST', '/api/login', { username: u, key });
      this._set(data.user);
      return data.user;
    }

    async logout() {
      try { await api('POST', '/api/logout', {}); } catch (e) { /* vẫn xóa phía máy */ }
      this._set(null);
    }

    async changeOwnPassword(oldPassword, newPassword) {
      if (!this.user) throw new Error('Bạn chưa đăng nhập.');
      checkPasswordRules(newPassword);
      const old_key = await deriveKey(this.user.username, String(oldPassword || ''));
      const new_key = await deriveKey(this.user.username, newPassword);
      await api('POST', '/api/password', { old_key, new_key });
      this._set({ ...this.user, must_change: false });
    }

    async listUsers() {
      return (await api('GET', '/api/users')).users;
    }

    async addUser({ username, display_name, role, password }) {
      const u = normUsername(username);
      checkPasswordRules(password);
      if (!ROLES.includes(role)) throw new Error('Vai trò không hợp lệ.');
      await api('POST', '/api/users', { username: u, display_name, role, key: await deriveKey(u, password) });
    }

    async resetPassword(username, newPassword) {
      checkPasswordRules(newPassword);
      await api('PATCH', '/api/users/' + encodeURIComponent(username), { key: await deriveKey(username, newPassword) });
    }

    setRole(username, role) {
      return api('PATCH', '/api/users/' + encodeURIComponent(username), { role });
    }

    setActive(username, active) {
      return api('PATCH', '/api/users/' + encodeURIComponent(username), { active: !!active });
    }

    removeUser(username) {
      return api('DELETE', '/api/users/' + encodeURIComponent(username));
    }
  }

  window.farmApi = api;
  window.farmAuth = new FarmAuth();
})();
