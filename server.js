import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from './game.js';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'public');
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
const COOKIE='vault_player';
const getCookie=req=>(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
function setCookie(res,token,req){const secure=req.socket.encrypted||req.headers['x-forwarded-proto']==='https';res.setHeader('Set-Cookie',`${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=21600${secure?'; Secure':''}`);}
function clearCookie(res){res.setHeader('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);}
function reply(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify({ok:status<400,...data}));}
async function bodyOf(req){return await new Promise((done,fail)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>4096){fail(Object.assign(new Error('Request too large.'),{status:413}));req.destroy();}});req.on('end',()=>{try{done(JSON.parse(raw||'{}'));}catch{fail(Object.assign(new Error('Invalid JSON.'),{status:400}));}});req.on('error',fail);});}
export function createApp({gameOptions={}}={}){
 const streams=new Map();let closing=false;
 const send=(res,state)=>{if(!res.destroyed&&!res.writableEnded)try{res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);}catch{}};
 const game=new Game({...gameOptions,onUpdate:r=>{for(const p of r.players)for(const res of streams.get(p.id)||[])send(res,game.snapshot(r,p));}});
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/','http://localhost');
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
  try{
   if(req.method==='GET'&&url.pathname==='/health')return reply(res,{status:'healthy',activeRooms:game.rooms.size});
   if(req.method==='GET'&&url.pathname==='/api/me'){const found=game.playerFromSession(getCookie(req));return reply(res,{state:found?game.snapshot(found.room,found.player):null});}
   if(req.method==='GET'&&url.pathname==='/api/events'){
     const {room,player}=game.authenticated(getCookie(req));res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(': connected\n\n');
     const set=streams.get(player.id)||new Set();set.add(res);streams.set(player.id,set);game.presence(player.token,true);send(res,game.snapshot(room,player));
     req.on('close',()=>{set.delete(res);if(!set.size){streams.delete(player.id);if(!closing)game.presence(player.token,false);}});return;
   }
   if(req.method==='POST'&&url.pathname.startsWith('/api/')){
     if(req.headers['x-vault-action']!=='1')return reply(res,{error:'Missing game request header.'},403);
     const data=await bodyOf(req);
     if(['/api/create','/api/join'].includes(url.pathname)){
       const previous=game.playerFromSession(getCookie(req));
       if(previous&&!['lobby','finished'].includes(previous.room.phase))return reply(res,{error:'You are already in an active heist.'},409);
       if(previous)game.leave(previous.room,previous.player);
       const joined=url.pathname==='/api/create'?game.create(data.name):game.join(data.code,data.name);setCookie(res,joined.token,req);return reply(res,{state:game.snapshot(joined.room,joined.player)});
     }
     const {room,player}=game.authenticated(getCookie(req));let result;
     switch(url.pathname){
       case '/api/leave':game.leave(room,player);clearCookie(res);return reply(res,{left:true});
       case '/api/start':game.start(room,player);break;
       case '/api/task':game.task(room,player,data.type,data.station);break;
       case '/api/cancel':game.cancelTask(room,player);break;
       case '/api/symbol':game.sendSymbol(room,player,data.symbol);break;
       case '/api/submit':result=game.submit(room,player,data.answer);break;
       case '/api/repair':result=game.repair(room,player,data.step);break;
       case '/api/sabotage':game.sabotage(room,player,data.type,data.station);break;
       case '/api/ping':game.ping(room,player,data.type,data.station);break;
       case '/api/react':game.react(room,player);break;
       case '/api/arm':game.arm(room,player,data.value);break;
       case '/api/vote':game.vote(room,player,data.target);break;
       default:return reply(res,{error:'Unknown action.'},404);
     }
     return reply(res,{state:game.snapshot(room,player),...result});
   }
   if(req.method==='GET'||req.method==='HEAD'){
     let path=url.pathname==='/'?'/index.html':url.pathname;try{path=decodeURIComponent(path);}catch{return reply(res,{error:'Invalid path.'},400);}
     const file=resolve(ROOT,`.${path}`);if(!file.startsWith(ROOT+sep))return reply(res,{error:'Not found.'},404);
     try{if(!(await stat(file)).isFile())throw Error();const content=req.method==='HEAD'?null:await readFile(file);res.writeHead(200,{'Content-Type':MIME[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});return res.end(content);}catch{return reply(res,{error:'Not found.'},404);}
   }
   return reply(res,{error:'Method not allowed.'},405);
  }catch(e){if(!res.headersSent&&!res.destroyed)reply(res,{error:e.status?e.message:'Server error. Try again.'},e.status||500);if(!e.status)console.error('[vault]',e);}
 });
 // Lightweight server clock is authoritative; browser timers only display remaining time.
 const tick=setInterval(()=>{game.tick();for(const r of game.rooms.values())if(['ready','playing','vote','results'].includes(r.phase))for(const p of r.players)for(const res of streams.get(p.id)||[])send(res,game.snapshot(r,p));},1000);tick.unref?.();
 const heartbeat=setInterval(()=>{game.prune();for(const set of streams.values())for(const res of set)if(!res.destroyed)res.write(': heartbeat\n\n');},15000);heartbeat.unref?.();
 return {game,server,listen(port=Number(process.env.PORT)||3000){return new Promise(done=>server.listen(port,'0.0.0.0',()=>done(server.address())));},close(){closing=true;clearInterval(tick);clearInterval(heartbeat);for(const set of streams.values())for(const res of set)res.end();return new Promise((done,fail)=>server.close(e=>e?fail(e):done()));}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){createApp().listen().then(a=>console.log(`THE VAULT — READY ON http://localhost:${a.port}`));}
