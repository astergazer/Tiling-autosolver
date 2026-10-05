import { cellKey } from "./lattice.js?v=20261005-cubic1";

const states = new WeakMap();
const ns = "http://www.w3.org/2000/svg";
const project = ([x,y,z]) => [(x-y)*Math.sqrt(3)/2, (x+y)/2-z];
function svgNode(tag, attrs={}) {
  const el=document.createElementNS(ns,tag);
  for(const [key,value] of Object.entries(attrs)) el.setAttribute(key,String(value));
  return el;
}

// Produce only visible faces, in painter order. IDs always refer to the original
// coordinates, independent of the camera; view changes never change the puzzle.
export function voxelFaces(cells, width, height, turns=0) {
  const voxels=cells.map(cell=>{
    let [x,y,z]=cell, w=width,h=height;
    for(let i=0;i<turns;i++) { [x,y]=[y,w-1-x]; [w,h]=[h,w]; }
    return {id:cellKey(cell), x,y,z};
  });
  const occupied=new Set(voxels.map(({x,y,z})=>`${x},${y},${z}`));
  voxels.sort((a,b)=>(a.x+a.y+a.z)-(b.x+b.y+b.z) || a.z-b.z || a.y-b.y || a.x-b.x);
  const faces=[];
  for(const {id,x,y,z} of voxels) {
    const candidates=[
      {neighbor:[x+1,y,z],shade:.72,points:[[x+1,y,z],[x+1,y+1,z],[x+1,y+1,z+1],[x+1,y,z+1]]},
      {neighbor:[x,y+1,z],shade:.88,points:[[x,y+1,z],[x+1,y+1,z],[x+1,y+1,z+1],[x,y+1,z+1]]},
      {neighbor:[x,y,z+1],shade:1,points:[[x,y,z+1],[x+1,y,z+1],[x+1,y+1,z+1],[x,y+1,z+1]]},
    ];
    for(const face of candidates) if(!occupied.has(cellKey(face.neighbor))) faces.push({id,shade:face.shade,points:face.points.map(project)});
  }
  return faces;
}

function shadeColor(hex, factor) {
  return `rgb(${[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*factor)).join(",")})`;
}

export function drawCubic(container,cells,selected,onToggle,placed,drawSlice) {
  container.replaceChildren();
  if(!cells.length) return;
  const width=Math.max(...cells.map(c=>c[0]))+1;
  const height=Math.max(...cells.map(c=>c[1]))+1;
  const depth=Math.max(...cells.map(c=>c[2]))+1;
  const state=states.get(container) ?? {layer:0,turns:0,cut:false};
  state.layer=Math.min(state.layer,depth-1); states.set(container,state);
  const compact=container.matches(".tile-preview,.sample-preview");
  const overview=document.createElement("div"); overview.className="voxel-overview";
  const section=document.createElement("div"); section.className="voxel-slice";
  function renderOverview() {
    overview.replaceChildren();
    const visible=cells.filter(c=>selected.has(cellKey(c)) && (!state.cut || c[2]<=state.layer));
    const faces=voxelFaces(visible,width,height,state.turns);
    if(!faces.length) { const p=document.createElement("p"); p.className="hint"; p.textContent="この範囲にセルはありません。層を選んで追加できます。"; overview.append(p); return; }
    const points=faces.flatMap(f=>f.points);
    const minX=Math.min(...points.map(p=>p[0]))-.18, minY=Math.min(...points.map(p=>p[1]))-.18;
    const w=Math.max(...points.map(p=>p[0]))-minX+.18, h=Math.max(...points.map(p=>p[1]))-minY+.18;
    const svg=svgNode("svg",{viewBox:`${minX} ${minY} ${w} ${h}`,width:w*48,height:h*48,preserveAspectRatio:"xMidYMid meet",class:"voxel-svg",role:"img","aria-label":"立体の全体表示"});
    const base=container.style.getPropertyValue("--tile-color").trim() || "#8aaea0";
    for(const face of faces) {
      const data=placed.get(face.id);
      const polygon=svgNode("polygon",{points:face.points.map(p=>p.join(",")).join(" "),fill:shadeColor(data?.color ?? base,face.shade),"data-cell":face.id});
      const title=svgNode("title"); title.textContent=`(${face.id})${data ? ` · ${data.name} #${data.label}` : ""}`; polygon.append(title); svg.append(polygon);
      if(data) {
        const label=svgNode("text",{x:face.points.reduce((s,p)=>s+p[0],0)/4,y:face.points.reduce((s,p)=>s+p[1],0)/4,class:"voxel-number"});
        label.textContent=data.label; svg.append(label);
      }
    }
    overview.append(svg);
  }
  function renderSlice() {
    const layerCells=cells.filter(c=>c[2]===state.layer).map(c=>c.slice(0,2));
    const layerSelected=new Set(layerCells.filter(c=>selected.has(`${cellKey(c)},${state.layer}`)).map(cellKey));
    const layerPlaced=new Map(layerCells.flatMap(c=>{
      const data=placed.get(`${cellKey(c)},${state.layer}`); return data ? [[cellKey(c),data]] : [];
    }));
    drawSlice(section,"square",layerCells,layerSelected,onToggle ? (id,value)=>{
      value ? layerSelected.add(id) : layerSelected.delete(id);
      onToggle(`${id},${state.layer}`,value); renderOverview();
    } : null,layerPlaced);
    section.setAttribute("aria-label",`下から第${state.layer+1}層の断面（横X・縦Y）`);
  }
  container.append(overview);
  if(!compact) {
    const controls=document.createElement("div"); controls.className="voxel-controls";
    function selectControl(labelText,options,value,onChange,className) {
      const label=document.createElement("label"); label.append(document.createTextNode(labelText));
      const select=document.createElement("select"); select.className=className;
      for(const [val,text] of options) { const option=document.createElement("option"); option.value=val; option.textContent=text; select.append(option); }
      select.value=String(value); select.addEventListener("change",()=>onChange(select.value)); label.append(select); controls.append(label);
    }
    selectControl("層（下から）",Array.from({length:depth},(_,z)=>[z,`${z+1} / ${depth}`]),state.layer,v=>{state.layer=Number(v);renderSlice();renderOverview();},"voxel-layer");
    selectControl("視点",[0,1,2,3].map(i=>[i,`${i*90}°`]),state.turns,v=>{state.turns=Number(v);renderOverview();},"voxel-camera");
    selectControl("立体の表示",[[0,"全層"],[1,"選択層まで"]],state.cut?1:0,v=>{state.cut=v==="1";renderOverview();},"voxel-cutaway");
    const hint=document.createElement("p"); hint.className="hint voxel-hint";
    hint.textContent=onToggle ? "下の断面をクリック・ドラッグして編集。横がX、縦がY、高さがZです。" : "断面で内部の配置も確認できます。同じ番号は同じピースです。";
    container.append(controls,hint,section); renderSlice();
  }
  renderOverview();
}
