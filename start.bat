@echo off
chcp 65001 > nul
echo ========================================================
echo    DÚI FARM PRO - PHẦN MỀM QUẢN LÝ TRANG TRẠI DÚI v1.1
echo ========================================================
echo Đang khởi động máy chủ Web cục bộ...
echo Trình duyệt sẽ tự động mở tại: http://localhost:8080
echo (Nhấn Ctrl+C trong cửa sổ này nếu muốn dừng máy chủ)
echo ========================================================

start http://localhost:8080
python -m http.server 8080
pause

