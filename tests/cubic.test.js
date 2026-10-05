import test from "node:test";
import assert from "node:assert/strict";
import {CUBE_ROTATIONS, transformCell, transformShape, orientationsForGrid, shapedBoard, allBoardSymmetries, cellKey, isConnected} from "../lattice.js";
import {solveTilings} from "../solver.js";
import {encodePuzzle,decodePuzzle} from "../sharing.js";
import {createSamplePuzzle} from "../samples.js";
import {voxelFaces} from "../voxel-view.js";

const signature=cells=>cells.map(cellKey).sort().join(";");
const chiral=[[0,0,0],[1,0,0],[1,1,0],[1,1,1]];
const domino={cells:[[0,0,0],[1,0,0]],count:0,rotate:true,reflect:false};

test("cube rotations form 24 distinct right-handed distance-preserving transformations",()=>{
  assert.equal(CUBE_ROTATIONS.length,24);
  const matrices=[];
  for(let n=0;n<24;n++) {
    const [a,b,c]=[[1,0,0],[0,1,0],[0,0,1]].map(v=>transformCell("cubic",v,n));
    const det=a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);
    assert.equal(det,1);
    assert.equal(transformCell("cubic",[2,3,5],n).reduce((sum,v)=>sum+v*v,0),38);
    matrices.push(JSON.stringify([a,b,c]));
  }
  assert.equal(new Set(matrices).size,24);
  assert.deepEqual(transformCell("cubic",[2,3,5]),[2,3,5]);
  for(let a=0;a<24;a++) for(let b=0;b<24;b++) {
    const composed=[[1,0,0],[0,1,0],[0,0,1]].map(v=>transformCell("cubic",transformCell("cubic",v,a),b));
    assert.ok(matrices.includes(JSON.stringify(composed)));
  }
});

test("chiral polycubes keep mirror images separate unless reflection is allowed",()=>{
  const rotations=orientationsForGrid("cubic",chiral,true,false);
  const mirrors=transformShape("cubic",chiral,0,true);
  assert.equal(rotations.length,12);
  assert.ok(!rotations.some(cells=>signature(cells)===signature(mirrors)));
  assert.equal(orientationsForGrid("cubic",chiral,true,true).length,24);
  assert.equal(orientationsForGrid("cubic",chiral,false,false).length,1);
  assert.equal(orientationsForGrid("cubic",chiral,false,true).length,2);
});

test("cubic connectivity requires faces; normalization translates all three axes",()=>{
  assert.ok(isConnected([[0,0,0],[0,0,1]],"cubic"));
  assert.ok(!isConnected([[0,0,0],[1,1,0]],"cubic"));
  assert.ok(!isConnected([[0,0,0],[1,1,1]],"cubic"));
  assert.equal(signature(transformShape("cubic",chiral.map(c=>c.map(v=>v+5)))),signature(chiral));
});

// Independent perfect-matching recursion; no orientation or exact-cover helpers.
function dominoCount(cells) {
  if(!cells.length) return 1;
  const [first,...rest]=cells;
  return rest.reduce((sum,other,i)=>sum+(first.reduce((d,v,axis)=>d+Math.abs(v-other[axis]),0)===1 ? dominoCount(rest.filter((_,j)=>j!==i)) : 0),0);
}
test("3D placements match independent domino counts for boxes, holes and fixed axes",()=>{
  for(const [w,h,d] of [[2,2,2],[3,2,2],[1,2,3],[2,3,3]]) {
    const board=shapedBoard("cubic",w,h,d);
    const result=solveTilings(board,[domino],{maxSolutions:10000});
    assert.equal(result.stopped,"complete");
    assert.equal(result.solutions.length,dominoCount(board.cells));
    for(const solution of result.solutions) assert.equal(signature(solution.flatMap(p=>p.cells)),signature(board.cells));
  }
  const board=shapedBoard("cubic",2);
  board.cells=board.cells.filter(c=>![[0,0,0],[0,0,1]].some(r=>cellKey(c)===cellKey(r)));
  assert.equal(solveTilings(board,[domino]).solutions.length,dominoCount(board.cells));
  assert.equal(solveTilings(shapedBoard("cubic",2),[{...domino,rotate:false}]).solutions.length,1);
  assert.equal(solveTilings(shapedBoard("cubic",1,2,2),[{...domino,rotate:false}]).solutions.length,0);
});

test("symmetries preserve boxes, translated boards and holes exactly",()=>{
  for(const [shape,count] of [[shapedBoard("cubic",2),48],[shapedBoard("cubic",2,3,4),8]]) {
    for(const offset of [0,7]) {
      const cells=shape.cells.map(c=>c.map(v=>v+offset));
      const maps=allBoardSymmetries("cubic",cells);
      assert.equal(maps.length,count);
      for(const map of maps) assert.deepEqual([...map.values()].sort(),cells.map(cellKey).sort());
    }
  }
  const cells=shapedBoard("cubic",2).cells.filter(c=>cellKey(c)!=="0,0,0");
  assert.equal(allBoardSymmetries("cubic",cells).length,6);
});

test("cubic sharing preserves rectangular depth and holes, rejects invalid dimensions and keeps v1 links",()=>{
  const puzzle=createSamplePuzzle("cube-domino");
  puzzle.board=shapedBoard("cubic",2,3,4); puzzle.board.cells.pop();
  const token=encodePuzzle(puzzle), restored=decodePuzzle(token);
  assert.equal(restored.depth,4);
  assert.deepEqual(restored.board,puzzle.board);
  const data=JSON.parse(Buffer.from(token,"base64url").toString());
  assert.equal(data.v,2);
  for(const depth of [0,9,1.2,null]) {
    data.b[4]=depth;
    assert.throws(()=>decodePuzzle(Buffer.from(JSON.stringify(data)).toString("base64url")));
  }
  puzzle.board.depth=9; assert.throws(()=>encodePuzzle(puzzle));
  puzzle.board=shapedBoard("cubic",8);
  assert.equal(decodePuzzle(encodePuzzle(puzzle)).board.cells.length,512);
  const legacy={v:1,title:"old",description:"",b:[0,2,2,"f"],t:[["domino",0,1,"#ff6b35",2,"3"]],s:[0,100,10]};
  const old=decodePuzzle(Buffer.from(JSON.stringify(legacy)).toString("base64url"));
  assert.equal(solveTilings(old.board,old.tiles,old.options).solutions.length,2);
});

test("isometric surfaces share exact edges, use equal axis lengths and preserve IDs under camera rotation",()=>{
  const faces=voxelFaces([[0,0,0]],1,1);
  assert.equal(faces.length,3);
  for(const face of faces) for(let i=0;i<4;i++) {
    const a=face.points[i],b=face.points[(i+1)%4];
    assert.ok(Math.abs(Math.hypot(a[0]-b[0],a[1]-b[1])-1)<1e-12);
  }
  assert.equal(voxelFaces(shapedBoard("cubic",2).cells,2,2).length,12);
  const pair=[[0,0,0],[1,0,0]];
  for(let turns=0;turns<4;turns++) {
    const faces=voxelFaces(pair,2,1,turns);
    assert.equal(faces.length,5);
    assert.deepEqual([...new Set(faces.map(f=>f.id))].sort(),pair.map(cellKey));
  }
});
