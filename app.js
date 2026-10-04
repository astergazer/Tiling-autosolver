import { cellKey, shapedBoard, cellPolygon } from "./lattice.js?v=20261004-gallery1";
import { SAMPLE_PUZZLES, createSamplePuzzle } from "./samples.js?v=20261004-gallery1";

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
let beforeSample = null;

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

function resetBoard(size = Number($("#board-width").value), height = Number($("#board-height").value)) {
  const grid = $("#grid-type").value;
  size=Math.min(16,Math.max(1,Math.floor(size)||6));
  height=Math.min(16,Math.max(1,Math.floor(height)||6));
  $("#board-width").value=size; $("#board-height").value=height;
  const shape = shapedBoard(grid, size, height);
  board = {...shape, active:new Set(shape.cells.map(cellKey))};
  updateBoardControls();
  clearSolutions(); renderBoard();
}

function updateBoardControls() {
  $("#width-label").textContent = board.grid === "square" ? "横" : "一辺のセル数";
  $("#height-field").hidden = board.grid !== "square";
  $("#preset-select").disabled = board.grid !== "square";
  $("#load-preset").disabled = board.grid !== "square";
}

const puzzleFields = ["grid-type", "board-width", "board-height", "editor-size", "tile-name", "tile-count", "tile-color", "preset-select", "symmetry-mode", "solution-limit", "time-limit"];

function capturePuzzle() {
  return structuredClone({
    board, tiles, editorCells, editingTileId,
    fields: Object.fromEntries(puzzleFields.map(id => [id, $(`#${id}`).value])),
    rotate: $("#tile-rotate").checked, reflect: $("#tile-reflect").checked,
  });
}

function loadSample(id) {
  const sample = createSamplePuzzle(id);
  beforeSample = capturePuzzle();
  $("#grid-type").value = sample.grid;
  resetBoard(sample.size, sample.height ?? sample.size);
  board.active = new Set(sample.board.cells.map(cellKey));
  tiles = sample.tiles.map((tile, index) => ({ ...tile, id: crypto.randomUUID(), color: palette[index % palette.length] }));
  const firstTile = tiles[0];
  editingTileId = firstTile.id;
  editorCells = new Set(firstTile.editorCells.map(cellKey));
  $("#editor-size").value = firstTile.editorSize;
  $("#tile-name").value = firstTile.name;
  $("#tile-count").value = firstTile.count;
  $("#tile-color").value = firstTile.color;
  $("#tile-rotate").checked = firstTile.rotate;
  $("#tile-reflect").checked = firstTile.reflect;
  $("#add-tile").textContent = "変更を保存";
  $("#symmetry-mode").value = sample.options.symmetry;
  $("#solution-limit").value = sample.options.maxSolutions;
  $("#time-limit").value = sample.options.timeLimitMs / 1000;
  renderBoard(); renderEditor(); renderTiles();
  $("#sample-gallery").open = false;
  $("#sample-feedback").hidden = false;
  $("#undo-sample").hidden = false;
  $("#sample-message").textContent = `「${sample.title}」を読み込みました。「解を列挙」で試せます。`;
  setStatus("サンプルを読み込みました。「対称な解」を切り替えて解数を比べてみましょう。");
  $("#board-heading").focus({ preventScroll: true });
}

function undoSample() {
  if (!beforeSample) return;
  ({ board, tiles, editorCells, editingTileId } = beforeSample);
  for (const [id, value] of Object.entries(beforeSample.fields)) $(`#${id}`).value = value;
  $("#tile-rotate").checked = beforeSample.rotate;
  $("#tile-reflect").checked = beforeSample.reflect;
  $("#add-tile").textContent = editingTileId ? "変更を保存" : "種類を追加";
  beforeSample = null;
  updateBoardControls(); clearSolutions(); renderBoard(); renderEditor(); renderTiles();
  $("#undo-sample").hidden = true;
  $("#sample-message").textContent = "読み込み直前の盤面・タイル・探索設定に戻しました。";
  $("#board-heading").focus({ preventScroll: true });
}

function renderSamples() {
  const list = $("#sample-list");
  const names = { square: "正方格子", triangle: "三角格子", hex: "六角格子" };
  list.replaceChildren();
  for (const entry of SAMPLE_PUZZLES) {
    const sample = createSamplePuzzle(entry.id);
    const card = document.createElement("article"); card.className = "sample-card";
    const tag = document.createElement("p"); tag.className = "sample-tag";
    tag.textContent = `${names[sample.grid]} · ${sample.board.cells.length}セル`;
    const title = document.createElement("h3"); title.textContent = sample.title;
    const preview = document.createElement("div"); preview.className = "sample-preview";
    preview.setAttribute("aria-hidden", "true");
    const shape = shapedBoard(sample.grid, sample.size, sample.height ?? sample.size);
    drawGrid(preview, sample.grid, shape.cells, new Set(sample.board.cells.map(cellKey)));
    const description = document.createElement("p"); description.className = "sample-description";
    description.textContent = sample.description;
    const load = document.createElement("button"); load.className = "button secondary";
    load.textContent = "この問題を読み込む";
    load.setAttribute("aria-label", `${sample.title}を読み込む`);
    load.dataset.sampleId = sample.id;
    load.addEventListener("click", () => loadSample(sample.id));
    const answer = document.createElement("details"); answer.className = "sample-answer";
    const summary = document.createElement("summary"); summary.textContent = "解数とヒントを見る";
    const counts = document.createElement("p");
    counts.textContent = `初期設定の全解数：${sample.expected.different}。盤面の回転・反転を同じと数えると：${sample.expected.same}。`;
    const hint = document.createElement("p"); hint.textContent = sample.hint;
    answer.append(summary, counts, hint);
    card.append(tag, title, preview, description, load, answer);
    list.append(card);
  }
}

const svgNS = "http://www.w3.org/2000/svg";
function svgNode(name, attrs = {}) {
  const node = document.createElementNS(svgNS,name);
  for(const [key,value] of Object.entries(attrs)) node.setAttribute(key,String(value));
  return node;
}

function drawGrid(container, grid, cells, selected, onToggle = null, placed = new Map()) {
  container.replaceChildren();
  if(!cells.length) return;
  const polygons = cells.map(cell => cellPolygon(grid,cell));
  const points = polygons.flat();
  const minX = Math.min(...points.map(p=>p[0])), maxX = Math.max(...points.map(p=>p[0]));
  const minY = Math.min(...points.map(p=>p[1])), maxY = Math.max(...points.map(p=>p[1]));
  const viewWidth = maxX-minX+.24, viewHeight = maxY-minY+.24;
  const width = Math.min(560,viewWidth*48), height = width*viewHeight/viewWidth;
  const svg = svgNode("svg", {
    viewBox:`${minX-.12} ${minY-.12} ${viewWidth} ${viewHeight}`,
    width,height,preserveAspectRatio:"xMidYMid meet",class:"lattice-svg",
  });
  svg.style.width = `${width}px`;
  const edges = new Map();
  let painting = null;
  const apply = (polygon,id,value) => {
    onToggle(id,value); polygon.classList.toggle("selected",value);
    polygon.setAttribute("aria-pressed",String(value));
  };
  cells.forEach((cell,i)=>{
    const id=cellKey(cell), vertices=polygons[i], data=placed.get(id);
    const polygon=svgNode("polygon",{points:vertices.map(p=>p.join(",")).join(" "),class:`lattice-polygon${selected.has(id)?" selected":""}`});
    if(data) { polygon.style.fill=data.color; polygon.style.stroke=data.color; }
    vertices.forEach((point,j)=>{
      const a=point.join(","), b=vertices[(j+1)%vertices.length].join(",");
      edges.set([a,b].sort().join(";"),`M${a}L${b}`);
    });
    const title=svgNode("title"); title.textContent=data?.name || `セル (${id})`; polygon.append(title);
    if(onToggle) {
      polygon.setAttribute("tabindex","0"); polygon.setAttribute("role","button");
      polygon.setAttribute("aria-label",`セル (${id})`); polygon.setAttribute("aria-pressed",String(selected.has(id)));
      polygon.addEventListener("pointerdown",e=>{if(e.button!==0)return; e.preventDefault(); painting=!selected.has(id); apply(polygon,id,painting);});
      polygon.addEventListener("pointerenter",e=>{if(painting!==null && e.buttons===1) apply(polygon,id,painting);});
      polygon.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();apply(polygon,id,!selected.has(id));}});
    }
    svg.append(polygon);
    if(data) {
      const cx=vertices.reduce((v,p)=>v+p[0],0)/vertices.length, cy=vertices.reduce((v,p)=>v+p[1],0)/vertices.length;
      const label=svgNode("text",{x:cx,y:cy,class:"piece-number"}); label.textContent=data.label; svg.append(label);
    }
  });
  // Draw each shared edge once over the fills. The fill-colored strokes
  // under this path cover rasterization hairlines at fractional pixel sizes.
  svg.append(svgNode("path",{d:[...edges.values()].join(" "),class:"lattice-edges","aria-hidden":"true"}));
  svg.addEventListener("pointerup",()=>{painting=null;});
  svg.addEventListener("pointerleave",()=>{painting=null;});
  container.append(svg);
}

function updateSummary() {
  const names={square:"四角形",triangle:"正三角形",hex:"六角形"};
  $("#board-summary").textContent=`${names[board.grid]}の盤面 ／ 使用 ${board.active.size} セル`;
}
function renderBoard() {
  drawGrid(boardElement,board.grid,board.cells,board.active,(id,value)=>{
    value?board.active.add(id):board.active.delete(id); clearSolutions(); updateSummary();
  });
  updateSummary(); renderSolutionBoard();
}
function renderEditor() {
  const grid=$("#grid-type").value;
  const size=Number($("#editor-size").value);
  editorSizeBeforeChange=size;
  const cells=shapedBoard(grid,size).cells;
  drawGrid(tileEditor,grid,cells,editorCells,(id,value)=>{
    value?editorCells.add(id):editorCells.delete(id);
  });
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
    editorCells:[...editorCells].map(id=>id.split(",").map(Number)), editorSize:Number($("#editor-size").value),
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
    drawGrid(preview,tile.grid,tile.cells,new Set(tile.cells.map(cellKey)));
    const info = document.createElement("div");
    const title = document.createElement("h3"); title.textContent = tile.name;
    const meta = document.createElement("p"); meta.textContent = `${tile.grid} · ${tile.cells.length}セル · ${tile.count || "無制限"}枚 · ${tile.rotate ? "回転あり" : "固定"}${tile.reflect ? "・反転あり" : ""}`;
    info.append(title, meta);
    const actions = document.createElement("div"); actions.className = "tile-actions";
    const edit = document.createElement("button"); edit.className = "button secondary"; edit.textContent = "編集";
    edit.disabled = tile.grid !== $("#grid-type").value;
    edit.addEventListener("click", () => {
      editingTileId = tile.id;
      // Restore the original editor coordinates so re-editing cannot clip a shape.
      editorCells = new Set((tile.editorCells || tile.cells).map(cellKey));
      $("#editor-size").value = tile.editorSize || 5;
      $("#tile-name").value = tile.name; $("#tile-count").value = tile.count;
      $("#tile-rotate").checked = tile.rotate; $("#tile-reflect").checked = tile.reflect; $("#tile-color").value = tile.color;
      $("#add-tile").textContent = "変更を保存"; renderEditor();
    });
    const remove = document.createElement("button"); remove.className = "remove-tile"; remove.textContent = "×"; remove.title = `${tile.name}を削除`;
    remove.addEventListener("click", () => { tiles = tiles.filter((item) => item.id !== tile.id); if(editingTileId===tile.id){editingTileId=null;$("#add-tile").textContent="種類を追加";} clearSolutions(); renderTiles(); });
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
  worker = new Worker(new URL("worker.js?v=20261004-gallery1",import.meta.url), { type: "module" });
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
  const placed = new Map();
  const solution = solutions[currentSolution];
  if(solution) solution.forEach((placement,index)=>placement.cells.forEach(cell=>{
    placed.set(cellKey(cell),{color:palette[index%palette.length],label:index+1,name:solvedTiles[placement.tileIndex]?.name || "タイル"});
  }));
  drawGrid(solutionElement,board.grid,board.cells.filter(c=>board.active.has(cellKey(c))),board.active,null,placed);
  $("#solution-count").textContent = solutions.length.toLocaleString("ja-JP");
  $("#solution-index").textContent = solutions.length ? `${currentSolution + 1} / ${solutions.length}` : "— / —";
  $("#previous-solution").disabled = currentSolution <= 0;
  $("#next-solution").disabled = currentSolution >= solutions.length - 1;
}

$("#grid-type").addEventListener("change", () => {
  editingTileId = null; editorCells.clear();
  const grid = $("#grid-type").value;
  editorCells = new Set(grid === "triangle" ? ["1,2,0","1,2,1"] : grid === "hex" ? ["4,4","5,4"] : ["1,2","2,2"]);
  $("#add-tile").textContent = "種類を追加";
  $("#editor-size").value=5; resetBoard(); renderEditor(); renderTiles();
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
  $("#editor-size").value=5;
  editorCells = new Set(preset.cells.map(([x, y]) => `${x + 1},${y + 1}`)); $("#tile-name").value = preset.name;
  editingTileId = null; $("#add-tile").textContent = "種類を追加"; renderEditor();
});
$("#symmetry-mode").addEventListener("change",clearSolutions);
$("#undo-sample").addEventListener("click", undoSample);
$("#editor-size").addEventListener("change",()=>{
  const size=Math.min(16,Math.max(2,Math.floor(Number($("#editor-size").value)||5)));
  const allowed=new Set(shapedBoard(board.grid,size).cells.map(cellKey));
  if([...editorCells].some(id=>!allowed.has(id))) {
    $("#editor-size").value=editorSizeBeforeChange;
    setStatus("選択セルが編集面の外に出るため、縮小できません。先に外側のセルを消してください。","error"); return;
  }
  $("#editor-size").value=size; editorSizeBeforeChange=size; renderEditor();
});
let editorSizeBeforeChange=5;
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
renderSamples();
