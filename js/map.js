/**
 * Module Bản Đồ Trang Trại 2D (Farm Map 2D Canvas Editor)
 * Tuân thủ yêu cầu 01_PRODUCT_REQUIREMENTS.md:
 * - Canvas 2D có pan/zoom, Grid và Free canvas.
 * - Blocks: PEN, PATH, ZONE, STORAGE, NOTE.
 * - Kéo thả, click chọn block chuồng để xem chi tiết chuồng và danh sách cá thể.
 * - Pen identity không phụ thuộc tọa độ bản đồ. Di chuyển chuồng không làm đổi vị trí dúi.
 * - Lưu revision, export JSON và PNG.
 */

class FarmMapEditor {
  constructor(canvasId, db) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.db = db;

    // Viewport transform
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;

    // Settings
    this.gridSize = 20;
    this.snapToGrid = true;
    this.isFreeMode = false;

    // Interaction state
    this.isPanning = false;
    this.isDraggingBlock = false;
    this.isResizingBlock = false;
    this.startX = 0;
    this.startY = 0;
    this.selectedBlock = null;

    // Dữ liệu bản đồ
    this.mapData = this.db.getFarmMap();

    this.initEvents();
    this.resizeCanvas();
    this.render();
  }

  resizeCanvas() {
    const parent = this.canvas.parentElement;
    if (parent) {
      this.canvas.width = parent.clientWidth || 900;
      this.canvas.height = parent.clientHeight || 600;
    }
  }

  initEvents() {
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.render();
    });

    // Zoom qua con lăn chuột
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const mouseX = e.offsetX;
      const mouseY = e.offsetY;

      const newScale = Math.max(0.3, Math.min(3.0, this.scale * zoomFactor));
      this.panX = mouseX - (mouseX - this.panX) * (newScale / this.scale);
      this.panY = mouseY - (mouseY - this.panY) * (newScale / this.scale);
      this.scale = newScale;

      this.render();
    });

    // Mousedown
    this.canvas.addEventListener('mousedown', (e) => {
      const mouse = this.getCanvasCoords(e);
      this.startX = e.offsetX;
      this.startY = e.offsetY;

      // Tìm xem có click trúng block nào không (duyệt từ trên xuống dưới layer)
      const hitBlock = this.findBlockAt(mouse.x, mouse.y);

      if (hitBlock) {
        this.selectedBlock = hitBlock;
        this.isDraggingBlock = true;
        this.dragOffset = {
          x: mouse.x - hitBlock.x,
          y: mouse.y - hitBlock.y
        };

        // Nếu là block PEN, phát sự kiện để UI hiển thị thông tin
        if (hitBlock.block_type === 'PEN' && hitBlock.pen_id) {
          if (window.onSelectPenBlock) {
            window.onSelectPenBlock(hitBlock.pen_id);
          }
        }
      } else {
        // Click ra ngoài -> Pan bản đồ
        this.selectedBlock = null;
        this.isPanning = true;
        if (window.onDeselectBlock) window.onDeselectBlock();
      }
      this.render();
    });

    // Mousemove
    this.canvas.addEventListener('mousemove', (e) => {
      const mouse = this.getCanvasCoords(e);

      if (this.isPanning) {
        this.panX += e.offsetX - this.startX;
        this.panY += e.offsetY - this.startY;
        this.startX = e.offsetX;
        this.startY = e.offsetY;
        this.render();
      } else if (this.isDraggingBlock && this.selectedBlock) {
        let newX = mouse.x - this.dragOffset.x;
        let newY = mouse.y - this.dragOffset.y;

        if (this.snapToGrid && !this.isFreeMode) {
          newX = Math.round(newX / this.gridSize) * this.gridSize;
          newY = Math.round(newY / this.gridSize) * this.gridSize;
        }

        this.selectedBlock.x = newX;
        this.selectedBlock.y = newY;
        this.render();
      } else {
        // Thay đổi con trỏ chuột
        const hoverBlock = this.findBlockAt(mouse.x, mouse.y);
        this.canvas.style.cursor = hoverBlock ? (hoverBlock.block_type === 'PEN' ? 'pointer' : 'move') : 'default';
      }
    });

    // Mouseup
    window.addEventListener('mouseup', () => {
      if (this.isDraggingBlock) {
        this.isDraggingBlock = false;
        this.db.saveFarmMap(this.mapData);
      }
      this.isPanning = false;
    });
  }

  getCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    return {
      x: (clientX - this.panX) / this.scale,
      y: (clientY - this.panY) / this.scale
    };
  }

  findBlockAt(x, y) {
    const blocks = this.mapData.blocks || [];
    // Ưu tiên chọn PEN trước, sau đó PATH, ZONE sau cùng
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
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.scale, this.scale);

    // 1. Vẽ lưới (Grid) nếu được bật
    if (this.snapToGrid && !this.isFreeMode) {
      this.drawGrid();
    }

    // 2. Vẽ các block theo thứ tự: ZONE -> PATH -> PEN / NOTE
    const blocks = this.mapData.blocks || [];
    const zones = blocks.filter(b => b.block_type === 'ZONE');
    const paths = blocks.filter(b => b.block_type === 'PATH');
    const pensAndOthers = blocks.filter(b => b.block_type !== 'ZONE' && b.block_type !== 'PATH');

    zones.forEach(b => this.drawBlock(b));
    paths.forEach(b => this.drawBlock(b));
    pensAndOthers.forEach(b => this.drawBlock(b));

    // 3. Vẽ đường viền highlight block đang chọn
    if (this.selectedBlock) {
      this.ctx.strokeStyle = '#1b6c80';
      this.ctx.lineWidth = 2 / this.scale;
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
    const startX = -1000;
    const endX = 3000;
    const startY = -1000;
    const endY = 3000;

    this.ctx.strokeStyle = '#e2e8f0';
    this.ctx.lineWidth = 1 / this.scale;

    this.ctx.beginPath();
    for (let x = startX; x <= endX; x += this.gridSize) {
      this.ctx.moveTo(x, startY);
      this.ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += this.gridSize) {
      this.ctx.moveTo(startX, y);
      this.ctx.lineTo(endX, y);
    }
    this.ctx.stroke();
  }

  drawBlock(b) {
    this.ctx.save();

    if (b.block_type === 'ZONE') {
      // Khu vực bao quanh
      this.ctx.fillStyle = b.color || '#f8fafc';
      this.ctx.fillRect(b.x, b.y, b.width, b.height);
      this.ctx.strokeStyle = b.border || '#cbd5e1';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(b.x, b.y, b.width, b.height);

      // Nhãn khu vực
      this.ctx.fillStyle = '#475569';
      this.ctx.font = 'bold 14px Inter, sans-serif';
      this.ctx.fillText(b.zone_name || 'KHU VỰC', b.x + 12, b.y + 24);
    } else if (b.block_type === 'PATH') {
      // Lối đi
      this.ctx.fillStyle = '#f1f5f9';
      this.ctx.fillRect(b.x, b.y, b.width, b.height);
      this.ctx.strokeStyle = '#94a3b8';
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([4, 4]);
      this.ctx.strokeRect(b.x, b.y, b.width, b.height);
      this.ctx.setLineDash([]);

      this.ctx.fillStyle = '#64748b';
      this.ctx.font = 'italic 12px Inter, sans-serif';
      this.ctx.fillText(b.label || 'Lối Đi', b.x + 10, b.y + 20);
    } else if (b.block_type === 'PEN') {
      // Ô Chuồng nuôi
      const pen = this.db.getPenById(b.pen_id);
      const animalsInPen = pen ? this.db.getAnimalsInPen(pen.id) : [];

      // Màu sắc theo trạng thái chuồng (tuân thủ app sheet framed-sheet tokens)
      let bgColor = '#ffffff';
      let borderColor = '#1b6c80';
      let statusText = 'Hoạt động';

      if (pen) {
        if (pen.status === 'BREEDING') {
          bgColor = '#f4f6f8';
          borderColor = '#2f70bb';
          statusText = 'Sinh sản';
        } else if (pen.status === 'QUARANTINE') {
          bgColor = '#ffedea';
          borderColor = '#c4242a';
          statusText = 'Cách ly';
        } else if (pen.status === 'EMPTY' || animalsInPen.length === 0) {
          bgColor = '#f9fbfc';
          borderColor = '#cbcfd4';
          statusText = 'Trống';
        }
      }

      // Nền chuồng
      this.ctx.fillStyle = bgColor;
      this.ctx.fillRect(b.x, b.y, b.width, b.height);
      this.ctx.strokeStyle = borderColor;
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(b.x, b.y, b.width, b.height);

      // Header chuồng
      this.ctx.fillStyle = borderColor;
      this.ctx.fillRect(b.x, b.y, b.width, 24);

      // Mã chuồng (monospace font)
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = '500 11px "IBM Plex Mono", monospace';
      this.ctx.fillText(`Chuồng ${b.pen_code || (pen ? pen.pen_code : 'N/A')}`, b.x + 8, b.y + 16);

      // Nội dung chuồng: số lượng cá thể
      this.ctx.fillStyle = '#131416';
      this.ctx.font = '500 13px "IBM Plex Sans", sans-serif';
      const countStr = `${animalsInPen.length}/${pen ? pen.capacity : '?'} cá thể`;
      this.ctx.fillText(countStr, b.x + 10, b.y + 52);

      // Danh sách mã cá thể con
      this.ctx.fillStyle = '#5d6166';
      this.ctx.font = '11px "IBM Plex Mono", monospace';
      const codes = animalsInPen.map(a => a.animal_code).join(', ');
      this.ctx.fillText(codes ? codes.substring(0, 16) : '(Trống)', b.x + 10, b.y + 72);

      // Trạng thái nhỏ góc dưới
      this.ctx.fillStyle = borderColor;
      this.ctx.font = '11px "IBM Plex Sans", sans-serif';
      this.ctx.fillText(statusText, b.x + 10, b.y + b.height - 10);
    }

    this.ctx.restore();
  }

  // --- CÁC HÀNH ĐỘNG ĐIỀU KHIỂN ---
  setGridMode(enabled) {
    this.snapToGrid = enabled;
    this.isFreeMode = !enabled;
    this.render();
  }

  zoomIn() {
    this.scale = Math.min(3.0, this.scale * 1.2);
    this.render();
  }

  zoomOut() {
    this.scale = Math.max(0.3, this.scale / 1.2);
    this.render();
  }

  resetZoom() {
    this.scale = 1;
    this.panX = 20;
    this.panY = 20;
    this.render();
  }

  addBlock(blockType) {
    const id = 'blk-' + Date.now();
    let newBlock = {
      id,
      block_type: blockType,
      x: 100 - this.panX / this.scale,
      y: 100 - this.panY / this.scale,
      width: blockType === 'ZONE' ? 300 : (blockType === 'PATH' ? 80 : 120),
      height: blockType === 'ZONE' ? 240 : (blockType === 'PATH' ? 300 : 120)
    };

    if (blockType === 'PEN') {
      newBlock.pen_code = 'M' + Math.floor(Math.random() * 90 + 10);
      newBlock.label = 'Chuồng ' + newBlock.pen_code;
    } else if (blockType === 'ZONE') {
      newBlock.zone_name = 'KHU MỚI TẠO';
      newBlock.color = '#f8fafc';
      newBlock.border = '#94a3b8';
    } else if (blockType === 'PATH') {
      newBlock.label = 'Lối đi';
    }

    this.mapData.blocks.push(newBlock);
    this.selectedBlock = newBlock;
    this.db.saveFarmMap(this.mapData);
    this.render();
  }

  deleteSelectedBlock() {
    if (!this.selectedBlock) return;
    this.mapData.blocks = this.mapData.blocks.filter(b => b.id !== this.selectedBlock.id);
    this.selectedBlock = null;
    this.db.saveFarmMap(this.mapData);
    this.render();
  }

  exportPNG() {
    const link = document.createElement('a');
    link.download = `Farm_Map_${Date.now()}.png`;
    link.href = this.canvas.toDataURL('image/png');
    link.click();
  }
}

window.FarmMapEditor = FarmMapEditor;

