import test from "node:test";
import assert from "node:assert/strict";
import { createShareUrl, encodePuzzle, decodePuzzle } from "../sharing.js";
import { SAMPLE_PUZZLES, createSamplePuzzle } from "../samples.js";
import { cellKey, shapedBoard, transformShape } from "../lattice.js";
import { solveTilings } from "../solver.js";

const fromData = data => Buffer.from(JSON.stringify(data)).toString("base64url");
const rawData = puzzle => JSON.parse(Buffer.from(encodePuzzle(puzzle), "base64url").toString());

for (const sample of SAMPLE_PUZZLES) {
  test(`${sample.id}: a shared URL restores holes, tiles, settings and solution counts`, () => {
    const original = createSamplePuzzle(sample.id);
    original.title = `自作 ${sample.title} 🧩`;
    original.description = "説明の一行目\n改行・記号：±1 / # & = 🐈";
    original.options.maxSolutions = 200;
    original.options.timeLimitMs = 12000;
    original.tiles.forEach((tile, index) => { tile.color = index ? "#247ba0" : "#1a936f"; });
    const url = new URL(createShareUrl(original, "https://example.com/solver/?old=1#old"));
    assert.equal(url.pathname, "/solver/");
    assert.equal(url.search, "");
    assert.ok(url.href.length < 1500, "small puzzles should have practical link lengths");
    const restored = decodePuzzle(url.hash.slice(8));
    assert.equal(restored.title, original.title);
    assert.equal(restored.description, original.description);
    assert.deepEqual(restored.board.cells.map(cellKey).sort(), original.board.cells.map(cellKey).sort());
    assert.deepEqual(restored.options, original.options);
    restored.tiles.forEach((tile, index) => {
      const expected = original.tiles[index];
      for (const field of ["name", "count", "rotate", "reflect", "color", "editorSize"]) assert.equal(tile[field], expected[field]);
      assert.deepEqual(tile.cells, transformShape(original.grid, expected.cells));
      assert.deepEqual(tile.editorCells.map(cellKey).sort(), expected.editorCells.map(cellKey).sort());
    });
    for (const symmetry of ["same", "different"]) {
      const result = solveTilings(restored.board, restored.tiles, { ...restored.options, symmetry });
      assert.equal(result.stopped, "complete");
      assert.equal(result.solutions.length, sample.expected[symmetry]);
    }
  });
}

test("fixed tile orientation is preserved when editor coordinates are reconstructed", () => {
  const puzzle = createSamplePuzzle("first-domino");
  puzzle.board = shapedBoard("square", 2);
  puzzle.tiles = [{ name: "縦だけ", cells: [[3, 2], [3, 3]], count: 2, rotate: false, reflect: false, color: "#abcdef" }];
  const restored = decodePuzzle(encodePuzzle(puzzle));
  assert.deepEqual(restored.tiles[0].cells, [[0, 0], [0, 1]]);
  assert.equal(restored.tiles[0].rotate, false);
  assert.equal(restored.tiles[0].reflect, false);
  assert.equal(solveTilings(restored.board, restored.tiles).solutions.length, 1);
});

test("maximum size boards and tiles remain editable in all three grids", () => {
  for (const grid of ["square", "triangle", "hex"]) {
    const board = shapedBoard(grid, 16);
    const puzzle = { title: grid, description: "", board, tiles: [{ cells: board.cells, count: 1, rotate: false, reflect: true }], options: { symmetry: "same", maxSolutions: 10000, timeLimitMs: 120000 } };
    const token = encodePuzzle(puzzle), restored = decodePuzzle(token);
    assert.ok(token.length < 1500);
    assert.equal(restored.tiles[0].editorSize, 16);
    assert.deepEqual(restored.board.cells, board.cells);
    const fullEditor = new Set(shapedBoard(grid, restored.tiles[0].editorSize).cells.map(cellKey));
    assert.ok(restored.tiles[0].editorCells.every(cell => fullEditor.has(cellKey(cell))));
    assert.deepEqual(restored.tiles[0].cells, transformShape(grid, board.cells));
  }
});

test("packing an axial tile only translates its original shape", () => {
  const puzzle = createSamplePuzzle("hex-flower");
  puzzle.tiles = [{ cells: [[0, 2], [1, 1], [2, 0]], count: 0, rotate: false, reflect: false }];
  const restored = decodePuzzle(encodePuzzle(puzzle));
  assert.deepEqual(restored.tiles[0].cells, transformShape("hex", puzzle.tiles[0].cells));
});

test("decode rejects malformed, oversized, unsupported and invalid problem data", () => {
  for (const token of ["", "!", "a", "abc=", "a".repeat(32001), Buffer.from([0xff, 0xff]).toString("base64url"), fromData(null), fromData({ v: 2 })]) assert.throws(() => decodePuzzle(token));
  const invalid = [
    data => { data.b[0] = 4; },
    data => { data.b[1] = 1000000; },
    data => { data.b[3] = "00"; },
    data => { data.b[3] = "ff"; }, // Bits outside the 3x2 board.
    data => { data.t = []; },
    data => { data.t = Array(65).fill(data.t[0]); },
    data => { data.t[0][1] = -1; },
    data => { data.t[0][1] = 0.5; },
    data => { data.t[0][2] = 4; },
    data => { data.t[0][3] = "url(https://example.com)"; },
    data => { data.t[0][4] = 100; },
    data => { data.t[0][5] = "5000000"; }, // Two disconnected cells in the size-5 square editor.
    data => { data.t[0][5] = "0000000"; },
    data => { data.title = "x".repeat(81); },
    data => { data.description = {}; },
    data => { data.s[0] = "same"; },
    data => { data.s[1] = 10001; },
    data => { data.s[2] = 0; },
  ];
  for (const mutate of invalid) {
    const data = rawData(createSamplePuzzle("first-domino"));
    mutate(data);
    assert.throws(() => decodePuzzle(fromData(data)));
  }
});

test("publisher rejects empty boards, outside cells and disconnected tiles", () => {
  for (const mutate of [
    p => { p.board.cells = []; },
    p => { p.board.cells.push([30, 30]); },
    p => { p.board.cells.push(p.board.cells[0]); },
    p => { p.tiles = []; },
    p => { p.tiles[0].cells = [[0, 0], [2, 0]]; },
    p => { p.tiles[0].grid = "triangle"; },
  ]) {
    const puzzle = createSamplePuzzle("first-domino");
    mutate(puzzle);
    assert.throws(() => encodePuzzle(puzzle));
  }
  assert.throws(() => createShareUrl(createSamplePuzzle("first-domino"), "file:///test.html"));
});

test("text resembling markup stays plain data and extra fields are ignored", () => {
  const data = rawData(createSamplePuzzle("first-domino"));
  data.title = "<img src=x onerror=alert(1)>";
  data.description = "</textarea><script>alert('test')</script>";
  data.untrusted = { script: "alert(1)" };
  const restored = decodePuzzle(fromData(data));
  assert.equal(restored.title, data.title);
  assert.equal(restored.description, data.description);
  assert.equal(restored.untrusted, undefined);
});
