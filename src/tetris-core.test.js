'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const TetrisCore = require('./tetris-core.js');
const { TetrisGame, createGame, ROWS, COLS, EMPTY_COLOR, COLORS, GHOST_COLORS, PIECE_TYPES, STATUS } = TetrisCore;

function makeDeterministicRng(seed = 42) {
  let s = seed >>> 0;
  return function () {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

test('UMD/IIFE works in browser-like global without module.exports', () => {
  const code = fs.readFileSync(path.join(__dirname, 'tetris-core.js'), 'utf8');
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox);

  assert.ok(sandbox.TetrisCore, 'TetrisCore should attach to browser global');
  assert.equal(sandbox.TetrisCore.ROWS, 20);
  assert.equal(sandbox.TetrisCore.COLS, 10);
  const g = sandbox.TetrisCore.createGame({ rng: makeDeterministicRng(1) });
  g.start();
  const payload = g.getRenderPayload();
  assert.equal(payload.boardColors.length, 20);
  assert.equal(payload.boardColors[0].length, 10);
});

test('7-bag randomizer deals all 7 unique tetrominoes per bag', () => {
  const game = createGame({ rng: makeDeterministicRng(12345) });
  game.start();

  const seen = [game.active.type];
  for (let i = 0; i < 20; i++) {
    seen.push(game.nextType);
    // Advance without risking game over by clearing board each time
    game.board = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    game.hardDrop();
  }

  for (let bagIdx = 0; bagIdx < 3; bagIdx++) {
    const slice = seen.slice(bagIdx * 7, (bagIdx + 1) * 7);
    assert.equal(slice.length, 7);
    assert.deepEqual([...slice].sort(), [...PIECE_TYPES].sort());
  }
});

test('Horizontal movement respects walls and locked blocks', () => {
  const game = createGame({ rng: makeDeterministicRng(7) });
  game.start();
  // Force a T piece at x=3, y=2
  game.active = { type: 'T', rotation: 0, x: 3, y: 2 };

  // Move left until hitting left wall
  let moves = 0;
  while (game.moveLeft()) moves++;
  assert.equal(moves, 3);
  assert.equal(game.active.x, 0);
  assert.equal(game.moveLeft(), false);

  // Move right until hitting right wall (T width is 3, so max x is 7)
  moves = 0;
  while (game.moveRight()) moves++;
  assert.equal(moves, 7);
  assert.equal(game.active.x, 7);
  assert.equal(game.moveRight(), false);

  // Place a locked block to the left of T at (6, 3)
  game.board[3][6] = 'I';
  assert.equal(game.moveLeft(), false);
});

test('SRS rotation CW/CCW and wall kicks for JLSTZ and I pieces', () => {
  const game = createGame({ rng: makeDeterministicRng(11) });
  game.start();

  // T-piece full 360 CW and CCW
  game.active = { type: 'T', rotation: 0, x: 4, y: 5 };
  assert.equal(game.rotateCW(), true);
  assert.equal(game.active.rotation, 1);
  assert.equal(game.rotateCW(), true);
  assert.equal(game.active.rotation, 2);
  assert.equal(game.rotateCCW(), true);
  assert.equal(game.active.rotation, 1);
  assert.equal(game.rotateCCW(), true);
  assert.equal(game.active.rotation, 0);

  // T-piece wall kick off left wall: state 1 has cells at x+1, x+2 (empty col at x+0),
  // place at x=-1 so its left column is against wall x=0, then rotate CW to state 2 (needs x+0, x+1, x+2).
  // Kick should shift x from -1 to 0!
  game.active = { type: 'T', rotation: 1, x: -1, y: 5 };
  assert.equal(game.rotateCW(), true);
  assert.equal(game.active.rotation, 2);
  assert.equal(game.active.x, 0);

  // I-piece wall kick off right wall: state 1 is vertical at col x+2.
  // Place at x=7 so vertical bar is at col 9 (right wall), rotate CCW to state 0 (horizontal x+0..x+3).
  // Needs kick of -1 to x=6 so horizontal bar occupies cols 6..9.
  game.active = { type: 'I', rotation: 1, x: 7, y: 5 };
  assert.equal(game.rotateCCW(), true);
  assert.equal(game.active.rotation, 0);
  assert.equal(game.active.x, 6);

  // O-piece rotates in place without moving
  game.active = { type: 'O', rotation: 0, x: 3, y: 4 };
  assert.equal(game.rotateCW(), true);
  assert.equal(game.active.x, 3);
  assert.equal(game.active.y, 4);
});

test('Ghost piece projection and render payload colors', () => {
  const game = createGame({ rng: makeDeterministicRng(3) });
  game.start();
  game.active = { type: 'O', rotation: 0, x: 3, y: 0 };

  // Empty board: O occupies rows y and y+1, so ghostY should be 18 (rows 18, 19)
  assert.equal(game.getGhostY(), 18);

  let payload = game.getRenderPayload();
  assert.equal(payload.boardColors[0][4], COLORS.O);
  assert.equal(payload.boardColors[1][5], COLORS.O);
  assert.equal(payload.boardColors[18][4], GHOST_COLORS.O);
  assert.equal(payload.boardColors[19][5], GHOST_COLORS.O);
  assert.equal(payload.boardColors[10][0], EMPTY_COLOR);

  // Add a locked block at row 15, col 4 -> ghost should stop at y=13 (rows 13, 14)
  game.board[15][4] = 'Z';
  assert.equal(game.getGhostY(), 13);
  payload = game.getRenderPayload();
  assert.equal(payload.boardColors[13][4], GHOST_COLORS.O);
  assert.equal(payload.boardColors[15][4], COLORS.Z);
});

test('Hold piece works once per lock and swaps properly', () => {
  const game = createGame({ rng: makeDeterministicRng(99) });
  game.start();
  const firstType = game.active.type;
  const secondType = game.nextType;

  assert.equal(game.holdType, null);
  assert.equal(game.hold(), true);
  assert.equal(game.holdType, firstType);
  assert.equal(game.active.type, secondType);

  // Second hold before lock must fail
  assert.equal(game.hold(), false);
  assert.equal(game.holdType, firstType);

  // Hold preview grid should contain the held piece's color
  const payload = game.getRenderPayload();
  const holdFlat = payload.holdColors.flat();
  assert.equal(holdFlat.filter((c) => c === COLORS[firstType]).length, 4);

  // After locking, hold is enabled again and swaps active <-> hold
  game.hardDrop();
  const thirdType = game.active.type;
  assert.equal(game.hold(), true);
  assert.equal(game.active.type, firstType);
  assert.equal(game.holdType, thirdType);
  assert.equal(game.active.rotation, 0);
});

test('Soft drop, hard drop, and lock delay behavior', () => {
  const game = createGame({ rng: makeDeterministicRng(5), lockDelayMs: 500, maxLockResets: 2 });
  game.start();
  game.active = { type: 'O', rotation: 0, x: 3, y: 0 };

  // Soft drop awards +1 per row
  assert.equal(game.softDrop(), true);
  assert.equal(game.active.y, 1);
  assert.equal(game.score, 1);

  // Hard drop from y=1 to y=18 -> distance 17 -> +34 score -> total 35
  const res = game.hardDrop();
  assert.equal(res.dropped, 17);
  assert.equal(res.locked, true);
  assert.equal(game.score, 35);
  assert.equal(game.board[19][4], 'O');
  assert.equal(game.board[18][5], 'O');

  // Lock delay test: place active O grounded at y=16 (above locked O at 18..19)
  game.active = { type: 'O', rotation: 0, x: 3, y: 16 };
  game.lockTimer = 0;
  game.lockResets = 0;

  // 300ms < 500ms -> should not lock yet
  game.tick(300);
  assert.equal(game.board[16][4], null);

  // Moving left resets lock timer (reset #1)
  assert.equal(game.moveLeft(), true);
  // Move back right over the stack (reset #2)
  assert.equal(game.moveRight(), true);
  assert.equal(game.lockTimer, 0);

  // 499ms -> still not locked
  game.tick(499);
  assert.equal(game.board[16][4], null);

  // +1ms -> reaches 500ms -> locks!
  game.tick(1);
  assert.equal(game.board[16][4], 'O');
});

test('Line clearing (Single, Double, Triple, Tetris), scoring, and level progression', () => {
  const game = createGame({ rng: makeDeterministicRng(21) });
  game.start();

  // Helper to fill bottom N rows except cols 4..5 (or col 9 for I-piece)
  function fillBottomRowsWithGap(rowCount, gapCols) {
    game.board = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    for (let r = ROWS - rowCount; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!gapCols.includes(c)) {
          game.board[r][c] = 'J';
        }
      }
    }
  }

  // Single clear at level 1: 100 * 1 = 100 (+ hard drop score)
  fillBottomRowsWithGap(1, [4, 5]);
  game.active = { type: 'O', rotation: 0, x: 3, y: 18 };
  const single = game.hardDrop();
  assert.equal(single.clearedLines, 1);
  assert.equal(game.lines, 1);
  assert.equal(game.score, 100);
  assert.equal(game.lastClear, 'SINGLE');

  // Double clear at level 1: 300 * 1 = 300
  fillBottomRowsWithGap(2, [4, 5]);
  game.active = { type: 'O', rotation: 0, x: 3, y: 18 };
  const dbl = game.hardDrop();
  assert.equal(dbl.clearedLines, 2);
  assert.equal(game.lines, 3);
  assert.equal(game.score, 400);
  assert.equal(game.lastClear, 'DOUBLE');

  // Triple clear at level 1: 500 * 1 = 500
  fillBottomRowsWithGap(3, [9]);
  game.active = { type: 'I', rotation: 1, x: 7, y: 16 }; // col 9, rows 16..19
  const trp = game.hardDrop();
  assert.equal(trp.clearedLines, 3);
  assert.equal(game.lines, 6);
  assert.equal(game.score, 900);
  assert.equal(game.lastClear, 'TRIPLE');

  // Tetris (4 lines) at level 1 -> total 10 lines -> advances to level 2!
  fillBottomRowsWithGap(4, [9]);
  game.active = { type: 'I', rotation: 1, x: 7, y: 16 };
  const tetris = game.hardDrop();
  assert.equal(tetris.clearedLines, 4);
  assert.equal(game.lines, 10);
  assert.equal(game.score, 900 + 800);
  assert.equal(game.level, 2);
  assert.equal(game.lastClear, 'TETRIS');

  // Single clear at level 2 should award 100 * 2 = 200
  fillBottomRowsWithGap(1, [4, 5]);
  game.active = { type: 'O', rotation: 0, x: 3, y: 18 };
  game.hardDrop();
  assert.equal(game.score, 1700 + 200);
  assert.equal(game.lastClear, 'SINGLE');

  // Gravity interval decreases with level and floors at 80ms
  assert.ok(TetrisCore.getGravityIntervalForLevel(2) < TetrisCore.getGravityIntervalForLevel(1));
  assert.equal(TetrisCore.getGravityIntervalForLevel(50), 80);
});

test('Pause, resume, restart, and game over detection', () => {
  const game = createGame({ rng: makeDeterministicRng(77) });
  assert.equal(game.status, STATUS.READY);

  game.start();
  assert.equal(game.status, STATUS.PLAYING);

  // Pause blocks movement & ticks
  assert.equal(game.togglePause(), true);
  assert.equal(game.status, STATUS.PAUSED);
  const savedX = game.active.x;
  assert.equal(game.moveLeft(), false);
  assert.equal(game.tick(1000), false);
  assert.equal(game.active.x, savedX);

  // Resume restores play
  assert.equal(game.togglePause(), true);
  assert.equal(game.status, STATUS.PLAYING);

  // Fill top rows (leaving col 0 empty so they don't clear as full lines) to force Game Over on next spawn
  for (let c = 1; c < COLS; c++) {
    game.board[0][c] = 'Z';
    game.board[1][c] = 'Z';
  }
  game.active = { type: 'O', rotation: 0, x: 3, y: 2 };
  game.hardDrop();
  assert.equal(game.status, STATUS.GAME_OVER);
  assert.equal(game.moveLeft(), false);
  assert.equal(game.hardDrop().locked, false);

  // Restart resets everything cleanly
  game.restart();
  assert.equal(game.status, STATUS.PLAYING);
  assert.equal(game.score, 0);
  assert.equal(game.level, 1);
  assert.equal(game.lines, 0);
  assert.equal(game.holdType, null);
  assert.equal(game.lastClear, '');
});

test('getRenderPayload returns exact 20x10, 4x4, 4x4 hex color grids and HUD object', () => {
  const game = createGame({ rng: makeDeterministicRng(101) });
  game.start();
  game.hold();

  const payload = game.getRenderPayload();
  assert.equal(payload.boardColors.length, 20);
  for (const row of payload.boardColors) {
    assert.equal(row.length, 10);
    for (const color of row) {
      assert.match(color, HEX_RE);
    }
  }

  for (const grid of [payload.nextColors, payload.holdColors]) {
    assert.equal(grid.length, 4);
    for (const row of grid) {
      assert.equal(row.length, 4);
      for (const color of row) {
        assert.match(color, HEX_RE);
      }
    }
  }

  assert.deepEqual(Object.keys(payload.hud).sort(), ['lastClear', 'level', 'lines', 'score', 'status']);
  assert.equal(payload.hud.status, STATUS.PLAYING);
});
