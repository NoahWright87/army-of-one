import{Z as e,et as t,n,t as r}from"./dom-B7DU973m.js";import{W as i}from"./storage-BVBTb9BA.js";import{i as a}from"./main-BGhM6YOr.js";var o=[{tool:null,icon:`✋`,key:`arena.tool.none`},{tool:`sandbags`,icon:`🟫`,key:`arena.tool.sandbags`},{tool:`crate`,icon:`📦`,key:`arena.tool.crate`},{tool:`fence`,icon:`🚧`,key:`arena.tool.fence`},{tool:`halfWall`,icon:`🧱`,key:`arena.tool.halfWall`},{tool:`rock`,icon:`🪨`,key:`arena.tool.rock`},{tool:`erase`,icon:`🧽`,key:`arena.tool.erase`}],s=`
.aoo-arena { position: fixed; top: 0; right: 0; bottom: 0; width: 320px; overflow-y: auto;
  background: #161a1f; color: #e7e9ec; font: 13px/1.35 system-ui, sans-serif; padding: 10px;
  border-left: 1px solid #262c33; box-sizing: border-box; z-index: 20; }
@media (max-width: 719px) { .aoo-arena { top: auto; left: 0; width: auto; height: 45%;
  border-left: 0; border-top: 1px solid #262c33; } }
.aoo-arena nav { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-bottom: 8px; font-size: 12px; }
.aoo-arena nav a { color: #9cc7ff; text-decoration: none; }
.aoo-arena nav b { color: #ffd34d; }
.aoo-arena .side { border: 1px solid #2c333b; border-radius: 8px; padding: 6px; margin-bottom: 8px; }
.aoo-arena .side.left { border-color: #3b6fb6; }
.aoo-arena .side.right { border-color: #b64a3b; }
.aoo-arena .side header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.aoo-arena select { background: #20262d; color: inherit; border: 1px solid #39414a; border-radius: 6px;
  padding: 3px 6px; font: inherit; }
.aoo-arena .roles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.aoo-arena .role { display: flex; align-items: center; gap: 2px; background: #1d2228; border-radius: 6px;
  padding: 2px 3px; }
.aoo-arena .role .n { min-width: 16px; text-align: center; font-weight: 700; }
.aoo-arena .role.zero { opacity: .45; }
.aoo-arena button { background: #20262d; color: inherit; border: 1px solid #39414a; border-radius: 6px;
  cursor: pointer; font: inherit; padding: 2px 6px; }
.aoo-arena .role button { padding: 0 5px; }
.aoo-arena .tools { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.aoo-arena .tools button { font-size: 18px; padding: 2px 6px; }
.aoo-arena .tools button.on { border-color: #ffd34d; background: #2b2a1d; }
.aoo-arena .row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; align-items: center; }
.aoo-arena .go { background: #2f6b34; border-color: #4fa356; font-weight: 700; font-size: 15px; padding: 4px 14px; }
.aoo-arena .score { font-size: 18px; font-weight: 700; margin: 4px 0 8px; }
.aoo-arena .score .w { color: #ffd34d; }
.aoo-arena .batch { font-size: 13px; color: #c9d1d9; }
`,c=class{actions;links;root=r(`div`,`aoo-arena`);cfg;tool=null;vertical=!1;scoreEl=r(`div`,`score`);batchEl=r(`div`,`batch`);constructor(e,t,r,i){this.actions=r,this.links=i,n(`aoo-arena`,s),this.cfg=structuredClone(t),e.append(this.root),this.render()}get config(){return this.cfg}tap(e,t){if(this.tool){if(this.tool===`erase`){let n=-1,r=3600;if(this.cfg.pieces.forEach((i,a)=>{let o=(i.x-e)**2+(i.y-t)**2;o<r&&(r=o,n=a)}),n<0)return;this.cfg.pieces.splice(n,1)}else this.cfg.pieces.push({kind:this.tool,x:Math.round(e),y:Math.round(t),...this.vertical?{vertical:!0}:{}});this.actions.change(this.cfg)}}showState(e){let t=(e.tick/60).toFixed(1),n=e.winner===`left`?` <span class="w">🟦🏆</span>`:e.winner===`right`?` <span class="w">🟥🏆</span>`:e.winner===`draw`?` <span class="w">🤝</span>`:``;this.scoreEl.innerHTML=`🟦 ${e.left} : ${e.right} 🟥 · ${t}s${n}`}render(){let e=this.root;e.replaceChildren();let n=r(`nav`);for(let e of this.links)if(e.here)n.append(r(`b`,``,e.label));else{let t=r(`a`,``,e.label);t.href=e.href,n.append(t)}e.append(n,this.side(`left`),this.side(`right`));let i=r(`div`,`tools`);for(let e of o){let n=r(`button`,e.tool===this.tool?`on`:``,e.icon);n.title=t(e.key),n.onclick=()=>{this.tool=e.tool,this.render()},i.append(n)}let a=r(`button`,this.vertical?`on`:``,this.vertical?`↕`:`↔`);a.title=t(`arena.rotate`),a.onclick=()=>{this.vertical=!this.vertical,this.render()};let s=r(`button`,``,`🗑`);s.title=t(`arena.clear`),s.onclick=()=>{this.cfg.pieces=[],this.actions.change(this.cfg)},i.append(a,s),e.append(i);let c=r(`div`,`row`),l=r(`button`,`go`,`▶ GO`);l.onclick=()=>this.actions.go();let u=r(`button`,``,`↺`);u.title=t(`arena.reset`),u.onclick=()=>this.actions.reset(),c.append(l,u);for(let e of[1,2,4]){let t=r(`button`,``,`×${e}`);t.onclick=()=>this.actions.speed(e),c.append(t)}e.append(c,this.scoreEl);let d=r(`div`,`row`),f=r(`button`,``,`🎲 ×20`);f.title=t(`arena.batch`),f.onclick=async()=>{this.batchEl.textContent=`…`;let e=await this.actions.batch(20);this.batchEl.textContent=t(`arena.batchResult`,{left:e.left,right:e.right,draws:e.draws,secs:e.meanSeconds.toFixed(1),left2:e.meanSurvivors.toFixed(1)})},d.append(f,this.batchEl),e.append(d)}side(n){let o=this.cfg[n],s=r(`div`,`side ${n}`),c=r(`header`);c.append(r(`span`,``,n===`left`?`🟦`:`🟥`));let l=r(`select`);for(let e of a){let n=r(`option`,``,t(`arena.preset.${e}`));n.value=e,e===o.preset&&(n.selected=!0),l.append(n)}l.onchange=()=>{o.preset=l.value,this.actions.change(this.cfg)},c.append(l),s.append(c);let u=r(`div`,`roles`),d=()=>e.reduce((e,t)=>e+(o.units[t.id]??0),0);for(let n of e){let e=o.units[n.id]??0,a=r(`div`,`role${e?``:` zero`}`);a.title=t(n.nameKey);let s=r(`span`);s.innerHTML=i(n.id,20);let c=r(`button`,``,`−`),l=r(`button`,``,`+`),f=t=>{let r=n.id,i=Math.max(0,Math.min(t,e+40-d()));i===0?delete o.units[r]:o.units[r]=i,this.actions.change(this.cfg),this.render()};c.onclick=()=>f(e-1),l.onclick=()=>f(e+1),a.append(s,c,r(`span`,`n`,String(e)),l),u.append(a)}return s.append(u),s}destroy(){this.root.remove()}};export{c as ArenaPanel};