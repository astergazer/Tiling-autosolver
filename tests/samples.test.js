import test from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_PUZZLES, createSamplePuzzle } from "../samples.js";
import { cellKey, shapedBoard } from "../lattice.js";
import { solveTilings } from "../solver.js";

for (const sample of SAMPLE_PUZZLES) {
  test(`${sample.id}: both advertised counts are complete, valid exact covers`, () => {
    const puzzle = createSamplePuzzle(sample.id);
    const expectedCells = puzzle.board.cells.map(cellKey).sort();
    for (const symmetry of ["different", "same"]) {
      const result = solveTilings(puzzle.board, puzzle.tiles, { ...puzzle.options, symmetry });
      assert.equal(result.stopped, "complete", `${symmetry}: must finish, not hit a limit`);
      assert.equal(result.solutions.length, sample.expected[symmetry]);
      for (const solution of result.solutions) {
        assert.deepEqual(solution.flatMap(p => p.cells.map(cellKey)).sort(), expectedCells);
        puzzle.tiles.forEach((tile, index) => {
          if (tile.count > 0) assert.equal(solution.filter(p => p.tileIndex === index).length, tile.count);
        });
      }
    }
  });
}

test("all sample tiles fit their editing surface and preserve their cell orientation", () => {
  for (const sample of SAMPLE_PUZZLES) {
    const puzzle = createSamplePuzzle(sample.id);
    for (const tile of puzzle.tiles) {
      const allowed = new Set(shapedBoard(tile.grid, tile.editorSize).cells.map(cellKey));
      assert.ok(tile.editorCells.every(cell => allowed.has(cellKey(cell))), sample.id);
      const [dx, dy, dz] = tile.editorCells[0].map((value, index) => value - tile.cells[0][index]);
      assert.deepEqual(tile.editorCells.map(cell => cell.map((value, index) => index === 0 ? value - dx : index === 1 ? value - dy : tile.grid === "cubic" ? value - dz : value)), tile.cells);
    }
  }
});

test("reloading a sample discards edits without modifying any other sample", () => {
  const before = JSON.stringify(SAMPLE_PUZZLES);
  const first = createSamplePuzzle("first-domino");
  first.board.cells.pop();
  first.tiles[0].cells[0][0] = 99;
  first.tiles[0].editorCells.pop();
  first.options.symmetry = "same";
  assert.equal(JSON.stringify(SAMPLE_PUZZLES), before);
  const reloaded = createSamplePuzzle("first-domino");
  assert.equal(reloaded.board.cells.length, 6);
  assert.equal(reloaded.tiles[0].cells[0][0], 0);
  assert.equal(reloaded.tiles[0].editorCells.length, 2);
  assert.equal(reloaded.options.symmetry, "different");
  assert.throws(() => createSamplePuzzle("unknown"), /Unknown sample/);
});
