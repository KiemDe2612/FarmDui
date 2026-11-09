const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./helpers');

const fresh = () => load(['js/auth.js']).window.farmAuth;

test('lần đầu chưa có tài khoản, chỉ tạo được một Admin', async () => {
  const A = fresh();
  assert.equal(A.hasUsers(), false);
  await A.createFirstAdmin({ username: 'Admin', display_name: 'Chủ trại', password: 'mat-khau-1234' });
  assert.equal(A.getSessionUser().username, 'admin');
  assert.equal(A.getSessionUser().role, 'ADMIN');
  await assert.rejects(() => A.createFirstAdmin({ username: 'khac', password: 'mat-khau-1234' }), /đã có tài khoản/);
});

test('mật khẩu ngắn hoặc tên đăng nhập sai quy tắc bị từ chối', async () => {
  const A = fresh();
  await assert.rejects(() => A.createFirstAdmin({ username: 'ab', password: 'mat-khau-1234' }), /Tên đăng nhập/);
  await assert.rejects(() => A.createFirstAdmin({ username: 'admin', password: '123' }), /ít nhất 8/);
});

test('không lưu mật khẩu gốc, chỉ lưu băm', async () => {
  const A = fresh();
  await A.createFirstAdmin({ username: 'admin', password: 'mat-khau-1234' });
  const raw = A._users()[0];
  assert.ok(raw.hash && raw.salt);
  assert.ok(!JSON.stringify(raw).includes('mat-khau-1234'));
});

test('đăng nhập sai bị từ chối và khóa tạm sau 5 lần', async () => {
  const A = fresh();
  await A.createFirstAdmin({ username: 'admin', password: 'mat-khau-1234' });
  A.logout();
  assert.equal(A.getSessionUser(), null);
  for (let i = 0; i < 5; i++) await assert.rejects(() => A.login('admin', 'sai-mat-khau'), /không đúng/);
  await assert.rejects(() => A.login('admin', 'mat-khau-1234'), /Thử lại sau/);
});

test('Admin thêm, khóa, xóa người khác; không thể tự khóa/xóa hoặc bỏ Admin cuối', async () => {
  const A = fresh();
  await A.createFirstAdmin({ username: 'admin', password: 'mat-khau-1234' });
  await A.addUser({ username: 'nv1', display_name: 'NV', role: 'STAFF', password: 'mat-khau-5678' });
  await assert.rejects(() => A.addUser({ username: 'nv1', role: 'STAFF', password: 'mat-khau-5678' }), /đã tồn tại/);
  assert.throws(() => A.setActive('admin', false), /tự khóa/);
  assert.throws(() => A.removeUser('admin'), /tự xóa/);
  assert.throws(() => A.setRole('admin', 'STAFF'), /ít nhất một Admin/);
  A.setActive('nv1', false);
  await assert.rejects(() => A.login('nv1', 'mat-khau-5678'), /không đúng|khóa/);
  A.removeUser('nv1');
  assert.equal(A.listUsers().length, 1);
});

test('nhân viên không được quản lý tài khoản', async () => {
  const A = fresh();
  await A.createFirstAdmin({ username: 'admin', password: 'mat-khau-1234' });
  await A.addUser({ username: 'nv1', role: 'STAFF', password: 'mat-khau-5678' });
  await A.login('nv1', 'mat-khau-5678');
  await assert.rejects(() => A.addUser({ username: 'nv2', role: 'STAFF', password: 'mat-khau-5678' }), /Quyền bị từ chối/);
  assert.throws(() => A.removeUser('admin'), /Quyền bị từ chối/);
});

test('đổi mật khẩu cần đúng mật khẩu cũ', async () => {
  const A = fresh();
  await A.createFirstAdmin({ username: 'admin', password: 'mat-khau-1234' });
  await assert.rejects(() => A.changeOwnPassword('sai', 'mat-khau-moi-99'), /không đúng/);
  await A.changeOwnPassword('mat-khau-1234', 'mat-khau-moi-99');
  A.logout();
  await A.login('admin', 'mat-khau-moi-99');
  assert.equal(A.getSessionUser().username, 'admin');
});
