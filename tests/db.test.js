import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer, load, CLIENT } from './helpers.js';

const PW = 'mat-khau-tam-1';

async function boot(role = 'ADMIN') {
  const server = makeServer();
  const ctx = load([CLIENT.auth, CLIENT.db], server);
  const name = role.toLowerCase();
  server.seedUser(name, role, PW);
  await ctx.window.farmAuth.login(name, PW);
  return { ctx, db: ctx.window.farmDB };
}

test('chưa đăng nhập thì chỉ là VIEWER và không ghi được', () => {
  const ctx = load([CLIENT.auth, CLIENT.db], makeServer());
  const db = ctx.window.farmDB;
  assert.equal(db.getCurrentUser().role, 'VIEWER');
  assert.equal(db.canEditMap(), false);
  assert.throws(() => db.addWeight(db.getAnimals()[0].id, 1.2), /Viewer/);
});

test('Staff ghi được cân nặng nhưng không sửa được sơ đồ, nhập hay đặt lại dữ liệu', async () => {
  const { db } = await boot('STAFF');
  const a = db.getAnimals()[0];
  db.addWeight(a.id, 1.5, 'kg', 'test');
  assert.equal(db.canEditMap(), false);
  assert.throws(() => db.saveFarmMap({ blocks: [] }), /Quyền bị từ chối/);
  assert.throws(() => db.resetToDefault(), /chỉ Admin/);
  assert.throws(() => db.importDataJSON('{}'), /chỉ Admin/);
});

test('Viewer không tạo được sự cố, lứa đẻ hay bệnh án', async () => {
  const { db } = await boot('VIEWER');
  const a = db.getAnimals()[0];
  assert.throws(() => db.createIncident({ incident_type: 'OFF_FEED', animal_id: a.id, symptoms_observed: 'x', severity_level: 'LOW', actions_taken: '', recorded_by: 'v' }), /Viewer/);
  assert.throws(() => db.createHealthRecord({ animal_id: a.id, diagnosis_text: 'x' }), /Viewer/);
});

test('sự cố DEATH đổi trạng thái cá thể', async () => {
  const { db } = await boot('ADMIN');
  const a = db.getAnimals().find((x) => x.status === 'ACTIVE');
  db.createIncident({ incident_type: 'DEATH', animal_id: a.id, symptoms_observed: 'x', severity_level: 'HIGH', actions_taken: '', recorded_by: 'admin' });
  assert.notEqual(db.getAnimalById(a.id).status, 'ACTIVE');
});

test('import: file sai cấu trúc bị từ chối và dữ liệu cũ được giữ nguyên', async () => {
  const { db } = await boot('ADMIN');
  const before = db.getAnimals().length;
  assert.throws(() => db.importDataJSON('{"animals": 1}'), /không đúng cấu trúc/);
  assert.throws(() => db.importDataJSON('không phải json'), /Không thể đọc/);
  assert.equal(db.getAnimals().length, before);
});

test('export rồi import lại cho cùng dữ liệu, và export không chứa tài khoản', async () => {
  const { db } = await boot('ADMIN');
  const json = db.exportDataJSON();
  assert.ok(!json.includes('"salt"') && !json.includes('"hash"'));
  const n = db.getAnimals().length;
  db.importDataJSON(json);
  assert.equal(db.getAnimals().length, n);
  assert.ok(db.data.last_backup_at);
});

test('dữ liệu hỏng trên máy được giữ lại một bản trước khi nạp dữ liệu mẫu', () => {
  const ctx = load([CLIENT.auth, CLIENT.db], makeServer(), { FARM_MANAGEMENT_DATA_V1: '{hỏng' });
  const db = ctx.window.farmDB;
  assert.ok(db.loadWarning && db.loadWarning.includes('_CORRUPT_'));
  assert.equal(ctx.window.localStorage.getItem(db.loadWarning), '{hỏng');
  assert.ok(db.getAnimals().length > 0);
});

test('ghi bộ nhớ máy lỗi thì persist trả false và phát sự kiện', async () => {
  const { ctx, db } = await boot('ADMIN');
  let fired = false;
  ctx.window.dispatchEvent = () => { fired = true; return true; };
  ctx.window.localStorage.setItem = () => { throw new Error('QuotaExceeded'); };
  assert.equal(db.persist(), false);
  assert.equal(fired, true);
});

test('persist báo cho bộ đồng bộ biết có thay đổi', async () => {
  const { ctx, db } = await boot('ADMIN');
  let marked = 0;
  ctx.window.farmSync = { markDirty: () => { marked++; } };
  db.addWeight(db.getAnimals()[0].id, 1.1, 'kg', 't');
  assert.ok(marked >= 1);
});

test('cận huyết 3 đời: bố-con, anh em, chú-cháu và quan hệ xa', async () => {
  const { db } = await boot('ADMIN');
  const mk = (id, sex, father, mother) => ({ id, animal_code: id, sex, status: 'ACTIVE', father_id: father || null, mother_id: mother || null });
  db.data.animals = [
    mk('G1', 'MALE'), mk('G2', 'FEMALE'),
    mk('F', 'MALE', 'G1', 'G2'), mk('U', 'MALE', 'G1', 'G2'),
    mk('D', 'FEMALE', 'F', null),
    mk('S', 'FEMALE', 'G1', 'G2'),
    mk('N', 'FEMALE', 'U', null),
    mk('X', 'FEMALE'),
    mk('GD', 'FEMALE', 'D', null)
  ];
  assert.equal(db.checkInbreedingRisk('F', 'D').risk, 'EXTREME');
  assert.equal(db.checkInbreedingRisk('F', 'S').risk, 'HIGH');
  assert.equal(db.checkInbreedingRisk('F', 'N').risk, 'HIGH');
  assert.equal(db.checkInbreedingRisk('F', 'GD').risk, 'HIGH');
  assert.equal(db.checkInbreedingRisk('F', 'X').risk, 'LOW');
  assert.equal(db.checkInbreedingRisk('F', 'F').risk, 'HIGH');
});

test('mã audit không trùng nhau khi ghi liên tiếp', async () => {
  const { db } = await boot('ADMIN');
  for (let i = 0; i < 20; i++) db.logAudit('t', 'X', String(i));
  const ids = db.getAuditLogs().map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
});
