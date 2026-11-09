import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from './helpers.js';

const PW = 'mat-khau-tam-1';

async function asUser(role = 'ADMIN', name = role.toLowerCase()) {
  const s = makeServer();
  s.seedUser(name, role, PW);
  const r = await s.login(name, PW);
  assert.equal(r.status, 200);
  return s;
}

const sampleData = () => ({
  animals: [{ id: 'a1', code: 'D001' }],
  pens: [{ id: 'p1', pen_code: 'A01' }],
  zones: [],
  farm_map: { blocks: [] },
  farm_map_revisions: [],
  animal_weights: []
});

test('chưa đăng nhập thì không vào được dữ liệu và thông tin cá nhân', async () => {
  const s = makeServer();
  for (const p of ['/api/me', '/api/data', '/api/version', '/api/users']) {
    const r = await s.call('GET', p);
    assert.equal(r.status, 401, p);
  }
});

test('yêu cầu ghi thiếu tiêu đề chống giả mạo hoặc từ trang khác bị chặn', async () => {
  const s = await asUser();
  assert.equal((await s.call('PUT', '/api/data', { base_version: 0, data: sampleData() }, { csrf: false })).status, 403);
  assert.equal((await s.call('PUT', '/api/data', { base_version: 0, data: sampleData() }, { headers: { origin: 'https://evil.test' } })).status, 403);
});

test('đăng nhập sai báo lỗi chung, sai 5 lần thì khóa tạm kể cả khi nhập đúng', async () => {
  const s = makeServer();
  s.seedUser('admin', 'ADMIN', PW);
  assert.equal((await s.login('khongco', PW)).status, 401);
  for (let i = 0; i < 5; i++) assert.equal((await s.login('admin', 'sai-mat-khau')).status, 401);
  const locked = await s.login('admin', PW);
  assert.equal(locked.status, 429);
  assert.match(locked.data.error, /Thử lại sau/);
});

test('cookie phiên là HttpOnly, SameSite, Secure trên https; đăng xuất hủy phiên', async () => {
  const s = makeServer();
  s.seedUser('admin', 'ADMIN', PW);
  const r = await s.login('admin', PW);
  const sc = r.headers.get('set-cookie');
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /SameSite=Lax/);
  assert.match(sc, /Secure/);
  assert.equal((await s.call('GET', '/api/me')).status, 200);
  assert.equal((await s.call('POST', '/api/logout', {})).status, 200);
  assert.equal((await s.call('GET', '/api/me')).status, 401);
});

test('tài khoản khóa không đăng nhập được; mật khẩu gốc và khóa không nằm trong DB hay phản hồi', async () => {
  const s = makeServer();
  s.seedUser('khoa', 'STAFF', PW, { active: 0 });
  assert.equal((await s.login('khoa', PW)).status, 401);
  s.seedUser('admin', 'ADMIN', PW);
  const r = await s.login('admin', PW);
  assert.ok(!JSON.stringify(r.data).includes('hash') && !JSON.stringify(r.data).includes('salt'));
  const list = await s.call('GET', '/api/users');
  assert.ok(!JSON.stringify(list.data).includes('hash') && !JSON.stringify(list.data).includes('salt'));
  const row = s.env.DB._raw.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  assert.ok(!JSON.stringify(row).includes(s.deriveKey('admin', PW)));
});

test('tài khoản mới phải đổi mật khẩu trước khi dùng dữ liệu', async () => {
  const s = makeServer();
  s.seedUser('nv1', 'STAFF', PW, { mustChange: 1 });
  const lg = await s.login('nv1', PW);
  assert.equal(lg.data.user.must_change, true);
  const blocked = await s.call('GET', '/api/data');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'must_change');

  const k = (p) => s.deriveKey('nv1', p);
  assert.equal((await s.call('POST', '/api/password', { old_key: k('sai-mat-khau-x'), new_key: k('mat-khau-moi-99') })).status, 400);
  assert.equal((await s.call('POST', '/api/password', { old_key: k(PW), new_key: k(PW) })).status, 400);
  assert.equal((await s.call('POST', '/api/password', { old_key: k(PW), new_key: k('mat-khau-moi-99') })).status, 200);
  assert.equal((await s.call('GET', '/api/data')).status, 200);

  // mật khẩu cũ không còn dùng được, mật khẩu mới dùng được
  await s.call('POST', '/api/logout', {});
  assert.equal((await s.login('nv1', PW)).status, 401);
  const again = await s.login('nv1', 'mat-khau-moi-99');
  assert.equal(again.status, 200);
  assert.equal(again.data.user.must_change, false);
});

test('dữ liệu: Admin khởi tạo lần đầu, người khác không khởi tạo được', async () => {
  const s = makeServer();
  s.seedUser('mgr', 'MANAGER', PW);
  await s.login('mgr', PW);
  assert.deepEqual((await s.call('GET', '/api/data')).data, { version: 0, data: null });
  assert.equal((await s.call('PUT', '/api/data', { base_version: 0, data: sampleData() })).status, 403);
  await s.call('POST', '/api/logout', {});
  s.seedUser('admin', 'ADMIN', PW);
  await s.login('admin', PW);
  const put = await s.call('PUT', '/api/data', { base_version: 0, data: sampleData() });
  assert.equal(put.status, 200);
  assert.equal(put.data.version, 1);
  const got = await s.call('GET', '/api/data');
  assert.equal(got.data.version, 1);
  assert.deepEqual(got.data.data.animals, [{ id: 'a1', code: 'D001' }]);
});

test('dữ liệu: ghi với phiên bản cũ bị từ chối (409) và không làm thay đổi gì', async () => {
  const s = await asUser('ADMIN');
  await s.call('PUT', '/api/data', { base_version: 0, data: sampleData() });
  const d1 = sampleData();
  d1.animals.push({ id: 'a2', code: 'D002' });
  assert.equal((await s.call('PUT', '/api/data', { base_version: 1, data: d1 })).data.version, 2);
  const stale = sampleData();
  stale.animals = [{ id: 'x', code: 'GHI-DE' }];
  stale.pens = [];
  const r = await s.call('PUT', '/api/data', { base_version: 1, data: stale });
  assert.equal(r.status, 409);
  assert.equal(r.data.code, 'conflict');
  const now = (await s.call('GET', '/api/data')).data;
  assert.equal(now.version, 2);
  assert.equal(now.data.animals.length, 2);
  assert.equal(now.data.pens.length, 1);
});

test('dữ liệu: gửi lại y hệt không tăng phiên bản; mục bị bỏ sẽ bị xóa', async () => {
  const s = await asUser('ADMIN');
  await s.call('PUT', '/api/data', { base_version: 0, data: sampleData() });
  const same = await s.call('PUT', '/api/data', { base_version: 1, data: sampleData() });
  assert.equal(same.data.version, 1);
  assert.equal(same.data.unchanged, true);
  const less = sampleData();
  delete less.animal_weights;
  assert.equal((await s.call('PUT', '/api/data', { base_version: 1, data: less })).data.version, 2);
  assert.ok(!('animal_weights' in (await s.call('GET', '/api/data')).data.data));
});

test('dữ liệu: kiểm tra cấu trúc và kích thước', async () => {
  const s = await asUser('ADMIN');
  assert.equal((await s.call('PUT', '/api/data', { base_version: 0, data: [] })).status, 400);
  assert.equal((await s.call('PUT', '/api/data', { base_version: 0, data: {} })).status, 400);
  assert.equal((await s.call('PUT', '/api/data', { base_version: 'x', data: sampleData() })).status, 400);
  assert.equal((await s.call('PUT', '/api/data', { base_version: 0, data: { 'Bad Key!': [] } })).status, 400);
  assert.equal((await s.call('PUT', '/api/data', { base_version: 0, data: { animals: 'x'.repeat(2_000_000) } })).status, 413);
});

test('phân quyền ghi dữ liệu: Viewer không ghi; Staff không đổi sơ đồ/chuồng; Manager đổi được', async () => {
  const s = await asUser('ADMIN');
  await s.call('PUT', '/api/data', { base_version: 0, data: sampleData() });
  const asRole = async (role) => {
    await s.call('POST', '/api/logout', {});
    s.seedUser(role.toLowerCase(), role, PW);
    assert.equal((await s.login(role.toLowerCase(), PW)).status, 200);
  };

  await asRole('VIEWER');
  assert.equal((await s.call('GET', '/api/data')).status, 200);
  assert.equal((await s.call('PUT', '/api/data', { base_version: 1, data: sampleData() })).status, 403);

  await asRole('STAFF');
  const w = sampleData();
  w.animal_weights.push({ id: 'w1' });
  assert.equal((await s.call('PUT', '/api/data', { base_version: 1, data: w })).status, 200);
  const sneaky = sampleData();
  sneaky.animal_weights.push({ id: 'w1' });
  sneaky.pens.push({ id: 'p2' });
  assert.equal((await s.call('PUT', '/api/data', { base_version: 2, data: sneaky })).status, 403);
  const reordered = { farm_map: { blocks: [] }, ...w }; // cùng nội dung, khác thứ tự khóa vẫn hợp lệ
  assert.equal((await s.call('PUT', '/api/data', { base_version: 2, data: reordered })).status, 200);

  await asRole('MANAGER');
  const m = sampleData();
  m.animal_weights.push({ id: 'w1' });
  m.pens.push({ id: 'p2' });
  assert.equal((await s.call('PUT', '/api/data', { base_version: 2, data: m })).status, 200);
});

test('quản lý tài khoản: chỉ Admin; người mới phải đổi mật khẩu; không trùng tên', async () => {
  const s = await asUser('MANAGER');
  assert.equal((await s.call('GET', '/api/users')).status, 403);
  assert.equal((await s.call('POST', '/api/users', { username: 'nv9', role: 'STAFF', key: s.deriveKey('nv9', PW) })).status, 403);

  const a = await asUser('ADMIN');
  const add = { username: 'nv9', display_name: 'NV Chín', role: 'STAFF', key: a.deriveKey('nv9', PW) };
  assert.equal((await a.call('POST', '/api/users', add)).status, 201);
  assert.equal((await a.call('POST', '/api/users', add)).status, 409);
  assert.equal((await a.call('POST', '/api/users', { ...add, username: 'Bad Name' })).status, 400);
  assert.equal((await a.call('POST', '/api/users', { ...add, username: 'nv10', role: 'GOD' })).status, 400);
  const u = (await a.call('GET', '/api/users')).data.users.find((x) => x.username === 'nv9');
  assert.equal(u.must_change, true);
  assert.equal(u.role, 'STAFF');
});

test('quản lý tài khoản: không tự khóa/xóa, luôn còn một Admin hoạt động', async () => {
  const s = await asUser('ADMIN', 'admin');
  assert.equal((await s.call('PATCH', '/api/users/admin', { active: false })).status, 400);
  assert.equal((await s.call('DELETE', '/api/users/admin')).status, 400);
  assert.equal((await s.call('PATCH', '/api/users/admin', { role: 'STAFF' })).status, 400);
  assert.equal((await s.call('PATCH', '/api/users/admin', { key: s.deriveKey('admin', 'mat-khau-moi-99') })).status, 400);

  s.seedUser('admin2', 'ADMIN', PW);
  assert.equal((await s.call('PATCH', '/api/users/admin', { role: 'STAFF' })).status, 200); // vẫn còn admin2
  await s.call('POST', '/api/logout', {});
  await s.login('admin2', PW);
  assert.equal((await s.call('PATCH', '/api/users/admin2', { role: 'STAFF' })).status, 400); // admin2 là Admin cuối
});

test('Admin đặt lại mật khẩu: buộc đổi lại và đá người đó khỏi mọi phiên; khóa/xóa cũng đá phiên', async () => {
  const a = makeServer();
  a.seedUser('admin', 'ADMIN', PW);
  a.seedUser('nv1', 'STAFF', PW);
  await a.login('admin', PW);

  const nvCookie = (await a.login('nv1', PW, { cookie: '' })).headers.get('set-cookie').split(';')[0];
  assert.equal((await a.call('GET', '/api/me', undefined, { cookie: nvCookie })).status, 200);

  const reset = await a.call('PATCH', '/api/users/nv1', { key: a.deriveKey('nv1', 'mat-khau-tam-moi-5') });
  assert.equal(reset.status, 200);
  assert.equal((await a.call('GET', '/api/me', undefined, { cookie: nvCookie })).status, 401);
  assert.equal((await a.login('nv1', PW, { cookie: '' })).status, 401);
  const again = await a.login('nv1', 'mat-khau-tam-moi-5', { cookie: '' });
  assert.equal(again.data.user.must_change, true);

  const c2 = again.headers.get('set-cookie').split(';')[0];
  assert.equal((await a.call('PATCH', '/api/users/nv1', { active: false })).status, 200);
  assert.equal((await a.call('GET', '/api/me', undefined, { cookie: c2 })).status, 401);
  assert.equal((await a.call('DELETE', '/api/users/nv1')).status, 200);
  assert.equal((await a.call('DELETE', '/api/users/nv1')).status, 404);
});
