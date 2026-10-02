import { randomBytes, randomInt } from 'node:crypto';
const CHARSET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GLYPHS=['◆','✦','●','▲','☾','⬡'];
const STATIONS=['cameras','lasers','vault'];
const GADGETS=['surge','scramble','lockdown','decoy'];
const EVENTS=['sweep','bonus','power'];
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const pick=items=>items[randomInt(items.length)];
const shuffle=items=>[...items].sort(()=>Math.random()-.5);
const uid=()=>randomBytes(16).toString('hex');
const now=()=>Date.now();
const limits={name:18,message:80};
function makeTask(type,station,at){
 const id=uid();
 if(type==='wires') {
   const sockets=shuffle([0,1,2,3]);
   return {id,type,station,started:at,expires:at+32000,source:[0,1,2,3],sockets,solution:[0,1,2,3]};
 }
 if(type==='memory'){
   const sequence=Array.from({length:4+randomInt(2)},()=>randomInt(9));
   return {id,type,station,started:at,expires:at+32000,sequence,solution:sequence};
 }
 if(type==='laser'){
   const solution=[0,0,1,0]; // 0 is '/' and 1 is '\\'.
   const start=Array.from({length:4},()=>randomInt(2));
   if(start.every((n,i)=>n===solution[i]))start[randomInt(4)]^=1;
   return {id,type,station,started:at,expires:at+35000,start,solution};
 }
 throw error('Unknown task.');
}
function publicTask(task,player){
 if(!task)return null;
 if(task.type==='split') {
   const data={id:task.id,type:'split',station:'vault',expires:task.expires,role:task.members.length===1?'waiting':task.members[0]===player.id?'sender':'decoder',partnerReady:task.members.length===2,symbols:GLYPHS};
   if(data.role==='sender'){data.secret=task.secret;data.sentCount=task.received.length;}
   if(data.role==='decoder'){data.mapping=task.mapping;data.received=task.received;}
   return data;
 }
 const {id,type,station,started,expires,source,sockets,sequence,start}=task;
 return {id,type,station,started,expires,source,sockets,sequence,start};
}
export class Game {
 constructor({onUpdate=()=>{},time=now,duration=210000,voteMs=15000,resultsMs=15000,readyMs=15000,random=pick}={}){
   this.rooms=new Map();this.sessions=new Map();this.onUpdate=onUpdate;this.time=time;
   this.duration=duration;this.voteMs=voteMs;this.resultsMs=resultsMs;this.readyMs=readyMs;this.random=random;
 }
 notify(r){r.updated=this.time();this.onUpdate(r);}
 name(value){const name=String(value??'').trim().replace(/\s+/g,' ');if(name.length<2||name.length>limits.name||/[<>\u0000-\u001f]/.test(name))throw error('Choose a nickname of 2–18 characters.');return name;}
 roomCode(){let code;do{code=Array.from({length:6},()=>CHARSET[randomInt(CHARSET.length)]).join('');}while(this.rooms.has(code));return code;}
 addPlayer(r,name){if(r.players.length>=8)throw error('This room is full.');const n=this.name(name);if(r.players.some(p=>p.name.toLowerCase()===n.toLowerCase()))throw error('That nickname is already in use.');const p={id:uid(),token:uid(),name:n,score:0,online:false,sabotagesUsed:0,puzzles:0,repairs:0,lastPing:0,task:null,armed:false,hasReacted:false,vote:undefined,gadgets:[],readyAt:0};r.players.push(p);this.sessions.set(p.token,{room:r,player:p});this.notify(r);return {room:r,player:p,token:p.token};}
 create(name){const r={code:this.roomCode(),hostId:null,phase:'lobby',round:0,players:[],created:this.time(),updated:this.time(),stationProgress:{cameras:0,lasers:0,vault:0},stationTargets:2,alarm:0,logs:[],pings:[],events:[],sabotageHistory:[],usedSaboteurs:[],activeEvent:null,breachSince:0};this.rooms.set(r.code,r);const joined=this.addPlayer(r,name);r.hostId=joined.player.id;this.notify(r);return joined;}
 join(code,name){const r=this.rooms.get(String(code||'').toUpperCase().trim());if(!r)throw error('Room not found. Double-check your code.',404);if(r.phase!=='lobby')throw error('This heist has already started. Join the next game.',409);return this.addPlayer(r,name);}
 playerFromSession(token){return this.sessions.get(token)||null;}
 authenticated(token){return this.playerFromSession(token)||(()=>{throw error('Please create or join a room first.',401);})();}
 presence(token,online){const f=this.playerFromSession(token);if(!f)return;if(f.player.online!==online){f.player.online=online;this.notify(f.room);}}
 leave(r,p){if(r.phase!=='lobby' && r.phase!=='finished')throw error('Finish your current match before leaving.');r.players=r.players.filter(x=>x.id!==p.id);this.sessions.delete(p.token);if(!r.players.length){this.rooms.delete(r.code);return;}if(r.hostId===p.id)r.hostId=r.players[0].id;this.notify(r);}
 start(r,p){if(r.hostId!==p.id)throw error('Only the host can start.');if(r.phase!=='lobby'&&r.phase!=='finished')throw error('A match is already running.');if(r.players.length<2)throw error('You need at least two players.');r.round=0;r.usedSaboteurs=[];for(const q of r.players)q.score=0;this.launch(r);}
 launch(r){const t=this.time();r.round++;r.phase='ready';r.phaseEnds=t+this.readyMs;r.alarm=0;r.stationProgress={cameras:0,lasers:0,vault:0};r.stationTargets=r.players.length<4?2:r.players.length<7?3:4;r.logs=[];r.pings=[];r.activeEvent=null;r.nextEventAt=undefined;r.stationLocks={};r.decoyUntil={};r.sabotageHistory=[];r.splitTask=null;r.breachSince=0;r.breachDone=false;r.repair={sequence:Array.from({length:3},()=>randomInt(4)),progress:{}};
   const eligible=r.players.filter(p=>!r.usedSaboteurs.includes(p.id));if(!eligible.length)r.usedSaboteurs=[];
   r.saboteurId=r.players.length<3?null:this.random(r.players.filter(p=>!r.usedSaboteurs.includes(p.id))).id;
   if(r.saboteurId)r.usedSaboteurs.push(r.saboteurId);
   for(const p of r.players){p.puzzles=0;p.repairs=0;p.sabotagesUsed=0;p.lastPing=0;p.lastRepair=0;p.task=null;p.armed=false;p.hasReacted=false;p.vote=undefined;p.gadgets=p.id===r.saboteurId?shuffle(GADGETS).slice(0,2):[];p.gadgetUses=[];p.lastGadget=0;p.readyAt=0;}
   r.logs.push({at:t,text:`HEIST ${r.round} OF 3 — Get ready.`,kind:'info'});this.notify(r);
 }
 begin(r){const t=this.time();r.phase='playing';r.endsAt=t+this.duration;r.nextEventAt=t+40000;r.phaseEnds=undefined;r.logs.push({at:t,text:'SYSTEMS ONLINE. THE HEIST HAS BEGUN.',kind:'info'});this.notify(r);}
 log(r,text,kind='info'){r.logs.unshift({at:this.time(),text,kind});r.logs=r.logs.slice(0,16);}
 requirePlaying(r){if(r.phase!=='playing'||this.time()>=r.endsAt||r.alarm>=100)throw error('This heist is no longer active.',409);}
 task(r,p,type,station){this.requirePlaying(r);if(!STATIONS.includes(station))throw error('Choose a valid station.');if(r.stationProgress[station]>=r.stationTargets)throw error('That station is already complete.');if((r.decoyUntil[station]||0)>this.time()&&r.stationProgress[station]+1>=r.stationTargets)throw error('This station appears complete. Check back shortly.');if((r.stationLocks[station]||0)>this.time())throw error('That station is locked down.');if(p.task)throw error('Finish or cancel your current task first.');if(type==='split'){if(station!=='vault')throw error('Split Code only works at the vault.');return this.joinSplit(r,p);}
   if(!['memory','wires','laser'].includes(type))throw error('Invalid mini-game.');
   if(type==='laser' && station==='cameras')throw error('This puzzle is not at the camera station.');
   p.task=makeTask(type,station,this.time());this.notify(r);
 }
 joinSplit(r,p){const t=this.time();if(r.splitTask&&r.splitTask.members.length<2 && r.splitTask.expires>t && !r.splitTask.members.includes(p.id)){
   r.splitTask.members.push(p.id);p.task=r.splitTask;this.log(r,'TWO CREW MEMBERS LINKED AT THE VAULT.','good');this.notify(r);return;
 }
 if(r.splitTask&&r.splitTask.members.length>=2)throw error('A Split Code team is already active.');
 const symbols=Array.from({length:4},()=>randomInt(6));const mapping=shuffle([1,2,3,4,5,6]);const task={id:uid(),type:'split',station:'vault',started:t,expires:t+45000,members:[p.id],secret:symbols.map(i=>GLYPHS[i]),mapping:GLYPHS.map((g,i)=>({symbol:g,digit:mapping[i]})),solution:symbols.map(i=>mapping[i]).join(''),received:[]};r.splitTask=task;p.task=task;this.log(r,`${p.name} needs a partner for Split Code.`);this.notify(r);
 }
 cancelTask(r,p){if(p.task?.type==='split'){for(const q of r.players)if(q.task===p.task)q.task=null;r.splitTask=null;this.log(r,'Split Code disconnected. The terminal is ready again.');}else p.task=null;this.notify(r);}
 sendSymbol(r,p,symbol){this.requirePlaying(r);const task=p.task;if(task?.type!=='split'||task.members.length!==2||task.members[0]!==p.id)throw error('You are not the symbol sender.');if(!task.secret.includes(symbol))throw error('Choose a symbol from your sequence.');if(task.received.length>=4)throw error('The full sequence has already been sent.');task.received.push(symbol);this.notify(r);}
 submit(r,p,answer){this.requirePlaying(r);const t=this.time();const task=p.task;if(!task)throw error('Choose a mini-game first.');if(task.expires<=t){this.cancelTask(r,p);throw error('Time ran out. Try another puzzle.');}
   let passed=false;
   if(task.type==='split'){
     if(task.members.length!==2||task.members[1]!==p.id)throw error('Only the decoder can submit the code.');
     if(task.received.length!==4)throw error('Wait for your partner to send four symbols.');
     passed=String(answer)===task.solution;
   }else if(task.type==='memory')passed=Array.isArray(answer)&&answer.length===task.solution.length&&answer.every((v,i)=>Number(v)===task.solution[i]);
   else if(task.type==='wires')passed=Array.isArray(answer)&&answer.length===4&&answer.every((v,i)=>Number(v)===task.solution[i]);
   else if(task.type==='laser')passed=Array.isArray(answer)&&answer.length===4&&answer.every((v,i)=>Number(v)===task.solution[i]);
   if(!passed){r.alarm=Math.min(100,r.alarm+3);this.log(r,`${p.name} triggered a minor security alert (+3%).`,'warn');if(task.type==='split'){task.received=[];}else{p.task=null;}if(r.alarm>=100)this.finishHeist(r,false);else this.notify(r);return {passed:false};}
   const members=task.type==='split'?r.players.filter(x=>task.members.includes(x.id)):[p];
   for(const q of members){q.puzzles++;const bonus=r.activeEvent?.type==='bonus'&&r.activeEvent.until>t?10:0;q.score+=(q.puzzles<=4?15:0)+bonus;q.task=null;}
   if(task.type==='split')r.splitTask=null;
   if(r.stationProgress[task.station]<r.stationTargets)r.stationProgress[task.station]++;
   this.log(r,`${members.map(x=>x.name).join(' + ')} cleared ${task.station.toUpperCase()} (${r.stationProgress[task.station]}/${r.stationTargets}).`,'good');
   if(STATIONS.every(s=>r.stationProgress[s]>=r.stationTargets)){this.log(r,'ALL SYSTEMS CLEARED! TWO PLAYERS MUST ENGAGE THE FINAL LOCK.','good');for(const q of r.players)q.task=null;r.splitTask=null;}
   this.notify(r);return {passed:true};
 }
 repair(r,p,step){this.requirePlaying(r);if(p.task)throw error('Cancel your puzzle before repairing.');if(r.alarm<10)throw error('Alarm must reach 10% before emergency repairs are needed.');if(this.time()-p.lastRepair<25000)throw error('Your repair kit is recharging.');if(!Number.isInteger(step)||step<0||step>3)throw error('Invalid repair button.');if(!r.repair){r.repair={sequence:Array.from({length:3},()=>randomInt(4)),progress:{}};}
   const current=r.repair.progress[p.id]??0;
   if(r.repair.sequence[current]!==step){r.repair.progress[p.id]=0;r.alarm=Math.min(100,r.alarm+2);this.log(r,`${p.name} mistimed a security repair (+2%).`,'warn');if(r.alarm>=100)this.finishHeist(r,false);else this.notify(r);return {passed:false};}
   r.repair.progress[p.id]=current+1;
   if(r.repair.progress[p.id]===r.repair.sequence.length){r.alarm=Math.max(0,r.alarm-15);p.repairs++;p.lastRepair=this.time();if(p.repairs<=2)p.score+=25;r.repair={sequence:Array.from({length:3},()=>randomInt(4)),progress:{}};this.log(r,`${p.name} repaired the security grid (−15% alarm).`,'good');this.notify(r);return {passed:true};}
   this.notify(r);return {passed:null};
 }
 sabotage(r,p,type,station){this.requirePlaying(r);if(p.id!==r.saboteurId)throw error('Only the saboteur has gadgets.',403);if(!p.gadgets.includes(type)||p.gadgetUses.includes(type))throw error('This gadget is unavailable.');const t=this.time();if(t-p.lastGadget<15000)throw error('Gadgets need 15 seconds to recharge.');if(!STATIONS.includes(station))throw error('Choose a security station.');if((type==='scramble'||type==='lockdown'||type==='decoy')&&r.stationProgress[station]>=r.stationTargets)throw error('Choose a station that is still active.');
  if(type==='scramble'&&!r.players.some(q=>q.task?.station===station))throw error('Scramble needs an active puzzle at that station.');
  if(type==='surge')r.alarm=Math.min(100,r.alarm+18);
  else if(type==='scramble'){for(const q of r.players)if(q.task?.station===station){if(q.task.type==='split'){this.cancelTask(r,q);}else q.task=null;}}
  else if(type==='lockdown'){r.stationLocks[station]=t+12000;for(const q of r.players)if(q.task?.station===station)this.cancelTask(r,q);}
  else if(type==='decoy')r.decoyUntil[station]=t+12000;
  p.gadgetUses.push(type);p.lastGadget=t;p.sabotagesUsed++;p.score+=30;r.sabotageHistory.push({at:t,type,station});this.log(r,type==='decoy'?`SUSPICIOUS SENSOR ANOMALY AT ${station.toUpperCase()}.`:`UNAUTHORIZED ${type.toUpperCase()} AT ${station.toUpperCase()}.`,'danger');if(r.alarm>=100)this.finishHeist(r,false);else this.notify(r);
 }
 ping(r,p,type,station){this.requirePlaying(r);if(!['help','done','danger','come','repair','hurry'].includes(type))throw error('Invalid quick message.');if(station&&!STATIONS.includes(station))throw error('Invalid station.');const t=this.time();if(t-p.lastPing<4000)throw error('Wait a moment before sending another ping.');p.lastPing=t;r.pings.unshift({name:p.name,type,station:station||null,at:t});r.pings=r.pings.slice(0,6);this.notify(r);}
 react(r,p){this.requirePlaying(r);if(r.activeEvent?.type!=='sweep'||r.activeEvent.until<=this.time())throw error('No active sweep to dodge.');p.hasReacted=true;this.notify(r);}
 arm(r,p,value){this.requirePlaying(r);if(!STATIONS.every(s=>r.stationProgress[s]>=r.stationTargets))throw error('Complete the three security systems first.');p.armed=!!value;if(r.players.filter(q=>q.armed&&q.online).length<2)r.breachSince=0;this.notify(r);}
 finishHeist(r,crewWon){if(r.phase!=='playing')return;r.phase='vote';r.crewWon=crewWon;r.phaseEnds=this.time()+this.voteMs;r.activeEvent=null;r.breachSince=0;for(const q of r.players){q.task=null;q.armed=false;q.vote=undefined;}r.splitTask=null;this.log(r,crewWon?'THE VAULT IS OPEN. CREW VICTORY!':'THE HEIST HAS FAILED. SECURITY WINS. ',crewWon?'good':'danger');this.notify(r);}
 vote(r,p,target){if(r.phase!=='vote'||this.time()>=r.phaseEnds)throw error('Voting has ended.');if(p.vote!==undefined)throw error('You already voted.');if(r.players.length<3)throw error('No suspect voting in a two-player game.');if(target!==null && (target===p.id||!r.players.some(x=>x.id===target)))throw error('Choose another player or skip.');p.vote=target;this.notify(r);if(r.players.every(q=>q.vote!==undefined))this.resolveVote(r);}
 resolveVote(r){if(r.phase!=='vote')return;r.phase='results';r.phaseEnds=this.time()+this.resultsMs;const votes=r.players.filter(p=>p.vote===r.saboteurId).length;
   const sab=r.players.find(p=>p.id===r.saboteurId);
   for(const p of r.players){if(p.id===r.saboteurId){if(sab&&votes*2<r.players.length)p.score+=40;}else{if(p.vote===r.saboteurId&&sab)p.score+=40;}if(sab&&((p.id===r.saboteurId&&!r.crewWon)||(p.id!==r.saboteurId&&r.crewWon)))p.score+=150;}
   if(!r.saboteurId&&r.crewWon)for(const p of r.players)p.score+=150;
   this.notify(r);
 }
 next(r){if(r.phase!=='results')return;if(r.round>=3){r.phase='finished';r.phaseEnds=undefined;this.log(r,'MATCH COMPLETE. FINAL LEADERBOARD READY.','good');this.notify(r);}else this.launch(r);}
 tick(){const t=this.time();for(const r of this.rooms.values()){
   if(r.phase==='ready'&&t>=r.phaseEnds){this.begin(r);continue;}
   if(r.phase==='playing'){
     if(t>=r.endsAt){this.finishHeist(r,false);continue;}
     if(r.alarm>=100){this.finishHeist(r,false);continue;}
     if(r.activeEvent&&t>=r.activeEvent.until){if(r.activeEvent.type==='sweep'){const failed=r.players.filter(q=>q.online&&!q.hasReacted).length;if(failed){r.alarm=Math.min(100,r.alarm+failed*5);this.log(r,`${failed} player(s) missed the laser sweep (+${failed*5}% alarm).`,'warn');}}r.activeEvent=null;if(r.alarm>=100){this.finishHeist(r,false);continue;}this.notify(r);}
     if(!r.activeEvent&&t>=r.nextEventAt-5000&&t<r.nextEventAt){if(!r.warning||r.warning!==r.nextEventAt){r.warning=r.nextEventAt;this.log(r,'SECURITY EVENT IN FIVE SECONDS!','warn');this.notify(r);}}
     if(t>=r.nextEventAt){const type=this.random(EVENTS);r.nextEventAt+=45000;r.warning=undefined;
       if(type==='sweep'){r.activeEvent={type,until:t+8000};for(const p of r.players)p.hasReacted=false;this.log(r,'LASER SWEEP! HIT DODGE WITHIN EIGHT SECONDS.','danger');}
       else if(type==='bonus'){r.activeEvent={type,until:t+12000};this.log(r,'OVERCLOCK: BONUS POINTS FOR PUZZLES FOR 12 SECONDS!','good');}
       else{const station=this.random(STATIONS);r.stationLocks[station]=t+8000;r.alarm=Math.min(100,r.alarm+8);this.log(r,`POWER SURGE: ${station.toUpperCase()} LOCKED FOR 8s (+8% ALARM).`,'danger');}
       if(r.alarm>=100){this.finishHeist(r,false);continue;}this.notify(r);
     }
     for(const q of r.players)if(q.task?.expires<=t)this.cancelTask(r,q);
     const armed=r.players.filter(p=>p.armed&&p.online).length;
     if(STATIONS.every(s=>r.stationProgress[s]>=r.stationTargets)&&armed>=2){if(!r.breachSince){r.breachSince=t;this.notify(r);}else if(t-r.breachSince>=8000){this.finishHeist(r,true);continue;}}
     else if(r.breachSince){r.breachSince=0;this.notify(r);}
   } else if(r.phase==='vote'&&t>=r.phaseEnds)this.resolveVote(r);
   else if(r.phase==='results'&&t>=r.phaseEnds)this.next(r);
   if(t-r.created>6*3600000){for(const p of r.players)this.sessions.delete(p.token);this.rooms.delete(r.code);}
  }}
 snapshot(r,p){const t=this.time();const phase=r.phase;
   const visible=(phase==='results'||phase==='finished');
   const votes=visible?r.players.map(q=>({name:q.name,target:r.players.find(x=>x.id===q.vote)?.name||null})):null;
   const role=p.id===r.saboteurId?'saboteur':'crew';
   const personal=p.task?publicTask(p.task,p):null;
   const progress=Object.fromEntries(STATIONS.map(s=>[s,{actual:r.stationProgress[s],visible:(r.decoyUntil?.[s]||0)>t?Math.min(r.stationTargets,r.stationProgress[s]+1):r.stationProgress[s],target:r.stationTargets,lockedUntil:r.stationLocks?.[s]||0,decoy:(r.decoyUntil?.[s]||0)>t} ]));
   return {code:r.code,hostId:r.hostId,me:p.id,phase,round:r.round,totalRounds:3,players:r.players.map(q=>({id:q.id,name:q.name,online:q.online,score:q.score,armed:q.armed})),role:phase==='lobby'?null:role,roleReveal:visible?r.players.find(q=>q.id===r.saboteurId)?.name||null:undefined,crewWon:visible?r.crewWon:undefined,votes,roleGadgets:role==='saboteur'&&phase==='playing'?p.gadgets.map(type=>({type,used:p.gadgetUses.includes(type)})):[],gadgetCooldownUntil:p.lastGadget+15000,phaseEnds:r.phaseEnds||null,endsAt:r.endsAt||null,stationProgress:progress,alarm:r.alarm,logs:r.logs.slice(0,9),pings:r.pings.slice(0,5),task:personal,splitPending:r.splitTask?.members.length===1&&r.splitTask?.members[0]!==p.id,repair:r.repair?{sequence:r.repair.sequence,progress:r.repair.progress[p.id]??0,cooldownUntil:p.lastRepair+25000,canRepair:r.alarm>=10}:null,activeEvent:r.activeEvent,hasReacted:p.hasReacted,breachSince:r.breachSince,readyCount:r.players.filter(q=>q.armed&&q.online).length,armed:p.armed,hasVoted:p.vote!==undefined,scores:r.players.map(q=>({name:q.name,score:q.score,id:q.id})).sort((a,b)=>b.score-a.score),eventWarning:r.warning?Math.max(0,Math.ceil((r.warning-t)/1000)):0,sabotageHistory:visible?r.sabotageHistory:undefined};
 }
 prune(){const t=this.time();for(const r of this.rooms.values())if(t-r.created>6*3600000){for(const p of r.players)this.sessions.delete(p.token);this.rooms.delete(r.code);}}
}
