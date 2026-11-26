import{c as e}from"./index-D9ac8a93.js";import{l as t,n,t as r}from"./dom-BUcB5O6Q.js";import{i}from"./role-icons-B7bWqzqK.js";import{a,c as o}from"./main-BJlnJ3tX.js";var s=[{kind:`sandbags`,icon:`🟫`,key:`arena.tool.sandbags`},{kind:`crate`,icon:`📦`,key:`arena.tool.crate`},{kind:`fence`,icon:`🚧`,key:`arena.tool.fence`},{kind:`halfWall`,icon:`🧱`,key:`arena.tool.halfWall`},{kind:`rock`,icon:`🪨`,key:`arena.tool.rock`}],c={none:`·`,left:`◀`,right:`▶`,both:`◀▶`},l=`
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
.aoo-arena .tools button { font-size: 18px; padding: 2px 6px; min-width: 52px; }
.aoo-arena .tools small { font-size: 11px; margin-left: 2px; }
.aoo-arena .tools button.on { border-color: #ffd34d; background: #2b2a1d; }
.aoo-arena .row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; align-items: center; }
.aoo-arena .row button.on { border-color: #ffd34d; background: #2b2a1d; }
.aoo-arena .go { background: #2f6b34; border-color: #4fa356; font-weight: 700; font-size: 15px; padding: 4px 14px; }
.aoo-arena .score { font-size: 18px; font-weight: 700; margin: 4px 0 8px; }
.aoo-arena .score .w { color: #ffd34d; }
.aoo-arena .batch { font-size: 13px; color: #c9d1d9; }
`,u=class{actions;links;root=r(`div`,`aoo-arena`);cfg;scoreEl=r(`div`,`score`);tallyEl=r(`div`,`batch`);autoOn=!1;batchEl=r(`div`,`batch`);constructor(e,t,r,i){this.actions=r,this.links=i,n(`aoo-arena`,l),this.cfg=structuredClone(t),e.append(this.root),this.render()}get config(){return this.cfg}showTally(t){this.tallyEl.textContent=t?e(`arena.tally`,{left:t.left,right:t.right,draws:t.draws}):``}showState(e){let t=(e.tick/60).toFixed(1),n=e.winner===`left`?` <span class="w">🟦🏆</span>`:e.winner===`right`?` <span class="w">🟥🏆</span>`:e.winner===`draw`?` <span class="w">🤝</span>`:``;this.scoreEl.innerHTML=`🟦 ${e.left} : ${e.right} 🟥 · ${t}s${n}`}render(){let t=this.root;t.replaceChildren();let n=r(`nav`);for(let e of this.links)if(e.here)n.append(r(`b`,``,e.label));else{let t=r(`a`,``,e.label);t.href=e.href,n.append(t)}t.append(n,this.side(`left`),this.side(`right`));let i=r(`div`,`tools`);for(let t of s){let n=this.cfg.barriers[t.kind]??`none`,a=r(`button`,n===`none`?``:`on`);a.innerHTML=`${t.icon}<small>${c[n]}</small>`,a.title=`${e(t.key)}: ${e(`arena.sides.${n}`)}`,a.onclick=()=>{let e=o[(o.indexOf(n)+1)%o.length];e===`none`?delete this.cfg.barriers[t.kind]:this.cfg.barriers[t.kind]=e,this.actions.change(this.cfg),this.render()},i.append(a)}t.append(i);let a=r(`div`,`row`),l=r(`button`,`go`,`▶ GO`);l.onclick=()=>this.actions.go();let u=r(`button`,``,`↺`);u.title=e(`arena.reset`),u.onclick=()=>this.actions.reset();let d=r(`button`,this.autoOn?`on`:``,`🔁`);d.title=e(`arena.auto`),d.onclick=()=>{this.autoOn=!this.autoOn,this.actions.auto(this.autoOn),this.render()},a.append(l,u,d);for(let e of[1,2,4]){let t=r(`button`,``,`×${e}`);t.onclick=()=>this.actions.speed(e),a.append(t)}t.append(a,this.scoreEl,this.tallyEl);let f=r(`div`,`row`),p=r(`button`,``,`🎲 ×20`);p.title=e(`arena.batch`),p.onclick=async()=>{this.batchEl.textContent=`…`;let t=await this.actions.batch(20);this.batchEl.textContent=e(`arena.batchResult`,{left:t.left,right:t.right,draws:t.draws,secs:t.meanSeconds.toFixed(1),left2:t.meanSurvivors.toFixed(1)})},f.append(p,this.batchEl),t.append(f)}side(n){let o=this.cfg[n],s=r(`div`,`side ${n}`),c=r(`header`);c.append(r(`span`,``,n===`left`?`🟦`:`🟥`));let l=r(`select`);for(let t of a){let n=r(`option`,``,e(`arena.preset.${t}`));n.value=t,t===o.preset&&(n.selected=!0),l.append(n)}l.onchange=()=>{o.preset=l.value,this.actions.change(this.cfg)},c.append(l),s.append(c);let u=r(`div`,`roles`),d=()=>t.reduce((e,t)=>e+(o.units[t.id]??0),0);for(let n of t){let t=o.units[n.id]??0,a=r(`div`,`role${t?``:` zero`}`);a.title=e(n.nameKey);let s=r(`span`);s.innerHTML=i(n.id,20);let c=r(`button`,``,`−`),l=r(`button`,``,`+`),f=e=>{let r=n.id,i=Math.max(0,Math.min(e,t+40-d()));i===0?delete o.units[r]:o.units[r]=i,this.actions.change(this.cfg),this.render()};c.onclick=()=>f(t-1),l.onclick=()=>f(t+1),a.append(s,c,r(`span`,`n`,String(t)),l),u.append(a)}return s.append(u),s}destroy(){this.root.remove()}};export{u as ArenaPanel};