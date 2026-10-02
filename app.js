const $ = (selector) => document.querySelector(selector);
const boardElement = $("#board");
const solutionElement = $("#solution-board");
const tileEditor = $("#tile-editor");

let board = { width: 6, height: 6, active: new Set() };
let editorCells = new Set(["1,2", "2,2"]);
let tiles = [];
let solutions = [];
let currentSolution = 0;
let worker = null;

const palette = ["#ff6b35", "#1a936f", "#247ba0", "#f2b134", "#8f5bd6", "#d1495b", "#5f6f52"];
const presets = {
  domino: { name: "Domino", cells: [[0, 0], [1, 0]] },
  l3: { name: "L tromino", cells: [[0, 0], [0, 1], [1, 1]] },
  i3: { name: "I tromino", cells: [[0, 0], [1, 0], [2, 0]] },
  t4: { name: "T tetromino", cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  l4: { name: "L tetromino", cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
};

function resetBoard(width = board.width, height = board.height) {
  board = { width, height, active: new Set() };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) board.active.add(`${x},${y}`);
  clearSolutions();
  renderBoard();
}

function renderBoard() {
  boardElement.style.setProperty("--cols", board.width);
  boardElement.replaceChildren();
  for (let y = 0; y < board.height; y += 1) {
    for (let x = 0; x < board.width; x += 1) {
      const key = `${x},${y}`;
      const cell = document.createElement("button");
      cell.className = `cell ${board.active.has(key) ? "on" : "off"}`;
      cell.title = `(${x}, ${y})`;
      cell.addEventListener("click", () => {
        board.active.has(key) ? board.active.delete(key) : board.active.add(key);
        clearSolutions();
        renderBoard();
      });
      boardElement.append(cell);
    }
  }
  $("#board-summary").textContent = `${board.width} × ${board.height} ／ 使用 ${board.active.size} マス`;
  renderSolutionBoard();
}

function renderEditor() {
  tileEditor.replaceChildren();
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      const key = `${x},${y}`;
      const cell = document.createElement("button");
      cell.className = `cell ${editorCells.has(key) ? "on" : ""}`;
      cell.addEventListener("click", () => {
        editorCells.has(key) ? editorCells.delete(key) : editorCells.add(key);
        renderEditor();
      });
      tileEditor.append(cell);
    }
  }
}

function normalizeEditorCells() {
  const cells = [...editorCells].map((key) => key.split(",").map(Number));
  if (!cells.length) return [];
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  return cells.map(([x, y]) => [x - minX, y - minY]);
}

function isConnected(cells) {
  if (!cells.length) return false;
  const set = new Set(cells.map(([x, y]) => `${x},${y}`));
  const seen = new Set([`${cells[0][0]},${cells[0][1]}`]);
  const stack = [cells[0]];
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${x + dx},${y + dy}`;
      if (set.has(key) && !seen.has(key)) { seen.add(key); stack.push([x + dx, y + dy]); }
    }
  }
  return seen.size === cells.length;
}

function addTile() {
  const cells = normalizeEditorCells();
  if (!cells.length) return setStatus("タイルのマスを1つ以上選択してください。", "error");
  if (!isConnected(cells)) return setStatus("タイルは辺でつながった形にしてください。", "error");
  const name = $("#tile-name").value.trim() || `Tile ${tiles.length + 1}`;
  tiles.push({
    id: crypto.randomUUID(), name, cells,
    count: Math.min(99, Math.max(0, Math.floor(Number($("#tile-count").value) || 0))),
    rotate: $("#tile-rotate").checked,
    reflect: $("#tile-reflect").checked,
    color: $("#tile-color").value,
  });
  $("#tile-color").value = palette[tiles.length % palette.length];
  clearSolutions();
  renderTiles();
  setStatus(`${name}を追加しました。`, "idle");
}

function renderMiniShape(tile) {
  const wrapper = document.createElement("div");
  wrapper.className = "mini-shape";
  wrapper.style.setProperty("--tile-color", tile.color);
  const width = Math.max(...tile.cells.map(([x]) => x)) + 1;
  const height = Math.max(...tile.cells.map(([, y]) => y)) + 1;
  wrapper.style.gridTemplateColumns = `repeat(${width}, 12px)`;
  const set = new Set(tile.cells.map(([x, y]) => `${x},${y}`));
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const cell = document.createElement("span");
    if (set.has(`${x},${y}`)) cell.className = "mini-cell";
    wrapper.append(cell);
  }
  return wrapper;
}

function renderTiles() {
  const list = $("#tile-list");
  list.replaceChildren();
  if (!tiles.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "まだタイルがありません。左の編集面から追加してください。";
    list.append(empty);
    return;
  }
  tiles.forEach((tile, index) => {
    const card = document.createElement("article");
    card.className = "tile-card";
    card.append(renderMiniShape(tile));
    const info = document.createElement("div");
    const title = document.createElement("h3"); title.textContent = tile.name;
    const meta = document.createElement("p");
    meta.textContent = `${tile.cells.length}マス・${tile.count || "無制限"}枚・${tile.rotate ? "回転あり" : "固定"}${tile.reflect ? "・反転あり" : ""}`;
    info.append(title, meta);
    const remove = document.createElement("button");
    remove.className = "remove-tile"; remove.textContent = "×"; remove.title = `${tile.name}を削除`;
    remove.addEventListener("click", () => { tiles.splice(index, 1); clearSolutions(); renderTiles(); });
    card.append(info, remove);
    list.append(card);
  });
}

function serializableBoard() {
  return { width: board.width, height: board.height, cells: [...board.active].map((key) => key.split(",").map(Number)) };
}

function startSolve(oneOnly) {
  clearSolutions();
  worker = new Worker("worker.js", { type: "module" });
  solutions = [];
  currentSolution = 0;
  renderSolutionBoard();
  setStatus("探索中…", "busy");
  $("#cancel").disabled = false;
  $("#enumerate").disabled = true;
  $("#find-one").disabled = true;
  worker.onmessage = ({ data }) => {
    if (data.type === "error") return finishWithError(data.message);
    const { result } = data;
    solutions = result.solutions;
    currentSolution = 0;
    $("#node-count").textContent = result.nodes.toLocaleString("ja-JP");
    $("#elapsed").textContent = `${result.elapsedMs.toFixed(1)} ms`;
    const suffix = result.stopped === "limit" ? "（設定した上限で停止）" : result.stopped === "time" ? "（時間制限で停止）" : "";
    setStatus(`${result.message}${suffix}`, solutions.length ? "success" : "error");
    finishWorker();
    renderSolutionBoard();
  };
  worker.onerror = (event) => finishWithError(event.message);
  worker.postMessage({
    board: serializableBoard(), tiles,
    options: {
      maxSolutions: oneOnly ? 1 : Math.min(10000, Math.max(1, Number($("#solution-limit").value) || 100)),
      timeLimitMs: Math.min(120, Math.max(1, Number($("#time-limit").value) || 10)) * 1000,
    },
  });
}

function finishWorker() {
  if (worker) worker.terminate();
  worker = null;
  $("#cancel").disabled = true;
  $("#enumerate").disabled = false;
  $("#find-one").disabled = false;
}

function finishWithError(message) { setStatus(`エラー: ${message}`, "error"); finishWorker(); }
function setStatus(message, kind) { $("#status-text").textContent = message; $("#status").dataset.kind = kind; }

function clearSolutions() {
  if (worker) finishWorker();
  setStatus("条件を変更しました。探索を実行してください。", "idle");
  solutions = [];
  currentSolution = 0;
  $("#node-count").textContent = "—";
  $("#elapsed").textContent = "—";
  renderSolutionBoard();
}

function renderSolutionBoard() {
  solutionElement.style.setProperty("--cols", board.width);
  solutionElement.replaceChildren();
  const solution = solutions[currentSolution];
  const colored = new Map();
  if (solution) solution.forEach((placement, placementIndex) => {
    placement.cells.forEach(([x, y]) => colored.set(`${x},${y}`, { tileIndex: placement.tileIndex, placementIndex }));
  });
  for (let y = 0; y < board.height; y += 1) for (let x = 0; x < board.width; x += 1) {
    const key = `${x},${y}`;
    const cell = document.createElement("span");
    cell.className = `cell ${board.active.has(key) ? "on" : "off"}`;
    const data = colored.get(key);
    if (data) {
      cell.style.background = tiles[data.tileIndex]?.color || palette[data.placementIndex % palette.length];
      cell.style.borderStyle = "solid";
      cell.style.borderColor = "#27352d";
      const same = (dx, dy) => colored.get(`${x + dx},${y + dy}`)?.placementIndex === data.placementIndex;
      cell.style.borderWidth = [[0,-1],[1,0],[0,1],[-1,0]].map(([dx,dy]) => same(dx,dy) ? "0px" : "3px").join(" ");
      cell.textContent = data.placementIndex + 1;
      cell.title = tiles[data.tileIndex]?.name || "tile";
    }
    solutionElement.append(cell);
  }
  $("#solution-count").textContent = solutions.length.toLocaleString("ja-JP");
  $("#solution-index").textContent = solutions.length ? `${currentSolution + 1} / ${solutions.length}` : "— / —";
  $("#previous-solution").disabled = currentSolution <= 0;
  $("#next-solution").disabled = currentSolution >= solutions.length - 1;
}

$("#resize-board").addEventListener("click", () => {
  const width = Math.min(16, Math.max(1, Math.floor(Number($("#board-width").value) || 6)));
  const height = Math.min(16, Math.max(1, Math.floor(Number($("#board-height").value) || 6)));
  $("#board-width").value = width;
  $("#board-height").value = height;
  resetBoard(width, height);
});
$("#fill-board").addEventListener("click", () => resetBoard());
$("#clear-board").addEventListener("click", () => { board.active.clear(); clearSolutions(); renderBoard(); });
$("#add-tile").addEventListener("click", addTile);
$("#clear-tile").addEventListener("click", () => { editorCells.clear(); renderEditor(); });
$("#load-preset").addEventListener("click", () => {
  const preset = presets[$("#preset-select").value];
  editorCells = new Set(preset.cells.map(([x, y]) => `${x + 1},${y + 1}`));
  $("#tile-name").value = preset.name;
  renderEditor();
});
$("#find-one").addEventListener("click", () => startSolve(true));
$("#enumerate").addEventListener("click", () => startSolve(false));
$("#cancel").addEventListener("click", () => { finishWorker(); setStatus("探索を中止しました。", "idle"); });
$("#previous-solution").addEventListener("click", () => { currentSolution -= 1; renderSolutionBoard(); });
$("#next-solution").addEventListener("click", () => { currentSolution += 1; renderSolutionBoard(); });

resetBoard();
renderEditor();
renderTiles();
addTile();
