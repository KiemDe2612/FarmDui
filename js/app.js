/**
 * Main Application Logic (js/app.js)
 * Coordinates tabs, rendering views, handling user actions, modals, and charts.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Navigation
  const navLinks = document.querySelectorAll('.nav-link');
  const tabContents = document.querySelectorAll('.tab-content');
  const pageTitle = document.getElementById('pageTitle');
  const topSearchInput = document.getElementById('topSearchInput');

  let mapEditorInstance = null;

  function switchTab(tabId, title) {
    navLinks.forEach(link => {
      if (link.getAttribute('data-tab') === tabId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    tabContents.forEach(tab => {
      if (tab.id === tabId) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    if (title && pageTitle) {
      pageTitle.textContent = title;
    }

    // Khởi tạo hoặc vẽ lại bản đồ nếu chọn tab Map
    if (tabId === 'tab-map') {
      setTimeout(() => {
        if (!mapEditorInstance) {
          mapEditorInstance = new FarmMapEditor('farmCanvas', window.farmDB);
        } else {
          mapEditorInstance.resizeCanvas();
          mapEditorInstance.render();
        }
      }, 100);
    }

    // Refresh view tương ứng
    renderCurrentTab(tabId);
  }

  window.switchTab = switchTab;

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = link.getAttribute('data-tab');
      const title = link.querySelector('.nav-text') ? link.querySelector('.nav-text').textContent : '';
      switchTab(tabId, title);
    });
  });

  // Topbar search input listener
  if (topSearchInput) {
    topSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = topSearchInput.value.trim();
        if (query) {
          switchTab('tab-search', 'Tìm Kiếm Thông Minh');
          const searchInput = document.getElementById('mainSearchInput');
          if (searchInput) {
            searchInput.value = query;
            executeSearch(query);
          }
        }
      }
    });
  }

  // --- RENDER CURRENT TAB ---
  function renderCurrentTab(tabId) {
    switch (tabId) {
      case 'tab-dashboard':
        renderDashboard();
        break;
      case 'tab-pens':
        renderPens();
        break;
      case 'tab-animals':
        renderAnimals();
        break;
      case 'tab-breeding':
        renderBreeding();
        break;
      case 'tab-health':
        renderHealthAndMedicines();
        break;
      case 'tab-incidents':
        renderIncidents();
        break;
      case 'tab-search':
        // Search triggered by input
        break;
      case 'tab-ai':
        // AI initialized
        break;
      case 'tab-backup':
        renderAuditLogs();
        break;
    }
  }

  // --- 1. DASHBOARD ---
  function renderDashboard() {
    const stats = window.farmDB.getDashboardStats();

    // Cập nhật các thẻ số liệu
    document.getElementById('statTotalAnimals').textContent = stats.totalActiveAnimals;
    document.getElementById('statSexRatio').textContent = `Đực: ${stats.maleCount} | Cái: ${stats.femaleCount} | Chưa rõ: ${stats.unknownCount}`;
    document.getElementById('statTotalPens').textContent = `${stats.activePens}/${stats.totalPens} chuồng`;
    document.getElementById('statPenDetails').textContent = `Đẻ: ${stats.breedingPens} | Trống: ${stats.emptyPens} | Cách ly: ${stats.quarantinePens}`;
    document.getElementById('statOpenIncidents').textContent = stats.openOffFeedIncidents;
    document.getElementById('statTotalDeaths').textContent = stats.totalDeaths;

    // Render danh sách sự cố gần đây
    const tbody = document.getElementById('dashboardRecentIncidentsBody');
    if (tbody) {
      tbody.innerHTML = '';
      if (!stats.recentIncidents || stats.recentIncidents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:20px;">Không có sự cố nào gần đây</td></tr>';
      } else {
        stats.recentIncidents.forEach(inc => {
          const animal = window.farmDB.getAnimalById(inc.animal_id);
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><span class="badge ${inc.incident_type === 'DEATH' ? 'badge-danger' : 'badge-warning'}">${inc.incident_type === 'DEATH' ? 'Tử vong' : 'Bỏ ăn'}</span></td>
            <td><strong>${animal ? animal.animal_code : 'N/A'}</strong></td>
            <td>${inc.symptoms_observed}</td>
            <td>${new Date(inc.detected_at).toLocaleDateString('vi-VN')}</td>
            <td><span class="badge ${inc.status === 'OPEN' ? 'badge-primary' : 'badge-secondary'}">${inc.status === 'OPEN' ? 'Đang mở' : 'Đã đóng'}</span></td>
          `;
          tbody.appendChild(tr);
        });
      }
    }
  }

  // --- 2. QUẢN LÝ CHUỒNG (PENS) ---
  function renderPens() {
    const pens = window.farmDB.getPens();
    const container = document.getElementById('pensGridContainer');
    if (!container) return;

    container.innerHTML = '';
    pens.forEach(pen => {
      const animalsInPen = window.farmDB.getAnimalsInPen(pen.id);
      let statusBadge = 'badge-success';
      let statusLabel = 'Đang nuôi';

      if (pen.status === 'BREEDING') { statusBadge = 'badge-purple'; statusLabel = 'Sinh sản'; }
      else if (pen.status === 'QUARANTINE') { statusBadge = 'badge-danger'; statusLabel = 'Cách ly'; }
      else if (pen.status === 'EMPTY' || animalsInPen.length === 0) { statusBadge = 'badge-secondary'; statusLabel = 'Trống'; }

      const card = document.createElement('div');
      card.className = 'card';
      card.style.margin = '0';
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
          <div>
            <div style="font-size:18px; font-weight:700; color:var(--dark);">Chuồng ${pen.pen_code}</div>
            <div style="font-size:12px; color:var(--text-muted);">${pen.name}</div>
          </div>
          <span class="badge ${statusBadge}">${statusLabel}</span>
        </div>
        <div style="font-size:13px; margin-bottom:10px;">
          <strong>Sức chứa:</strong> ${animalsInPen.length} / ${pen.capacity} cá thể
        </div>
        <div style="font-size:12px; background:var(--bg); padding:10px; border-radius:6px; min-height:55px; margin-bottom:12px;">
          <strong>Cá thể bên trong:</strong><br/>
          ${animalsInPen.length > 0
            ? animalsInPen.map(a => `<a href="javascript:void(0)" onclick="viewAnimalProfile('${a.id}')" style="display:inline-block; margin:2px 4px 2px 0; padding:2px 8px; background:#ffffff; border:1px solid #cbd5e1; border-radius:4px; font-weight:600; color:var(--primary); text-decoration:none;">${a.animal_code} (${a.sex === 'MALE' ? 'Đực' : (a.sex === 'FEMALE' ? 'Cái' : '?')})</a>`).join('')
            : '<span style="color:#94a3b8; font-style:italic;">Chuồng hiện đang trống</span>'}
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-bottom:12px;">
          <em>Ghi chú: ${pen.notes || 'Không có ghi chú'}</em>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-outline btn-sm" style="flex:1;" onclick="openTransferModalForPen('${pen.id}')">Chuyển Dúi Vào</button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  // --- 3. HỒ SƠ CÁ THỂ (ANIMALS) ---
  function renderAnimals() {
    const animals = window.farmDB.getAnimals();
    const tbody = document.getElementById('animalsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    animals.forEach(a => {
      const currentPen = window.farmDB.getCurrentPenForAnimal(a.id);
      const weights = window.farmDB.getWeights(a.id);
      const latestWeight = weights.length > 0 ? weights[weights.length - 1] : null;

      let statusBadge = 'badge-success';
      let statusLabel = 'Đang nuôi';
      if (a.status === 'DECEASED') { statusBadge = 'badge-danger'; statusLabel = 'Tử vong'; }
      else if (a.status === 'SOLD') { statusBadge = 'badge-secondary'; statusLabel = 'Đã bán'; }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color:var(--primary); font-size:14px;">${a.animal_code}</strong></td>
        <td>${a.name || '—'}</td>
        <td>${a.species || 'Dúi Mốc Lớn'}</td>
        <td>
          <span class="badge ${a.sex === 'MALE' ? 'badge-primary' : (a.sex === 'FEMALE' ? 'badge-purple' : 'badge-secondary')}">
            ${a.sex === 'MALE' ? 'Đực' : (a.sex === 'FEMALE' ? 'Cái' : 'Chưa rõ')}
          </span>
        </td>
        <td>${a.date_of_birth || 'Chưa rõ'}</td>
        <td>
          ${currentPen ? `<span class="badge badge-success">Chuồng ${currentPen.pen_code}</span>` : '<span style="color:#94a3b8;">Chưa gán</span>'}
        </td>
        <td>
          ${latestWeight ? `<strong>${latestWeight.weight_value} ${latestWeight.weight_unit}</strong>` : '—'}
        </td>
        <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-outline btn-sm" onclick="viewAnimalProfile('${a.id}')">Xem</button>
            <button class="btn btn-outline btn-sm" onclick="openWeightModal('${a.id}')">Cân</button>
            <button class="btn btn-outline btn-sm" onclick="openTransferModal('${a.id}')">Đổi chuồng</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // --- 4. SINH SẢN & PHẢ HỆ (BREEDING) ---
  function renderBreeding() {
    const litters = window.farmDB.getLitters();
    const tbody = document.getElementById('littersTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    litters.forEach(lit => {
      const mother = window.farmDB.getAnimalById(lit.mother_animal_id);
      const father = lit.father_animal_id ? window.farmDB.getAnimalById(lit.father_animal_id) : null;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${lit.litter_code}</strong></td>
        <td>${lit.birth_at}</td>
        <td><span class="badge badge-purple">${mother ? mother.animal_code : 'N/A'}</span></td>
        <td><span class="badge badge-primary">${father ? father.animal_code : 'Chưa rõ'}</span></td>
        <td>${lit.total_born} con (Sống: <strong>${lit.alive_count}</strong>, Chết: ${lit.deceased_count})</td>
        <td>${lit.notes || '—'}</td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="openRegisterLitterMemberModal('${lit.id}')">+ Cấp Mã Dúi Con</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Populate đực và cái vào form kiểm tra cận huyết
    const maleSelect = document.getElementById('inbreedMaleSelect');
    const femaleSelect = document.getElementById('inbreedFemaleSelect');
    if (maleSelect && femaleSelect) {
      const males = window.farmDB.getAnimals().filter(a => a.sex === 'MALE' && a.status === 'ACTIVE');
      const females = window.farmDB.getAnimals().filter(a => a.sex === 'FEMALE' && a.status === 'ACTIVE');

      maleSelect.innerHTML = males.map(m => `<option value="${m.id}">${m.animal_code} - ${m.name || 'Đực'}</option>`).join('');
      femaleSelect.innerHTML = females.map(f => `<option value="${f.id}">${f.animal_code} - ${f.name || 'Cái'}</option>`).join('');
    }
  }

  // --- 5. SỨC KHỎE & THUỐC THAM KHẢO ---
  function renderHealthAndMedicines() {
    // Thuốc tham khảo
    const meds = window.farmDB.getMedicines();
    const medContainer = document.getElementById('medicinesContainer');
    if (medContainer) {
      medContainer.innerHTML = '';
      meds.forEach(m => {
        const div = document.createElement('div');
        div.className = 'card';
        div.style.marginBottom = '12px';
        div.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-size:15px; font-weight:700; color:var(--dark);">${m.trade_name}</div>
            <span class="badge badge-primary">${m.medicine_group}</span>
          </div>
          <div style="font-size:13px; margin-bottom:6px;"><strong>Hoạt chất:</strong> ${m.active_ingredient}</div>
          <div style="font-size:12.5px; color:var(--text); margin-bottom:8px;"><strong>Chỉ định tham khảo:</strong> ${m.reference_description}</div>
          <div style="font-size:12px; background:var(--warning-light); color:#b45309; padding:8px 12px; border-radius:6px; margin-bottom:6px;">
            <strong>Lưu ý / Cảnh báo:</strong> ${m.warnings}
          </div>
          <div style="font-size:11px; color:var(--text-muted);"><em>Nguồn tài liệu: ${m.source_reference}</em></div>
        `;
        medContainer.appendChild(div);
      });
    }

    // Bệnh án
    const healthRecords = window.farmDB.getHealthRecords();
    const healthTbody = document.getElementById('healthRecordsTableBody');
    if (healthTbody) {
      healthTbody.innerHTML = '';
      healthRecords.forEach(hr => {
        const animal = window.farmDB.getAnimalById(hr.animal_id);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${animal ? animal.animal_code : 'N/A'}</strong></td>
          <td>${new Date(hr.detected_at).toLocaleDateString('vi-VN')}</td>
          <td>${hr.diagnosis_text}</td>
          <td><span class="badge ${hr.severity === 'SEVERE' ? 'badge-danger' : 'badge-warning'}">${hr.severity}</span></td>
          <td>${hr.recorded_by}</td>
          <td><span class="badge ${hr.status === 'OPEN' ? 'badge-primary' : 'badge-secondary'}">${hr.status}</span></td>
        `;
        healthTbody.appendChild(tr);
      });
    }
  }

  // --- 6. NHẬT KÝ SỰ CỐ (INCIDENTS) ---
  function renderIncidents() {
    const incidents = window.farmDB.getIncidents();
    const tbody = document.getElementById('incidentsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    incidents.forEach(inc => {
      const animal = window.farmDB.getAnimalById(inc.animal_id);
      const pen = inc.pen_id ? window.farmDB.getPenById(inc.pen_id) : null;

      const isDeath = inc.incident_type === 'DEATH';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="badge ${isDeath ? 'badge-danger' : 'badge-warning'}">${isDeath ? 'Dúi Chết (DEATH)' : 'Dúi Bỏ Ăn (OFF_FEED)'}</span></td>
        <td><strong style="color:var(--primary);">${animal ? animal.animal_code : 'N/A'}</strong></td>
        <td>${pen ? pen.pen_code : '—'}</td>
        <td>${new Date(inc.detected_at).toLocaleString('vi-VN')}</td>
        <td>${inc.symptoms_observed}</td>
        <td>${inc.actions_taken || '—'}</td>
        <td><span class="badge ${inc.status === 'OPEN' ? 'badge-primary' : 'badge-secondary'}">${inc.status === 'OPEN' ? 'Đang mở' : 'Đã đóng'}</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            ${!isDeath && inc.status === 'OPEN' ? `
              <button class="btn btn-outline btn-sm" onclick="openAddFollowUpModal('${inc.id}')">+ Cập nhật</button>
              <button class="btn btn-success btn-sm" onclick="openCloseIncidentModal('${inc.id}')">Đóng ca</button>
            ` : '<span style="color:#94a3b8; font-size:12px;">Đã hoàn thành</span>'}
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // --- 7. TÌM KIẾM THÔNG MINH ---
  function executeSearch(query) {
    const searchResultsDiv = document.getElementById('searchResultsContainer');
    const searchStatsSpan = document.getElementById('searchStats');
    if (!searchResultsDiv) return;

    const data = window.farmSearch.search(query);
    if (searchStatsSpan) {
      searchStatsSpan.textContent = `Tìm thấy ${data.total} kết quả phù hợp cho "${query}"`;
    }

    searchResultsDiv.innerHTML = '';
    if (data.results.length === 0) {
      searchResultsDiv.innerHTML = `
        <div style="text-align:center; padding:40px; color:#94a3b8;">
          <div style="font-size:36px; margin-bottom:10px;">🔍</div>
          <div>Không tìm thấy dữ liệu nào phù hợp với từ khóa này.</div>
          <div style="font-size:12px; margin-top:6px;">Thử gõ mã cá thể (ví dụ <code>D001</code>), chuồng (ví dụ <code>A01</code>), hoặc triệu chứng (ví dụ <code>tieu chay</code>, <code>bo an</code>)...</div>
        </div>
      `;
      return;
    }

    data.results.forEach(res => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.marginBottom = '12px';
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div>
            <span style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">${res.category}</span>
            <div style="font-size:16px; font-weight:700; color:var(--dark); margin-top:2px;">${res.title}</div>
          </div>
          <span class="badge badge-${res.badgeType}">${res.badge}</span>
        </div>
        <div style="font-size:13px; color:var(--text); margin-bottom:10px;">${res.snippet}</div>
        <div>
          ${res.actionType === 'VIEW_ANIMAL' ? `<button class="btn btn-outline btn-sm" onclick="viewAnimalProfile('${res.id}')">Xem hồ sơ cá thể</button>` : ''}
          ${res.actionType === 'VIEW_PEN' ? `<button class="btn btn-outline btn-sm" onclick="switchTab('tab-pens', 'Danh Mục Chuồng')">Xem danh mục chuồng</button>` : ''}
          ${res.actionType === 'VIEW_INCIDENT' ? `<button class="btn btn-outline btn-sm" onclick="switchTab('tab-incidents', 'Nhật Ký Sự Cố')">Xem nhật ký sự cố</button>` : ''}
          ${res.actionType === 'VIEW_MEDICINE' ? `<button class="btn btn-outline btn-sm" onclick="switchTab('tab-health', 'Sức Khỏe & Thuốc')">Xem thư viện thuốc</button>` : ''}
        </div>
      `;
      searchResultsDiv.appendChild(card);
    });
  }

  const mainSearchBtn = document.getElementById('mainSearchBtn');
  const mainSearchInput = document.getElementById('mainSearchInput');
  if (mainSearchBtn && mainSearchInput) {
    mainSearchBtn.addEventListener('click', () => {
      executeSearch(mainSearchInput.value);
    });
    mainSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') executeSearch(mainSearchInput.value);
    });
  }

  // --- 8. TRỢ LÝ AI (AI FARM ASSISTANT) ---
  const aiChatMessages = document.getElementById('aiChatMessages');
  const aiInput = document.getElementById('aiChatInput');
  const aiSendBtn = document.getElementById('aiChatSendBtn');

  function sendAIMessage(text) {
    if (!text || !text.trim()) return;
    const q = text.trim();

    // Append User message
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user';
    userBubble.textContent = q;
    aiChatMessages.appendChild(userBubble);
    aiInput.value = '';

    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;

    // Call AI engine
    setTimeout(() => {
      const response = window.farmAI.ask(q);
      const botBubble = document.createElement('div');
      botBubble.className = 'chat-bubble bot';

      // Convert simple markdown formatting
      let formattedText = response.reply
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br/>');

      let sourceHtml = '';
      if (response.sources && response.sources.length > 0) {
        sourceHtml = `<div class="chat-source">📌 Nguồn trích dẫn: ${response.sources.join(', ')}</div>`;
      }

      botBubble.innerHTML = `<div>${formattedText}</div>${sourceHtml}`;
      aiChatMessages.appendChild(botBubble);
      aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
    }, 300);
  }

  if (aiSendBtn && aiInput) {
    aiSendBtn.addEventListener('click', () => sendAIMessage(aiInput.value));
    aiInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendAIMessage(aiInput.value);
    });
  }

  // Quick prompt pills
  document.querySelectorAll('.prompt-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      sendAIMessage(pill.textContent);
    });
  });

  // --- 9. AUDIT LOGS & SAO LƯU ---
  function renderAuditLogs() {
    const logs = window.farmDB.getAuditLogs();
    const tbody = document.getElementById('auditLogsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    logs.forEach(log => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${new Date(log.time).toLocaleString('vi-VN')}</td>
        <td><strong>${log.actor}</strong></td>
        <td><span class="badge badge-secondary">${log.action}</span></td>
        <td>${log.details}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Xuất file JSON
  const btnExportJSON = document.getElementById('btnExportJSON');
  if (btnExportJSON) {
    btnExportJSON.addEventListener('click', () => {
      const jsonStr = window.farmDB.exportDataJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Farm_Backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // Nhập file JSON
  const fileImportInput = document.getElementById('fileImportInput');
  if (fileImportInput) {
    fileImportInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          window.farmDB.importDataJSON(event.target.result);
          alert('Khôi phục dữ liệu từ file JSON thành công!');
          location.reload();
        } catch (err) {
          alert('Lỗi: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  // Khôi phục dữ liệu mặc định
  const btnResetDefault = document.getElementById('btnResetDefault');
  if (btnResetDefault) {
    btnResetDefault.addEventListener('click', () => {
      if (confirm('Bạn có chắc chắn muốn đặt lại dữ liệu mẫu gốc không? Mọi dữ liệu sửa đổi sẽ bị thay thế.')) {
        window.farmDB.resetToDefault();
        alert('Đã khôi phục dữ liệu mẫu gốc!');
        location.reload();
      }
    });
  }

  // Khởi chạy tab đầu tiên
  renderDashboard();
});

// --- GLOBAL MODAL FUNCTIONS ---

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

// 1. Hồ sơ chi tiết cá thể
function viewAnimalProfile(animalId) {
  const animal = window.farmDB.getAnimalById(animalId);
  if (!animal) return;

  const currentPen = window.farmDB.getCurrentPenForAnimal(animal.id);
  const weights = window.farmDB.getWeights(animal.id);
  const pedigree = window.farmDB.getPedigree(animal.id);

  document.getElementById('profileAnimalCode').textContent = animal.animal_code;
  document.getElementById('profileAnimalName').textContent = animal.name || 'Chưa đặt tên';
  document.getElementById('profileSpecies').textContent = animal.species || 'Dúi Mốc Lớn';
  document.getElementById('profileSex').textContent = animal.sex === 'MALE' ? 'Đực' : (animal.sex === 'FEMALE' ? 'Cái' : 'Chưa rõ');
  document.getElementById('profileDOB').textContent = `${animal.date_of_birth || 'Chưa rõ'} (${animal.birth_date_precision || 'EXACT'})`;
  document.getElementById('profileOrigin').textContent = animal.origin_type === 'BORN' ? 'Sinh tại trại' : 'Mua về';
  document.getElementById('profileStatus').textContent = animal.status === 'ACTIVE' ? 'Đang nuôi' : (animal.status === 'DECEASED' ? 'Tử vong' : animal.status);
  document.getElementById('profilePen').textContent = currentPen ? `Chuồng ${currentPen.pen_code} (${currentPen.name})` : 'Chưa phân chuồng';
  document.getElementById('profileNotes').textContent = animal.notes || 'Không có ghi chú';

  // Bố mẹ
  document.getElementById('profileParents').textContent = `Bố: ${pedigree.father ? pedigree.father.animal_code : 'Chưa rõ'} | Mẹ: ${pedigree.mother ? pedigree.mother.animal_code : 'Chưa rõ'}`;

  // Lịch sử cân nặng
  const weightTbody = document.getElementById('profileWeightsTbody');
  weightTbody.innerHTML = '';
  if (weights.length === 0) {
    weightTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Chưa có dữ liệu cân</td></tr>';
  } else {
    weights.forEach(w => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${w.measured_at}</td>
        <td><strong>${w.weight_value} ${w.weight_unit}</strong></td>
        <td>${w.recorded_by}</td>
        <td>${w.note || '—'}</td>
      `;
      weightTbody.appendChild(tr);
    });
  }

  const modal = document.getElementById('modalAnimalProfile');
  if (modal) modal.classList.add('active');
}

// 2. Thêm cân nặng
function openWeightModal(animalId) {
  const animal = window.farmDB.getAnimalById(animalId);
  if (!animal) return;

  document.getElementById('weightAnimalId').value = animal.id;
  document.getElementById('weightAnimalLabel').textContent = `${animal.animal_code} - ${animal.name || ''}`;
  document.getElementById('weightValueInput').value = '';
  document.getElementById('weightNoteInput').value = '';

  const modal = document.getElementById('modalAddWeight');
  if (modal) modal.classList.add('active');
}

function submitAddWeight() {
  const animalId = document.getElementById('weightAnimalId').value;
  const val = document.getElementById('weightValueInput').value;
  const note = document.getElementById('weightNoteInput').value;

  if (!val || parseFloat(val) <= 0) {
    alert('Vui lòng nhập trọng lượng hợp lệ!');
    return;
  }

  window.farmDB.addWeight(animalId, val, 'kg', note, 'Quản Lý Trại');
  closeModal('modalAddWeight');
  alert('Đã lưu dữ liệu cân thành công!');
  window.switchTab('tab-animals', 'Hồ Sơ Cá Thể');
}

// 3. Chuyển chuồng
function openTransferModal(animalId) {
  const animal = window.farmDB.getAnimalById(animalId);
  if (!animal) return;

  document.getElementById('transferAnimalId').value = animal.id;
  document.getElementById('transferAnimalLabel').textContent = `${animal.animal_code} - ${animal.name || ''}`;

  const currentPen = window.farmDB.getCurrentPenForAnimal(animal.id);
  document.getElementById('transferCurrentPen').textContent = currentPen ? `Chuồng ${currentPen.pen_code} (${currentPen.name})` : 'Chưa phân chuồng';

  const select = document.getElementById('transferPenSelect');
  const pens = window.farmDB.getPens();
  select.innerHTML = pens.map(p => `<option value="${p.id}" ${currentPen && currentPen.id === p.id ? 'selected' : ''}>Chuồng ${p.pen_code} - ${p.name} (${p.status})</option>`).join('');

  const modal = document.getElementById('modalTransferAnimal');
  if (modal) modal.classList.add('active');
}

function submitTransferAnimal() {
  const animalId = document.getElementById('transferAnimalId').value;
  const newPenId = document.getElementById('transferPenSelect').value;
  const reason = document.getElementById('transferReasonInput').value || 'Điều chuyển chuồng';

  window.farmDB.transferAnimal(animalId, newPenId, reason, 'Quản Lý Trại');
  closeModal('modalTransferAnimal');
  alert('Đã chuyển chuồng cho cá thể thành công!');
  window.switchTab('tab-animals', 'Hồ Sơ Cá Thể');
}

// 4. Thêm cá thể mới
function openAddAnimalModal() {
  document.getElementById('newAnimalCode').value = 'D00' + (window.farmDB.getAnimals().length + 1);
  document.getElementById('newAnimalName').value = '';
  document.getElementById('newAnimalNotes').value = '';

  const penSelect = document.getElementById('newAnimalPenSelect');
  const pens = window.farmDB.getPens();
  penSelect.innerHTML = '<option value="">-- Chưa gán chuồng --</option>' +
    pens.map(p => `<option value="${p.id}">Chuồng ${p.pen_code} - ${p.name}</option>`).join('');

  const modal = document.getElementById('modalAddAnimal');
  if (modal) modal.classList.add('active');
}

function submitAddAnimal() {
  const code = document.getElementById('newAnimalCode').value.trim();
  const name = document.getElementById('newAnimalName').value.trim();
  const species = document.getElementById('newAnimalSpecies').value;
  const sex = document.getElementById('newAnimalSex').value;
  const dob = document.getElementById('newAnimalDOB').value;
  const origin = document.getElementById('newAnimalOrigin').value;
  const penId = document.getElementById('newAnimalPenSelect').value;
  const notes = document.getElementById('newAnimalNotes').value;

  if (!code) {
    alert('Vui lòng nhập mã định danh duy nhất (ví dụ: D008)!');
    return;
  }

  try {
    const animal = window.farmDB.saveAnimal({
      animal_code: code,
      name,
      species,
      sex,
      date_of_birth: dob || null,
      birth_date_precision: 'EXACT',
      origin_type: origin,
      status: 'ACTIVE',
      notes
    });

    if (penId) {
      window.farmDB.transferAnimal(animal.id, penId, 'Gán chuồng ban đầu', 'Quản Lý');
    }

    closeModal('modalAddAnimal');
    alert(`Đã thêm mới cá thể ${code} thành công!`);
    window.switchTab('tab-animals', 'Hồ Sơ Cá Thể');
  } catch (err) {
    alert(err.message);
  }
}

// 5. Ghi nhận sự cố OFF_FEED hoặc DEATH
function openIncidentModal(type) {
  document.getElementById('incidentTypeInput').value = type;
  document.getElementById('incidentModalTitle').textContent = type === 'DEATH' ? 'Ghi Nhận Dúi Chết (DEATH)' : 'Ghi Nhận Dúi Bỏ Ăn (OFF_FEED)';

  const animalSelect = document.getElementById('incidentAnimalSelect');
  const activeAnimals = window.farmDB.getAnimals().filter(a => a.status === 'ACTIVE');
  animalSelect.innerHTML = activeAnimals.map(a => `<option value="${a.id}">${a.animal_code} - ${a.name || 'Dúi'}</option>`).join('');

  document.getElementById('incidentSymptomsInput').value = '';
  document.getElementById('incidentActionsInput').value = '';

  const deathWarning = document.getElementById('incidentDeathWarning');
  if (deathWarning) {
    deathWarning.style.display = type === 'DEATH' ? 'block' : 'none';
  }

  const modal = document.getElementById('modalCreateIncident');
  if (modal) modal.classList.add('active');
}

function submitCreateIncident() {
  const type = document.getElementById('incidentTypeInput').value;
  const animalId = document.getElementById('incidentAnimalSelect').value;
  const symptoms = document.getElementById('incidentSymptomsInput').value.trim();
  const actions = document.getElementById('incidentActionsInput').value.trim();

  if (!animalId || !symptoms) {
    alert('Vui lòng chọn cá thể và nhập triệu chứng quan sát được!');
    return;
  }

  try {
    window.farmDB.createIncident({
      incident_type: type,
      animal_id: animalId,
      symptoms_observed: symptoms,
      actions_taken: actions,
      recorded_by: 'Quản Lý Trại'
    });

    closeModal('modalCreateIncident');
    alert(type === 'DEATH'
      ? 'Đã ghi nhận tử vong. Trạng thái cá thể đã cập nhật thành DECEASED và chuồng đã được giải phóng.'
      : 'Đã tạo ca bỏ ăn (OFF_FEED) thành công.');

    window.switchTab('tab-incidents', 'Nhật Ký Sự Cố');
  } catch (err) {
    alert(err.message);
  }
}

// 6. Cập nhật follow-up cho sự cố
function openAddFollowUpModal(incId) {
  document.getElementById('followUpIncidentId').value = incId;
  document.getElementById('followUpNoteInput').value = '';
  const modal = document.getElementById('modalAddFollowUp');
  if (modal) modal.classList.add('active');
}

function submitAddFollowUp() {
  const incId = document.getElementById('followUpIncidentId').value;
  const note = document.getElementById('followUpNoteInput').value.trim();
  if (!note) {
    alert('Vui lòng nhập nội dung theo dõi!');
    return;
  }

  window.farmDB.addIncidentFollowUp(incId, note, 'Quản Lý Trại');
  closeModal('modalAddFollowUp');
  alert('Đã lưu ghi chú theo dõi!');
  window.switchTab('tab-incidents', 'Nhật Ký Sự Cố');
}

// 7. Đóng ca sự cố
function openCloseIncidentModal(incId) {
  document.getElementById('closeIncidentId').value = incId;
  document.getElementById('closeOutcomeInput').value = '';
  const modal = document.getElementById('modalCloseIncident');
  if (modal) modal.classList.add('active');
}

function submitCloseIncident() {
  const incId = document.getElementById('closeIncidentId').value;
  const outcome = document.getElementById('closeOutcomeInput').value.trim();
  if (!outcome) {
    alert('Vui lòng nhập kết quả xử lý trước khi đóng ca!');
    return;
  }

  window.farmDB.closeIncident(incId, outcome, 'Quản Lý Trại');
  closeModal('modalCloseIncident');
  alert('Đã đóng ca sự cố thành công!');
  window.switchTab('tab-incidents', 'Nhật Ký Sự Cố');
}

// 8. Tạo lứa đẻ mới
function openCreateLitterModal() {
  document.getElementById('litterCodeInput').value = 'LIT-' + new Date().getFullYear() + '-0' + (window.farmDB.getLitters().length + 1);

  const motherSelect = document.getElementById('litterMotherSelect');
  const fatherSelect = document.getElementById('litterFatherSelect');

  const females = window.farmDB.getAnimals().filter(a => a.sex === 'FEMALE');
  const males = window.farmDB.getAnimals().filter(a => a.sex === 'MALE');

  motherSelect.innerHTML = females.map(f => `<option value="${f.id}">${f.animal_code} - ${f.name || 'Cái'}</option>`).join('');
  fatherSelect.innerHTML = '<option value="">-- Chưa rõ bố --</option>' +
    males.map(m => `<option value="${m.id}">${m.animal_code} - ${m.name || 'Đực'}</option>`).join('');

  document.getElementById('litterBirthDateInput').value = new Date().toISOString().split('T')[0];
  document.getElementById('litterTotalBornInput').value = '3';
  document.getElementById('litterAliveCountInput').value = '3';
  document.getElementById('litterDeceasedCountInput').value = '0';
  document.getElementById('litterNotesInput').value = '';

  const modal = document.getElementById('modalCreateLitter');
  if (modal) modal.classList.add('active');
}

function submitCreateLitter() {
  const code = document.getElementById('litterCodeInput').value.trim();
  const motherId = document.getElementById('litterMotherSelect').value;
  const fatherId = document.getElementById('litterFatherSelect').value;
  const birthAt = document.getElementById('litterBirthDateInput').value;
  const total = document.getElementById('litterTotalBornInput').value;
  const alive = document.getElementById('litterAliveCountInput').value;
  const deceased = document.getElementById('litterDeceasedCountInput').value;
  const notes = document.getElementById('litterNotesInput').value;

  if (!code || !motherId) {
    alert('Vui lòng nhập mã lứa và chọn mẹ!');
    return;
  }

  window.farmDB.createLitter({
    litter_code: code,
    mother_animal_id: motherId,
    father_animal_id: fatherId || null,
    birth_at: birthAt,
    total_born: total,
    alive_count: alive,
    deceased_count: deceased,
    notes
  });

  closeModal('modalCreateLitter');
  alert(`Đã ghi nhận lứa đẻ ${code} thành công!`);
  window.switchTab('tab-breeding', 'Sinh Sản & Phả Hệ');
}

// 9. Cấp mã cá thể con từ lứa đẻ (Tách đàn)
function openRegisterLitterMemberModal(litterId) {
  document.getElementById('registerMemberLitterId').value = litterId;
  document.getElementById('registerMemberCodeInput').value = 'D00' + (window.farmDB.getAnimals().length + 1);
  document.getElementById('registerMemberNameInput').value = '';

  const penSelect = document.getElementById('registerMemberPenSelect');
  penSelect.innerHTML = '<option value="">-- Chưa phân chuồng --</option>' +
    window.farmDB.getPens().map(p => `<option value="${p.id}">Chuồng ${p.pen_code} - ${p.name}</option>`).join('');

  const modal = document.getElementById('modalRegisterLitterMember');
  if (modal) modal.classList.add('active');
}

function submitRegisterLitterMember() {
  const litterId = document.getElementById('registerMemberLitterId').value;
  const code = document.getElementById('registerMemberCodeInput').value.trim();
  const name = document.getElementById('registerMemberNameInput').value.trim();
  const sex = document.getElementById('registerMemberSexSelect').value;
  const penId = document.getElementById('registerMemberPenSelect').value;

  if (!code) {
    alert('Vui lòng nhập mã ID cho cá thể con!');
    return;
  }

  try {
    window.farmDB.registerLitterMemberAsAnimal({
      litter_id: litterId,
      animal_code: code,
      name,
      sex,
      pen_id: penId || null,
      recorded_by: 'Quản Lý Trại'
    });

    closeModal('modalRegisterLitterMember');
    alert(`Đã cấp mã định danh ${code} và đưa vào danh sách cá thể trang trại!`);
    window.switchTab('tab-breeding', 'Sinh Sản & Phả Hệ');
  } catch (err) {
    alert(err.message);
  }
}

// 10. Kiểm tra nguy cơ cận huyết
function checkInbreeding() {
  const maleId = document.getElementById('inbreedMaleSelect').value;
  const femaleId = document.getElementById('inbreedFemaleSelect').value;
  const resultDiv = document.getElementById('inbreedingResult');

  const check = window.farmDB.checkInbreedingRisk(maleId, femaleId);

  let alertClass = 'badge-success';
  if (check.risk === 'EXTREME') alertClass = 'badge-danger';
  else if (check.risk === 'HIGH') alertClass = 'badge-warning';

  resultDiv.innerHTML = `
    <div style="padding:14px; border-radius:8px; background:${check.risk === 'LOW' ? 'var(--success-light)' : (check.risk === 'HIGH' ? 'var(--warning-light)' : 'var(--danger-light)')}; border:1px solid ${check.risk === 'LOW' ? 'var(--success)' : (check.risk === 'HIGH' ? 'var(--warning)' : 'var(--danger)')};">
      <div style="font-size:14px; font-weight:700; color:var(--dark); margin-bottom:4px;">
        Đánh giá nguy cơ: <span class="badge ${alertClass}">${check.risk}</span>
      </div>
      <div style="font-size:13px; color:var(--text);">${check.reason}</div>
    </div>
  `;
}

// Map selection handler
window.onSelectPenBlock = function(penId) {
  const pen = window.farmDB.getPenById(penId);
  if (!pen) return;
  const animals = window.farmDB.getAnimalsInPen(penId);

  const infoDiv = document.getElementById('mapSelectedPenInfo');
  if (infoDiv) {
    infoDiv.innerHTML = `
      <div style="font-size:16px; font-weight:700; color:var(--dark);">Chuồng ${pen.pen_code} - ${pen.name}</div>
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">Trạng thái: <strong>${pen.status}</strong> | Sức chứa: <strong>${animals.length}/${pen.capacity}</strong></div>
      <div style="font-size:13px;">
        <strong>Cá thể trong chuồng:</strong><br/>
        ${animals.length > 0
          ? animals.map(a => `<span class="badge badge-primary" style="margin:2px 4px 2px 0;">${a.animal_code} (${a.sex === 'MALE' ? 'Đực' : 'Cái'})</span>`).join('')
          : '<em style="color:#94a3b8;">Không có cá thể nào</em>'}
      </div>
    `;
  }
};

window.onDeselectBlock = function() {
  const infoDiv = document.getElementById('mapSelectedPenInfo');
  if (infoDiv) {
    infoDiv.innerHTML = `<span style="color:#94a3b8; font-style:italic;">Bấm vào một ô chuồng trên bản đồ để xem chi tiết</span>`;
  }
};
