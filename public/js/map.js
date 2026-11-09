/**
 * Farm Map 2D: xem + chỉnh sửa kiểu "xây dựng" trên điện thoại.
 *
 * Chế độ xem (mọi người): kéo, phóng to, chạm chuồng để xem. Không thể xê dịch chuồng.
 * Chế độ sửa (Admin/Manager): làm việc trên BẢN NHÁP, chỉ ghi vào dữ liệu khi bấm Lưu.
 *   - Chạm khối để chọn, kéo thân khối để di chuyển, kéo chấm ở góc để đổi kích thước.
 *   - Tự hít lưới và hít mép các khối khác, có đường gióng; chuồng chồng nhau hiện đỏ.
 *   - Hoàn tác / làm lại, khóa khối, xoay, nhân bản (khu, lối đi).
 *   - Kéo ô từ khay xuống sơ đồ để đặt, hoặc chạm để đặt vào giữa màn hình.
 * Di chuyển/đổi cỡ khối chỉ đổi hình học, không đổi chuồng của cá thể (pen_assignments).
 */

const MAP_MIN_SIZE = { PEN: [80, 80], ZONE: [160, 120], PATH: [40, 40] };
const MAP_DEFAULT_SIZE = { PEN: [120, 120], ZONE: [320, 260], PATH: [80, 300] };
const MAP_STATUS = {
  ACTIVE: { label: 'Đang nuôi', color: '#1e7b4f', tint: '#f1faf5' },
  BREEDING: { label: 'Sinh sản', color: '#2f70bb', tint: '#f0f6fd' },
  QUARANTINE: { label: 'Cách ly', color: '#c4242a', tint: '#fff5f5' },
  EMPTY: { label: 'Trống', color: '#858990', tint: '#f7f8f9' },
  DISABLED: { label: 'Ngừng dùng', color: '#4b4f55', tint: '#e6e8ea' }
};
window.MAP_STATUS = MAP_STATUS;

class FarmMapEditor {
  constructor(canvasId, db) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.db = db;

    this.scale = 1;
    this.panX = 20;
    this.panY = 20;
    this.minScale = 0.25;
    this.maxScale = 3.0;

    this.isEditMode = false;
    this.gridSize = 20;
    this.activeZoneFilter = 'ALL';

    this.pointers = new Map();
    this.pointerStartPos = new Map();
    this.pointerStartTime = 0;
    this.initialPinchDistance = 0;
    this.initialPinchScale = 1;
    this.pinchCenter = { x: 0, y: 0 };

    // Trạng thái thao tác trên khối: null | 'pan' | 'move' | 'resize'
    this.gesture = null;
    this.gestureMoved = false;
    this.resizeCorner = null;
    this.origRect = null;
    this.dragOffset = { x: 0, y: 0 };
    this.guides = [];
    this.selectedBlock = null;
    this.hitBlockOnDown = null;

    // Bản nháp + lịch sử
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false;
    this.onChange = null; // callback(state) cho giao diện

    this.textK = 1;
    this.needsRender = true;
    this.renderLoop = this.renderLoop.bind(this);

    this.mapData = this.cloneMap(this.db.getFarmMap());

    this.initEvents();
    this.resizeCanvas();
    this.fitToScreen();
    requestAnimationFrame(this.renderLoop);
  }

  cloneMap(m) {
    return JSON.parse(JSON.stringify({ ...m, blocks: m.blocks || [] }));
  }

  emitChange() {
    if (typeof this.onChange === 'function') this.onChange(this.getState());
  }

  getState() {
    return {
      isEditMode: this.isEditMode,
      dirty: this.dirty,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      selected: this.selectedBlock,
      hasOverlap: this.hasPenOverlap()
    };
  }

  // ---------- Canvas & vòng vẽ ----------
  resizeCanvas() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const w = rect.width || 360;
    const h = rect.height || 420;

    // Giữ nguyên điểm đang ở giữa màn hình khi xoay máy / đổi cỡ
    let cx = null, cy = null;
    if (this.viewWidth && this.viewHeight) {
      cx = (this.viewWidth / 2 - this.panX) / this.scale;
      cy = (this.viewHeight / 2 - this.panY) / this.scale;
    }

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewWidth = w;
    this.viewHeight = h;

    if (cx !== null) {
      this.panX = w / 2 - cx * this.scale;
      this.panY = h / 2 - cy * this.scale;
    }
    this.requestRender();
  }

  requestRender() { this.needsRender = true; }

  renderLoop() {
    if (this.needsRender) {
      this.needsRender = false;
      this.render();
    }
    requestAnimationFrame(this.renderLoop);
  }

  // ---------- Hình học ----------
  getCanvasCoords(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.panX) / this.scale,
      y: (clientY - rect.top - this.panY) / this.scale
    };
  }

  worldToClient(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + x * this.scale + this.panX, y: rect.top + y * this.scale + this.panY };
  }

  findBlockAt(x, y) {
    const blocks = this.mapData.blocks || [];
    // Thứ tự ưu tiên chạm: chuồng > lối đi > khu; khối thêm sau nằm trên
    for (const type of ['PEN', 'PATH', 'ZONE']) {
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        if (b.block_type === type && x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) return b;
      }
    }
    return null;
  }

  // Chấm góc (đơn vị màn hình 22px bán kính chạm => vùng chạm 44px)
  findHandleAt(clientX, clientY) {
    const b = this.selectedBlock;
    if (!b || !this.isEditMode || b.locked) return null;
    const corners = {
      nw: [b.x, b.y], ne: [b.x + b.width, b.y],
      sw: [b.x, b.y + b.height], se: [b.x + b.width, b.y + b.height]
    };
    const rect = this.canvas.getBoundingClientRect();
    let best = null, bestD = 24;
    for (const key of Object.keys(corners)) {
      const px = rect.left + corners[key][0] * this.scale + this.panX;
      const py = rect.top + corners[key][1] * this.scale + this.panY;
      const d = Math.hypot(clientX - px, clientY - py);
      if (d <= bestD) { best = key; bestD = d; }
    }
    return best;
  }

  rectsOverlap(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  penOverlaps(block) {
    if (block.block_type !== 'PEN') return false;
    return this.mapData.blocks.some(o => o !== block && o.block_type === 'PEN' && this.rectsOverlap(block, o));
  }

  hasPenOverlap() {
    return this.mapData.blocks.some(b => this.penOverlaps(b));
  }

  snapValue(v) {
    return Math.round(v / this.gridSize) * this.gridSize;
  }

  // Hít vào mép/tâm các khối khác, trả về giá trị đã chỉnh + đường gióng
  snapToNeighbors(rect, moving) {
    const thr = 7 / this.scale;
    const others = this.mapData.blocks.filter(o => o !== moving && o.block_type !== 'ZONE');
    this.guides = [];
    let { x, y } = rect;
    const w = rect.width, h = rect.height;
    let bestDx = thr + 1, bestDy = thr + 1, gx = null, gy = null;

    const xs = [[x, 0], [x + w / 2, w / 2], [x + w, w]];
    const ys = [[y, 0], [y + h / 2, h / 2], [y + h, h]];
    others.forEach(o => {
      const ox = [o.x, o.x + o.width / 2, o.x + o.width];
      const oy = [o.y, o.y + o.height / 2, o.y + o.height];
      xs.forEach(([mx, off]) => ox.forEach(t => {
        const d = t - mx;
        if (Math.abs(d) < Math.abs(bestDx) && Math.abs(d) <= thr) { bestDx = d; gx = t; }
      }));
      ys.forEach(([my, off]) => oy.forEach(t => {
        const d = t - my;
        if (Math.abs(d) < Math.abs(bestDy) && Math.abs(d) <= thr) { bestDy = d; gy = t; }
      }));
    });
    if (gx !== null) { x += bestDx; this.guides.push({ axis: 'x', pos: gx }); }
    if (gy !== null) { y += bestDy; this.guides.push({ axis: 'y', pos: gy }); }
    return { x, y, snappedX: gx !== null, snappedY: gy !== null };
  }

  // ---------- Sự kiện chạm / chuột ----------
  initEvents() {
    this.canvas.style.touchAction = 'none';
    this.canvas.style.userSelect = 'none';

    if (window.ResizeObserver && this.canvas.parentElement) {
      this.ro = new ResizeObserver(() => this.resizeCanvas());
      this.ro.observe(this.canvas.parentElement);
    }
    window.addEventListener('resize', () => this.resizeCanvas());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resizeCanvas(), 250));

    this.canvas.addEventListener('pointerdown', (e) => {
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.pointerStartPos.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pointers.size === 1) {
        this.pointerStartTime = performance.now();
        this.gestureMoved = false;
        this.lastPanX = e.clientX;
        this.lastPanY = e.clientY;
        const coords = this.getCanvasCoords(e.clientX, e.clientY);
        this.hitBlockOnDown = this.findBlockAt(coords.x, coords.y);

        const handle = this.findHandleAt(e.clientX, e.clientY);
        if (handle) {
          this.gesture = 'resize';
          this.resizeCorner = handle;
          this.origRect = { x: this.selectedBlock.x, y: this.selectedBlock.y, width: this.selectedBlock.width, height: this.selectedBlock.height };
          this.pushUndo();
        } else if (this.isEditMode && this.hitBlockOnDown && !this.hitBlockOnDown.locked) {
          this.gesture = 'move-pending';
          this.dragOffset = { x: coords.x - this.hitBlockOnDown.x, y: coords.y - this.hitBlockOnDown.y };
        } else {
          this.gesture = 'pan';
        }
      } else if (this.pointers.size === 2) {
        this.gesture = 'pinch';
        const pts = Array.from(this.pointers.values());
        this.initialPinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this.initialPinchScale = this.scale;
        const rect = this.canvas.getBoundingClientRect();
        this.pinchCenter = {
          x: (pts[0].x + pts[1].x) / 2 - rect.left,
          y: (pts[0].y + pts[1].y) / 2 - rect.top
        };
      }
      this.requestRender();
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pointers.size >= 2) {
        const pts = Array.from(this.pointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this.initialPinchDistance > 10) {
          const target = Math.max(this.minScale, Math.min(this.maxScale, this.initialPinchScale * (dist / this.initialPinchDistance)));
          this.zoomAt(this.pinchCenter.x, this.pinchCenter.y, target);
        }
        return;
      }

      const start = this.pointerStartPos.get(e.pointerId);
      const moved = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) : 0;

      if (this.gesture === 'move-pending' && moved > 6) {
        // Bắt đầu kéo khối: chọn khối, lưu bước hoàn tác
        this.selectedBlock = this.hitBlockOnDown;
        this.pushUndo();
        this.gesture = 'move';
        this.emitChange();
      }

      if (this.gesture === 'move' && this.selectedBlock) {
        this.gestureMoved = true;
        const c = this.getCanvasCoords(e.clientX, e.clientY);
        const b = this.selectedBlock;
        let nx = this.snapValue(c.x - this.dragOffset.x);
        let ny = this.snapValue(c.y - this.dragOffset.y);
        const snapped = this.snapToNeighbors({ x: nx, y: ny, width: b.width, height: b.height }, b);
        b.x = Math.round(snapped.x);
        b.y = Math.round(snapped.y);
        this.markDirty();
        this.requestRender();
      } else if (this.gesture === 'resize' && this.selectedBlock) {
        this.gestureMoved = true;
        this.applyResize(this.getCanvasCoords(e.clientX, e.clientY));
        this.markDirty();
        this.requestRender();
      } else if (this.gesture === 'pan' && moved > 4) {
        this.gestureMoved = true;
        this.panX += e.clientX - this.lastPanX;
        this.panY += e.clientY - this.lastPanY;
        this.lastPanX = e.clientX;
        this.lastPanY = e.clientY;
        this.requestRender();
      }
    });

    const onPointerEnd = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const wasSingle = this.pointers.size === 1;
      const start = this.pointerStartPos.get(e.pointerId);
      const duration = performance.now() - this.pointerStartTime;
      const moved = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) : 999;
      const cancelled = e.type === 'pointercancel';

      // Chạm một lần: chọn khối
      if (wasSingle && !cancelled && moved < 8 && duration < 450 && this.gesture !== 'resize') {
        const c = this.getCanvasCoords(e.clientX, e.clientY);
        const hit = this.findBlockAt(c.x, c.y);
        this.handleTap(hit);
      }

      if (this.gesture === 'resize' && !this.gestureMoved) this.undoStack.pop();
      if (this.gesture === 'move' || this.gesture === 'resize') {
        this.guides = [];
        this.emitChange();
      }

      this.pointers.delete(e.pointerId);
      this.pointerStartPos.delete(e.pointerId);
      if (this.pointers.size === 0) {
        this.gesture = null;
        this.resizeCorner = null;
      } else if (this.pointers.size === 1) {
        // Còn một ngón sau pinch: tiếp tục kéo bản đồ
        const rest = Array.from(this.pointers.entries())[0];
        this.gesture = 'pan';
        this.lastPanX = rest[1].x;
        this.lastPanY = rest[1].y;
        this.pointerStartPos.set(rest[0], { x: rest[1].x, y: rest[1].y });
        this.pointerStartTime = performance.now() - 10000; // không coi là chạm
      }
      this.requestRender();
    };
    this.canvas.addEventListener('pointerup', onPointerEnd);
    this.canvas.addEventListener('pointercancel', onPointerEnd);

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.12 : 0.88;
      this.zoomAt(e.clientX - rect.left, e.clientY - rect.top, this.scale * factor);
    }, { passive: false });

    // Bàn phím trên desktop: Delete, Ctrl+Z, Ctrl+Y
    window.addEventListener('keydown', (e) => {
      if (!this.isEditMode) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); this.undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); }
      else if (e.key === 'Delete' && this.selectedBlock && typeof window.MapUI !== 'undefined') window.MapUI.removeSelected();
    });
  }

  handleTap(hit) {
    if (this.isEditMode) {
      this.selectedBlock = hit || null;
      this.emitChange();
      this.requestRender();
      return;
    }
    // Chế độ xem: chỉ chuồng mới mở bảng thông tin
    if (hit && hit.block_type === 'PEN' && hit.pen_id) {
      this.selectedBlock = hit;
      if (window.onSelectPenBlock) window.onSelectPenBlock(hit.pen_id);
    } else {
      this.selectedBlock = null;
      if (window.onDeselectBlock) window.onDeselectBlock();
    }
    this.requestRender();
  }

  zoomAt(sx, sy, targetScale) {
    const s = Math.max(this.minScale, Math.min(this.maxScale, targetScale));
    this.panX = sx - (sx - this.panX) * (s / this.scale);
    this.panY = sy - (sy - this.panY) * (s / this.scale);
    this.scale = s;
    this.requestRender();
  }

  applyResize(c) {
    const b = this.selectedBlock;
    const o = this.origRect;
    const [minW, minH] = MAP_MIN_SIZE[b.block_type] || [40, 40];
    let left = o.x, top = o.y, right = o.x + o.width, bottom = o.y + o.height;
    const px = this.snapValue(c.x), py = this.snapValue(c.y);
    if (this.resizeCorner.includes('w')) left = Math.min(px, right - minW);
    if (this.resizeCorner.includes('e')) right = Math.max(px, left + minW);
    if (this.resizeCorner.includes('n')) top = Math.min(py, bottom - minH);
    if (this.resizeCorner.includes('s')) bottom = Math.max(py, top + minH);
    b.x = left; b.y = top; b.width = right - left; b.height = bottom - top;
  }

  // ---------- Bản nháp, hoàn tác ----------
  snapshot() { return JSON.stringify(this.mapData.blocks); }

  pushUndo() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack = [];
  }

  markDirty() {
    if (!this.dirty) { this.dirty = true; this.emitChange(); }
  }

  restoreSnapshot(json) {
    this.mapData.blocks = JSON.parse(json);
    if (this.selectedBlock) {
      this.selectedBlock = this.mapData.blocks.find(b => b.id === this.selectedBlock.id) || null;
    }
    this.dirty = true;
    this.emitChange();
    this.requestRender();
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.snapshot());
    this.restoreSnapshot(this.undoStack.pop());
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.snapshot());
    this.restoreSnapshot(this.redoStack.pop());
  }

  // ---------- Chế độ ----------
  setEditMode(on) {
    if (on) {
      if (!this.db.canEditMap()) return false;
      this.mapData = this.cloneMap(this.db.getFarmMap());
      this.undoStack = [];
      this.redoStack = [];
      this.dirty = false;
      this.isEditMode = true;
    } else {
      this.isEditMode = false;
      this.mapData = this.cloneMap(this.db.getFarmMap());
      this.undoStack = [];
      this.redoStack = [];
      this.dirty = false;
      this.selectedBlock = null;
    }
    this.guides = [];
    this.emitChange();
    this.requestRender();
    return this.isEditMode;
  }

  toggleEditMode() { return this.setEditMode(!this.isEditMode); }

  // Ghi bản nháp vào dữ liệu. Ném lỗi nếu không hợp lệ.
  commit(note = '') {
    const result = this.db.saveFarmMap(this.mapData, note);
    this.mapData = this.cloneMap(result.map);
    this.selectedBlock = this.selectedBlock
      ? this.mapData.blocks.find(b => b.id === this.selectedBlock.id) || null
      : null;
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false;
    this.emitChange();
    this.requestRender();
    return result;
  }

  // Nạp một phiên bản cũ vào bản nháp (chưa lưu)
  loadBlocksIntoDraft(blocks) {
    this.pushUndo();
    this.mapData.blocks = JSON.parse(JSON.stringify(blocks));
    this.selectedBlock = null;
    this.dirty = true;
    this.emitChange();
    this.fitToScreen();
  }

  // Làm mới số liệu (số dúi, trạng thái) mà không đụng bản nháp
  refreshData() { this.requestRender(); }

  // ---------- Thao tác khối ----------
  findFreeSpot(w, h, cx, cy) {
    const g = this.gridSize;
    const startX = this.snapValue(cx - w / 2);
    const startY = this.snapValue(cy - h / 2);
    const probe = { x: 0, y: 0, width: w, height: h, block_type: 'PEN' };
    for (let r = 0; r < 40; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          probe.x = startX + dx * g;
          probe.y = startY + dy * g;
          const clash = this.mapData.blocks.some(o => o.block_type === 'PEN' && this.rectsOverlap(probe, o));
          if (!clash) return { x: probe.x, y: probe.y };
        }
      }
    }
    return { x: startX, y: startY };
  }

  viewCenterWorld() {
    return this.getCanvasCoords(
      this.canvas.getBoundingClientRect().left + this.viewWidth / 2,
      this.canvas.getBoundingClientRect().top + this.viewHeight / 2
    );
  }

  // Thêm khối vào bản nháp tại vị trí world (hoặc giữa màn hình)
  addBlockAt(blockType, props = {}, at = null) {
    if (!this.isEditMode) return null;
    const [w, h] = MAP_DEFAULT_SIZE[blockType];
    const c = at || this.viewCenterWorld();
    const spot = blockType === 'PEN'
      ? this.findFreeSpot(w, h, c.x, c.y)
      : { x: this.snapValue(c.x - w / 2), y: this.snapValue(c.y - h / 2) };
    this.pushUndo();
    const block = {
      id: 'blk-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      block_type: blockType,
      x: spot.x, y: spot.y, width: w, height: h,
      ...props
    };
    this.mapData.blocks.push(block);
    this.selectedBlock = block;
    this.dirty = true;
    this.emitChange();
    this.requestRender();
    return block;
  }

  updateBlock(block, patch) {
    this.pushUndo();
    Object.assign(block, patch);
    this.dirty = true;
    this.emitChange();
    this.requestRender();
  }

  deleteSelectedBlock() {
    if (!this.isEditMode || !this.selectedBlock) return false;
    this.pushUndo();
    this.mapData.blocks = this.mapData.blocks.filter(b => b.id !== this.selectedBlock.id);
    this.selectedBlock = null;
    this.dirty = true;
    this.emitChange();
    this.requestRender();
    return true;
  }

  rotateSelected() {
    const b = this.selectedBlock;
    if (!b || b.locked) return;
    this.pushUndo();
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const w = b.height, h = b.width;
    b.width = w; b.height = h;
    b.x = this.snapValue(cx - w / 2);
    b.y = this.snapValue(cy - h / 2);
    this.dirty = true;
    this.emitChange();
    this.requestRender();
  }

  toggleLockSelected() {
    const b = this.selectedBlock;
    if (!b) return;
    this.pushUndo();
    b.locked = !b.locked;
    this.dirty = true;
    this.emitChange();
    this.requestRender();
  }

  duplicateSelected() {
    const b = this.selectedBlock;
    if (!b || b.block_type === 'PEN') return null; // chuồng là dữ liệu thật, không nhân bản
    this.pushUndo();
    const copy = { ...b, id: 'blk-' + Date.now(), x: b.x + 40, y: b.y + 40, locked: false };
    if (copy.block_type === 'ZONE') { delete copy.zone_id; copy.zone_name = (b.zone_name || 'KHU') + ' (bản sao)'; }
    this.mapData.blocks.push(copy);
    this.selectedBlock = copy;
    this.dirty = true;
    this.emitChange();
    this.requestRender();
    return copy;
  }

  focusBlock(block) {
    if (!block) return;
    const s = Math.max(this.scale, 0.9);
    this.scale = Math.min(this.maxScale, s);
    this.panX = this.viewWidth / 2 - (block.x + block.width / 2) * this.scale;
    this.panY = this.viewHeight / 2 - (block.y + block.height / 2) * this.scale;
    this.requestRender();
  }

  // ---------- Điều khiển khung nhìn ----------
  zoomIn() { this.zoomAt(this.viewWidth / 2, this.viewHeight / 2, this.scale * 1.25); }
  zoomOut() { this.zoomAt(this.viewWidth / 2, this.viewHeight / 2, this.scale / 1.25); }

  resetView() {
    this.scale = 1;
    this.panX = 20;
    this.panY = 20;
    this.requestRender();
  }

  fitToScreen() {
    const blocks = this.mapData.blocks || [];
    if (blocks.length === 0) { this.resetView(); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    blocks.forEach(b => {
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
    });
    const viewW = this.viewWidth || 360, viewH = this.viewHeight || 420;
    const sx = viewW / (maxX - minX + 60), sy = viewH / (maxY - minY + 60);
    this.scale = Math.max(this.minScale, Math.min(1.2, Math.min(sx, sy)));
    this.panX = (viewW - (maxX + minX) * this.scale) / 2;
    // Nếu sơ đồ thấp hơn khung nhìn thì để sát phía trên, chừa chỗ cho các nút
    const contentH = (maxY - minY) * this.scale;
    this.panY = contentH + 60 < viewH ? 30 - minY * this.scale : (viewH - (maxY + minY) * this.scale) / 2;
    this.requestRender();
  }

  setZoneFilter(zoneId) {
    this.activeZoneFilter = zoneId;
    // Chọn khu: đưa khối khu đó vào giữa màn hình
    if (zoneId !== 'ALL') {
      const zb = this.mapData.blocks.find(b => b.block_type === 'ZONE' && b.zone_id === zoneId);
      if (zb) {
        const s = Math.min(1.2, Math.max(this.minScale, Math.min(this.viewWidth / (zb.width + 60), this.viewHeight / (zb.height + 60))));
        this.scale = s;
        this.panX = this.viewWidth / 2 - (zb.x + zb.width / 2) * s;
        this.panY = this.viewHeight / 2 - (zb.y + zb.height / 2) * s;
      }
    }
    this.requestRender();
  }

  // ---------- Vẽ ----------
  render() {
    const w = this.viewWidth || 360, h = this.viewHeight || 420;
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.scale, this.scale);

    this.textK = Math.max(1, Math.min(1.5, 0.55 / this.scale));
    this.drawGrid(w, h);

    const blocks = this.mapData.blocks || [];
    blocks.filter(b => b.block_type === 'ZONE').forEach(b => this.drawBlock(b));
    blocks.filter(b => b.block_type === 'PATH').forEach(b => this.drawBlock(b));
    blocks.filter(b => b.block_type === 'PEN').forEach(b => this.drawBlock(b));

    this.drawGuides();
    this.drawSelection();
    this.ctx.restore();
  }

  // Chữ phóng theo mức thu nhỏ để vẫn đọc được trên màn hình điện thoại
  font(weight, px, family) {
    return `${weight}${Math.round(px * this.textK * 10) / 10}px ${family}`;
  }

  drawGrid(w, h) {
    // Lưới nhạt, chỉ vẽ phần nhìn thấy; thưa dần khi thu nhỏ
    if (this.scale < 0.4) return;
    const step = this.gridSize * (this.scale < 0.7 ? 4 : 2);
    const x0 = -this.panX / this.scale, y0 = -this.panY / this.scale;
    const x1 = x0 + w / this.scale, y1 = y0 + h / this.scale;
    this.ctx.strokeStyle = this.isEditMode ? '#dfe3e6' : '#eceef0';
    this.ctx.lineWidth = 1 / this.scale;
    this.ctx.beginPath();
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { this.ctx.moveTo(x, y0); this.ctx.lineTo(x, y1); }
    for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { this.ctx.moveTo(x0, y); this.ctx.lineTo(x1, y); }
    this.ctx.stroke();
  }

  drawGuides() {
    if (!this.guides.length) return;
    const x0 = -this.panX / this.scale, y0 = -this.panY / this.scale;
    const x1 = x0 + (this.viewWidth || 360) / this.scale, y1 = y0 + (this.viewHeight || 420) / this.scale;
    this.ctx.save();
    this.ctx.strokeStyle = '#d6409f';
    this.ctx.lineWidth = 1 / this.scale;
    this.ctx.setLineDash([4 / this.scale, 3 / this.scale]);
    this.ctx.beginPath();
    this.guides.forEach(g => {
      if (g.axis === 'x') { this.ctx.moveTo(g.pos, y0); this.ctx.lineTo(g.pos, y1); }
      else { this.ctx.moveTo(x0, g.pos); this.ctx.lineTo(x1, g.pos); }
    });
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawSelection() {
    const b = this.selectedBlock;
    if (!b || !this.mapData.blocks.includes(b)) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#1b6c80';
    ctx.lineWidth = 2.5 / this.scale;
    ctx.setLineDash([6 / this.scale, 3 / this.scale]);
    ctx.strokeRect(b.x - 3, b.y - 3, b.width + 6, b.height + 6);
    ctx.setLineDash([]);

    if (this.isEditMode && !b.locked) {
      const r = 8 / this.scale;
      [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].forEach(([cx, cy]) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#1b6c80';
        ctx.lineWidth = 2.5 / this.scale;
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  drawBlock(b) {
    const ctx = this.ctx;
    ctx.save();

    if (b.block_type === 'ZONE') {
      ctx.fillStyle = b.color || '#f4f6f8';
      ctx.fillRect(b.x, b.y, b.width, b.height);
      ctx.strokeStyle = b.border || '#cbd2d6';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      ctx.fillStyle = '#4a4e53';
      ctx.font = this.font('600 ', 13, '"IBM Plex Sans", sans-serif');
      ctx.fillText(b.zone_name || 'KHU VỰC', b.x + 12, b.y + 22);
      if (b.locked) this.drawLockBadge(b.x + b.width - 22, b.y + 6);
    } else if (b.block_type === 'PATH') {
      ctx.fillStyle = '#eceff2';
      ctx.fillRect(b.x, b.y, b.width, b.height);
      ctx.strokeStyle = '#b9bec4';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      ctx.setLineDash([]);
      ctx.fillStyle = '#6d7178';
      ctx.font = this.font('', 12, '"IBM Plex Sans", sans-serif');
      if (b.width >= b.height) {
        ctx.fillText(b.label || 'Lối đi', b.x + 10, b.y + b.height / 2 + 4);
      } else {
        ctx.translate(b.x + b.width / 2 + 4, b.y + 12);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(b.label || 'Lối đi', 0, 0);
      }
    } else if (b.block_type === 'PEN') {
      this.drawPen(b);
    }
    ctx.restore();
  }

  drawLockBadge(x, y) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(19,20,22,0.75)';
    this.roundRect(x, y, 16, 16, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = this.font('600 ', 9, '"IBM Plex Sans", sans-serif');
    ctx.fillText('K', x + 5, y + 12);
  }

  drawPen(b) {
    const ctx = this.ctx;
    const pen = this.db.getPenById(b.pen_id);
    const animals = pen ? this.db.getAnimalsInPen(pen.id) : [];
    let st = MAP_STATUS.ACTIVE;
    let statusLabel = st.label;
    if (pen) {
      if (pen.status === 'DISABLED') { st = MAP_STATUS.DISABLED; }
      else if (pen.status === 'BREEDING') { st = MAP_STATUS.BREEDING; }
      else if (pen.status === 'QUARANTINE') { st = MAP_STATUS.QUARANTINE; }
      else if (pen.status === 'EMPTY' || animals.length === 0) { st = MAP_STATUS.EMPTY; }
      statusLabel = st.label;
    }

    const dimmed = this.activeZoneFilter !== 'ALL' && pen && pen.zone_id !== this.activeZoneFilter;
    if (dimmed) ctx.globalAlpha = 0.25;

    const overlap = this.isEditMode && this.penOverlaps(b);
    ctx.fillStyle = overlap ? '#ffe3e3' : st.tint;
    ctx.fillRect(b.x, b.y, b.width, b.height);
    ctx.strokeStyle = overlap ? '#c4242a' : st.color;
    ctx.lineWidth = overlap ? 3 : 1.5;
    ctx.strokeRect(b.x, b.y, b.width, b.height);

    // Đầu chuồng: mã
    const k = this.textK;
    const hh = 24 * k;
    ctx.fillStyle = st.color;
    ctx.fillRect(b.x, b.y, b.width, hh);
    ctx.fillStyle = '#ffffff';
    ctx.font = this.font('600 ', 12, '"IBM Plex Mono", monospace');
    ctx.fillText(pen ? pen.pen_code : (b.pen_code || 'N/A'), b.x + 8, b.y + hh * 0.68);
    if (b.locked) this.drawLockBadge(b.x + b.width - 22, b.y + 4);

    // Số dúi / sức chứa
    ctx.fillStyle = '#131416';
    ctx.font = this.font('600 ', 14, '"IBM Plex Mono", monospace');
    ctx.fillText(`${animals.length}/${pen ? pen.capacity : '?'}`, b.x + 10, b.y + hh + 20 * k);

    // Mỗi ô nhỏ là một chỗ trong chuồng: đặc = có dúi (xanh dương đực, hồng cái, xám chưa rõ)
    if (pen) {
      const slots = Math.min(pen.capacity, 8);
      const size = 12 * k, gap = 4 * k;
      const perRow = Math.max(1, Math.floor((b.width - 20 + gap) / (size + gap)));
      for (let i = 0; i < slots; i++) {
        const col = i % perRow, row = Math.floor(i / perRow);
        const sx = b.x + 10 + col * (size + gap);
        const sy = b.y + hh + 30 * k + row * (size + gap);
        if (sy + size > b.y + b.height - 16 * k) break;
        const a = animals[i];
        if (a) {
          ctx.fillStyle = a.sex === 'MALE' ? '#2f70bb' : (a.sex === 'FEMALE' ? '#c0398a' : '#858990');
          this.roundRect(sx, sy, size, size, 3);
          ctx.fill();
        } else {
          ctx.strokeStyle = '#b9bec4';
          ctx.lineWidth = 1;
          this.roundRect(sx + 0.5, sy + 0.5, size - 1, size - 1, 3);
          ctx.stroke();
        }
      }
    }

    // Nhãn trạng thái bằng chữ (không chỉ dùng màu)
    ctx.fillStyle = st.color;
    ctx.font = this.font('500 ', 11, '"IBM Plex Sans", sans-serif');
    ctx.fillText(overlap ? 'Chồng nhau' : statusLabel, b.x + 10, b.y + b.height - 7);
    if (st === MAP_STATUS.DISABLED) {
      ctx.strokeStyle = 'rgba(75,79,85,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + hh); ctx.lineTo(b.x + b.width, b.y + b.height);
      ctx.moveTo(b.x + b.width, b.y + hh); ctx.lineTo(b.x, b.y + b.height);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Xuất xuống ảnh PNG để chia sẻ
  exportPNG() {
    const link = document.createElement('a');
    link.download = `So_do_trang_trai_${Date.now()}.png`;
    link.href = this.canvas.toDataURL('image/png');
    link.click();
  }
}

window.FarmMapEditor = FarmMapEditor;
