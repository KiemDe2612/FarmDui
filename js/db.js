/**
 * Database & State Management Engine (IndexedDB + LocalStorage Fallback)
 * Tuân thủ đúng các Core Invariants của Farm Management v1.1:
 * - Animal ID là danh tính; Pen ID là vị trí; Map block là hình học.
 * - Một cá thể chỉ có tối đa một pen_assignment đang hiệu lực (end_at === null).
 * - Không xóa vật lý dữ liệu lịch sử.
 * - Chỉ cho phép 2 loại sự cố: OFF_FEED và DEATH.
 * - Khi ghi nhận DEATH: chuyển status thành DECEASED, đóng pen_assignment active.
 */

const DB_KEY = 'FARM_MANAGEMENT_DATA_V1';
const PEN_STATUSES = ['ACTIVE', 'BREEDING', 'QUARANTINE', 'EMPTY', 'DISABLED'];
const MAX_MAP_REVISIONS = 10;

const INITIAL_SEED = {
  farms: [
    { id: 'f1', farm_code: 'F01', name: 'Trại Dúi Mẫu Việt Nam', timezone: 'Asia/Ho_Chi_Minh', status: 'ACTIVE' }
  ],
  zones: [
    { id: 'z1', farm_id: 'f1', zone_code: 'KHU_A', name: 'Khu Sinh Sản & Nuôi Con', status: 'ACTIVE' },
    { id: 'z2', farm_id: 'f1', zone_code: 'KHU_B', name: 'Khu Hậu Bị & Dúi Thịt', status: 'ACTIVE' }
  ],
  pens: [
    { id: 'pen-1', farm_id: 'f1', zone_id: 'z1', pen_code: 'A01', name: 'Chuồng Sinh Sản 1', status: 'BREEDING', capacity: 2, notes: 'Chuồng gạch men 50x50cm' },
    { id: 'pen-2', farm_id: 'f1', zone_id: 'z1', pen_code: 'A02', name: 'Chuồng Nuôi Con 2', status: 'ACTIVE', capacity: 6, notes: 'Chuồng ghép đẻ' },
    { id: 'pen-3', farm_id: 'f1', zone_id: 'z1', pen_code: 'A03', name: 'Chuồng Đực Giống 1', status: 'ACTIVE', capacity: 1, notes: 'Đực giống tuyển' },
    { id: 'pen-4', farm_id: 'f1', zone_id: 'z1', pen_code: 'A04', name: 'Chuồng Trống 4', status: 'EMPTY', capacity: 1, notes: 'Đã sát trùng sạch sẽ' },
    { id: 'pen-5', farm_id: 'f1', zone_id: 'z2', pen_code: 'B01', name: 'Chuồng Hậu Bị 1', status: 'ACTIVE', capacity: 2, notes: 'Theo dõi tăng trưởng' },
    { id: 'pen-6', farm_id: 'f1', zone_id: 'z2', pen_code: 'B02', name: 'Chuồng Hậu Bị 2', status: 'ACTIVE', capacity: 2, notes: 'Dúi tơ 5 tháng tuổi' },
    { id: 'pen-7', farm_id: 'f1', zone_id: 'z2', pen_code: 'B03', name: 'Chuồng Cách Ly', status: 'QUARANTINE', capacity: 1, notes: 'Dành riêng cho cá thể ốm/theo dõi' }
  ],
  animals: [
    {
      id: 'an-1',
      animal_code: 'D001',
      name: 'Đực Cồ A1',
      species: 'Dúi Mốc Lớn',
      sex: 'MALE',
      date_of_birth: '2025-02-15',
      birth_date_precision: 'EXACT',
      origin_type: 'PURCHASED',
      status: 'ACTIVE',
      father_id: null,
      mother_id: null,
      notes: 'Đực giống khỏe mạnh, dáng to, ăn khỏe',
      created_at: '2025-05-01T08:00:00Z',
      version: 1
    },
    {
      id: 'an-2',
      animal_code: 'D002',
      name: 'Cái Hoa A2',
      species: 'Dúi Mốc Lớn',
      sex: 'FEMALE',
      date_of_birth: '2025-03-10',
      birth_date_precision: 'EXACT',
      origin_type: 'PURCHASED',
      status: 'ACTIVE',
      father_id: null,
      mother_id: null,
      notes: 'Cái tơ, đã phối giống thành công 1 lứa',
      created_at: '2025-05-01T08:00:00Z',
      version: 1
    },
    {
      id: 'an-3',
      animal_code: 'D003',
      name: 'Cái Mộng A3',
      species: 'Dúi Mốc Lớn',
      sex: 'FEMALE',
      date_of_birth: '2025-01-20',
      birth_date_precision: 'EXACT',
      origin_type: 'BORN',
      status: 'ACTIVE',
      father_id: null,
      mother_id: null,
      notes: 'Đang nuôi con lứa 1',
      created_at: '2025-05-01T08:00:00Z',
      version: 1
    },
    {
      id: 'an-4',
      animal_code: 'D004',
      name: 'Dúi Con 1 (Lứa A)',
      species: 'Dúi Mốc Lớn',
      sex: 'MALE',
      date_of_birth: '2026-08-10',
      birth_date_precision: 'EXACT',
      origin_type: 'BORN',
      status: 'ACTIVE',
      father_id: 'an-1',
      mother_id: 'an-3',
      notes: 'Con của D001 x D003',
      created_at: '2026-08-10T09:00:00Z',
      version: 1
    },
    {
      id: 'an-5',
      animal_code: 'D005',
      name: 'Dúi Con 2 (Lứa A)',
      species: 'Dúi Mốc Lớn',
      sex: 'FEMALE',
      date_of_birth: '2026-08-10',
      birth_date_precision: 'EXACT',
      origin_type: 'BORN',
      status: 'ACTIVE',
      father_id: 'an-1',
      mother_id: 'an-3',
      notes: 'Con của D001 x D003',
      created_at: '2026-08-10T09:00:00Z',
      version: 1
    },
    {
      id: 'an-6',
      animal_code: 'D006',
      name: 'Hậu Bị B1',
      species: 'Dúi Má Đào',
      sex: 'FEMALE',
      date_of_birth: '2026-01-15',
      birth_date_precision: 'ESTIMATED',
      origin_type: 'PURCHASED',
      status: 'ACTIVE',
      father_id: null,
      mother_id: null,
      notes: 'Má đào giống chuẩn',
      created_at: '2026-03-01T08:00:00Z',
      version: 1
    },
    {
      id: 'an-7',
      animal_code: 'D007',
      name: 'Hậu Bị B2',
      species: 'Dúi Má Đào',
      sex: 'MALE',
      date_of_birth: '2026-01-20',
      birth_date_precision: 'ESTIMATED',
      origin_type: 'PURCHASED',
      status: 'ACTIVE',
      father_id: null,
      mother_id: null,
      notes: 'Đang theo dõi ca bỏ ăn nhẹ',
      created_at: '2026-03-01T08:00:00Z',
      version: 1
    }
  ],
  pen_assignments: [
    { id: 'pa-1', animal_id: 'an-1', pen_id: 'pen-3', start_at: '2026-05-01T00:00:00Z', end_at: null, reason: 'Chuồng nuôi đực giống riêng' },
    { id: 'pa-2', animal_id: 'an-2', pen_id: 'pen-1', start_at: '2026-06-01T00:00:00Z', end_at: null, reason: 'Chuồng dưỡng nái sinh sản' },
    { id: 'pa-3', animal_id: 'an-3', pen_id: 'pen-2', start_at: '2026-08-10T00:00:00Z', end_at: null, reason: 'Chuồng nuôi con cùng lứa đẻ' },
    { id: 'pa-4', animal_id: 'an-4', pen_id: 'pen-2', start_at: '2026-08-10T00:00:00Z', end_at: null, reason: 'Ở cùng mẹ D003' },
    { id: 'pa-5', animal_id: 'an-5', pen_id: 'pen-2', start_at: '2026-08-10T00:00:00Z', end_at: null, reason: 'Ở cùng mẹ D003' },
    { id: 'pa-6', animal_id: 'an-6', pen_id: 'pen-5', start_at: '2026-07-01T00:00:00Z', end_at: null, reason: 'Ghép đôi hậu bị' },
    { id: 'pa-7', animal_id: 'an-7', pen_id: 'pen-7', start_at: '2026-11-01T00:00:00Z', end_at: null, reason: 'Chuyển cách ly do có biểu hiện bỏ ăn' }
  ],
  animal_weights: [
    { id: 'w-1', animal_id: 'an-1', measured_at: '2026-05-01', weight_value: 1.85, weight_unit: 'kg', recorded_by: 'Kỹ thuật viên Trại', note: 'Cân định kỳ tháng 5' },
    { id: 'w-2', animal_id: 'an-1', measured_at: '2026-08-01', weight_value: 2.10, weight_unit: 'kg', recorded_by: 'Kỹ thuật viên Trại', note: 'Tăng trưởng tốt' },
    { id: 'w-3', animal_id: 'an-1', measured_at: '2026-11-01', weight_value: 2.35, weight_unit: 'kg', recorded_by: 'Kỹ thuật viên Trại', note: 'Thể trạng chuẩn đực giống' },
    { id: 'w-4', animal_id: 'an-3', measured_at: '2026-06-01', weight_value: 1.60, weight_unit: 'kg', recorded_by: 'Kỹ thuật viên Trại', note: 'Trước khi sinh' },
    { id: 'w-5', animal_id: 'an-3', measured_at: '2026-09-01', weight_value: 1.45, weight_unit: 'kg', recorded_by: 'Kỹ thuật viên Trại', note: 'Đang cho con bú' },
    { id: 'w-6', animal_id: 'an-7', measured_at: '2026-10-15', weight_value: 1.30, weight_unit: 'kg', recorded_by: 'Kỹ thuật viên Trại', note: 'Giai đoạn tơ' },
    { id: 'w-7', animal_id: 'an-7', measured_at: '2026-11-02', weight_value: 1.18, weight_unit: 'kg', recorded_by: 'Kỹ thuật viên Trại', note: 'Giảm cân do giảm ăn' }
  ],
  litters: [
    {
      id: 'lit-1',
      litter_code: 'LIT-2026-01',
      mother_animal_id: 'an-3',
      father_animal_id: 'an-1',
      birth_at: '2026-08-10',
      total_born: 3,
      alive_count: 2,
      deceased_count: 1,
      notes: 'Đẻ 3 con, 1 con sơ sinh chết ngạt, 2 con khỏe mạnh đã cấp mã D004, D005'
    }
  ],
  litter_members: [
    { id: 'lm-1', litter_id: 'lit-1', animal_id: 'an-4', temporary_label: 'Con 1', sex_at_recording: 'MALE', notes: 'Đã định danh D004' },
    { id: 'lm-2', litter_id: 'lit-1', animal_id: 'an-5', temporary_label: 'Con 2', sex_at_recording: 'FEMALE', notes: 'Đã định danh D005' }
  ],
  medicines: [
    {
      id: 'med-1',
      medicine_code: 'THUOC-01',
      trade_name: 'Men Tiêu Hóa Entero Pro',
      active_ingredient: 'Bacillus subtilis, Lactobacillus acidophilus',
      medicine_group: 'Men tiêu hóa vi sinh',
      reference_description: 'Hỗ trợ đường ruột, ổn định hệ vi sinh khi dúi bỏ ăn nhẹ hoặc phân lỏng do thức ăn lạ.',
      warnings: 'Pha nước nguội sạch, không pha nước nóng. Tránh dùng chung cùng lúc với kháng sinh.',
      contraindications: 'Không có ghi nhận chống chỉ định nghiêm trọng.',
      source_reference: 'Sổ tay kỹ thuật chăn nuôi thú gặm nhấm - NXB Nông Nghiệp',
      verification_status: 'VERIFIED'
    },
    {
      id: 'med-2',
      medicine_code: 'THUOC-02',
      trade_name: 'Dung Dịch Điện Giải Oresol + B.Complex',
      active_ingredient: 'Glucose, Sodium chloride, Vitamin B1, B2, B6',
      medicine_group: 'Bổ trợ & Điện giải',
      reference_description: 'Bù nước, chống mất sức, kích thích thèm ăn khi thời tiết nắng nóng hoặc dúi mệt mỏi.',
      warnings: 'Chỉ uống trong ngày, đổ bỏ sau 24 giờ.',
      contraindications: 'Không lạm dụng liều quá đặc.',
      source_reference: 'Tài liệu hướng dẫn phòng bệnh thú y',
      verification_status: 'VERIFIED'
    },
    {
      id: 'med-3',
      medicine_code: 'THUOC-03',
      trade_name: 'Enrofloxacin 10% Thú Y (Tham Khảo)',
      active_ingredient: 'Enrofloxacin',
      medicine_group: 'Kháng sinh nhóm Fluoroquinolone',
      reference_description: 'Thuốc kháng sinh phổ rộng điều trị nhiễm khuẩn đường ruột nặng (tiêu chảy phân trắng/xanh) hoặc viêm phổi.',
      warnings: 'CHỈ ĐỊNH THÚ Y BẮT BUỘC. Tuyệt đối không tự ý tiêm hoặc tăng liều khi chưa có ý kiến của bác sĩ thú y. Kháng sinh có thể làm rối loạn hệ men tiêu hóa của loài gặm nhấm.',
      contraindications: 'Không dùng cho dúi con sơ sinh đang bú mẹ hoặc nái đang mang thai tuần cuối.',
      source_reference: 'Dược thư Thú Y Quốc Gia',
      verification_status: 'VERIFIED'
    }
  ],
  health_records: [
    {
      id: 'hr-1',
      animal_id: 'an-7',
      detected_at: '2026-11-01T07:30:00Z',
      severity: 'MILD',
      diagnosis_status: 'SUSPECTED',
      diagnosis_text: 'Rối loạn tiêu hóa nhẹ do thay đổi thời tiết, biểu hiện bỏ mía/tre 2 ngày',
      veterinary_confirmation: false,
      recorded_by: 'Nguyễn Văn Quản Lý',
      notes: 'Đã tách sang chuồng cách ly B03 theo dõi',
      status: 'OPEN'
    }
  ],
  incidents: [
    {
      id: 'inc-1',
      incident_type: 'OFF_FEED',
      animal_id: 'an-7',
      detected_at: '2026-11-01T07:30:00Z',
      pen_id: 'pen-7',
      symptoms_observed: 'Bỏ ăn mía và tre 2 ngày, phân hơi khô, nằm góc chuồng nhưng mắt vẫn sáng, uống nước ít',
      severity_level: 'MODERATE',
      recorded_by: 'Nguyễn Văn Quản Lý',
      actions_taken: 'Chuyển sang chuồng B03 cách ly, cho uống men tiêu hóa Entero Pro pha loãng, bổ sung nước đường gluco',
      follow_up_notes: [
        { time: '2026-11-02T08:00:00Z', note: 'Đã gặm nhẹ 1 mẩu mía nhỏ, phân bắt đầu ổn định hơn.', by: 'Kỹ thuật viên' },
        { time: '2026-11-03T16:00:00Z', note: 'Uống hết 30ml nước điện giải, tiếp tục theo dõi 24h tới.', by: 'Nguyễn Văn Quản Lý' }
      ],
      status: 'OPEN', // OPEN hoặc CLOSED
      outcome: null,
      closed_at: null,
      closed_by: null
    }
  ],
  farm_map: {
    name: 'Sơ Đồ Khu Nuôi Trại Chính',
    revision_number: 1,
    grid_size: 20,
    width: 1200,
    height: 800,
    blocks: [
      { id: 'blk-1', block_type: 'ZONE', zone_id: 'z1', zone_name: 'KHU A: SINH SẢN', x: 40, y: 40, width: 440, height: 420, color: '#f4f7f8', border: '#cbd2d6' },
      { id: 'blk-2', block_type: 'PEN', pen_id: 'pen-1', pen_code: 'A01', x: 60, y: 80, width: 120, height: 120, label: 'Chuồng A01 (Đẻ)' },
      { id: 'blk-3', block_type: 'PEN', pen_id: 'pen-2', pen_code: 'A02', x: 200, y: 80, width: 120, height: 120, label: 'Chuồng A02 (Nuôi con)' },
      { id: 'blk-4', block_type: 'PEN', pen_id: 'pen-3', pen_code: 'A03', x: 60, y: 220, width: 120, height: 120, label: 'Chuồng A03 (Đực)' },
      { id: 'blk-5', block_type: 'PEN', pen_id: 'pen-4', pen_code: 'A04', x: 200, y: 220, width: 120, height: 120, label: 'Chuồng A04 (Trống)' },

      { id: 'blk-6', block_type: 'PATH', x: 500, y: 40, width: 100, height: 500, label: 'Lối Đi Trung Tâm' },

      { id: 'blk-7', block_type: 'ZONE', zone_id: 'z2', zone_name: 'KHU B: HẬU BỊ & CÁCH LY', x: 620, y: 40, width: 440, height: 420, color: '#f0fdf4', border: '#4ade80' },
      { id: 'blk-8', block_type: 'PEN', pen_id: 'pen-5', pen_code: 'B01', x: 640, y: 80, width: 120, height: 120, label: 'Chuồng B01 (Hậu bị)' },
      { id: 'blk-9', block_type: 'PEN', pen_id: 'pen-6', pen_code: 'B02', x: 780, y: 80, width: 120, height: 120, label: 'Chuồng B02 (Hậu bị)' },
      { id: 'blk-10', block_type: 'PEN', pen_id: 'pen-7', pen_code: 'B03', x: 640, y: 220, width: 120, height: 120, label: 'Chuồng B03 (Cách ly)' }
    ]
  },
  audit_logs: [
    { id: 'aud-1', time: '2026-11-01T07:30:00Z', actor: 'Quản Lý', action: 'CREATE_INCIDENT', details: 'Ghi nhận ca bỏ ăn cho cá thể D007' }
  ]
};

class FarmDB {
  constructor() {
    this.data = null;
    this.init();
  }

  init() {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      this.data = JSON.parse(JSON.stringify(INITIAL_SEED));
      this.persist();
    } else {
      try {
        this.data = JSON.parse(raw);
      } catch (e) {
        console.error('Lỗi đọc dữ liệu local, khôi phục seed mặc định', e);
        this.data = JSON.parse(JSON.stringify(INITIAL_SEED));
        this.persist();
      }
    }
    this.migrate();
  }

  // Nâng cấp dữ liệu cũ đã lưu trong trình duyệt mà không làm mất gì
  migrate() {
    let changed = false;
    if (!this.data.farm_map) this.data.farm_map = { blocks: [] };
    if (!Array.isArray(this.data.farm_map.blocks)) this.data.farm_map.blocks = [];
    if (!Array.isArray(this.data.farm_map_revisions)) {
      this.data.farm_map_revisions = [];
      changed = true;
    }
    // Khối khu vực của bản cũ chưa gắn zone_id
    const legacyZoneBlocks = { 'blk-1': 'z1', 'blk-7': 'z2' };
    this.data.farm_map.blocks.forEach(b => {
      if (b.block_type === 'ZONE' && !b.zone_id && legacyZoneBlocks[b.id]) {
        const z = (this.data.zones || []).find(zz => zz.id === legacyZoneBlocks[b.id]);
        if (z) {
          b.zone_id = z.id;
          changed = true;
        }
      }
    });
    if (changed) this.persist();
  }

  assertCanEditMap() {
    if (!this.canEditMap()) {
      throw new Error('Quyền bị từ chối: chỉ Admin và Manager mới được chỉnh sửa sơ đồ và chuồng.');
    }
  }

  assertCanWrite() {
    if (!this.canCreateRecords()) {
      throw new Error('Tài khoản Viewer chỉ có quyền xem dữ liệu.');
    }
  }

  persist() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.error('Lỗi ghi LocalStorage', e);
    }
  }

  resetToDefault() {
    this.data = JSON.parse(JSON.stringify(INITIAL_SEED));
    this.persist();
  }

  // --- FARMS & PENS ---
  getPens() {
    return this.data.pens || [];
  }

  getPenById(penId) {
    return this.getPens().find(p => p.id === penId);
  }

  isPenCodeTaken(code, exceptPenId = null) {
    const c = String(code || '').trim().toUpperCase();
    return this.getPens().some(p => p.pen_code.toUpperCase() === c && p.id !== exceptPenId);
  }

  // Gợi ý mã chuồng kế tiếp theo khu (ví dụ KHU_A -> A05)
  generatePenCode(zoneId) {
    const zone = this.getZones().find(z => z.id === zoneId);
    let letter = 'M';
    if (zone && zone.zone_code) {
      const tail = zone.zone_code.split('_').pop();
      if (tail) letter = tail.charAt(0).toUpperCase();
    }
    let max = 0;
    this.getPens().forEach(p => {
      const m = p.pen_code.toUpperCase().match(new RegExp('^' + letter + '(\\d+)$'));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    let n = max + 1;
    let code = letter + String(n).padStart(2, '0');
    while (this.isPenCodeTaken(code)) {
      n++;
      code = letter + String(n).padStart(2, '0');
    }
    return code;
  }

  getFreeSlots(penId) {
    const pen = this.getPenById(penId);
    if (!pen) return 0;
    return Math.max(0, pen.capacity - this.getAnimalsInPen(penId).length);
  }

  // Chuồng đã tạo nhưng chưa có ô nào trên sơ đồ đã lưu
  getUnplacedPens() {
    const placed = new Set((this.getFarmMap().blocks || []).filter(b => b.block_type === 'PEN').map(b => b.pen_id));
    return this.getPens().filter(p => !placed.has(p.id));
  }

  savePen(pen) {
    this.assertCanEditMap();
    const code = String(pen.pen_code || '').trim().toUpperCase();
    if (!code) throw new Error('Vui lòng nhập mã chuồng.');
    if (this.isPenCodeTaken(code, pen.id)) {
      throw new Error(`Mã chuồng "${code}" đã tồn tại. Mã chuồng phải là duy nhất.`);
    }
    const capacity = parseInt(pen.capacity, 10);
    if (!(capacity >= 1)) throw new Error('Sức chứa phải từ 1 con trở lên.');
    const status = pen.status || 'ACTIVE';
    if (!PEN_STATUSES.includes(status)) throw new Error('Trạng thái chuồng không hợp lệ.');

    const existingIdx = pen.id ? this.data.pens.findIndex(p => p.id === pen.id) : -1;
    if (existingIdx >= 0) {
      const occupants = this.getAnimalsInPen(pen.id).length;
      if (capacity < occupants) {
        throw new Error(`Chuồng đang có ${occupants} con, sức chứa không được nhỏ hơn số đó.`);
      }
      if (status === 'DISABLED' && occupants > 0) {
        throw new Error('Chuồng còn dúi, hãy chuyển hết dúi ra trước khi ngừng sử dụng.');
      }
      this.data.pens[existingIdx] = {
        ...this.data.pens[existingIdx],
        ...pen,
        pen_code: code,
        capacity,
        status,
        updated_at: new Date().toISOString()
      };
      this.logAudit(this.getCurrentUser().name, 'UPDATE_PEN', `Cập nhật chuồng ${code}`);
      this.persist();
      return this.data.pens[existingIdx];
    }

    const newPen = {
      farm_id: (this.data.farms && this.data.farms[0] && this.data.farms[0].id) || 'f1',
      zone_id: null,
      name: '',
      notes: '',
      ...pen,
      id: pen.id || 'pen-' + Date.now(),
      pen_code: code,
      capacity,
      status,
      created_at: new Date().toISOString()
    };
    this.data.pens.push(newPen);
    this.logAudit(this.getCurrentUser().name, 'CREATE_PEN', `Tạo chuồng ${code}`);
    this.persist();
    return newPen;
  }

  saveZone(zone) {
    this.assertCanEditMap();
    const name = String(zone.name || '').trim();
    const code = String(zone.zone_code || '').trim().toUpperCase();
    if (!name) throw new Error('Vui lòng nhập tên khu vực.');
    if (!code) throw new Error('Thiếu mã khu vực.');
    const dup = this.getZones().find(z => z.id !== zone.id && (z.zone_code.toUpperCase() === code));
    if (dup) throw new Error(`Mã khu "${code}" đã tồn tại.`);
    if (!this.data.zones) this.data.zones = [];
    const idx = zone.id ? this.data.zones.findIndex(z => z.id === zone.id) : -1;
    if (idx >= 0) {
      this.data.zones[idx] = { ...this.data.zones[idx], ...zone, name, zone_code: code };
      this.persist();
      return this.data.zones[idx];
    }
    const created = {
      farm_id: (this.data.farms && this.data.farms[0] && this.data.farms[0].id) || 'f1',
      status: 'ACTIVE',
      ...zone,
      id: zone.id || 'z' + Date.now(),
      name,
      zone_code: code
    };
    this.data.zones.push(created);
    this.logAudit(this.getCurrentUser().name, 'CREATE_ZONE', `Tạo khu ${name}`);
    this.persist();
    return created;
  }

  // Lấy danh sách cá thể đang ở trong một chuồng (active pen_assignment)
  getAnimalsInPen(penId) {
    const activeAssignments = (this.data.pen_assignments || []).filter(pa => pa.pen_id === penId && !pa.end_at);
    const animalIds = new Set(activeAssignments.map(pa => pa.animal_id));
    return this.getAnimals().filter(a => animalIds.has(a.id) && a.status === 'ACTIVE');
  }

  // Lấy chuồng hiện tại của một cá thể
  getCurrentPenForAnimal(animalId) {
    const activeAssignment = (this.data.pen_assignments || []).find(pa => pa.animal_id === animalId && !pa.end_at);
    if (!activeAssignment) return null;
    return this.getPenById(activeAssignment.pen_id);
  }

  // --- ANIMALS ---
  getAnimals() {
    return this.data.animals || [];
  }

  getAnimalById(id) {
    return this.getAnimals().find(a => a.id === id);
  }

  getAnimalByCode(code) {
    return this.getAnimals().find(a => a.animal_code.toUpperCase() === code.trim().toUpperCase());
  }

  saveAnimal(animal) {
    this.assertCanWrite();
    // Kiểm tra trùng mã ID hiển thị
    const existingCode = this.getAnimalByCode(animal.animal_code);
    if (existingCode && existingCode.id !== animal.id) {
      throw new Error(`Mã cá thể "${animal.animal_code}" đã tồn tại! Mã phải là duy nhất.`);
    }

    const idx = this.data.animals.findIndex(a => a.id === animal.id);
    if (idx >= 0) {
      this.data.animals[idx] = {
        ...this.data.animals[idx],
        ...animal,
        updated_at: new Date().toISOString(),
        version: (this.data.animals[idx].version || 1) + 1
      };
    } else {
      if (!animal.id) animal.id = 'an-' + Date.now();
      animal.created_at = new Date().toISOString();
      animal.status = animal.status || 'ACTIVE';
      animal.version = 1;
      this.data.animals.push(animal);
    }
    this.persist();
    return animal;
  }

  // Chuyển chuồng đảm bảo Transactional Invariant:
  // Đóng assignment cũ, tạo assignment mới, đảm bảo 1 cá thể chỉ có tối đa 1 assignment active
  transferAnimal(animalId, newPenId, reason = 'Chuyển chuồng định kỳ', recordedBy = 'Quản Lý', opts = {}) {
    this.assertCanWrite();
    if (newPenId && opts.enforceCapacity) {
      const pen = this.getPenById(newPenId);
      if (!pen) throw new Error('Không tìm thấy chuồng đích.');
      if (pen.status === 'DISABLED') throw new Error(`Chuồng ${pen.pen_code} đã ngừng sử dụng.`);
      const current = this.getCurrentPenForAnimal(animalId);
      if (current && current.id === newPenId) return; // đã ở chuồng này
      if (this.getFreeSlots(newPenId) < 1) {
        throw new Error(`Chuồng ${pen.pen_code} đã đủ ${pen.capacity}/${pen.capacity} con.`);
      }
    }
    const now = new Date().toISOString();
    // Đóng toàn bộ active assignment của con này
    this.data.pen_assignments = (this.data.pen_assignments || []).map(pa => {
      if (pa.animal_id === animalId && !pa.end_at) {
        return { ...pa, end_at: now };
      }
      return pa;
    });

    if (newPenId) {
      this.data.pen_assignments.push({
        id: 'pa-' + Date.now(),
        animal_id: animalId,
        pen_id: newPenId,
        start_at: now,
        end_at: null,
        reason: reason,
        recorded_by: recordedBy
      });
    }

    this.logAudit(recordedBy, 'TRANSFER_ANIMAL', `Chuyển cá thể ${animalId} sang chuồng ${newPenId || 'Không có'}: ${reason}`);
    this.persist();
  }

  // --- CÂN NẶNG (WEIGHTS) ---
  getWeights(animalId) {
    return (this.data.animal_weights || [])
      .filter(w => w.animal_id === animalId)
      .sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at));
  }

  addWeight(animalId, weightValue, weightUnit = 'kg', note = '', recordedBy = 'Kỹ thuật viên') {
    const record = {
      id: 'w-' + Date.now(),
      animal_id: animalId,
      measured_at: new Date().toISOString().split('T')[0],
      weight_value: parseFloat(weightValue),
      weight_unit: weightUnit,
      recorded_by: recordedBy,
      note: note
    };
    this.data.animal_weights.push(record);
    this.persist();
    return record;
  }

  // --- SỰ CỐ (INCIDENTS - CHỈ 2 LOẠI: OFF_FEED & DEATH) ---
  getIncidents() {
    return (this.data.incidents || []).sort((a, b) => new Date(b.detected_at) - new Date(a.detected_at));
  }

  createIncident({ incident_type, animal_id, symptoms_observed, severity_level, actions_taken, recorded_by }) {
    if (incident_type !== 'OFF_FEED' && incident_type !== 'DEATH') {
      throw new Error('Chỉ hỗ trợ 2 loại sự cố: OFF_FEED và DEATH!');
    }

    const animal = this.getAnimalById(animal_id);
    if (!animal) throw new Error('Không tìm thấy cá thể!');

    const currentPen = this.getCurrentPenForAnimal(animal_id);
    const now = new Date().toISOString();

    const incident = {
      id: 'inc-' + Date.now(),
      incident_type,
      animal_id,
      detected_at: now,
      pen_id: currentPen ? currentPen.id : null,
      symptoms_observed,
      severity_level: severity_level || 'MODERATE',
      recorded_by: recorded_by || 'Quản Lý',
      actions_taken: actions_taken || '',
      follow_up_notes: [],
      status: incident_type === 'DEATH' ? 'CLOSED' : 'OPEN',
      outcome: incident_type === 'DEATH' ? 'Cá thể tử vong' : null,
      closed_at: incident_type === 'DEATH' ? now : null,
      closed_by: incident_type === 'DEATH' ? recorded_by : null
    };

    // Nếu sự cố là DEATH: Tuân thủ Core Invariant:
    // Đổi status sang DECEASED, đóng active pen assignment, audit log, không xóa hồ sơ!
    if (incident_type === 'DEATH') {
      animal.status = 'DECEASED';
      animal.deceased_at = now;
      this.transferAnimal(animal_id, null, `Đóng chuồng do cá thể tử vong (Sự cố ${incident.id})`, recorded_by);
      this.logAudit(recorded_by, 'ANIMAL_DEATH', `Ghi nhận cá thể ${animal.animal_code} tử vong: ${symptoms_observed}`);
    } else {
      this.logAudit(recorded_by, 'CREATE_INCIDENT', `Ghi nhận ca bỏ ăn cho cá thể ${animal.animal_code}`);
    }

    this.data.incidents.push(incident);
    this.persist();
    return incident;
  }

  addIncidentFollowUp(incidentId, note, recordedBy = 'Quản Lý') {
    const inc = this.data.incidents.find(i => i.id === incidentId);
    if (!inc) throw new Error('Không tìm thấy sự cố');
    inc.follow_up_notes.push({
      time: new Date().toISOString(),
      note,
      by: recordedBy
    });
    this.persist();
    return inc;
  }

  closeIncident(incidentId, outcome, closedBy = 'Quản Lý') {
    const inc = this.data.incidents.find(i => i.id === incidentId);
    if (!inc) throw new Error('Không tìm thấy sự cố');
    inc.status = 'CLOSED';
    inc.outcome = outcome;
    inc.closed_at = new Date().toISOString();
    inc.closed_by = closedBy;
    this.logAudit(closedBy, 'CLOSE_INCIDENT', `Đóng sự cố ${incidentId} với kết quả: ${outcome}`);
    this.persist();
    return inc;
  }

  // --- SINH SẢN & PHẢ HỆ (BREEDING & PEDIGREE) ---
  getLitters() {
    return this.data.litters || [];
  }

  createLitter({ litter_code, mother_animal_id, father_animal_id, birth_at, total_born, alive_count, deceased_count, notes }) {
    const litter = {
      id: 'lit-' + Date.now(),
      litter_code: litter_code || ('LIT-' + Date.now().toString().slice(-6)),
      mother_animal_id,
      father_animal_id: father_animal_id || null,
      birth_at: birth_at || new Date().toISOString().split('T')[0],
      total_born: parseInt(total_born) || 0,
      alive_count: parseInt(alive_count) || 0,
      deceased_count: parseInt(deceased_count) || 0,
      notes: notes || ''
    };
    this.data.litters.push(litter);
    this.persist();
    return litter;
  }

  // Tách đàn / Cấp mã định danh cho con non từ lứa đẻ
  registerLitterMemberAsAnimal({ litter_id, animal_code, name, sex, pen_id, recorded_by = 'Quản Lý' }) {
    const litter = this.data.litters.find(l => l.id === litter_id);
    if (!litter) throw new Error('Không tìm thấy lứa đẻ');

    const newAnimal = this.saveAnimal({
      animal_code,
      name,
      species: 'Dúi Mốc Lớn',
      sex: sex || 'UNKNOWN',
      date_of_birth: litter.birth_at,
      birth_date_precision: 'EXACT',
      origin_type: 'BORN',
      status: 'ACTIVE',
      father_id: litter.father_animal_id,
      mother_id: litter.mother_animal_id,
      notes: `Sinh từ lứa ${litter.litter_code}`
    });

    if (pen_id) {
      this.transferAnimal(newAnimal.id, pen_id, `Tách đàn lứa ${litter.litter_code} sang chuồng`, recorded_by);
    }

    this.data.litter_members.push({
      id: 'lm-' + Date.now(),
      litter_id,
      animal_id: newAnimal.id,
      temporary_label: name,
      sex_at_recording: sex,
      notes: `Đã cấp mã định danh ${animal_code}`
    });

    this.persist();
    return newAnimal;
  }

  // Tra cứu cây phả hệ (Pedigree) 3 đời
  getPedigree(animalId) {
    const animal = this.getAnimalById(animalId);
    if (!animal) return null;

    const father = animal.father_id ? this.getAnimalById(animal.father_id) : null;
    const mother = animal.mother_id ? this.getAnimalById(animal.mother_id) : null;

    const paternalGrandFather = father && father.father_id ? this.getAnimalById(father.father_id) : null;
    const paternalGrandMother = father && father.mother_id ? this.getAnimalById(father.mother_id) : null;

    const maternalGrandFather = mother && mother.father_id ? this.getAnimalById(mother.father_id) : null;
    const maternalGrandMother = mother && mother.mother_id ? this.getAnimalById(mother.mother_id) : null;

    // Tìm con cái
    const children = this.getAnimals().filter(a => a.father_id === animalId || a.mother_id === animalId);

    // Tìm anh chị em cùng cha/mẹ
    const siblings = this.getAnimals().filter(a => 
      a.id !== animalId && (
        (animal.father_id && a.father_id === animal.father_id) ||
        (animal.mother_id && a.mother_id === animal.mother_id)
      )
    );

    return {
      animal,
      father,
      mother,
      paternalGrandFather,
      paternalGrandMother,
      maternalGrandFather,
      maternalGrandMother,
      children,
      siblings
    };
  }

  // Kiểm tra cảnh báo trùng huyết / cận huyết trước khi ghép phối
  checkInbreedingRisk(maleId, femaleId) {
    if (maleId === femaleId) return { risk: 'HIGH', reason: 'Tự phối giống chính mình (Không hợp lệ)' };
    const male = this.getAnimalById(maleId);
    const female = this.getAnimalById(femaleId);
    if (!male || !female) return { risk: 'UNKNOWN', reason: 'Không đủ dữ liệu' };

    // Cùng bố hoặc cùng mẹ
    if (male.father_id && female.father_id && male.father_id === female.father_id) {
      return { risk: 'HIGH', reason: 'Cùng bố (Anh em cùng cha)' };
    }
    if (male.mother_id && female.mother_id && male.mother_id === female.mother_id) {
      return { risk: 'HIGH', reason: 'Cùng mẹ (Anh em cùng mẹ)' };
    }
    // Bố phối với con gái hoặc Mẹ phối với con trai
    if (male.id === female.father_id) {
      return { risk: 'EXTREME', reason: 'Bố ghép với con gái (Cận huyết bậc 1)' };
    }
    if (female.id === male.mother_id) {
      return { risk: 'EXTREME', reason: 'Mẹ ghép với con trai (Cận huyết bậc 1)' };
    }

    return { risk: 'LOW', reason: 'Không phát hiện liên hệ cận huyết trực tiếp' };
  }

  // --- SỨC KHỎE & THUỐC THAM KHẢO ---
  getMedicines() {
    return this.data.medicines || [];
  }

  getHealthRecords() {
    return (this.data.health_records || []).sort((a, b) => new Date(b.detected_at) - new Date(a.detected_at));
  }

  createHealthRecord({ animal_id, diagnosis_text, severity = 'MILD', notes = '', recorded_by = 'Quản Lý' }) {
    const record = {
      id: 'hr-' + Date.now(),
      animal_id,
      detected_at: new Date().toISOString(),
      severity,
      diagnosis_status: 'SUSPECTED',
      diagnosis_text,
      veterinary_confirmation: false,
      recorded_by,
      notes,
      status: 'OPEN'
    };
    this.data.health_records.push(record);
    this.persist();
    return record;
  }

  // --- SƠ ĐỒ CHUỒNG (FARM MAP 2D) ---
  getFarmMap() {
    return this.data.farm_map || { blocks: [] };
  }

  // Kiểm tra hình học và liên kết dữ liệu của sơ đồ trước khi lưu
  validateFarmMap(mapData) {
    const blocks = (mapData && mapData.blocks) || [];
    const ids = new Set();
    const penIds = new Set();
    for (const b of blocks) {
      if (!b.id || ids.has(b.id)) throw new Error('Sơ đồ có khối bị trùng mã.');
      ids.add(b.id);
      if (![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.width <= 0 || b.height <= 0) {
        throw new Error('Có khối với vị trí hoặc kích thước không hợp lệ.');
      }
      if (b.block_type === 'PEN') {
        if (!b.pen_id || !this.getPenById(b.pen_id)) throw new Error('Có ô chuồng chưa gắn với chuồng thật.');
        if (penIds.has(b.pen_id)) throw new Error('Một chuồng không được xuất hiện hai lần trên sơ đồ.');
        penIds.add(b.pen_id);
      }
    }
    const pens = blocks.filter(b => b.block_type === 'PEN');
    for (let i = 0; i < pens.length; i++) {
      for (let j = i + 1; j < pens.length; j++) {
        const a = pens[i], c = pens[j];
        if (a.x < c.x + c.width && a.x + a.width > c.x && a.y < c.y + c.height && a.y + a.height > c.y) {
          const pa = this.getPenById(a.pen_id), pc = this.getPenById(c.pen_id);
          throw new Error(`Chuồng ${pa.pen_code} và ${pc.pen_code} đang chồng lên nhau.`);
        }
      }
    }
  }

  // Lưu sơ đồ: giữ lại bản trước đó làm phiên bản khôi phục.
  // Chỉ thay đổi hình học; không đụng đến pen_assignments của cá thể.
  saveFarmMap(mapData, note = '') {
    this.assertCanEditMap();
    this.validateFarmMap(mapData);
    const user = this.getCurrentUser();
    const prev = this.data.farm_map || { blocks: [] };

    if (!Array.isArray(this.data.farm_map_revisions)) this.data.farm_map_revisions = [];
    this.data.farm_map_revisions.unshift({
      id: 'rev-' + Date.now(),
      saved_at: new Date().toISOString(),
      saved_by: user.name,
      revision_number: prev.revision_number || 1,
      note,
      map: JSON.parse(JSON.stringify({ blocks: prev.blocks || [] }))
    });
    this.data.farm_map_revisions = this.data.farm_map_revisions.slice(0, MAX_MAP_REVISIONS);

    // Chuồng vừa đặt/di chuyển vào khối khu nào thì thuộc khu đó (chỉ cập nhật zone_id của chuồng)
    const zoneBlocks = (mapData.blocks || []).filter(b => b.block_type === 'ZONE' && b.zone_id);
    const prevPos = {};
    (prev.blocks || []).filter(b => b.block_type === 'PEN').forEach(b => { prevPos[b.pen_id] = b; });
    let zoneChanges = 0;
    (mapData.blocks || []).filter(b => b.block_type === 'PEN').forEach(b => {
      const before = prevPos[b.pen_id];
      if (before && before.x === b.x && before.y === b.y) return; // chỉ xét chuồng mới đặt hoặc vừa di chuyển
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      const inside = zoneBlocks
        .filter(z => cx >= z.x && cx <= z.x + z.width && cy >= z.y && cy <= z.y + z.height)
        .sort((a, c) => a.width * a.height - c.width * c.height)[0];
      const pen = this.getPenById(b.pen_id);
      if (inside && pen && pen.zone_id !== inside.zone_id) {
        pen.zone_id = inside.zone_id;
        pen.updated_at = new Date().toISOString();
        zoneChanges++;
      }
    });

    this.data.farm_map = {
      ...prev,
      ...mapData,
      blocks: JSON.parse(JSON.stringify(mapData.blocks || [])),
      revision_number: (prev.revision_number || 1) + 1,
      updated_at: new Date().toISOString(),
      updated_by: user.name
    };
    this.logAudit(user.name, 'EDIT_FARM_MAP', `Lưu sơ đồ phiên bản ${this.data.farm_map.revision_number}${note ? ': ' + note : ''}`);
    this.persist();
    return { map: this.data.farm_map, zoneChanges };
  }

  getFarmMapRevisions() {
    return this.data.farm_map_revisions || [];
  }

  // --- AUDIT LOGS ---
  logAudit(actor, action, details) {
    if (!this.data.audit_logs) this.data.audit_logs = [];
    this.data.audit_logs.unshift({
      id: 'aud-' + Date.now(),
      time: new Date().toISOString(),
      actor: actor || 'Admin',
      action,
      details
    });
    if (this.data.audit_logs.length > 200) this.data.audit_logs.pop();
  }

  getAuditLogs() {
    return this.data.audit_logs || [];
  }

  // --- THỐNG KÊ DASHBOARD ---
  getDashboardStats() {
    const animals = this.getAnimals();
    const activeAnimals = animals.filter(a => a.status === 'ACTIVE');
    const maleCount = activeAnimals.filter(a => a.sex === 'MALE').length;
    const femaleCount = activeAnimals.filter(a => a.sex === 'FEMALE').length;
    const unknownCount = activeAnimals.filter(a => a.sex === 'UNKNOWN').length;

    const pens = this.getPens();
    const activePens = pens.filter(p => p.status === 'ACTIVE').length;
    const breedingPens = pens.filter(p => p.status === 'BREEDING').length;
    const emptyPens = pens.filter(p => p.status !== 'DISABLED' && (p.status === 'EMPTY' || this.getAnimalsInPen(p.id).length === 0)).length;
    const quarantinePens = pens.filter(p => p.status === 'QUARANTINE').length;

    const openIncidents = (this.data.incidents || []).filter(i => i.status === 'OPEN' && i.incident_type === 'OFF_FEED');
    const deaths = (this.data.incidents || []).filter(i => i.incident_type === 'DEATH');

    // Dúi mới sinh (sinh tại trại hoặc lứa đẻ)
    const newBorns = animals.filter(a => a.origin_type === 'BORN');

    // Tổng hợp hoạt động / công việc gần đây
    const activities = [];
    (this.data.incidents || []).forEach(inc => {
      const an = this.getAnimalById(inc.animal_id);
      activities.push({
        type: 'INCIDENT',
        title: inc.incident_type === 'DEATH' ? 'Ghi nhận dúi chết' : 'Ghi nhận dúi bỏ ăn',
        desc: `${an ? an.animal_code : 'N/A'} - ${inc.symptoms_observed}`,
        time: inc.detected_at,
        badgeClass: inc.incident_type === 'DEATH' ? 'pill-negative' : 'pill-warning'
      });
    });

    (this.data.weights || []).forEach(w => {
      const an = this.getAnimalById(w.animal_id);
      activities.push({
        type: 'WEIGHT',
        title: 'Cập nhật cân nặng',
        desc: `${an ? an.animal_code : 'N/A'}: ${w.weight_value} ${w.weight_unit} (${w.note || 'Định kỳ'})`,
        time: w.measured_at,
        badgeClass: 'pill-accent'
      });
    });

    (this.data.litters || []).forEach(lit => {
      activities.push({
        type: 'LITTER',
        title: 'Ghi nhận lứa đẻ mới',
        desc: `${lit.litter_code}: ${lit.total_born} con (Sống: ${lit.alive_count})`,
        time: lit.birth_at,
        badgeClass: 'pill-positive'
      });
    });

    activities.sort((a, b) => new Date(b.time) - new Date(a.time));

    return {
      totalActiveAnimals: activeAnimals.length,
      maleCount,
      femaleCount,
      unknownCount,
      totalPens: pens.length,
      activePens,
      breedingPens,
      emptyPens,
      quarantinePens,
      openOffFeedIncidents: openIncidents.length,
      totalDeaths: deaths.length,
      newBornCount: newBorns.length,
      recentIncidents: (this.data.incidents || []).slice(0, 5),
      recentActivities: activities.slice(0, 5)
    };
  }

  // --- TRUY VẤN LỊCH SỬ CHO HỒ SƠ CÁ THỂ ĐA TAB ---
  getPenAssignmentHistory(animalId) {
    return (this.data.pen_assignments || [])
      .filter(pa => pa.animal_id === animalId)
      .sort((a, b) => new Date(b.start_at) - new Date(a.start_at));
  }

  getLittersForAnimal(animalId) {
    return (this.data.litters || [])
      .filter(lit => lit.mother_animal_id === animalId || lit.father_animal_id === animalId)
      .sort((a, b) => new Date(b.birth_at) - new Date(a.birth_at));
  }

  getHealthRecordsForAnimal(animalId) {
    return (this.data.health_records || [])
      .filter(hr => hr.animal_id === animalId)
      .sort((a, b) => new Date(b.detected_at) - new Date(a.detected_at));
  }

  getEventsForAnimal(animalId) {
    const events = [];
    (this.data.incidents || []).filter(i => i.animal_id === animalId).forEach(i => {
      events.push({
        time: i.detected_at,
        type: i.incident_type === 'DEATH' ? 'Tử vong' : 'Bỏ ăn',
        badgeClass: i.incident_type === 'DEATH' ? 'pill-negative' : 'pill-warning',
        details: i.symptoms_observed
      });
    });
    (this.data.pen_assignments || []).filter(pa => pa.animal_id === animalId).forEach(pa => {
      const pen = this.getPenById(pa.pen_id);
      events.push({
        time: pa.start_at,
        type: 'Chuyển chuồng',
        badgeClass: 'pill-neutral',
        details: `Chuyển vào ${pen ? 'Chuồng ' + pen.pen_code : 'chuồng'} (${pa.assignment_reason || 'Điều chuyển'})`
      });
    });
    (this.data.weights || []).filter(w => w.animal_id === animalId).forEach(w => {
      events.push({
        time: w.measured_at,
        type: 'Cân nặng',
        badgeClass: 'pill-accent',
        details: `${w.weight_value} ${w.weight_unit} - ${w.note || 'Cân định kỳ'}`
      });
    });
    return events.sort((a, b) => new Date(b.time) - new Date(a.time));
  }

  getZones() {
    return this.data.zones || [];
  }

  // --- QUẢN LÝ VAI TRÒ & NGƯỜI DÙNG HIỆN TẠI (RBAC) ---
  getCurrentUser() {
    if (!this.currentUser) {
      const saved = localStorage.getItem('FARM_CURRENT_USER');
      this.currentUser = saved ? JSON.parse(saved) : { name: 'Nguyễn Văn Quản Lý', role: 'ADMIN' };
    }
    return this.currentUser;
  }

  setUserRole(role) {
    const user = this.getCurrentUser();
    user.role = role;
    this.currentUser = user;
    localStorage.setItem('FARM_CURRENT_USER', JSON.stringify(user));
    this.logAudit(user.name, 'CHANGE_ROLE', `Chuyển vai trò sang: ${role}`);
    return user;
  }

  canEditMap() {
    const role = this.getCurrentUser().role;
    return role === 'ADMIN' || role === 'MANAGER';
  }

  canCreateRecords() {
    const role = this.getCurrentUser().role;
    return role !== 'VIEWER';
  }

  // --- THEO DÕI ĐỒNG BỘ NGOẠI TUYẾN (OFFLINE SYNC) ---
  getOfflineStatus() {
    return {
      isOnline: navigator.onLine,
      lastSyncTime: this.data.last_sync_time || new Date().toISOString(),
      pendingCount: (this.data.outbox_events || []).length
    };
  }

  // Xuất file dữ liệu JSON
  exportDataJSON() {
    return JSON.stringify(this.data, null, 2);
  }

  // Nhập file dữ liệu JSON
  importDataJSON(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed.animals || !parsed.pens) {
        throw new Error('Dữ liệu không đúng cấu trúc Farm Management!');
      }
      this.data = parsed;
      this.persist();
      return true;
    } catch (e) {
      throw new Error('Không thể đọc file JSON: ' + e.message);
    }
  }
}

// Khởi tạo instance toàn cục
window.farmDB = new FarmDB();

