(() => {
  const canvas = document.getElementById('raidCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const raidLayout = window.RaidLayout;
  const raidBackdrop = new Image();
  let backdropReady = false;
  raidBackdrop.addEventListener('load', () => { backdropReady = true; });
  raidBackdrop.src = 'assets/raid-backdrop.svg';
  const loadSpriteSet = (folder, names) => Object.fromEntries(names.map((name) => {
    const image = new Image(); image.src = `assets/${folder}/${name}.svg`; return [name, image];
  }));
  const hunterSprites = loadSpriteSet('hunters', ['engine','ai','forge','artist','scout','worker']);
  const monsterSprites = loadSpriteSet('monsters', ['boss','elite','mob']);
  const ui = Object.fromEntries(['machineName','cpuValue','memoryValue','gpuValue','processValue','liveText','hunterCount','bossCount','comboCount','updatedAt','roster','questLog','versionText'].map((id) => [id, document.getElementById(id)]));
  const palette = { ink:'#271d18', sky:'#899f91', fog:'#c5bea1', ground:'#7d5c3f', grass:'#53684d', gold:'#efb84b', red:'#b8483d', cream:'#fff0bd', blue:'#5b8997', purple:'#746381', green:'#63805a' };
  let state = null;
  let previous = null;
  let logs = [];
  let soundOn = false;
  let audioContext = null;
  let paused = false;
  let lastFrame = 0;
  const actors = new Map();
  let activeExchange = null;
  let lastExchangeKey = '';

  const itemNames = {
    'strategy-scroll': '전략 두루마리',
    'scout-report': '정찰 정보',
    'repair-kit': '수리 도구',
    'inspiration-orb': '영감 구슬',
    'energy-meal': '회복 식량',
  };

  function pct(value) { return value == null ? '--' : `${Math.round(value)}%`; }
  function escapeText(value) { return String(value ?? ''); }
  function timeText(timestamp = Date.now()) { return new Date(timestamp).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }); }

  function setText(element, value) { element.textContent = escapeText(value); }

  function updateUI(next) {
    if (!next || next.error) {
      setText(ui.liveText, '읽기 실패');
      addLog(next?.error || '시스템 정보 연결 실패');
      return;
    }
    previous = state;
    state = next;
    const t = next.telemetry;
    setText(ui.machineName, `${t.hostname} · ${t.platform}`);
    setText(ui.cpuValue, pct(t.cpuLoad));
    setText(ui.memoryValue, t.memoryTotal ? `${t.memoryUsed.toFixed(1)}/${t.memoryTotal.toFixed(0)}G` : '--');
    setText(ui.gpuValue, pct(t.gpuLoad));
    setText(ui.processValue, t.processCount);
    setText(ui.liveText, '로컬 실시간');
    setText(ui.hunterCount, next.hunters.length);
    setText(ui.bossCount, next.monsters.length);
    setText(ui.comboCount, next.hunters.filter((h) => h.state === 'attack').length);
    setText(ui.updatedAt, timeText(t.timestamp));
    renderRoster(next.hunters);
    deriveLogs(previous, next);
    beginExchange(next);
  }

  function beginExchange(next) {
    const exchange = next.interaction;
    if (!exchange) { lastExchangeKey = ''; return; }
    const key = exchange.eventId || `${exchange.fromPid}:${exchange.toPid}:${exchange.item}`;
    if (key === lastExchangeKey) return;
    lastExchangeKey = key;
    activeExchange = { ...exchange, startedAt: performance.now(), duration: 6200 };
    const from = next.hunters.find((hunter) => hunter.pid === exchange.fromPid);
    const to = next.hunters.find((hunter) => hunter.pid === exchange.toPid);
    if (from && to) addLog(`${from.name} → ${to.name} : ${itemNames[exchange.item] || '협업 물자'} 전달 연출`);
  }

  function renderRoster(hunters) {
    ui.roster.replaceChildren();
    if (!hunters.length) {
      const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = '활성 작업 앱 헌터가 없습니다.'; ui.roster.append(empty); return;
    }
    hunters.forEach((hunter) => {
      const row = document.createElement('div'); row.className = 'roster-row';
      const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.style.setProperty('--avatar', archetypeColor(hunter.archetype));
      const name = document.createElement('div'); name.className = 'roster-name';
      const strong = document.createElement('strong'); strong.textContent = hunter.name;
      const status = document.createElement('span'); status.className = hunter.state === 'attack' ? 'status-attack' : 'status-rest'; status.textContent = hunter.state === 'attack' ? `${hunter.title} · 협공 중` : `${hunter.title} · ${recoveryLabel(hunter.recovery)}`;
      name.append(strong, status);
      const stat = document.createElement('div'); stat.className = 'roster-stat'; stat.textContent = `${hunter.cpu.toFixed(1)}%\n${hunter.memoryMB}M`; stat.style.whiteSpace = 'pre-line';
      row.append(avatar, name, stat); ui.roster.append(row);
    });
  }

  function deriveLogs(oldState, next) {
    if (!oldState) {
      addLog(`${next.hunters.length}명의 헌터가 원정대에 집결했습니다.`);
      addLog(`${next.monsters[0]?.name || '업무'} 토벌을 시작합니다.`);
      return;
    }
    const oldHunters = new Set(oldState.hunters.map((h) => h.pid));
    const joined = next.hunters.find((h) => !oldHunters.has(h.pid));
    if (joined) addLog(`${joined.name} 헌터가 협공에 합류했습니다.`);
    const newBoss = next.monsters.find((m) => !oldState.monsters.some((old) => old.pid === m.pid));
    if (newBoss) addLog(`${newBoss.rank} ${newBoss.name} 출현 · 위협도 ${newBoss.threat}`);
    const resting = next.hunters.find((h) => h.state === 'recover' && oldState.hunters.find((old) => old.pid === h.pid)?.state === 'attack');
    if (resting) addLog(`${resting.name}이(가) ${recoveryLabel(resting.recovery)} 중입니다.`);
  }

  function addLog(message) {
    logs.unshift({ at: Date.now(), message }); logs = logs.slice(0, 8);
    ui.questLog.replaceChildren();
    logs.forEach((entry) => {
      const li = document.createElement('li'); const time = document.createElement('time'); const span = document.createElement('span');
      time.textContent = timeText(entry.at).slice(0, 5); span.textContent = entry.message; li.append(time, span); ui.questLog.append(li);
    });
    if (soundOn) tone(180 + Math.random() * 80, .04, .025);
  }

  function archetypeColor(type) { return ({engine:'#bc6b45',ai:'#766aa5',forge:'#557d91',artist:'#a95f76',scout:'#7a9161',worker:'#ad8b45'})[type] || '#6d8290'; }
  function recoveryLabel(action) { return ({sleep:'낮잠 회복',meal:'야전 식사',sharpen:'무기 손질',campfire:'모닥불 휴식'})[action] || '대기'; }

  function resize() {
    const rect = canvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr)); canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
  }

  function rect(x,y,w,h,color,stroke=palette.ink) { ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.strokeRect(Math.round(x)+1,Math.round(y)+1,Math.round(w)-2,Math.round(h)-2);} }
  function label(text,x,y,size=11,align='center',color=palette.cream){ctx.font=`700 ${size}px "Malgun Gothic", sans-serif`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=palette.ink;ctx.fillText(text,x+1,y+1);ctx.fillStyle=color;ctx.fillText(text,x,y);}

  function drawBackground(w,h,t) {
    if(backdropReady){
      ctx.drawImage(raidBackdrop,0,0,w,h);
    }else{
      const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#101827');sky.addColorStop(.56,'#3c4e4d');sky.addColorStop(1,'#201b1d');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    }
    const shade=ctx.createLinearGradient(0,0,0,h);shade.addColorStop(0,'rgba(4,8,14,.04)');shade.addColorStop(.58,'rgba(8,8,12,.08)');shade.addColorStop(1,'rgba(6,5,8,.42)');ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
    ctx.save();ctx.globalCompositeOperation='screen';
    for(let i=0;i<24;i++){const x=(i*97+t*.018*(1+i%3))%(w+80)-40;const y=h*(.18+.03*(i%7))+Math.sin(t*.0007+i)*16;ctx.fillStyle=`rgba(173,205,185,${.025+(i%4)*.012})`;ctx.fillRect(x,y,52+(i%5)*18,2+(i%2)*2)}
    for(let i=0;i<34;i++){const x=(i*71+t*.025*(1+i%4))%w;const y=h-(i*43+t*.032*(1+i%2))%(h*.44);const s=2+(i%3);ctx.fillStyle=i%4===0?'rgba(255,194,91,.72)':'rgba(125,189,176,.35)';ctx.fillRect(x,y,s,s)}
    ctx.restore();
    ctx.fillStyle='rgba(13,10,14,.24)';ctx.fillRect(0,h*.88,w,h*.12);
    drawBoard(w-170,22);
  }

  function drawCamp(x,y,t){rect(x,y+37,95,54,'#74503b');rect(x+12,y+17,70,34,'#d19a58');ctx.fillStyle='#885338';ctx.beginPath();ctx.moveTo(x+8,y+18);ctx.lineTo(x+47,y-16);ctx.lineTo(x+88,y+18);ctx.fill();rect(x+39,y+52,20,39,'#382a22');ctx.fillStyle='#f4a63d';ctx.fillRect(x+116,y+61+Math.sin(t*.01)*2,11,15);ctx.fillStyle='#d84d36';ctx.fillRect(x+119,y+55+Math.sin(t*.01)*3,6,13);ctx.fillStyle='#46352a';ctx.fillRect(x+106,y+76,33,5)}
  function drawBoard(x,y){rect(x,y,146,63,'#6b4934');rect(x+8,y+8,130,47,'#dcc395');label('RAID STATUS',x+73,y+18,9,'center','#4b3728');ctx.fillStyle='#b34739';ctx.fillRect(x+20,y+32,104,9);ctx.fillStyle='#edb64b';ctx.fillRect(x+20,y+32,Math.max(8,104*((state?.telemetry.cpuLoad||0)/100)),9)}

  function drawHunterEmblem(type,x,y,color){
    ctx.save();ctx.translate(x,y);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;
    if(type==='engine'){ctx.strokeRect(-5,-5,10,10);ctx.fillRect(-2,-8,4,16);ctx.fillRect(-8,-2,16,4)}
    else if(type==='ai'){ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(6,0);ctx.lineTo(0,7);ctx.lineTo(-6,0);ctx.closePath();ctx.stroke();ctx.fillRect(-2,-2,4,4)}
    else if(type==='forge'){ctx.fillRect(-7,-5,14,5);ctx.fillRect(-2,0,4,8)}
    else if(type==='artist'){ctx.beginPath();ctx.arc(0,0,6,-1.2,1.2);ctx.stroke();ctx.beginPath();ctx.moveTo(-2,-7);ctx.lineTo(6,0);ctx.lineTo(-2,7);ctx.stroke()}
    else if(type==='scout'){ctx.beginPath();ctx.arc(0,0,6,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(0,-4);ctx.lineTo(3,3);ctx.lineTo(-3,2);ctx.closePath();ctx.fill()}
    else{ctx.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i%2?4:8;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.stroke()}
    ctx.restore();
  }

  function fitTextToWidth(text,maxWidth,font){
    ctx.font=font;let shown=String(text);if(ctx.measureText(shown).width<=maxWidth)return shown;
    while(shown.length>2&&ctx.measureText(`${shown}…`).width>maxWidth)shown=shown.slice(0,-1);
    return `${shown}…`;
  }
  function drawNameplate(text,x,y,cpu,scale,maxWidth){
    const fontSize=Math.max(6,10*scale),cpuSize=Math.max(5,8*scale),width=Math.max(44,maxWidth),height=Math.max(20,28*scale);
    const font=`700 ${fontSize}px "Malgun Gothic", sans-serif`,shown=fitTextToWidth(text,width-10,font);
    ctx.fillStyle='rgba(11,12,16,.86)';ctx.fillRect(x-width/2,y-10,width,height);ctx.strokeStyle='rgba(222,181,91,.72)';ctx.lineWidth=Math.max(.7,scale);ctx.strokeRect(x-width/2+.5,y-9.5,width-1,height-1);
    label(shown,x,y,fontSize);label(`${cpu.toFixed(0)}%`,x,y+Math.max(8,10*scale),cpuSize,'center','#ffd46b');
  }

  function drawHunter(h,x,y,index,t,spriteScale=1){
    const attack=h.state==='attack',bob=Math.sin(t*(attack ? .012 : .004)+index)*(attack?5:2)*spriteScale,yy=y+bob,pulse=.5+.5*Math.sin(t*.008+index);
    const sprite=hunterSprites[h.archetype]||hunterSprites.worker,size=(attack?112:98)*spriteScale,height=size*1.25,metrics=raidLayout.hunterMetrics(attack?'attack':'recover',spriteScale);
    ctx.save();ctx.translate(x,yy);if(attack)ctx.rotate(Math.sin(t*.018+index)*.035);
    ctx.fillStyle='rgba(2,4,8,.56)';ctx.beginPath();ctx.ellipse(0,11*spriteScale,size*.32,10*spriteScale,0,0,Math.PI*2);ctx.fill();
    const aura=ctx.createRadialGradient(0,-height*.42,5*spriteScale,0,-height*.42,size*.7);aura.addColorStop(0,attack?`rgba(255,205,81,${.12+pulse*.14})`:'rgba(94,179,157,.1)');aura.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=aura;ctx.beginPath();ctx.arc(0,-height*.42,size*.7,0,Math.PI*2);ctx.fill();
    if(attack){ctx.strokeStyle=`rgba(255,219,111,${.38+pulse*.3})`;ctx.lineWidth=3*spriteScale;ctx.setLineDash([7*spriteScale,7*spriteScale]);ctx.lineDashOffset=-t*.035;ctx.beginPath();ctx.ellipse(0,7*spriteScale,size*.38,(12+pulse*2)*spriteScale,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([])}
    if(sprite.complete&&sprite.naturalWidth)ctx.drawImage(sprite,-size/2,-height+18*spriteScale,size,height);
    else{ctx.save();ctx.scale(spriteScale,spriteScale);rect(-18,-48,36,42,archetypeColor(h.archetype));drawHunterEmblem(h.archetype,0,-26,'#fff0bd');ctx.restore()}
    if(attack){ctx.globalCompositeOperation='screen';ctx.strokeStyle=`rgba(255,236,151,${.35+pulse*.55})`;ctx.lineWidth=6*spriteScale;ctx.beginPath();ctx.arc(18*spriteScale,-height*.55,52*spriteScale,-1.2,.4);ctx.stroke();ctx.globalCompositeOperation='source-over'}
    else{ctx.save();ctx.scale(spriteScale,spriteScale);drawRecovery(h.recovery,0,-height*.42/spriteScale,t);ctx.restore()}
    ctx.restore();drawNameplate(h.name,x,yy+24*spriteScale,h.cpu,spriteScale,metrics.labelWidth);
  }
  function drawRecovery(action,x,y,t){if(action==='sleep'){label('Z',x+15,y-48-Math.sin(t*.004)*4,11,'center','#fff0bd')}else if(action==='meal'){ctx.fillStyle='#e2a44b';ctx.fillRect(x+13,y-17,12,8);ctx.fillStyle='#fff0bd';ctx.fillRect(x+15,y-20,8,4)}else if(action==='sharpen'){ctx.strokeStyle='#ece2c2';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+9,y-13);ctx.lineTo(x+28,y-30);ctx.stroke()}else{ctx.fillStyle='#f0a43f';ctx.fillRect(x+14,y-10,8,11)}}

  function drawMonsterAura(m,x,y,scale,t,index){
    const pulse=.5+.5*Math.sin(t*.004+index);ctx.save();ctx.globalCompositeOperation='screen';
    const glow=ctx.createRadialGradient(x,y,8,x,y,78*scale);glow.addColorStop(0,m.rank==='BOSS'?`rgba(255,78,49,${.28+pulse*.15})`:`rgba(164,112,202,${.2+pulse*.12})`);glow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,78*scale,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.strokeStyle=m.rank==='BOSS'?'rgba(255,126,67,.55)':'rgba(173,137,207,.42)';ctx.lineWidth=2;ctx.setLineDash([5,8]);ctx.lineDashOffset=-t*.025;ctx.beginPath();ctx.ellipse(x,y+18*scale,58*scale,18*scale,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  }

  function drawMonster(m,x,y,index,t,spriteScale=1){
    const type=m.rank==='BOSS'?'boss':m.rank==='ELITE'?'elite':'mob',sprite=monsterSprites[type];
    const width=(type==='boss'?250:type==='elite'?194:154)*spriteScale,height=width*(220/260),sway=Math.sin(t*.004+index)*7*spriteScale,pulse=.5+.5*Math.sin(t*.009+index),xx=x+sway,metrics=raidLayout.monsterMetrics(m.rank,spriteScale);
    drawMonsterAura(m,xx,y,width/170,t,index);ctx.save();ctx.translate(xx,y);
    ctx.fillStyle='rgba(0,0,0,.58)';ctx.beginPath();ctx.ellipse(0,23*spriteScale,width*.36,14*spriteScale,0,0,Math.PI*2);ctx.fill();
    const recoil=Math.max(0,Math.sin(t*.006+index*1.7)-.88)*18*spriteScale;ctx.translate(recoil,0);
    if(sprite.complete&&sprite.naturalWidth)ctx.drawImage(sprite,-width/2,-height+28*spriteScale,width,height);
    else{ctx.save();ctx.scale(spriteScale,spriteScale);rect(-45,-70,90,90,type==='boss'?'#8f322f':'#654667');ctx.restore()}
    if(pulse>.92){ctx.globalCompositeOperation='screen';ctx.strokeStyle=`rgba(255,238,175,${(pulse-.92)*7})`;ctx.lineWidth=6*spriteScale;ctx.beginPath();ctx.arc(0,-height*.45,width*.36,0,Math.PI*2);ctx.stroke();ctx.globalCompositeOperation='source-over'}
    ctx.restore();
    const rankSize=Math.max(6,11*spriteScale),nameSize=Math.max(6,12*spriteScale),rankText=fitTextToWidth(m.rank,metrics.labelWidth,`700 ${rankSize}px sans-serif`),nameText=fitTextToWidth(m.name,metrics.labelWidth,`700 ${nameSize}px sans-serif`);
    label(rankText,xx,y-height+16*spriteScale,rankSize,'center',m.rank==='BOSS'?'#ffd061':'#d9c8ff');label(nameText,xx,y+34*spriteScale,nameSize);
    const barW=metrics.healthWidth,barY=y+48*spriteScale,barH=Math.max(6,13*spriteScale),inset=Math.max(2,3*spriteScale);ctx.fillStyle='rgba(10,10,15,.94)';ctx.fillRect(xx-barW/2,barY,barW,barH);ctx.strokeStyle='rgba(236,196,102,.7)';ctx.lineWidth=Math.max(.7,spriteScale);ctx.strokeRect(xx-barW/2+.5,barY+.5,barW-1,barH-1);ctx.fillStyle=m.rank==='BOSS'?'#d84b3f':'#8b628d';ctx.fillRect(xx-barW/2+inset,barY+inset,Math.max(3,(barW-inset*2)*Math.min(1,m.threat/100)),Math.max(2,barH-inset*2));
  }

  function drawImpactEffects(hunters,w,h,t){
    const attackers=hunters.filter((entry)=>entry.state==='attack');if(!attackers.length)return;const targetX=w*.69,targetY=h*.36;
    ctx.save();ctx.globalCompositeOperation='screen';attackers.slice(0,4).forEach((hunter,i)=>{const phase=(t*.0012+i*.23)%1;if(phase<.54)return;const p=actors.get(hunter.pid);if(!p)return;const q=(phase-.54)/.46,x=p.x+(targetX-p.x)*q,y=p.y-30+(targetY-(p.y-30))*q-Math.sin(q*Math.PI)*38;ctx.fillStyle=i%2?'rgba(123,213,232,.8)':'rgba(255,204,83,.88)';ctx.fillRect(x-3,y-3,7,7);ctx.strokeStyle='rgba(255,235,167,.38)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-(targetX-p.x)*.08,y-(targetY-p.y)*.08);ctx.stroke()});
    for(let i=0;i<7;i++){const a=t*.004+i*.9,r=23+(i%3)*9;ctx.fillStyle=i%2?'rgba(255,168,66,.65)':'rgba(119,211,211,.5)';ctx.fillRect(targetX+Math.cos(a)*r,targetY+Math.sin(a)*r,3+(i%2)*2,3+(i%2)*2)}ctx.restore();
  }

  function formationPosition(hunter,i,count,w,h,t){
    const mode=hunter.state==='attack'?'attack':'recover';
    return raidLayout.hunterPosition({index:i,count:Math.max(1,count),mode,width:w,height:h});
  }

  function updateActors(hunters,w,h,t){
    const livePids=new Set(hunters.map((hunter)=>hunter.pid));
    for(const pid of actors.keys())if(!livePids.has(pid))actors.delete(pid);
    if(activeExchange&&(t-activeExchange.startedAt)/activeExchange.duration>=1)activeExchange=null;
    hunters.forEach((hunter,i)=>{
      const target=formationPosition(hunter,i,hunters.length,w,h,t),actor=actors.get(hunter.pid)||{step:i*.7};
      actor.x=target.x;actor.y=target.y;actor.scale=target.scale;actor.step+=.045;
      actors.set(hunter.pid,actor);
    });
  }

  function drawLinks(hunters,monsters,w,h,t){if(!monsters.length)return;const targetX=w*.70,targetY=h*.38;ctx.save();ctx.setLineDash([5,7]);ctx.lineDashOffset=-t*.03;hunters.forEach((hunter)=>{if(hunter.state!=='attack')return;const p=actors.get(hunter.pid);if(!p)return;ctx.strokeStyle='rgba(255,218,112,.48)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x+15,p.y-22);ctx.lineTo(targetX-40,targetY);ctx.stroke()});ctx.restore()}

  function drawExchange(t){
    if(!activeExchange)return;const from=actors.get(activeExchange.fromPid),to=actors.get(activeExchange.toPid);if(!from||!to)return;
    const raw=(t-activeExchange.startedAt)/activeExchange.duration;const travel=Math.max(0,Math.min(1,(raw-.28)/.34));
    if(raw<.22){label('물자 교환!',(from.x+to.x)/2,(from.y+to.y)/2-72,11,'center','#ffe178');return}
    const eased=travel<.5?2*travel*travel:1-Math.pow(-2*travel+2,2)/2;const x=from.x+(to.x-from.x)*eased,y=from.y-30+(to.y-from.y)*eased-Math.sin(travel*Math.PI)*34;
    const colors={'strategy-scroll':'#d9c06b','scout-report':'#73a9bf','repair-kit':'#aeb2a8','inspiration-orb':'#c879a8','energy-meal':'#d9824b'};
    rect(x-7,y-7,14,14,colors[activeExchange.item]||palette.gold);label(itemNames[activeExchange.item]||'협업 물자',(from.x+to.x)/2,Math.min(from.y,to.y)-66,9,'center','#fff0bd');
    if(travel>.85){ctx.strokeStyle='#ffe58a';ctx.lineWidth=2;for(let a=0;a<6;a++){ctx.beginPath();ctx.moveTo(to.x,to.y-30);ctx.lineTo(to.x+Math.cos(a)*22,to.y-30+Math.sin(a)*22);ctx.stroke()}}
  }

  function frame(t){const w=canvas.clientWidth,h=canvas.clientHeight;if(w&&h){drawBackground(w,h,t);if(state){const hunters=state.hunters,monsters=state.monsters;updateActors(hunters,w,h,t);drawLinks(hunters,monsters,w,h,t);monsters.forEach((m,i)=>{const p=raidLayout.monsterPosition({index:i,count:monsters.length,rank:m.rank,width:w,height:h});drawMonster(m,p.x,p.y,i,t,p.scale)});drawImpactEffects(hunters,w,h,t);hunters.forEach((hunter,i)=>{const p=actors.get(hunter.pid);if(p)drawHunter(hunter,p.x,p.y+Math.sin(p.step)*2,i,t,p.scale)});drawExchange(t);if(hunters.filter(h=>h.state==='attack').length>=2)label(`CO-OP CHAIN ×${hunters.filter(h=>h.state==='attack').length}`,w*.48,42,14,'center','#ffd76a')}else{label('실시간 원정대를 불러오는 중…',w/2,h/2,16)}}lastFrame=t;if(!paused)requestAnimationFrame(frame)}

  function tone(freq,duration,volume){if(!soundOn)return;if(!audioContext)audioContext=new AudioContext();const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='square';o.frequency.value=freq;g.gain.setValueAtTime(volume,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);o.connect(g).connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+duration)}

  document.getElementById('soundBtn').addEventListener('click',(event)=>{soundOn=!soundOn;event.currentTarget.setAttribute('aria-pressed',String(soundOn));event.currentTarget.textContent=soundOn?'♪ SOUND ON':'♪ SOUND OFF';if(soundOn)tone(260,.12,.04)});
  document.getElementById('refreshBtn').addEventListener('click',async()=>{const next=await window.raidAPI.refresh();updateUI(next);tone(330,.06,.03)});
  document.addEventListener('visibilitychange',()=>{paused=document.hidden;if(!paused)requestAnimationFrame(frame)});
  window.addEventListener('resize',resize);
  new ResizeObserver(resize).observe(canvas);
  window.raidAPI.onState(updateUI);
  window.raidAPI.version().then((version)=>setText(ui.versionText,`v${version}`));
  resize();requestAnimationFrame(frame);
})();
