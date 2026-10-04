# Tiling Autosolver

A browser-based tiling enumerator. Draw a board, define tiles, and enumerate exact coverings without sending puzzle data to a server.

## Features

- Six one-click sample puzzles across all three grids, with optional hints and verified counts in both symmetry modes
- Restore the board, tiles, unsaved tile edit, and search settings from immediately before the last sample load
- Editable rectangular or holey boards on square, triangular, or hexagonal grids (up to 16 × 16 lattice cells)
- Custom tile editor and square-grid presets
- Optional rotations, reflections, and per-type copy limits
- One-solution search or bounded enumeration
- Web Worker execution, time limit, and immediate cancellation
- Solution navigation and search statistics
- Optional symmetry reduction: board rotations and reflections can count as the same solution
- No build step or external runtime dependencies

## Run locally

ES modules and Web Workers require an HTTP server:

```bash
npm run serve
```

Then open <http://localhost:8000>.

## Test

```bash
npm test
```

## Solver model

The solver generates every legal placement of every allowed orientation. During depth-first search it chooses the uncovered board cell with the fewest currently legal placements, then branches only on placements covering that cell. Choosing one uncovered cell at each state also prevents permutations of identical tile copies from being counted as separate tilings.

A tile count of `0` means unlimited copies. Positive counts require exactly that many copies, including when mixed with unlimited types. By default, board rotations and reflections count as different solutions; symmetry mode merges solutions under rotations and reflections that preserve the board shape. Different registered tile types are distinguishable even if their shapes coincide. Enumeration stops at the configured solution or time limit; a partial count is not a total count.

## Sample puzzles

Open **サンプルから遊ぶ**, choose a puzzle, and press **解を列挙**. Change **対称な解** to compare counts. **解数とヒントを見る** reveals the complete counts for the original sample settings; editing the puzzle can change those counts. Loading a sample stops any running search and replaces the current puzzle and search settings. **読み込みを戻す** restores the state immediately before the most recent load, including an unsaved tile edit; search results are cleared and can be recomputed. This undo is available within the current page session.

| Sample | Separate rotations/reflections | Merge board symmetries |
| --- | ---: | ---: |
| 3×2 dominoes | 3 | 2 |
| 4×4 dominoes | 36 | 9 |
| Triangle with three 3-cell tiles | 2 | 1 |
| Seven-cell hexagon, three dominoes and one single cell | 20 | 3 |
| Six-cell hexagonal ring | 2 | 1 |
| 4×4 board missing opposite corners | 0 | 0 |

`samples.js` holds the puzzle definitions. The tests fully enumerate every sample in both modes and validate coverage and exact tile inventories.

## Current scope

The triangular board is an equilateral triangle with n² small triangles. The hexagonal board has 1 + 3n(n−1) complete hexagonal cells arranged with sixfold symmetry; its perimeter follows the cell edges. Choose the side length to resize either board. Board editing, tile editing, previews and solutions share SVG polygons derived from the solver coordinates. Click or drag to paint cells. The tile editor uses the same board shape and can be resized from 2 to 16. Preset tiles are currently available on the square grid; other grids use the custom tile editor. Count-only mode, puzzle import/export, and search animation are not implemented.

## GitHub Pages

The repository is a static site. In **Settings → Pages**, select **Deploy from a branch**, choose `main` and `/ (root)`, then save.

## License

MIT
