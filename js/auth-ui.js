/* Giao diện đăng nhập và quản lý tài khoản (xem js/auth.js). Không có đăng ký công khai. */
(function () {
  const $ = (id) => document.getElementById(id);
  const auth = () => window.farmAuth;
  const ROLE_DESC = {
    ADMIN: 'Admin: toàn quyền, quản lý tài khoản, sao lưu / khôi phục, chỉnh sơ đồ chuồng.',
    MANAGER: 'Manager: quản lý đàn, chuyển chuồng, ghi nhận sự cố và chỉnh sơ đồ chuồng.',
    STAFF: 'Staff: xem sơ đồ, ghi cân nặng, báo sự cố, chuyển chuồng. Không sửa sơ đồ.',
    VIEWER: 'Viewer: chỉ xem, không tạo hay sửa dữ liệu.'
  };

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
  function showLogin() {
    const setup = !auth().hasUsers();
    $('loginScreen').hidden = false;
    document.body.classList.add('auth-locked');
    $('loginTitle').textContent = setup ? 'Thiết lập lần đầu' : 'Đăng nhập';
    $('loginSub').textContent = setup
      ? 'Tạo tài khoản Admin duy nhất để bắt đầu. Sau đó chỉ Admin mới thêm được nhân sự khác.'
      : 'Chỉ dành cho nhân sự trang trại. Cần tài khoản do Admin cấp.';
    $('loginDisplayGroup').hidden = !setup;
    $('loginConfirmGroup').hidden = !setup;
    $('loginPass').autocomplete = setup ? 'new-password' : 'current-password';
    $('loginSubmit').textContent = setup ? 'Tạo Admin và vào app' : 'Đăng nhập';
    setTimeout(() => $('loginUser').focus(), 50);
  }

  async function onLoginSubmit(e) {
    e.preventDefault();
    const err = $('loginError');
    say(err, '');
    const btn = $('loginSubmit');
    const username = $('loginUser').value;
    const password = $('loginPass').value;
    btn.disabled = true;
    try {
      if (!auth().hasUsers()) {
        if (password !== $('loginConfirm').value) throw new Error('Hai lần nhập mật khẩu chưa khớp.');
        await auth().createFirstAdmin({ username, display_name: $('loginDisplay').value, password });
      } else {
        await auth().login(username, password);
      }
      location.reload();
    } catch (ex) {
      say(err, ex.message);
      btn.disabled = false;
    }
  }

  window.doLogout = function () {
    auth().logout();
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
      note('Đã lưu mật khẩu mới.');
    } catch (ex) {
      say($('passwordError'), ex.message);
    }
  }

  // ---------- Quản lý tài khoản (Admin) ----------
  const ROLE_LABEL = { ADMIN: 'Admin', MANAGER: 'Manager', STAFF: 'Staff', VIEWER: 'Viewer' };

  window.renderAccounts = function () {
    const host = $('accountsList');
    if (!host) return;
    const me = auth().getSessionUser();
    host.innerHTML = auth().listUsers().map((u) => {
      const self = me && me.username === u.username;
      const opts = auth().ROLES.map((r) => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('');
      return `<div class="item-card">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <div style="min-width:0;">
            <div class="item-card-title">${esc(u.display_name)}${self ? ' (bạn)' : ''}</div>
            <div class="mono-code" style="font-size:12px; color:var(--muted);">@${esc(u.username)}</div>
          </div>
          <span class="pill ${u.active ? 'pill-positive' : 'pill-neutral'}">${u.active ? 'Hoạt động' : 'Đã khóa'}</span>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
          <select class="form-control" style="flex:1 1 120px;" data-act="role" data-user="${esc(u.username)}" aria-label="Vai trò">${opts}</select>
          <button class="btn btn-outline btn-sm" data-act="reset" data-user="${esc(u.username)}">Đặt lại MK</button>
          ${self ? '' : `<button class="btn btn-outline btn-sm" data-act="toggle" data-user="${esc(u.username)}" data-active="${u.active ? '1' : '0'}">${u.active ? 'Khóa' : 'Mở khóa'}</button>
          <button class="btn btn-outline btn-sm" style="color:var(--negative);" data-act="delete" data-user="${esc(u.username)}">Xóa</button>`}
        </div>
      </div>`;
    }).join('');
  };

  function onAccountsClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'SELECT') return;
    const user = b.dataset.user;
    try {
      if (b.dataset.act === 'reset') return openPasswordModal(user);
      if (b.dataset.act === 'toggle') auth().setActive(user, b.dataset.active !== '1');
      if (b.dataset.act === 'delete') {
        if (!confirm('Xóa vĩnh viễn tài khoản @' + user + '? Dữ liệu trang trại không bị ảnh hưởng.')) return;
        auth().removeUser(user);
      }
      window.renderAccounts();
    } catch (ex) {
      note(ex.message, 'error');
    }
  }

  function onAccountsChange(e) {
    const s = e.target.closest('select[data-act="role"]');
    if (!s) return;
    try {
      auth().setRole(s.dataset.user, s.value);
      note('Đã đổi vai trò.');
    } catch (ex) {
      note(ex.message, 'error');
    }
    window.renderAccounts();
  }

  async function onAddUser(e) {
    e.preventDefault();
    try {
      await auth().addUser({
        username: $('newUserName').value,
        display_name: $('newUserDisplay').value,
        role: $('newUserRole').value,
        password: $('newUserPass').value
      });
      e.target.reset();
      window.renderAccounts();
      note('Đã tạo tài khoản. Hãy đưa mật khẩu tạm cho nhân sự và nhắc họ đổi mật khẩu.');
    } catch (ex) {
      note(ex.message, 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('loginForm').addEventListener('submit', onLoginSubmit);
    $('loginShowPass').addEventListener('change', (e) => {
      const t = e.target.checked ? 'text' : 'password';
      ['loginPass', 'loginConfirm'].forEach((id) => { $(id).type = t; });
    });
    $('passwordForm').addEventListener('submit', onPasswordSubmit);
    $('addUserForm').addEventListener('submit', onAddUser);
    $('accountsList').addEventListener('click', onAccountsClick);
    $('accountsList').addEventListener('change', onAccountsChange);

    if (auth().getSessionUser()) {
      document.body.classList.remove('auth-locked');
      window.refreshAccountUI();
    } else {
      showLogin();
    }
  });
})();
