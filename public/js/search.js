/**
 * Module Tìm Kiếm Tiếng Việt Thông Minh (Vietnamese Intelligent Search)
 * Hỗ trợ:
 * - Chuẩn hóa bỏ dấu tiếng Việt (Unaccented search).
 * - Tìm kiếm không phân biệt hoa thường (Case-insensitive).
 * - Bảng từ đồng nghĩa (Synonyms) cho triệu chứng thú y: tieu chay -> phan long, bo an -> bo mia, sot -> mệt mỏi...
 * - Tìm kiếm xuyên module: Cá thể, Chuồng, Bệnh án, Sự cố, Thuốc tham khảo.
 */

function removeVietnameseTones(str) {
  if (!str) return '';
  str = str.toLowerCase();
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  // Loại bỏ một số ký tự đặc biệt
  str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, ""); // Huyền sắc ngã hỏi nặng
  str = str.replace(/\u02C6|\u0306|\u031B/g, ""); // Â, Ê, Ă, Ơ, Ư
  return str.trim();
}

const SYNONYMS = {
  'tieu chay': ['phan long', 'di ngoai', 'uot duoi', 'phan uot', 'phan xanh', 'phan trang'],
  'phan long': ['tieu chay', 'di ngoai', 'uot duoi'],
  'bo an': ['giam an', 'bo mia', 'bo tre', 'khong an', 'kem an', 'chan an'],
  'bo mia': ['bo an', 'kem an', 'giam an'],
  'dau bung': ['chuong bung', 'sinh hoi', 'cang bung'],
  'cach ly': ['benh', 'om', 'theo doi'],
  'duc': ['male', 'duc co', 'duc giong'],
  'cai': ['female', 'de', 'nai', 'sinh san']
};

class FarmSearchEngine {
  constructor(db) {
    this.db = db;
  }

  search(query) {
    if (!query || query.trim() === '') return { total: 0, results: [] };

    const rawQuery = query.trim();
    const cleanQuery = removeVietnameseTones(rawQuery);

    // Mở rộng các từ khóa đồng nghĩa nếu có
    const searchTerms = [cleanQuery];
    for (const [key, synList] of Object.entries(SYNONYMS)) {
      if (cleanQuery.includes(key)) {
        synList.forEach(s => searchTerms.push(s));
      }
    }

    const results = [];

    // 1. Tìm trong Cá thể (Animals)
    const animals = this.db.getAnimals();
    animals.forEach(animal => {
      const targetStr = removeVietnameseTones(`${animal.animal_code} ${animal.name || ''} ${animal.species || ''} ${animal.notes || ''} ${animal.sex}`);
      const matches = searchTerms.some(term => targetStr.includes(term));
      if (matches) {
        const currentPen = this.db.getCurrentPenForAnimal(animal.id);
        results.push({
          category: 'CÁ THỂ (ANIMAL)',
          title: `${animal.animal_code} - ${animal.name || 'Chưa đặt tên'}`,
          badge: animal.status === 'ACTIVE' ? 'Đang nuôi' : (animal.status === 'DECEASED' ? 'Tử vong' : animal.status),
          badgeType: animal.status === 'ACTIVE' ? 'positive' : 'negative',
          snippet: `Giới tính: ${animal.sex === 'MALE' ? 'Đực' : (animal.sex === 'FEMALE' ? 'Cái' : 'Chưa rõ')} | Chuồng: ${currentPen ? currentPen.pen_code : 'Chưa phân'} | Ghi chú: ${animal.notes || 'Không'}`,
          actionType: 'VIEW_ANIMAL',
          id: animal.id
        });
      }
    });

    // 2. Tìm trong Chuồng (Pens)
    const pens = this.db.getPens();
    pens.forEach(pen => {
      const targetStr = removeVietnameseTones(`${pen.pen_code} ${pen.name} ${pen.notes || ''} ${pen.status}`);
      const matches = searchTerms.some(term => targetStr.includes(term));
      if (matches) {
        const animalsInPen = this.db.getAnimalsInPen(pen.id);
        results.push({
          category: 'CHUỒNG (PEN)',
          title: `Chuồng ${pen.pen_code} - ${pen.name}`,
          badge: pen.status,
          badgeType: pen.status === 'EMPTY' ? 'neutral' : 'accent',
          snippet: `Sức chứa: ${pen.capacity} cá thể | Đang nuôi: ${animalsInPen.length} con (${animalsInPen.map(a => a.animal_code).join(', ') || 'Trống'})`,
          actionType: 'VIEW_PEN',
          id: pen.id
        });
      }
    });

    // 3. Tìm trong Sự cố (Incidents: OFF_FEED & DEATH)
    const incidents = this.db.getIncidents();
    incidents.forEach(inc => {
      const animal = this.db.getAnimalById(inc.animal_id);
      const targetStr = removeVietnameseTones(`${inc.incident_type} ${inc.symptoms_observed} ${inc.actions_taken || ''} ${animal ? animal.animal_code : ''}`);
      const matches = searchTerms.some(term => targetStr.includes(term));
      if (matches) {
        results.push({
          category: 'SỰ CỐ (INCIDENT)',
          title: `Sự cố: ${inc.incident_type === 'OFF_FEED' ? 'Dúi Bỏ Ăn (OFF_FEED)' : 'Dúi Chết (DEATH)'} - Cá thể ${animal ? animal.animal_code : inc.animal_id}`,
          badge: inc.status === 'OPEN' ? 'Đang mở' : 'Đã đóng',
          badgeType: inc.status === 'OPEN' ? 'warning' : 'neutral',
          snippet: `Triệu chứng: ${inc.symptoms_observed} | Xử lý: ${inc.actions_taken || 'Không ghi nhận'} | Ngày phát hiện: ${new Date(inc.detected_at).toLocaleDateString('vi-VN')}`,
          actionType: 'VIEW_INCIDENT',
          id: inc.id
        });
      }
    });

    // 4. Tìm trong Thư viện thuốc (Medicines Reference)
    const medicines = this.db.getMedicines();
    medicines.forEach(med => {
      const targetStr = removeVietnameseTones(`${med.trade_name} ${med.active_ingredient} ${med.medicine_group} ${med.reference_description}`);
      const matches = searchTerms.some(term => targetStr.includes(term));
      if (matches) {
        results.push({
          category: 'THUỐC THAM KHẢO (MEDICINE)',
          title: med.trade_name,
          badge: med.medicine_group,
          badgeType: 'accent',
          snippet: `Hoạt chất: ${med.active_ingredient} | Tác dụng: ${med.reference_description} | Cảnh báo: ${med.warnings}`,
          actionType: 'VIEW_MEDICINE',
          id: med.id
        });
      }
    });

    return {
      total: results.length,
      query: rawQuery,
      results
    };
  }
}

window.farmSearch = new FarmSearchEngine(window.farmDB);

