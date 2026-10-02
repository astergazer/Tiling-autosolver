# Tiling Autosolver

A browser-based polyomino tiling enumerator. Draw a board, define tiles, and enumerate exact coverings without sending puzzle data to a server.

## Features

- Editable rectangular or holey boards (up to 16 × 16)
- Custom polyomino editor and useful presets
- Optional rotations, reflections, and per-type copy limits
- One-solution search or bounded enumeration
- Web Worker execution, time limit, and immediate cancellation
- Solution navigation and search statistics
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

A tile count of `0` means unlimited copies. Positive counts require exactly that many copies, including when mixed with unlimited types. Board rotations and reflections are counted separately. Different registered tile types are distinguishable even if their shapes coincide. Enumeration stops at the configured solution or time limit; a partial count is not a total count.

## Current scope

This initial version does not yet implement symmetry reduction, count-only mode, puzzle import/export, or search animation.

## GitHub Pages

The repository is a static site. In **Settings → Pages**, select **Deploy from a branch**, choose `main` and `/ (root)`, then save.

## License

MIT
