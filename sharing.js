import { cellKey, shapedBoard, transformShape, isConnected } from "./lattice.js?v=20261005-cubic1";

const grids = ["square", "triangle", "hex", "cubic"];
const maxTokenLength = 32000;
const maxBytes = 24000;
const maxTiles = 64;

function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label}が範囲外です。`);
  return value;
}

function text(value, maxLength, label) {
  if (typeof value !== "string" || value.length > maxLength) throw new Error(`${label}が長すぎるか、形式が不正です。`);
  return value.trim();
}

function validateCells(cells, grid, label) {
  if (!Array.isArray(cells) || cells.length < 1 || cells.length > 721) throw new Error(`${label}のセル数が不正です。`);
  for (const cell of cells) {
    if (!Array.isArray(cell) || cell.length !== (["triangle","cubic"].includes(grid) ? 3 : 2)) throw new Error(`${label}の座標が不正です。`);
    integer(cell[0], 0, 30, label); integer(cell[1], 0, 30, label);
    if (grid === "cubic") integer(cell[2], 0, 7, label);
    if (grid === "triangle") integer(cell[2], 0, 1, label);
  }
  if (new Set(cells.map(cellKey)).size !== cells.length) throw new Error(`${label}のセルが重複しています。`);
}

function packCells(cells, fullCells, label) {
  const selected = new Set(cells.map(cellKey));
  const allowed = new Set(fullCells.map(cellKey));
  if (selected.size === 0 || [...selected].some(id => !allowed.has(id))) throw new Error(`${label}が空、または編集面の外にあります。`);
  let mask = "";
  for (let index = 0; index < fullCells.length; index += 4) {
    let nibble = 0;
    for (let bit = 0; bit < 4 && index + bit < fullCells.length; bit++) {
      if (selected.has(cellKey(fullCells[index + bit]))) nibble |= 1 << bit;
    }
    mask += nibble.toString(16);
  }
  return mask;
}

function unpackCells(mask, fullCells, label) {
  if (typeof mask !== "string" || mask.length !== Math.ceil(fullCells.length / 4) || !/^[0-9a-f]+$/.test(mask)) {
    throw new Error(`${label}の形状データが不正です。`);
  }
  const cells = [];
  for (let index = 0; index < mask.length * 4; index++) {
    if ((parseInt(mask[Math.floor(index / 4)], 16) & (1 << (index % 4))) === 0) continue;
    if (index >= fullCells.length) throw new Error(`${label}が編集面の外にあります。`);
    cells.push(fullCells[index]);
  }
  if (!cells.length) throw new Error(`${label}が空です。`);
  return cells;
}

// Preserve the tile's orientation: only translations are allowed when fitting
// its cells to an editable surface, even if rotation is disabled for solving.
function tileEditor(tile, grid) {
  const limit = grid === "cubic" ? 8 : 16;
  const cells = transformShape(grid, tile.cells);
  if (!isConnected(cells, grid)) throw new Error("タイルのセルをつなげてください（立体は面、それ以外は辺を共有）。");
  if (Number.isInteger(tile.editorSize) && tile.editorSize >= 2 && tile.editorSize <= limit && Array.isArray(tile.editorCells)) {
    validateCells(tile.editorCells, grid, "タイル");
    const full = shapedBoard(grid, tile.editorSize).cells;
    if (JSON.stringify(transformShape(grid, tile.editorCells)) === JSON.stringify(cells)) {
      return [tile.editorSize, packCells(tile.editorCells, full, "タイル")];
    }
  }
  const maxX = Math.max(...cells.map(c => c[0])), maxY = Math.max(...cells.map(c => c[1]));
  const sums = cells.map(c => c[0] + c[1]);
  for (let size = 2; size <= limit; size++) {
    let dx = 0, dy = 0;
    if (grid === "hex") {
      const radius = size - 1;
      if (maxX > 2 * radius || maxY > 2 * radius) continue;
      const shift = Math.max(0, radius - Math.min(...sums));
      if (shift > 3 * radius - Math.max(...sums) || shift > 4 * radius - maxX - maxY) continue;
      dx = Math.min(shift, 2 * radius - maxX); dy = shift - dx;
    }
    const translated = cells.map(cell => cell.map((value, index) => index === 0 ? value + dx : index === 1 ? value + dy : value));
    const full = shapedBoard(grid, size).cells, allowed = new Set(full.map(cellKey));
    if (translated.every(cell => allowed.has(cellKey(cell)))) return [size, packCells(translated, full, "タイル")];
  }
  throw new Error(`タイルが一辺${limit}の編集面に収まりません。`);
}

function encodeData(puzzle) {
  const { board, tiles, options } = puzzle;
  const grid = board?.grid, gridIndex = grids.indexOf(grid);
  if (gridIndex < 0) throw new Error("格子の種類が不正です。");
  const limit = grid === "cubic" ? 8 : 16;
  const depth = grid === "cubic" ? integer(board.depth, 1, limit, "盤面の奥行き") : undefined;
  const size = integer(grid === "hex" ? (board.width + 1) / 2 : board.width, 1, limit, "盤面の大きさ");
  const height = integer(["square","cubic"].includes(grid) ? board.height : size, 1, limit, "盤面の高さ");
  const shape = shapedBoard(grid, size, height, depth);
  if (board.width !== shape.width || board.height !== shape.height) throw new Error("盤面の寸法が不正です。");
  validateCells(board.cells, grid, "盤面");
  if (!Array.isArray(tiles) || !tiles.length || tiles.length > maxTiles) throw new Error("公開するタイルは1〜64種類で登録してください。");
  const title = text(puzzle.title ?? "", 80, "問題名") || "無題の敷き詰めパズル";
  const description = text(puzzle.description ?? "", 600, "説明");
  if (!["same", "different"].includes(options?.symmetry)) throw new Error("対称な解の設定が不正です。");
  return {
    v: grid === "cubic" ? 2 : 1, title, description,
    b: [gridIndex, size, height, packCells(board.cells, shape.cells, "盤面"), ...(grid === "cubic" ? [depth] : [])],
    t: tiles.map((tile, index) => {
      if (tile.grid !== undefined && tile.grid !== grid) throw new Error("タイルと盤面の格子が一致しません。");
      validateCells(tile.cells, grid, "タイル");
      const name = text(tile.name ?? "", 24, "タイル名") || `Tile ${index + 1}`;
      const count = integer(tile.count, 0, 99, "タイル枚数");
      const color = tile.color ?? "#ff6b35";
      if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("タイルの色が不正です。");
      return [name, count, (tile.rotate !== false ? 1 : 0) | (tile.reflect === true ? 2 : 0), color, ...tileEditor(tile, grid)];
    }),
    s: [options.symmetry === "same" ? 1 : 0, integer(options.maxSolutions, 1, 10000, "最大解数"), integer(options.timeLimitMs / 1000, 1, 120, "時間制限")],
  };
}

export function encodePuzzle(puzzle) {
  const bytes = new TextEncoder().encode(JSON.stringify(encodeData(puzzle)));
  if (bytes.length > maxBytes) throw new Error("共有URLに収まらないため、説明やタイルの種類を減らしてください。");
  const token = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (token.length > maxTokenLength) throw new Error("共有URLが長すぎます。");
  return token;
}

export function decodePuzzle(token) {
  if (typeof token !== "string" || !token.length || token.length > maxTokenLength || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error("共有URLが長すぎるか、途中で切れています。");
  let data;
  try {
    const bytes = Uint8Array.from(atob(token.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
    if (bytes.length > maxBytes) throw new Error();
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("共有URLのデータを読み取れません。URL全体をコピーし直してください。");
  }
  if (!data || ![1,2].includes(data.v)) throw new Error("この共有URLの形式には対応していません。");
  const title = text(data.title, 80, "問題名") || "無題の敷き詰めパズル";
  const description = text(data.description, 600, "説明");
  if (!Array.isArray(data.b) || data.b.length !== (data.v === 2 ? 5 : 4)) throw new Error("盤面のデータが不正です。");
  const grid = grids[integer(data.b[0], data.v === 2 ? 3 : 0, data.v === 2 ? 3 : 2, "格子")];
  const limit = grid === "cubic" ? 8 : 16;
  const depth = grid === "cubic" ? integer(data.b[4], 1, limit, "盤面の奥行き") : undefined;
  const size = integer(data.b[1], 1, limit, "盤面の大きさ"), height = integer(data.b[2], 1, limit, "盤面の高さ");
  if (!["square","cubic"].includes(grid) && height !== size) throw new Error("盤面の寸法が不正です。");
  const board = shapedBoard(grid, size, height, depth);
  board.cells = unpackCells(data.b[3], board.cells, "盤面");
  if (!Array.isArray(data.t) || !data.t.length || data.t.length > maxTiles) throw new Error("タイルの種類数が不正です。");
  const tiles = data.t.map((tile, index) => {
    if (!Array.isArray(tile) || tile.length !== 6) throw new Error("タイルのデータが不正です。");
    const name = text(tile[0], 24, "タイル名") || `Tile ${index + 1}`;
    const count = integer(tile[1], 0, 99, "タイル枚数"), flags = integer(tile[2], 0, 3, "タイルの向き");
    if (typeof tile[3] !== "string" || !/^#[0-9a-f]{6}$/i.test(tile[3])) throw new Error("タイルの色が不正です。");
    const editorSize = integer(tile[4], 2, limit, "タイル編集面");
    const editorCells = unpackCells(tile[5], shapedBoard(grid, editorSize).cells, "タイル");
    if (!isConnected(editorCells, grid)) throw new Error("タイルのセルがつながっていません。");
    return { name, grid, cells: transformShape(grid, editorCells), count, rotate: Boolean(flags & 1), reflect: Boolean(flags & 2), color: tile[3], editorSize, editorCells };
  });
  if (!Array.isArray(data.s) || data.s.length !== 3) throw new Error("探索設定が不正です。");
  const options = { symmetry: integer(data.s[0], 0, 1, "対称な解") ? "same" : "different", maxSolutions: integer(data.s[1], 1, 10000, "最大解数"), timeLimitMs: integer(data.s[2], 1, 120, "時間制限") * 1000 };
  return { title, description, size, height, ...(grid === "cubic" ? {depth} : {}), board, tiles, options };
}

export function createShareUrl(puzzle, baseUrl) {
  const url = new URL(baseUrl);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("共有URLはWebサイト上で作成してください。");
  url.search = "";
  url.hash = `puzzle=${encodePuzzle(puzzle)}`;
  return url.href;
}
