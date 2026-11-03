/**
 * Farm Management Mobile-First & Touch-First Main Application Controller (js/app.js)
 * Architecture: Mobile-first, Touch-first, Offline-first
 * Compliance: Taste-skill, tabular figures, min 44x44px touch targets, zero slop.
 */

let mapEditorInstance = null;
let currentActiveTab = 'tab-dashboard';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initial State & RBAC Setup
  const user = window.farmDB.getCurrentUser();
  updateRoleUI(user.role);

  // Setup Online/Offline Status Indicator
  const onlineDot = document.getElementById('onlineStatusDot');
  if (onlineDot) {
    const updateOnline = () => {
      onlineDot.style.background = navigator.onLine ? 'var(--positive)' : 'var(--negative)';
      onlineDot.title = navigator.onLine ? 'Đang trực tuyến' : 'Ngoại tuyến (Offline)';
    };
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    updateOnline();
  }

  // 2. Bottom Navigation Listeners
  const navButtons = document.querySelectorAll('.nav-tab-btn');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      const titleSpan = btn.querySelector('span');
      const title = titleSpan ? titleSpan.textContent : '';
      switchTab(tabId, title);
    });
  });

  // 3. Animal Filters Setup
  const animalSearchInput = document.getElementById('animalSearchInput');
  const animalSexFilter = document.getElementById('animalSexFilter');
  const animalStatusFilter = document.getElementById('animalStatusFilter');

  if (animalSearchInput) {
    animalSearchInput.addEventListener('input', () => renderAnimals());
  }
  if (animalSexFilter) {
    animalSexFilter.addEventListener('change', () => renderAnimals());
  }
  if (animalStatusFilter) {
    animalStatusFilter.addEventListener('change', () => renderAnimals());
  }

  // 4. Mobile Intelligent Search Setup
  const mobileSearchInput = document.getElementById('mobileSearchInput');
  const mobileSearchBtn = document.getElementById('mobileSearchBtn');

  if (mobileSearchBtn && mobileSearchInput) {
    const runSearch = () => {
      const q = mobileSearchInput.value.trim();
      executeMobileSearch(q);
    };
    mobileSearchBtn.addEventListener('click', runSearch);
    mobileSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runSearch();
    });
  }

  // 5. AI Chat Setup
  const aiChatInput = document.getElementById('aiChatInput');
  const aiChatSendBtn = document.getElementById('aiChatSendBtn');

  if (aiChatSendBtn && aiChatInput) {
    aiChatSendBtn.addEventListener('click', () => sendAIMessage(aiChatInput.value));
    aiChatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendAIMessage(aiChatInput.value);
    });
  }

  document.querySelectorAll('.prompt-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      if (aiChatInput) aiChatInput.value = pill.textContent;
      sendAIMessage(pill.textContent);
    });
  });

  // 6. Data Backup & Restore Setup
  const btnExport = document.getElementById('btnExportJSON');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
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

  const fileImport = document.getElementById('fileImportInput');
  if (fileImport) {
    fileImport.addEventListener('change', (e) => {
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

  const btnReset = document.getElementById('btnResetDefault');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (confirm('Khôi phục dữ liệu mẫu gốc? Mọi thay đổi hiện tại sẽ được làm mới.')) {
        window.farmDB.resetToDefault();
        alert('Đã khôi phục dữ liệu mẫu gốc thành công.');
        location.reload();
      }
    });
  }

  // 7. Initial View Render
  renderDashboard();
});

// ==========================================
// NAVIGATION & VIEW CONTROLLER
// ==========================================

function switchTab(tabId, title) {
  currentActiveTab = tabId;

  // Update bottom nav active state
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update tab-pane active state
  document.querySelectorAll('.tab-pane').forEach(pane => {
    if (pane.id === tabId) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });

  // Update Topbar Title
  const titleMap = {
    'tab-dashboard': 'Tổng quan',
    'tab-map': 'Sơ đồ chuồng 2D',
    'tab-animals': 'Hồ sơ cá thể',
    'tab-breeding': 'Sinh sản & phả hệ',
    'tab-more': 'Khác & Cài đặt'
  };
  const topbarTitle = document.getElementById('topbarTitle');
  if (topbarTitle) {
    topbarTitle.textContent = title || titleMap[tabId] || 'Quản lý Dúi';
  }

  // Close any overlay
  closeMapSheet();
  closeAnimalDetailView();

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'instant' });

  // Special handling for 2D Map Canvas
  if (tabId === 'tab-map') {
    setTimeout(() => {
      if (!mapEditorInstance) {
        mapEditorInstance = new FarmMapEditor('farmCanvas', window.farmDB);
        window.mapEditorInstance = mapEditorInstance;
      } else {
        mapEditorInstance.resizeCanvas();
        mapEditorInstance.fitToScreen();
      }
    }, 80);
  }

  renderCurrentTab(tabId);
}
window.switchTab = switchTab;

function switchSubModule(subId) {
  // Hide all panes and show this sub-pane
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });
  const target = document.getElementById(subId);
  if (target) {
    target.classList.add('active');
  }

  // Keep "Khác" highlighted in bottom nav
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    if (btn.getAttribute('data-tab') === 'tab-more') {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const subTitles = {
    'sub-pens': 'Danh mục chuồng',
    'sub-incidents': 'Nhật ký sự cố',
    'sub-health': 'Sức khỏe & Thuốc',
    'sub-search': 'Tìm kiếm thông minh',
    'sub-ai': 'Trợ lý AI Trang Trại',
    'sub-backup': 'Dữ liệu & Sao lưu'
  };

  const topbarTitle = document.getElementById('topbarTitle');
  if (topbarTitle && subTitles[subId]) {
    topbarTitle.textContent = subTitles[subId];
  }

  window.scrollTo({ top: 0, behavior: 'instant' });
  renderCurrentTab(subId);
}
window.switchSubModule = switchSubModule;

function renderCurrentTab(id) {
  switch (id) {
    case 'tab-dashboard':
      renderDashboard();
      break;
    case 'tab-animals':
      renderAnimals();
      break;
    case 'tab-breeding':
      renderBreeding();
      break;
    case 'sub-pens':
      renderPens();
      break;
    case 'sub-incidents':
      renderIncidents();
      break;
    case 'sub-health':
      renderHealthAndMedicines();
      break;
    case 'sub-backup':
      renderAuditLogs();
      break;
    case 'sub-search':
      const searchInput = document.getElementById('mobileSearchInput');
      if (searchInput && searchInput.value.trim()) {
        executeMobileSearch(searchInput.value.trim());
      }
      break;
  }
}

// ==========================================
// ROLE SWITCHER & RBAC CONTROLLER
// ==========================================

function changeRole(role) {
  window.farmDB.setUserRole(role);
  updateRoleUI(role);

  // If map is currently in Edit mode but new role cannot edit map, revert to View mode
  if (mapEditorInstance && mapEditorInstance.isEditMode && !window.farmDB.canEditMap()) {
    mapEditorInstance.setEditMode(false);
    updateMapModeUI(false);
  }

  renderCurrentTab(currentActiveTab);
}
window.changeRole = changeRole;

function updateRoleUI(role) {
  const badgeText = document.getElementById('currentUserRoleText');
  if (badgeText) badgeText.textContent = role;

  const roles = ['Admin', 'Manager', 'Staff', 'Viewer'];
  roles.forEach(r => {
    const btn = document.getElementById(`roleBtn${r}`);
    if (btn) {
      if (r.toUpperCase() === role) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  });

  const desc = document.getElementById('roleDescriptionText');
  if (desc) {
    if (role === 'ADMIN') {
      desc.textContent = 'Admin: Toàn quyền quản trị trang trại, chỉnh sửa cấu trúc sơ đồ chuồng và sao lưu khôi phục dữ liệu.';
    } else if (role === 'MANAGER') {
      desc.textContent = 'Manager: Quyền quản lý đàn, điều chuyển chuồng, ghi nhận sự cố và hiệu chỉnh sơ đồ chuồng.';
    } else if (role === 'STAFF') {
      desc.textContent = 'Staff: Nhân viên chuồng nuôi chỉ xem sơ đồ (chặn kéo lệch chuồng), ghi nhận cân nặng và báo sự cố.';
    } else {
      desc.textContent = 'Viewer: Quyền chỉ xem dữ liệu (read-only), không được phép chỉnh sửa hoặc tạo bản ghi mới.';
    }
  }
}

// ==========================================
// 1. DASHBOARD MODULE
// ==========================================

function renderDashboard() {
  const stats = window.farmDB.getDashboardStats();

  const elTotalAnimals = document.getElementById('statTotalAnimals');
  if (elTotalAnimals) elTotalAnimals.textContent = stats.totalActiveAnimals;

  const elSexRatio = document.getElementById('statSexRatio');
  if (elSexRatio) elSexRatio.textContent = `Đực: ${stats.maleCount} · Cái: ${stats.femaleCount} · Chưa rõ: ${stats.unknownCount}`;

  const elTotalPens = document.getElementById('statTotalPens');
  if (elTotalPens) elTotalPens.textContent = `${stats.activePens}/${stats.totalPens}`;

  const elPenDetails = document.getElementById('statPenDetails');
  if (elPenDetails) elPenDetails.textContent = `Đẻ: ${stats.breedingPens} · Trống: ${stats.emptyPens} · Cách ly: ${stats.quarantinePens}`;

  const elOpenIncidents = document.getElementById('statOpenIncidents');
  if (elOpenIncidents) elOpenIncidents.textContent = stats.openOffFeedIncidents;

  const elTotalDeaths = document.getElementById('statTotalDeaths');
  if (elTotalDeaths) elTotalDeaths.textContent = stats.totalDeaths;

  const listContainer = document.getElementById('dashboardRecentIncidentsList');
  if (!listContainer) return;

  listContainer.innerHTML = '';
  if (!stats.recentIncidents || stats.recentIncidents.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align:center; padding:20px; color:var(--faint); font-size:13px;">
        Không có sự cố nào gần đây. Đàn dúi phát triển khỏe mạnh.
      </div>
    `;
    return;
  }

  stats.recentIncidents.slice(0, 3).forEach(inc => {
    const animal = window.farmDB.getAnimalById(inc.animal_id);
    const pen = inc.pen_id ? window.farmDB.getPenById(inc.pen_id) : (animal ? window.farmDB.getCurrentPenForAnimal(animal.id) : null);
    const isDeath = inc.incident_type === 'DEATH';

    const card = document.createElement('div');
    card.className = 'item-card';
    card.style.cursor = 'pointer';
    card.onclick = () => switchSubModule('sub-incidents');

    card.innerHTML = `
      <div class="item-card-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="pill ${isDeath ? 'pill-negative' : 'pill-warning'}">${isDeath ? 'Tử vong' : 'Bỏ ăn'}</span>
          <span class="mono-code" style="font-weight:600; color:var(--text);">${animal ? animal.animal_code : 'N/A'}</span>
          ${pen ? `<span style="font-size:12px; color:var(--muted);">${pen.pen_code}</span>` : ''}
        </div>
        <span class="mono-code" style="font-size:11.5px; color:var(--faint);">${new Date(inc.detected_at).toLocaleDateString('vi-VN')}</span>
      </div>
      <div style="font-size:12.5px; color:var(--muted); margin-top:2px;">
        ${inc.symptoms_observed}
      </div>
    `;
    listContainer.appendChild(card);
  });
}

// ==========================================
// 2. 2D FARM MAP & BOTTOM SHEET INTERACTION
// ==========================================

window.onSelectPenBlock = function(penId) {
  const pen = window.farmDB.getPenById(penId);
  if (!pen) return;
  const animals = window.farmDB.getAnimalsInPen(penId);

  const sheetPenCode = document.getElementById('sheetPenCode');
  const sheetPenName = document.getElementById('sheetPenName');
  const sheetPenStatus = document.getElementById('sheetPenStatus');
  const sheetPenCapacity = document.getElementById('sheetPenCapacity');
  const sheetAnimalsList = document.getElementById('sheetAnimalsList');
  const sheetTransferBtn = document.getElementById('sheetTransferBtn');

  if (sheetPenCode) sheetPenCode.textContent = `Chuồng ${pen.pen_code}`;
  if (sheetPenName) sheetPenName.textContent = pen.name || 'Chuồng nuôi dúi tiêu chuẩn';

  if (sheetPenStatus) {
    let statusText = 'Hoạt động';
    let pillClass = 'pill-positive';
    if (pen.status === 'BREEDING') { statusText = 'Sinh sản'; pillClass = 'pill-accent'; }
    else if (pen.status === 'QUARANTINE') { statusText = 'Cách ly'; pillClass = 'pill-negative'; }
    else if (pen.status === 'EMPTY' || animals.length === 0) { statusText = 'Trống'; pillClass = 'pill-neutral'; }

    sheetPenStatus.className = `pill ${pillClass}`;
    sheetPenStatus.textContent = statusText;
  }

  if (sheetPenCapacity) {
    sheetPenCapacity.textContent = `${animals.length}/${pen.capacity} con`;
  }

  if (sheetAnimalsList) {
    sheetAnimalsList.innerHTML = '';
    if (animals.length === 0) {
      sheetAnimalsList.innerHTML = '<span style="color:var(--faint); font-style:italic;">Chuồng hiện đang trống</span>';
    } else {
      animals.forEach(a => {
        const badge = document.createElement('span');
        badge.className = 'pill pill-accent';
        badge.style.cursor = 'pointer';
        badge.style.fontFamily = 'var(--mono)';
        badge.textContent = `${a.animal_code} (${a.sex === 'MALE' ? 'Đực' : (a.sex === 'FEMALE' ? 'Cái' : '?')})`;
        badge.onclick = (e) => {
          e.stopPropagation();
          closeMapSheet();
          openAnimalDetailView(a.id);
        };
        sheetAnimalsList.appendChild(badge);
      });
    }
  }

  if (sheetTransferBtn) {
    sheetTransferBtn.onclick = () => {
      closeMapSheet();
      openTransferModalForPen(pen.id);
    };
  }

  // Open Bottom Sheet
  const sheet = document.getElementById('mapBottomSheet');
  const backdrop = document.getElementById('mapSheetBackdrop');
  if (sheet) sheet.classList.add('open');
  if (backdrop) backdrop.classList.add('open');
};

function closeMapSheet() {
  const sheet = document.getElementById('mapBottomSheet');
  const backdrop = document.getElementById('mapSheetBackdrop');
  if (sheet) sheet.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');

  if (mapEditorInstance) {
    mapEditorInstance.selectedBlock = null;
    mapEditorInstance.requestRender();
  }
}
window.closeMapSheet = closeMapSheet;

window.onDeselectBlock = function() {
  closeMapSheet();
};

function toggleMapEditMode() {
  if (!window.farmDB.canEditMap()) {
    alert('Chỉ Admin và Manager mới có quyền bật Chế độ chỉnh sửa sơ đồ chuồng. Nhân viên (Staff) chỉ được sử dụng Chế độ xem an toàn.');
    return;
  }

  if (!mapEditorInstance) {
    mapEditorInstance = new FarmMapEditor('farmCanvas', window.farmDB);
    window.mapEditorInstance = mapEditorInstance;
  }

  const isEdit = mapEditorInstance.toggleEditMode();
  updateMapModeUI(isEdit);
}
window.toggleMapEditMode = toggleMapEditMode;

function updateMapModeUI(isEdit) {
  const text = document.getElementById('mapModeText');
  const dot = document.getElementById('mapModeIndicatorDot');
  const toolbar = document.getElementById('mapEditToolbar');

  if (text) text.textContent = isEdit ? 'Chế độ sửa' : 'Chế độ xem';
  if (dot) dot.style.background = isEdit ? 'var(--negative)' : 'var(--positive)';
  if (toolbar) toolbar.style.display = isEdit ? 'flex' : 'none';
}

function filterMapByZone(zoneId) {
  const chips = document.querySelectorAll('#mapZoneFilterChips .chip-btn');
  chips.forEach(c => {
    if (c.getAttribute('data-zone') === zoneId) {
      c.classList.add('active');
    } else {
      c.classList.remove('active');
    }
  });

  if (mapEditorInstance) {
    mapEditorInstance.setZoneFilter(zoneId);
  }
}
window.filterMapByZone = filterMapByZone;

// ==========================================
// 3. ANIMAL PROFILES MODULE (MOBILE CARDS)
// ==========================================

function renderAnimals() {
  const container = document.getElementById('animalsListContainer');
  if (!container) return;

  const searchVal = document.getElementById('animalSearchInput') ? document.getElementById('animalSearchInput').value.trim() : '';
  const sexVal = document.getElementById('animalSexFilter') ? document.getElementById('animalSexFilter').value : 'ALL';
  const statusVal = document.getElementById('animalStatusFilter') ? document.getElementById('animalStatusFilter').value : 'ALL';

  let animals = window.farmDB.getAnimals();

  // Apply filters
  if (searchVal) {
    const q = searchVal.toLowerCase();
    animals = animals.filter(a => {
      return a.animal_code.toLowerCase().includes(q) ||
        (a.name && a.name.toLowerCase().includes(q)) ||
        (a.notes && a.notes.toLowerCase().includes(q));
    });
  }

  if (sexVal !== 'ALL') {
    animals = animals.filter(a => a.sex === sexVal);
  }

  if (statusVal !== 'ALL') {
    animals = animals.filter(a => a.status === statusVal);
  }

  container.innerHTML = '';
  if (animals.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:32px 16px; color:var(--faint);">
        <div>Không tìm thấy cá thể nào phù hợp bộ lọc.</div>
        <button class="btn btn-outline btn-sm" style="margin-top:12px;" onclick="openAddAnimalModal()">+ Thêm cá thể mới</button>
      </div>
    `;
    return;
  }

  animals.forEach(a => {
    const currentPen = window.farmDB.getCurrentPenForAnimal(a.id);
    const weights = window.farmDB.getWeights(a.id);
    const latestWeight = weights.length > 0 ? weights[weights.length - 1] : null;

    let statusPillClass = 'pill-positive';
    let statusText = 'Đang nuôi';
    if (a.status === 'DECEASED') { statusPillClass = 'pill-negative'; statusText = 'Tử vong'; }
    else if (a.status === 'SOLD') { statusPillClass = 'pill-neutral'; statusText = 'Đã bán'; }

    let sexPillClass = 'pill-accent';
    let sexText = 'Đực';
    if (a.sex === 'FEMALE') { sexPillClass = 'pill-neutral'; sexText = 'Cái'; }
    else if (a.sex === 'UNKNOWN') { sexPillClass = 'pill-neutral'; sexText = 'Chưa rõ'; }

    const card = document.createElement('div');
    card.className = 'item-card';
    card.style.cursor = 'pointer';
    card.onclick = () => openAnimalDetailView(a.id);

    card.innerHTML = `
      <div class="item-card-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="mono-code" style="font-size:16px; font-weight:600; color:var(--accent);">${a.animal_code}</span>
          <span class="pill ${sexPillClass}">${sexText}</span>
        </div>
        <span class="pill ${statusPillClass}">${statusText}</span>
      </div>

      <div class="item-card-grid">
        <div>Tên gọi: <strong>${a.name || 'Chưa đặt'}</strong></div>
        <div>Chuồng: <strong>${currentPen ? currentPen.pen_code : 'Chưa phân'}</strong></div>
        <div>Ngày sinh: <span class="mono-code">${a.date_of_birth || '-'}</span></div>
        <div>Cân nặng: <strong class="num">${latestWeight ? `${latestWeight.weight_value} kg` : '-'}</strong></div>
      </div>

      <div class="item-card-actions" onclick="event.stopPropagation()">
        <button class="btn btn-outline btn-sm" style="flex:1;" onclick="openAnimalDetailView('${a.id}')">Xem hồ sơ</button>
        ${a.status === 'ACTIVE' ? `
          <button class="btn btn-outline btn-sm" onclick="openWeightModal('${a.id}')">Cân</button>
          <button class="btn btn-outline btn-sm" onclick="openTransferModal('${a.id}')">Đổi chuồng</button>
        ` : ''}
      </div>
    `;

    container.appendChild(card);
  });
}

// ==========================================
// 4. FULL-SCREEN SLIDE-OVER DETAIL VIEW
// ==========================================

function openAnimalDetailView(animalId) {
  const animal = window.farmDB.getAnimalById(animalId);
  if (!animal) return;

  const currentPen = window.farmDB.getCurrentPenForAnimal(animal.id);
  const weights = window.farmDB.getWeights(animal.id);
  const pedigree = window.farmDB.getPedigree(animal.id);

  // Set header elements
  document.getElementById('detailAnimalCode').textContent = animal.animal_code;
  const statusPill = document.getElementById('detailAnimalStatus');
  if (statusPill) {
    statusPill.className = `pill ${animal.status === 'ACTIVE' ? 'pill-positive' : 'pill-negative'}`;
    statusPill.textContent = animal.status === 'ACTIVE' ? 'Đang nuôi' : (animal.status === 'DECEASED' ? 'Tử vong' : animal.status);
  }

  // Set body info
  document.getElementById('detailAnimalName').textContent = animal.name || 'Chưa đặt tên';
  document.getElementById('detailAnimalSpecies').textContent = animal.species || 'Dúi Mốc Lớn';
  document.getElementById('detailAnimalSex').textContent = animal.sex === 'MALE' ? 'Đực' : (animal.sex === 'FEMALE' ? 'Cái' : 'Chưa rõ');
  document.getElementById('detailAnimalDOB').textContent = animal.date_of_birth || 'Chưa rõ';
  document.getElementById('detailAnimalOrigin').textContent = animal.origin_type === 'BORN' ? 'Sinh tại trại' : 'Mua ngoài';
  document.getElementById('detailAnimalPen').textContent = currentPen ? `Chuồng ${currentPen.pen_code} (${currentPen.name})` : 'Chưa phân chuồng';
  document.getElementById('detailAnimalParents').textContent = `Bố: ${pedigree.father ? pedigree.father.animal_code : 'Chưa rõ'} · Mẹ: ${pedigree.mother ? pedigree.mother.animal_code : 'Chưa rõ'}`;
  document.getElementById('detailAnimalNotes').textContent = animal.notes || 'Không có ghi chú nào';

  // Wire buttons
  const weighBtn = document.getElementById('detailActionWeighBtn');
  const transferBtn = document.getElementById('detailActionTransferBtn');
  if (weighBtn) {
    weighBtn.style.display = animal.status === 'ACTIVE' ? 'block' : 'none';
    weighBtn.onclick = () => openWeightModal(animal.id);
  }
  if (transferBtn) {
    transferBtn.style.display = animal.status === 'ACTIVE' ? 'block' : 'none';
    transferBtn.onclick = () => openTransferModal(animal.id);
  }

  // Render Weight History
  const weightsList = document.getElementById('detailWeightsList');
  if (weightsList) {
    weightsList.innerHTML = '';
    if (weights.length === 0) {
      weightsList.innerHTML = '<div style="color:var(--faint); font-size:12px; padding:8px 0;">Chưa có dữ liệu cân nặng nào</div>';
    } else {
      weights.slice().reverse().forEach(w => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--rule); font-size:12.5px;';
        row.innerHTML = `
          <div>
            <span class="mono-code" style="color:var(--muted);">${w.measured_at}</span>
            ${w.note ? `<div style="font-size:11.5px; color:var(--faint);">${w.note}</div>` : ''}
          </div>
          <strong class="num" style="font-size:14px; color:var(--accent);">${w.weight_value} ${w.weight_unit}</strong>
        `;
        weightsList.appendChild(row);
      });
    }
  }

  // Open Full-Screen Overlay
  const view = document.getElementById('animalDetailView');
  if (view) view.classList.add('open');
}
window.openAnimalDetailView = openAnimalDetailView;

function closeAnimalDetailView() {
  const view = document.getElementById('animalDetailView');
  if (view) view.classList.remove('open');
}
window.closeAnimalDetailView = closeAnimalDetailView;

// ==========================================
// 5. PENS SUB-MODULE
// ==========================================

function renderPens() {
  const container = document.getElementById('pensListContainer');
  if (!container) return;

  const pens = window.farmDB.getPens();
  container.innerHTML = '';

  pens.forEach(pen => {
    const animalsInPen = window.farmDB.getAnimalsInPen(pen.id);
    let pillClass = 'pill-positive';
    let statusLabel = 'Hoạt động';

    if (pen.status === 'BREEDING') { pillClass = 'pill-accent'; statusLabel = 'Sinh sản'; }
    else if (pen.status === 'QUARANTINE') { pillClass = 'pill-negative'; statusLabel = 'Cách ly'; }
    else if (pen.status === 'EMPTY' || animalsInPen.length === 0) { pillClass = 'pill-neutral'; statusLabel = 'Trống'; }

    const card = document.createElement('div');
    card.className = 'item-card';

    card.innerHTML = `
      <div class="item-card-header">
        <div>
          <div class="mono-code" style="font-size:16px; font-weight:600; color:var(--text);">Chuồng ${pen.pen_code}</div>
          <div style="font-size:12px; color:var(--muted);">${pen.name}</div>
        </div>
        <span class="pill ${pillClass}">${statusLabel}</span>
      </div>

      <div style="font-size:13px; margin:4px 0 8px 0; color:var(--text);">
        <span style="color:var(--muted);">Sức chứa:</span> <strong class="num">${animalsInPen.length}/${pen.capacity}</strong> cá thể
      </div>

      <div style="font-size:12px; background:var(--raised); padding:8px 10px; border-radius:6px; margin-bottom:10px;">
        <div style="color:var(--muted); margin-bottom:4px;">Cá thể cư trú:</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          ${animalsInPen.length > 0
            ? animalsInPen.map(a => `<span onclick="openAnimalDetailView('${a.id}')" class="pill pill-accent" style="cursor:pointer; font-family:var(--mono);">${a.animal_code} (${a.sex === 'MALE' ? 'Đực' : (a.sex === 'FEMALE' ? 'Cái' : '?')})</span>`).join('')
            : '<span style="color:var(--faint); font-style:italic;">Chuồng hiện đang trống</span>'}
        </div>
      </div>

      <div style="font-size:11.5px; color:var(--faint); margin-bottom:10px;">
        Ghi chú: ${pen.notes || 'Không có ghi chú'}
      </div>

      <div>
        <button class="btn btn-outline btn-sm" style="width:100%;" onclick="openTransferModalForPen('${pen.id}')">Chuyển dúi vào chuồng này</button>
      </div>
    `;

    container.appendChild(card);
  });
}

// ==========================================
// 6. BREEDING & INBREEDING MODULE
// ==========================================

function renderBreeding() {
  const container = document.getElementById('littersListContainer');
  if (!container) return;

  const litters = window.farmDB.getLitters();
  container.innerHTML = '';

  if (litters.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:24px; color:var(--faint);">Chưa có lứa đẻ nào được ghi nhận.</div>';
  } else {
    litters.forEach(lit => {
      const mother = window.farmDB.getAnimalById(lit.mother_animal_id);
      const father = lit.father_animal_id ? window.farmDB.getAnimalById(lit.father_animal_id) : null;

      const card = document.createElement('div');
      card.className = 'item-card';

      card.innerHTML = `
        <div class="item-card-header">
          <span class="mono-code" style="font-size:15px; font-weight:600; color:var(--accent);">${lit.litter_code}</span>
          <span class="mono-code" style="font-size:12px; color:var(--faint);">${lit.birth_at}</span>
        </div>

        <div class="item-card-grid">
          <div>Mẹ: <strong class="mono-code">${mother ? mother.animal_code : 'N/A'}</strong></div>
          <div>Bố: <strong class="mono-code">${father ? father.animal_code : 'Chưa rõ'}</strong></div>
          <div>Tổng số con: <strong class="num">${lit.total_born} con</strong></div>
          <div>Sống / Chết: <span class="num" style="color:var(--positive); font-weight:600;">${lit.alive_count}</span> / <span class="num" style="color:var(--negative); font-weight:600;">${lit.deceased_count}</span></div>
        </div>

        ${lit.notes ? `<div style="font-size:12px; color:var(--muted); margin:4px 0 8px 0;">Ghi chú: ${lit.notes}</div>` : ''}

        <div style="margin-top:8px;">
          <button class="btn btn-outline btn-sm" style="width:100%;" onclick="openRegisterLitterMemberModal('${lit.id}')">+ Cấp mã định danh cho con</button>
        </div>
      `;

      container.appendChild(card);
    });
  }

  // Populate male and female dropdowns for Inbreeding Checker
  const maleSelect = document.getElementById('inbreedMaleSelect');
  const femaleSelect = document.getElementById('inbreedFemaleSelect');
  if (maleSelect && femaleSelect) {
    const males = window.farmDB.getAnimals().filter(a => a.sex === 'MALE' && a.status === 'ACTIVE');
    const females = window.farmDB.getAnimals().filter(a => a.sex === 'FEMALE' && a.status === 'ACTIVE');

    maleSelect.innerHTML = males.map(m => `<option value="${m.id}">${m.animal_code} - ${m.name || 'Đực giống'}</option>`).join('');
    femaleSelect.innerHTML = females.map(f => `<option value="${f.id}">${f.animal_code} - ${f.name || 'Nái đẻ'}</option>`).join('');
  }
}

function checkInbreeding() {
  const maleId = document.getElementById('inbreedMaleSelect').value;
  const femaleId = document.getElementById('inbreedFemaleSelect').value;
  const resultDiv = document.getElementById('inbreedingResult');

  if (!maleId || !femaleId) {
    alert('Vui lòng chọn cả đực và nái cần kiểm tra.');
    return;
  }

  const check = window.farmDB.checkInbreedingRisk(maleId, femaleId);

  let pillClass = 'pill-positive';
  let bg = 'var(--pill-positive-bg)';
  let border = '#bbf2cf';

  if (check.risk === 'EXTREME') {
    pillClass = 'pill-negative';
    bg = 'var(--pill-negative-bg)';
    border = '#fecaca';
  } else if (check.risk === 'HIGH') {
    pillClass = 'pill-warning';
    bg = 'var(--pill-warning-bg)';
    border = '#fde68a';
  }

  resultDiv.innerHTML = `
    <div style="padding:10px 12px; border-radius:6px; background:${bg}; border:1px solid ${border}; margin-top:8px;">
      <div style="font-size:13px; font-weight:600; color:var(--text); margin-bottom:3px;">
        Đánh giá nguy cơ: <span class="pill ${pillClass}">${check.risk}</span>
      </div>
      <div style="font-size:12px; color:var(--text); line-height:1.4;">${check.reason}</div>
    </div>
  `;
}
window.checkInbreeding = checkInbreeding;

// ==========================================
// 7. INCIDENTS SUB-MODULE (OFF_FEED & DEATH)
// ==========================================

function renderIncidents() {
  const container = document.getElementById('incidentsListContainer');
  if (!container) return;

  const incidents = window.farmDB.getIncidents();
  container.innerHTML = '';

  if (incidents.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:24px; color:var(--faint);">Chưa có sự cố nào được ghi nhận.</div>';
    return;
  }

  incidents.forEach(inc => {
    const animal = window.farmDB.getAnimalById(inc.animal_id);
    const pen = inc.pen_id ? window.farmDB.getPenById(inc.pen_id) : (animal ? window.farmDB.getCurrentPenForAnimal(animal.id) : null);
    const isDeath = inc.incident_type === 'DEATH';

    const card = document.createElement('div');
    card.className = 'item-card';

    let followUpsHtml = '';
    if (inc.follow_ups && inc.follow_ups.length > 0) {
      followUpsHtml = `
        <div style="background:var(--raised); padding:8px 10px; border-radius:6px; margin:8px 0; font-size:12px;">
          <div style="font-weight:600; color:var(--muted); margin-bottom:4px;">Nhật ký theo dõi:</div>
          ${inc.follow_ups.map(f => `
            <div style="margin-bottom:3px;">
              <span class="mono-code" style="color:var(--faint);">${new Date(f.time).toLocaleDateString('vi-VN')}:</span> ${f.note}
            </div>
          `).join('')}
        </div>
      `;
    }

    card.innerHTML = `
      <div class="item-card-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="pill ${isDeath ? 'pill-negative' : 'pill-warning'}">${isDeath ? 'Tử vong' : 'Bỏ ăn'}</span>
          <span class="mono-code" style="font-size:15px; font-weight:600; color:var(--accent);">${animal ? animal.animal_code : 'N/A'}</span>
          ${pen ? `<span style="font-size:12px; color:var(--muted);">${pen.pen_code}</span>` : ''}
        </div>
        <span class="pill ${inc.status === 'OPEN' ? 'pill-accent' : 'pill-neutral'}">${inc.status === 'OPEN' ? 'Đang mở' : 'Đã đóng'}</span>
      </div>

      <div style="font-size:12.5px; color:var(--text); margin:4px 0;">
        <strong>Triệu chứng:</strong> ${inc.symptoms_observed}
      </div>

      ${inc.actions_taken ? `
        <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">
          <strong>Xử lý ban đầu:</strong> ${inc.actions_taken}
        </div>
      ` : ''}

      ${followUpsHtml}

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; font-size:11.5px; color:var(--faint);">
        <span>Phát hiện: <span class="mono-code">${new Date(inc.detected_at).toLocaleString('vi-VN')}</span></span>
      </div>

      ${!isDeath && inc.status === 'OPEN' ? `
        <div style="display:flex; gap:6px; margin-top:10px;">
          <button class="btn btn-outline btn-sm" style="flex:1;" onclick="openAddFollowUpModal('${inc.id}')">Cập nhật theo dõi</button>
          <button class="btn btn-primary btn-sm" style="flex:1;" onclick="openCloseIncidentModal('${inc.id}')">Đóng ca</button>
        </div>
      ` : ''}
    `;

    container.appendChild(card);
  });
}

// ==========================================
// 8. HEALTH & MEDICINES SUB-MODULE
// ==========================================

function renderHealthAndMedicines() {
  const medContainer = document.getElementById('medicinesMobileContainer');
  if (medContainer) {
    medContainer.innerHTML = '';
    const meds = window.farmDB.getMedicines();
    meds.forEach(m => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="item-card-header">
          <div style="font-size:14px; font-weight:600; color:var(--text);">${m.trade_name}</div>
          <span class="pill pill-neutral">${m.medicine_group}</span>
        </div>
        <div style="font-size:12.5px; margin:4px 0; color:var(--text);"><strong>Hoạt chất:</strong> ${m.active_ingredient}</div>
        <div style="font-size:12px; color:var(--muted); margin-bottom:8px;">${m.reference_description}</div>
        <div style="font-size:11.5px; background:var(--pill-warning-bg); color:var(--pill-warning-ink); padding:6px 8px; border-radius:4px; margin-bottom:4px; border:1px solid #fde68a;">
          <strong>Lưu ý:</strong> ${m.warnings}
        </div>
        <div style="font-size:11px; color:var(--faint);">Nguồn: ${m.source_reference}</div>
      `;
      medContainer.appendChild(card);
    });
  }

  const healthContainer = document.getElementById('healthRecordsMobileContainer');
  if (healthContainer) {
    healthContainer.innerHTML = '';
    const healthRecords = window.farmDB.getHealthRecords();
    if (healthRecords.length === 0) {
      healthContainer.innerHTML = '<div style="color:var(--faint); font-size:12.5px; padding:10px 0;">Không có bệnh án nào cần xử lý.</div>';
    } else {
      healthRecords.forEach(hr => {
        const animal = window.farmDB.getAnimalById(hr.animal_id);
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
          <div class="item-card-header">
            <span class="mono-code" style="font-weight:600; color:var(--accent);">${animal ? animal.animal_code : 'N/A'}</span>
            <span class="pill ${hr.severity === 'SEVERE' ? 'pill-negative' : 'pill-warning'}">${hr.severity}</span>
          </div>
          <div style="font-size:12.5px; color:var(--text); margin:4px 0;"><strong>Chẩn đoán:</strong> ${hr.diagnosis_text}</div>
          <div style="font-size:11.5px; color:var(--muted);">Người ghi nhận: ${hr.recorded_by} · Ngày: <span class="mono-code">${new Date(hr.detected_at).toLocaleDateString('vi-VN')}</span></div>
        `;
        healthContainer.appendChild(card);
      });
    }
  }
}

// ==========================================
// 9. INTELLIGENT SEARCH
// ==========================================

function executeMobileSearch(query) {
  const container = document.getElementById('mobileSearchResultsContainer');
  if (!container) return;

  if (!query) {
    container.innerHTML = '<div style="color:var(--faint); font-size:12.5px; text-align:center; padding:16px;">Vui lòng nhập từ khóa tìm kiếm</div>';
    return;
  }

  const data = window.farmSearch.search(query);
  container.innerHTML = '';

  if (data.results.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:24px; color:var(--faint); font-size:13px;">
        Không tìm thấy dữ liệu nào phù hợp với "${query}".
      </div>
    `;
    return;
  }

  data.results.forEach(res => {
    const card = document.createElement('div');
    card.className = 'item-card';

    card.innerHTML = `
      <div class="item-card-header">
        <div>
          <span style="font-size:10.5px; font-weight:600; color:var(--faint); text-transform:uppercase;">${res.category}</span>
          <div style="font-size:14px; font-weight:600; color:var(--text); margin-top:2px;">${res.title}</div>
        </div>
        <span class="pill pill-${res.badgeType}">${res.badge}</span>
      </div>
      <div style="font-size:12px; color:var(--muted); margin:4px 0 8px 0;">${res.snippet}</div>
      <div>
        ${res.actionType === 'VIEW_ANIMAL' ? `<button class="btn btn-outline btn-sm" onclick="openAnimalDetailView('${res.id}')">Xem hồ sơ cá thể</button>` : ''}
        ${res.actionType === 'VIEW_PEN' ? `<button class="btn btn-outline btn-sm" onclick="switchSubModule('sub-pens')">Xem danh mục chuồng</button>` : ''}
        ${res.actionType === 'VIEW_INCIDENT' ? `<button class="btn btn-outline btn-sm" onclick="switchSubModule('sub-incidents')">Xem sự cố</button>` : ''}
        ${res.actionType === 'VIEW_MEDICINE' ? `<button class="btn btn-outline btn-sm" onclick="switchSubModule('sub-health')">Xem thông tin thuốc</button>` : ''}
      </div>
    `;

    container.appendChild(card);
  });
}

// ==========================================
// 10. AI ASSISTANT CHAT
// ==========================================

function sendAIMessage(text) {
  if (!text || !text.trim()) return;
  const q = text.trim();

  const container = document.getElementById('aiChatMessages');
  const input = document.getElementById('aiChatInput');
  if (!container) return;

  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble user';
  userBubble.textContent = q;
  container.appendChild(userBubble);
  if (input) input.value = '';

  container.scrollTop = container.scrollHeight;

  setTimeout(() => {
    const response = window.farmAI.ask(q);
    const botBubble = document.createElement('div');
    botBubble.className = 'chat-bubble bot';

    let formattedText = response.reply
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');

    let sourceHtml = '';
    if (response.sources && response.sources.length > 0) {
      sourceHtml = `<div class="chat-source" style="font-size:11px; color:var(--faint); margin-top:6px; border-top:1px dashed var(--border); padding-top:4px;">Nguồn trích dẫn: ${response.sources.join(', ')}</div>`;
    }

    botBubble.innerHTML = `<div>${formattedText}</div>${sourceHtml}`;
    container.appendChild(botBubble);
    container.scrollTop = container.scrollHeight;
  }, 200);
}

// ==========================================
// 11. AUDIT LOGS
// ==========================================

function renderAuditLogs() {
  const container = document.getElementById('auditLogsMobileContainer');
  if (!container) return;

  const logs = window.farmDB.getAuditLogs();
  container.innerHTML = '';

  if (logs.length === 0) {
    container.innerHTML = '<div style="color:var(--faint); font-size:12px; padding:8px 0;">Không có nhật ký kiểm toán nào.</div>';
    return;
  }

  logs.slice(0, 15).forEach(l => {
    const row = document.createElement('div');
    row.style.cssText = 'padding:8px 0; border-bottom:1px solid var(--rule); font-size:12px;';
    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
        <strong>${l.actor}</strong>
        <span class="mono-code" style="color:var(--faint);">${new Date(l.time).toLocaleString('vi-VN')}</span>
      </div>
      <div style="color:var(--text);">${l.details}</div>
    `;
    container.appendChild(row);
  });
}

// ==========================================
// 12. GLOBAL MODALS & FORMS CONTROLLERS
// ==========================================

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}
window.closeModal = closeModal;

// Modal: Thêm cá thể
function openAddAnimalModal() {
  if (!window.farmDB.canCreateRecords()) {
    alert('Tài khoản Viewer chỉ có quyền xem dữ liệu, không thể tạo cá thể mới.');
    return;
  }

  document.getElementById('newAnimalCode').value = 'D00' + (window.farmDB.getAnimals().length + 1);
  document.getElementById('newAnimalName').value = '';
  document.getElementById('newAnimalNotes').value = '';
  document.getElementById('newAnimalDOB').value = new Date().toISOString().split('T')[0];

  const penSelect = document.getElementById('newAnimalPenSelect');
  if (penSelect) {
    const pens = window.farmDB.getPens();
    penSelect.innerHTML = '<option value="">Chưa phân bổ</option>' +
      pens.map(p => `<option value="${p.id}">Chuồng ${p.pen_code} - ${p.name}</option>`).join('');
  }

  const modal = document.getElementById('modalAddAnimal');
  if (modal) modal.classList.add('active');
}
window.openAddAnimalModal = openAddAnimalModal;

function submitAddAnimal() {
  const code = document.getElementById('newAnimalCode').value.trim();
  const name = document.getElementById('newAnimalName').value.trim();
  const species = document.getElementById('newAnimalSpecies').value;
  const sex = document.getElementById('newAnimalSex').value;
  const dob = document.getElementById('newAnimalDOB').value;
  const origin = document.getElementById('newAnimalOrigin').value;
  const penId = document.getElementById('newAnimalPenSelect').value;
  const notes = document.getElementById('newAnimalNotes').value.trim();

  if (!code) {
    alert('Vui lòng nhập mã định danh cho cá thể');
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
      window.farmDB.transferAnimal(animal.id, penId, 'Gán chuồng ban đầu', window.farmDB.getCurrentUser().name);
    }

    closeModal('modalAddAnimal');
    renderAnimals();
    renderDashboard();
  } catch (err) {
    alert(err.message);
  }
}
window.submitAddAnimal = submitAddAnimal;

// Modal: Ghi nhận cân nặng
function openWeightModal(animalId) {
  if (!window.farmDB.canCreateRecords()) {
    alert('Tài khoản Viewer chỉ có quyền xem dữ liệu.');
    return;
  }

  const animal = window.farmDB.getAnimalById(animalId);
  if (!animal) return;

  document.getElementById('weightAnimalId').value = animal.id;
  document.getElementById('weightAnimalLabel').textContent = `${animal.animal_code} - ${animal.name || ''}`;
  document.getElementById('weightValueInput').value = '';
  document.getElementById('weightNoteInput').value = '';

  const modal = document.getElementById('modalAddWeight');
  if (modal) modal.classList.add('active');
}
window.openWeightModal = openWeightModal;

function submitAddWeight() {
  const animalId = document.getElementById('weightAnimalId').value;
  const val = document.getElementById('weightValueInput').value;
  const note = document.getElementById('weightNoteInput').value.trim();

  if (!val || parseFloat(val) <= 0) {
    alert('Vui lòng nhập trọng lượng hợp lệ (> 0)');
    return;
  }

  window.farmDB.addWeight(animalId, val, 'kg', note, window.farmDB.getCurrentUser().name);
  closeModal('modalAddWeight');

  if (document.getElementById('animalDetailView').classList.contains('open')) {
    openAnimalDetailView(animalId);
  }
  renderAnimals();
}
window.submitAddWeight = submitAddWeight;

// Modal: Điều chuyển chuồng
function openTransferModal(animalId) {
  if (!window.farmDB.canCreateRecords()) {
    alert('Tài khoản Viewer chỉ có quyền xem dữ liệu.');
    return;
  }

  const animal = window.farmDB.getAnimalById(animalId);
  if (!animal) return;

  document.getElementById('transferAnimalId').value = animal.id;
  document.getElementById('transferAnimalSelectGroup').style.display = 'none';
  document.getElementById('transferAnimalInfoGroup').style.display = 'block';
  document.getElementById('transferAnimalLabel').textContent = `${animal.animal_code} - ${animal.name || ''}`;

  const currentPen = window.farmDB.getCurrentPenForAnimal(animal.id);
  document.getElementById('transferCurrentPen').textContent = currentPen ? `Chuồng ${currentPen.pen_code} (${currentPen.name})` : 'Chưa phân chuồng';

  const select = document.getElementById('transferPenSelect');
  const pens = window.farmDB.getPens();
  select.innerHTML = pens.map(p => `<option value="${p.id}" ${currentPen && currentPen.id === p.id ? 'selected' : ''}>Chuồng ${p.pen_code} - ${p.name} (${p.status})</option>`).join('');

  const modal = document.getElementById('modalTransferAnimal');
  if (modal) modal.classList.add('active');
}
window.openTransferModal = openTransferModal;

function openTransferModalForPen(targetPenId) {
  if (!window.farmDB.canCreateRecords()) {
    alert('Tài khoản Viewer chỉ có quyền xem dữ liệu.');
    return;
  }

  const pen = window.farmDB.getPenById(targetPenId);
  if (!pen) return;

  document.getElementById('transferAnimalId').value = '';
  document.getElementById('transferAnimalInfoGroup').style.display = 'none';
  document.getElementById('transferAnimalSelectGroup').style.display = 'block';

  const activeAnimals = window.farmDB.getAnimals().filter(a => a.status === 'ACTIVE');
  const animalSelect = document.getElementById('transferAnimalSelect');
  animalSelect.innerHTML = activeAnimals.map(a => {
    const curPen = window.farmDB.getCurrentPenForAnimal(a.id);
    return `<option value="${a.id}">${a.animal_code} - ${a.name || 'Dúi'} (Hiện tại: ${curPen ? curPen.pen_code : 'Chưa có chuồng'})</option>`;
  }).join('');

  const penSelect = document.getElementById('transferPenSelect');
  const pens = window.farmDB.getPens();
  penSelect.innerHTML = pens.map(p => `<option value="${p.id}" ${p.id === targetPenId ? 'selected' : ''}>Chuồng ${p.pen_code} - ${p.name}</option>`).join('');

  const modal = document.getElementById('modalTransferAnimal');
  if (modal) modal.classList.add('active');
}
window.openTransferModalForPen = openTransferModalForPen;

function submitTransferAnimal() {
  let animalId = document.getElementById('transferAnimalId').value;
  if (!animalId) {
    animalId = document.getElementById('transferAnimalSelect').value;
  }
  const newPenId = document.getElementById('transferPenSelect').value;
  const reason = document.getElementById('transferReasonInput').value.trim() || 'Điều chuyển chuồng';

  if (!animalId || !newPenId) {
    alert('Vui lòng chọn đầy đủ cá thể và chuồng cần chuyển.');
    return;
  }

  window.farmDB.transferAnimal(animalId, newPenId, reason, window.farmDB.getCurrentUser().name);
  closeModal('modalTransferAnimal');

  if (document.getElementById('animalDetailView').classList.contains('open')) {
    openAnimalDetailView(animalId);
  }
  renderAnimals();
  renderPens();
  renderDashboard();
}
window.submitTransferAnimal = submitTransferAnimal;

// Modal: Ghi nhận sự cố (OFF_FEED & DEATH)
function openIncidentModal(type) {
  if (!window.farmDB.canCreateRecords()) {
    alert('Tài khoản Viewer chỉ có quyền xem dữ liệu.');
    return;
  }

  document.getElementById('incidentTypeInput').value = type;
  document.getElementById('incidentModalTitle').textContent = type === 'DEATH' ? 'Ghi nhận dúi chết (DEATH)' : 'Báo dúi bỏ ăn (OFF_FEED)';

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
window.openIncidentModal = openIncidentModal;

function submitCreateIncident() {
  const type = document.getElementById('incidentTypeInput').value;
  const animalId = document.getElementById('incidentAnimalSelect').value;
  const symptoms = document.getElementById('incidentSymptomsInput').value.trim();
  const actions = document.getElementById('incidentActionsInput').value.trim();

  if (!animalId || !symptoms) {
    alert('Vui lòng chọn cá thể và nhập triệu chứng quan sát được.');
    return;
  }

  try {
    window.farmDB.createIncident({
      incident_type: type,
      animal_id: animalId,
      symptoms_observed: symptoms,
      actions_taken: actions,
      recorded_by: window.farmDB.getCurrentUser().name
    });

    closeModal('modalCreateIncident');
    renderIncidents();
    renderDashboard();
    renderAnimals();
  } catch (err) {
    alert(err.message);
  }
}
window.submitCreateIncident = submitCreateIncident;

// Modal: Cập nhật theo dõi sự cố
function openAddFollowUpModal(incId) {
  document.getElementById('followUpIncidentId').value = incId;
  document.getElementById('followUpNoteInput').value = '';
  const modal = document.getElementById('modalAddFollowUp');
  if (modal) modal.classList.add('active');
}
window.openAddFollowUpModal = openAddFollowUpModal;

function submitAddFollowUp() {
  const incId = document.getElementById('followUpIncidentId').value;
  const note = document.getElementById('followUpNoteInput').value.trim();
  if (!note) {
    alert('Vui lòng nhập nội dung theo dõi');
    return;
  }

  window.farmDB.addIncidentFollowUp(incId, note, window.farmDB.getCurrentUser().name);
  closeModal('modalAddFollowUp');
  renderIncidents();
  renderDashboard();
}
window.submitAddFollowUp = submitAddFollowUp;

// Modal: Đóng ca sự cố
function openCloseIncidentModal(incId) {
  document.getElementById('closeIncidentId').value = incId;
  document.getElementById('closeOutcomeInput').value = '';
  const modal = document.getElementById('modalCloseIncident');
  if (modal) modal.classList.add('active');
}
window.openCloseIncidentModal = openCloseIncidentModal;

function submitCloseIncident() {
  const incId = document.getElementById('closeIncidentId').value;
  const outcome = document.getElementById('closeOutcomeInput').value.trim();
  if (!outcome) {
    alert('Vui lòng nhập kết quả xử lý và tình trạng hồi phục.');
    return;
  }

  window.farmDB.closeIncident(incId, outcome, window.farmDB.getCurrentUser().name);
  closeModal('modalCloseIncident');
  renderIncidents();
  renderDashboard();
}
window.submitCloseIncident = submitCloseIncident;

// Modal: Lứa đẻ mới
function openCreateLitterModal() {
  if (!window.farmDB.canCreateRecords()) {
    alert('Tài khoản Viewer chỉ có quyền xem dữ liệu.');
    return;
  }

  document.getElementById('litterCodeInput').value = 'LIT-' + new Date().getFullYear() + '-0' + (window.farmDB.getLitters().length + 1);

  const motherSelect = document.getElementById('litterMotherSelect');
  const fatherSelect = document.getElementById('litterFatherSelect');

  const females = window.farmDB.getAnimals().filter(a => a.sex === 'FEMALE');
  const males = window.farmDB.getAnimals().filter(a => a.sex === 'MALE');

  motherSelect.innerHTML = females.map(f => `<option value="${f.id}">${f.animal_code} - ${f.name || 'Nái đẻ'}</option>`).join('');
  fatherSelect.innerHTML = '<option value="">Chưa rõ</option>' +
    males.map(m => `<option value="${m.id}">${m.animal_code} - ${m.name || 'Đực giống'}</option>`).join('');

  document.getElementById('litterBirthDateInput').value = new Date().toISOString().split('T')[0];
  document.getElementById('litterTotalBornInput').value = '3';
  document.getElementById('litterAliveCountInput').value = '3';
  document.getElementById('litterDeceasedCountInput').value = '0';
  document.getElementById('litterNotesInput').value = '';

  const modal = document.getElementById('modalCreateLitter');
  if (modal) modal.classList.add('active');
}
window.openCreateLitterModal = openCreateLitterModal;

function submitCreateLitter() {
  const code = document.getElementById('litterCodeInput').value.trim();
  const motherId = document.getElementById('litterMotherSelect').value;
  const fatherId = document.getElementById('litterFatherSelect').value;
  const birthAt = document.getElementById('litterBirthDateInput').value;
  const total = document.getElementById('litterTotalBornInput').value;
  const alive = document.getElementById('litterAliveCountInput').value;
  const deceased = document.getElementById('litterDeceasedCountInput').value;
  const notes = document.getElementById('litterNotesInput').value.trim();

  if (!code || !motherId) {
    alert('Vui lòng nhập mã lứa và chọn nái mẹ.');
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
  renderBreeding();
}
window.submitCreateLitter = submitCreateLitter;

// Modal: Cấp mã cá thể con
function openRegisterLitterMemberModal(litterId) {
  if (!window.farmDB.canCreateRecords()) {
    alert('Tài khoản Viewer chỉ có quyền xem dữ liệu.');
    return;
  }

  document.getElementById('registerMemberLitterId').value = litterId;
  document.getElementById('registerMemberCodeInput').value = 'D00' + (window.farmDB.getAnimals().length + 1);
  document.getElementById('registerMemberNameInput').value = '';

  const penSelect = document.getElementById('registerMemberPenSelect');
  penSelect.innerHTML = '<option value="">Chưa phân bổ</option>' +
    window.farmDB.getPens().map(p => `<option value="${p.id}">Chuồng ${p.pen_code} - ${p.name}</option>`).join('');

  const modal = document.getElementById('modalRegisterLitterMember');
  if (modal) modal.classList.add('active');
}
window.openRegisterLitterMemberModal = openRegisterLitterMemberModal;

function submitRegisterLitterMember() {
  const litterId = document.getElementById('registerMemberLitterId').value;
  const code = document.getElementById('registerMemberCodeInput').value.trim();
  const name = document.getElementById('registerMemberNameInput').value.trim();
  const sex = document.getElementById('registerMemberSexSelect').value;
  const penId = document.getElementById('registerMemberPenSelect').value;

  if (!code) {
    alert('Vui lòng nhập mã định danh cho dúi con');
    return;
  }

  try {
    window.farmDB.registerLitterMemberAsAnimal({
      litter_id: litterId,
      animal_code: code,
      name,
      sex,
      pen_id: penId || null,
      recorded_by: window.farmDB.getCurrentUser().name
    });

    closeModal('modalRegisterLitterMember');
    renderBreeding();
    renderAnimals();
    renderDashboard();
  } catch (err) {
    alert(err.message);
  }
}
window.submitRegisterLitterMember = submitRegisterLitterMember;
