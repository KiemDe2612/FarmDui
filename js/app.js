/**
 * Farm Management Mobile-First & Touch-First Main Application Controller (js/app.js)
 * Architecture: Mobile-first, Touch-first, Offline-first
 * Compliance: Taste-skill, tabular figures, min 44x44px touch targets, zero slop.
 */

let mapEditorInstance = null;
let currentActiveTab = 'tab-dashboard';
let currentAnimalFilter = 'ALL';
let currentDetailAnimalId = null;
let currentDetailTabKey = 'info';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initial State & RBAC Setup
  const user = window.farmDB.getCurrentUser();
  updateRoleUI();

  window.addEventListener('farmdb-persist-error', () => {
    appNotice('Lỗi: không lưu được dữ liệu vào máy (bộ nhớ có thể đã đầy). Hãy tải file sao lưu ngay để khỏi mất dữ liệu.');
  });
  if (window.farmDB.loadWarning) {
    appNotice('Lỗi: dữ liệu cũ trên máy bị hỏng nên đã nạp dữ liệu mẫu. Bản hỏng được giữ lại trong bộ nhớ trình duyệt để cứu hộ.');
  }
  if (user.role === 'ADMIN' || user.role === 'MANAGER') {
    const last = window.farmDB.data.last_backup_at;
    const days = last ? (Date.now() - new Date(last).getTime()) / 86400000 : Infinity;
    let shown = false;
    try { shown = sessionStorage.getItem('backup_nag') === '1'; sessionStorage.setItem('backup_nag', '1'); } catch (e) { /* bỏ qua */ }
    if (days > 7 && !shown) {
      setTimeout(() => window.showToast(last ? 'Đã hơn 7 ngày chưa sao lưu. Vào Khác, Dữ liệu và Sao lưu để tải file JSON.' : 'Chưa từng sao lưu dữ liệu. Vào Khác, Dữ liệu và Sao lưu để tải file JSON.', 'info', 6000), 1500);
    }
  }

  // Setup Online/Offline Status Indicator
  const onlineDot = document.getElementById('onlineStatusDot');
  const syncStatusText = document.getElementById('syncStatusText');
  const updateOnline = () => {
    const isOnline = navigator.onLine;
    if (onlineDot) {
      onlineDot.style.background = isOnline ? 'var(--positive)' : 'var(--negative)';
    }
    if (syncStatusText) {
      syncStatusText.textContent = isOnline ? 'Lưu trên máy' : 'Ngoại tuyến';
      syncStatusText.title = isOnline ? 'Dữ liệu đang lưu trên điện thoại này. Chưa có máy chủ để đồng bộ với thiết bị khác.' : 'Không có mạng. App vẫn dùng bình thường, dữ liệu lưu trên điện thoại.';
    }
  };
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);
  updateOnline();

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
  if (animalSearchInput) {
    animalSearchInput.addEventListener('input', () => renderAnimals());
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
          appNotice('Khôi phục dữ liệu từ file JSON thành công!');
          location.reload();
        } catch (err) {
          appNotice('Lỗi: ' + err.message);
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
        appNotice('Đã khôi phục dữ liệu mẫu gốc thành công.');
        location.reload();
      }
    });
  }

  // 7. Modal backdrop click to close
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });

  // 8. Initial View Render
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
    setTimeout(() => MapUI.onTabShown(), 80);
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
    'sub-backup': 'Dữ liệu & Sao lưu',
    'sub-accounts': 'Quản lý tài khoản'
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
    case 'sub-accounts':
      if (window.renderAccounts) window.renderAccounts();
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

function updateRoleUI() {
  if (window.refreshAccountUI) window.refreshAccountUI();
}

// ==========================================
// 1. DASHBOARD MODULE (MOBILE CARDS & ALERTS)
// ==========================================

function renderDashboard() {
  const stats = window.farmDB.getDashboardStats();

  // 6 KPI Cards
  const elTotalAnimals = document.getElementById('statTotalAnimals');
  if (elTotalAnimals) elTotalAnimals.textContent = stats.totalActiveAnimals;

  const elSexRatio = document.getElementById('statSexRatio');
  if (elSexRatio) elSexRatio.textContent = `Đực: ${stats.maleCount} · Cái: ${stats.femaleCount}`;

  const elTotalPens = document.getElementById('statTotalPens');
  if (elTotalPens) elTotalPens.textContent = stats.totalPens;

  const elActivePens = document.getElementById('statActivePens');
  if (elActivePens) elActivePens.textContent = stats.activePens;

  const elEmptyPens = document.getElementById('statEmptyPens');
  if (elEmptyPens) elEmptyPens.textContent = stats.emptyPens;

  const elBreedingPens = document.getElementById('statBreedingPens');
  if (elBreedingPens) elBreedingPens.textContent = stats.breedingPens;

  const elQuarantinePens = document.getElementById('statQuarantinePens');
  if (elQuarantinePens) elQuarantinePens.textContent = stats.quarantinePens;

  // Alerts
  const elOpenIncidents = document.getElementById('statOpenIncidents');
  if (elOpenIncidents) elOpenIncidents.textContent = stats.openOffFeedIncidents;

  const elTotalDeaths = document.getElementById('statTotalDeaths');
  if (elTotalDeaths) elTotalDeaths.textContent = stats.totalDeaths;

  const elNewBorns = document.getElementById('statNewBorns');
  if (elNewBorns) elNewBorns.textContent = stats.newBornCount || 0;

  // Recent Activities
  const listContainer = document.getElementById('dashboardRecentActivitiesList');
  if (!listContainer) return;

  listContainer.innerHTML = '';
  const activities = stats.recentActivities || [];

  if (activities.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align:center; padding:18px; color:var(--faint); font-size:12.5px;">
        Chưa có hoạt động nào được ghi nhận gần đây.
      </div>
    `;
    return;
  }

  activities.forEach(act => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.style.cursor = 'pointer';
    card.style.marginBottom = '6px';
    card.style.padding = '10px 12px';
    card.onclick = () => {
      if (act.type === 'INCIDENT') switchSubModule('sub-incidents');
      else if (act.type === 'LITTER') switchTab('tab-breeding');
      else switchTab('tab-animals');
    };

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <span class="pill ${act.badgeClass}" style="font-size:11px;">${esc(act.title)}</span>
        <span class="mono-code" style="font-size:11px; color:var(--faint);">${new Date(act.time).toLocaleDateString('vi-VN')}</span>
      </div>
      <div style="font-size:12.5px; color:var(--text); line-height:1.35;">
        ${esc(act.desc)}
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
  window.currentSheetPenId = penId;

  const zone = pen.zone_id ? window.farmDB.getZones().find(z => z.id === pen.zone_id) : null;

  const sheetPenCode = document.getElementById('sheetPenCode');
  const sheetPenName = document.getElementById('sheetPenName');
  const sheetPenStatus = document.getElementById('sheetPenStatus');
  const sheetPenZone = document.getElementById('sheetPenZone');
  const sheetPenCapacityMax = document.getElementById('sheetPenCapacityMax');
  const sheetPenAnimalCount = document.getElementById('sheetPenAnimalCount');
  const sheetAnimalsHeader = document.getElementById('sheetAnimalsHeader');
  const sheetAnimalsList = document.getElementById('sheetAnimalsList');
  const sheetTransferBtn = document.getElementById('sheetTransferBtn');

  if (sheetPenCode) sheetPenCode.textContent = `Chuồng ${esc(pen.pen_code)}`;
  if (sheetPenName) sheetPenName.textContent = pen.name || 'Chuồng nuôi dúi tiêu chuẩn';
  if (sheetPenZone) sheetPenZone.textContent = zone ? zone.name : 'Khu chung';
  if (sheetPenCapacityMax) sheetPenCapacityMax.textContent = `${pen.capacity} con`;
  if (sheetPenAnimalCount) sheetPenAnimalCount.textContent = `${animals.length} con`;
  if (sheetAnimalsHeader) sheetAnimalsHeader.textContent = `Danh sách cá thể (${animals.length})`;

  if (sheetPenStatus) {
    let statusText = 'Đang nuôi';
    let pillClass = 'pill-positive';
    if (pen.status === 'BREEDING') { statusText = 'Sinh sản'; pillClass = 'pill-accent'; }
    else if (pen.status === 'QUARANTINE') { statusText = 'Cách ly'; pillClass = 'pill-negative'; }
    else if (pen.status === 'EMPTY' || animals.length === 0) { statusText = 'Trống'; pillClass = 'pill-neutral'; }

    sheetPenStatus.className = `pill ${pillClass}`;
    sheetPenStatus.textContent = statusText;
  }

  if (sheetAnimalsList) {
    sheetAnimalsList.innerHTML = '';
    if (animals.length === 0) {
      sheetAnimalsList.innerHTML = '<span style="color:var(--faint); font-style:italic; padding:6px 0; display:block;">Chuồng hiện đang trống, chưa có cá thể nuôi.</span>';
    } else {
      animals.forEach(a => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:var(--raised); border-radius:6px; margin-bottom:6px; cursor:pointer;';
        const genderLabel = a.sex === 'MALE' ? 'Đực' : (a.sex === 'FEMALE' ? 'Cái' : '?');
        const genderColor = a.sex === 'MALE' ? 'var(--accent)' : '#b83280';

        item.onclick = (e) => {
          e.stopPropagation();
          closeMapSheet();
          openAnimalDetailView(a.id);
        };

        item.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:34px; height:28px; border-radius:6px; background:var(--surface); display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600; color:${genderColor};">
              ${genderLabel}
            </div>
            <div>
              <div class="mono-code" style="font-weight:600; color:var(--text); font-size:13px;">${esc(a.animal_code)}</div>
              <div style="font-size:11.5px; color:var(--muted);">${esc(a.name || 'Dúi')} · ${esc(a.species || 'Dúi Mốc')}</div>
            </div>
          </div>
          <span class="pill ${a.status === 'ACTIVE' ? 'pill-positive' : 'pill-neutral'}">${a.status === 'ACTIVE' ? 'Bình thường' : esc(a.status)}</span>
        `;
        sheetAnimalsList.appendChild(item);
      });
    }
  }

  if (sheetTransferBtn) {
    sheetTransferBtn.onclick = () => MapUI.openPenAnimals(pen.id);
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

  window.currentSheetPenId = null;
  if (mapEditorInstance && !mapEditorInstance.isEditMode) {
    mapEditorInstance.selectedBlock = null;
    mapEditorInstance.requestRender();
  }
}
window.closeMapSheet = closeMapSheet;

window.onDeselectBlock = function() {
  closeMapSheet();
};

function toggleMapEditMode() {
  MapUI.toggle();
}
window.toggleMapEditMode = toggleMapEditMode;

function filterMapByZone(zoneId) {
  MapUI.setZone(zoneId);
}
window.filterMapByZone = filterMapByZone;

window.setMapEditorInstance = function(inst) {
  mapEditorInstance = inst;
};

// ==========================================
// 3. ANIMAL PROFILES MODULE (MOBILE CARDS)
// ==========================================

function setAnimalFilter(filterKey) {
  currentAnimalFilter = filterKey;
  const chips = document.querySelectorAll('#animalFilterChips .horizontal-tab-btn');
  chips.forEach(c => {
    if (c.getAttribute('data-filter') === filterKey) {
      c.classList.add('active');
    } else {
      c.classList.remove('active');
    }
  });
  renderAnimals();
}
window.setAnimalFilter = setAnimalFilter;

function renderAnimals() {
  const container = document.getElementById('animalsListContainer');
  const countHeader = document.getElementById('animalCountHeader');
  if (!container) return;

  const searchVal = document.getElementById('animalSearchInput') ? document.getElementById('animalSearchInput').value.trim() : '';

  let animals = window.farmDB.getAnimals();

  // Search filter
  if (searchVal) {
    const q = searchVal.toLowerCase();
    animals = animals.filter(a => {
      return a.animal_code.toLowerCase().includes(q) ||
        (a.name && a.name.toLowerCase().includes(q)) ||
        (a.notes && a.notes.toLowerCase().includes(q));
    });
  }

  // Filter chips
  if (currentAnimalFilter === 'MALE') {
    animals = animals.filter(a => a.sex === 'MALE');
  } else if (currentAnimalFilter === 'FEMALE') {
    animals = animals.filter(a => a.sex === 'FEMALE');
  } else if (currentAnimalFilter === 'ACTIVE') {
    animals = animals.filter(a => a.status === 'ACTIVE');
  } else if (currentAnimalFilter === 'DECEASED') {
    animals = animals.filter(a => a.status === 'DECEASED');
  } else if (currentAnimalFilter === 'BREEDING') {
    animals = animals.filter(a => {
      const p = window.farmDB.getCurrentPenForAnimal(a.id);
      return p && p.status === 'BREEDING';
    });
  } else if (currentAnimalFilter === 'QUARANTINE') {
    animals = animals.filter(a => {
      const p = window.farmDB.getCurrentPenForAnimal(a.id);
      return p && p.status === 'QUARANTINE';
    });
  }

  if (countHeader) {
    countHeader.textContent = `${animals.length} cá thể trong hệ thống`;
  }

  container.innerHTML = '';
  if (animals.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:36px 16px; color:var(--faint);">
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
    let statusText = 'Bình thường';
    if (a.status === 'DECEASED') { statusPillClass = 'pill-negative'; statusText = 'Tử vong'; }
    else if (a.status === 'SOLD') { statusPillClass = 'pill-neutral'; statusText = 'Đã bán'; }
    else if (currentPen && currentPen.status === 'BREEDING') { statusPillClass = 'pill-accent'; statusText = 'Sinh sản'; }
    else if (currentPen && currentPen.status === 'QUARANTINE') { statusPillClass = 'pill-negative'; statusText = 'Cách ly'; }

    const genderLabel = a.sex === 'MALE' ? 'Đực' : (a.sex === 'FEMALE' ? 'Cái' : '?');
    const genderColor = a.sex === 'MALE' ? 'var(--accent)' : '#b83280';

    const card = document.createElement('div');
    card.className = 'item-card';
    card.style.cursor = 'pointer';
    card.onclick = () => openAnimalDetailView(a.id);

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="animal-card-avatar">
            <span style="font-size:12px; font-weight:600; color:${genderColor};">${genderLabel}</span>
          </div>
          <div>
            <div style="display:flex; align-items:center; gap:6px;">
              <span class="mono-code" style="font-size:16px; font-weight:600; color:var(--text);">${esc(a.animal_code)}</span>
              <span style="font-size:13px; font-weight:500; color:var(--muted);">${esc(a.name || '')}</span>
            </div>
            <div style="font-size:12px; color:var(--accent); font-weight:500;">
              Chuồng: ${esc(currentPen ? currentPen.pen_code : 'Chưa phân')}
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="pill ${statusPillClass}">${statusText}</span>
          <span style="color:var(--faint); font-size:18px;">›</span>
        </div>
      </div>

      <div class="item-card-grid" style="font-size:12px; border-top:1px solid var(--rule); padding-top:6px; margin-top:4px;">
        <div>Ngày sinh: <span class="mono-code">${esc(a.date_of_birth || '-')}</span></div>
        <div>Cân nặng: <strong class="num">${latestWeight ? `${esc(latestWeight.weight_value)} kg` : '-'}</strong></div>
      </div>
    `;

    container.appendChild(card);
  });
}

// ==========================================
// 4. FULL-SCREEN SLIDE-OVER DETAIL VIEW (7 TABS)
// ==========================================

function openAnimalDetailView(animalId) {
  currentDetailAnimalId = animalId;
  const animal = window.farmDB.getAnimalById(animalId);
  if (!animal) return;

  const currentPen = window.farmDB.getCurrentPenForAnimal(animal.id);
  const zone = currentPen && currentPen.zone_id ? window.farmDB.getZones().find(z => z.id === currentPen.zone_id) : null;

  // Header Elements
  document.getElementById('detailAnimalCode').textContent = animal.animal_code;
  document.getElementById('detailAnimalHeaderCode').textContent = animal.animal_code;
  document.getElementById('detailAnimalName').textContent = animal.name || 'Chưa đặt tên';

  const genderLabel = animal.sex === 'MALE' ? 'Đực' : (animal.sex === 'FEMALE' ? 'Cái' : 'Chưa rõ');
  const genderIconEl = document.getElementById('detailAnimalGenderIcon');
  if (genderIconEl) {
    genderIconEl.textContent = genderLabel;
    genderIconEl.className = animal.sex === 'MALE' ? 'pill pill-accent' : 'pill pill-neutral';
  }

  const penLocEl = document.getElementById('detailAnimalPenLocation');
  if (penLocEl) {
    penLocEl.textContent = currentPen ? `Chuồng: ${esc(currentPen.pen_code)} · ${esc(zone ? zone.name : 'Khu chung')}` : 'Chưa phân bổ chuồng';
  }

  const statusPill = document.getElementById('detailAnimalStatus');
  if (statusPill) {
    statusPill.className = `pill ${animal.status === 'ACTIVE' ? 'pill-positive' : 'pill-negative'}`;
    statusPill.textContent = animal.status === 'ACTIVE' ? 'Đang nuôi' : (animal.status === 'DECEASED' ? 'Tử vong' : animal.status);
  }

  // Action Buttons
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

  // Render current tab (defaults to 'info')
  switchAnimalDetailTab(currentDetailTabKey || 'info');

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

function switchAnimalDetailTab(tabKey) {
  currentDetailTabKey = tabKey;
  if (!currentDetailAnimalId) return;

  const animal = window.farmDB.getAnimalById(currentDetailAnimalId);
  if (!animal) return;

  // Update tab buttons
  document.querySelectorAll('#animalDetailTabNav .horizontal-tab-btn').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabKey) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const contentArea = document.getElementById('animalDetailTabContent');
  if (!contentArea) return;

  contentArea.innerHTML = '';

  if (tabKey === 'info') {
    // TAB 1: THÔNG TIN CƠ BẢN
    const currentPen = window.farmDB.getCurrentPenForAnimal(animal.id);
    const pedigree = window.farmDB.getPedigree(animal.id);
    const weights = window.farmDB.getWeights(animal.id);
    const latestWeight = weights.length > 0 ? weights[weights.length - 1] : null;

    contentArea.innerHTML = `
      <div class="item-card">
        <div class="item-card-title">Thông tin cơ bản</div>
        <div class="item-card-grid" style="margin-top:8px;">
          <div>Mã cá thể: <strong class="mono-code">${esc(animal.animal_code)}</strong></div>
          <div>Giới tính: <strong>${animal.sex === 'MALE' ? 'Đực' : (animal.sex === 'FEMALE' ? 'Cái' : 'Chưa rõ')}</strong></div>
          <div>Ngày sinh: <span class="mono-code">${esc(animal.date_of_birth || '-')}</span></div>
          <div>Nguồn gốc: <span>${animal.origin_type === 'BORN' ? 'Sinh tại trại' : 'Mua ngoài'}</span></div>
          <div>Chủng loài: <span>${esc(animal.species || 'Dúi Mốc Lớn')}</span></div>
          <div>Chuồng hiện tại: <strong class="mono-code">${esc(currentPen ? currentPen.pen_code : 'Chưa có')}</strong></div>
          <div>Bố: <strong class="mono-code">${pedigree.father ? esc(pedigree.father.animal_code) : 'Chưa rõ'}</strong></div>
          <div>Mẹ: <strong class="mono-code">${pedigree.mother ? esc(pedigree.mother.animal_code) : 'Chưa rõ'}</strong></div>
        </div>
        <div style="font-size:12px; color:var(--muted); margin-top:8px;">
          Ghi chú: ${esc(animal.notes || 'Không có ghi chú nào.')}
        </div>
      </div>

      <div class="item-card">
        <div class="item-card-title">Cân nặng gần nhất</div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
          <div>
            <div class="num" style="font-size:22px; font-weight:600; color:var(--accent);">
              ${latestWeight ? `${esc(latestWeight.weight_value)} ${esc(latestWeight.weight_unit)}` : 'Chưa có dữ liệu'}
            </div>
            <div style="font-size:11.5px; color:var(--faint);">
              ${latestWeight ? `Ngày cập nhật: ${esc(latestWeight.measured_at)}` : 'Hãy bấm nút ghi nhận bên dưới để thêm'}
            </div>
          </div>
          <button class="btn btn-outline btn-sm" onclick="openWeightModal('${esc(animal.id)}')">+ Cân mới</button>
        </div>
      </div>
    `;
  } else if (tabKey === 'pens') {
    // TAB 2: LỊCH SỬ CHUỒNG
    const history = window.farmDB.getPenAssignmentHistory(animal.id);
    if (history.length === 0) {
      contentArea.innerHTML = '<div class="item-card" style="color:var(--faint); text-align:center; padding:20px;">Chưa có lịch sử chuyển chuồng nào.</div>';
    } else {
      const container = document.createElement('div');
      container.className = 'item-card';
      container.innerHTML = `<div class="item-card-title" style="margin-bottom:8px;">Lịch sử phân bổ chuồng</div>`;
      history.forEach(pa => {
        const pen = window.farmDB.getPenById(pa.pen_id);
        const row = document.createElement('div');
        row.style.cssText = 'padding:8px 0; border-bottom:1px solid var(--rule); font-size:12.5px;';
        row.innerHTML = `
          <div style="display:flex; justify-content:space-between;">
            <strong class="mono-code">${pen ? `Chuồng ${esc(pen.pen_code)} - ${esc(pen.name)}` : 'Chuồng không xác định'}</strong>
            <span class="pill ${!pa.end_at ? 'pill-positive' : 'pill-neutral'}">${!pa.end_at ? 'Hiện tại' : 'Đã kết thúc'}</span>
          </div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">
            Từ: <span class="mono-code">${esc(pa.start_at)}</span> ${pa.end_at ? `đến <span class="mono-code">${esc(pa.end_at)}</span>` : ''}
          </div>
          <div style="font-size:11.5px; color:var(--faint);">Lý do: ${esc(pa.assignment_reason || 'Điều chuyển thường kỳ')}</div>
        `;
        container.appendChild(row);
      });
      contentArea.appendChild(container);
    }
  } else if (tabKey === 'weights') {
    // TAB 3: CÂN NẶNG
    const weights = window.farmDB.getWeights(animal.id);
    const container = document.createElement('div');
    container.className = 'item-card';
    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div class="item-card-title">Nhật ký cân nặng</div>
        <button class="btn btn-outline btn-sm" onclick="openWeightModal('${esc(animal.id)}')">+ Cân mới</button>
      </div>
    `;

    if (weights.length === 0) {
      container.innerHTML += '<div style="color:var(--faint); font-size:12px; padding:12px 0; text-align:center;">Chưa có lần cân nào.</div>';
    } else {
      weights.slice().reverse().forEach(w => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--rule); font-size:12.5px;';
        row.innerHTML = `
          <div>
            <div class="mono-code" style="color:var(--muted); font-size:12px;">${esc(w.measured_at)}</div>
            <div style="font-size:11.5px; color:var(--faint);">${esc(w.note || 'Cân định kỳ')} · Bởi: ${esc(w.recorded_by)}</div>
          </div>
          <strong class="num" style="font-size:15px; color:var(--accent);">${esc(w.weight_value)} ${esc(w.weight_unit)}</strong>
        `;
        container.appendChild(row);
      });
    }
    contentArea.appendChild(container);
  } else if (tabKey === 'breeding') {
    // TAB 4: SINH SẢN
    const litters = window.farmDB.getLittersForAnimal(animal.id);
    const container = document.createElement('div');
    container.className = 'item-card';
    container.innerHTML = `<div class="item-card-title" style="margin-bottom:8px;">Lịch sử sinh sản & Lứa đẻ</div>`;

    if (litters.length === 0) {
      container.innerHTML += '<div style="color:var(--faint); font-size:12px; padding:12px 0; text-align:center;">Chưa có lứa đẻ nào được ghi nhận cho cá thể này.</div>';
    } else {
      litters.forEach(lit => {
        const row = document.createElement('div');
        row.style.cssText = 'padding:8px 0; border-bottom:1px solid var(--rule); font-size:12.5px;';
        row.innerHTML = `
          <div style="display:flex; justify-content:space-between;">
            <strong class="mono-code" style="color:var(--accent);">${esc(lit.litter_code)}</strong>
            <span class="mono-code">${esc(lit.birth_at)}</span>
          </div>
          <div style="margin-top:2px;">Tổng: <strong class="num">${esc(lit.total_born)} con</strong> (Sống: <span style="color:var(--positive);">${esc(lit.alive_count)}</span>, Chết: <span style="color:var(--negative);">${esc(lit.deceased_count)}</span>)</div>
          ${lit.notes ? `<div style="font-size:11.5px; color:var(--muted);">${esc(lit.notes)}</div>` : ''}
        `;
        container.appendChild(row);
      });
    }
    contentArea.appendChild(container);
  } else if (tabKey === 'pedigree') {
    // TAB 5: PHẢ HỆ
    const pedigree = window.farmDB.getPedigree(animal.id);
    const allAnimals = window.farmDB.getAnimals();
    const children = allAnimals.filter(a => a.father_id === animal.id || a.mother_id === animal.id);

    contentArea.innerHTML = `
      <div class="item-card">
        <div class="item-card-title" style="margin-bottom:8px;">Bố & Mẹ</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <div style="background:var(--raised); padding:8px 10px; border-radius:6px;">
            <div style="font-size:11px; color:var(--muted);">Bố (Sire)</div>
            ${pedigree.father ? `
              <div onclick="openAnimalDetailView('${esc(pedigree.father.id)}')" style="cursor:pointer; font-weight:600; color:var(--accent); margin-top:2px;">
                ${esc(pedigree.father.animal_code)} (Đực)
              </div>
            ` : '<div style="color:var(--faint); font-style:italic;">Chưa xác định</div>'}
          </div>
          <div style="background:var(--raised); padding:8px 10px; border-radius:6px;">
            <div style="font-size:11px; color:var(--muted);">Mẹ (Dam)</div>
            ${pedigree.mother ? `
              <div onclick="openAnimalDetailView('${esc(pedigree.mother.id)}')" style="cursor:pointer; font-weight:600; color:var(--accent); margin-top:2px;">
                ${esc(pedigree.mother.animal_code)} (Cái)
              </div>
            ` : '<div style="color:var(--faint); font-style:italic;">Chưa xác định</div>'}
          </div>
        </div>
      </div>

      <div class="item-card">
        <div class="item-card-title" style="margin-bottom:8px;">Cá thể con (${children.length})</div>
        ${children.length === 0 ? '<div style="color:var(--faint); font-size:12px; font-style:italic;">Chưa có con cháu trực tiếp trong hệ thống.</div>' : `
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${children.map(c => `
              <span class="pill pill-accent" style="cursor:pointer; font-family:var(--mono);" onclick="openAnimalDetailView('${esc(c.id)}')">
                ${esc(c.animal_code)} (${c.sex === 'MALE' ? 'Đực' : 'Cái'})
              </span>
            `).join('')}
          </div>
        `}
      </div>
    `;
  } else if (tabKey === 'health') {
    // TAB 6: SỨC KHỎE
    const records = window.farmDB.getHealthRecordsForAnimal(animal.id);
    const container = document.createElement('div');
    container.className = 'item-card';
    container.innerHTML = `<div class="item-card-title" style="margin-bottom:8px;">Hồ sơ bệnh án & Sức khỏe</div>`;

    if (records.length === 0) {
      container.innerHTML += '<div style="color:var(--faint); font-size:12px; padding:12px 0; text-align:center;">Cá thể hoàn toàn khỏe mạnh, không có bệnh án.</div>';
    } else {
      records.forEach(hr => {
        const row = document.createElement('div');
        row.style.cssText = 'padding:8px 0; border-bottom:1px solid var(--rule); font-size:12.5px;';
        row.innerHTML = `
          <div style="display:flex; justify-content:space-between;">
            <span class="pill ${hr.severity === 'SEVERE' ? 'pill-negative' : 'pill-warning'}">${esc(hr.severity)}</span>
            <span class="mono-code">${new Date(hr.detected_at).toLocaleDateString('vi-VN')}</span>
          </div>
          <div style="font-weight:500; margin:4px 0;">${esc(hr.diagnosis_text)}</div>
          <div style="font-size:11.5px; color:var(--faint);">Ghi nhận: ${esc(hr.recorded_by)}</div>
        `;
        container.appendChild(row);
      });
    }
    contentArea.appendChild(container);
  } else if (tabKey === 'events') {
    // TAB 7: NHẬT KÝ SỰ KIỆN
    const events = window.farmDB.getEventsForAnimal(animal.id);
    const container = document.createElement('div');
    container.className = 'item-card';
    container.innerHTML = `<div class="item-card-title" style="margin-bottom:8px;">Dòng thời gian sự kiện</div>`;

    if (events.length === 0) {
      container.innerHTML += '<div style="color:var(--faint); font-size:12px; padding:12px 0; text-align:center;">Chưa có sự kiện nào được ghi nhận.</div>';
    } else {
      events.forEach(ev => {
        const row = document.createElement('div');
        row.style.cssText = 'padding:8px 0; border-bottom:1px solid var(--rule); font-size:12.5px;';
        row.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="pill ${ev.badgeClass}">${esc(ev.type)}</span>
            <span class="mono-code" style="color:var(--faint); font-size:11.5px;">${new Date(ev.time).toLocaleDateString('vi-VN')}</span>
          </div>
          <div style="margin-top:4px; color:var(--text);">${esc(ev.details)}</div>
        `;
        container.appendChild(row);
      });
    }
    contentArea.appendChild(container);
  }
}
window.switchAnimalDetailTab = switchAnimalDetailTab;

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
          <div class="mono-code" style="font-size:16px; font-weight:600; color:var(--text);">Chuồng ${esc(pen.pen_code)}</div>
          <div style="font-size:12px; color:var(--muted);">${esc(pen.name)}</div>
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
            ? animalsInPen.map(a => `<span onclick="openAnimalDetailView('${esc(a.id)}')" class="pill pill-accent" style="cursor:pointer; font-family:var(--mono);">${esc(a.animal_code)} (${a.sex === 'MALE' ? 'Đực' : (a.sex === 'FEMALE' ? 'Cái' : '?')})</span>`).join('')
            : '<span style="color:var(--faint); font-style:italic;">Chuồng hiện đang trống</span>'}
        </div>
      </div>

      <div style="font-size:11.5px; color:var(--faint); margin-bottom:10px;">
        Ghi chú: ${esc(pen.notes || 'Không có ghi chú')}
      </div>

      <div>
        <button class="btn btn-outline btn-sm" style="width:100%;" onclick="openTransferModalForPen('${esc(pen.id)}')">Chuyển dúi vào chuồng này</button>
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
          <span class="mono-code" style="font-size:15px; font-weight:600; color:var(--accent);">${esc(lit.litter_code)}</span>
          <span class="mono-code" style="font-size:12px; color:var(--faint);">${esc(lit.birth_at)}</span>
        </div>

        <div class="item-card-grid">
          <div>Mẹ: <strong class="mono-code">${esc(mother ? mother.animal_code : 'N/A')}</strong></div>
          <div>Bố: <strong class="mono-code">${esc(father ? father.animal_code : 'Chưa rõ')}</strong></div>
          <div>Tổng số con: <strong class="num">${esc(lit.total_born)} con</strong></div>
          <div>Sống / Chết: <span class="num" style="color:var(--positive); font-weight:600;">${esc(lit.alive_count)}</span> / <span class="num" style="color:var(--negative); font-weight:600;">${esc(lit.deceased_count)}</span></div>
        </div>

        ${lit.notes ? `<div style="font-size:12px; color:var(--muted); margin:4px 0 8px 0;">Ghi chú: ${esc(lit.notes)}</div>` : ''}

        <div style="margin-top:8px;">
          <button class="btn btn-outline btn-sm" style="width:100%;" onclick="openRegisterLitterMemberModal('${esc(lit.id)}')">+ Cấp mã định danh cho con</button>
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

    maleSelect.innerHTML = males.map(m => `<option value="${esc(m.id)}">${esc(m.animal_code)} - ${esc(m.name || 'Đực giống')}</option>`).join('');
    femaleSelect.innerHTML = females.map(f => `<option value="${esc(f.id)}">${esc(f.animal_code)} - ${esc(f.name || 'Nái đẻ')}</option>`).join('');
  }
}

function checkInbreeding() {
  const maleId = document.getElementById('inbreedMaleSelect').value;
  const femaleId = document.getElementById('inbreedFemaleSelect').value;
  const resultDiv = document.getElementById('inbreedingResult');

  if (!maleId || !femaleId) {
    appNotice('Vui lòng chọn cả đực và nái cần kiểm tra.');
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
  } else if (check.risk === 'HIGH' || check.risk === 'MEDIUM') {
    pillClass = 'pill-warning';
    bg = 'var(--pill-warning-bg)';
    border = '#fde68a';
  }

  resultDiv.innerHTML = `
    <div style="padding:10px 12px; border-radius:6px; background:${bg}; border:1px solid ${border}; margin-top:8px;">
      <div style="font-size:13px; font-weight:600; color:var(--text); margin-bottom:3px;">
        Đánh giá nguy cơ: <span class="pill ${pillClass}">${esc(check.risk)}</span>
      </div>
      <div style="font-size:12px; color:var(--text); line-height:1.4;">${esc(check.reason)}</div>
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
              <span class="mono-code" style="color:var(--faint);">${new Date(f.time).toLocaleDateString('vi-VN')}:</span> ${esc(f.note)}
            </div>
          `).join('')}
        </div>
      `;
    }

    card.innerHTML = `
      <div class="item-card-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="pill ${isDeath ? 'pill-negative' : 'pill-warning'}">${isDeath ? 'Tử vong' : 'Bỏ ăn'}</span>
          <span class="mono-code" style="font-size:15px; font-weight:600; color:var(--accent);">${esc(animal ? animal.animal_code : 'N/A')}</span>
          ${pen ? `<span style="font-size:12px; color:var(--muted);">${esc(pen.pen_code)}</span>` : ''}
        </div>
        <span class="pill ${inc.status === 'OPEN' ? 'pill-accent' : 'pill-neutral'}">${inc.status === 'OPEN' ? 'Đang mở' : 'Đã đóng'}</span>
      </div>

      <div style="font-size:12.5px; color:var(--text); margin:4px 0;">
        <strong>Triệu chứng:</strong> ${esc(inc.symptoms_observed)}
      </div>

      ${inc.actions_taken ? `
        <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">
          <strong>Xử lý ban đầu:</strong> ${esc(inc.actions_taken)}
        </div>
      ` : ''}

      ${followUpsHtml}

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; font-size:11.5px; color:var(--faint);">
        <span>Phát hiện: <span class="mono-code">${new Date(inc.detected_at).toLocaleString('vi-VN')}</span></span>
      </div>

      ${!isDeath && inc.status === 'OPEN' ? `
        <div style="display:flex; gap:6px; margin-top:10px;">
          <button class="btn btn-outline btn-sm" style="flex:1;" onclick="openAddFollowUpModal('${esc(inc.id)}')">Cập nhật theo dõi</button>
          <button class="btn btn-primary btn-sm" style="flex:1;" onclick="openCloseIncidentModal('${esc(inc.id)}')">Đóng ca</button>
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
          <div style="font-size:14px; font-weight:600; color:var(--text);">${esc(m.trade_name)}</div>
          <span class="pill pill-neutral">${esc(m.medicine_group)}</span>
        </div>
        <div style="font-size:12.5px; margin:4px 0; color:var(--text);"><strong>Hoạt chất:</strong> ${esc(m.active_ingredient)}</div>
        <div style="font-size:12px; color:var(--muted); margin-bottom:8px;">${esc(m.reference_description)}</div>
        <div style="font-size:11.5px; background:var(--pill-warning-bg); color:var(--pill-warning-ink); padding:6px 8px; border-radius:4px; margin-bottom:4px; border:1px solid #fde68a;">
          <strong>Lưu ý:</strong> ${esc(m.warnings)}
        </div>
        <div style="font-size:11px; color:var(--faint);">Nguồn: ${esc(m.source_reference)}</div>
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
            <span class="mono-code" style="font-weight:600; color:var(--accent);">${esc(animal ? animal.animal_code : 'N/A')}</span>
            <span class="pill ${hr.severity === 'SEVERE' ? 'pill-negative' : 'pill-warning'}">${esc(hr.severity)}</span>
          </div>
          <div style="font-size:12.5px; color:var(--text); margin:4px 0;"><strong>Chẩn đoán:</strong> ${esc(hr.diagnosis_text)}</div>
          <div style="font-size:11.5px; color:var(--muted);">Người ghi nhận: ${esc(hr.recorded_by)} · Ngày: <span class="mono-code">${new Date(hr.detected_at).toLocaleDateString('vi-VN')}</span></div>
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
        Không tìm thấy dữ liệu nào phù hợp với "${esc(query)}".
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
          <span style="font-size:10.5px; font-weight:600; color:var(--faint); text-transform:uppercase;">${esc(res.category)}</span>
          <div style="font-size:14px; font-weight:600; color:var(--text); margin-top:2px;">${esc(res.title)}</div>
        </div>
        <span class="pill pill-${res.badgeType}">${esc(res.badge)}</span>
      </div>
      <div style="font-size:12px; color:var(--muted); margin:4px 0 8px 0;">${esc(res.snippet)}</div>
      <div>
        ${res.actionType === 'VIEW_ANIMAL' ? `<button class="btn btn-outline btn-sm" onclick="openAnimalDetailView('${esc(res.id)}')">Xem hồ sơ cá thể</button>` : ''}
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

    let formattedText = esc(response.reply)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');

    let sourceHtml = '';
    if (response.sources && response.sources.length > 0) {
      sourceHtml = `<div class="chat-source" style="font-size:11px; color:var(--faint); margin-top:6px; border-top:1px dashed var(--border); padding-top:4px;">Nguồn trích dẫn: ${response.sources.map(esc).join(', ')}</div>`;
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
        <strong>${esc(l.actor)}</strong>
        <span class="mono-code" style="color:var(--faint);">${new Date(l.time).toLocaleString('vi-VN')}</span>
      </div>
      <div style="color:var(--text);">${esc(l.details)}</div>
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
    appNotice('Tài khoản Viewer chỉ có quyền xem dữ liệu, không thể tạo cá thể mới.');
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
      pens.map(p => `<option value="${esc(p.id)}">Chuồng ${esc(p.pen_code)} - ${esc(p.name)}</option>`).join('');
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
    appNotice('Vui lòng nhập mã định danh cho cá thể');
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
    appNotice(err.message);
  }
}
window.submitAddAnimal = submitAddAnimal;

// Modal: Ghi nhận cân nặng
function openWeightModal(animalId) {
  if (!window.farmDB.canCreateRecords()) {
    appNotice('Tài khoản Viewer chỉ có quyền xem dữ liệu.');
    return;
  }

  const animal = window.farmDB.getAnimalById(animalId);
  if (!animal) return;

  document.getElementById('weightAnimalId').value = animal.id;
  document.getElementById('weightAnimalLabel').textContent = `${esc(animal.animal_code)} - ${esc(animal.name || '')}`;
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
    appNotice('Vui lòng nhập trọng lượng hợp lệ (> 0)');
    return;
  }

  window.farmDB.addWeight(animalId, val, 'kg', note, window.farmDB.getCurrentUser().name);
  closeModal('modalAddWeight');

  if (document.getElementById('animalDetailView').classList.contains('open')) {
    openAnimalDetailView(animalId);
  }
  renderAnimals();
  renderDashboard();
}
window.submitAddWeight = submitAddWeight;

// Modal: Điều chuyển chuồng
function openTransferModal(animalId) {
  if (!window.farmDB.canCreateRecords()) {
    appNotice('Tài khoản Viewer chỉ có quyền xem dữ liệu.');
    return;
  }

  const animal = window.farmDB.getAnimalById(animalId);
  if (!animal) return;

  document.getElementById('transferAnimalId').value = animal.id;
  document.getElementById('transferAnimalSelectGroup').style.display = 'none';
  document.getElementById('transferAnimalInfoGroup').style.display = 'block';
  document.getElementById('transferAnimalLabel').textContent = `${esc(animal.animal_code)} - ${esc(animal.name || '')}`;

  const currentPen = window.farmDB.getCurrentPenForAnimal(animal.id);
  document.getElementById('transferCurrentPen').textContent = currentPen ? `Chuồng ${esc(currentPen.pen_code)} (${esc(currentPen.name)})` : 'Chưa phân chuồng';

  const select = document.getElementById('transferPenSelect');
  const pens = window.farmDB.getPens();
  select.innerHTML = pens.map(p => `<option value="${esc(p.id)}" ${currentPen && currentPen.id === p.id ? 'selected' : ''}>Chuồng ${esc(p.pen_code)} - ${esc(p.name)} (${esc(p.status)})</option>`).join('');

  const modal = document.getElementById('modalTransferAnimal');
  if (modal) modal.classList.add('active');
}
window.openTransferModal = openTransferModal;

function openTransferModalForPen(targetPenId) {
  if (!window.farmDB.canCreateRecords()) {
    appNotice('Tài khoản Viewer chỉ có quyền xem dữ liệu.');
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
    return `<option value="${esc(a.id)}">${esc(a.animal_code)} - ${esc(a.name || 'Dúi')} (Hiện tại: ${esc(curPen ? curPen.pen_code : 'Chưa có chuồng')})</option>`;
  }).join('');

  const penSelect = document.getElementById('transferPenSelect');
  const pens = window.farmDB.getPens();
  penSelect.innerHTML = pens.map(p => `<option value="${esc(p.id)}" ${p.id === targetPenId ? 'selected' : ''}>Chuồng ${esc(p.pen_code)} - ${esc(p.name)}</option>`).join('');

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
    appNotice('Vui lòng chọn đầy đủ cá thể và chuồng cần chuyển.');
    return;
  }

  try {
    window.farmDB.transferAnimal(animalId, newPenId, reason, window.farmDB.getCurrentUser().name, { enforceCapacity: true });
  } catch (err) {
    if (window.showToast) showToast(err.message, 'error', 5000); else appNotice(err.message);
    return;
  }
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
    appNotice('Tài khoản Viewer chỉ có quyền xem dữ liệu.');
    return;
  }

  document.getElementById('incidentTypeInput').value = type;
  document.getElementById('incidentModalTitle').textContent = type === 'DEATH' ? 'Ghi nhận dúi chết (DEATH)' : 'Báo dúi bỏ ăn (OFF_FEED)';

  const animalSelect = document.getElementById('incidentAnimalSelect');
  const activeAnimals = window.farmDB.getAnimals().filter(a => a.status === 'ACTIVE');
  animalSelect.innerHTML = activeAnimals.map(a => `<option value="${esc(a.id)}">${esc(a.animal_code)} - ${esc(a.name || 'Dúi')}</option>`).join('');

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
    appNotice('Vui lòng chọn cá thể và nhập triệu chứng quan sát được.');
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
    appNotice(err.message);
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
    appNotice('Vui lòng nhập nội dung theo dõi');
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
    appNotice('Vui lòng nhập kết quả xử lý và tình trạng hồi phục.');
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
    appNotice('Tài khoản Viewer chỉ có quyền xem dữ liệu.');
    return;
  }

  document.getElementById('litterCodeInput').value = 'LIT-' + new Date().getFullYear() + '-0' + (window.farmDB.getLitters().length + 1);

  const motherSelect = document.getElementById('litterMotherSelect');
  const fatherSelect = document.getElementById('litterFatherSelect');

  const females = window.farmDB.getAnimals().filter(a => a.sex === 'FEMALE');
  const males = window.farmDB.getAnimals().filter(a => a.sex === 'MALE');

  motherSelect.innerHTML = females.map(f => `<option value="${esc(f.id)}">${esc(f.animal_code)} - ${esc(f.name || 'Nái đẻ')}</option>`).join('');
  fatherSelect.innerHTML = '<option value="">Chưa rõ</option>' +
    males.map(m => `<option value="${esc(m.id)}">${esc(m.animal_code)} - ${esc(m.name || 'Đực giống')}</option>`).join('');

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
    appNotice('Vui lòng nhập mã lứa và chọn nái mẹ.');
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
  renderDashboard();
}
window.submitCreateLitter = submitCreateLitter;

// Modal: Cấp mã cá thể con
function openRegisterLitterMemberModal(litterId) {
  if (!window.farmDB.canCreateRecords()) {
    appNotice('Tài khoản Viewer chỉ có quyền xem dữ liệu.');
    return;
  }

  document.getElementById('registerMemberLitterId').value = litterId;
  document.getElementById('registerMemberCodeInput').value = 'D00' + (window.farmDB.getAnimals().length + 1);
  document.getElementById('registerMemberNameInput').value = '';

  const penSelect = document.getElementById('registerMemberPenSelect');
  penSelect.innerHTML = '<option value="">Chưa phân bổ</option>' +
    window.farmDB.getPens().map(p => `<option value="${esc(p.id)}">Chuồng ${esc(p.pen_code)} - ${esc(p.name)}</option>`).join('');

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
    appNotice('Vui lòng nhập mã định danh cho dúi con');
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
    appNotice(err.message);
  }
}
window.submitRegisterLitterMember = submitRegisterLitterMember;
