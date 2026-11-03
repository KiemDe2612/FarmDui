/**
 * Module Bản Đồ Trang Trại 2D (Farm Map 2D Touch-First & Mobile-First Canvas Editor)
 * Tuân thủ yêu cầu:
 * - Pointer Events (pointerdown, pointermove, pointerup, pointercancel) hỗ trợ mượt mà chuột & cảm ứng.
 * - 1 ngón tay Pan, 2 ngón tay Pinch-to-Zoom mượt mà quanh tâm chạm.
 * - Phân biệt chính xác Single Tap (chạm chọn chuồng) và Drag (kéo bản đồ).
 * - Tách 2 chế độ:
 *    A. Chế độ Xem (View Mode - Mặc định cho mọi nhân viên): chỉ di chuyển sơ đồ và chạm xem chuồng, không thể kéo làm lệch vị trí chuồng.
 *    B. Chế độ Chỉnh sửa (Edit Mode - Chỉ Admin & Manager): được phép di chuyển, thêm, xóa chuồng.
 * - Hiệu năng cao với requestAnimationFrame.
 * - Fit-to-screen và bộ lọc theo Khu vực (Zone).
 */

class FarmMapEditor {
  constructor(canvasId, db) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.db = db;

    // Viewport transform
    this.scale = 1;
    this.panX = 20;
    this.panY = 20;
    this.minScale = 0.25;
    this.maxScale = 3.0;

    // Chế độ thao tác: Mặc định là View Mode (Chế độ xem an toàn)
    this.isEditMode = false;

    // Settings
    this.gridSize = 20;
    this.snapToGrid = true;
    this.activeZoneFilter = 'ALL';

    // Touch & Pointer state
    this.pointers = new Map();
    this.pointerStartPos = new Map();
    this.pointerStartTime = 0;
    this.initialPinchDistance = 0;
    this.initialPinchScale = 1;
    this.pinchCenter = { x: 0, y: 0 };

    this.isDraggingBlock = false;
    this.isPanning = false;
    this.selectedBlock = null;
    this.dragOffset = { x: 0, y: 0 };

    // RequestAnimationFrame render state
    this.needsRender = true;
    this.renderLoop = this.renderLoop.bind(this);

    // Dữ liệu bản đồ
    this.mapData = this.db.getFarmMap();

    this.initEvents();
    this.resizeCanvas();
    this.fitToScreen();
    requestAnimationFrame(this.renderLoop);
  }

  resizeCanvas() {
    const parent = this.canvas.parentElement;
    if (parent) {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width || 360;
      const h = rect.height || 420;

      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';

      this.ctx.resetTransform();
      this.ctx.scale(dpr, dpr);
      this.viewWidth = w;
      this.viewHeight = h;
      this.requestRender();
    }
  }

  requestRender() {
    this.needsRender = true;
  }

  renderLoop() {
    if (this.needsRender) {
      this.render();
      this.needsRender = false;
    }
    requestAnimationFrame(this.renderLoop);
  }

  initEvents() {
    // Touch action none để chặn cuộn trình duyệt trên canvas
    this.canvas.style.touchAction = 'none';

    window.addEventListener('resize', () => {
      this.resizeCanvas();
    });

    // POINTER EVENTS CHO CẢ CẢM ỨNG VÀ CHUỘT
    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.pointerStartPos.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pointers.size === 1) {
        this.pointerStartTime = performance.now();
        const coords = this.getCanvasCoords(e.clientX, e.clientY);

        // Kiểm tra click trúng block nào
        const hitBlock = this.findBlockAt(coords.x, coords.y);

        if (this.isEditMode && hitBlock) {
          // Trong Edit mode: Chuẩn bị kéo block
          this.selectedBlock = hitBlock;
          this.isDraggingBlock = true;
          this.dragOffset = {
            x: coords.x - hitBlock.x,
            y: coords.y - hitBlock.y
          };
        } else {
          // Trong View mode hoặc bấm ra ngoài: Chuẩn bị Pan
          this.isPanning = true;
          this.lastPanX = e.clientX;
          this.lastPanY = e.clientY;
        }
      } else if (this.pointers.size === 2) {
        // Bắt đầu 2 ngón tay Pinch-to-zoom
        this.isPanning = false;
        this.isDraggingBlock = false;
        const pts = Array.from(this.pointers.values());
        this.initialPinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this.initialPinchScale = this.scale;

        const rect = this.canvas.getBoundingClientRect();
        this.pinchCenter = {
          x: ((pts[0].x + pts[1].x) / 2) - rect.left,
          y: ((pts[0].y + pts[1].y) / 2) - rect.top
        };
      }
      this.requestRender();
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pointers.size === 1) {
        const start = this.pointerStartPos.get(e.pointerId);
        const movedDist = Math.hypot(e.clientX - start.x, e.clientY - start.y);

        if (this.isDraggingBlock && this.selectedBlock && this.isEditMode) {
          // Kéo di chuyển block trong Edit mode
          const coords = this.getCanvasCoords(e.clientX, e.clientY);
          let newX = coords.x - this.dragOffset.x;
          let newY = coords.y - this.dragOffset.y;

          if (this.snapToGrid) {
            newX = Math.round(newX / this.gridSize) * this.gridSize;
            newY = Math.round(newY / this.gridSize) * this.gridSize;
          }

          this.selectedBlock.x = newX;
          this.selectedBlock.y = newY;
          this.requestRender();
        } else if (this.isPanning && movedDist > 4) {
          // Kéo di chuyển toàn bộ bản đồ
          const dx = e.clientX - this.lastPanX;
          const dy = e.clientY - this.lastPanY;
          this.panX += dx;
          this.panY += dy;
          this.lastPanX = e.clientX;
          this.lastPanY = e.clientY;
          this.requestRender();
        }
      } else if (this.pointers.size === 2) {
        // Pinch-to-zoom
        const pts = Array.from(this.pointers.values());
        const currentDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);

        if (this.initialPinchDistance > 10) {
          const factor = currentDistance / this.initialPinchDistance;
          const targetScale = Math.max(this.minScale, Math.min(this.maxScale, this.initialPinchScale * factor));

          // Zoom quanh tâm của hai ngón tay
          const mouseX = this.pinchCenter.x;
          const mouseY = this.pinchCenter.y;

          this.panX = mouseX - (mouseX - this.panX) * (targetScale / this.scale);
          this.panY = mouseY - (mouseY - this.panY) * (targetScale / this.scale);
          this.scale = targetScale;
          this.requestRender();
        }
      }
    });

    const onPointerEnd = (e) => {
      if (this.pointers.has(e.pointerId)) {
        const start = this.pointerStartPos.get(e.pointerId);
        const duration = performance.now() - this.pointerStartTime;
        const movedDist = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) : 999;

        // XỬ LÝ CHÍNH XÁC SINGLE TAP (Bấm chọn chuồng)
        if (this.pointers.size === 1 && movedDist < 8 && duration < 350) {
          const coords = this.getCanvasCoords(e.clientX, e.clientY);
          const hitBlock = this.findBlockAt(coords.x, coords.y);

          if (hitBlock) {
            this.selectedBlock = hitBlock;
            if (hitBlock.block_type === 'PEN' && hitBlock.pen_id) {
              if (window.onSelectPenBlock) {
                window.onSelectPenBlock(hitBlock.pen_id);
              }
            }
          } else {
            this.selectedBlock = null;
            if (window.onDeselectBlock) window.onDeselectBlock();
          }
        }

        if (this.isDraggingBlock && this.isEditMode) {
          this.db.saveFarmMap(this.mapData);
        }

        this.pointers.delete(e.pointerId);
        this.pointerStartPos.delete(e.pointerId);
      }

      if (this.pointers.size === 0) {
        this.isPanning = false;
        this.isDraggingBlock = false;
      }
      this.requestRender();
    };

    this.canvas.addEventListener('pointerup', onPointerEnd);
    this.canvas.addEventListener('pointercancel', onPointerEnd);

    // Zoom qua con lăn chuột trên desktop
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * zoomFactor));
      this.panX = mouseX - (mouseX - this.panX) * (newScale / this.scale);
      this.panY = mouseY - (mouseY - this.panY) * (newScale / this.scale);
      this.scale = newScale;

      this.requestRender();
    }, { passive: false });
  }

  getCanvasCoords(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return {
      x: (x - this.panX) / this.scale,
      y: (y - this.panY) / this.scale
    };
  }

  findBlockAt(x, y) {
    const blocks = this.mapData.blocks || [];
    // Ưu tiên kiểm tra PEN trước, sau đó PATH, ZONE sau cùng
    const pens = blocks.filter(b => b.block_type === 'PEN');
    const others = blocks.filter(b => b.block_type !== 'PEN' && b.block_type !== 'ZONE');
    const zones = blocks.filter(b => b.block_type === 'ZONE');

    const checkList = [...pens.reverse(), ...others.reverse(), ...zones.reverse()];

    for (const b of checkList) {
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
        return b;
      }
    }
    return null;
  }

  // --- RENDER VẼ CANVAS ---
  render() {
    const w = this.viewWidth || 360;
    const h = this.viewHeight || 420;
    this.ctx.clearRect(0, 0, w, h);

    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.scale, this.scale);

    // 1. Vẽ lưới (chỉ vẽ khi zoom đủ lớn để không làm chậm trên mobile)
    if (this.scale > 0.45) {
      this.drawGrid();
    }

    // 2. Vẽ các block theo thứ tự: ZONE -> PATH -> PEN
    const blocks = this.mapData.blocks || [];
    const zones = blocks.filter(b => b.block_type === 'ZONE');
    const paths = blocks.filter(b => b.block_type === 'PATH');
    const pens = blocks.filter(b => b.block_type === 'PEN');

    zones.forEach(b => this.drawBlock(b));
    paths.forEach(b => this.drawBlock(b));
    pens.forEach(b => this.drawBlock(b));

    // 3. Highlight block đang chọn
    if (this.selectedBlock) {
      this.ctx.strokeStyle = '#1b6c80';
      this.ctx.lineWidth = 2.5 / this.scale;
      this.ctx.setLineDash([4, 2]);
      this.ctx.strokeRect(
        this.selectedBlock.x - 3,
        this.selectedBlock.y - 3,
        this.selectedBlock.width + 6,
        this.selectedBlock.height + 6
      );
      this.ctx.setLineDash([]);
    }

    this.ctx.restore();
  }

  drawGrid() {
    const startX = -600;
    const endX = 2400;
    const startY = -400;
    const endY = 2000;

    this.ctx.strokeStyle = '#e8eaec';
    this.ctx.lineWidth = 1 / this.scale;

    this.ctx.beginPath();
    for (let x = startX; x <= endX; x += this.gridSize * 2) {
      this.ctx.moveTo(x, startY);
      this.ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += this.gridSize * 2) {
      this.ctx.moveTo(startX, y);
      this.ctx.lineTo(endX, y);
    }
    this.ctx.stroke();
  }

  drawBlock(b) {
    this.ctx.save();

    if (b.block_type === 'ZONE') {
      // Khu vực bao quanh
      this.ctx.fillStyle = b.color || '#f4f6f8';
      this.ctx.fillRect(b.x, b.y, b.width, b.height);
      this.ctx.strokeStyle = b.border || '#cbd2d6';
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(b.x, b.y, b.width, b.height);

      this.ctx.fillStyle = '#5d6166';
      this.ctx.font = '600 13px "IBM Plex Sans", sans-serif';
      this.ctx.fillText(b.zone_name || 'KHU VỰC', b.x + 12, b.y + 22);
    } else if (b.block_type === 'PATH') {
      // Lối đi
      this.ctx.fillStyle = '#f0f2f5';
      this.ctx.fillRect(b.x, b.y, b.width, b.height);
      this.ctx.strokeStyle = '#cbcfd4';
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([4, 4]);
      this.ctx.strokeRect(b.x, b.y, b.width, b.height);
      this.ctx.setLineDash([]);

      this.ctx.fillStyle = '#858990';
      this.ctx.font = '12px "IBM Plex Sans", sans-serif';
      this.ctx.fillText(b.label || 'Lối Đi', b.x + 10, b.y + 20);
    } else if (b.block_type === 'PEN') {
      // Ô Chuồng nuôi
      const pen = this.db.getPenById(b.pen_id);
      const animalsInPen = pen ? this.db.getAnimalsInPen(pen.id) : [];

      let bgColor = '#ffffff';
      let borderColor = '#1e7b4f'; // Mặc định xanh lá
      let statusLabel = 'Đang nuôi';
      let headerBg = '#1e7b4f';

      if (pen) {
        if (pen.status === 'BREEDING') {
          bgColor = '#ffffff';
          borderColor = '#2f70bb'; // Xanh dương sinh sản
          headerBg = '#2f70bb';
          statusLabel = 'Sinh sản';
        } else if (pen.status === 'QUARANTINE') {
          bgColor = '#fff5f5';
          borderColor = '#c4242a'; // Đỏ nhạt cách ly
          headerBg = '#c4242a';
          statusLabel = 'Cách ly';
        } else if (pen.status === 'EMPTY' || animalsInPen.length === 0) {
          bgColor = '#f9fbfc';
          borderColor = '#858990'; // Xám chuồng trống
          headerBg = '#858990';
          statusLabel = 'Trống';
        }
      }

      // Làm mờ chuồng nếu có áp dụng bộ lọc khu vực và chuồng không thuộc khu đó
      if (this.activeZoneFilter !== 'ALL' && pen && pen.zone_id !== this.activeZoneFilter) {
        this.ctx.globalAlpha = 0.25;
      }

      // Nền và viền
      this.ctx.fillStyle = bgColor;
      this.ctx.fillRect(b.x, b.y, b.width, b.height);
      this.ctx.strokeStyle = borderColor;
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(b.x, b.y, b.width, b.height);

      // Header chuồng
      this.ctx.fillStyle = headerBg;
      this.ctx.fillRect(b.x, b.y, b.width, 24);

      // Mã chuồng (Monospace)
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = '600 12px "IBM Plex Mono", monospace';
      this.ctx.fillText(`Chuồng ${b.pen_code || (pen ? pen.pen_code : 'N/A')}`, b.x + 8, b.y + 16);

      // Số lượng cá thể
      this.ctx.fillStyle = '#131416';
      this.ctx.font = '500 14px "IBM Plex Sans", sans-serif';
      const countStr = `${animalsInPen.length}/${pen ? pen.capacity : '?'} con`;
      this.ctx.fillText(countStr, b.x + 10, b.y + 54);

      // Trạng thái kèm nhãn văn bản rõ ràng
      this.ctx.fillStyle = borderColor;
      this.ctx.font = '500 11px "IBM Plex Sans", sans-serif';
      this.ctx.fillText(statusLabel, b.x + 10, b.y + b.height - 12);
    }

    this.ctx.restore();
  }

  // --- HÀNH ĐỘNG ĐIỀU KHIỂN & CHẾ ĐỘ ---

  // Bật/tắt chế độ sửa có kiểm tra quyền người dùng
  toggleEditMode() {
    if (!this.db.canEditMap()) {
      alert('Quyền bị từ chối: Chỉ Quản lý (Manager) và Quản trị viên (Admin) mới có quyền chỉnh sửa vị trí sơ đồ chuồng.');
      return false;
    }
    this.isEditMode = !this.isEditMode;
    this.requestRender();
    return this.isEditMode;
  }

  zoomIn() {
    this.scale = Math.min(this.maxScale, this.scale * 1.25);
    this.requestRender();
  }

  zoomOut() {
    this.scale = Math.max(this.minScale, this.scale / 1.25);
    this.requestRender();
  }

  resetView() {
    this.scale = 1;
    this.panX = 20;
    this.panY = 20;
    this.requestRender();
  }

  // Tự động căn chỉnh vừa khung nhìn màn hình điện thoại
  fitToScreen() {
    const blocks = this.mapData.blocks || [];
    if (blocks.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    blocks.forEach(b => {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    });

    const contentW = maxX - minX + 60;
    const contentH = maxY - minY + 60;

    const viewW = this.viewWidth || 360;
    const viewH = this.viewHeight || 420;

    const scaleX = viewW / contentW;
    const scaleY = viewH / contentH;
    this.scale = Math.max(this.minScale, Math.min(1.2, Math.min(scaleX, scaleY)));

    this.panX = (viewW - (maxX + minX) * this.scale) / 2;
    this.panY = (viewH - (maxY + minY) * this.scale) / 2;

    this.requestRender();
  }

  setZoneFilter(zoneId) {
    this.activeZoneFilter = zoneId;
    this.requestRender();
  }

  addBlock(blockType) {
    if (!this.isEditMode) {
      alert('Vui lòng bật Chế độ chỉnh sửa trước khi thêm khối!');
      return;
    }

    const id = 'blk-' + Date.now();
    const coords = this.getCanvasCoords(this.viewWidth / 2, this.viewHeight / 2);

    let newBlock = {
      id,
      block_type: blockType,
      x: Math.round(coords.x / this.gridSize) * this.gridSize,
      y: Math.round(coords.y / this.gridSize) * this.gridSize,
      width: blockType === 'ZONE' ? 320 : (blockType === 'PATH' ? 80 : 120),
      height: blockType === 'ZONE' ? 260 : (blockType === 'PATH' ? 300 : 120)
    };

    if (blockType === 'PEN') {
      newBlock.pen_code = 'M' + Math.floor(Math.random() * 90 + 10);
      newBlock.label = 'Chuồng ' + newBlock.pen_code;
    } else if (blockType === 'ZONE') {
      newBlock.zone_name = 'KHU MỚI TẠO';
      newBlock.color = '#f4f6f8';
      newBlock.border = '#cbd2d6';
    } else if (blockType === 'PATH') {
      newBlock.label = 'Lối đi';
    }

    this.mapData.blocks.push(newBlock);
    this.selectedBlock = newBlock;
    this.db.saveFarmMap(this.mapData);
    this.requestRender();
  }

  deleteSelectedBlock() {
    if (!this.isEditMode) {
      alert('Vui lòng bật Chế độ chỉnh sửa trước khi xóa khối!');
      return;
    }
    if (!this.selectedBlock) return;
    this.mapData.blocks = this.mapData.blocks.filter(b => b.id !== this.selectedBlock.id);
    this.selectedBlock = null;
    this.db.saveFarmMap(this.mapData);
    this.requestRender();
    if (window.onDeselectBlock) window.onDeselectBlock();
  }

  exportPNG() {
    const link = document.createElement('a');
    link.download = `Farm_Map_${Date.now()}.png`;
    link.href = this.canvas.toDataURL('image/png');
    link.click();
  }
}

window.FarmMapEditor = FarmMapEditor;
