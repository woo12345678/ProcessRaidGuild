(() => {
  const canvas = document.getElementById('raidCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const raidBackdrop = new Image();
  let backdropReady = false;
  raidBackdrop.addEventListener('load', () => { backdropReady = true; });
  raidBackdrop.src = 'assets/raid-backdrop.svg';
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

  function drawNameplate(text,x,y,cpu){
    const shown=text.slice(0,14);ctx.font='700 10px "Malgun Gothic", sans-serif';const width=Math.max(48,Math.ceil(ctx.measureText(shown).width)+12);
    ctx.fillStyle='rgba(11,12,16,.82)';ctx.fillRect(Math.round(x-width/2),Math.round(y-7),width,16);ctx.strokeStyle='rgba(222,181,91,.72)';ctx.lineWidth=1;ctx.strokeRect(Math.round(x-width/2)+.5,Math.round(y-7)+.5,width-1,15);
    label(shown,x,y,10);label(`${cpu.toFixed(0)}%`,x,y+14,8,'center','#ffd46b');
  }

  function drawHunter(h,x,y,index,t){
    const attack=h.state==='attack',bob=Math.sin(t*(attack ? .012 : .004)+index)*(attack?4:1.5),yy=y+bob,c=archetypeColor(h.archetype),pulse=.5+.5*Math.sin(t*.008+index);
    ctx.save();if(attack)ctx.translate(Math.sin(t*.02+index)*3,0);
    ctx.fillStyle='rgba(3,5,8,.48)';ctx.beginPath();ctx.ellipse(x,yy+11,24,8,0,0,Math.PI*2);ctx.fill();
    if(attack){ctx.strokeStyle=`rgba(255,211,102,${.22+pulse*.24})`;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,yy+7,25+pulse*3,10+pulse,0,0,Math.PI*2);ctx.stroke()}
    ctx.fillStyle='#28212a';ctx.beginPath();ctx.moveTo(x-15,yy-24);ctx.lineTo(x-22,yy+5);ctx.lineTo(x,yy-1);ctx.closePath();ctx.fill();
    rect(x-17,yy-28,34,30,c,'#17141a');
    ctx.fillStyle='#d9b45f';ctx.fillRect(x-17,yy-25,5,10);ctx.fillRect(x+12,yy-25,5,10);
    rect(x-12,yy-49,24,20,'#e8bd94','#17141a');
    ctx.fillStyle='#25202a';ctx.fillRect(x-14,yy-52,28,8);ctx.fillRect(x-11,yy-57,22,7);ctx.fillRect(x-16,yy-48,5,9);ctx.fillRect(x+11,yy-48,5,9);
    ctx.fillStyle='#e9d46b';ctx.fillRect(x-7,yy-43,4,4);ctx.fillRect(x+4,yy-43,4,4);
    ctx.fillStyle='#231d22';ctx.fillRect(x-16,yy+2,12,8);ctx.fillRect(x+4,yy+2,12,8);
    drawHunterEmblem(h.archetype,x,yy-14,'#fff0bd');
    if(attack){
      ctx.strokeStyle='#f8e29b';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x+14,yy-19);ctx.lineTo(x+37,yy-46);ctx.stroke();
      ctx.strokeStyle='#2d2730';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+12,yy-17);ctx.lineTo(x+39,yy-48);ctx.stroke();
      if(h.archetype==='ai'){ctx.fillStyle=`rgba(169,134,255,${.55+pulse*.4})`;ctx.beginPath();ctx.arc(x+34,yy-48,7+pulse*3,0,Math.PI*2);ctx.fill()}
      if(h.archetype==='forge'||h.archetype==='worker'){ctx.fillStyle='#8e9da2';ctx.fillRect(x+29,yy-50,17,10)}
    }else drawRecovery(h.recovery,x,yy,t);
    ctx.restore();
    drawNameplate(h.name,x,yy+24,h.cpu);
  }
  function drawRecovery(action,x,y,t){if(action==='sleep'){label('Z',x+15,y-48-Math.sin(t*.004)*4,11,'center','#fff0bd')}else if(action==='meal'){ctx.fillStyle='#e2a44b';ctx.fillRect(x+13,y-17,12,8);ctx.fillStyle='#fff0bd';ctx.fillRect(x+15,y-20,8,4)}else if(action==='sharpen'){ctx.strokeStyle='#ece2c2';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+9,y-13);ctx.lineTo(x+28,y-30);ctx.stroke()}else{ctx.fillStyle='#f0a43f';ctx.fillRect(x+14,y-10,8,11)}}

  function drawMonsterAura(m,x,y,scale,t,index){
    const pulse=.5+.5*Math.sin(t*.004+index);ctx.save();ctx.globalCompositeOperation='screen';
    const glow=ctx.createRadialGradient(x,y,8,x,y,78*scale);glow.addColorStop(0,m.rank==='BOSS'?`rgba(255,78,49,${.28+pulse*.15})`:`rgba(164,112,202,${.2+pulse*.12})`);glow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,78*scale,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.strokeStyle=m.rank==='BOSS'?'rgba(255,126,67,.55)':'rgba(173,137,207,.42)';ctx.lineWidth=2;ctx.setLineDash([5,8]);ctx.lineDashOffset=-t*.025;ctx.beginPath();ctx.ellipse(x,y+18*scale,58*scale,18*scale,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  }

  function drawMonster(m,x,y,index,t){
    const scale=m.rank==='BOSS'?1.5:m.rank==='ELITE'?1.15:.88,sway=Math.sin(t*.004+index)*6,pulse=.5+.5*Math.sin(t*.009+index);
    drawMonsterAura(m,x+sway,y,scale,t,index);ctx.save();ctx.translate(x+sway,y);ctx.scale(scale,scale);
    ctx.fillStyle='rgba(0,0,0,.52)';ctx.beginPath();ctx.ellipse(0,38,55,15,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#241d26';ctx.fillRect(-42,-28,84,58);ctx.fillStyle=m.rank==='BOSS'?'#8f322f':m.rank==='ELITE'?'#654667':'#5a493e';ctx.fillRect(-35,-48,70,57);
    ctx.fillStyle='#171419';ctx.beginPath();ctx.moveTo(-35,-47);ctx.lineTo(-55,-72);ctx.lineTo(-23,-57);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(35,-47);ctx.lineTo(55,-72);ctx.lineTo(23,-57);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#aa8254';ctx.lineWidth=6;ctx.beginPath();ctx.arc(0,-12,27,0,Math.PI*2);ctx.stroke();ctx.lineWidth=3;for(let a=0;a<8;a++){ctx.save();ctx.rotate(a*Math.PI/4+t*.0006);ctx.fillStyle='#aa8254';ctx.fillRect(23,-4,12,8);ctx.restore()}
    ctx.fillStyle=m.rank==='BOSS'?`rgba(255,199,71,${.75+pulse*.25})`:`rgba(209,181,101,${.7+pulse*.25})`;ctx.fillRect(-23,-36,12,8);ctx.fillRect(11,-36,12,8);
    ctx.fillStyle='#171419';ctx.fillRect(-20,-34,5,4);ctx.fillRect(15,-34,5,4);ctx.fillRect(-13,-16,26,8);
    ctx.fillStyle='#312831';ctx.fillRect(-50,-22,14,48);ctx.fillRect(36,-22,14,48);ctx.fillStyle='#806b53';ctx.fillRect(-58,12,22,12);ctx.fillRect(36,12,22,12);
    ctx.fillStyle='#1d1920';ctx.fillRect(-33,27,24,22);ctx.fillRect(9,27,24,22);ctx.fillStyle='#6e5743';ctx.fillRect(-35,44,28,8);ctx.fillRect(7,44,28,8);
    if(m.rank==='BOSS'){ctx.fillStyle=`rgba(255,101,48,${.45+pulse*.35})`;ctx.fillRect(-29,-5,8,19);ctx.fillRect(21,-5,8,19);ctx.fillRect(-5,-54,10,17)}
    ctx.restore();
    label(m.rank,x+sway,y-91*scale,10,'center',m.rank==='BOSS'?'#ffd061':'#eadbb0');label(m.name.slice(0,18),x+sway,y+61*scale,11);
    const barW=112;ctx.fillStyle='rgba(16,13,17,.9)';ctx.fillRect(x+sway-barW/2,y+72*scale,barW,11);ctx.fillStyle=m.rank==='BOSS'?'#d84b3f':'#8b628d';ctx.fillRect(x+sway-barW/2+2,y+72*scale+2,Math.max(4,(barW-4)*Math.min(1,m.threat/100)),7);ctx.fillStyle='rgba(255,255,255,.32)';ctx.fillRect(x+sway-barW/2+3,y+72*scale+3,Math.max(2,(barW-7)*Math.min(1,m.threat/100)),2);
  }

  function drawImpactEffects(hunters,w,h,t){
    const attackers=hunters.filter((entry)=>entry.state==='attack');if(!attackers.length)return;const targetX=w*.69,targetY=h*.36;
    ctx.save();ctx.globalCompositeOperation='screen';attackers.slice(0,4).forEach((hunter,i)=>{const phase=(t*.0012+i*.23)%1;if(phase<.54)return;const p=actors.get(hunter.pid);if(!p)return;const q=(phase-.54)/.46,x=p.x+(targetX-p.x)*q,y=p.y-30+(targetY-(p.y-30))*q-Math.sin(q*Math.PI)*38;ctx.fillStyle=i%2?'rgba(123,213,232,.8)':'rgba(255,204,83,.88)';ctx.fillRect(x-3,y-3,7,7);ctx.strokeStyle='rgba(255,235,167,.38)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-(targetX-p.x)*.08,y-(targetY-p.y)*.08);ctx.stroke()});
    for(let i=0;i<7;i++){const a=t*.004+i*.9,r=23+(i%3)*9;ctx.fillStyle=i%2?'rgba(255,168,66,.65)':'rgba(119,211,211,.5)';ctx.fillRect(targetX+Math.cos(a)*r,targetY+Math.sin(a)*r,3+(i%2)*2,3+(i%2)*2)}ctx.restore();
  }

  function formationPosition(hunter,i,count,w,h,t){
    const activeIndex=state.hunters.filter((entry)=>entry.state==='attack').findIndex((entry)=>entry.pid===hunter.pid);
    if(hunter.state==='recover'){
      const resting=state.hunters.filter((entry)=>entry.state==='recover');const restIndex=resting.findIndex((entry)=>entry.pid===hunter.pid);
      return{x:185+(restIndex%4)*92,y:h-70-Math.floor(restIndex/4)*88};
    }
    const cols=Math.min(4,Math.max(2,state.hunters.filter((entry)=>entry.state==='attack').length));
    const row=Math.floor(activeIndex/cols),col=activeIndex%cols;
    return{x:220+col*Math.min(105,(w*.48-120)/Math.max(1,cols-1))+Math.sin(t*.0013+i)*22,y:h*.57+row*92+Math.cos(t*.001+i)*8};
  }

  function updateActors(hunters,w,h,t){
    const livePids=new Set(hunters.map((hunter)=>hunter.pid));
    for(const pid of actors.keys())if(!livePids.has(pid))actors.delete(pid);
    hunters.forEach((hunter,i)=>{
      const fallback=formationPosition(hunter,i,hunters.length,w,h,t);
      const actor=actors.get(hunter.pid)||{x:fallback.x-18,y:fallback.y+8,step:i*.7};
      let target=fallback;
      if(activeExchange){
        const progress=(t-activeExchange.startedAt)/activeExchange.duration;
        if(progress>=1)activeExchange=null;
        else if(hunter.pid===activeExchange.fromPid)target={x:w*.43-30,y:h*.46};
        else if(hunter.pid===activeExchange.toPid)target={x:w*.43+30,y:h*.46};
      }
      actor.x+=(target.x-actor.x)*.025;actor.y+=(target.y-actor.y)*.025;actor.step+=.045;
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

  function frame(t){const w=canvas.clientWidth,h=canvas.clientHeight;if(w&&h){drawBackground(w,h,t);if(state){const hunters=state.hunters,monsters=state.monsters;updateActors(hunters,w,h,t);drawLinks(hunters,monsters,w,h,t);monsters.forEach((m,i)=>drawMonster(m,w*(.70+(i%2)*.17),h*(.37+Math.floor(i/2)*.28),i,t));drawImpactEffects(hunters,w,h,t);hunters.forEach((hunter,i)=>{const p=actors.get(hunter.pid);if(p)drawHunter(hunter,p.x,p.y+Math.sin(p.step)*2,i,t)});drawExchange(t);if(hunters.filter(h=>h.state==='attack').length>=2)label(`CO-OP CHAIN ×${hunters.filter(h=>h.state==='attack').length}`,w*.48,42,14,'center','#ffd76a')}else{label('실시간 원정대를 불러오는 중…',w/2,h/2,16)}}lastFrame=t;if(!paused)requestAnimationFrame(frame)}

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
