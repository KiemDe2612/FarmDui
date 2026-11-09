// Tạo file SQL nạp các tài khoản ban đầu với mật khẩu tạm ngẫu nhiên (bắt buộc đổi khi đăng nhập lần đầu).
// Dùng: node scripts/make-seed.mjs   ->  db/seed-users.local.sql  (không đưa lên git)
// Mật khẩu tạm chỉ in ra màn hình MỘT lần. Chạy lại sẽ sinh mật khẩu mới, hãy dùng --replace nếu muốn ghi đè tài khoản đã có.
import { pbkdf2Sync, randomBytes, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const USERS = [
  { username: 'long', display_name: 'Long', role: 'ADMIN' },
  { username: 'giang', display_name: 'Anh Giang', role: 'MANAGER' },
  { username: 'huy', display_name: 'Chú Huy', role: 'MANAGER' },
  { username: 'tuan', display_name: 'Anh Tuấn', role: 'MANAGER' }
];
const replace = process.argv.includes('--replace');
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRTUVWXY346789';
const rand = (n) => [...randomBytes(n)].map((b) => ALPHABET[b % ALPHABET.length]).join('');
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// Phải khớp với public/js/auth.js (deriveKey) và worker/index.js (passwordHash)
const deriveKey = (username, password) => pbkdf2Sync(password, 'duifarm|' + username, 150000, 32, 'sha256').toString('base64');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

const lines = [];
const shown = [];
for (const u of USERS) {
  const password = 'Dui-' + rand(6);
  const salt = randomBytes(16).toString('hex');
  const hash = sha256(`${salt}:${deriveKey(u.username, password)}`);
  lines.push(
    `INSERT OR ${replace ? 'REPLACE' : 'IGNORE'} INTO users (username, display_name, role, active, must_change, salt, hash, created_at) VALUES (${q(u.username)}, ${q(u.display_name)}, ${q(u.role)}, 1, 1, ${q(salt)}, ${q(hash)}, ${q(new Date().toISOString())});`
  );
  shown.push({ 'Tên đăng nhập': u.username, 'Họ tên': u.display_name, 'Vai trò': u.role, 'Mật khẩu tạm': password });
}
writeFileSync(new URL('../db/seed-users.local.sql', import.meta.url), lines.join('\n') + '\n', 'utf8');
console.table(shown);
console.log(replace ? 'Chế độ --replace: ghi đè tài khoản đã có.' : 'Tài khoản đã tồn tại sẽ được giữ nguyên (mật khẩu tạm ở trên chỉ có tác dụng với tài khoản mới).');
