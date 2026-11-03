/**
 * Main Application Logic (js/app.js)
 * Taste-skill compliant: quiet navigation, honest data, tabular figures, no slop.
 */

document.addEventListener('DOMContentLoaded', () => {
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

    if (tabId === 'tab-map') {
      setTimeout(() => {
        if (!mapEditorInstance) {
          mapEditorInstance = new FarmMapEditor('farmCanvas', window.farmDB);
        } else {
          mapEditorInstance.resizeCanvas();
          mapEditorInstance.render();
        }
      }, 80);
    }

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

  if (topSearchInput) {
    topSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = topSearchInput.value.trim();
        if (query) {
          switchTab('tab-search', 'Tìm kiếm thông minh');
          const searchInput = document.getElementById('mainSearchInput');
          if (searchInput) {
            searchInput.value = query;
            executeSearch(query);
          }
        }
      }
    });
  }

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
        break;
      case 'tab-ai':
        break;
      case 'tab-backup':
        renderAuditLogs();
        break;
    }
  }

  // --- 1. DASHBOARD ---
  function renderDashboard() {
    const stats = window.farmDB.getDashboardStats();

    document.getElementById('statTotalAnimals').textContent = stats.totalActiveAnimals;
    document.getElementById('statSexRatio').textContent = `Đực: ${stats.maleCount} · Cái: ${stats.femaleCount} · Chưa rõ: ${stats.unknownCount}`;
    document.getElementById('statTotalPens').textContent = `${stats.activePens}/${stats.totalPens}`;
    document.getElementById('statPenDetails').textContent = `Đẻ: ${stats.breedingPens} · Trống: ${stats.emptyPens} · Cách ly: ${stats.quarantinePens}`;
    document.getElementById('statOpenIncidents').textContent = stats.openOffFeedIncidents;
    document.getElementById('statTotalDeaths').textContent = stats.totalDeaths;

    const tbody = document.getElementById('dashboardRecentIncidentsBody');
    if (tbody) {
      tbody.innerHTML = '';
      if (!stats.recentIncidents || stats.recentIncidents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--faint); padding:24px;">Không có sự cố nào gần đây</td></tr>';
      } else {
        stats.recentIncidents.forEach(inc => {
          const animal = window.farmDB.getAnimalById(inc.animal_id);
          const isDeath = inc.incident_type === 'DEATH';
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><span class="pill ${isDeath ? 'pill-negative' : 'pill-warning'}">${isDeath ? 'Tử vong' : 'Bỏ ăn'}</span></td>
            <td><span class="mono-code" style="font-weight:500;">${animal ? animal.animal_code : 'N/A'}</span></td>
            <td>${inc.symptoms_observed}</td>
            <td class="mono-code">${new Date(inc.detected_at).toLocaleDateString('vi-VN')}</td>
            <td><span class="pill ${inc.status === 'OPEN' ? 'pill-accent' : 'pill-neutral'}">${inc.status === 'OPEN' ? 'Đang mở' : 'Đã đóng'}</span></td>
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
      let pillClass = 'pill-positive';
      let statusLabel = 'Hoạt động';

      if (pen.status === 'BREEDING') { pillClass = 'pill-accent'; statusLabel = 'Sinh sản'; }
      else if (pen.status === 'QUARANTINE') { pillClass = 'pill-negative'; statusLabel = 'Cách ly'; }
      else if (pen.status === 'EMPTY' || animalsInPen.length === 0) { pillClass = 'pill-neutral'; statusLabel = 'Trống'; }

      const card = document.createElement('div');
      card.className = 'panel';
      card.style.margin = '0';
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
          <div>
            <div class="mono-code" style="font-size:16px; font-weight:600; color:var(--text);">Chuồng ${pen.pen_code}</div>
            <div style="font-size:12px; color:var(--muted);">${pen.name}</div>
          </div>
          <span class="pill ${pillClass}">${statusLabel}</span>
        </div>
        <div style="font-size:13px; margin-bottom:8px; color:var(--text);">
          <span style="color:var(--muted);">Sức chứa:</span> <span class="num">${animalsInPen.length} / ${pen.capacity}</span> cá thể
        </div>
        <div style="font-size:12px; background:var(--raised); padding:8px 10px; border-radius:4px; min-height:48px; margin-bottom:12px;">
          <div style="color:var(--muted); margin-bottom:4px;">Cá thể cư trú:</div>
          ${animalsInPen.length > 0
            ? animalsInPen.map(a => `<a href="javascript:void(0)" onclick="viewAnimalProfile('${a.id}')" class="mono-code" style="display:inline-block; margin:2px 4px 2px 0; padding:1px 6px; background:var(--surface); border:1px solid var(--border); border-radius:3px; font-weight:500; color:var(--accent);">${a.animal_code} (${a.sex === 'MALE' ? 'Đực' : (a.sex === 'FEMALE' ? 'Cái' : '?')})</a>`).join('')
            : '<span style="color:var(--faint); font-style:italic;">Chuồng hiện đang trống</span>'}
        </div>
        <div style="font-size:11px; color:var(--faint); margin-bottom:12px;">
          Ghi chú: ${pen.notes || 'Không'}
        </div>
        <div>
          <button class="btn btn-outline btn-sm" style="width:100%;" onclick="openTransferModalForPen('${pen.id}')">Chuyển dúi vào</button>
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

      let pillClass = 'pill-positive';
      let statusLabel = 'Đang nuôi';
      if (a.status === 'DECEASED') { pillClass = 'pill-negative'; statusLabel = 'Tử vong'; }
      else if (a.status === 'SOLD') { pillClass = 'pill-neutral'; statusLabel = 'Đã bán'; }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong class="mono-code" style="color:var(--accent);">${a.animal_code}</strong></td>
        <td>${a.name || '-'}</td>
        <td>${a.species || 'Dúi Mốc Lớn'}</td>
        <td>
          <span class="pill ${a.sex === 'MALE' ? 'pill-accent' : (a.sex === 'FEMALE' ? 'pill-neutral' : 'pill-neutral')}">
            ${a.sex === 'MALE' ? 'Đực' : (a.sex === 'FEMALE' ? 'Cái' : 'Chưa rõ')}
          </span>
        </td>
        <td class="mono-code">${a.date_of_birth || '-'}</td>
        <td>
          ${currentPen ? `<span class="mono-code" style="font-weight:500;">Chuồng ${currentPen.pen_code}</span>` : '<span style="color:var(--faint);">-</span>'}
        </td>
        <td class="num">
          ${latestWeight ? `${latestWeight.weight_value} ${latestWeight.weight_unit}` : '-'}
        </td>
        <td><span class="pill ${pillClass}">${statusLabel}</span></td>
        <td>
          <div style="display:flex; gap:4px;">
            <button class="btn btn-outline btn-sm" onclick="viewAnimalProfile('${a.id}')">Xem</button>
            <button class="btn btn-outline btn-sm" onclick="openWeightModal('${a.id}')">Cân</button>
            <button class="btn btn-outline btn-sm" onclick="openTransferModal('${a.id}')">Đổi chuồng</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // --- 4. SINH SẢN & PHẢ HỆ ---
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
        <td><strong class="mono-code">${lit.litter_code}</strong></td>
        <td class="mono-code">${lit.birth_at}</td>
        <td><span class="mono-code">${mother ? mother.animal_code : 'N/A'}</span></td>
        <td><span class="mono-code">${father ? father.animal_code : 'Chưa rõ'}</span></td>
        <td class="num">${lit.total_born} con (Sống: ${lit.alive_count}, Chết: ${lit.deceased_count})</td>
        <td>${lit.notes || '-'}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openRegisterLitterMemberModal('${lit.id}')">Cấp mã cá thể con</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

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
    const meds = window.farmDB.getMedicines();
    const medContainer = document.getElementById('medicinesContainer');
    if (medContainer) {
      medContainer.innerHTML = '';
      meds.forEach(m => {
        const div = document.createElement('div');
        div.className = 'panel';
        div.style.marginBottom = '12px';
        div.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-size:14px; font-weight:600; color:var(--text);">${m.trade_name}</div>
            <span class="pill pill-neutral">${m.medicine_group}</span>
          </div>
          <div style="font-size:12.5px; margin-bottom:6px; color:var(--text);"><strong>Hoạt chất:</strong> ${m.active_ingredient}</div>
          <div style="font-size:12.5px; color:var(--muted); margin-bottom:8px;">${m.reference_description}</div>
          <div style="font-size:12px; background:var(--pill-warning-bg); color:var(--pill-warning-ink); padding:8px 10px; border-radius:4px; margin-bottom:6px;">
            <strong>Lưu ý:</strong> ${m.warnings}
          </div>
          <div style="font-size:11px; color:var(--faint);">Nguồn: ${m.source_reference}</div>
        `;
        medContainer.appendChild(div);
      });
    }

    const healthRecords = window.farmDB.getHealthRecords();
    const healthTbody = document.getElementById('healthRecordsTableBody');
    if (healthTbody) {
      healthTbody.innerHTML = '';
      healthRecords.forEach(hr => {
        const animal = window.farmDB.getAnimalById(hr.animal_id);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong class="mono-code">${animal ? animal.animal_code : 'N/A'}</strong></td>
          <td class="mono-code">${new Date(hr.detected_at).toLocaleDateString('vi-VN')}</td>
          <td>${hr.diagnosis_text}</td>
          <td><span class="pill ${hr.severity === 'SEVERE' ? 'pill-negative' : 'pill-warning'}">${hr.severity}</span></td>
          <td>${hr.recorded_by}</td>
          <td><span class="pill ${hr.status === 'OPEN' ? 'pill-accent' : 'pill-neutral'}">${hr.status}</span></td>
        `;
        healthTbody.appendChild(tr);
      });
    }
  }

  // --- 6. NHẬT KÝ SỰ CỐ ---
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
        <td><span class="pill ${isDeath ? 'pill-negative' : 'pill-warning'}">${isDeath ? 'Tử vong' : 'Bỏ ăn'}</span></td>
        <td><strong class="mono-code" style="color:var(--accent);">${animal ? animal.animal_code : 'N/A'}</strong></td>
        <td><span class="mono-code">${pen ? pen.pen_code : '-'}</span></td>
        <td class="mono-code">${new Date(inc.detected_at).toLocaleString('vi-VN')}</td>
        <td>${inc.symptoms_observed}</td>
        <td>${inc.actions_taken || '-'}</td>
        <td><span class="pill ${inc.status === 'OPEN' ? 'pill-accent' : 'pill-neutral'}">${inc.status === 'OPEN' ? 'Đang mở' : 'Đã đóng'}</span></td>
        <td>
          <div style="display:flex; gap:4px;">
            ${!isDeath && inc.status === 'OPEN' ? `
              <button class="btn btn-outline btn-sm" onclick="openAddFollowUpModal('${inc.id}')">Cập nhật</button>
              <button class="btn btn-outline btn-sm" onclick="openCloseIncidentModal('${inc.id}')">Đóng ca</button>
            ` : '<span style="color:var(--faint); font-size:12px;">Đã đóng</span>'}
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
        <div style="text-align:center; padding:32px; color:var(--faint);">
          <div>Không tìm thấy dữ liệu nào phù hợp với từ khóa này.</div>
          <div style="font-size:12px; margin-top:4px;">Gõ mã cá thể (D001), chuồng (A01), hoặc triệu chứng (tieu chay, bo an)...</div>
        </div>
      `;
      return;
    }

    data.results.forEach(res => {
      const card = document.createElement('div');
      card.className = 'panel';
      card.style.marginBottom = '12px';
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div>
            <span style="font-size:11px; font-weight:600; color:var(--faint); text-transform:uppercase;">${res.category}</span>
            <div style="font-size:15px; font-weight:600; color:var(--text); margin-top:2px;">${res.title}</div>
          </div>
          <span class="pill pill-${res.badgeType}">${res.badge}</span>
        </div>
        <div style="font-size:13px; color:var(--muted); margin-bottom:10px;">${res.snippet}</div>
        <div>
          ${res.actionType === 'VIEW_ANIMAL' ? `<button class="btn btn-outline btn-sm" onclick="viewAnimalProfile('${res.id}')">Xem hồ sơ</button>` : ''}
          ${res.actionType === 'VIEW_PEN' ? `<button class="btn btn-outline btn-sm" onclick="switchTab('tab-pens', 'Danh mục chuồng')">Xem chuồng</button>` : ''}
          ${res.actionType === 'VIEW_INCIDENT' ? `<button class="btn btn-outline btn-sm" onclick="switchTab('tab-incidents', 'Nhật ký sự cố')">Xem sự cố</button>` : ''}
          ${res.actionType === 'VIEW_MEDICINE' ? `<button class="btn btn-outline btn-sm" onclick="switchTab('tab-health', 'Sức khỏe & thuốc')">Xem thuốc</button>` : ''}
        </div>
      `;
      searchResultsDiv.appendChild(card);
    });
  }

  const mainSearchBtn = document.getElementById('mainSearchBtn');
  const mainSearchInput = document.getElementById('mainSearchInput');
  if (mainSearchBtn && mainSearchInput) {
    mainSearchBtn.addEventListener('click', () => executeSearch(mainSearchInput.value));
    mainSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') executeSearch(mainSearchInput.value);
    });
  }

  // --- 8. TRỢ LÝ AI ---
  const aiChatMessages = document.getElementById('aiChatMessages');
  const aiInput = document.getElementById('aiChatInput');
  const aiSendBtn = document.getElementById('aiChatSendBtn');

  function sendAIMessage(text) {
    if (!text || !text.trim()) return;
    const q = text.trim();

    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user';
    userBubble.textContent = q;
    aiChatMessages.appendChild(userBubble);
    aiInput.value = '';

    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;

    setTimeout(() => {
      const response = window.farmAI.ask(q);
      const botBubble = document.createElement('div');
      botBubble.className = 'chat-bubble bot';

      let formattedText = response.reply
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br/>');

      let sourceHtml = '';
      if (response.sources && response.sources.length > 0) {
        sourceHtml = `<div class="chat-source">Nguồn trích dẫn: ${response.sources.join(', ')}</div>`;
      }

      botBubble.innerHTML = `<div>${formattedText}</div>${sourceHtml}`;
      aiChatMessages.appendChild(botBubble);
      aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
    }, 250);
  }

  if (aiSendBtn && aiInput) {
    aiSendBtn.addEventListener('click', () => sendAIMessage(aiInput.value));
    aiInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendAIMessage(aiInput.value);
    });
  }

  document.querySelectorAll('.prompt-pill').forEach(pill => {
    pill.addEventListener('click', () => sendAIMessage(pill.textContent));
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
        <td class="mono-code">${new Date(log.time).toLocaleString('vi-VN')}</td>
        <td><strong>${log.actor}</strong></td>
        <td><span class="pill pill-neutral">${log.action}</span></td>
        <td>${log.details}</td>
      `;
      tbody.appendChild(tr);
    });
  }

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

  const fileImportInput = document.getElementById('fileImportInput');
  if (fileImportInput) {
    fileImportInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          window.farmDB.importDataJSON(event.target.result);
          alert('Khôi phục dữ liệu từ file JSON thành công');
          location.reload();
        } catch (err) {
          alert('Lỗi: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  const btnResetDefault = document.getElementById('btnResetDefault');
  if (btnResetDefault) {
    btnResetDefault.addEventListener('click', () => {
      if (confirm('Đặt lại dữ liệu mẫu gốc? Dữ liệu sửa đổi sẽ bị thay thế.')) {
        window.farmDB.resetToDefault();
        alert('Đã khôi phục dữ liệu mẫu gốc');
        location.reload();
      }
    });
  }

  renderDashboard();
});

// --- GLOBAL MODAL FUNCTIONS ---

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

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
  document.getElementById('profileNotes').textContent = animal.notes || 'Không có';

  document.getElementById('profileParents').textContent = `Bố: ${pedigree.father ? pedigree.father.animal_code : 'Chưa rõ'} · Mẹ: ${pedigree.mother ? pedigree.mother.animal_code : 'Chưa rõ'}`;

  const weightTbody = document.getElementById('profileWeightsTbody');
  weightTbody.innerHTML = '';
  if (weights.length === 0) {
    weightTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--faint);">Chưa có dữ liệu cân</td></tr>';
  } else {
    weights.forEach(w => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono-code">${w.measured_at}</td>
        <td class="num"><strong>${w.weight_value} ${w.weight_unit}</strong></td>
        <td>${w.recorded_by}</td>
        <td>${w.note || '-'}</td>
      `;
      weightTbody.appendChild(tr);
    });
  }

  const modal = document.getElementById('modalAnimalProfile');
  if (modal) modal.classList.add('active');
}

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
    alert('Vui lòng nhập trọng lượng hợp lệ');
    return;
  }

  window.farmDB.addWeight(animalId, val, 'kg', note, 'Quản Lý Trại');
  closeModal('modalAddWeight');
  window.switchTab('tab-animals', 'Hồ sơ cá thể');
}

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
  window.switchTab('tab-animals', 'Hồ sơ cá thể');
}

function openAddAnimalModal() {
  document.getElementById('newAnimalCode').value = 'D00' + (window.farmDB.getAnimals().length + 1);
  document.getElementById('newAnimalName').value = '';
  document.getElementById('newAnimalNotes').value = '';

  const penSelect = document.getElementById('newAnimalPenSelect');
  const pens = window.farmDB.getPens();
  penSelect.innerHTML = '<option value="">Chưa phân bổ</option>' +
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
    alert('Vui lòng nhập mã định danh');
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
    window.switchTab('tab-animals', 'Hồ sơ cá thể');
  } catch (err) {
    alert(err.message);
  }
}

function openIncidentModal(type) {
  document.getElementById('incidentTypeInput').value = type;
  document.getElementById('incidentModalTitle').textContent = type === 'DEATH' ? 'Ghi nhận dúi chết (DEATH)' : 'Ghi nhận dúi bỏ ăn (OFF_FEED)';

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
    alert('Vui lòng chọn cá thể và nhập triệu chứng quan sát được');
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
    window.switchTab('tab-incidents', 'Nhật ký sự cố');
  } catch (err) {
    alert(err.message);
  }
}

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
    alert('Vui lòng nhập nội dung theo dõi');
    return;
  }

  window.farmDB.addIncidentFollowUp(incId, note, 'Quản Lý Trại');
  closeModal('modalAddFollowUp');
  window.switchTab('tab-incidents', 'Nhật ký sự cố');
}

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
    alert('Vui lòng nhập kết quả xử lý');
    return;
  }

  window.farmDB.closeIncident(incId, outcome, 'Quản Lý Trại');
  closeModal('modalCloseIncident');
  window.switchTab('tab-incidents', 'Nhật ký sự cố');
}

function openCreateLitterModal() {
  document.getElementById('litterCodeInput').value = 'LIT-' + new Date().getFullYear() + '-0' + (window.farmDB.getLitters().length + 1);

  const motherSelect = document.getElementById('litterMotherSelect');
  const fatherSelect = document.getElementById('litterFatherSelect');

  const females = window.farmDB.getAnimals().filter(a => a.sex === 'FEMALE');
  const males = window.farmDB.getAnimals().filter(a => a.sex === 'MALE');

  motherSelect.innerHTML = females.map(f => `<option value="${f.id}">${f.animal_code} - ${f.name || 'Cái'}</option>`).join('');
  fatherSelect.innerHTML = '<option value="">Chưa rõ</option>' +
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
    alert('Vui lòng nhập mã lứa và chọn mẹ');
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
  window.switchTab('tab-breeding', 'Sinh sản & phả hệ');
}

function openRegisterLitterMemberModal(litterId) {
  document.getElementById('registerMemberLitterId').value = litterId;
  document.getElementById('registerMemberCodeInput').value = 'D00' + (window.farmDB.getAnimals().length + 1);
  document.getElementById('registerMemberNameInput').value = '';

  const penSelect = document.getElementById('registerMemberPenSelect');
  penSelect.innerHTML = '<option value="">Chưa phân bổ</option>' +
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
    alert('Vui lòng nhập mã ID cho cá thể');
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
    window.switchTab('tab-breeding', 'Sinh sản & phả hệ');
  } catch (err) {
    alert(err.message);
  }
}

function checkInbreeding() {
  const maleId = document.getElementById('inbreedMaleSelect').value;
  const femaleId = document.getElementById('inbreedFemaleSelect').value;
  const resultDiv = document.getElementById('inbreedingResult');

  const check = window.farmDB.checkInbreedingRisk(maleId, femaleId);

  let pillClass = 'pill-positive';
  if (check.risk === 'EXTREME') pillClass = 'pill-negative';
  else if (check.risk === 'HIGH') pillClass = 'pill-warning';

  resultDiv.innerHTML = `
    <div style="padding:12px 14px; border-radius:6px; background:${check.risk === 'LOW' ? 'var(--pill-positive-bg)' : (check.risk === 'HIGH' ? 'var(--pill-warning-bg)' : 'var(--pill-negative-bg)')}; border:1px solid ${check.risk === 'LOW' ? '#bbf2cf' : (check.risk === 'HIGH' ? '#fde68a' : '#fecaca')};">
      <div style="font-size:13px; font-weight:600; color:var(--text); margin-bottom:2px;">
        Đánh giá: <span class="pill ${pillClass}">${check.risk}</span>
      </div>
      <div style="font-size:12.5px; color:var(--text);">${check.reason}</div>
    </div>
  `;
}

window.onSelectPenBlock = function(penId) {
  const pen = window.farmDB.getPenById(penId);
  if (!pen) return;
  const animals = window.farmDB.getAnimalsInPen(penId);

  const infoDiv = document.getElementById('mapSelectedPenInfo');
  if (infoDiv) {
    infoDiv.innerHTML = `
      <div class="mono-code" style="font-size:15px; font-weight:600; color:var(--text);">Chuồng ${pen.pen_code} - ${pen.name}</div>
      <div style="font-size:12px; color:var(--muted); margin:4px 0 10px 0;">Trạng thái: <strong>${pen.status}</strong> · Sức chứa: <strong class="num">${animals.length}/${pen.capacity}</strong></div>
      <div style="font-size:13px;">
        <div style="color:var(--muted); margin-bottom:4px;">Cá thể bên trong:</div>
        ${animals.length > 0
          ? animals.map(a => `<span class="mono-code pill pill-accent" style="margin:2px 4px 2px 0;">${a.animal_code} (${a.sex === 'MALE' ? 'Đực' : 'Cái'})</span>`).join('')
          : '<span style="color:var(--faint); font-style:italic;">Chuồng hiện đang trống</span>'}
      </div>
    `;
  }
};

window.onDeselectBlock = function() {
  const infoDiv = document.getElementById('mapSelectedPenInfo');
  if (infoDiv) {
    infoDiv.innerHTML = `<span style="color:var(--faint); font-style:italic;">Bấm vào ô chuồng trên sơ đồ để xem cá thể bên trong</span>`;
  }
};
