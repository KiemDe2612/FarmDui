# FARM MANAGEMENT – AGENT DEVELOPMENT PACK v1.1

Bộ tài liệu hướng dẫn Claude và Google Antigravity phát triển hệ thống quản lý trang trại dúi.

## 1. Mục tiêu
Xây dựng Web App quản lý trang trại dúi quy mô dự kiến 50–200 cá thể, quản lý từng cá thể bằng ID riêng, có sơ đồ chuồng 2D, sinh sản, phả hệ, sức khỏe, nhật ký dúi bỏ ăn/dúi chết, tìm kiếm tiếng Việt, AI Assistant và chế độ offline.

## 2. Quyết định đã chốt
- Quản lý từng cá thể: mỗi con có ID riêng.
- Quy mô ban đầu: 50–200 cá thể.
- Cloud-first, có thể ghi dữ liệu khi offline và đồng bộ lại.
- Backend kiến trúc Modular Monolith.
- Sơ đồ 2D hỗ trợ Grid và Free Canvas.
- Animal ID là danh tính; Pen ID là vị trí; lịch sử là các sự kiện bất biến.
- Không quản lý thức ăn, kho vật tư, kho thuốc hoặc nhập/xuất/tồn.
- Nhật ký sự cố chỉ gồm: dúi bỏ ăn và dúi chết.

## 3. Đọc tài liệu theo thứ tự
1. `01_PRODUCT_REQUIREMENTS.md`
2. `02_SYSTEM_ARCHITECTURE.md`
3. `03_DATABASE_SPEC.md`
4. `04_API_CONTRACT.md`
5. `05_AGENT_WORK_ASSIGNMENTS.md`
6. `06_OFFLINE_SYNC_SPEC.md`
7. `07_ACCEPTANCE_TESTS.md`
8. `08_CLAUDE_MASTER_PROMPT.md` hoặc `09_ANTIGRAVITY_MASTER_PROMPT.md`

## 4. Hướng dẫn sử dụng
- Claude: mở repository/project, đưa `08_CLAUDE_MASTER_PROMPT.md` làm chỉ dẫn dự án; yêu cầu Claude đọc toàn bộ tài liệu trước khi sửa code.
- Antigravity: mở workspace, đưa `09_ANTIGRAVITY_MASTER_PROMPT.md` vào agent task; yêu cầu agent lập kế hoạch và kiểm tra workspace trước khi code.
- Không yêu cầu agent tạo toàn bộ sản phẩm trong một lần.
- Bắt đầu bằng Sprint 0: kiểm tra repository và tạo các tài liệu kiến trúc/contract.
- Chỉ triển khai sau khi chủ dự án duyệt kiến trúc và schema.

## 5. Lưu ý
Đây là đặc tả kỹ thuật ban đầu, chưa phải chẩn đoán thú y. Dữ liệu bệnh, điều trị và thuốc phải được ghi nhận có nguồn; AI không được tự đề xuất liều tiêm hoặc phác đồ điều trị khi chưa có chỉ định chuyên môn.
