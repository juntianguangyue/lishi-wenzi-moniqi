(function(){
'use strict';
const $ = id => document.getElementById(id);
const SAVE_KEY = '历史文字模拟器_崇祯_存档_v1';

let state = null;
let currentEvent = null;
let currentIndex = -1;
let seen = new Set();
let busy = false;

/* ---------------- 声音与设置 ---------------- */
const DEFAULT_SETTINGS = {voiceOn:true, profile:'narrator', rate:0.95, volume:0.9};
let settings = loadSettings();
let allVoices = [];
let noteTimer = null;
let noteCleanup = null;

function loadSettings(){
  try{
    const raw = localStorage.getItem('历史文字模拟器_设置');
    if(raw) return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
  }catch(e){}
  return Object.assign({}, DEFAULT_SETTINGS);
}
function saveSettings(){
  try{ localStorage.setItem('历史文字模拟器_设置', JSON.stringify(settings)); }catch(e){}
}
function refreshVoices(){
  try{
    const synth = window.speechSynthesis;
    if(!synth) return;
    allVoices = synth.getVoices() || [];
  }catch(e){}
}
function pickVoice(){
  if(!window.speechSynthesis) return null;
  if(!allVoices.length) refreshVoices();
  const zh = allVoices.filter(v=>/zh|cmn|chinese/i.test(v.lang+' '+v.name));
  const list = zh.length ? zh : allVoices;
  if(!list.length) return null;
  const p = settings.profile || 'narrator';
  const want = {narrator:['普通话','zh-CN','Chinese'], elder:['普通话','zh-CN','Chinese'], scholar:['普通话','zh-CN','Chinese'], general:['普通话','zh-CN','Chinese'], woman:['female','女','Hsiao','Ting']}[p]||[];
  for(const w of want){
    const hit = list.find(v=>v.name.indexOf(w)>=0);
    if(hit) return hit;
  }
  return list[0];
}
function voiceProfilePitchRate(){
  const base = settings.rate || 0.95;
  switch(settings.profile){
    case 'elder': return {pitch:0.62, rate:Math.min(1.1, base*0.88)};
    case 'general': return {pitch:0.75, rate:Math.min(1.3, base*1.08)};
    case 'woman': return {pitch:1.35, rate:Math.min(1.2, base*0.96)};
    case 'scholar': return {pitch:1.05, rate:base};
    default: return {pitch:1.0, rate:base};
  }
}
function speak(text, profile, onend){
  if(!text || !settings.voiceOn) return;
  try{
    const synth = window.speechSynthesis;
    if(!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    const voice = pickVoice();
    if(voice) u.voice = voice;
    const pr = voiceProfilePitchRate();
    u.pitch = pr.pitch; u.rate = pr.rate; u.volume = settings.volume;
    if(onend) u.onend = onend;
    synth.speak(u);
  }catch(e){}
}
function stopSpeak(){
  try{ if(window.speechSynthesis) window.speechSynthesis.cancel(); }catch(e){}
}

/* ---------------- 工具 ---------------- */
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function parseDate(s){ const p=s.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
function daysBetween(a,b){
  const da=parseDate(a), db=parseDate(b);
  return Math.round((db-da)/86400000);
}
function fmtMoney(n){
  n = Math.round(n||0);
  const sign = n<0?'-':'';
  const abs = Math.abs(n);
  if(abs>=10000){ return sign + (abs/10000).toFixed(1).replace(/\.0$/,'') + ' 万'; }
  return sign + abs.toLocaleString('zh-CN');
}
function fmtNum(n){
  n = Math.round(n||0);
  if(Math.abs(n)>=10000){ return (n/10000).toFixed(1).replace(/\.0$/,'') + ' 万'; }
  return n.toLocaleString('zh-CN');
}
function seasonOf(iso){
  const m = +iso.slice(5,7), d = +iso.slice(8,10);
  const v = m*100+d;
  if(v>=206 && v<506) return '春和景明 · 运河未冻，南道尚通';
  if(v>=506 && v<806) return '夏雨将至 · 江河水涨，漕船可行';
  if(v>=806 && v<1107) return '秋凉渐起 · 胡马将肥，边事更急';
  return '岁暮天寒 · 风雪载途，行路艰难';
}
function statClass(v){ return v>=55?'good':(v>=35?'mid':'bad'); }

function reignLabel(iso){
  const y = +(iso||'1644').slice(0,4);
  if(y>=1645 && state.flags.hongguang) return '弘光元年';
  if(y===1644) return '崇祯十七年';
  if(y>=1645) return '崇祯十八年';
  return '崇祯十七年';
}


/* ---------------- 财经与军队 ---------------- */
function regionRate(st){ return st==='normal'?0.55 : st==='partial'?0.30 : st==='lost'?0.05 : 0.1; }
function extraRate(id){
  if(id==='salt') return 0.50;
  if(id==='customs') return 0.40;
  if(id==='neiku') return 0.65;
  return 0.3;
}
function computeFinance(){
  let expected=0, real=0;
  const rows=[];
  for(const r of state.regions){
    const rr = regionRate(r.status);
    expected += r.income; real += r.income*rr;
    rows.push({name:r.name, income:r.income, status:r.status, real:Math.round(r.income*rr), note:r.note});
  }
  for(const e of state.extra){
    const rr = extraRate(e.id);
    expected += e.income; real += e.income*rr;
    rows.push({name:e.name, income:e.income, status:e.status, real:Math.round(e.income*rr), note:e.note});
  }
  return {expected, real, rows};
}
function computeArmy(){
  let total=0, nominal=0, effective=0, generals=0;
  for(const u of state.armies){
    if(u.gone) continue;
    nominal += (u.nominal || u.troops);
    total += u.troops;
    const eff = u.troops * clamp((u.morale*0.55 + u.loyalty*0.45)/100, 0.08, 0.92);
    effective += Math.round(eff);
    if(u.general && u.troops>0) generals++;
  }
  return {total, nominal, effective, generals};
}
function statusText(st){ return st==='normal'?'尚完':'partial'?'半失':'失陷'; }

/* ---------------- 状态初始化 ---------------- */
function newState(){
  const s = clone(G.START);
  s.flags = {};
  s.history = [];
  s.collected = 0;
  s.lastTransition = '';
  s.lastCollectDate = '1644-02-08';
  return s;
}
function applyEffect(eff){
  if(!eff) return;
  if(eff.g) state.taicang += eff.g;
  if(eff.n) state.neiku += eff.n;
  if(eff.y) state.extraIncome = (state.extraIncome||0) + eff.y;
  if(eff.m) state.morale = clamp(state.morale+eff.m, 0, 100);
  if(eff.c) state.court = clamp(state.court+eff.c, 0, 100);
  if(eff.s) state.armyMorale = clamp(state.armyMorale+eff.s, 0, 100);
  if(eff.a) state.authority = clamp(state.authority+eff.a, 0, 100);
  if(eff.ri){
    for(const k in eff.ri){
      const r = state.regions.find(x=>x.id===k);
      if(r) r.income = Math.max(0, r.income + eff.ri[k]);
    }
  }
  if(eff.rs){
    for(const k in eff.rs){
      const r = state.regions.find(x=>x.id===k);
      if(r) r.status = eff.rs[k];
    }
  }
  if(eff.u){
    for(const id in eff.u){
      const u = state.armies.find(x=>x.id===id);
      const ch = eff.u[id];
      if(!u){
        if(!ch.gone) console.warn('未知部队', id);
        continue;
      }
      if(ch.gone){ u.gone = true; continue; }
      if(ch.t) u.troops = Math.max(0, u.troops + ch.t);
      if(ch.mo) u.morale = clamp(u.morale+ch.mo, 0, 100);
      if(ch.l) u.loyalty = clamp(u.loyalty+ch.l, 0, 100);
      if(ch.gen) u.general = ch.gen;
      if(ch.loc) u.location = ch.loc;
    }
  }
  if(eff.addU){
    const u = clone(eff.addU);
    u.morale = u.morale||40; u.loyalty = u.loyalty||40; u.troops = u.troops||0;
    if(!state.armies.find(x=>x.id===u.id)) state.armies.push(u);
  }
  if(eff.flag) Object.assign(state.flags, eff.flag);
}
function optionDisabled(opt){
  if(opt.req){
    for(const k in opt.req){
      const val = opt.req[k];
      if(k==='minStat') continue;
      if((state.flags[k]||0) !== val) return '条件未足';
    }
    if(opt.req.minStat){
      const alias = {m:'morale', c:'court', s:'armyMorale', a:'authority'};
      for(const k in opt.req.minStat){
        const key = alias[k] || k;
        if((state[key]||0) < opt.req.minStat[k]) return '条件未足';
      }
    }
  }
  if(opt.eff){
    if(opt.eff.g && state.taicang + opt.eff.g < 0) return '太仓银不足';
    if(opt.eff.n && state.neiku + opt.eff.n < 0) return '内帑银不足';
  }
  return null;
}
function eventShouldSkip(ev){
  if(ev.when && !ev.when(state)) return true;
  // 一旦南狩出京或御驾西征离京，北京主时间线事件不再出现；分支由专门事件推进
  if((state.flags.nanqianLeft || state.flags.westLeft) && /^(e|x|w|q|c)\d+$/.test(ev.id)) return true;
  return false;
}
function findNextIndex(from){
  for(let i=from; i<G.EVENTS.length; i++){
    const ev = G.EVENTS[i];
    if(seen.has(ev.id)) continue;
    if(eventShouldSkip(ev)) continue;
    return i;
  }
  return -1;
}
function findEventIndexById(id){
  return G.EVENTS.findIndex(e=>e.id===id);
}

/* ---------------- 渲染 ---------------- */
function renderTop(){
  const fin = computeFinance();
  const army = computeArmy();
  $('treasuryTotal').textContent = fmtMoney(state.taicang + state.neiku);
  $('taicangVal').textContent = fmtMoney(state.taicang);
  $('neikuVal').textContent = fmtMoney(state.neiku);
  $('incomeTotal').textContent = fmtMoney(fin.expected) + ' /年';
  $('incomeReal').textContent = fmtMoney(fin.real) + ' /年';
  $('armyTotal').textContent = fmtNum(army.total);
  $('armyTotalLbl').textContent = fmtNum(army.total);
  $('armyNominal').textContent = fmtNum(army.nominal);
  $('armyEffective').textContent = fmtNum(army.effective);
  $('armyMorale').textContent = Math.round(state.armyMorale);
  $('armyGenerals').textContent = army.generals;
  $('statMorale').textContent = Math.round(state.morale);
  $('statCourt').textContent = Math.round(state.court);
  $('statArmyM').textContent = Math.round(state.armyMorale);
  $('statAuthority').textContent = Math.round(state.authority);
  $('statMorale').className = statClass(state.morale);
  $('statCourt').className = statClass(state.court);
  $('statArmyM').className = statClass(state.armyMorale);
  $('statAuthority').className = statClass(state.authority);
  $('reignTitle').textContent = reignLabel(state.date);
  $('dateTitle').textContent = currentEvent ? currentEvent.lunar.replace('崇祯十七年 ','') : '';
  $('seasonNote').textContent = seasonOf(state.date);
}
function eventExtra(ev){
  return (G.EVENT_EXTRAS && G.EVENT_EXTRAS[ev.id]) || {};
}
function optionTransition(ev, oi){
  const key = ev.id+'|'+oi;
  if(G.OPTION_TRANSITIONS && G.OPTION_TRANSITIONS[key]) return G.OPTION_TRANSITIONS[key];
  if(G.buildOptionTransition) return G.buildOptionTransition(ev, oi);
  return ev.title + '：' + ev.options[oi].text;
}
function renderEvent(){
  const ev = currentEvent;
  if(!ev) return;
  const ex = eventExtra(ev);
  $('eventDateBadge').textContent = reignLabel(ev.date) + ' · ' + ev.lunar;
  $('eventTitle').textContent = ev.title;
  const memorialBlock = $('memorialBlock');
  if(ex.memorial){
    memorialBlock.classList.remove('hidden');
    $('memorialFrom').textContent = ex.from || '臣工奏疏';
    $('memorialQuote').textContent = ex.memorial;
  }else{
    memorialBlock.classList.add('hidden');
  }
  $('eventText').textContent = ev.text;
  const innerBlock = $('innerVoiceBlock');
  if(ex.inner){
    innerBlock.classList.remove('hidden');
    $('innerVoiceText').textContent = ex.inner;
  }else{
    innerBlock.classList.add('hidden');
  }
  const bridge = $('bridgeBar');
  if(state.lastTransition){
    bridge.classList.remove('hidden');
    $('bridgeText').textContent = state.lastTransition;
  }else{
    bridge.classList.add('hidden');
  }
  $('eventContext').textContent = ev.context ? ('【史实参考】' + ev.context) : '';
  $('choiceFeedback').classList.add('hidden');
  const box = $('optionsBox');
  box.innerHTML = '';
  const tags = ['甲','乙','丙','丁','戊'];
  ev.options.forEach((o,i)=>{
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = '<span class="opt-tag">'+(tags[i]||i+1)+'</span>' + o.text;
    const dis = optionDisabled(o);
    if(dis){ btn.disabled = true; btn.title = dis; }
    else btn.addEventListener('click', ()=>chooseOption(i));
    box.appendChild(btn);
  });
  $('historyCount').textContent = state.history.length ? '('+state.history.length+'条)' : '';
  // 自动朗读：先奏疏，再心语
  if(settings.voiceOn){
    const role = ex.role || settings.profile;
    if(ex.memorial){
      speak(ex.memorial, role, ()=>{ if(ex.inner) speak(ex.inner, settings.profile); });
    }else if(ex.inner){
      speak(ex.inner, settings.profile);
    }
  }
}
function renderHistory(){
  const box = $('historyLog');
  box.innerHTML = '';
  for(let i=state.history.length-1; i>=0; i--){
    const h = state.history[i];
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = '<div class="h-date">'+h.date+'</div><div class="h-title">'+h.title+'</div><div class="h-choice">└ '+h.choice+'</div>';
    box.appendChild(div);
  }
}
function renderAll(){
  renderTop(); renderEvent(); renderHistory();
}
function renderIncomeModal(){
  const fin = computeFinance();
  $('mTaicang').textContent = fmtMoney(state.taicang)+' 两';
  $('mNeiku').textContent = fmtMoney(state.neiku)+' 两';
  $('mIncome').textContent = fmtMoney(fin.expected)+' 两/年';
  $('mReal').textContent = fmtMoney(fin.real)+' 两/年';
  const tb = document.querySelector('#incomeTable tbody');
  tb.innerHTML='';
  for(const r of fin.rows){
    const tr=document.createElement('tr');
    tr.innerHTML = '<td>'+r.name+'</td><td>'+r.income.toLocaleString('zh-CN')+'</td>'+
      '<td class="status-'+r.status+'">'+statusText(r.status)+'</td><td>'+r.real.toLocaleString('zh-CN')+'</td>';
    tb.appendChild(tr);
  }
}
function renderArmyModal(){
  const army = computeArmy();
  $('mArmyTotal').textContent = fmtNum(army.total)+' 人';
  $('mArmyNominal') ? $('mArmyNominal').textContent = fmtNum(army.nominal)+' 人' : null;
  $('mArmyEff').textContent = fmtNum(army.effective)+' 人';
  $('mArmyM').textContent = Math.round(state.armyMorale);
  $('mArmyG').textContent = army.generals+' 员';
  const tb = document.querySelector('#armyTable tbody');
  tb.innerHTML='';
  for(const u of state.armies){
    if(u.gone) continue;
    const tr=document.createElement('tr');
    tr.innerHTML = '<td>'+u.name+'</td><td>'+(u.nominal||u.troops).toLocaleString('zh-CN')+'</td><td>'+u.troops.toLocaleString('zh-CN')+'</td><td>'+u.general+'</td><td>'+u.location+'</td>'+
      '<td>'+Math.round(u.loyalty)+'</td><td>'+Math.round(u.morale)+'</td><td>'+(u.note||'')+'</td>';
    tb.appendChild(tr);
  }
}

/* ---------------- 流程 ---------------- */
function collectIncome(days){
  if(days<=0) return 0;
  const fin = computeFinance();
  const amount = Math.round(fin.real*days/365);
  state.taicang += amount;
  state.collected += amount;
  state.lastCollectDate = currentEvent ? currentEvent.date : state.date;
  return amount;
}
function contextNoteSource(ctx){
  const m = String(ctx||'').match(/《[^》]+》/);
  return m ? m[0] : '史事纪略';
}
function pickTransitionNote(ev){
  if(ev && G.TRANSITION_NOTES && G.TRANSITION_NOTES[ev.id]) return G.TRANSITION_NOTES[ev.id];
  // 未单独配原文的事件，用该事件自己的史实参考作转场，避免通用句子反复出现
  if(ev && ev.context) return {source: contextNoteSource(ev.context)+' · '+ev.lunar, text: ev.context};
  if(G.GENERAL_NOTES && G.GENERAL_NOTES.length){
    let chosen = G.GENERAL_NOTES[0];
    for(const n of G.GENERAL_NOTES){
      if(ev && ev.date >= n.date) chosen = n;
      else break;
    }
    return chosen;
  }
  return {source:'《明史·庄烈帝纪》', text:'帝承神、熹之后，慨然有为。惜乎大势已倾，积习难挽。'};
}
function showTransition(days, ev){
  const note = pickTransitionNote(ev);
  return new Promise(res=>{
    const ov = $('transitionOverlay');
    ov.classList.remove('hidden');
    $('noteChoice').textContent = state.lastTransition || '';
    $('noteSource').textContent = (days>0 ? ('岁月流转 · '+days+'日后 · ') : '') + note.source;
    $('noteHint').textContent = '点击任意处 · 完整呈现后继续，亦可提前点击跳过';
    const textEl = $('noteText');
    textEl.textContent = '';
    let full = false, finished = false, i = 0;
    const fullText = note.text || '';
    function cleanup(){
      if(noteCleanup){
        document.removeEventListener('keydown', noteCleanup);
        noteCleanup = null;
      }
      if(noteTimer){ clearInterval(noteTimer); noteTimer = null; }
      stopSpeak();
    }
    function revealAll(){
      if(full) return;
      full = true;
      if(noteTimer){ clearInterval(noteTimer); noteTimer = null; }
      textEl.textContent = fullText;
      $('noteHint').textContent = '点击任意处继续 · 空格/回车亦可';
    }
    function finish(){
      if(finished) return;
      finished = true;
      cleanup();
      ov.classList.add('hidden');
      ov.onclick = null;
      res();
    }
    function clickHandler(){
      finish();
    }
    noteCleanup = e=>{
      if(e.code==='Space' || e.code==='Enter'){
        e.preventDefault();
        clickHandler();
      }
    };
    document.addEventListener('keydown', noteCleanup);
    ov.onclick = clickHandler;
    if(settings.voiceOn) speak((state.lastTransition?state.lastTransition+'。':'')+fullText, settings.profile);
    if(fullText){
      noteTimer = setInterval(()=>{
        i += 1;
        textEl.textContent = fullText.slice(0, i) + '…';
        if(i >= fullText.length) revealAll();
      }, 34);
    }else{
      revealAll();
    }
  });
}
function toast(msg){
  const t=$('toast');
  t.textContent=msg; t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer=setTimeout(()=>t.classList.add('hidden'), 2600);
}
function showEvent(ev, idx, explicitGoto){
  return new Promise(resolve=>{
    let days = daysBetween(state.date, ev.date);
    if(days<0) days = 0; // 少数分支允许同日或稍早，避免时间倒流
    const oldDate = state.date;
    state.date = days>=0 ? ev.date : oldDate;
    currentEvent = ev;
    currentIndex = idx;
    seen.add(ev.id);
    const amount = collectIncome(days);
    renderTop();
    if(days>0){
      showTransition(days, ev).then(()=>{
        stopSpeak();
        if(amount>0) toast('此间实收税银约 '+fmtMoney(amount)+' 两');
        renderEvent(); resolve();
      });
    }else{
      stopSpeak();
      renderEvent(); resolve();
    }
  });
}
async function chooseOption(i){
  if(busy || !currentEvent) return;
  const ev = currentEvent;
  const o = ev.options[i];
  if(!o) return;
  const dis = optionDisabled(o);
  if(dis) return;
  busy = true;
  applyEffect(o.eff);
  if(o.flag) Object.assign(state.flags, o.flag);
  state.lastTransition = optionTransition(ev, i);
  state.history.push({date:ev.lunar, title:ev.title, choice:o.text, transition:state.lastTransition});
  renderTop(); renderHistory();
  $('choiceFeedback').classList.remove('hidden');
  $('choiceFeedback').textContent = (o.fb?('『'+o.text+'』\n'+o.fb):('你选择了：'+o.text));
  saveGame();
  if(o.end){
    await sleep(1800);
    showEnding(o.end);
    busy=false; return;
  }
  await sleep(1500);
  let nextIdx=-1;
  if(o.goto){
    const idx = findEventIndexById(o.goto);
    if(idx>=0){
      const target = G.EVENTS[idx];
      if(!eventShouldSkip(target) && !seen.has(target.id)) nextIdx = idx;
    }
  }
  if(nextIdx<0){
    nextIdx = findNextIndex(currentIndex+1);
  }
  if(nextIdx>=0){
    await showEvent(G.EVENTS[nextIdx], nextIdx);
  }else{
    showEnding({title:'史笔搁置', text:'事件推演至此中断。你的崇祯十七年，在'+state.date+'画上了句号。\n\n本局共经历事件 '+state.history.length+' 件。'});
  }
  busy=false;
}
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

/* ---------------- 结局与菜单 ---------------- */
function showEnding(end){
  stopSpeak();
  $('endingTitle').textContent = end.title;
  $('endingText').textContent = end.text;
  const s = state;
  $('endingStats').innerHTML =
    '<div>终局时间<b>'+ (currentEvent?(reignLabel(currentEvent.date)+' · '+currentEvent.lunar):'') +'</b></div>'+
    '<div>历经事件<b>'+ s.history.length +' 件</b></div>'+
    '<div>太仓存银<b>'+ fmtMoney(s.taicang) +' 两</b></div>'+
    '<div>内帑存银<b>'+ fmtMoney(s.neiku) +' 两</b></div>'+
    '<div>民心<b>'+ Math.round(s.morale) +'</b></div>'+
    '<div>朝臣支持<b>'+ Math.round(s.court) +'</b></div>'+
    '<div>军心<b>'+ Math.round(s.armyMorale) +'</b></div>'+
    '<div>君威<b>'+ Math.round(s.authority) +'</b></div>';
  $('endingModal').classList.remove('hidden');
  localStorage.removeItem(SAVE_KEY);
}
function saveGame(){
  try{
    const data = {state, currentEventId:currentEvent?currentEvent.id:null, currentIndex, seen:[...seen]};
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }catch(e){}
}
function loadGame(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return false;
    const data = JSON.parse(raw);
    state = data.state;
    currentIndex = data.currentIndex;
    seen = new Set(data.seen||[]);
    const idx = data.currentEventId ? findEventIndexById(data.currentEventId) : -1;
    currentEvent = idx>=0 ? G.EVENTS[idx] : null;
    if(!currentEvent) return false;
    return true;
  }catch(e){ return false; }
}
function startGame(fresh){
  stopSpeak();
  if(!fresh && loadGame()){
    showScreen('gameScreen');
    renderAll();
    toast('已继续未竟之局');
    return;
  }
  state = newState();
  currentEvent = null;
  currentIndex = -1;
  seen = new Set();
  const first = findNextIndex(0);
  if(first<0) return;
  showScreen('gameScreen');
  showEvent(G.EVENTS[first], first).then(()=>{ saveGame(); });
}
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
  $(id).classList.remove('hidden');
  window.scrollTo(0,0);
}
function openModal(id){
  if(id==='incomeModal') renderIncomeModal();
  if(id==='armyModal') renderArmyModal();
  $(id).classList.remove('hidden');
}
function closeModal(id){ $(id).classList.add('hidden'); }
function refreshMenu(){
  const has = !!localStorage.getItem(SAVE_KEY);
  const btn = document.querySelector('.start-btn');
  if(has){ btn.textContent = '▶ 继续未竟之局'; $('btnNewGame').classList.remove('hidden'); }
  else{ btn.textContent = '▶ 开始游戏'; $('btnNewGame').classList.add('hidden'); }
}

/* ---------------- 设置面板 ---------------- */
function openSettings(){
  $('settingVoiceOn').checked = settings.voiceOn;
  $('settingVoiceProfile').value = settings.profile;
  $('settingRate').value = settings.rate;
  $('settingVolume').value = settings.volume;
  $('settingRateVal').textContent = Number(settings.rate).toFixed(2);
  $('settingVolumeVal').textContent = Math.round(settings.volume*100)+'%';
  $('settingsModal').classList.remove('hidden');
}
function readSettingsForm(){
  settings.voiceOn = $('settingVoiceOn').checked;
  settings.profile = $('settingVoiceProfile').value;
  settings.rate = parseFloat($('settingRate').value)||0.95;
  settings.volume = parseFloat($('settingVolume').value)||0.9;
  saveSettings();
}
function testVoice(){
  readSettingsForm();
  const samples = {
    narrator:'崇祯十七年，春正月。大风霾，李自成僭号于西安。',
    elder:'老臣有一言，南迁之事，不可再缓了。',
    scholar:'臣请以太子监国南京，则社稷有主，东南有本。',
    general:'末将愿率关宁铁骑，与闯贼决一死战！',
    woman:'皇爷，城破了，请皇爷早为社稷计。'
  };
  speak(samples[settings.profile] || samples.narrator, settings.profile);
}
/* ---------------- 事件绑定 ---------------- */
document.addEventListener('DOMContentLoaded', function(){
  if('serviceWorker' in navigator){
    try{ navigator.serviceWorker.register('sw.js').catch(()=>{}); }catch(e){}
  }
  refreshMenu();
  refreshVoices();
  try{
    if(window.speechSynthesis) window.speechSynthesis.onvoiceschanged = refreshVoices;
  }catch(e){}
  document.querySelector('.start-btn').addEventListener('click', ()=>startGame(false));
  $('btnNewGame').addEventListener('click', ()=>startGame(true));
  $('treasuryPanel').addEventListener('click', ()=>openModal('incomeModal'));
  $('armyPanel').addEventListener('click', ()=>openModal('armyModal'));
  $('btnSpeakMemorial').addEventListener('click', ()=>{
    const ex = currentEvent ? eventExtra(currentEvent) : {};
    if(ex.memorial) speak(ex.memorial, ex.role || settings.profile);
  });
  document.querySelectorAll('.modal-close').forEach(b=>{
    b.addEventListener('click', ()=>{
      const id = b.getAttribute('data-close');
      if(id==='settingsModal'){ readSettingsForm(); stopSpeak(); }
      closeModal(id);
    });
  });
  document.querySelectorAll('.modal').forEach(m=>{
    m.addEventListener('click', e=>{
      if(e.target===m && m.id!=='settingsModal' && m.id!=='endingModal') closeModal(m.id);
    });
  });
  $('btnSave').addEventListener('click', ()=>{ saveGame(); toast('已快速存档'); });
  $('btnSaveExit').addEventListener('click', ()=>{
    saveGame();
    stopSpeak();
    toast('已存档，退出到主菜单');
    refreshMenu();
    showScreen('mainMenu');
  });
  $('btnSettings').addEventListener('click', openSettings);
  $('btnCloseSettings').addEventListener('click', ()=>{
    readSettingsForm();
    stopSpeak();
    closeModal('settingsModal');
    toast('设置已保存');
  });
  $('btnTestVoice').addEventListener('click', testVoice);
  $('settingRate').addEventListener('input', e=>{ $('settingRateVal').textContent = Number(e.target.value).toFixed(2); });
  $('settingVolume').addEventListener('input', e=>{ $('settingVolumeVal').textContent = Math.round(e.target.value*100)+'%'; });
  $('btnRestart').addEventListener('click', ()=>{
    if(confirm('重开本局将清空当前进度，确定吗？')) startGame(true);
  });
  $('btnEndingRestart').addEventListener('click', ()=>{ closeModal('endingModal'); startGame(true); });
  $('btnEndingMenu').addEventListener('click', ()=>{ closeModal('endingModal'); refreshMenu(); showScreen('mainMenu'); });
});

window.Game = {startGame, openModal, closeModal, openSettings};
})();
