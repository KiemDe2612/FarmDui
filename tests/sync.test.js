import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer, load, CLIENT } from './helpers.js';

const PW = 'mat-khau-tam-1';
const DIRTY = 'FARM_SYNC_DIRTY_V1';

const serverVersion = (server) => server.env.DB._raw.prepare("SELECT value FROM meta WHERE key = 'data_version'").get().value;
const serverRows = (server) => Object.fromEntries(server.env.DB._raw.prepare('SELECT key, value FROM farm_data').all().map((r) => [r.key, JSON.parse(r.value)]));

// Một "trình duyệt": nạp app, đăng nhập bằng tài khoản có sẵn rồi khởi động bộ đồng bộ
async function client(server, role, { start = true } = {}) {
  const name = role.toLowerCase();
  try { server.seedUser(name, role, PW); } catch (e) { /* đã có */ }
  const ctx = load([CLIENT.auth, CLIENT.db, CLIENT.sync], server);
  const user = await ctx.window.farmAuth.login(name, PW);
  if (start) await ctx.window.farmSync.start(ctx.window.farmDB, user);
  return ctx;
}

test('Admin vào lần đầu: dữ liệu của máy được đưa lên máy chủ làm bản gốc', async () => {
  const server = makeServer();
  const a = await client(server, 'ADMIN');
  assert.equal(serverVersion(server), 1);
  assert.equal(serverRows(server).animals.length, a.window.farmDB.getAnimals().length);
  assert.equal(a.window.localStorage.getItem(DIRTY), null);
});

test('thay đổi được đẩy lên máy chủ, máy khác đăng nhập thấy đúng dữ liệu đó', async () => {
  const server = makeServer();
  const a = await client(server, 'ADMIN');
  const animal = a.window.farmDB.getAnimals()[0];
  a.window.farmDB.addWeight(animal.id, 3.21, 'kg', 'sync test');
  assert.equal(a.window.localStorage.getItem(DIRTY), '1');
  await a.window.farmSync.flush();
  assert.equal(a.window.localStorage.getItem(DIRTY), null);
  assert.equal(serverVersion(server), 2);

  const b = await client(server, 'MANAGER');
  assert.ok(b.window.farmDB.getWeights(animal.id).some((w) => w.weight_value === 3.21 || w.weight_kg === 3.21 || JSON.stringify(w).includes('3.21')));
});

test('hai người sửa cùng lúc: người lưu sau bị báo, nhận bản mới và không ghi đè', async () => {
  const server = makeServer();
  const a = await client(server, 'ADMIN');
  const b = await client(server, 'MANAGER');
  const id = a.window.farmDB.getAnimals()[0].id;

  a.window.farmDB.addWeight(id, 1.11, 'kg', 'của A');
  await a.window.farmSync.flush();
  const afterA = serverVersion(server);

  b.window.farmDB.addWeight(id, 9.99, 'kg', 'của B');
  await b.window.farmSync.flush();

  assert.equal(serverVersion(server), afterA, 'bản của B không được ghi đè');
  assert.ok(!JSON.stringify(serverRows(server).animal_weights).includes('9.99'));
  assert.ok(b.window._toasts.some((t) => /Người khác vừa cập nhật/.test(t.m)));
  assert.ok(JSON.stringify(b.window.farmDB.data.animal_weights).includes('1.11'));
  assert.ok(!JSON.stringify(b.window.farmDB.data.animal_weights).includes('9.99'));
  assert.equal(b.window.localStorage.getItem(DIRTY), null);

  // sau khi nhận bản mới, B lưu tiếp bình thường
  b.window.farmDB.addWeight(id, 2.22, 'kg', 'B làm lại');
  await b.window.farmSync.flush();
  assert.equal(serverVersion(server), afterA + 1);
});

test('mất mạng: thay đổi được giữ lại, có mạng thì tự gửi lên', async () => {
  const server = makeServer();
  const a = await client(server, 'ADMIN');
  const id = a.window.farmDB.getAnimals()[0].id;
  a.state.offline = true;
  a.window.farmDB.addWeight(id, 4.44, 'kg', 'offline');
  await a.window.farmSync.flush();
  assert.equal(a.window.localStorage.getItem(DIRTY), '1');
  assert.equal(serverVersion(server), 1);

  a.state.offline = false;
  await a.window.farmSync.flush();
  assert.equal(a.window.localStorage.getItem(DIRTY), null);
  assert.equal(serverVersion(server), 2);
  assert.ok(JSON.stringify(serverRows(server).animal_weights).includes('4.44'));
});

test('mở app khi mất mạng thì dùng bản lưu tạm, không báo lỗi và không mất dữ liệu', async () => {
  const server = makeServer();
  const a = await client(server, 'ADMIN');
  a.state.offline = true;
  await a.window.farmSync.start(a.window.farmDB, a.window.farmAuth.getSessionUser());
  assert.ok(a.window.farmDB.getAnimals().length > 0);
  assert.ok(a.window._toasts.some((t) => /ngoại tuyến/i.test(t.m)));
});

test('máy chủ chưa có dữ liệu thì chỉ Admin được khởi tạo', async () => {
  const server = makeServer();
  const m = await client(server, 'MANAGER');
  assert.equal(serverVersion(server), 0);
  assert.ok(m.window._toasts.some((t) => /Admin đăng nhập trước/.test(t.m)));
  m.window.farmDB.addWeight(m.window.farmDB.getAnimals()[0].id, 1, 'kg', 'x');
  await m.window.farmSync.flush();
  assert.equal(serverVersion(server), 0);
});

test('Viewer cố sửa thì máy chủ từ chối và dữ liệu trên máy được trả về như máy chủ', async () => {
  const server = makeServer();
  await client(server, 'ADMIN');
  const v = await client(server, 'VIEWER');
  const before = v.window.farmDB.getAnimals().length;
  v.window.farmDB.data.animals.push({ id: 'hack', animal_code: 'HACK' }); // vượt qua kiểm tra phía giao diện
  v.window.farmDB.persist();
  assert.equal(v.window.farmSync.isDirty(), true);
  await v.window.farmSync.flush();
  assert.equal(serverVersion(server), 1);
  assert.equal(serverRows(server).animals.some((a) => a.id === 'hack'), false);
  assert.equal(v.window.farmDB.getAnimals().length, before);
  assert.ok(v.window._toasts.some((t) => /Viewer/.test(t.m)));
});

test('Staff không thể đổi sơ đồ qua API dù sửa tay dữ liệu', async () => {
  const server = makeServer();
  await client(server, 'ADMIN');
  const s = await client(server, 'STAFF');
  s.window.farmDB.data.pens.push({ id: 'pen-hack', pen_code: 'HACK' });
  s.window.farmDB.persist();
  await s.window.farmSync.flush();
  assert.equal(serverRows(server).pens.some((p) => p.id === 'pen-hack'), false);
  assert.equal(s.window.farmDB.getPens().some((p) => p.id === 'pen-hack'), false);
});

test('thay đổi dang dở từ lần trước được gửi khi mở lại; nếu máy chủ đã khác thì bản máy chủ thắng', async () => {
  const server = makeServer();
  const a = await client(server, 'ADMIN');
  const id = a.window.farmDB.getAnimals()[0].id;
  a.state.offline = true;
  a.window.farmDB.addWeight(id, 5.55, 'kg', 'dang do');
  await a.window.farmSync.flush();
  assert.equal(a.window.localStorage.getItem(DIRTY), '1');

  // "mở lại app" cùng bộ nhớ máy, có mạng: bản dang dở được gửi lên
  a.state.offline = false;
  await a.window.farmSync.start(a.window.farmDB, a.window.farmAuth.getSessionUser());
  assert.ok(JSON.stringify(serverRows(server).animal_weights).includes('5.55'));
  assert.equal(a.window.localStorage.getItem(DIRTY), null);
});

test('clearLocal xóa dữ liệu trang trại lưu tạm trên máy', async () => {
  const server = makeServer();
  const a = await client(server, 'ADMIN');
  assert.ok(a.window.localStorage.getItem('FARM_MANAGEMENT_DATA_V1'));
  a.window.farmSync.clearLocal();
  assert.equal(a.window.localStorage.getItem('FARM_MANAGEMENT_DATA_V1'), null);
  assert.equal(a.window.localStorage.getItem('FARM_SYNC_VERSION_V1'), null);
});
