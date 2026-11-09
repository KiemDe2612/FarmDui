@echo off
chcp 65001 > nul
echo ========================================================
echo    DUI FARM PRO - CHAY THU TREN MAY (Cloudflare Worker + D1 local)
echo ========================================================
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Tai tai https://nodejs.org roi chay lai.
  pause
  exit /b 1
)
if not exist node_modules call npm install
if not exist db\seed-users.local.sql node scripts\make-seed.mjs
call npx wrangler d1 execute farmdui65 --local --file=db/schema.sql > nul
call npx wrangler d1 execute farmdui65 --local --file=db/seed-users.local.sql > nul
echo Mo trinh duyet tai: http://localhost:8787  (Ctrl+C de dung)
start http://localhost:8787
call npx wrangler dev --port 8787
pause
