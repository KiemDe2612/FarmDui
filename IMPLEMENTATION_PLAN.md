# KẾ HOẠCH TRIỂN KHAI NÂNG CẤP TOÀN DIỆN MOBILE-FIRST & TOUCH-FIRST
## Hệ thống Quản Lý Trang Trại Dúi (Dúi Farm Pro v1.1)

---

### 1. KẾT QUẢ KHẢO SÁT HIỆN TRẠNG SOURCE CODE

#### 1.1 Cấu trúc mã nguồn
- `index.html`: Cấu trúc HTML chính. Cần hoàn thiện bố cục theo đúng chuẩn mockup định hướng `Mobile_First_UI_Reference.png` (Dashboard 6 thẻ KPI + danh sách cảnh báo sự cố + công việc gần đây; Canvas sơ đồ chuồng với thanh công cụ trôi nổi + chip chọn khu vực; Bottom Sheet chi tiết chuồng; Danh sách thẻ cá thể có avatar, badge và lọc nhanh; Hồ sơ cá thể dạng Slide-Over 7 tabs; Bottom Navigation 5 mục).
- `css/style.css`: Hệ thống thiết kế CSS token, biến màu, hỗ trợ viewport 360px–430px, Safe Area iPhone, vùng chạm tối thiểu 44×44px, không cuộn ngang.
- `js/db.js`: Quản lý CSDL IndexedDB/LocalStorage, đảm bảo bảo toàn dữ liệu, phân quyền RBAC (ADMIN, MANAGER, STAFF, VIEWER), quy tắc chỉ có 2 loại sự cố (`OFF_FEED` và `DEATH`), lịch sử bất biến.
- `js/map.js`: Engine Canvas 2D Pointer Events (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`), 1-ngón Pan, 2-ngón Pinch-to-Zoom mượt mà quanh tâm chạm, phân biệt Single Tap với Drag, View Mode (an toàn cho Staff) vs Edit Mode (Admin/Manager).
- `js/app.js`: Bộ điều khiển trung tâm (Controller) gắn kết toàn bộ luồng giao diện, render dữ liệu dạng Card, Bottom Sheet, Animal Slide-Over 7 tabs, modal form tối ưu bàn phím di động.
- `js/search.js`: Công cụ tìm kiếm tiếng Việt không dấu, tìm mờ và từ đồng nghĩa thú y.
- `js/ai.js`: Trợ lý AI trang trại trả lời dựa trên CSDL thực tế, từ chối kê đơn thuốc kháng sinh bừa bãi.

#### 1.2 Những điểm nghẽn trên thiết bị di động cần giải quyết triệt để
1. **Sơ đồ chuồng (2D Farm Map):**
   - Phải có khả năng Pan 1 ngón tay và Pinch-to-Zoom 2 ngón tay mượt mà.
   - Nhân viên chuồng nuôi (Staff) chỉ ở Chế độ xem: khi chạm chọn chuồng hoặc di chuyển bản đồ, **tuyệt đối không được kéo xê dịch vị trí chuồng**.
   - Bấm chọn chuồng phải mở **Bottom Sheet** từ dưới lên (có mã chuồng, khu vực, trạng thái, sức chứa, số cá thể và danh sách cá thể có thể chạm mở ngay hồ sơ cá thể).
   - Vẽ ô chuồng trực quan: mã chuồng, icon giới tính, tỷ lệ cá thể (ví dụ: `2/4`), màu sắc kết hợp nhãn trạng thái rõ ràng.
2. **Dashboard:**
   - Cung cấp 6 thẻ KPI chính: Tổng cá thể, Tổng chuồng, Đang sử dụng, Chuồng trống, Sinh sản, Cách ly.
   - Danh sách cảnh báo nhanh: Dúi bỏ ăn (cần theo dõi), Dúi chết, Dúi mới sinh.
   - Thẻ "Công việc gần đây" với nút "+" thao tác nhanh.
3. **Danh sách cá thể:**
   - Chuyển đổi 100% sang dạng thẻ Card trên di động với avatar dúi, mã cá thể kèm ký hiệu `♂`/`♀`, chuồng, ngày sinh, cân nặng gần nhất, badge trạng thái và nút mũi tên mở chi tiết.
   - Bộ lọc tiện lợi dạng chips: Tất cả, Đực, Cái, Đang nuôi, Sinh sản, Cách ly.
4. **Hồ sơ cá thể đa tab (Slide-Over):**
   - Thiết kế dạng trang trượt toàn màn hình (Full-Screen Slide-Over) chia thành 7 tabs:
     1. Thông tin cơ bản
     2. Lịch sử chuồng
     3. Cân nặng
     4. Sinh sản
     5. Phả hệ
     6. Sức khỏe
     7. Nhật ký sự kiện

---

### 2. KẾ HOẠCH THỰC HIỆN 5 GIAI ĐOẠN (5 PHASES)

#### Giai đoạn 1: Khung Responsive & Bottom Navigation Cố Định
- Kiểm tra toàn bộ viewport 360×800, 375×812, 390×844, 430×932.
- Thanh Bottom Navigation 5 tab: Tổng quan, Sơ đồ, Cá thể, Sinh sản, Khác.
- Tích hợp Safe Area Insets trên iPhone (`env(safe-area-inset-bottom)`).
- Vùng chạm tối thiểu đạt $\ge 44 \times 44\text{px}$.

#### Giai đoạn 2: Farm Map 2D Touch-First (Ưu tiên cao nhất)
- Cập nhật `FarmMapEditor` trong `js/map.js`:
  - Pointer Events: `pointerdown`, `pointermove`, `pointerup`, `pointercancel`, `touch-action: none`.
  - Hỗ trợ Pan 1 ngón, Pinch-to-zoom 2 ngón tập trung vào tâm chụm.
  - Ngưỡng phân biệt Single Tap ($< 350\text{ms}, < 8\text{px}$) với Drag.
  - Vẽ ô chuồng đẹp mắt: Mã chuồng, icon giới tính, tỷ lệ cá thể (`num/capacity`), màu trạng thái.
  - Tách Chế độ Xem (View Mode) và Chế độ Chỉnh sửa (Edit Mode).
  - Bottom Sheet chuồng trượt mượt mà từ cạnh dưới, có nút "Chi tiết chuồng", "Xem cá thể".

#### Giai đoạn 3: Dashboard Mobile Cards & Hồ Sơ Cá Thể 7 Tabs
- Dashboard:
  - 6 thẻ KPI (Tổng cá thể, Tổng chuồng, Đang dùng, Trống, Sinh sản, Cách ly).
  - 3 dòng cảnh báo sự cố (Bỏ ăn, Chết, Mới sinh) có thể bấm chuyển tab ngay.
  - Công việc gần đây với nút thêm nhanh.
- Danh sách cá thể:
  - Thẻ Card với avatar dúi, mã định danh, giới tính, chuồng, cân nặng, trạng thái.
  - Chip lọc: Tất cả, Đực, Cái, Đang nuôi, Sinh sản, Cách ly.
- Hồ sơ chi tiết cá thể:
  - Trượt toàn màn hình (Slide-Over).
  - 7 tabs: Thông tin, Lịch sử chuồng, Cân nặng, Sinh sản, Phả hệ, Sức khỏe, Nhật ký sự kiện.

#### Giai đoạn 4: Sức Khỏe & Nhật Ký Sự Cố
- Form ghi nhận trên di động: Dúi bỏ ăn (`OFF_FEED`) và Dúi chết (`DEATH`).
- Dropdown chọn cá thể, thời điểm phát hiện, triệu chứng quan sát, xử lý ban đầu.
- Ghi nhận theo dõi (Follow-up) và đóng ca sự cố (`CLOSED`).

#### Giai đoạn 5: Offline, Phân Quyền & Bàn Giao
- Trạng thái trực tuyến / ngoại tuyến (Online/Offline indicator).
- Quản lý hàng đợi đồng bộ và báo cáo giới hạn đồng bộ đa thiết bị.
- Phân quyền RBAC (Admin, Manager, Staff, Viewer).
- Tạo tài liệu bàn giao `ANTIGRAVITY_HANDOFF.md`.

---

### 3. MA TRẬN KIỂM THỬ THIẾT BỊ & VIEWPORT
| Viewport | Thiết bị đại diện | Yêu cầu đạt |
|---|---|---|
| 360 × 800 | Samsung Galaxy A series, Android phổ thông | Không cuộn ngang, nút bấm $\ge 44\text{px}$, sơ đồ mượt |
| 375 × 812 | iPhone X / 11 Pro / 12 Mini | Safe area đáy, thanh tab nổi không che nội dung |
| 390 × 844 | iPhone 12 / 13 / 14 / 15 | Bố cục thẻ 2 cột cân đối, Bottom Sheet trượt mượt |
| 430 × 932 | iPhone 14 / 15 / 16 Pro Max | Tận dụng chiều rộng tối đa, cỡ chữ rõ nét |
| 768 × 1024 | iPad / Tablet Android | Co giãn linh hoạt, không vỡ layout |
| Desktop | Laptop / PC màn hình rộng | Chuột wheel pan/zoom bình thường, giữ thanh điều hướng |

