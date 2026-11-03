# 01 – PRODUCT REQUIREMENTS

## 1. Product vision
Farm Management là Web App quản lý vận hành chăn nuôi dúi, tập trung vào sơ đồ chuồng, hồ sơ cá thể, vòng đời, sinh sản, sức khỏe và tra cứu dữ liệu.

## 2. Quy mô và người dùng
- Quy mô ban đầu: 50–200 cá thể.
- Một cá thể có một mã hiển thị duy nhất, ví dụ `D001`.
- Hệ thống thiết kế để có thể mở rộng nhiều khu/trại sau này, nhưng không over-engineer.
- Vai trò: Admin, Manager, Staff, Viewer.
- Responsive cho desktop, tablet và mobile.

## 3. Module trong phạm vi
### 3.1 Dashboard
- Tổng cá thể đang nuôi.
- Số lượng đực/cái/chưa xác định.
- Số chuồng đang sử dụng/trống/cách ly/sinh sản.
- Cá thể mới sinh.
- Cá thể cần xác định giới tính hoặc theo dõi.
- Ca bỏ ăn đang mở.
- Số cá thể chết trong khoảng thời gian chọn.
- Cá thể đang có bệnh án/điều trị.

### 3.2 Farm Map 2D
- Canvas 2D có pan/zoom.
- Hai chế độ: Grid và Free Canvas.
- Block: PEN, PATH, ZONE, STORAGE (chỉ block khu vực/kho vật lý trên sơ đồ, không phải quản lý tồn kho), NOTE, CUSTOM.
- Kéo thả, resize, rotate, duplicate, delete, multi-select, group, layer.
- Snap-to-grid tùy chọn, căn chỉnh, undo/redo.
- Chọn block chuồng để mở hồ sơ chuồng và danh sách cá thể.
- Pen identity không phụ thuộc tọa độ hoặc vị trí trên bản đồ.
- Lưu revision, xem lịch sử và khôi phục bản đồ.
- Export JSON, SVG, PNG, PDF.
- Import JSON/SVG; hỗ trợ ảnh/PDF qua quy trình nhận dạng có bước xác nhận.
- Nhận dạng sơ đồ không được tự khẳng định loại đối tượng; hiển thị confidence và yêu cầu người dùng xác nhận.

### 3.3 Quản lý chuồng
- Mã chuồng duy nhất, tên, khu vực, trạng thái, sức chứa do Admin thiết lập, ghi chú.
- Trạng thái ví dụ: ACTIVE, EMPTY, QUARANTINE, BREEDING, INACTIVE.
- Không có quản lý hư hỏng chuồng hoặc bảo trì cơ sở vật chất.

### 3.4 Hồ sơ cá thể
- ID nội bộ UUID và mã hiển thị duy nhất, không tái sử dụng.
- Tên gọi tùy chọn, giới tính MALE/FEMALE/UNKNOWN.
- Ngày sinh và độ chính xác: EXACT/ESTIMATED/UNKNOWN.
- Nguồn gốc: BORN/PURCHASED/OTHER.
- Bố/mẹ nếu biết.
- Trạng thái vòng đời: ACTIVE, SOLD, DECEASED, TRANSFERRED_OUT, MISSING (nếu chủ dự án duyệt).
- Ảnh, ghi chú.
- Lịch sử chuồng, cân nặng, sinh sản, sức khỏe, sự kiện vòng đời.
- Không xóa vật lý hồ sơ cá thể đã có nghiệp vụ.

### 3.5 Cân nặng
- Ghi từng lần cân: animal, measured_at, weight, unit, recorded_by, note.
- Vẽ biểu đồ theo cá thể.
- Không suy diễn chuẩn tăng trưởng nếu chưa có dữ liệu/nguồn được phê duyệt.

### 3.6 Sinh sản và tách đàn
- Ghi nhận phối giống nếu người dùng muốn theo dõi.
- Ghi nhận sự kiện sinh: mẹ, bố nếu biết, ngày sinh, số con sinh, số con sống/chết, từng cá thể con nếu đã tạo ID.
- Quản lý litter và thành viên đàn.
- Ghi nhận ngày tách, nhóm đực/cái/chưa xác định, chuồng đích và người thực hiện.
- Giữ liên kết phả hệ dù cá thể chuyển chuồng.
- Không tự đưa lịch sinh sản/tách đàn cố định nếu không có quy trình được chủ trại xác nhận.

### 3.7 Phả hệ
- Xem bố mẹ, anh chị em, con và các thế hệ.
- Cảnh báo quan hệ huyết thống gần khi có đủ dữ liệu.
- Không tự suy đoán bố/mẹ.
- Chặn quan hệ phả hệ vòng lặp và tự tham chiếu.

### 3.8 Sức khỏe, bệnh án, thuốc tham khảo và điều trị
- Ghi nhận cá thể, thời điểm, triệu chứng quan sát, mức độ, chẩn đoán (nghi ngờ/xác nhận), người ghi.
- Danh mục thuốc chỉ là thư viện tham khảo, không có kho thuốc, tồn kho, nhập/xuất.
- Lưu hoạt chất, tên thương mại, nguồn/tài liệu, ghi chú, cảnh báo và chống chỉ định nếu có nguồn.
- Ghi lịch sử thuốc đã sử dụng trong từng lần điều trị.
- Theo dõi tái khám/kết quả.
- Phân biệt kinh nghiệm nội bộ, thông tin tham khảo và chỉ định thú y.
- AI không tự kê liều, đặc biệt thuốc tiêm/kháng sinh; yêu cầu xác nhận của bác sĩ thú y khi cần.

### 3.9 Nhật ký sự cố – chỉ hai loại
A. `OFF_FEED` – dúi bỏ ăn:
- animal_id, detected_at, pen_id, biểu hiện quan sát, mức độ/khả năng ăn, quan sát uống nước nếu có, người ghi, hành động đã thực hiện, follow-up, kết quả.
- Có thể liên kết health_record.
- Ca bỏ ăn được đóng khi người có quyền ghi nhận kết quả.

B. `DEATH` – dúi chết:
- animal_id, detected_at, last_pen_id, tình trạng trước đó, nguyên nhân nghi ngờ/đã xác nhận/chưa rõ, người ghi, ghi chú/ảnh.
- Khi xác nhận chết: chuyển trạng thái cá thể thành DECEASED, đóng assignment chuồng đang hiệu lực, giữ lịch sử, cập nhật dashboard và audit log.
- Không xóa hồ sơ cá thể.

### 3.10 Tìm kiếm
- Exact, case-insensitive, không dấu tiếng Việt, fuzzy, synonym, semantic và tìm đa module.
- Ví dụ `tieu chay`, `tiêu chảy`, `đi phân lỏng` có thể tìm hồ sơ liên quan nếu synonym/index đã cấu hình.
- Hiển thị kết quả có loại dữ liệu, mã, snippet và link mở hồ sơ.
- Không được chỉ dựa vào SQL LIKE.
- Tìm kiếm phải tôn trọng quyền truy cập.

### 3.11 AI Farm Assistant
- Truy vấn dữ liệu trại bằng tiếng Việt tự nhiên.
- Trả lời dựa trên dữ liệu có thật, nêu nguồn/bản ghi liên quan.
- RAG trên tài liệu do Admin tải lên và phê duyệt.
- Tách bạch dữ liệu nội bộ, tài liệu chuyên môn, suy luận và thông tin chưa xác minh.
- Chỉ đọc mặc định; thao tác ghi cần quyền và xác nhận riêng.
- Không sinh hồ sơ, chẩn đoán, nguyên nhân chết hoặc phác đồ điều trị không có căn cứ.

## 4. Ngoài phạm vi – không triển khai
- Quản lý thức ăn/khẩu phần/tiêu thụ thức ăn.
- Quản lý kho vật tư.
- Quản lý kho thuốc, lô thuốc, tồn kho, nhập/xuất.
- Báo cáo hư hỏng chuồng.
- Nhật ký thay đổi thức ăn.
- Nhật ký thay đổi môi trường.
- Sự cố điện/nước.
- Quản lý bảo trì cơ sở vật chất.
- Quản lý tài chính/bán hàng/khách hàng trong phiên bản này.

## 5. Quy tắc dữ liệu cốt lõi
- Animal ID là danh tính; Pen ID là vị trí; farm map block là hình học hiển thị.
- Một cá thể chỉ có tối đa một pen assignment đang hiệu lực tại cùng thời điểm.
- Di chuyển block không làm đổi pen_id hoặc animal_id.
- Mọi sự kiện quan trọng có timestamp, actor và audit trail.
- Không ghi đè lịch sử sinh sản, điều trị, cân nặng, chuyển chuồng.
- Dữ liệu quan trọng cần hỗ trợ offline và đồng bộ có kiểm soát.
