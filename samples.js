import { cellKey, shapedBoard } from "./lattice.js?v=20261005-cubic1";

const domino = { name: "ドミノ", cells: [[0, 0], [1, 0]], count: 0 };

export const SAMPLE_PUZZLES = [
  {
    id: "cube-domino", title: "立方体をドミノで", grid: "cubic", size: 2, depth: 2,
    description: "2×2×2の立方体を、2立方体のドミノ4本で充填します。",
    hint: "各層の中で敷く配置と、上下の層をつなぐ配置を比べてみましょう。",
    expected: { different: 9, same: 2 },
    tiles: [{ name: "立体ドミノ", cells: [[0,0,0],[1,0,0]], count: 4 }],
  },
  {
    id: "cube-corner", title: "立体の角を組み合わせる", grid: "cubic", size: 2, depth: 2,
    description: "3方向に腕を伸ばす4立方体のピース2個。平面には収まらない形を回して組み合わせます。",
    hint: "ピースの中心となる角を、立方体の対角に置いてみましょう。",
    expected: { different: 4, same: 1 },
    tiles: [{ name: "立体の角", cells: [[0,0,0],[1,0,0],[0,1,0],[0,0,1]], count: 2 }],
  },
  {
    id: "first-domino", title: "はじめてのドミノ", grid: "square", size: 3, height: 2,
    description: "3×2の盤面を2セルのドミノで埋める、小さな入門問題。",
    hint: "縦向きのドミノの位置に注目。左右を入れ替えた配置を同じと数えると？",
    expected: { different: 3, same: 2 }, tiles: [domino],
  },
  {
    id: "square-domino", title: "4×4のドミノ", grid: "square", size: 4,
    description: "少し大きな正方形。回転・反転の扱いで解数が大きく変わります。",
    hint: "対称性のある解もあるので、全解数を単純に8で割ることはできません。",
    expected: { different: 36, same: 9 }, tiles: [domino],
  },
  {
    id: "triangle-trio", title: "三角形を3枚で", grid: "triangle", size: 3,
    description: "9個の小三角形を、3セルからなる台形タイル3枚で敷き詰めます。",
    hint: "2つの解を鏡に映すと重なります。反転を同一視すると1解です。",
    expected: { different: 2, same: 1 },
    tiles: [{ name: "三角3セルの台形", cells: [[0, 0, 0], [0, 0, 1], [1, 0, 0]], count: 3 }],
  },
  {
    id: "hex-flower", title: "六角形の花", grid: "hex", size: 2,
    description: "六角2セルのタイル3枚と、1セルのタイル1枚。1セルをどこに置く？",
    hint: "1セルのタイルは中央にも外周にも置けます。外周に置く場合も配置を比べてみましょう。",
    expected: { different: 20, same: 3 },
    tiles: [{ name: "六角2セル", cells: [[0, 0], [1, 0]], count: 3 }, { name: "六角1セル", cells: [[0, 0]], count: 1 }],
  },
  {
    id: "hex-ring", title: "六角形の輪", grid: "hex", size: 2, removedCells: [[1, 1]],
    description: "中央に穴がある6セルの輪を、六角2セルのタイル3枚で埋めます。",
    hint: "輪に沿って1つおきにタイルを置くと2通り。60度回すと重なります。",
    expected: { different: 2, same: 1 },
    tiles: [{ name: "六角2セル", cells: [[0, 0], [1, 0]], count: 3 }],
  },
  {
    id: "missing-corners", title: "欠けたチェス盤", grid: "square", size: 4, removedCells: [[0, 0], [3, 3]],
    description: "対角の2隅を除いた14セル。面積は偶数なのに、ドミノで埋まらない？",
    hint: "市松模様に塗ると、除いた2セルは同じ色。ドミノは必ず白黒を1セルずつ覆います。",
    expected: { different: 0, same: 0 }, tiles: [domino],
  },
];

// Return independent data so editing a loaded puzzle never changes its sample.
export function createSamplePuzzle(id) {
  const source = SAMPLE_PUZZLES.find(sample => sample.id === id);
  if (!source) throw new Error(`Unknown sample: ${id}`);
  const sample = structuredClone(source);
  const board = shapedBoard(sample.grid, sample.size, sample.height ?? sample.size, sample.depth ?? sample.size);
  const removed = new Set((sample.removedCells ?? []).map(cellKey));
  board.cells = board.cells.filter(cell => !removed.has(cellKey(cell)));
  const offset = sample.grid === "hex" ? 4 : sample.grid === "cubic" ? 0 : 1;
  const tiles = sample.tiles.map(tile => ({
    ...tile, grid: sample.grid, rotate: true, reflect: true, editorSize: sample.grid === "cubic" ? 3 : 5,
    editorCells: tile.cells.map(cell => cell.map((value, index) => index < 2 || sample.grid === "cubic" ? value + offset : value)),
  }));
  return { ...sample, board, tiles, options: { symmetry: "different", maxSolutions: 100, timeLimitMs: 10000 } };
}
