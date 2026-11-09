/**
 * Đồng bộ dữ liệu trang trại với máy chủ (D1). public/js/sync.js
 * - Máy chủ là nơi giữ dữ liệu chính. localStorage chỉ là bản lưu tạm để mở nhanh và xem khi mất mạng.
 * - Mỗi lần FarmDB.persist() chạy, dữ liệu được gửi lên (gộp trong ~0,6 giây).
 * - Có số phiên bản: nếu người khác đã lưu trước, máy chủ từ chối (409), app tải bản mới và báo cho người dùng.
 * - Thay đổi chưa gửi được (mất mạng) được giữ lại và gửi tiếp khi có mạng; nếu lúc đó dữ liệu máy chủ
 *   đã đổi thì bản trên máy chủ thắng.
 */
(function () {
  const VERSION_KEY = 'FARM_SYNC_VERSION_V1';
  const DIRTY_KEY = 'FARM_SYNC_DIRTY_V1';
  const DB_KEY = 'FARM_MANAGEMENT_DATA_V1';
  const PUSH_DELAY = 600;
  const POLL_MS = 40000;

  const S = { enabled: false, version: 0, state: 'idle', timer: null, inflight: null, again: false, retry: null, lastError: '' };

  const api = (...a) => window.farmApi(...a);
  const toast = (m, t, ms) => { if (window.showToast) window.showToast(m, t || 'info', ms); };
  const db = () => window.farmDB;
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } };
  const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* bỏ qua */ } };

  const isDirty = () => lsGet(DIRTY_KEY) === '1';
  const setVersion = (v) => { S.version = v; lsSet(VERSION_KEY, String(v)); };

  function setState(state, msg) {
    S.state = state;
    S.lastError = msg || '';
    renderStatus();
  }

  function renderStatus() {
    const dot = document.getElementById('onlineStatusDot');
    const text = document.getElementById('syncStatusText');
    const online = navigator.onLine;
    let label = 'Đã lưu trên máy chủ';
    let color = 'var(--positive)';
    let title = 'Dữ liệu được lưu trên máy chủ và dùng chung cho mọi tài khoản.';
    if (!S.enabled) { label = 'Chưa đồng bộ'; color = 'var(--negative)'; title = 'Chưa kết nối dữ liệu máy chủ.'; }
    else if (S.state === 'saving') { label = 'Đang lưu...'; color = 'var(--muted)'; }
    else if (S.state === 'error') { label = 'Lỗi lưu'; color = 'var(--negative)'; title = S.lastError || 'Không lưu được lên máy chủ.'; }
    else if (!online || S.state === 'offline' || isDirty()) {
      label = online ? 'Chưa lưu lên máy chủ' : 'Ngoại tuyến';
      color = 'var(--negative)';
      title = 'Có thay đổi chưa lưu lên máy chủ. App sẽ tự lưu khi có mạng, đừng đóng hay xóa dữ liệu trình duyệt.';
    }
    if (dot) dot.style.background = color;
    if (text) { text.textContent = label; text.title = title; }
  }

  function applyServerData(data, version) {
    const d = db();
    const was = S.enabled;
    S.enabled = false; // migrate() gọi persist(); đừng coi đây là thay đổi của người dùng
    d.data = data;
    d.migrate();
    d.saveLocal();
    S.enabled = was;
    setVersion(version);
    lsDel(DIRTY_KEY);
  }

  function rerender() {
    if (typeof window.refreshAfterSync === 'function') window.refreshAfterSync();
  }

  async function pull() {
    const r = await api('GET', '/api/data');
    if (r.data) applyServerData(r.data, r.version);
    return r;
  }

  async function pullAfterConflict() {
    try {
      await pull();
      rerender();
      toast('Người khác vừa cập nhật dữ liệu. Đã tải bản mới nhất. Thao tác vừa rồi của bạn có thể cần làm lại.', 'error', 7000);
    } catch (e) {
      setState('offline');
    }
    setState('idle');
  }

  function push() {
    if (S.inflight) { S.again = true; return S.inflight; }
    S.inflight = (async () => {
      clearTimeout(S.timer);
      clearTimeout(S.retry);
      setState('saving');
      const snapshot = JSON.stringify(db().data);
      try {
        const r = await api('PUT', '/api/data', { base_version: S.version, data: db().data });
        setVersion(r.version);
        if (!S.again && JSON.stringify(db().data) === snapshot) lsDel(DIRTY_KEY);
        setState('idle');
      } catch (e) {
        if (e.network) {
          setState('offline');
          S.retry = setTimeout(() => push(), 15000);
        } else if (e.status === 409) {
          await pullAfterConflict();
        } else if (e.status === 401) {
          location.reload();
        } else if (e.status === 403 || e.status === 400 || e.status === 413) {
          setState('error', e.message);
          toast(e.message, 'error', 7000);
          try { await pull(); rerender(); } catch (e2) { /* bỏ qua */ }
        } else {
          setState('error', e.message);
          S.retry = setTimeout(() => push(), 30000);
        }
      } finally {
        S.inflight = null;
        if (S.again) { S.again = false; schedule(); }
      }
    })();
    return S.inflight;
  }

  function schedule() {
    clearTimeout(S.timer);
    S.timer = setTimeout(() => push(), PUSH_DELAY);
  }

  // FarmDB.persist() gọi hàm này sau mỗi lần ghi
  function markDirty() {
    if (!S.enabled) return;
    lsSet(DIRTY_KEY, '1');
    renderStatus();
    schedule();
  }

  // Gửi hết thay đổi đang chờ (dùng trước khi đăng xuất). Trả về true nếu đã lưu xong.
  async function flush() {
    if (!S.enabled || !isDirty()) return true;
    clearTimeout(S.timer);
    if (S.inflight) await S.inflight;
    if (isDirty()) await push();
    return !isDirty();
  }

  async function start(farmDb, user) {
    // Có thay đổi chưa gửi từ lần dùng trước (mất mạng, đóng tab) thì thử gửi trước khi tải bản mới
    const storedVersion = parseInt(lsGet(VERSION_KEY), 10);
    if (isDirty() && Number.isInteger(storedVersion) && user.role !== 'VIEWER') {
      S.version = storedVersion;
      S.enabled = true;
      try {
        await api('PUT', '/api/data', { base_version: storedVersion, data: farmDb.data }).then((r) => { setVersion(r.version); lsDel(DIRTY_KEY); });
        toast('Đã lưu các thay đổi còn dang dở từ lần trước lên máy chủ.', 'success');
      } catch (e) {
        if (e.network) {
          setState('offline');
          S.retry = setTimeout(() => push(), 15000);
          attachGlobalHandlers();
          return;
        }
        lsDel(DIRTY_KEY);
        toast('Có thay đổi chưa lưu từ lần trước nhưng dữ liệu máy chủ đã khác nên bị bỏ. Đã tải bản mới nhất.', 'error', 7000);
      }
    }
    S.enabled = false;

    let r;
    try {
      r = await api('GET', '/api/data');
    } catch (e) {
      if (e.network) {
        // Mất mạng: dùng bản lưu tạm trên máy, tự gửi lại khi có mạng
        S.enabled = true;
        S.version = Number.isInteger(storedVersion) ? storedVersion : 0;
        setState('offline');
        attachGlobalHandlers();
        toast('Đang ngoại tuyến. Bạn xem được dữ liệu đã tải trước đó; thay đổi sẽ lưu lên máy chủ khi có mạng.', 'info', 6000);
        return;
      }
      throw e;
    }

    if (r.data === null) {
      // Máy chủ chưa có dữ liệu: Admin đưa dữ liệu của máy này lên làm bản gốc
      if (user.role === 'ADMIN') {
        S.enabled = true;
        S.version = r.version;
        farmDb.saveLocal();
        await push();
        if (S.state === 'idle') toast('Đã đưa dữ liệu của máy này lên máy chủ làm bản gốc.', 'success', 6000);
      } else {
        S.enabled = false;
        toast('Máy chủ chưa có dữ liệu. Hãy nhờ Admin đăng nhập trước để khởi tạo.', 'error', 8000);
      }
    } else {
      applyServerData(r.data, r.version);
      S.enabled = true;
    }
    renderStatus();
    attachGlobalHandlers();
  }

  async function checkForUpdates() {
    if (!S.enabled || S.inflight || isDirty() || document.hidden || !navigator.onLine) return;
    if (document.querySelector('.modal-overlay.active')) return;
    if (document.querySelector('.editing')) return; // đang sửa sơ đồ
    try {
      const v = await api('GET', '/api/version');
      if (v.version !== S.version) {
        await pull();
        rerender();
        toast('Đã cập nhật dữ liệu mới từ máy chủ.', 'info', 3000);
      }
    } catch (e) {
      if (e.status === 401) location.reload();
    }
  }

  let attached = false;
  function attachGlobalHandlers() {
    if (attached) return;
    attached = true;
    setInterval(checkForUpdates, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdates(); });
    window.addEventListener('online', () => { renderStatus(); if (S.enabled && isDirty()) push(); else checkForUpdates(); });
    window.addEventListener('offline', renderStatus);
    window.addEventListener('beforeunload', (e) => {
      if (S.enabled && (isDirty() || S.inflight)) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // Xóa bản lưu tạm trên máy (khi đăng xuất) để người sau không thấy dữ liệu trang trại
  function clearLocal() {
    lsDel(DB_KEY);
    lsDel(DIRTY_KEY);
    lsDel(VERSION_KEY);
  }

  window.farmSync = { start, markDirty, flush, clearLocal, renderStatus, isDirty, checkForUpdates, get state() { return S.state; } };
})();
