/**
 * Giao diện điều khiển Sơ đồ trang trại (js/map-ui.js)
 * Nối FarmMapEditor (js/map.js) với dữ liệu thật (FarmDB) và các form trên điện thoại:
 *  - Bật/tắt chế độ sửa, lưu bản nháp, hoàn tác, thoát có xác nhận.
 *  - Khay xây dựng (kéo ô xuống sơ đồ), thanh thao tác cho khối đang chọn.
 *  - Form chuồng (mã không trùng, sức chứa, trạng thái), khu vực, lối đi.
 *  - Thêm dúi vào chuồng: dúi có sẵn hoặc tạo dúi mới, chuyển ra khỏi chuồng.
 *  - Phiên bản sơ đồ, xuất/nhập JSON.
 * Quyền hạn luôn được kiểm tra lại trong FarmDB, không chỉ ẩn nút.
 */
const MapUI = (() => {
  const $ = (id) => document.getElementById(id);
  const db = () => window.farmDB;
  const ed = () => window.mapEditorInstance;

  const ZONE_COLORS = [
    { color: '#f4f7f8', border: '#cbd2d6', name: 'Xám' },
    { color: '#f0fdf4', border: '#4ade80', name: 'Xanh lá' },
    { color: '#eff6ff', border: '#60a5fa', name: 'Xanh dương' },
    { color: '#fffbeb', border: '#f59e0b', name: 'Vàng' },
    { color: '#fff1f2', border: '#fb7185', name: 'Hồng' }
  ];

  const PEN_STATUS_CHOICES = [
    { key: 'ACTIVE', label: 'Đang nuôi' },
    { key: 'BREEDING', label: 'Sinh sản' },
    { key: 'QUARANTINE', label: 'Cách ly' },
    { key: 'DISABLED', label: 'Ngừng dùng' }
  ];

  const ICONS = {
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    animals: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    rotate: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sexLabel = (s) => (s === 'MALE' ? 'Đực' : (s === 'FEMALE' ? 'Cái' : 'Chưa rõ'));
  const userName = () => db().getCurrentUser().name;

  // ---------- Thông báo & xác nhận ----------
  function toast(message, type = 'info', ms = 3400) {
    const host = $('toastHost');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }
  window.showToast = toast;
  // Thay cho alert(): thông báo gọn, không chặn thao tác
  window.appNotice = (msg) => toast(msg, /thành công|^Đã /.test(String(msg)) ? 'success' : 'error', 5000);

  function choose({ title, message, buttons }) {
    return new Promise((resolve) => {
      const modal = $('modalConfirm');
      $('confirmTitle').textContent = title;
      $('confirmMessage').textContent = message;
      const host = $('confirmButtons');
      host.innerHTML = '';
      host.style.flexWrap = 'wrap';
      const finish = (key) => {
        modal.classList.remove('active');
        modal.onclick = null;
        resolve(key);
      };
      buttons.forEach((b) => {
        const btn = document.createElement('button');
        btn.className = 'btn ' + (b.primary ? 'btn-primary' : (b.danger ? 'btn-danger' : 'btn-outline'));
        btn.textContent = b.label;
        btn.onclick = () => finish(b.key);
        host.appendChild(btn);
      });
      modal.onclick = (e) => { if (e.target === modal) finish('cancel'); };
      modal.classList.add('active');
    });
  }

  async function confirmBox(title, message, okLabel = 'Đồng ý', danger = false) {
    const key = await choose({
      title, message,
      buttons: [{ key: 'cancel', label: 'Hủy' }, { key: 'ok', label: okLabel, primary: !danger, danger }]
    });
    return key === 'ok';
  }

  // ---------- Khởi tạo & đồng bộ giao diện ----------
  function ensure() {
    if (!ed() || !ed().canvas) {
      const inst = new FarmMapEditor('farmCanvas', db());
      inst.onChange = syncUI;
      window.mapEditorInstance = inst;
      if (typeof window.setMapEditorInstance === 'function') window.setMapEditorInstance(inst);
    }
    return ed();
  }

  function onTabShown() {
    const e = ensure();
    if (!e.isEditMode) e.mapData = e.cloneMap(db().getFarmMap());
    e.resizeCanvas();
    e.fitToScreen();
    renderZoneChips();
    updateSummary();
    syncUI(e.getState());
  }

  function updateSummary() {
    const el = $('mapSummary');
    if (!el) return;
    const pens = db().getPens().length;
    const animals = db().getAnimals().filter((a) => a.status === 'ACTIVE').length;
    el.textContent = `${pens} chuồng · ${animals} dúi đang nuôi`;
  }

  function renderZoneChips() {
    const host = $('mapZoneFilterChips');
    if (!host) return;
    const active = (ed() && ed().activeZoneFilter) || 'ALL';
    const zones = db().getZones();
    host.innerHTML = [{ id: 'ALL', name: 'Tất cả khu' }, ...zones]
      .map((z) => `<button class="chip-btn ${z.id === active ? 'active' : ''}" data-zone="${esc(z.id)}" onclick="MapUI.setZone('${esc(z.id)}')">${esc(z.name)}</button>`)
      .join('');
  }

  function setZone(id) {
    ensure().setZoneFilter(id);
    renderZoneChips();
  }

  function unplacedPens() {
    const e = ed();
    const placed = new Set(((e && e.mapData.blocks) || []).filter((b) => b.block_type === 'PEN').map((b) => b.pen_id));
    return db().getPens().filter((p) => !placed.has(p.id));
  }

  function syncUI(state) {
    const e = ed();
    if (!e) return;
    state = state || e.getState();
    const screen = $('mapScreen');
    if (screen) screen.classList.toggle('editing', state.isEditMode);

    const text = $('mapModeText'), dot = $('mapModeIndicatorDot');
    if (text) text.textContent = state.isEditMode ? 'Đang sửa sơ đồ' : 'Chế độ xem';
    if (dot) dot.style.background = state.isEditMode ? 'var(--negative)' : 'var(--positive)';

    if (!state.isEditMode) return;

    $('mapUndoBtn').disabled = !state.canUndo;
    $('mapRedoBtn').disabled = !state.canRedo;
    const status = $('mapEditStatus');
    status.className = 'map-edit-status';
    if (state.hasOverlap) { status.textContent = 'Có chuồng chồng nhau (viền đỏ)'; status.classList.add('error'); }
    else if (state.dirty) { status.textContent = 'Có thay đổi chưa lưu'; status.classList.add('dirty'); }
    else { status.textContent = 'Chưa có thay đổi'; }
    $('mapSaveBtn').disabled = !state.dirty;

    renderSelectionBar(state.selected);

    const n = unplacedPens().length;
    const label = $('mapUnplacedLabel');
    if (label) label.textContent = n > 0 ? `Chuồng chưa đặt (${n})` : 'Chuồng chưa đặt';
  }

  function renderSelectionBar(b) {
    const title = $('mapSelectionTitle'), actions = $('mapSelectionActions');
    if (!b) {
      title.innerHTML = 'Chạm một khối để chọn. Kéo thân khối để di chuyển, kéo chấm ở góc để đổi cỡ.';
      actions.innerHTML = '';
      return;
    }
    const btn = (fn, ic, label, cls = '', disabled = false) =>
      `<button class="sel-btn ${cls}" ${disabled ? 'disabled style="opacity:.4"' : ''} onclick="MapUI.${fn}()">${icon(ic)}<span>${label}</span></button>`;
    const locked = !!b.locked;
    let html = '';
    if (b.block_type === 'PEN') {
      const pen = db().getPenById(b.pen_id);
      const n = pen ? db().getAnimalsInPen(pen.id).length : 0;
      title.innerHTML = `Chuồng ${esc(pen ? pen.pen_code : b.pen_code)} <small>· ${n}/${pen ? pen.capacity : '?'} con${locked ? ' · đã khóa' : ''}</small>`;
      html += btn('editSelected', 'edit', 'Sửa chuồng', 'primary');
      html += btn('animalsSelected', 'animals', 'Dúi');
      html += btn('rotate', 'rotate', 'Xoay', '', locked);
    } else if (b.block_type === 'ZONE') {
      title.innerHTML = `Khu: ${esc(b.zone_name || '')}${locked ? ' <small>· đã khóa</small>' : ''}`;
      html += btn('editSelected', 'edit', 'Đổi tên', 'primary');
      html += btn('duplicate', 'copy', 'Nhân bản');
    } else {
      title.innerHTML = `Lối đi: ${esc(b.label || '')}${locked ? ' <small>· đã khóa</small>' : ''}`;
      html += btn('editSelected', 'edit', 'Đổi tên', 'primary');
      html += btn('rotate', 'rotate', 'Xoay', '', locked);
      html += btn('duplicate', 'copy', 'Nhân bản');
    }
    html += btn('toggleLock', locked ? 'unlock' : 'lock', locked ? 'Mở khóa' : 'Khóa');
    html += btn('removeSelected', 'trash', 'Gỡ', 'danger');
    actions.innerHTML = html;
  }

  // ---------- Chế độ sửa ----------
  function toggle() {
    if (!db().canEditMap()) {
      toast('Chỉ Admin và Manager mới được sửa sơ đồ. Bạn đang ở chế độ xem an toàn.', 'error');
      return;
    }
    const e = ensure();
    if (e.isEditMode) { exitEdit(); return; }
    if (typeof closeMapSheet === 'function') closeMapSheet();
    e.setEditMode(true);
    syncUI(e.getState());
    toast('Đã bật chế độ sửa. Thay đổi chỉ áp dụng khi bạn bấm "Lưu sơ đồ".');
  }

  async function exitEdit() {
    const e = ed();
    if (!e || !e.isEditMode) return;
    if (e.dirty) {
      const key = await choose({
        title: 'Thoát chế độ sửa?',
        message: 'Bạn có thay đổi sơ đồ chưa lưu.',
        buttons: [
          { key: 'save', label: 'Lưu và thoát', primary: true },
          { key: 'discard', label: 'Bỏ thay đổi', danger: true },
          { key: 'stay', label: 'Ở lại sửa tiếp' }
        ]
      });
      if (key === 'stay' || key === 'cancel') return;
      if (key === 'save' && !save()) return;
    }
    e.setEditMode(false);
    renderZoneChips();
    syncUI(e.getState());
  }

  function onRoleChanged() {
    const e = ed();
    if (e && e.isEditMode && !db().canEditMap()) {
      e.setEditMode(false);
      toast('Vai trò hiện tại không được sửa sơ đồ. Đã chuyển về chế độ xem.', 'error');
    }
    if (e) syncUI(e.getState());
  }

  function undo() { ed() && ed().undo(); }
  function redo() { ed() && ed().redo(); }

  // Đặt tên khu mới chưa lưu thành mã khu duy nhất
  function nextZoneCode() {
    const used = new Set(db().getZones().map((z) => z.zone_code.toUpperCase()));
    ed().mapData.blocks.forEach((b) => { if (b.pending_zone) used.add(b.pending_zone.zone_code); });
    for (let i = 0; i < 26; i++) {
      const code = 'KHU_' + String.fromCharCode(65 + i);
      if (!used.has(code)) return code;
    }
    return 'KHU_' + Date.now();
  }

  function save() {
    const e = ed();
    if (!e || !e.dirty) return true;
    if (e.hasPenOverlap()) {
      toast('Có chuồng đang chồng lên nhau (viền đỏ). Hãy kéo chúng ra trước khi lưu.', 'error');
      return false;
    }
    try {
      db().validateFarmMap(e.mapData);
      e.mapData.blocks.filter((b) => b.block_type === 'ZONE').forEach((b) => {
        if (!b.zone_id) {
          const code = (b.pending_zone && b.pending_zone.zone_code) || nextZoneCode();
          const z = db().saveZone({ name: b.zone_name || 'Khu mới', zone_code: code });
          b.zone_id = z.id;
          delete b.pending_zone;
        } else if (b.name_edited) {
          const z = db().getZones().find((zz) => zz.id === b.zone_id);
          if (z) db().saveZone({ ...z, name: b.zone_name });
        }
        delete b.name_edited;
      });
      const result = e.commit();
      renderZoneChips();
      updateSummary();
      const extra = result.zoneChanges > 0 ? ` ${result.zoneChanges} chuồng đã được xếp lại theo khu mới.` : '';
      toast(`Đã lưu sơ đồ (phiên bản ${result.map.revision_number}).${extra}`, 'success');
      refreshApp();
      return true;
    } catch (err) {
      toast(err.message, 'error', 5000);
      return false;
    }
  }

  // ---------- Thao tác với khối đang chọn ----------
  function editSelected() {
    const b = ed().selectedBlock;
    if (!b) return;
    if (b.block_type === 'PEN') openPenForm({ penId: b.pen_id });
    else openBlockForm({ block: b, kind: b.block_type });
  }

  function animalsSelected() {
    const b = ed().selectedBlock;
    if (b && b.block_type === 'PEN') openPenAnimals(b.pen_id);
  }

  function rotate() { ed().rotateSelected(); }
  function toggleLock() { ed().toggleLockSelected(); }
  function duplicate() { ed().duplicateSelected(); }

  async function removeSelected() {
    const e = ed();
    const b = e && e.selectedBlock;
    if (!b || !e.isEditMode) return;
    let msg;
    if (b.block_type === 'PEN') {
      const pen = db().getPenById(b.pen_id);
      const n = pen ? db().getAnimalsInPen(pen.id).length : 0;
      msg = `Gỡ ô chuồng ${pen ? pen.pen_code : ''} khỏi sơ đồ? Chuồng${n ? ' và ' + n + ' con dúi bên trong' : ''} vẫn được giữ nguyên, chỉ bỏ ô vẽ. Bạn có thể đặt lại từ mục "Chuồng chưa đặt".`;
    } else if (b.block_type === 'ZONE') {
      msg = 'Gỡ khối khu vực này khỏi sơ đồ? Các chuồng vẫn giữ nguyên.';
    } else {
      msg = 'Gỡ lối đi này khỏi sơ đồ?';
    }
    if (await confirmBox('Gỡ khỏi sơ đồ', msg, 'Gỡ', true)) e.deleteSelectedBlock();
  }

  // ---------- Khay xây dựng ----------
  function placeKind(kind, pos) {
    const e = ed();
    if (!e || !e.isEditMode) return;
    if (kind === 'PEN') openPenForm({ pos });
    else if (kind === 'ZONE') openBlockForm({ kind: 'ZONE', pos });
    else {
      e.addBlockAt('PATH', { label: 'Lối đi' }, pos);
      toast('Đã thêm lối đi. Kéo để di chuyển, kéo chấm ở góc để đổi cỡ.');
    }
  }

  function bindDock() {
    document.querySelectorAll('.dock-tile[data-kind]').forEach((tile) => {
      const kind = tile.dataset.kind;
      tile.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); placeKind(kind, null); } });
      tile.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const sx = e.clientX, sy = e.clientY;
        let ghost = null, moved = false;
        try { tile.setPointerCapture(e.pointerId); } catch (_) {}
        const move = (ev) => {
          if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) {
            moved = true;
            ghost = document.createElement('div');
            ghost.className = 'drag-ghost';
            ghost.textContent = kind === 'PEN' ? 'Chuồng' : (kind === 'ZONE' ? 'Khu' : 'Lối đi');
            document.body.appendChild(ghost);
          }
          if (ghost) { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; }
        };
        const end = (ev) => {
          tile.removeEventListener('pointermove', move);
          tile.removeEventListener('pointerup', end);
          tile.removeEventListener('pointercancel', cancel);
          if (ghost) ghost.remove();
          if (ev.type === 'pointercancel') return;
          if (!moved) { placeKind(kind, null); return; }
          const r = ed().canvas.getBoundingClientRect();
          if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
            placeKind(kind, ed().getCanvasCoords(ev.clientX, ev.clientY));
          } else {
            toast('Thả ô xuống vùng sơ đồ để đặt.');
          }
        };
        const cancel = (ev) => end(ev);
        tile.addEventListener('pointermove', move);
        tile.addEventListener('pointerup', end);
        tile.addEventListener('pointercancel', cancel);
      });
    });
  }

  // ---------- Form chuồng ----------
  let penForm = null;

  function renderPenStatusButtons() {
    const host = $('penFormStatus');
    const occupants = penForm.penId ? db().getAnimalsInPen(penForm.penId).length : 0;
    host.innerHTML = PEN_STATUS_CHOICES.map((s) => {
      const disabled = s.key === 'DISABLED' && occupants > 0;
      return `<button type="button" class="seg-btn ${penForm.status === s.key ? 'active' : ''}" ${disabled ? 'disabled title="Chuồng còn dúi"' : ''} onclick="MapUI.setPenStatus('${s.key}')">${s.label}</button>`;
    }).join('');
  }

  function setPenStatus(key) {
    penForm.status = key;
    renderPenStatusButtons();
  }

  function zoneAt(pos) {
    if (!pos) return '';
    const zones = ed().mapData.blocks
      .filter((b) => b.block_type === 'ZONE' && b.zone_id && pos.x >= b.x && pos.x <= b.x + b.width && pos.y >= b.y && pos.y <= b.y + b.height)
      .sort((a, c) => a.width * a.height - c.width * c.height);
    return zones.length ? zones[0].zone_id : '';
  }

  function openPenForm({ penId = null, pos = null }) {
    const pen = penId ? db().getPenById(penId) : null;
    penForm = { penId, pos, status: pen ? (pen.status === 'EMPTY' ? 'ACTIVE' : pen.status) : 'ACTIVE', codeTouched: !!pen };
    const zoneId = pen ? (pen.zone_id || '') : zoneAt(pos);

    $('penFormTitle').textContent = pen ? `Sửa chuồng ${pen.pen_code}` : 'Chuồng mới';
    $('penFormSubmit').textContent = pen ? 'Lưu chuồng' : 'Tạo và đặt lên sơ đồ';
    $('penFormZone').innerHTML = '<option value="">Chưa chọn khu</option>' +
      db().getZones().map((z) => `<option value="${esc(z.id)}" ${z.id === zoneId ? 'selected' : ''}>${esc(z.name)}</option>`).join('');
    $('penFormCode').value = pen ? pen.pen_code : db().generatePenCode(zoneId);
    $('penFormName').value = pen ? (pen.name || '') : '';
    $('penFormCapacity').value = pen ? pen.capacity : 2;
    renderPenStatusButtons();
    checkPenCode();
    $('modalPenForm').classList.add('active');
  }

  function onPenZoneChange() {
    if (penForm && !penForm.codeTouched) {
      $('penFormCode').value = db().generatePenCode($('penFormZone').value);
      checkPenCode();
    }
  }

  function checkPenCode(fromUser = true) {
    if (penForm && fromUser && document.activeElement === $('penFormCode')) penForm.codeTouched = true;
    const code = $('penFormCode').value.trim().toUpperCase();
    const hint = $('penFormCodeHint');
    if (!code) { hint.textContent = 'Vui lòng nhập mã chuồng.'; hint.className = 'form-hint error'; return false; }
    if (db().isPenCodeTaken(code, penForm && penForm.penId)) {
      hint.textContent = `Mã ${code} đã được dùng cho chuồng khác.`;
      hint.className = 'form-hint error';
      return false;
    }
    hint.textContent = 'Mã hợp lệ.';
    hint.className = 'form-hint ok';
    return true;
  }

  function stepCapacity(d) {
    const input = $('penFormCapacity');
    let v = (parseInt(input.value, 10) || 1) + d;
    const min = penForm && penForm.penId ? Math.max(1, db().getAnimalsInPen(penForm.penId).length) : 1;
    v = Math.max(min, Math.min(50, v));
    input.value = v;
  }

  function submitPenForm() {
    if (!checkPenCode(false)) return;
    try {
      const payload = {
        pen_code: $('penFormCode').value.trim().toUpperCase(),
        name: $('penFormName').value.trim(),
        zone_id: $('penFormZone').value || null,
        capacity: parseInt($('penFormCapacity').value, 10),
        status: penForm.status
      };
      if (penForm.penId) {
        payload.id = penForm.penId;
        const pen = db().savePen(payload);
        toast(`Đã lưu chuồng ${pen.pen_code}.`, 'success');
      } else {
        const pen = db().savePen(payload);
        ed().addBlockAt('PEN', { pen_id: pen.id, pen_code: pen.pen_code, label: 'Chuồng ' + pen.pen_code }, penForm.pos);
        toast(`Đã tạo chuồng ${pen.pen_code} và đặt lên sơ đồ. Kéo để chỉnh vị trí.`, 'success');
      }
      closeModal('modalPenForm');
      ed().requestRender();
      syncUI(ed().getState());
      refreshApp();
    } catch (err) {
      toast(err.message, 'error', 5000);
    }
  }

  // ---------- Form khu vực / lối đi ----------
  let blockForm = null;

  function renderSwatches() {
    $('blockFormColors').innerHTML = ZONE_COLORS.map((c, i) =>
      `<button type="button" class="swatch ${blockForm.colorIdx === i ? 'active' : ''}" style="background:${c.color}; border-color:${blockForm.colorIdx === i ? '#131416' : c.border};" title="${c.name}" aria-label="${c.name}" onclick="MapUI.pickColor(${i})"></button>`
    ).join('');
  }

  function pickColor(i) {
    blockForm.colorIdx = i;
    renderSwatches();
  }

  function openBlockForm({ block = null, kind, pos = null }) {
    blockForm = { block, kind, pos, colorIdx: 0 };
    const isZone = kind === 'ZONE';
    if (block && isZone) {
      const idx = ZONE_COLORS.findIndex((c) => c.color === block.color);
      blockForm.colorIdx = idx >= 0 ? idx : 0;
    }
    $('blockFormTitle').textContent = isZone ? (block ? 'Đổi tên khu vực' : 'Khu vực mới') : 'Đổi tên lối đi';
    $('blockFormNameLabel').textContent = isZone ? 'Tên khu' : 'Tên lối đi';
    $('blockFormName').value = block ? (isZone ? block.zone_name : block.label) || '' : 'Khu ' + nextZoneCode().split('_').pop();
    $('blockFormColorGroup').style.display = isZone ? 'block' : 'none';
    if (isZone) renderSwatches();
    $('modalBlockForm').classList.add('active');
  }

  function submitBlockForm() {
    const name = $('blockFormName').value.trim();
    if (!name) { toast('Vui lòng nhập tên.', 'error'); return; }
    const e = ed();
    const { block, kind, pos, colorIdx } = blockForm;
    if (kind === 'ZONE') {
      const c = ZONE_COLORS[colorIdx];
      if (block) {
        e.updateBlock(block, { zone_name: name, color: c.color, border: c.border, name_edited: !!block.zone_id });
      } else {
        e.addBlockAt('ZONE', { zone_name: name, color: c.color, border: c.border, pending_zone: { zone_code: nextZoneCode() } }, pos);
        toast('Đã thêm khu vực. Kéo để di chuyển; chuồng đặt vào khu sẽ thuộc khu đó khi lưu sơ đồ.');
      }
    } else if (block) {
      e.updateBlock(block, { label: name });
    }
    closeModal('modalBlockForm');
  }

  // ---------- Chuồng chưa đặt ----------
  function openUnplaced() {
    const list = unplacedPens();
    const host = $('unplacedBody');
    if (!list.length) {
      host.innerHTML = '<div class="form-hint">Tất cả chuồng đều đã có trên sơ đồ.</div>';
    } else {
      host.innerHTML = list.map((p) => {
        const zone = db().getZones().find((z) => z.id === p.zone_id);
        return `<div class="list-row">
          <div class="list-row-main"><div class="mono-code" style="font-weight:600;">Chuồng ${esc(p.pen_code)}</div>
          <div class="list-row-sub">${esc(zone ? zone.name : 'Chưa chọn khu')} · ${db().getAnimalsInPen(p.id).length}/${p.capacity} con</div></div>
          <button class="btn btn-primary btn-sm" onclick="MapUI.placeExisting('${esc(p.id)}')">Đặt lên sơ đồ</button>
        </div>`;
      }).join('');
    }
    $('modalUnplaced').classList.add('active');
  }

  function placeExisting(penId) {
    const pen = db().getPenById(penId);
    if (!pen) return;
    ed().addBlockAt('PEN', { pen_id: pen.id, pen_code: pen.pen_code, label: 'Chuồng ' + pen.pen_code });
    closeModal('modalUnplaced');
    toast(`Đã đặt chuồng ${pen.pen_code} vào giữa màn hình. Kéo đến vị trí mong muốn.`);
  }

  // ---------- Thêm dúi vào chuồng ----------
  let pa = null;

  function openPenAnimals(penId) {
    const pen = db().getPenById(penId);
    if (!pen) return;
    if (!db().canCreateRecords()) {
      toast('Tài khoản Viewer chỉ có quyền xem dữ liệu.', 'error');
      return;
    }
    pa = { penId, tab: db().getFreeSlots(penId) > 0 ? 'add' : 'in', search: '', sex: 'MALE', newCode: nextAnimalCode() };
    $('modalPenAnimals').classList.add('active');
    renderPenAnimals();
  }

  function nextAnimalCode() {
    let max = 0;
    db().getAnimals().forEach((a) => {
      const m = a.animal_code.match(/^D(\d+)$/i);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    let n = max + 1, code = 'D' + String(n).padStart(3, '0');
    while (db().getAnimalByCode(code)) { n++; code = 'D' + String(n).padStart(3, '0'); }
    return code;
  }

  function paTab(tab) {
    pa.tab = tab;
    renderPenAnimals();
  }

  function normalize(s) {
    return typeof removeVietnameseTones === 'function' ? removeVietnameseTones(String(s || '')) : String(s || '').toLowerCase();
  }

  function renderPenAnimals() {
    const pen = db().getPenById(pa.penId);
    if (!pen) return;
    const inPen = db().getAnimalsInPen(pen.id);
    const free = db().getFreeSlots(pen.id);
    $('paTitle').textContent = `Chuồng ${pen.pen_code}`;
    $('paSub').textContent = `${inPen.length}/${pen.capacity} con · còn ${free} chỗ trống` + (pen.status === 'DISABLED' ? ' · đã ngừng sử dụng' : '');
    document.querySelectorAll('#paTabs .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === pa.tab));
    $('paFooter').style.display = pa.tab === 'new' ? 'flex' : 'none';

    const body = $('paBody');
    const blocked = pen.status === 'DISABLED';
    if (pa.tab === 'in') {
      body.innerHTML = inPen.length
        ? inPen.map((a) => `<div class="list-row">
            <div class="list-row-main"><div class="mono-code" style="font-weight:600;">${esc(a.animal_code)} <span class="pill pill-neutral">${sexLabel(a.sex)}</span></div>
            <div class="list-row-sub">${esc(a.name || 'Dúi')} · ${esc(a.species || '')}</div></div>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-outline btn-sm" onclick="MapUI.viewAnimal('${esc(a.id)}')">Hồ sơ</button>
              <button class="btn btn-outline btn-sm" style="color:var(--negative);" onclick="MapUI.removeFromPen('${esc(a.id)}')">Chuyển ra</button>
            </div></div>`).join('')
        : '<div class="form-hint">Chuồng đang trống. Chọn "Thêm có sẵn" hoặc "Dúi mới" để đặt dúi vào.</div>';
    } else if (pa.tab === 'add') {
      const q = normalize(pa.search);
      const candidates = db().getAnimals()
        .filter((a) => a.status === 'ACTIVE' && !inPen.some((x) => x.id === a.id))
        .filter((a) => !q || normalize(a.animal_code + ' ' + (a.name || '')).includes(q));
      const note = blocked ? 'Chuồng đã ngừng sử dụng, không thể thêm dúi.' : (free < 1 ? 'Chuồng đã đầy. Hãy chuyển bớt dúi ra hoặc tăng sức chứa.' : '');
      body.innerHTML = `<input type="search" id="paSearch" class="form-control" placeholder="Tìm mã dúi, ví dụ D003" value="${esc(pa.search)}" oninput="MapUI.paSearch(this.value)" autocomplete="off">
        ${note ? `<div class="form-hint error">${note}</div>` : ''}
        <div id="paCandidates">${candidateRows(candidates, free < 1 || blocked)}</div>`;
    } else {
      body.innerHTML = `
        ${blocked ? '<div class="form-hint error">Chuồng đã ngừng sử dụng, không thể thêm dúi.</div>' : (free < 1 ? '<div class="form-hint error">Chuồng đã đầy, chưa thể thêm dúi mới.</div>' : '')}
        <div class="form-group"><label class="form-label" for="paCode">Mã dúi (không trùng)</label>
          <input type="text" id="paCode" class="form-control mono-code" value="${esc(pa.newCode)}" autocapitalize="characters" autocomplete="off"></div>
        <div class="form-group"><label class="form-label">Giới tính</label>
          <div class="seg-group">${['MALE', 'FEMALE', 'UNKNOWN'].map((s) => `<button type="button" class="seg-btn ${pa.sex === s ? 'active' : ''}" onclick="MapUI.paSex('${s}')">${sexLabel(s)}</button>`).join('')}</div></div>
        <div class="form-group"><label class="form-label" for="paName">Tên gọi (không bắt buộc)</label>
          <input type="text" id="paName" class="form-control" autocomplete="off"></div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group"><label class="form-label" for="paSpecies">Chủng loài</label>
            <select id="paSpecies" class="form-control"><option>Dúi Mốc Lớn</option><option>Dúi Má Đào</option></select></div>
          <div class="form-group"><label class="form-label" for="paOrigin">Nguồn gốc</label>
            <select id="paOrigin" class="form-control"><option value="PURCHASED">Mua ngoài</option><option value="BORN">Sinh tại trại</option><option value="OTHER">Khác</option></select></div>
        </div>
        <div class="form-group"><label class="form-label" for="paDob">Ngày sinh</label>
          <input type="date" id="paDob" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>`;
    }
  }

  function candidateRows(list, disabled) {
    if (!list.length) return '<div class="form-hint" style="margin-top:8px;">Không có dúi phù hợp.</div>';
    return list.map((a) => {
      const cur = db().getCurrentPenForAnimal(a.id);
      return `<div class="list-row">
        <div class="list-row-main"><div class="mono-code" style="font-weight:600;">${esc(a.animal_code)} <span class="pill pill-neutral">${sexLabel(a.sex)}</span></div>
        <div class="list-row-sub">${esc(a.name || 'Dúi')} · ${cur ? 'Đang ở chuồng ' + esc(cur.pen_code) : 'Chưa có chuồng'}</div></div>
        <button class="btn btn-primary btn-sm" ${disabled ? 'disabled' : ''} onclick="MapUI.assign('${esc(a.id)}')">${cur ? 'Chuyển vào' : 'Thêm vào'}</button>
      </div>`;
    }).join('');
  }

  function paSearch(v) {
    pa.search = v;
    const pen = db().getPenById(pa.penId);
    const inPen = db().getAnimalsInPen(pen.id);
    const q = normalize(v);
    const list = db().getAnimals()
      .filter((a) => a.status === 'ACTIVE' && !inPen.some((x) => x.id === a.id))
      .filter((a) => !q || normalize(a.animal_code + ' ' + (a.name || '')).includes(q));
    $('paCandidates').innerHTML = candidateRows(list, db().getFreeSlots(pen.id) < 1 || pen.status === 'DISABLED');
  }

  function paSex(s) {
    pa.sex = s;
    // giữ các ô đã nhập khi đổi giới tính
    const keep = { code: $('paCode').value, name: $('paName').value, sp: $('paSpecies').value, or: $('paOrigin').value, dob: $('paDob').value };
    pa.newCode = keep.code;
    renderPenAnimals();
    $('paName').value = keep.name; $('paSpecies').value = keep.sp; $('paOrigin').value = keep.or; $('paDob').value = keep.dob;
  }

  async function assign(animalId) {
    const animal = db().getAnimalById(animalId);
    const pen = db().getPenById(pa.penId);
    if (!animal || !pen) return;
    const cur = db().getCurrentPenForAnimal(animalId);
    if (cur && cur.id !== pen.id) {
      const ok = await confirmBox('Chuyển chuồng', `Chuyển ${animal.animal_code} từ chuồng ${cur.pen_code} sang chuồng ${pen.pen_code}? Lịch sử chuồng của dúi được giữ lại.`, 'Chuyển');
      if (!ok) return;
    }
    try {
      db().transferAnimal(animalId, pen.id, 'Đặt vào chuồng từ sơ đồ', userName(), { enforceCapacity: true });
      toast(`Đã đặt ${animal.animal_code} vào chuồng ${pen.pen_code}.`, 'success');
      pa.tab = db().getFreeSlots(pen.id) > 0 ? 'add' : 'in';
      renderPenAnimals();
      refreshApp();
    } catch (err) {
      toast(err.message, 'error', 5000);
    }
  }

  async function removeFromPen(animalId) {
    const animal = db().getAnimalById(animalId);
    const pen = db().getPenById(pa.penId);
    if (!animal || !pen) return;
    const ok = await confirmBox('Chuyển dúi ra khỏi chuồng', `Đưa ${animal.animal_code} ra khỏi chuồng ${pen.pen_code}? Dúi sẽ ở trạng thái chưa có chuồng cho đến khi bạn đặt vào chuồng khác.`, 'Chuyển ra', true);
    if (!ok) return;
    try {
      db().transferAnimal(animalId, null, `Đưa ra khỏi chuồng ${pen.pen_code}`, userName());
      toast(`Đã đưa ${animal.animal_code} ra khỏi chuồng ${pen.pen_code}.`, 'success');
      renderPenAnimals();
      refreshApp();
    } catch (err) {
      toast(err.message, 'error', 5000);
    }
  }

  function viewAnimal(animalId) {
    closeModal('modalPenAnimals');
    if (typeof closeMapSheet === 'function') closeMapSheet();
    if (typeof openAnimalDetailView === 'function') openAnimalDetailView(animalId);
  }

  function submitNewAnimal() {
    const pen = db().getPenById(pa.penId);
    const code = $('paCode').value.trim().toUpperCase();
    if (!code) { toast('Vui lòng nhập mã dúi.', 'error'); return; }
    if (pen.status === 'DISABLED') { toast(`Chuồng ${pen.pen_code} đã ngừng sử dụng.`, 'error'); return; }
    if (db().getFreeSlots(pen.id) < 1) { toast(`Chuồng ${pen.pen_code} đã đủ ${pen.capacity}/${pen.capacity} con.`, 'error'); return; }
    try {
      const animal = db().saveAnimal({
        animal_code: code,
        name: $('paName').value.trim(),
        species: $('paSpecies').value,
        sex: pa.sex,
        date_of_birth: $('paDob').value || null,
        birth_date_precision: 'EXACT',
        origin_type: $('paOrigin').value,
        status: 'ACTIVE',
        notes: ''
      });
      db().transferAnimal(animal.id, pen.id, 'Gán chuồng ban đầu từ sơ đồ', userName(), { enforceCapacity: true });
      toast(`Đã tạo ${animal.animal_code} và đặt vào chuồng ${pen.pen_code}.`, 'success');
      pa.newCode = nextAnimalCode();
      pa.tab = 'in';
      renderPenAnimals();
      refreshApp();
    } catch (err) {
      toast(err.message, 'error', 5000);
    }
  }

  // ---------- Phiên bản, xuất, nhập ----------
  function openMore() {
    const revs = db().getFarmMapRevisions();
    $('mapRevisionList').innerHTML = revs.length
      ? revs.map((r) => `<div class="list-row">
          <div class="list-row-main"><div style="font-weight:600;">Phiên bản ${esc(r.revision_number)}</div>
          <div class="list-row-sub">${new Date(r.saved_at).toLocaleString('vi-VN')} · ${esc(r.saved_by)} · ${r.map.blocks.length} khối</div></div>
          <button class="btn btn-outline btn-sm" onclick="MapUI.loadRevision('${esc(r.id)}')">Nạp lại</button></div>`).join('')
      : '<div class="form-hint">Chưa có phiên bản nào. Mỗi lần bấm "Lưu sơ đồ" sẽ giữ lại bản trước đó.</div>';
    $('modalMapMore').classList.add('active');
  }

  async function loadRevision(id) {
    const rev = db().getFarmMapRevisions().find((r) => r.id === id);
    if (!rev) return;
    const ok = await confirmBox('Nạp lại phiên bản cũ', `Nạp sơ đồ phiên bản ${rev.revision_number} vào bản nháp? Bạn vẫn phải bấm "Lưu sơ đồ" để áp dụng, và có thể hoàn tác.`, 'Nạp vào bản nháp');
    if (!ok) return;
    ed().loadBlocksIntoDraft(rev.map.blocks);
    closeModal('modalMapMore');
    toast('Đã nạp vào bản nháp. Kiểm tra rồi bấm "Lưu sơ đồ".');
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function exportJSON() {
    const blocks = ed().mapData.blocks;
    const payload = {
      format: 'farm-map',
      version: 1,
      exported_at: new Date().toISOString(),
      zones: db().getZones().map((z) => ({ id: z.id, zone_code: z.zone_code, name: z.name })),
      pens: db().getPens().map((p) => ({ id: p.id, pen_code: p.pen_code, name: p.name })),
      blocks
    };
    download(`so-do-trang-trai-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
    toast('Đã xuất file sơ đồ. File chỉ chứa vị trí, không chứa dữ liệu dúi.', 'success');
  }

  function importJSON(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.format !== 'farm-map' || !Array.isArray(data.blocks)) throw new Error('File không phải sơ đồ trang trại hợp lệ.');
        const seenIds = new Set(), seenPens = new Set();
        let skipped = 0;
        const out = [];
        data.blocks.forEach((raw) => {
          const nums = ['x', 'y', 'width', 'height'].map((k) => Number(raw[k]));
          if (!nums.every(Number.isFinite) || nums[2] <= 0 || nums[3] <= 0 || !['PEN', 'ZONE', 'PATH'].includes(raw.block_type)) { skipped++; return; }
          const b = { id: raw.id && !seenIds.has(raw.id) ? String(raw.id) : 'blk-' + Date.now() + '-' + out.length, block_type: raw.block_type, x: nums[0], y: nums[1], width: nums[2], height: nums[3], locked: !!raw.locked };
          if (raw.block_type === 'PEN') {
            let pen = db().getPenById(raw.pen_id) || db().getPens().find((p) => p.pen_code.toUpperCase() === String(raw.pen_code || '').toUpperCase());
            if (!pen || seenPens.has(pen.id)) { skipped++; return; }
            seenPens.add(pen.id);
            b.pen_id = pen.id; b.pen_code = pen.pen_code; b.label = 'Chuồng ' + pen.pen_code;
          } else if (raw.block_type === 'ZONE') {
            b.zone_name = String(raw.zone_name || 'Khu');
            b.color = String(raw.color || '#f4f7f8'); b.border = String(raw.border || '#cbd2d6');
            const zone = db().getZones().find((z) => z.id === raw.zone_id);
            if (zone) b.zone_id = zone.id;
            else b.pending_zone = { zone_code: 'KHU_' + String.fromCharCode(65 + (out.filter((o) => o.pending_zone).length % 26)) };
          } else {
            b.label = String(raw.label || 'Lối đi');
          }
          seenIds.add(b.id);
          out.push(b);
        });
        ed().loadBlocksIntoDraft(out);
        closeModal('modalMapMore');
        toast(`Đã nhập ${out.length} khối vào bản nháp${skipped ? `, bỏ qua ${skipped} khối không khớp chuồng hiện có` : ''}. Kiểm tra rồi bấm "Lưu sơ đồ".`, skipped ? 'info' : 'success', 5000);
      } catch (err) {
        toast(err.message, 'error', 5000);
      }
    };
    reader.readAsText(file);
  }

  // ---------- Làm mới các màn hình khác ----------
  function refreshApp() {
    try {
      if (ed()) ed().refreshData();
      updateSummary();
      if (typeof renderAnimals === 'function') renderAnimals();
      if (typeof renderPens === 'function') renderPens();
      if (typeof renderDashboard === 'function') renderDashboard();
      const sheet = $('mapBottomSheet');
      if (sheet && sheet.classList.contains('open') && window.currentSheetPenId && typeof window.onSelectPenBlock === 'function') {
        window.onSelectPenBlock(window.currentSheetPenId);
      }
    } catch (e) {
      console.error(e);
    }
  }

  // ---------- Khởi động ----------
  document.addEventListener('DOMContentLoaded', () => {
    bindDock();
    window.addEventListener('beforeunload', (e) => {
      if (ed() && ed().dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  });

  return {
    ensure, onTabShown, toggle, exitEdit, onRoleChanged, undo, redo, save, setZone,
    editSelected, animalsSelected, rotate, toggleLock, duplicate, removeSelected,
    openPenForm, setPenStatus, onPenZoneChange, checkPenCode, stepCapacity, submitPenForm,
    pickColor, submitBlockForm, openUnplaced, placeExisting,
    openPenAnimals, paTab, paSearch, paSex, assign, removeFromPen, viewAnimal, submitNewAnimal,
    openMore, loadRevision, exportJSON, importJSON, toast, refreshApp, renderZoneChips
  };
})();
window.MapUI = MapUI;
