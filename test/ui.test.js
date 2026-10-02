import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Game } from '../game.js';
const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
function ui(){const app={innerHTML:'',addEventListener(){}};const toast={textContent:''};const dom={querySelector:s=>s==='#app'?app:toast,getElementById:()=>null};const context=vm.createContext({document:dom,fetch:async()=>({json:async()=>({state:null})}),setInterval(){},setTimeout(){return 0;},clearTimeout(){},URLSearchParams,location:{search:'',origin:'https://example.com',href:'/'},history:{replaceState(){}},navigator:{clipboard:{writeText:async()=>{}}},EventSource:class{addEventListener(){}close(){}},Date,Math,JSON,Number,String,Array,Object,console,confirm:()=>true});vm.runInContext(source,context,{filename:'public/app.js'});return {app,context,paint:s=>vm.runInContext(`setState(${JSON.stringify(s)})`,context)};}
test('client renders initial lobby, role reveal, interactive game and results without runtime errors',async()=>{
 const x=ui();await new Promise(resolve=>setImmediate(resolve));assert.match(x.app.innerHTML,/CRACK/);assert.match(x.app.innerHTML,/JOIN THE CREW/);
 const g=new Game();const a=g.create('Player One'),b=g.join(a.room.code,'Player Two'),c=g.join(a.room.code,'Player Three');x.paint(g.snapshot(a.room,a.player));assert.match(x.app.innerHTML,/COPY INVITE LINK/);
 g.start(a.room,a.player);x.paint(g.snapshot(a.room,a.player));assert.match(x.app.innerHTML,/YOUR SECRET ASSIGNMENT/);
 g.begin(a.room);x.paint(g.snapshot(a.room,a.player));assert.match(x.app.innerHTML,/LIVE SECURITY DASHBOARD/);assert.match(x.app.innerHTML,/ONE-TAP COMMS/);
 g.task(a.room,a.player,'wires','cameras');x.paint(g.snapshot(a.room,a.player));assert.match(x.app.innerHTML,/CHECK CONNECTIONS/);
 g.cancelTask(a.room,a.player);g.task(a.room,a.player,'memory','cameras');x.paint(g.snapshot(a.room,a.player));assert.match(x.app.innerHTML,/MEMORY OVERRIDE/);
 g.cancelTask(a.room,a.player);g.task(a.room,a.player,'laser','lasers');x.paint(g.snapshot(a.room,a.player));assert.match(x.app.innerHTML,/LASER REDIRECT/);
 g.cancelTask(a.room,a.player);g.task(a.room,a.player,'split','vault');x.paint(g.snapshot(a.room,a.player));assert.match(x.app.innerHTML,/WAITING FOR A PARTNER/);
 g.task(a.room,b.player,'split','vault');x.paint(g.snapshot(a.room,b.player));assert.match(x.app.innerHTML,/SYMBOLS RECEIVED/);
 g.finishHeist(a.room,false);x.paint(g.snapshot(a.room,a.player));assert.match(x.app.innerHTML,/WHO WAS THE INSIDE THREAT/);
 g.resolveVote(a.room);x.paint(g.snapshot(a.room,a.player));assert.match(x.app.innerHTML,/LEADERBOARD/);
 g.next(a.room);g.begin(a.room);g.finishHeist(a.room,false);g.resolveVote(a.room);g.next(a.room);g.begin(a.room);g.finishHeist(a.room,false);g.resolveVote(a.room);g.next(a.room);x.paint(g.snapshot(a.room,a.player));assert.match(x.app.innerHTML,/TOP HEIST AGENT|TIED FOR FIRST/);
});
test('HTML, CSS and SVG assets contain mobile viewport, responsive breakpoints and SVG artwork',async()=>{
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');const css=await readFile(new URL('../public/style.css',import.meta.url),'utf8');const art=await readFile(new URL('../public/vault-art.svg',import.meta.url),'utf8');
 assert.match(html,/viewport-fit=cover/);assert.match(css,/@media\(max-width:600px\)/);assert.match(art,/<svg /);assert.match(art,/<\/svg>/);
});
