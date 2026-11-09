import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer, load, CLIENT } from './helpers.js';

const PW = 'mat-khau-tam-1';

function boot() {
  const server = makeServer();
  const ctx = load([CLIENT.auth], server);
  return { server, ctx, auth: ctx.window.farmAuth };
}

test('chưa đăng nhập: refresh trả về anon và không có người dùng', async () => {
  const { auth } = boot();
  assert.equal(await auth.refresh(), 'anon');
  assert.equal(auth.getSessionUser(), null);
});

test('đăng nhập sai bị từ chối, đúng thì có phiên và lưu thông tin hiển thị', async () => {
  const { server, ctx, auth } = boot();
  server.seedUser('admin', 'ADMIN', PW);
  await assert.rejects(() => auth.login('admin', 'sai-mat-khau'), /không đúng/);
  const u = await auth.login('Admin', PW);
  assert.equal(u.username, 'admin');
  assert.equal(auth.getSessionUser().role, 'ADMIN');
  assert.ok(ctx.window.localStorage.getItem('FARM_AUTH_SESSION_V1'));
  assert.ok(!ctx.window.localStorage.getItem('FARM_AUTH_SESSION_V1').includes(PW));

  // mở lại app (đối tượng mới, cùng cookie) vẫn nhận ra phiên
  assert.equal(await auth.refresh(), 'ok');
});

test('không gửi mật khẩu gốc lên máy chủ', async () => {
  const { server, ctx, auth } = boot();
  server.seedUser('admin', 'ADMIN', PW);
  const sent = [];
  const realFetch = ctx.fetch;
  ctx.fetch = async (p, init) => { sent.push(init && init.body); return realFetch(p, init); };
  await auth.login('admin', PW);
  assert.ok(sent.length === 1 && !sent[0].includes(PW));
});

test('mất mạng: có thông tin đã lưu thì vào chế độ ngoại tuyến, không có thì về đăng nhập', async () => {
  const { server, ctx, auth } = boot();
  server.seedUser('admin', 'ADMIN', PW);
  ctx.state.offline = true;
  assert.equal(await auth.refresh(), 'anon');
  ctx.state.offline = false;
  await auth.login('admin', PW);
  ctx.state.offline = true;
  assert.equal(await auth.refresh(), 'offline');
  assert.equal(auth.getSessionUser().username, 'admin');
  await assert.rejects(() => auth.login('admin', PW), /Không kết nối/);
});

test('phiên hết hạn trên máy chủ thì refresh xóa thông tin người dùng', async () => {
  const { server, ctx, auth } = boot();
  server.seedUser('admin', 'ADMIN', PW);
  await auth.login('admin', PW);
  server.env.DB._raw.prepare('DELETE FROM sessions').run();
  assert.equal(await auth.refresh(), 'anon');
  assert.equal(auth.getSessionUser(), null);
  assert.equal(ctx.window.localStorage.getItem('FARM_AUTH_SESSION_V1'), null);
});

test('đổi mật khẩu cần đúng mật khẩu cũ, mật khẩu mới tối thiểu 8 ký tự', async () => {
  const { server, auth } = boot();
  server.seedUser('admin', 'ADMIN', PW, { mustChange: 1 });
  const u = await auth.login('admin', PW);
  assert.equal(u.must_change, true);
  await assert.rejects(() => auth.changeOwnPassword(PW, 'ngan'), /ít nhất 8/);
  await assert.rejects(() => auth.changeOwnPassword('sai-mat-khau', 'mat-khau-moi-99'), /không đúng/);
  await auth.changeOwnPassword(PW, 'mat-khau-moi-99');
  assert.equal(auth.getSessionUser().must_change, false);
  await auth.logout();
  await assert.rejects(() => auth.login('admin', PW), /không đúng/);
  assert.equal((await auth.login('admin', 'mat-khau-moi-99')).username, 'admin');
});

test('Admin thêm, đổi vai trò, đặt lại mật khẩu, khóa và xóa nhân sự', async () => {
  const { server, auth } = boot();
  server.seedUser('admin', 'ADMIN', PW);
  await auth.login('admin', PW);
  await auth.addUser({ username: 'nv1', display_name: 'NV Một', role: 'STAFF', password: 'mat-khau-5678' });
  await assert.rejects(() => auth.addUser({ username: 'nv1', role: 'STAFF', password: 'mat-khau-5678' }), /đã tồn tại/);
  await assert.rejects(() => auth.addUser({ username: 'ab', role: 'STAFF', password: 'mat-khau-5678' }), /Tên đăng nhập/);
  await assert.rejects(() => auth.addUser({ username: 'nv2', role: 'STAFF', password: '123' }), /ít nhất 8/);
  await auth.setRole('nv1', 'MANAGER');
  await auth.resetPassword('nv1', 'mat-khau-9999');
  await auth.setActive('nv1', false);
  assert.equal((await auth.listUsers()).find((u) => u.username === 'nv1').active, false);
  await auth.removeUser('nv1');
  assert.equal((await auth.listUsers()).length, 1);
  await assert.rejects(() => auth.removeUser('admin'), /tự xóa/);
});

test('nhân viên không được quản lý tài khoản', async () => {
  const { server, auth } = boot();
  server.seedUser('nv1', 'STAFF', PW);
  await auth.login('nv1', PW);
  await assert.rejects(() => auth.listUsers(), /Quyền bị từ chối/);
  await assert.rejects(() => auth.addUser({ username: 'nv2', role: 'STAFF', password: 'mat-khau-5678' }), /Quyền bị từ chối/);
});
