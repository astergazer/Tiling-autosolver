import { cellKey, fullBoardCells } from "./lattice.js";

const $ = (selector) => document.querySelector(selector);
const boardElement = $("#board");
const solutionElement = $("#solution-board");
const tileEditor = $("#tile-editor");
const palette = ["#ff6b35", "#1a936f", "#247ba0", "#f2b134", "#8f5bd6", "#d1495b", "#5f6f52"];
const presets = {
  domino: { name: "Domino", cells: [[0, 0], [1, 0]] },
  l3: { name: "L tromino", cells: [[0, 0], [0, 1], [1, 1]] },
  i3: { name: "I tromino", cells: [[0, 0], [1, 0], [2, 0]] },
  t4: { name: "T tetromino", cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  l4: { name: "L tetromino", cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
};

let board = { grid: "square", width: 6, height: 6, active: new Set() };
let editorCells = new Set(["1,2", "2,2"]);
let tiles = [];
let solutions = [];
let solvedTiles = [];
let currentSolution = 0;
let editingTileId = null;
let worker = null;

function setStatus(message, kind = "idle") {
  $("#status-text").textContent = message;
  $("#status").dataset.kind = kind;
}

function stopWorker() {
  if (worker) worker.terminate();
  worker = null;
  $("#cancel").disabled = true;
  $("#enumerate").disabled = false;
  $("#find-one").disabled = false;
}

function clearSolutions() {
  stopWorker();
  solutions = [];
  solvedTiles = [];
  currentSolution = 0;
  $("#node-count").textContent = "—";
  $("#elapsed").textContent = "—";
  setStatus("条件を変更しました。探索を実行してください。");
  renderSolutionBoard();
}

function resetBoard(width = board.width, height = board.height) {
  board = {
    grid: $("#grid-type").value || board.grid,
    width, height,
    active: new Set(fullBoardCells($("#grid-type").value || board.grid, width, height).map(cellKey)),
  };
  clearSolutions();
  renderBoard();
}

function cellClass(grid, cell, extra = "") {
  const triangle = grid === "triangle" ? (cell[2] === 0 ? " triangle-up" : " triangle-down") : "";
  return `cell lattice-cell ${grid}-cell${triangle} ${extra}`;
}

function createCell(grid, coords, selected, onClick = null) {
  const button = document.createElement("button");
  const id = cellKey(coords);
  button.className = cellClass(grid, coords, selected.has(id) ? "on" : "off");
  button.title = `(${coords.join(", ")})`;
  if (onClick) button.addEventListener("click", () => onClick(id));
  return button;
}

function cellsAt(grid, x, y) { return grid === "triangle" ? [[x,y,0],[x,y,1]] : [[x,y]]; }

function renderBoard() {
  boardElement.dataset.grid = board.grid;
  boardElement.replaceChildren();
  for (let y = 0; y < board.height; y += 1) {
    const row = document.createElement("div"); row.className = `lattice-row ${board.grid}-row`;
    for (let x = 0; x < board.width; x += 1) {
      const pair = document.createElement("div"); pair.className = "triangle-pair";
      for (const coords of cellsAt(board.grid, x, y)) {
        pair.append(createCell(board.grid, coords, board.active, (id) => {
          board.active.has(id) ? board.active.delete(id) : board.active.add(id);
          clearSolutions(); renderBoard();
        }));
      }
      row.append(pair);
    }
    boardElement.append(row);
  }
  $("#board-summary").textContent = `${board.grid} grid · ${board.width} × ${board.height} cells · ${board.active.size} active cells`;
  renderSolutionBoard();
}

function renderEditor() {
  const grid = $("#grid-type").value;
  tileEditor.dataset.grid = grid;
  tileEditor.replaceChildren();
  for (let y = 0; y < 5; y += 1) {
    const row = document.createElement("div"); row.className = `lattice-row editor-row ${grid}-row`;
    for (let x = 0; x < 5; x += 1) {
      const pair = document.createElement("div"); pair.className = "triangle-pair";
      for (const coords of cellsAt(grid, x, y)) {
        const id = cellKey(coords);
        const button = document.createElement("button");
        button.className = cellClass(grid, coords, editorCells.has(id) ? "on" : "off");
        button.addEventListener("click", () => {
          editorCells.has(id) ? editorCells.delete(id) : editorCells.add(id);
          renderEditor();
        });
        pair.append(button);
      }
      row.append(pair);
    }
    tileEditor.append(row);
  }
}

function normalizedEditorCells() {
  const cells = [...editorCells].map((id) => id.split(",").map(Number));
  if (!cells.length) return [];
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  return cells.map((cell) => cell.length === 3
    ? [cell[0] - minX, cell[1] - minY, cell[2]]
    : [cell[0] - minX, cell[1] - minY]);
}

function neighbors(grid, [x,y,dir]) {
  if (grid === "square") return [[x+1,y],[x-1,y],[x,y+1],[x,y-1]];
  if (grid === "hex") return [[x+1,y],[x-1,y],[x,y+1],[x,y-1],[x+1,y-1],[x-1,y+1]];
  return dir === 0 ? [[x,y,1],[x,y-1,1],[x-1,y,1]] : [[x,y,0],[x+1,y,0],[x,y+1,0]];
}

function isConnected(cells, grid) {
  if (!cells.length) return false;
  const ids = new Set(cells.map(cellKey));
  const seen = new Set([cellKey(cells[0])]);
  const stack = [cells[0]];
  while (stack.length) {
    const cell = stack.pop();
    for (const next of neighbors(grid, cell)) {
      const id = cellKey(next);
      if (ids.has(id) && !seen.has(id)) { seen.add(id); stack.push(next); }
    }
  }
  return seen.size === ids.size;
}

function addTile() {
  const grid = $("#grid-type").value;
  const cells = normalizedEditorCells();
  if (!cells.length) return setStatus("タイルのセルを選択してください。", "error");
  if (!isConnected(cells, grid)) return setStatus("タイルは辺を共有するセル同士でつなげてください。", "error");
  const tile = {
    id: editingTileId ?? crypto.randomUUID(), grid, cells,
    name: $("#tile-name").value.trim() || `Tile ${tiles.length + 1}`,
    count: Math.min(99, Math.max(0, Math.floor(Number($("#tile-count").value) || 0))),
    rotate: $("#tile-rotate").checked,
    reflect: $("#tile-reflect").checked,
    color: $("#tile-color").value,
  };
  if (editingTileId) tiles[tiles.findIndex((item) => item.id === editingTileId)] = tile;
  else tiles.push(tile);
  editingTileId = null;
  $("#add-tile").textContent = "種類を追加";
  $("#tile-color").value = palette[tiles.length % palette.length];
  clearSolutions(); renderTiles(); setStatus(`${tile.name}を保存しました。`);
}

function renderTiles() {
  const list = $("#tile-list"); list.replaceChildren();
  if (!tiles.length) {
    const empty = document.createElement("p"); empty.className = "hint";
    empty.textContent = "まだタイルがありません。左の編集面から追加してください。";
    list.append(empty); return;
  }
  tiles.forEach((tile) => {
    const card = document.createElement("article"); card.className = `tile-card ${tile.grid === board.grid ? "" : "inactive-tile"}`;
    const preview = document.createElement("div"); preview.className = `tile-preview ${tile.grid}-preview`;
    preview.style.setProperty("--tile-color", tile.color);
    for (const cell of tile.cells) { const part = document.createElement("span"); part.className = cellClass(tile.grid, cell, "on"); preview.append(part); }
    const info = document.createElement("div");
    const title = document.createElement("h3"); title.textContent = tile.name;
    const meta = document.createElement("p"); meta.textContent = `${tile.grid} · ${tile.cells.length}セル · ${tile.count || "無制限"}枚 · ${tile.rotate ? "回転あり" : "固定"}${tile.reflect ? "・反転あり" : ""}`;
    info.append(title, meta);
    const actions = document.createElement("div"); actions.className = "tile-actions";
    const edit = document.createElement("button"); edit.className = "button secondary"; edit.textContent = "編集";
    edit.disabled = tile.grid !== $("#grid-type").value;
    edit.addEventListener("click", () => {
      editingTileId = tile.id; editorCells = new Set(tile.cells.map(cellKey));
      $("#tile-name").value = tile.name; $("#tile-count").value = tile.count;
      $("#tile-rotate").checked = tile.rotate; $("#tile-reflect").checked = tile.reflect; $("#tile-color").value = tile.color;
      $("#add-tile").textContent = "変更を保存"; renderEditor();
    });
    const remove = document.createElement("button"); remove.className = "remove-tile"; remove.textContent = "×"; remove.title = `${tile.name}を削除`;
    remove.addEventListener("click", () => { tiles = tiles.filter((item) => item.id !== tile.id); clearSolutions(); renderTiles(); });
    actions.append(edit, remove); card.append(preview, info, actions); list.append(card);
  });
}

function serializableBoard() {
  return { grid: board.grid, width: board.width, height: board.height, cells: [...board.active].map((id) => id.split(",").map(Number)) };
}

function startSolve(oneOnly) {
  clearSolutions();
  solvedTiles = tiles.filter((tile) => tile.grid === board.grid);
  if (tiles.length !== solvedTiles.length) setStatus("別の格子のタイルは今回の探索から除外しました。", "idle");
  worker = new Worker("worker.js", { type: "module" });
  setStatus("探索中…", "busy");
  $("#cancel").disabled = false; $("#enumerate").disabled = true; $("#find-one").disabled = true;
  worker.onmessage = ({ data }) => {
    if (data.type === "error") { setStatus(`エラー: ${data.message}`, "error"); stopWorker(); return; }
    const { result } = data;
    solutions = result.solutions; currentSolution = 0;
    $("#node-count").textContent = result.nodes.toLocaleString("ja-JP");
    $("#elapsed").textContent = `${result.elapsedMs.toFixed(1)} ms`;
    const suffix = result.stopped === "limit" ? "（解数上限で停止）" : result.stopped === "time" ? "（時間制限で停止）" : "";
    setStatus(`${result.message}${suffix}`, solutions.length ? "success" : "error");
    stopWorker(); renderSolutionBoard();
  };
  worker.onerror = (event) => { setStatus(`エラー: ${event.message}`, "error"); stopWorker(); };
  worker.postMessage({
    board: serializableBoard(), tiles: solvedTiles,
    options: {
      maxSolutions: oneOnly ? 1 : Math.min(10000, Math.max(1, Number($("#solution-limit").value) || 100)),
      timeLimitMs: Math.min(120, Math.max(1, Number($("#time-limit").value) || 10)) * 1000,
      symmetry: $("#symmetry-mode").value,
    },
  });
}

function renderSolutionBoard() {
  solutionElement.dataset.grid = board.grid;
  solutionElement.replaceChildren();
  const solution = solutions[currentSolution];
  const placed = new Map();
  if (solution) solution.forEach((placement, placementIndex) => placement.cells.forEach((cell) => {
    placed.set(cellKey(cell), { tileIndex: placement.tileIndex, placementIndex });
  }));
  for (let y = 0; y < board.height; y += 1) {
    const row = document.createElement("div"); row.className = `lattice-row ${board.grid}-row`;
    for (let x = 0; x < board.width; x += 1) {
      const pair = document.createElement("div"); pair.className = "triangle-pair";
      for (const coords of cellsAt(board.grid, x, y)) {
        const id = cellKey(coords); const cell = createCell(board.grid, coords, board.active);
        cell.disabled = true;
        const data = placed.get(id);
        if (data) {
          const tile = solvedTiles[data.tileIndex];
          cell.style.backgroundColor = tile?.color || palette[data.placementIndex % palette.length];
          cell.classList.add("placed"); cell.textContent = String(data.placementIndex + 1); cell.title = tile?.name || "tile";
        }
        pair.append(cell);
      }
      row.append(pair);
    }
    solutionElement.append(row);
  }
  $("#solution-count").textContent = solutions.length.toLocaleString("ja-JP");
  $("#solution-index").textContent = solutions.length ? `${currentSolution + 1} / ${solutions.length}` : "— / —";
  $("#previous-solution").disabled = currentSolution <= 0;
  $("#next-solution").disabled = currentSolution >= solutions.length - 1;
}

$("#grid-type").addEventListener("change", () => {
  editingTileId = null; editorCells.clear();
  const grid = $("#grid-type").value;
  editorCells = new Set(grid === "triangle" ? ["1,2,0","1,2,1"] : grid === "hex" ? ["1,2","2,2"] : ["1,2","2,2"]);
  $("#add-tile").textContent = "種類を追加";
  resetBoard(board.width, board.height); renderEditor(); renderTiles();
});
$("#resize-board").addEventListener("click", () => {
  const width = Math.min(16, Math.max(1, Math.floor(Number($("#board-width").value) || 6)));
  const height = Math.min(16, Math.max(1, Math.floor(Number($("#board-height").value) || 6)));
  $("#board-width").value = width; $("#board-height").value = height; resetBoard(width, height);
});
$("#fill-board").addEventListener("click", () => resetBoard());
$("#clear-board").addEventListener("click", () => { board.active.clear(); clearSolutions(); renderBoard(); });
$("#add-tile").addEventListener("click", addTile);
$("#clear-tile").addEventListener("click", () => { editingTileId = null; editorCells.clear(); $("#add-tile").textContent = "種類を追加"; renderEditor(); });
$("#load-preset").addEventListener("click", () => {
  if (["triangle","hex"].includes($("#grid-type").value)) return setStatus("三角・六角格子では編集面を使ってセルを描いてください。", "error");
  const preset = presets[$("#preset-select").value];
  editorCells = new Set(preset.cells.map(([x, y]) => `${x + 1},${y + 1}`)); $("#tile-name").value = preset.name;
  editingTileId = null; $("#add-tile").textContent = "種類を追加"; renderEditor();
});
$("#find-one").addEventListener("click", () => startSolve(true));
$("#enumerate").addEventListener("click", () => startSolve(false));
$("#cancel").addEventListener("click", () => { stopWorker(); setStatus("探索を中止しました。"); });
$("#previous-solution").addEventListener("click", () => { currentSolution -= 1; renderSolutionBoard(); });
$("#next-solution").addEventListener("click", () => { currentSolution += 1; renderSolutionBoard(); });

$("#grid-type").value = "square";
resetBoard(); renderEditor();
editorCells = new Set(["1,2", "2,2"]);
$("#tile-name").value = "Domino";
tiles.push({ id: crypto.randomUUID(), grid:"square", name:"Domino", cells:[[0,0],[1,0]], count:0, rotate:true, reflect:false, color:"#ff6b35" });
renderTiles();
