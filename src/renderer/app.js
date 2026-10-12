(() => {
  const canvas = document.getElementById('raidCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
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
    ctx.fillStyle=palette.sky;ctx.fillRect(0,0,w,h);
    ctx.fillStyle=palette.fog;for(let i=0;i<9;i++){const x=(i*173+(t*.006))%(w+180)-90;ctx.fillRect(x,42+(i%3)*31,90,9);ctx.fillRect(x+18,34+(i%3)*31,46,9)}
    ctx.fillStyle='#566b5e';ctx.beginPath();ctx.moveTo(0,h*.45);for(let x=0;x<=w;x+=60)ctx.lineTo(x,h*.28+Math.sin(x*.017)*35);ctx.lineTo(w,h*.62);ctx.lineTo(0,h*.62);ctx.fill();
    ctx.fillStyle=palette.ground;ctx.fillRect(0,h*.49,w,h*.51);ctx.fillStyle='#99724b';for(let y=h*.52;y<h;y+=24){for(let x=(y%48);x<w;x+=48)ctx.fillRect(x,y,22,4)}
    ctx.fillStyle='#425544';ctx.fillRect(0,h*.48,w,14);ctx.fillStyle='#6e825d';for(let x=4;x<w;x+=18)ctx.fillRect(x,h*.45+(x%3)*3,5,20);
    drawCamp(42,h-122,t);drawBoard(w-170,22);
  }

  function drawCamp(x,y,t){rect(x,y+37,95,54,'#74503b');rect(x+12,y+17,70,34,'#d19a58');ctx.fillStyle='#885338';ctx.beginPath();ctx.moveTo(x+8,y+18);ctx.lineTo(x+47,y-16);ctx.lineTo(x+88,y+18);ctx.fill();rect(x+39,y+52,20,39,'#382a22');ctx.fillStyle='#f4a63d';ctx.fillRect(x+116,y+61+Math.sin(t*.01)*2,11,15);ctx.fillStyle='#d84d36';ctx.fillRect(x+119,y+55+Math.sin(t*.01)*3,6,13);ctx.fillStyle='#46352a';ctx.fillRect(x+106,y+76,33,5)}
  function drawBoard(x,y){rect(x,y,146,63,'#6b4934');rect(x+8,y+8,130,47,'#dcc395');label('RAID STATUS',x+73,y+18,9,'center','#4b3728');ctx.fillStyle='#b34739';ctx.fillRect(x+20,y+32,104,9);ctx.fillStyle='#edb64b';ctx.fillRect(x+20,y+32,Math.max(8,104*((state?.telemetry.cpuLoad||0)/100)),9)}

  function drawHunter(h,x,y,index,t){const bob=h.state==='attack'?Math.sin(t*.012+index)*4:Math.sin(t*.004+index)*1.5;const yy=y+bob;const c=archetypeColor(h.archetype);ctx.save();if(h.state==='attack')ctx.translate(Math.sin(t*.02+index)*3,0);rect(x-10,yy-22,20,19,c);rect(x-7,yy-38,14,15,'#efc49b');ctx.fillStyle='#372921';ctx.fillRect(x-7,yy-40,14,6);ctx.fillStyle='#2b211b';ctx.fillRect(x-5,yy-32,3,3);ctx.fillRect(x+3,yy-32,3,3);ctx.fillStyle='#3d3027';ctx.fillRect(x-14,yy-5,10,5);ctx.fillRect(x+4,yy-5,10,5);if(h.state==='attack'){ctx.strokeStyle=palette.cream;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x+8,yy-19);ctx.lineTo(x+26,yy-39);ctx.stroke();ctx.strokeStyle='#51443a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+10,yy-18);ctx.lineTo(x+30,yy-42);ctx.stroke();}else drawRecovery(h.recovery,x,yy,t);ctx.restore();label(h.name.slice(0,14),x,yy+15,9);label(`${h.cpu.toFixed(0)}%`,x,yy+27,8,'center','#f3cf6a')}
  function drawRecovery(action,x,y,t){if(action==='sleep'){label('Z',x+15,y-48-Math.sin(t*.004)*4,11,'center','#fff0bd')}else if(action==='meal'){ctx.fillStyle='#e2a44b';ctx.fillRect(x+13,y-17,12,8);ctx.fillStyle='#fff0bd';ctx.fillRect(x+15,y-20,8,4)}else if(action==='sharpen'){ctx.strokeStyle='#ece2c2';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+9,y-13);ctx.lineTo(x+28,y-30);ctx.stroke()}else{ctx.fillStyle='#f0a43f';ctx.fillRect(x+14,y-10,8,11)}}

  function drawMonster(m,x,y,index,t){const scale=m.rank==='BOSS'?1.35:m.rank==='ELITE'?1.05:.82;const sway=Math.sin(t*.004+index)*6;ctx.save();ctx.translate(x+sway,y);ctx.scale(scale,scale);ctx.fillStyle='#4c2d31';ctx.fillRect(-35,-34,70,54);ctx.fillStyle=m.rank==='BOSS'?palette.red:'#75526f';ctx.fillRect(-29,-46,58,38);ctx.fillStyle='#d7b66d';ctx.fillRect(-24,-52,11,12);ctx.fillRect(13,-52,11,12);ctx.fillStyle='#f5d66b';ctx.fillRect(-19,-33,8,7);ctx.fillRect(11,-33,8,7);ctx.fillStyle=palette.ink;ctx.fillRect(-17,-31,4,4);ctx.fillRect(13,-31,4,4);ctx.fillStyle='#2e2021';ctx.fillRect(-27,20,18,17);ctx.fillRect(9,20,18,17);ctx.fillStyle='#b8a17a';ctx.fillRect(-43,-22,12,35);ctx.fillRect(31,-22,12,35);ctx.restore();label(m.rank,x,y-74*scale,9,'center',m.rank==='BOSS'?'#ffd061':'#eadbb0');label(m.name.slice(0,18),x,y+48*scale,11);const barW=86;ctx.fillStyle=palette.ink;ctx.fillRect(x-barW/2,y+59*scale,barW,8);ctx.fillStyle=m.rank==='BOSS'?palette.red:palette.purple;ctx.fillRect(x-barW/2+2,y+59*scale+2,Math.max(4,(barW-4)*Math.min(1,m.threat/100)),4)}

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

  function frame(t){const w=canvas.clientWidth,h=canvas.clientHeight;if(w&&h){drawBackground(w,h,t);if(state){const hunters=state.hunters,monsters=state.monsters;updateActors(hunters,w,h,t);drawLinks(hunters,monsters,w,h,t);monsters.forEach((m,i)=>drawMonster(m,w*(.70+(i%2)*.17),h*(.37+Math.floor(i/2)*.28),i,t));hunters.forEach((hunter,i)=>{const p=actors.get(hunter.pid);if(p)drawHunter(hunter,p.x,p.y+Math.sin(p.step)*2,i,t)});drawExchange(t);if(hunters.filter(h=>h.state==='attack').length>=2)label(`CO-OP CHAIN ×${hunters.filter(h=>h.state==='attack').length}`,w*.48,42,14,'center','#ffd76a')}else{label('실시간 원정대를 불러오는 중…',w/2,h/2,16)}}lastFrame=t;if(!paused)requestAnimationFrame(frame)}

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
