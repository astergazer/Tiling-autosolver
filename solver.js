/** Lattice-cell tiling solver used by both the browser worker and tests. */
import { allBoardSymmetries, cellKey, orientationsForGrid, solutionSymmetryKey } from "./lattice.js?v=20261004-share1";

export function normalizeCells(cells) {
  if (!cells.length) return [];
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  return cells
    .map(([x, y]) => [x - minX, y - minY])
    .sort(([ax, ay], [bx, by]) => ay - by || ax - bx);
}

function shapeKey(cells) {
  return normalizeCells(cells).map(([x, y]) => `${x},${y}`).join(";");
}

export function orientations(cells, allowRotate = true, allowReflect = false) {
  const result = new Map();
  const rotations = allowRotate ? [0, 1, 2, 3] : [0];
  const reflections = allowReflect ? [false, true] : [false];

  for (const reflected of reflections) {
    for (const turns of rotations) {
      const transformed = cells.map(([originalX, originalY]) => {
        let x = reflected ? -originalX : originalX;
        let y = originalY;
        for (let i = 0; i < turns; i += 1) [x, y] = [-y, x];
        return [x, y];
      });
      const normalized = normalizeCells(transformed);
      result.set(shapeKey(normalized), normalized);
    }
  }
  return [...result.values()];
}

export function analyzeProblem(board, tiles) {
  const boardArea = board.cells.length;
  if (boardArea === 0) return { ok: false, message: "盤面に有効なマスがありません。" };
  if (!tiles.length) return { ok: false, message: "タイルを1種類以上追加してください。" };
  if (tiles.some((tile) => tile.cells.length === 0)) {
    return { ok: false, message: "空のタイルは使用できません。" };
  }

  const limitedArea = tiles.reduce(
    (sum, tile) => sum + (tile.count > 0 ? tile.count * tile.cells.length : 0),
    0,
  );
  if (tiles.some(tile => !Number.isInteger(tile.count) || tile.count < 0)) return { ok: false, message: "枚数は0以上の整数で指定してください。" };
  if (limitedArea > boardArea) return { ok: false, message: "指定タイルの合計面積が盤面を超えています。" };
  const hasUnlimited = tiles.some((tile) => !tile.count || tile.count < 1);
  if (!hasUnlimited && limitedArea !== boardArea) {
    return {
      ok: false,
      message: `盤面は${boardArea}マスですが、指定タイルの合計面積は${limitedArea}です。`,
    };
  }

  const sizes = tiles.filter((tile) => !tile.count || tile.count < 1).map((tile) => tile.cells.length);
  if (sizes.length) {
    const gcd = sizes.reduce((a, b) => {
      while (b) [a, b] = [b, a % b];
      return a;
    });
    if ((boardArea - limitedArea) % gcd !== 0) {
      return { ok: false, message: "面積の合同条件を満たさないため敷き詰められません。" };
    }
  }
  return { ok: true, message: "探索可能です。" };
}

function buildPlacements(board, tiles) {
  const grid = board.grid ?? "square";
  const boardSet = new Set(board.cells.map(cellKey));
  const byCell = new Map([...boardSet].map((key) => [key, []]));
  const placements = [];

  tiles.forEach((tile, tileIndex) => {
    const variants = orientationsForGrid(grid, tile.cells, tile.rotate !== false, tile.reflect === true);
    for (const variant of variants) {
      const maxX = Math.max(...variant.map(([x]) => x));
      const maxY = Math.max(...variant.map(([, y]) => y));
      const minX = Math.min(...variant.map(([x]) => x));
      const minY = Math.min(...variant.map(([, y]) => y));
      for (let y = -minY; y + maxY < board.height; y += 1) {
        for (let x = -minX; x + maxX < board.width; x += 1) {
          const absolute = variant.map((cell) => grid === "triangle"
            ? [cell[0] + x, cell[1] + y, cell[2]]
            : [cell[0] + x, cell[1] + y]);
          const keys = absolute.map(cellKey);
          if (!keys.every((key) => boardSet.has(key))) continue;
          const placement = { tileIndex, cells: absolute, keys };
          const placementIndex = placements.push(placement) - 1;
          keys.forEach((key) => byCell.get(key).push(placementIndex));
        }
      }
    }
  });
  return { placements, byCell, boardSet };
}

/**
 * Enumerate tilings. A tile count of 0 means unlimited copies.
 * The deterministic uncovered-cell choice prevents permutations of identical
 * copies from being counted as different solutions.
 */
export function solveTilings(board, tiles, options = {}) {
  const validation = analyzeProblem(board, tiles);
  if (!validation.ok) {
    return { solutions: [], nodes: 0, elapsedMs: 0, stopped: "invalid", message: validation.message };
  }

  const maxSolutions = Math.max(1, options.maxSolutions ?? 100);
  const timeLimitMs = Math.max(50, options.timeLimitMs ?? 10_000);
  const started = performance.now();
  const { placements, byCell, boardSet } = buildPlacements(board, tiles);
  const symmetryMaps = options.symmetry === "same" ? allBoardSymmetries(board.grid ?? "square", board.cells) : [];
  const uncovered = new Set(boardSet);
  const remaining = tiles.map((tile) => (tile.count > 0 ? tile.count : Infinity));
  const chosen = [];
  const solutions = [];
  const seenSolutions = new Set();
  let nodes = 0;
  let stopped = "complete";

  function available(placement) {
    return remaining[placement.tileIndex] > 0 && placement.keys.every((key) => uncovered.has(key));
  }

  function chooseCell() {
    let bestKey = null;
    let best = null;
    for (const key of uncovered) {
      const candidates = byCell.get(key).filter((index) => available(placements[index]));
      if (best === null || candidates.length < best.length) {
        bestKey = key;
        best = candidates;
        if (best.length === 0) break;
      }
    }
    return { key: bestKey, candidates: best ?? [] };
  }

  function search() {
    nodes += 1;
    if (performance.now() - started >= timeLimitMs) {
      stopped = "time";
      return true;
    }
    const requiredArea = remaining.reduce((sum, count, i) => sum + (Number.isFinite(count) ? count * tiles[i].cells.length : 0), 0);
    if (requiredArea > uncovered.size) return false;
    if (uncovered.size === 0) {
      const solution = chosen.map((index) => placements[index]);
      const symmetryKey = symmetryMaps.length ? solutionSymmetryKey(solution, symmetryMaps) : null;
      if (symmetryKey !== null && seenSolutions.has(symmetryKey)) return false;
      if (symmetryKey !== null) seenSolutions.add(symmetryKey);
      solutions.push(solution);
      if (solutions.length >= maxSolutions) {
        stopped = "limit";
        return true;
      }
      return false;
    }

    const { candidates } = chooseCell();
    if (!candidates.length) return false;
    for (const index of candidates) {
      const placement = placements[index];
      placement.keys.forEach((key) => uncovered.delete(key));
      remaining[placement.tileIndex] -= 1;
      chosen.push(index);
      const shouldStop = search();
      chosen.pop();
      remaining[placement.tileIndex] += 1;
      placement.keys.forEach((key) => uncovered.add(key));
      if (shouldStop) return true;
    }
    return false;
  }

  search();
  return {
    solutions,
    nodes,
    elapsedMs: performance.now() - started,
    stopped,
    message: solutions.length ? "解が見つかりました。" : stopped === "complete" ? "解はありません。" : "制限時間内に解は見つかりませんでした。解の有無は未確定です。",
  };
}
