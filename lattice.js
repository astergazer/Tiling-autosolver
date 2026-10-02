const key = (cell) => cell.join(",");

function rotateAxial([q, r]) { return [-r, q + r]; }
function reflectAxial([q, r]) { return [q + r, -r]; }

function triangleVertices([i, j, dir]) {
  return dir === 0
    ? [[i, j], [i + 1, j], [i, j + 1]]
    : [[i + 1, j + 1], [i + 1, j], [i, j + 1]];
}

function rotateVertex([x, y]) { return [-x - y, x]; }
function reflectVertex([x, y]) { return [x + y, -y]; }

function identifyTriangle(vertices) {
  const minX = Math.min(...vertices.map(([x]) => x));
  const minY = Math.min(...vertices.map(([, y]) => y));
  const points = vertices.map(([x, y]) => `${x - minX},${y - minY}`).sort().join(";");
  const up = "0,0;0,1;1,0";
  const down = "0,1;1,0;1,1";
  if (points === up) return [minX, minY, 0];
  if (points === down) return [minX, minY, 1];
  throw new Error(`Transformed triangle is not a lattice cell: ${points}`);
}

export function transformCell(grid, cell, turns = 0, reflected = false) {
  if (grid === "square") {
    let [x, y] = [2 * cell[0] + 1, 2 * cell[1] + 1];
    if (reflected) x = -x;
    for (let n = 0; n < turns; n += 1) [x, y] = [-y, x];
    return [(x - 1) / 2, (y - 1) / 2];
  }
  if (grid === "hex") {
    let value = cell;
    if (reflected) value = reflectAxial(value);
    for (let n = 0; n < turns; n += 1) value = rotateAxial(value);
    return value;
  }
  let vertices = triangleVertices(cell).map((point) => {
    let value = point;
    if (reflected) value = reflectVertex(value);
    for (let n = 0; n < turns; n += 1) value = rotateVertex(value);
    return value;
  });
  return identifyTriangle(vertices);
}

function normalize(cells, grid) {
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  const translated = cells.map((cell) => grid === "triangle"
    ? [cell[0] - minX, cell[1] - minY, cell[2]]
    : [cell[0] - minX, cell[1] - minY]);
  return translated.sort((a, b) => a[1] - b[1] || a[0] - b[0] || (a[2] ?? 0) - (b[2] ?? 0));
}

export function transformShape(grid, cells, turns = 0, reflected = false) {
  return normalize(cells.map((cell) => transformCell(grid, cell, turns, reflected)), grid);
}

export function orientationsForGrid(grid, cells, allowRotate = true, allowReflect = false) {
  const order = grid === "square" ? 4 : 6;
  const result = new Map();
  for (const reflected of (allowReflect ? [false, true] : [false])) {
    for (let turns = 0; turns < (allowRotate ? order : 1); turns += 1) {
      const transformed = transformShape(grid, cells, turns, reflected);
      result.set(transformed.map(key).join(";"), transformed);
    }
  }
  return [...result.values()];
}

export function allBoardSymmetries(grid, boardCells) {
  const order = grid === "square" ? 4 : 6;
  const original = new Set(boardCells.map(key));
  const transforms = [];
  for (const reflected of [false, true]) {
    for (let turns = 0; turns < order; turns += 1) {
      const mapped = boardCells.map((cell) => transformCell(grid, cell, turns, reflected));
      const minX = Math.min(...mapped.map(([x]) => x));
      const minY = Math.min(...mapped.map(([, y]) => y));
      const normalized = mapped.map((cell) => grid === "triangle"
        ? [cell[0] - minX, cell[1] - minY, cell[2]]
        : [cell[0] - minX, cell[1] - minY]);
      const mapping = new Map(boardCells.map((cell, i) => [key(cell), key(normalized[i])]));
      if (normalized.length === original.size && normalized.every((cell) => original.has(key(cell)))) transforms.push(mapping);
    }
  }
  return transforms;
}

export function solutionSymmetryKey(solution, symmetryMaps) {
  const signature = (keys) => keys.sort().join("|");
  return symmetryMaps.reduce((best, mapping) => {
    const transformed = [];
    for (const placement of solution) transformed.push(`${placement.tileIndex}:${signature(placement.keys.map((cellKey) => mapping.get(cellKey)))}`);
    const candidate = transformed.sort().join("/");
    return best === null || candidate < best ? candidate : best;
  }, null);
}

export function fullBoardCells(grid, width, height) {
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (grid === "triangle") cells.push([x, y, 0], [x, y, 1]);
      else cells.push([x, y]);
    }
  }
  return cells;
}

export function cellKey(cell) { return key(cell); }
