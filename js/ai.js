/**
 * Module Trợ Lý AI Trang Trại Dúi (AI Farm Assistant)
 * Tuân thủ yêu cầu 01_PRODUCT_REQUIREMENTS.md:
 * - Trả lời dựa trên dữ liệu có thật trong CSDL trang trại.
 * - Trích dẫn nguồn / mã bản ghi liên quan (Cá thể, Chuồng, Sự cố).
 * - QUY TẮC BẮT BUỘC: AI không được tự đề xuất liều tiêm kháng sinh hoặc phác đồ điều trị
 *   chưa kiểm chứng khi chưa có chỉ định của bác sĩ thú y.
 */

class FarmAIAssistant {
  constructor(db) {
    this.db = db;
    this.history = [];
  }

  ask(question) {
    const q = question.trim().toLowerCase();
    const cleanQ = removeVietnameseTones(q);

    let reply = '';
    let sources = [];

    // 1. Câu hỏi thống kê chung
    if (cleanQ.includes('thong ke') || cleanQ.includes('bao nhieu con') || cleanQ.includes('tong so') || cleanQ.includes('hien trang')) {
      const stats = this.db.getDashboardStats();
      reply = `**Báo cáo hiện trạng trang trại:**\n` +
        `- Tổng số cá thể đang nuôi: **${stats.totalActiveAnimals} con** (Đực: ${stats.maleCount}, Cái: ${stats.femaleCount}, Chưa rõ: ${stats.unknownCount})\n` +
        `- Tổng số ô chuồng: **${stats.totalPens} ô** (Đang sử dụng: ${stats.activePens}, Sinh sản: ${stats.breedingPens}, Trống: ${stats.emptyPens}, Cách ly: ${stats.quarantinePens})\n` +
        `- Ca bỏ ăn (OFF_FEED) đang mở: **${stats.openOffFeedIncidents} ca**\n` +
        `- Tổng số ca tử vong ghi nhận: **${stats.totalDeaths} ca**`;
      sources.push('Báo cáo thống kê Dashboard');
    }
    // 2. Tra cứu cá thể theo mã ID (ví dụ: D001, D007)
    else if (/d\d{3}/i.test(q)) {
      const match = q.match(/d\d{3}/i);
      const code = match[0].toUpperCase();
      const animal = this.db.getAnimalByCode(code);

      if (animal) {
        const pen = this.db.getCurrentPenForAnimal(animal.id);
        const weights = this.db.getWeights(animal.id);
        const latestWeight = weights.length > 0 ? weights[weights.length - 1] : null;

        reply = `**Thông tin hồ sơ cá thể [${animal.animal_code}]:**\n` +
          `- Tên gọi: **${animal.name || 'Chưa đặt tên'}**\n` +
          `- Giống loài: ${animal.species || 'Dúi Mốc'}\n` +
          `- Giới tính: **${animal.sex === 'MALE' ? 'Đực' : (animal.sex === 'FEMALE' ? 'Cái' : 'Chưa xác định')}**\n` +
          `- Trạng thái: **${animal.status === 'ACTIVE' ? 'Đang nuôi' : (animal.status === 'DECEASED' ? 'Đã chết' : animal.status)}**\n` +
          `- Vị trí chuồng hiện tại: **${pen ? `Chuồng ${pen.pen_code} (${pen.name})` : 'Chưa phân chuồng'}**\n` +
          `- Trọng lượng gần nhất: **${latestWeight ? `${latestWeight.weight_value} ${latestWeight.weight_unit} (${latestWeight.measured_at})` : 'Chưa có dữ liệu cân'}**\n` +
          `- Ghi chú: ${animal.notes || 'Không có'}`;
        sources.push(`Hồ sơ cá thể: ${animal.animal_code}`);
      } else {
        reply = `Không tìm thấy cá thể nào có mã định danh **${code}** trong hệ thống dữ liệu trang trại.`;
      }
    }
    // 3. Tra cứu ca bỏ ăn hoặc dúi ốm
    else if (cleanQ.includes('bo an') || cleanQ.includes('bo mia') || cleanQ.includes('om') || cleanQ.includes('su co')) {
      const incidents = this.db.getIncidents().filter(i => i.incident_type === 'OFF_FEED');
      const openCases = incidents.filter(i => i.status === 'OPEN');

      if (openCases.length > 0) {
        reply = `**Hiện tại trang trại đang có ${openCases.length} ca bỏ ăn (OFF_FEED) đang mở cần theo dõi:**\n\n`;
        openCases.forEach((inc, idx) => {
          const animal = this.db.getAnimalById(inc.animal_id);
          const pen = inc.pen_id ? this.db.getPenById(inc.pen_id) : null;
          reply += `${idx + 1}. **Cá thể ${animal ? animal.animal_code : 'N/A'}** (Tại ${pen ? pen.pen_code : 'Chưa rõ chuồng'}):\n` +
            `   - Biểu hiện: ${inc.symptoms_observed}\n` +
            `   - Xử lý: ${inc.actions_taken}\n` +
            `   - Theo dõi: ${inc.follow_up_notes.length > 0 ? inc.follow_up_notes[inc.follow_up_notes.length - 1].note : 'Chưa có cập nhật'}\n\n`;
          sources.push(`Sự cố ID: ${inc.id}`);
        });
      } else {
        reply = `Hiện tại không có ca bỏ ăn (OFF_FEED) nào đang mở trong trại. Tất cả cá thể đều ăn uống bình thường.`;
      }
    }
    // 4. Tra cứu thuốc hoặc hỏi về điều trị / tiêm thuốc
    else if (cleanQ.includes('thuoc') || cleanQ.includes('tiem') || cleanQ.includes('khang sinh') || cleanQ.includes('chua benh') || cleanQ.includes('lieu luong')) {
      // KIỂM TRA QUY TẮC CỐT LÕI: KHÔNG TỰ BỊA LIỀU TIÊM KHÁNG SINH
      const meds = this.db.getMedicines();
      reply = `**Thông tin tra cứu từ Thư Viện Thuốc Tham Khảo:**\n\n`;
      meds.forEach(m => {
        reply += `🔹 **${m.trade_name}** (${m.medicine_group}):\n` +
          `   - Hoạt chất: ${m.active_ingredient}\n` +
          `   - Tham khảo: ${m.reference_description}\n` +
          `   - Lưu ý: ${m.warnings}\n\n`;
      });

      reply += `⚠️ **CẢNH BÁO AN TOÀN Y TẾ & THÚ Y QUAN TRỌNG:**\n` +
        `Trợ lý AI **tuyệt đối không tự ý kê đơn hoặc chỉ định liều lượng tiêm kháng sinh** cho thú gặm nhấm khi chưa có chỉ định trực tiếp từ Bác sĩ Thú y chuyên khoa. Việc tiêm sai liều hoặc dùng kháng sinh tùy tiện có thể gây liệt ruột và tử vong cho dúi!`;
      sources.push('Thư viện thuốc tham khảo nội bộ');
    }
    // 5. Cảnh báo cận huyết / sinh sản
    else if (cleanQ.includes('can huyet') || cleanQ.includes('phoi giong') || cleanQ.includes('pha he') || cleanQ.includes('ghep doi')) {
      reply = `**Quy trình ghép phối giống & Kiểm soát cận huyết:**\n` +
        `1. Trước khi ghép đực và cái, hệ thống sẽ tự động đối chiếu phả hệ (Pedigree) 3 đời.\n` +
        `2. Các trường hợp bị cảnh báo nghiêm ngặt:\n` +
        `   - Bố ghép với con gái hoặc Mẹ ghép với con trai (Cận huyết bậc 1 - CỰC KỲ NGUY HIỂM).\n` +
        `   - Anh chị em ruột cùng bố/mẹ ghép với nhau.\n` +
        `3. Hãy vào tab **"Sinh Sản & Phả Hệ"** để sử dụng công cụ kiểm tra độ tương thích trước khi thả ghép chuồng.`;
      sources.push('Quy chuẩn phả hệ & giống Farm Management');
    }
    // 6. Mặc định
    else {
      reply = `Chào bạn! Tôi là **Trợ Lý AI Trang Trại Dúi**.\n` +
        `Tôi có thể hỗ trợ bạn tra cứu nhanh các thông tin sau:\n` +
        `- 📊 **Báo cáo tổng quan:** *"Thống kê số lượng dúi hiện tại"*\n` +
        `- 🦔 **Hồ sơ cá thể:** *"Thông tin cá thể D001"*, *"D007"*...\n` +
        `- ⚠️ **Tình hình sức khỏe:** *"Những ca bỏ ăn đang mở"*, *"Dúi nào đang cách ly"*\n` +
        `- 💊 **Thuốc tham khảo:** *"Tra cứu danh mục thuốc"* (Tuân thủ cảnh báo thú y)\n` +
        `- 🧬 **Kiểm tra cận huyết:** *"Cách phòng tránh trùng huyết khi ghép đôi"*`;
    }

    const message = {
      question,
      reply,
      sources,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };

    this.history.push(message);
    return message;
  }
}

window.farmAI = new FarmAIAssistant(window.farmDB);

