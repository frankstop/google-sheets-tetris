/**
 * Tetris for Google Sheets — Google Apps Script Backend (V8 Runtime)
 *
 * Sheet layout ("Tetris"):
 * - Row 1 (B1:Q1): Title banner
 * - B2:K21 (20x10): Main playfield (28x28px square cells)
 * - M2:Q7: HUD stats panel (Score, High Score, Level, Lines, Status)
 * - M10:P13 (4x4): Next piece preview
 * - M16:P19 (4x4): Hold piece preview
 * - M20:Q22: Controls legend
 */

const SHEET_NAME = 'Tetris';
const HIGH_SCORE_KEY = 'TETRIS_HIGH_SCORE';

const TOTAL_ROWS = 23;
const TOTAL_COLS = 18; // A..R

const PLAYFIELD_TOP = 2;
const PLAYFIELD_LEFT = 2; // Col B
const PLAYFIELD_ROWS = 20;
const PLAYFIELD_COLS = 10;

const NEXT_TOP = 10;
const NEXT_LEFT = 13; // Col M
const HOLD_TOP = 16;
const HOLD_LEFT = 13; // Col M
const PREVIEW_SIZE = 4;

const HUD_VALUE_TOP = 3;
const HUD_VALUE_COL = 16; // Col P (merged P:Q)

const COLOR_CABINET = '#0B1120';
const COLOR_EMPTY = '#111827';
const COLOR_PANEL = '#0F172A';
const COLOR_HEADER_BG = '#1E293B';
const COLOR_GRID_BORDER = '#1F2937';
const COLOR_PANEL_BORDER = '#334155';
const COLOR_ACCENT = '#38BDF8';
const COLOR_TEXT_MUTED = '#94A3B8';
const COLOR_TEXT_LIGHT = '#F8FAFC';

/**
 * Adds the custom Tetris menu when the spreadsheet opens.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🕹️ Tetris')
    .addItem('Play Tetris', 'showSidebar')
    .addItem('Setup / Reset Board', 'setupBoard')
    .addToUi();
}

/**
 * Opens the Tetris controller sidebar.
 */
function showSidebar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SHEET_NAME)) {
    setupBoard();
  } else {
    ss.setActiveSheet(ss.getSheetByName(SHEET_NAME));
  }

  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('🕹️ Sheets Tetris');
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Creates or resets the "Tetris" sheet with a sleek dark arcade layout.
 * @return {{ highScore: number }}
 */
function setupBoard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  ss.setActiveSheet(sheet);

  // Clear existing content, formatting, and merges
  sheet.clear();
  sheet.getDataRange().breakApart();

  // Resize sheet to exact arcade cabinet dimensions
  const maxRows = sheet.getMaxRows();
  if (maxRows < TOTAL_ROWS) {
    sheet.insertRowsAfter(maxRows, TOTAL_ROWS - maxRows);
  } else if (maxRows > TOTAL_ROWS) {
    sheet.deleteRows(TOTAL_ROWS + 1, maxRows - TOTAL_ROWS);
  }

  const maxCols = sheet.getMaxColumns();
  if (maxCols < TOTAL_COLS) {
    sheet.insertColumnsAfter(maxCols, TOTAL_COLS - maxCols);
  } else if (maxCols > TOTAL_COLS) {
    sheet.deleteColumns(TOTAL_COLS + 1, maxCols - TOTAL_COLS);
  }

  // Hide default spreadsheet gridlines for a clean dark arcade look
  sheet.setHiddenGridlines(true);

  // Fill entire cabinet background
  const fullRange = sheet.getRange(1, 1, TOTAL_ROWS, TOTAL_COLS);
  fullRange
    .setBackground(COLOR_CABINET)
    .setFontFamily('Roboto Mono')
    .setFontColor(COLOR_TEXT_LIGHT)
    .setVerticalAlignment('middle');

  // Set column widths
  sheet.setColumnWidth(1, 20); // Col A: left margin
  sheet.setColumnWidths(PLAYFIELD_LEFT, PLAYFIELD_COLS, 28); // Cols B:K: playfield
  sheet.setColumnWidth(12, 18); // Col L: gutter
  sheet.setColumnWidths(13, 4, 28); // Cols M:P: 4x4 preview grids
  sheet.setColumnWidth(17, 72); // Col Q: HUD value extension
  sheet.setColumnWidth(18, 20); // Col R: right margin

  // Set row heights
  sheet.setRowHeight(1, 42); // Title banner
  sheet.setRowHeights(PLAYFIELD_TOP, PLAYFIELD_ROWS, 28); // Rows 2:21: playfield
  sheet.setRowHeight(22, 22); // Controls line 2
  sheet.setRowHeight(23, 18); // Bottom margin

  // Title banner (B1:Q1)
  const titleRange = sheet.getRange('B1:Q1');
  titleRange
    .merge()
    .setValue('🕹️  TETRIS  FOR  GOOGLE  SHEETS')
    .setBackground(COLOR_PANEL)
    .setFontColor(COLOR_ACCENT)
    .setFontSize(14)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setBorder(null, null, true, null, false, false, COLOR_ACCENT, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // 20x10 Playfield (B2:K21)
  const playfield = sheet.getRange(PLAYFIELD_TOP, PLAYFIELD_LEFT, PLAYFIELD_ROWS, PLAYFIELD_COLS);
  playfield
    .setBackground(COLOR_EMPTY)
    .setBorder(true, true, true, true, true, true, COLOR_GRID_BORDER, SpreadsheetApp.BorderStyle.SOLID)
    .setBorder(true, true, true, true, null, null, COLOR_ACCENT, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // HUD Stats Header (M2:Q2)
  sheet.getRange('M2:Q2')
    .merge()
    .setValue('STATS')
    .setBackground(COLOR_HEADER_BG)
    .setFontColor(COLOR_ACCENT)
    .setFontSize(9)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  // HUD Stats Rows (M3:Q7)
  const highScore = getHighScore();
  const statLabels = [
    ['SCORE', '#FACC15', 0],
    ['HIGH', '#34D399', highScore],
    ['LEVEL', '#38BDF8', 1],
    ['LINES', '#F8FAFC', 0],
    ['STATUS', '#A78BFA', 'READY']
  ];

  for (let i = 0; i < statLabels.length; i++) {
    const row = HUD_VALUE_TOP + i;
    const [label, valueColor, initialVal] = statLabels[i];

    sheet.getRange(row, 13, 1, 3)
      .merge()
      .setValue(label)
      .setBackground(COLOR_PANEL)
      .setFontColor(COLOR_TEXT_MUTED)
      .setFontSize(9)
      .setFontWeight('bold')
      .setHorizontalAlignment('left');

    sheet.getRange(row, 16, 1, 2)
      .merge()
      .setValue(initialVal)
      .setBackground(COLOR_PANEL)
      .setFontColor(valueColor)
      .setFontSize(10)
      .setFontWeight('bold')
      .setHorizontalAlignment('right');
  }

  sheet.getRange('M2:Q7').setBorder(
    true, true, true, true, false, false, COLOR_PANEL_BORDER, SpreadsheetApp.BorderStyle.SOLID
  );

  // NEXT Piece Preview (M9 header, M10:P13 4x4 grid)
  sheet.getRange('M9:P9')
    .merge()
    .setValue('NEXT')
    .setBackground(COLOR_HEADER_BG)
    .setFontColor(COLOR_ACCENT)
    .setFontSize(9)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  sheet.getRange(NEXT_TOP, NEXT_LEFT, PREVIEW_SIZE, PREVIEW_SIZE)
    .setBackground(COLOR_EMPTY)
    .setBorder(true, true, true, true, true, true, COLOR_GRID_BORDER, SpreadsheetApp.BorderStyle.SOLID)
    .setBorder(true, true, true, true, null, null, COLOR_PANEL_BORDER, SpreadsheetApp.BorderStyle.SOLID);

  // HOLD Piece Preview (M15 header, M16:P19 4x4 grid)
  sheet.getRange('M15:P15')
    .merge()
    .setValue('HOLD')
    .setBackground(COLOR_HEADER_BG)
    .setFontColor(COLOR_ACCENT)
    .setFontSize(9)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  sheet.getRange(HOLD_TOP, HOLD_LEFT, PREVIEW_SIZE, PREVIEW_SIZE)
    .setBackground(COLOR_EMPTY)
    .setBorder(true, true, true, true, true, true, COLOR_GRID_BORDER, SpreadsheetApp.BorderStyle.SOLID)
    .setBorder(true, true, true, true, null, null, COLOR_PANEL_BORDER, SpreadsheetApp.BorderStyle.SOLID);

  // Controls Legend (M20:Q22)
  sheet.getRange('M20:Q20')
    .merge()
    .setValue('CONTROLS')
    .setBackground(COLOR_HEADER_BG)
    .setFontColor(COLOR_TEXT_MUTED)
    .setFontSize(8)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  sheet.getRange('M21:Q21')
    .merge()
    .setValue('←→ Move • ↓ Soft • Space Drop')
    .setBackground(COLOR_PANEL)
    .setFontColor('#CBD5E1')
    .setFontSize(8)
    .setHorizontalAlignment('center');

  sheet.getRange('M22:Q22')
    .merge()
    .setValue('↑/X CW • Z CCW • C Hold • P Pause')
    .setBackground(COLOR_PANEL)
    .setFontColor('#CBD5E1')
    .setFontSize(8)
    .setHorizontalAlignment('center');

  sheet.getRange('M20:Q22').setBorder(
    true, true, true, true, false, false, COLOR_PANEL_BORDER, SpreadsheetApp.BorderStyle.SOLID
  );

  // Park cursor on A1 so the selection box doesn't obscure the playfield
  sheet.setActiveSelection('A1');
  SpreadsheetApp.flush();

  return { highScore: highScore };
}

/**
 * Returns the persisted user high score.
 * @return {number}
 */
function getHighScore() {
  const raw = PropertiesService.getUserProperties().getProperty(HIGH_SCORE_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Batched frame renderer called from Sidebar.html via google.script.run.
 * Updates playfield (20x10), NEXT (4x4), HOLD (4x4), and HUD stats in minimal calls.
 *
 * @param {Object} payload
 * @param {string[][]} payload.boardColors 20x10 hex color matrix
 * @param {string[][]} payload.nextColors 4x4 hex color matrix
 * @param {string[][]} payload.holdColors 4x4 hex color matrix
 * @param {Object} [payload.hud] { score, level, lines, status }
 * @return {{ highScore: number }}
 */
function renderFrame(payload) {
  if (!payload) {
    return { highScore: getHighScore() };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    setupBoard();
    sheet = ss.getSheetByName(SHEET_NAME);
  }

  if (Array.isArray(payload.boardColors) && payload.boardColors.length === PLAYFIELD_ROWS) {
    sheet
      .getRange(PLAYFIELD_TOP, PLAYFIELD_LEFT, PLAYFIELD_ROWS, PLAYFIELD_COLS)
      .setBackgrounds(payload.boardColors);
  }

  if (Array.isArray(payload.nextColors) && payload.nextColors.length === PREVIEW_SIZE) {
    sheet
      .getRange(NEXT_TOP, NEXT_LEFT, PREVIEW_SIZE, PREVIEW_SIZE)
      .setBackgrounds(payload.nextColors);
  }

  if (Array.isArray(payload.holdColors) && payload.holdColors.length === PREVIEW_SIZE) {
    sheet
      .getRange(HOLD_TOP, HOLD_LEFT, PREVIEW_SIZE, PREVIEW_SIZE)
      .setBackgrounds(payload.holdColors);
  }

  const hud = payload.hud || payload;
  const score = Number(hud.score) || 0;
  const level = Number(hud.level) || 1;
  const lines = Number(hud.lines) || 0;
  const status = String(hud.status || 'READY').toUpperCase();

  let highScore = getHighScore();
  if (score > highScore) {
    highScore = score;
    PropertiesService.getUserProperties().setProperty(HIGH_SCORE_KEY, String(highScore));
  }

  sheet
    .getRange(HUD_VALUE_TOP, HUD_VALUE_COL, 5, 1)
    .setValues([
      [score],
      [highScore],
      [level],
      [lines],
      [status]
    ]);

  SpreadsheetApp.flush();
  return { highScore: highScore };
}
