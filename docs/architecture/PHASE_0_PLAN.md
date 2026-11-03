# Kế Hoạch Triển Khai Kỹ Thuật (Phase 0 Planning) – Farm Management Web App v1.1

> **Quy tắc bắt buộc:** Theo chỉ dẫn `09_ANTIGRAVITY_MASTER_PROMPT.md`, việc lập trình thực tế sẽ chỉ bắt đầu sau khi Chủ dự án (Project Owner) xem xét và phê duyệt các quyết định kiến trúc, mô hình dữ liệu (ERD/Schema) và lộ trình triển khai.

---

## 1. Đánh Giá Hiện Trạng Repository & Môi Trường

- **Workspace:** `d:\Quản Lí Dúi` (ban đầu trống).
- **Môi trường cục bộ:**
  - Node.js: `v24.17.0`
  - npm: `11.13.0`
  - Git: `2.55.0` (đã khởi tạo Git repo và `.gitignore`).
- **Tài liệu nguồn:** Đã sao chép đầy đủ 11 tài liệu đặc tả chuẩn vào `docs/spec/`.

---

## 2. Cấu Trúc Monorepo Đề Xuất (npm workspaces)

Kiến trúc **Modular Monolith** nhằm đơn giản hóa quản lý code, tái sử dụng DTO/types giữa client và server:

```text
/
├── apps/
│   ├── web/                     # Next.js 14+ (App Router, Tailwind CSS, shadcn/ui, Konva.js, Dexie PWA)
│   └── api/                     # NestJS Modular Monolith REST API (/api/v1)
├── packages/
│   ├── shared-types/            # TypeScript interfaces, enums, DTOs dùng chung
│   ├── api-client/              # Fetch/Axios client có typing đầy đủ cho Frontend
│   └── domain/                  # Validation rules, tính toán phả hệ, hằng số nghiệp vụ
├── prisma/                      # Prisma schema, migrations, seed data
├── docs/                        # Tài liệu đặc tả và ADR (Architecture Decision Records)
│   ├── spec/                    # Bộ 11 file đặc tả gốc
│   └── architecture/
├── docker/                      # Dockerfile, docker-compose.yml (Postgres, pgvector, app)
├── package.json                 # Root monorepo workspace configuration
└── tsconfig.base.json           # Base TypeScript config
```

---

## 3. Quyết Định Kiến Trúc CSDL & ERD (Prisma / PostgreSQL)

Mô hình dữ liệu tuân thủ nghiêm ngặt các **Core Invariants**:
1. **Animal Identity vs Pen Location:**
   - Bảng `animals`: mang UUID nội bộ và `animal_code` duy nhất (ví dụ `D001`). Không lưu trực tiếp `pen_id` cứng vào `animals`.
   - Bảng `pen_assignments`: quản lý vị trí theo thời gian. Ràng buộc: `unique_active_assignment_per_animal` (mỗi con vật tại một thời điểm chỉ có tối đa 1 bản ghi có `end_at IS NULL`).
2. **Sơ đồ chuồng 2D (Farm Map):**
   - Bảng `farm_maps` và `farm_map_revisions`: lưu `document_json` theo từng version (undo/redo, khôi phục lịch sử).
   - Di chuyển block trên Canvas chỉ cập nhật `document_json` của bản đồ, tuyệt đối không ảnh hưởng đến vị trí thực tế của dúi trong chuồng.
3. **Phả hệ & Sinh sản:**
   - `mother_id` và `father_id` trên bảng `animals` là quan hệ cha mẹ chuẩn; kiểm tra ràng buộc không tự làm cha mẹ chính mình (`mother_id != id`) và không tạo chu trình huyết thống.
   - Quản lý lứa đẻ qua `litters` và `litter_members` (hỗ trợ con non mang nhãn tạm trước khi cấp mã ID chính thức).
4. **Nhật ký sự cố chỉ đúng 2 loại:**
   - Enum `IncidentType`: `OFF_FEED` và `DEATH`.
   - Sự kiện `DEATH` bắt buộc thực hiện trong 1 Transaction: Cập nhật status của `animals` = `DECEASED`, cập nhật `pen_assignments` tương ứng có `end_at = NOW()`, tạo audit log.
5. **Thư viện thuốc:** Bảng `medicines` chỉ là danh mục thông tin tham khảo; không có bảng kho/nhập xuất.
6. **Lịch sử bất biến:** Tuyệt đối không xóa vật lý (no hard delete) các bản ghi `animal_weights`, `treatment_records`, `animal_events`, `pen_assignments`.

---

## 4. Lộ Trình Triển Khai Từng Milestone

| Milestone | Tên Milestone | Nội dung chính |
|---|---|---|
| **M1** | Foundation & Monorepo Setup | Khởi tạo npm monorepo (`apps/web`, `apps/api`, `packages/shared-types`), cấu hình TypeScript, ESLint, Tailwind, shadcn/ui. |
| **M2** | Database & Prisma Setup | Thiết kế schema Prisma đầy đủ, tạo migration đầu tiên, seed dữ liệu mẫu (synthetic test data). |
| **M3** | Core Backend API & Auth | Triển khai NestJS auth/RBAC, module Pens, Animals, PenAssignments với Transaction an toàn. |
| **M4** | Farm Map 2D (Konva.js) | Canvas 2D: Grid/Free mode, kéo thả block chuồng, zoom/pan, lưu revision JSON, liên kết ID chuồng. |
| **M5** | Sinh sản, Tách đàn & Phả hệ | Module phối giống, lứa đẻ (`litters`), workflow cấp ID cá thể con, biểu đồ phả hệ cây gia phả. |
| **M6** | Sức khỏe, Thuốc & Sự cố | Quản lý bệnh án, thư viện thuốc tham khảo, sự cố `OFF_FEED` và `DEATH` (kèm transaction khóa chuồng). |
| **M7** | PWA & Offline Sync | Dexie.js local outbox, service worker, sync coordinator giải quyết xung đột khi có mạng lại. |
| **M8** | Tìm kiếm tiếng Việt & AI RAG | PostgreSQL Full-text search không dấu/fuzzy; Trợ lý AI hỗ trợ tra cứu thông tin trang trại có căn cứ. |
| **M9** | QA, Hardening & Dockerize | Dockerfile, docker-compose hoàn chỉnh, chạy toàn bộ bộ test `07_ACCEPTANCE_TESTS.md`. |

