const key = (cell) => cell.join(",");

// Signed permutation matrices with determinant +1: the cube's 24 rotations.
// Identity comes first so rotation-disabled pieces keep their original axes.
export const CUBE_ROTATIONS = [];
for (const axes of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) {
  const inversions = axes.reduce((sum,a,i) => sum + axes.slice(i+1).filter(b=>a>b).length, 0);
  for (const sx of [1,-1]) for (const sy of [1,-1]) for (const sz of [1,-1]) {
    if (sx*sy*sz*(inversions%2 ? -1 : 1) === 1) CUBE_ROTATIONS.push({axes, signs:[sx,sy,sz]});
  }
}

function rotateAxial([q, r]) { return [-r, q + r]; }
function reflectAxial([q, r]) { return [q + r, -r]; }

function triangleVertices([i, j, dir]) {
  return dir === 0
    ? [[i, j], [i + 1, j], [i, j + 1]]
    : [[i + 1, j + 1], [i + 1, j], [i, j + 1]];
}

function rotateVertex([x, y]) { return [-y, x + y]; }
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
  if (grid === "cubic") {
    const {axes, signs} = CUBE_ROTATIONS[turns % 24];
    const point = [reflected ? -cell[0] : cell[0], cell[1], cell[2]];
    return axes.map((axis,i) => point[axis]*signs[i]);
  }
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
  const minZ = grid === "cubic" ? Math.min(...cells.map(c=>c[2])) : 0;
  const translated = cells.map((cell) => grid === "cubic"
    ? [cell[0]-minX, cell[1]-minY, cell[2]-minZ]
    : grid === "triangle"
    ? [cell[0] - minX, cell[1] - minY, cell[2]]
    : [cell[0] - minX, cell[1] - minY]);
  return translated.sort((a, b) => a[1] - b[1] || a[0] - b[0] || (a[2] ?? 0) - (b[2] ?? 0));
}

export function transformShape(grid, cells, turns = 0, reflected = false) {
  return normalize(cells.map((cell) => transformCell(grid, cell, turns, reflected)), grid);
}

export function orientationsForGrid(grid, cells, allowRotate = true, allowReflect = false) {
  const order = grid === "cubic" ? 24 : grid === "square" ? 4 : 6;
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
  const order = grid === "cubic" ? 24 : grid === "square" ? 4 : 6;
  const original = new Set(boardCells.map(key));
  const transforms = [];
  const originX = Math.min(...boardCells.map(c => c[0]));
  const originY = Math.min(...boardCells.map(c => c[1]));
  const originZ = grid === "cubic" ? Math.min(...boardCells.map(c=>c[2])) : 0;
  for (const reflected of [false, true]) {
    for (let turns = 0; turns < order; turns += 1) {
      const mapped = boardCells.map((cell) => transformCell(grid, cell, turns, reflected));
      const minX = Math.min(...mapped.map(([x]) => x));
      const minY = Math.min(...mapped.map(([, y]) => y));
      const minZ = grid === "cubic" ? Math.min(...mapped.map(c=>c[2])) : 0;
      const normalized = mapped.map((cell) => grid === "cubic"
        ? [cell[0]-minX+originX, cell[1]-minY+originY, cell[2]-minZ+originZ]
        : grid === "triangle"
        ? [cell[0] - minX + originX, cell[1] - minY + originY, cell[2]]
        : [cell[0] - minX + originX, cell[1] - minY + originY]);
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

function neighbors(grid, [x, y, dir]) {
  if (grid === "cubic") return [[x+1,y,dir],[x-1,y,dir],[x,y+1,dir],[x,y-1,dir],[x,y,dir+1],[x,y,dir-1]];
  if (grid === "square") return [[x+1,y],[x-1,y],[x,y+1],[x,y-1]];
  if (grid === "hex") return [[x+1,y],[x-1,y],[x,y+1],[x,y-1],[x+1,y-1],[x-1,y+1]];
  return dir === 0 ? [[x,y,1],[x,y-1,1],[x-1,y,1]] : [[x,y,0],[x+1,y,0],[x,y+1,0]];
}

export function isConnected(cells, grid) {
  if (!cells.length) return false;
  const ids = new Set(cells.map(cellKey)), seen = new Set([cellKey(cells[0])]), stack = [cells[0]];
  while (stack.length) {
    for (const next of neighbors(grid, stack.pop())) {
      const id = cellKey(next);
      if (ids.has(id) && !seen.has(id)) { seen.add(id); stack.push(next); }
    }
  }
  return seen.size === ids.size;
}

// All board, editor and solution views use these same lattice polygons.
export function cellPolygon(grid, cell) {
  const [x,y] = cell;
  if (grid === "square") return [[x,y],[x+1,y],[x+1,y+1],[x,y+1]];
  const h = Math.sqrt(3) / 2;
  if (grid === "triangle") return triangleVertices(cell).map(([q,r]) => [q+r/2,-h*r]);
  // Pointy-top regular hexagons of side length 1. Build vertices on one
  // integer lattice before scaling, so neighbors get identical shared
  // vertices (rather than slightly different trig/translation roundoff).
  const u = 2*x+y, v = 3*y;
  return [[1,-1],[1,1],[0,2],[-1,1],[-1,-1],[0,-2]]
    .map(([du,dv]) => [(u+du)*h,(v+dv)/2]);
}

export function shapedBoard(grid, size, height = size, depth = size) {
  const cells = [];
  if (grid === "cubic") {
    for(let z=0;z<depth;z++) for(let y=0;y<height;y++) for(let x=0;x<size;x++) cells.push([x,y,z]);
    return {grid,width:size,height,depth,cells};
  }
  if (grid === "square") return {grid,width:size,height,cells:fullBoardCells(grid,size,height)};
  if (grid === "triangle") {
    for (let y=0;y<size;y++) for(let x=0;x<size-y;x++) {
      cells.push([x,y,0]);
      if(x+y<size-1) cells.push([x,y,1]);
    }
    return {grid,width:size,height:size,cells};
  }
  const radius=size-1, span=2*radius+1;
  for(let y=0;y<span;y++) for(let x=0;x<span;x++) {
    if(Math.abs(x+y-2*radius)<=radius) cells.push([x,y]);
  }
  return {grid,width:span,height:span,cells};
}
