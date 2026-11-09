/* Giao diện đăng nhập, đặt mật khẩu lần đầu và quản lý tài khoản (xem js/auth.js). Không có đăng ký công khai. */
(function () {
  const $ = (id) => document.getElementById(id);
  const auth = () => window.farmAuth;
  const ROLE_DESC = {
    ADMIN: 'Admin: toàn quyền, quản lý tài khoản, sao lưu / khôi phục, chỉnh sơ đồ chuồng.',
    MANAGER: 'Manager: quản lý đàn, chuyển chuồng, ghi nhận sự cố và chỉnh sơ đồ chuồng.',
    STAFF: 'Staff: xem sơ đồ, ghi cân nặng, báo sự cố, chuyển chuồng. Không sửa sơ đồ.',
    VIEWER: 'Viewer: chỉ xem, không tạo hay sửa dữ liệu.'
  };

  // app.js và map-ui.js đăng ký hàm khởi động qua đây; chỉ chạy sau khi đăng nhập và tải xong dữ liệu
  const readyQueue = [];
  let appIsReady = false;
  window.whenAppReady = function (fn) {
    if (appIsReady) fn();
    else readyQueue.push(fn);
  };
  function appReady() {
    appIsReady = true;
    readyQueue.splice(0).forEach((fn) => fn());
  }

  function say(el, msg) {
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function note(msg, type) {
    if (window.showToast) window.showToast(msg, type || 'success');
    else alert(msg);
  }

  // ---------- Màn hình đăng nhập ----------
  function showLoginScreen(mode) {
    $('bootLoading').hidden = true;
    $('loginScreen').hidden = false;
    document.body.classList.add('auth-locked');
    $('loginForm').hidden = mode !== 'login';
    $('forcePwForm').hidden = mode !== 'force';
    setTimeout(() => $(mode === 'login' ? 'loginUser' : 'forceOld').focus(), 50);
  }

  function showLogin() {
    showLoginScreen('login');
  }

  function showForcedPassword() {
    ['forceOld', 'forceNew', 'forceConfirm'].forEach((id) => { $(id).value = ''; });
    say($('forceError'), '');
    const me = auth().getSessionUser();
    $('forceWho').textContent = me ? me.display_name + ' (@' + me.username + ')' : '';
    showLoginScreen('force');
  }

  // Vào app: tải dữ liệu từ máy chủ rồi mở giao diện
  async function enterApp() {
    const me = auth().getSessionUser();
    try {
      await window.farmSync.start(window.farmDB, me);
    } catch (ex) {
      if (ex.status === 401) {
        auth().logout();
        return showLogin();
      }
      note('Không tải được dữ liệu từ máy chủ: ' + ex.message, 'error');
    }
    $('bootLoading').hidden = true;
    $('loginScreen').hidden = true;
    document.body.classList.remove('auth-locked');
    window.refreshAccountUI();
    appReady();
  }

  async function onLoginSubmit(e) {
    e.preventDefault();
    const err = $('loginError');
    say(err, '');
    const btn = $('loginSubmit');
    btn.disabled = true;
    btn.textContent = 'Đang đăng nhập...';
    try {
      const user = await auth().login($('loginUser').value, $('loginPass').value);
      $('loginPass').value = '';
      if (user.must_change) showForcedPassword();
      else await enterApp();
    } catch (ex) {
      say(err, ex.message);
    }
    btn.disabled = false;
    btn.textContent = 'Đăng nhập';
  }

  async function onForcePasswordSubmit(e) {
    e.preventDefault();
    const err = $('forceError');
    say(err, '');
    const btn = $('forceSubmit');
    btn.disabled = true;
    try {
      if ($('forceNew').value !== $('forceConfirm').value) throw new Error('Hai lần nhập mật khẩu mới chưa khớp.');
      await auth().changeOwnPassword($('forceOld').value, $('forceNew').value);
      ['forceOld', 'forceNew', 'forceConfirm'].forEach((id) => { $(id).value = ''; });
      await enterApp();
      note('Đã đặt mật khẩu mới. Lần sau hãy đăng nhập bằng mật khẩu này.');
    } catch (ex) {
      say(err, ex.message);
    }
    btn.disabled = false;
  }

  window.doLogout = async function () {
    if (window.farmSync && window.farmSync.isDirty()) {
      const saved = await window.farmSync.flush();
      if (!saved && !confirm('Còn thay đổi chưa lưu lên máy chủ (có thể do mất mạng). Đăng xuất bây giờ sẽ làm mất chúng. Vẫn đăng xuất?')) return;
    }
    await auth().logout();
    if (window.farmSync) window.farmSync.clearLocal();
    location.reload();
  };

  // ---------- Thẻ tài khoản & phân quyền giao diện ----------
  window.refreshAccountUI = function () {
    const me = auth().getSessionUser();
    const role = me ? me.role : 'VIEWER';
    if ($('accountDisplayName')) $('accountDisplayName').textContent = me ? me.display_name : 'Khách';
    if ($('accountUsername')) $('accountUsername').textContent = me ? '@' + me.username : '';
    if ($('accountRolePill')) $('accountRolePill').textContent = role;
    if ($('currentUserRoleText')) $('currentUserRoleText').textContent = role;
    if ($('roleDescriptionText')) $('roleDescriptionText').textContent = ROLE_DESC[role] || '';
    if ($('accountsMenuItem')) $('accountsMenuItem').hidden = role !== 'ADMIN';
    document.querySelectorAll('[data-roles]').forEach((el) => {
      el.hidden = !el.dataset.roles.split(',').includes(role);
    });
  };

  // ---------- Đổi / đặt lại mật khẩu ----------
  let pwTarget = null; // null = tự đổi; chuỗi = Admin đặt lại cho người đó

  function openPasswordModal(target) {
    pwTarget = target;
    $('passwordTitle').textContent = target ? 'Đặt lại mật khẩu: ' + target : 'Đổi mật khẩu';
    $('passwordHint').textContent = target ? 'Đây là mật khẩu tạm. Người này sẽ phải tự đặt mật khẩu mới khi đăng nhập.' : '';
    $('passwordHint').hidden = !target;
    $('passwordOldGroup').hidden = !!target;
    ['pwOld', 'pwNew', 'pwConfirm'].forEach((id) => { $(id).value = ''; });
    say($('passwordError'), '');
    $('modalPassword').classList.add('active');
    setTimeout(() => $(target ? 'pwNew' : 'pwOld').focus(), 50);
  }
  window.openChangePasswordModal = () => openPasswordModal(null);

  async function onPasswordSubmit(e) {
    e.preventDefault();
    say($('passwordError'), '');
    try {
      if ($('pwNew').value !== $('pwConfirm').value) throw new Error('Hai lần nhập mật khẩu mới chưa khớp.');
      if (pwTarget) await auth().resetPassword(pwTarget, $('pwNew').value);
      else await auth().changeOwnPassword($('pwOld').value, $('pwNew').value);
      $('modalPassword').classList.remove('active');
      note(pwTarget ? 'Đã đặt mật khẩu tạm. Hãy gửi cho người đó, họ sẽ phải đổi khi đăng nhập.' : 'Đã lưu mật khẩu mới.');
      if (pwTarget) window.renderAccounts();
    } catch (ex) {
      say($('passwordError'), ex.message);
    }
  }

  // ---------- Quản lý tài khoản (Admin) ----------
  const ROLE_LABEL = { ADMIN: 'Admin', MANAGER: 'Manager', STAFF: 'Staff', VIEWER: 'Viewer' };

  window.renderAccounts = async function () {
    const host = $('accountsList');
    if (!host) return;
    const me = auth().getSessionUser();
    let users;
    try {
      users = await auth().listUsers();
    } catch (ex) {
      host.innerHTML = `<div class="item-card" style="color:var(--negative);">${esc(ex.message)}</div>`;
      return;
    }
    host.innerHTML = users.map((u) => {
      const self = me && me.username === u.username;
      const opts = auth().ROLES.map((r) => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('');
      const state = !u.active ? '<span class="pill pill-neutral">Đã khóa</span>'
        : u.must_change ? '<span class="pill pill-neutral">Chờ đổi MK</span>'
        : '<span class="pill pill-positive">Hoạt động</span>';
      return `<div class="item-card">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <div style="min-width:0;">
            <div class="item-card-title">${esc(u.display_name)}${self ? ' (bạn)' : ''}</div>
            <div class="mono-code" style="font-size:12px; color:var(--muted);">@${esc(u.username)}</div>
          </div>
          ${state}
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
          <select class="form-control" style="flex:1 1 120px;" data-act="role" data-user="${esc(u.username)}" aria-label="Vai trò">${opts}</select>
          ${self ? '' : `<button class="btn btn-outline btn-sm" data-act="reset" data-user="${esc(u.username)}">Đặt lại MK</button>
          <button class="btn btn-outline btn-sm" data-act="toggle" data-user="${esc(u.username)}" data-active="${u.active ? '1' : '0'}">${u.active ? 'Khóa' : 'Mở khóa'}</button>
          <button class="btn btn-outline btn-sm" style="color:var(--negative);" data-act="delete" data-user="${esc(u.username)}">Xóa</button>`}
        </div>
      </div>`;
    }).join('');
  };

  async function onAccountsClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'SELECT') return;
    const user = b.dataset.user;
    try {
      if (b.dataset.act === 'reset') return openPasswordModal(user);
      if (b.dataset.act === 'toggle') await auth().setActive(user, b.dataset.active !== '1');
      if (b.dataset.act === 'delete') {
        if (!confirm('Xóa vĩnh viễn tài khoản @' + user + '? Dữ liệu trang trại không bị ảnh hưởng.')) return;
        await auth().removeUser(user);
      }
    } catch (ex) {
      note(ex.message, 'error');
    }
    window.renderAccounts();
  }

  async function onAccountsChange(e) {
    const s = e.target.closest('select[data-act="role"]');
    if (!s) return;
    try {
      await auth().setRole(s.dataset.user, s.value);
      note('Đã đổi vai trò.');
    } catch (ex) {
      note(ex.message, 'error');
    }
    window.renderAccounts();
  }

  async function onAddUser(e) {
    e.preventDefault();
    const form = e.target;
    try {
      await auth().addUser({
        username: $('newUserName').value,
        display_name: $('newUserDisplay').value,
        role: $('newUserRole').value,
        password: $('newUserPass').value
      });
      form.reset();
      window.renderAccounts();
      note('Đã tạo tài khoản. Hãy gửi mật khẩu tạm cho nhân sự, họ sẽ phải đặt mật khẩu mới khi đăng nhập lần đầu.');
    } catch (ex) {
      note(ex.message, 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    $('loginForm').addEventListener('submit', onLoginSubmit);
    $('forcePwForm').addEventListener('submit', onForcePasswordSubmit);
    $('forceLogout').addEventListener('click', () => window.doLogout());
    $('loginShowPass').addEventListener('change', (e) => { $('loginPass').type = e.target.checked ? 'text' : 'password'; });
    $('forceShowPass').addEventListener('change', (e) => {
      const t = e.target.checked ? 'text' : 'password';
      ['forceOld', 'forceNew', 'forceConfirm'].forEach((id) => { $(id).type = t; });
    });
    $('passwordForm').addEventListener('submit', onPasswordSubmit);
    $('addUserForm').addEventListener('submit', onAddUser);
    $('accountsList').addEventListener('click', onAccountsClick);
    $('accountsList').addEventListener('change', onAccountsChange);

    const status = await auth().refresh();
    const me = auth().getSessionUser();
    if (!me) return showLogin();
    if (me.must_change && status === 'ok') return showForcedPassword();
    await enterApp();
  });
})();
