import test from "node:test";
import assert from "node:assert/strict";
import { analyzeProblem, normalizeCells, orientations, solveTilings } from "../solver.js";
import { allBoardSymmetries, fullBoardCells, orientationsForGrid, shapedBoard, cellPolygon } from "../lattice.js";

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

test("square board symmetry mode merges rotated and reflected tilings", () => {
  const ordinary = solveTilings(fullBoard(3, 2), [domino], { maxSolutions: 10 });
  const merged = solveTilings(fullBoard(3, 2), [domino], { maxSolutions: 10, symmetry: "same" });
  assert.equal(ordinary.solutions.length, 3);
  assert.equal(merged.solutions.length, 2);
});

test("lattice transformations provide distinct triangle and hex orientations", () => {
  assert.equal(orientationsForGrid("triangle", [[0, 0, 0], [0, 0, 1]]).length, 3);
  assert.equal(orientationsForGrid("hex", [[0, 0], [1, 0]]).length, 3);
  assert.equal(allBoardSymmetries("square", fullBoardCells("square", 2, 2)).length, 8);
  assert.equal(allBoardSymmetries("triangle", fullBoardCells("triangle", 1, 1)).length, 4);
  assert.equal(allBoardSymmetries("hex", fullBoardCells("hex", 1, 1)).length, 12);
});

test("triangle and hex lattices enumerate tilings", () => {
  const triangleBoard = { grid: "triangle", width: 1, height: 1, cells: fullBoardCells("triangle", 1, 1) };
  const triangleTile = { cells: [[0, 0, 0], [0, 0, 1]], count: 0, rotate: true };
  assert.equal(solveTilings(triangleBoard, [triangleTile], { maxSolutions: 20 }).solutions.length, 1);

  const hexBoard = { grid: "hex", width: 2, height: 1, cells: fullBoardCells("hex", 2, 1) };
  const hexTile = { cells: [[0, 0], [1, 0]], count: 0, rotate: true };
  assert.equal(solveTilings(hexBoard, [hexTile], { maxSolutions: 20 }).solutions.length, 1);
});


test("regular board masks have expected areas and symmetry groups", () => {
  for(let n=2;n<=6;n++) {
    const tri=shapedBoard("triangle",n), hex=shapedBoard("hex",n);
    assert.equal(tri.cells.length,n*n);
    assert.equal(hex.cells.length,1+3*n*(n-1));
    assert.equal(allBoardSymmetries("triangle",tri.cells).length,6);
    assert.equal(allBoardSymmetries("hex",hex.cells).length,12);
  }
});

test("60-degree triangle rotation permits both triangle directions", () => {
  assert.equal(orientationsForGrid("triangle",[[0,0,0]]).length,2);
  const tile={cells:[[0,0,0]],count:0,rotate:true};
  const result=solveTilings(shapedBoard("triangle",3),[tile],{maxSolutions:10,symmetry:"same"});
  assert.equal(result.solutions.length,1);
  assert.equal(result.solutions[0].length,9);
});

test("drawn lattice neighbors share exactly one full edge", () => {
  const pointKey=p=>p.map(v=>v.toFixed(7)).join(",");
  const edgeKeys=(grid,cell)=>{
    const vertices=cellPolygon(grid,cell);
    return vertices.map((p,i)=>[pointKey(p),pointKey(vertices[(i+1)%vertices.length])].sort().join(";"));
  };
  for(const [grid,origin,neighbors] of [
    ["hex",[2,2],[[3,2],[1,2],[2,3],[2,1],[3,1],[1,3]]],
    ["triangle",[2,2,0],[[2,2,1],[1,2,1],[2,1,1]]],
  ]) {
    const edges=new Set(edgeKeys(grid,origin));
    for(const cell of neighbors) assert.equal(edgeKeys(grid,cell).filter(e=>edges.has(e)).length,1);
  }
});

test("hexagonal board solutions cover only the hexagonal mask", () => {
  const board=shapedBoard("hex",2);
  const tiles=[{cells:[[0,0],[1,0]],count:3,rotate:true},{cells:[[0,0]],count:1,rotate:true}];
  const result=solveTilings(board,tiles,{maxSolutions:1000,symmetry:"same"});
  assert.ok(result.solutions.length>0);
  const expected=board.cells.map(c=>c.join(",")).sort();
  for(const solution of result.solutions) assert.deepEqual(solution.flatMap(p=>p.keys).sort(),expected);
});

test("hex cells are regular and use exactly identical shared vertices", () => {
  const neighbors = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
  for (const [x,y] of [[0,0],[-8,3],[15,15],[30,30]]) {
    const vertices = cellPolygon("hex",[x,y]);
    for (let i=0;i<6;i++) {
      const p=vertices[i], prev=vertices[(i+5)%6], next=vertices[(i+1)%6];
      const u=[prev[0]-p[0],prev[1]-p[1]], v=[next[0]-p[0],next[1]-p[1]];
      assert.ok(Math.abs(Math.hypot(...v)-1)<1e-12,"side length is 1");
      assert.ok(Math.abs(u[0]*v[0]+u[1]*v[1]+.5)<1e-12,"interior angle is 120 degrees");
    }
    const keys = new Set(vertices.map(p=>p.join(",")));
    for(const [dx,dy] of neighbors) {
      assert.equal(cellPolygon("hex",[x+dx,y+dy]).filter(p=>keys.has(p.join(","))).length,2);
    }
  }
});

test("full hex boards have one closed boundary and no interior holes", () => {
  for(const size of [1,2,6,16]) {
    const board=shapedBoard("hex",size), vertices=new Set(), edges=new Map();
    for(const cell of board.cells) {
      const points=cellPolygon("hex",cell).map(p=>p.join(","));
      points.forEach((p,i)=>{
        vertices.add(p);
        const edge=[p,points[(i+1)%6]].sort().join(";");
        edges.set(edge,(edges.get(edge)||0)+1);
      });
    }
    assert.equal(vertices.size-edges.size+board.cells.length,1,"Euler characteristic of a filled disk");
    const boundary=new Map();
    for(const [edge,count] of edges) {
      assert.ok(count===1||count===2,"one boundary cell or two edge neighbors");
      if(count!==1) continue;
      const [a,b]=edge.split(";");
      boundary.set(a,[...(boundary.get(a)||[]),b]);
      boundary.set(b,[...(boundary.get(b)||[]),a]);
    }
    for(const adjacent of boundary.values()) assert.equal(adjacent.length,2);
    const seen=new Set(), stack=[boundary.keys().next().value];
    while(stack.length) { const p=stack.pop(); if(seen.has(p))continue; seen.add(p);stack.push(...boundary.get(p)); }
    assert.equal(seen.size,boundary.size,"one boundary loop, no inner gaps");
  }
});
