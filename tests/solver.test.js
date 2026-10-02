import test from "node:test";
import assert from "node:assert/strict";
import { analyzeProblem, normalizeCells, orientations, solveTilings } from "../solver.js";

const fullBoard = (width, height) => ({
  width, height,
  cells: Array.from({ length: width * height }, (_, index) => [index % width, Math.floor(index / width)]),
});
const domino = { name: "Domino", cells: [[0, 0], [1, 0]], count: 0, rotate: true, reflect: false };

test("normalizes translated cells", () => {
  assert.deepEqual(normalizeCells([[4, 8], [3, 8], [3, 9]]), [[0, 0], [1, 0], [0, 1]]);
});

test("deduplicates symmetric orientations", () => {
  assert.equal(orientations(domino.cells, true, true).length, 2);
  assert.equal(orientations([[0, 0]], true, true).length, 1);
});

test("enumerates the two domino tilings of a 2x2 board", () => {
  const result = solveTilings(fullBoard(2, 2), [domino], { maxSolutions: 10 });
  assert.equal(result.solutions.length, 2);
  assert.equal(result.stopped, "complete");
});

test("enumerates the three domino tilings of a 3x2 board", () => {
  const result = solveTilings(fullBoard(3, 2), [domino], { maxSolutions: 10 });
  assert.equal(result.solutions.length, 3);
});

test("rejects incompatible limited tile area before search", () => {
  const result = analyzeProblem(fullBoard(3, 3), [{ ...domino, count: 4 }]);
  assert.equal(result.ok, false);
  assert.match(result.message, /合計面積/);
});

test("returns no solution for an odd board with unlimited dominoes", () => {
  const result = solveTilings(fullBoard(3, 3), [domino]);
  assert.equal(result.solutions.length, 0);
  assert.equal(result.stopped, "invalid");
});

test("mixed inventories consume all explicitly requested copies", () => {
  const mono = { cells: [[0, 0]], count: 0, rotate: true };
  const result = solveTilings(fullBoard(2, 2), [{ ...domino, count: 1 }, mono], { maxSolutions: 100 });
  assert.equal(result.solutions.length, 4);
  for (const solution of result.solutions) {
    assert.equal(solution.filter(p => p.tileIndex === 0).length, 1);
    assert.equal(solution.filter(p => p.tileIndex === 1).length, 2);
  }
});

test("4x4 domino enumeration gives 36 distinct exact covers", () => {
  const result = solveTilings(fullBoard(4, 4), [domino], { maxSolutions: 100 });
  assert.equal(result.stopped, "complete");
  assert.equal(result.solutions.length, 36);
  const signatures = result.solutions.map(solution => {
    const cells = solution.flatMap(p => p.keys);
    assert.equal(cells.length, 16);
    assert.equal(new Set(cells).size, 16);
    return solution.map(p => [...p.keys].sort().join(";")).sort().join("|");
  });
  assert.equal(new Set(signatures).size, 36);
});

test("holes with checkerboard imbalance admit no domino tiling", () => {
  const board = fullBoard(4, 4);
  board.cells = board.cells.filter(([x,y]) => !(x===0 && y===0) && !(x===3 && y===3));
  const result = solveTilings(board, [domino], { maxSolutions: 100 });
  assert.equal(result.solutions.length, 0);
  assert.equal(result.stopped, "complete");
});

test("rotation-disabled dominoes have one 2x2 tiling", () => {
  assert.equal(solveTilings(fullBoard(2, 2), [{ ...domino, rotate: false }], { maxSolutions: 10 }).solutions.length, 1);
});
