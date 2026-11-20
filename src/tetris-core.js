(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TetrisCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const ROWS = 20;
  const COLS = 10;
  const EMPTY_COLOR = '#111827';
  const PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

  const STATUS = Object.freeze({
    READY: 'READY',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAME_OVER: 'GAME_OVER',
  });

  const COLORS = Object.freeze({
    EMPTY: EMPTY_COLOR,
    I: '#06B6D4',
    O: '#FACC15',
    T: '#A855F7',
    S: '#22C55E',
    Z: '#EF4444',
    J: '#3B82F6',
    L: '#F97316',
  });

  const GHOST_COLORS = Object.freeze({
    I: '#164E63',
    O: '#713F12',
    T: '#4C1D95',
    S: '#14532D',
    Z: '#7F1D1D',
    J: '#1E3A8A',
    L: '#7C2D12',
  });

  // SRS rotation states (0=spawn, 1=R/CW, 2=180, 3=L/CCW)
  // Each cell is [x, y] relative to the piece origin in screen coordinates (+y down).
  const SHAPES = Object.freeze({
    I: [
      [[0, 1], [1, 1], [2, 1], [3, 1]],
      [[2, 0], [2, 1], [2, 2], [2, 3]],
      [[0, 2], [1, 2], [2, 2], [3, 2]],
      [[1, 0], [1, 1], [1, 2], [1, 3]],
    ],
    O: [
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
    ],
    T: [
      [[1, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [1, 2]],
      [[1, 0], [0, 1], [1, 1], [1, 2]],
    ],
    S: [
      [[1, 0], [2, 0], [0, 1], [1, 1]],
      [[1, 0], [1, 1], [2, 1], [2, 2]],
      [[1, 1], [2, 1], [0, 2], [1, 2]],
      [[0, 0], [0, 1], [1, 1], [1, 2]],
    ],
    Z: [
      [[0, 0], [1, 0], [1, 1], [2, 1]],
      [[2, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [1, 2], [2, 2]],
      [[1, 0], [0, 1], [1, 1], [0, 2]],
    ],
    J: [
      [[0, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [2, 2]],
      [[1, 0], [1, 1], [0, 2], [1, 2]],
    ],
    L: [
      [[2, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 2]],
      [[0, 1], [1, 1], [2, 1], [0, 2]],
      [[0, 0], [1, 0], [1, 1], [1, 2]],
    ],
  });

  // SRS wall kick tables converted to screen coordinates (+y down).
  const JLSTZ_KICKS = Object.freeze({
    '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  });

  const I_KICKS = Object.freeze({
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  });

  const LINE_CLEAR_POINTS = Object.freeze([0, 100, 300, 500, 800]);
  const LINE_CLEAR_LABELS = Object.freeze(['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS']);

  function createEmptyBoard() {
    const board = [];
    for (let r = 0; r < ROWS; r++) {
      board.push(new Array(COLS).fill(null));
    }
    return board;
  }

  function createPreviewGrid(type) {
    const grid = [];
    for (let r = 0; r < 4; r++) {
      grid.push(new Array(4).fill(EMPTY_COLOR));
    }
    if (!type || !SHAPES[type]) {
      return grid;
    }
    const color = COLORS[type];
    const cells = SHAPES[type][0];
    // Center pieces nicely inside the 4x4 preview box.
    const yOffset = type === 'I' ? 0 : 1;
    for (let i = 0; i < cells.length; i++) {
      const cx = cells[i][0];
      const cy = cells[i][1] + yOffset;
      if (cy >= 0 && cy < 4 && cx >= 0 && cx < 4) {
        grid[cy][cx] = color;
      }
    }
    return grid;
  }

  function getGravityIntervalForLevel(level) {
    const lvl = Math.max(1, level | 0);
    // Smooth guideline-inspired gravity curve in ms (800ms at L1 down to 80ms at L15+).
    const ms = Math.round(800 * Math.pow(0.84, lvl - 1));
    return Math.max(80, ms);
  }

  class TetrisGame {
    constructor(options) {
      const opts = options || {};
      this._rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
      this._lockDelayMs = typeof opts.lockDelayMs === 'number' ? opts.lockDelayMs : 500;
      this._maxLockResets = typeof opts.maxLockResets === 'number' ? opts.maxLockResets : 15;

      this._initEmptyState();
    }

    _initEmptyState() {
      this.board = createEmptyBoard();
      this.score = 0;
      this.level = 1;
      this.lines = 0;
      this.status = STATUS.READY;
      this.lastClear = '';

      this.bag = [];
      this.active = null;
      this.nextType = null;
      this.holdType = null;
      this.canHold = true;

      this.gravityTimer = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
    }

    _refillBag() {
      const bag = PIECE_TYPES.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this._rng() * (i + 1));
        const tmp = bag[i];
        bag[i] = bag[j];
        bag[j] = tmp;
      }
      this.bag.push.apply(this.bag, bag);
    }

    _drawPieceType() {
      if (this.bag.length === 0) {
        this._refillBag();
      }
      return this.bag.shift();
    }

    _createPiece(type) {
      return {
        type: type,
        rotation: 0,
        x: 3,
        y: type === 'I' ? -1 : 0,
      };
    }

    _getCells(piece, rotation, x, y) {
      const rot = rotation !== undefined ? rotation : piece.rotation;
      const px = x !== undefined ? x : piece.x;
      const py = y !== undefined ? y : piece.y;
      const shape = SHAPES[piece.type][rot];
      const result = [];
      for (let i = 0; i < shape.length; i++) {
        result.push([px + shape[i][0], py + shape[i][1]]);
      }
      return result;
    }

    _isValidPosition(piece, rotation, x, y) {
      const cells = this._getCells(piece, rotation, x, y);
      for (let i = 0; i < cells.length; i++) {
        const cx = cells[i][0];
        const cy = cells[i][1];
        if (cx < 0 || cx >= COLS || cy >= ROWS) {
          return false;
        }
        if (cy >= 0 && this.board[cy][cx] !== null) {
          return false;
        }
      }
      return true;
    }

    _isGrounded() {
      if (!this.active) return false;
      return !this._isValidPosition(this.active, this.active.rotation, this.active.x, this.active.y + 1);
    }

    _resetLockDelayOnMove() {
      if (this._isGrounded() && this.lockResets < this._maxLockResets) {
        this.lockTimer = 0;
        this.lockResets++;
      }
    }

    _spawnNextPiece(forcedType) {
      const type = forcedType || this.nextType || this._drawPieceType();
      if (!forcedType) {
        this.nextType = this._drawPieceType();
      }
      const piece = this._createPiece(type);
      this.gravityTimer = 0;
      this.lockTimer = 0;
      this.lockResets = 0;

      if (!this._isValidPosition(piece, piece.rotation, piece.x, piece.y)) {
        this.active = piece;
        this.status = STATUS.GAME_OVER;
        return false;
      }

      this.active = piece;
      return true;
    }

    start() {
      this._initEmptyState();
      this.status = STATUS.PLAYING;
      this.nextType = this._drawPieceType();
      this._spawnNextPiece();
      return this;
    }

    restart() {
      return this.start();
    }

    pause() {
      if (this.status === STATUS.PLAYING) {
        this.status = STATUS.PAUSED;
        return true;
      }
      return false;
    }

    resume() {
      if (this.status === STATUS.PAUSED) {
        this.status = STATUS.PLAYING;
        return true;
      }
      return false;
    }

    togglePause() {
      if (this.status === STATUS.PLAYING) {
        this.status = STATUS.PAUSED;
        return true;
      }
      if (this.status === STATUS.PAUSED) {
        this.status = STATUS.PLAYING;
        return true;
      }
      return false;
    }

    getGravityInterval() {
      return getGravityIntervalForLevel(this.level);
    }

    moveLeft() {
      return this._moveHorizontal(-1);
    }

    moveRight() {
      return this._moveHorizontal(1);
    }

    _moveHorizontal(dx) {
      if (this.status !== STATUS.PLAYING || !this.active) return false;
      const nx = this.active.x + dx;
      if (this._isValidPosition(this.active, this.active.rotation, nx, this.active.y)) {
        this.active.x = nx;
        this._resetLockDelayOnMove();
        return true;
      }
      return false;
    }

    rotateCW() {
      return this.rotate(1);
    }

    rotateCCW() {
      return this.rotate(-1);
    }

    rotate(dir) {
      if (this.status !== STATUS.PLAYING || !this.active) return false;
      const step = dir >= 0 ? 1 : -1;
      const from = this.active.rotation;
      const to = (from + step + 4) % 4;

      if (this.active.type === 'O') {
        this.active.rotation = to;
        return true;
      }

      const key = from + '>' + to;
      const kicks = this.active.type === 'I' ? I_KICKS[key] : JLSTZ_KICKS[key];
      for (let i = 0; i < kicks.length; i++) {
        const kx = kicks[i][0];
        const ky = kicks[i][1];
        const nx = this.active.x + kx;
        const ny = this.active.y + ky;
        if (this._isValidPosition(this.active, to, nx, ny)) {
          this.active.rotation = to;
          this.active.x = nx;
          this.active.y = ny;
          this._resetLockDelayOnMove();
          return true;
        }
      }
      return false;
    }

    softDrop() {
      if (this.status !== STATUS.PLAYING || !this.active) return false;
      if (this._isValidPosition(this.active, this.active.rotation, this.active.x, this.active.y + 1)) {
        this.active.y += 1;
        this.score += 1;
        this.gravityTimer = 0;
        if (!this._isGrounded()) {
          this.lockTimer = 0;
        }
        return true;
      }
      return false;
    }

    hardDrop() {
      if (this.status !== STATUS.PLAYING || !this.active) {
        return { dropped: 0, locked: false, clearedLines: 0 };
      }
      const ghostY = this.getGhostY();
      const dropped = Math.max(0, ghostY - this.active.y);
      this.active.y = ghostY;
      this.score += dropped * 2;
      const clearedLines = this._lockActivePiece();
      return { dropped: dropped, locked: true, clearedLines: clearedLines };
    }

    hold() {
      if (this.status !== STATUS.PLAYING || !this.active || !this.canHold) {
        return false;
      }
      const currentType = this.active.type;
      this.canHold = false;

      if (this.holdType === null) {
        this.holdType = currentType;
        this._spawnNextPiece();
      } else {
        const swapType = this.holdType;
        this.holdType = currentType;
        this._spawnNextPiece(swapType);
      }
      return true;
    }

    _lockActivePiece() {
      if (!this.active) return 0;
      const cells = this._getCells(this.active);
      let anyVisible = false;
      for (let i = 0; i < cells.length; i++) {
        const cx = cells[i][0];
        const cy = cells[i][1];
        if (cy >= 0 && cy < ROWS && cx >= 0 && cx < COLS) {
          this.board[cy][cx] = this.active.type;
          anyVisible = true;
        }
      }

      if (!anyVisible) {
        this.status = STATUS.GAME_OVER;
        return 0;
      }

      const cleared = this._clearFullLines();
      if (cleared > 0) {
        this.lines += cleared;
        this.score += LINE_CLEAR_POINTS[cleared] * this.level;
        this.level = Math.floor(this.lines / 10) + 1;
        this.lastClear = LINE_CLEAR_LABELS[cleared];
      } else {
        this.lastClear = '';
      }

      this.canHold = true;
      this._spawnNextPiece();
      return cleared;
    }

    _clearFullLines() {
      let cleared = 0;
      const remaining = [];
      for (let r = 0; r < ROWS; r++) {
        let full = true;
        for (let c = 0; c < COLS; c++) {
          if (this.board[r][c] === null) {
            full = false;
            break;
          }
        }
        if (full) {
          cleared++;
        } else {
          remaining.push(this.board[r]);
        }
      }
      while (remaining.length < ROWS) {
        remaining.unshift(new Array(COLS).fill(null));
      }
      this.board = remaining;
      return cleared;
    }

    stepGravity() {
      if (this.status !== STATUS.PLAYING || !this.active) return false;
      if (this._isValidPosition(this.active, this.active.rotation, this.active.x, this.active.y + 1)) {
        this.active.y += 1;
        if (!this._isGrounded()) {
          this.lockTimer = 0;
        }
        return true;
      }
      this._lockActivePiece();
      return false;
    }

    tick(dtMs) {
      if (this.status !== STATUS.PLAYING || !this.active) return false;

      // Discrete tick mode when called without dtMs
      if (typeof dtMs !== 'number') {
        this.stepGravity();
        return true;
      }

      if (dtMs <= 0) return false;

      let changed = false;

      if (this._isGrounded()) {
        this.lockTimer += dtMs;
        if (this.lockTimer >= this._lockDelayMs) {
          this._lockActivePiece();
          changed = true;
        }
        return changed;
      }

      this.gravityTimer += dtMs;
      const interval = this.getGravityInterval();
      while (this.gravityTimer >= interval && this.status === STATUS.PLAYING && this.active) {
        this.gravityTimer -= interval;
        if (this._isValidPosition(this.active, this.active.rotation, this.active.x, this.active.y + 1)) {
          this.active.y += 1;
          changed = true;
          if (this._isGrounded()) {
            // Piece just landed; start lock delay on next ticks with remaining dt.
            this.gravityTimer = 0;
            break;
          }
        } else {
          break;
        }
      }
      return changed;
    }

    getGhostY() {
      if (!this.active) return 0;
      let gy = this.active.y;
      while (this._isValidPosition(this.active, this.active.rotation, this.active.x, gy + 1)) {
        gy++;
      }
      return gy;
    }

    getRenderPayload() {
      const boardColors = [];
      for (let r = 0; r < ROWS; r++) {
        const row = new Array(COLS);
        for (let c = 0; c < COLS; c++) {
          const cell = this.board[r][c];
          row[c] = cell ? COLORS[cell] : EMPTY_COLOR;
        }
        boardColors.push(row);
      }

      if (this.active && this.status !== STATUS.READY) {
        // Draw ghost piece first so active piece renders on top.
        if (this.status === STATUS.PLAYING || this.status === STATUS.PAUSED) {
          const ghostY = this.getGhostY();
          const ghostCells = this._getCells(this.active, this.active.rotation, this.active.x, ghostY);
          const ghostColor = GHOST_COLORS[this.active.type];
          for (let i = 0; i < ghostCells.length; i++) {
            const gx = ghostCells[i][0];
            const gy = ghostCells[i][1];
            if (gy >= 0 && gy < ROWS && gx >= 0 && gx < COLS) {
              boardColors[gy][gx] = ghostColor;
            }
          }
        }

        // Draw active piece.
        const activeCells = this._getCells(this.active);
        const activeColor = COLORS[this.active.type];
        for (let i = 0; i < activeCells.length; i++) {
          const ax = activeCells[i][0];
          const ay = activeCells[i][1];
          if (ay >= 0 && ay < ROWS && ax >= 0 && ax < COLS) {
            boardColors[ay][ax] = activeColor;
          }
        }
      }

      return {
        boardColors: boardColors,
        nextColors: createPreviewGrid(this.nextType),
        holdColors: createPreviewGrid(this.holdType),
        hud: {
          score: this.score,
          level: this.level,
          lines: this.lines,
          status: this.status,
          lastClear: this.lastClear,
        },
      };
    }

    getState() {
      return {
        score: this.score,
        level: this.level,
        lines: this.lines,
        status: this.status,
        lastClear: this.lastClear,
        active: this.active ? Object.assign({}, this.active) : null,
        ghostY: this.active ? this.getGhostY() : null,
        nextType: this.nextType,
        holdType: this.holdType,
        canHold: this.canHold,
        gravityInterval: this.getGravityInterval(),
      };
    }
  }

  function createGame(options) {
    return new TetrisGame(options);
  }

  return {
    ROWS: ROWS,
    COLS: COLS,
    EMPTY_COLOR: EMPTY_COLOR,
    PIECE_TYPES: PIECE_TYPES.slice(),
    STATUS: STATUS,
    COLORS: COLORS,
    GHOST_COLORS: GHOST_COLORS,
    SHAPES: SHAPES,
    getGravityIntervalForLevel: getGravityIntervalForLevel,
    createPreviewGrid: createPreviewGrid,
    TetrisGame: TetrisGame,
    createGame: createGame,
  };
});
