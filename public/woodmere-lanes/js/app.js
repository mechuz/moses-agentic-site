/* Woodmere Lanes — site scripts. Everything runs client-side; forms confirm inline (demo). */
(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const money=n=>'$'+Math.round(n).toLocaleString('en-US');
const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const TAX=1.08625;

/* ---------- toast ---------- */
let toastEl;
function toast(msg){ if(!toastEl){toastEl=document.createElement('div');toastEl.className='toast';document.body.appendChild(toastEl);} toastEl.textContent=msg; toastEl.classList.add('show'); clearTimeout(toastEl._t); toastEl._t=setTimeout(()=>toastEl.classList.remove('show'),2600); }
window.wlToast=toast;

/* ---------- sun times for Woodmere, NY (NOAA approximation) ---------- */
const LAT=40.632, LON=-73.712;
function sunset(date){ // returns Date of local sunset, or null
  const rad=Math.PI/180;
  const d=new Date(date.getFullYear(),date.getMonth(),date.getDate());
  const n=Math.floor((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(d.getFullYear(),0,0))/864e5);
  const lngHour=LON/15, t=n+((18-lngHour)/24);
  const M=(0.9856*t)-3.289;
  let L=M+(1.916*Math.sin(M*rad))+(0.020*Math.sin(2*M*rad))+282.634; L=(L+360)%360;
  let RA=Math.atan(0.91764*Math.tan(L*rad))/rad; RA=(RA+360)%360;
  const Lq=Math.floor(L/90)*90, RAq=Math.floor(RA/90)*90; RA=(RA+(Lq-RAq))/15;
  const sinDec=0.39782*Math.sin(L*rad), cosDec=Math.cos(Math.asin(sinDec));
  const cosH=(Math.cos(90.833*rad)-(sinDec*Math.sin(LAT*rad)))/(cosDec*Math.cos(LAT*rad));
  if(cosH>1||cosH<-1) return null;
  const H=(Math.acos(cosH)/rad)/15;
  const T=H+RA-(0.06571*t)-6.622;
  let UT=(T-lngHour)%24; if(UT<0)UT+=24;
  const utc=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate(),0,0,0)); utc.setUTCMinutes(Math.round(UT*60));
  return utc; // Date object; display in America/New_York
}
const fmtNY=dt=>dt?dt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'}):'—';
function nextDow(from,dow){const d=new Date(from);d.setHours(12,0,0,0);while(d.getDay()!==dow)d.setDate(d.getDate()+1);return d;}
function shabbosTimes(from=new Date()){
  const fri=nextDow(from,5), sat=nextDow(from,6);
  const ss=sunset(fri), se=sunset(sat);
  const candle=ss?new Date(ss.getTime()-18*60000):null;
  const ends=se?new Date(se.getTime()+50*60000):null;
  return {fri,sat,candle,ends,close:candle?new Date(candle.getTime()-120*60000):null,open:ends?new Date(ends.getTime()+60*60000):null};
}
window.wlShabbos=shabbosTimes; window.wlFmt=fmtNY;

/* ---------- hours & open status ---------- */
// [openHour, closeHour] in NY local; close > 24 means after midnight. Fri/Sat computed.
const HOURS={0:[11,24],1:[16,24],2:[16,24],3:[16,24],4:[16,25],5:'fri',6:'sat'};
function nowNY(){const s=new Date().toLocaleString('en-US',{timeZone:'America/New_York'});return new Date(s);}
function openStatus(){
  const n=nowNY(), dow=n.getDay(), h=n.getHours()+n.getMinutes()/60;
  const st=shabbosTimes(n);
  const toH=dt=>{const l=new Date(dt.toLocaleString('en-US',{timeZone:'America/New_York'}));return l.getHours()+l.getMinutes()/60;};
  // after-midnight spill from previous day
  const prev=(dow+6)%7; const pr=HOURS[prev];
  if(Array.isArray(pr)&&pr[1]>24&&h<pr[1]-24) return {open:true,text:`Open · till ${fmtH(pr[1]-24)}`};
  if(prev===6&&h<2) return {open:true,text:'Open · till 2:00 AM'};
  if(dow===5){const c=st.close?toH(st.close):13;return h>=11&&h<c?{open:true,text:`Open · closes ${fmtNY(st.close)} for Shabbos`}:{open:false,text:h<11?'Opens 11:00 AM':'Closed for Shabbos'}}
  if(dow===6){const o=st.open?toH(st.open):21;return h>=o?{open:true,text:'Open · Motzei Shabbos till 2:00 AM'}:{open:false,text:`Shabbos · opens ${fmtNY(st.open)}`}}
  const [o,c]=HOURS[dow];
  if(h>=o&&h<c) return {open:true,text:`Open · till ${fmtH(c>24?c-24:c)}`};
  return {open:false,text:h<o?`Opens ${fmtH(o)}`:'Closed · opens tomorrow'};
}
function fmtH(h){const hh=Math.floor(h),mm=Math.round((h-hh)*60);const ap=hh>=12&&hh<24?'PM':'AM';const x=((hh+11)%12)+1;return `${x}:${String(mm).padStart(2,'0')} ${ap}`;}
function paintStatus(){const s=openStatus();$$('.status').forEach(el=>{el.classList.toggle('open',s.open);el.classList.toggle('closed',!s.open);el.querySelector('span').textContent=s.text;});}
paintStatus(); setInterval(paintStatus,60000);

/* ---------- Shabbos times blocks ---------- */
$$('[data-shabbos]').forEach(el=>{const st=shabbosTimes();const d=dt=>dt.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  el.innerHTML=`<div><span>Friday ${d(st.fri)}</span><span>Candle lighting ≈ ${fmtNY(st.candle)} · we close ${fmtNY(st.close)}</span></div>
  <div><span>Shabbos ${d(st.sat)}</span><span>Ends ≈ ${fmtNY(st.ends)} · doors ${fmtNY(st.open)}</span></div>`;});
const stSmall=$('[data-shabbos-short]'); if(stSmall){const st=shabbosTimes();stSmall.textContent=`This Motzei Shabbos: doors ${fmtNY(st.open)}`;}

/* ---------- mobile nav ---------- */
(function(){const b=$('#mnavBtn'),m=$('#mnav');if(!b||!m)return;
  b.addEventListener('click',()=>{m.hidden=!m.hidden;b.setAttribute('aria-expanded',String(!m.hidden));});
  document.addEventListener('click',e=>{if(!m.hidden&&!m.contains(e.target)&&e.target!==b){m.hidden=true;b.setAttribute('aria-expanded','false');}});
})();

/* ---------- hero canvas ---------- */
(function(){
  const c=$('#lanes');if(!c)return;const ctx=c.getContext('2d');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;let W,H,t=0;
  function size(){const r=c.parentElement.getBoundingClientRect();W=c.width=Math.max(1,Math.floor(r.width));H=c.height=Math.max(1,Math.floor(r.height));}
  const cols=['#FF2ED1','#22F0FF','#C8FF2E','#7B3FFF'];
  function draw(){ctx.clearRect(0,0,W,H);ctx.fillStyle='#07070D';ctx.fillRect(0,0,W,H);const vx=W*0.62,vy=H*0.28,n=14;
    const g=ctx.createRadialGradient(vx,vy,10,vx,vy,Math.max(W,H)*0.9);g.addColorStop(0,'rgba(255,46,209,.35)');g.addColorStop(.35,'rgba(123,63,255,.18)');g.addColorStop(1,'rgba(7,7,13,0)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    for(let i=0;i<=n;i++){const x0=(i/n)*W*1.6-W*0.3,col=cols[i%4];ctx.strokeStyle=col;ctx.globalAlpha=0.25+0.2*Math.sin(t*0.9+i*0.7);ctx.lineWidth=1.5;ctx.shadowBlur=14;ctx.shadowColor=col;ctx.beginPath();ctx.moveTo(x0,H+10);ctx.lineTo(vx,vy);ctx.stroke();}
    ctx.shadowBlur=0;ctx.globalAlpha=1;
    for(let k=0;k<6;k++){const p=((t*0.18+k/6)%1),y=vy+(H+40-vy)*Math.pow(p,2.2),sp=(y-vy)/(H-vy),xl=vx-(vx+W*0.3)*sp,xr=vx+(W*1.3-vx)*sp,col=cols[k%4];ctx.globalAlpha=0.9*Math.pow(p,1.2)*(1-p*0.3);ctx.strokeStyle=col;ctx.lineWidth=2+6*p;ctx.shadowBlur=30*p;ctx.shadowColor=col;ctx.beginPath();ctx.moveTo(xl,y);ctx.lineTo(xr,y);ctx.stroke();}
    ctx.shadowBlur=0;ctx.globalAlpha=1;
    for(let b=0;b<3;b++){const ang=Math.sin(t*0.5+b*2.1)*0.9+(b-1)*0.6;ctx.globalAlpha=0.16;ctx.fillStyle=cols[b];ctx.beginPath();ctx.moveTo(vx,vy);ctx.lineTo(vx+Math.cos(ang-Math.PI/2-0.05)*H*1.6,vy+Math.sin(ang-Math.PI/2-0.05)*H*1.6);ctx.lineTo(vx+Math.cos(ang-Math.PI/2+0.05)*H*1.6,vy+Math.sin(ang-Math.PI/2+0.05)*H*1.6);ctx.closePath();ctx.fill();}
    ctx.globalAlpha=1;const pg=ctx.createRadialGradient(vx,vy,0,vx,vy,90);pg.addColorStop(0,'rgba(255,255,255,.9)');pg.addColorStop(.2,'rgba(34,240,255,.5)');pg.addColorStop(1,'rgba(34,240,255,0)');ctx.fillStyle=pg;ctx.fillRect(vx-90,vy-90,180,180);
    ctx.globalAlpha=.05;ctx.fillStyle='#fff';for(let i=0;i<120;i++)ctx.fillRect(Math.random()*W,Math.random()*H,1,1);ctx.globalAlpha=1;}
  function loop(){t+=0.016;draw();requestAnimationFrame(loop);}
  size();addEventListener('resize',()=>{size();draw();});if(reduce){t=2.3;draw();}else loop();
})();

/* ---------- newsletter (every page) ---------- */
$$('form[data-signup]').forEach(f=>f.addEventListener('submit',e=>{e.preventDefault();f.reset();toast("You're on the list. See you on the lanes.");}));
/* generic demo forms */
$$('form[data-demo]').forEach(f=>f.addEventListener('submit',e=>{e.preventDefault();const ok=f.querySelector('.confirm');if(ok){ok.hidden=false;ok.scrollIntoView({block:'nearest',behavior:'smooth'});}toast(f.dataset.demo||'Sent.');}));

function seg(id,cb){const el=document.getElementById(id);if(!el)return;el.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$$('button',el).forEach(x=>x.classList.remove('on'));b.classList.add('on');cb&&cb(b);});}

/* ---------- shared menu data + renderer ---------- */
const MENU={
    burgers:[['Double smash burger',18,'House pickles, grilled onion, special sauce',['Fleishig']],['Pastrami smash',21,'Double patty, hot pastrami, mustard',['Fleishig']],['Schnitzel sandwich',17,'Challah roll, slaw, garlic mayo',['Fleishig']],['Pulled brisket roll',19,'Slow-smoked, BBQ, crispy onions',['Fleishig']],['Grilled chicken club',16,'Facon, lettuce, tomato, pareve aioli',['Fleishig']],['Falafel pita',13,'Hummus, Israeli salad, amba',['Pareve','Vegan']]],
    wings:[['Wings, dozen',22,'Buffalo, honey-chili or dry rub',['Fleishig']],['Wings, half dozen',12,'One sauce',['Fleishig']],['Hand-cut fries',7,'Sea salt',['Pareve','Vegan']],['Loaded pastrami fries',16,'Pastrami, pickled jalapeño, special sauce',['Fleishig']],['Onion rings',8,'Beer-battered',['Pareve']],['Mozzarella-style sticks',9,'Pareve, marinara',['Pareve']]],
    platters:[['Pastrami fries for the lane',24,'Feeds four',['Fleishig']],['Wing tower',48,'Three dozen, three sauces',['Fleishig']],['Slider flight, 12',46,'Four smash, four schnitzel, four brisket',['Fleishig']],['Nosh board',38,'Pickles, olives, hummus, pita, crudité',['Pareve','Vegan']],['Party platter',110,'Feeds 10. Sliders, wings, fries, slaw',['Fleishig']]],
    kids:[['Hot dog & fries',11,'Includes a drink',['Fleishig']],['Chicken nuggets & fries',12,'Six pieces',['Fleishig']],['Mini sliders, two',12,'Plain or cheese-style',['Fleishig']],['Mac & cheese-style',10,'Pareve',['Pareve']],['Kids flatbread',11,'Pareve cheese',['Pareve']]],
    desserts:[['Churro bites',12,'Cinnamon sugar, chocolate dip',['Pareve']],['Pareve soft serve',7,'Chocolate, vanilla, swirl',['Pareve']],['Warm cookie skillet',11,'Pareve ice cream on top',['Pareve']],['Brownie sundae',12,'Fudge, whipped topping',['Pareve']],['Slushie, large',6,'Blue, red or glow',['Pareve','Vegan']]],
    drinks:[['Fountain soda, bottomless',4,'Coke, Diet, Sprite',['Pareve']],['Glow Lemonade',9,'Zero-proof, butterfly pea, yuzu',['Pareve']],['Strike Zone, frozen',16,'Vodka, passion fruit, lime',['21+']],['Blackout Old Fashioned',18,'Kosher bourbon, smoked',['21+']],['Lane 7 Spritz',15,'Prosecco, grapefruit, rosemary',['21+']],['Bucket of six',42,'Bottles on ice, to the lane',['21+']]]
  };

function mountMenu(tabsEl,gridEl,cart,onChange){
  function render(cat){gridEl.innerHTML='';MENU[cat].forEach(([n,p,d,tags])=>{const el=document.createElement('article');el.className='mi';const q=cart[n]?cart[n].q:0;
    el.innerHTML=`<h4>${n}</h4><span class="pr">$${p}</span><p>${d}</p><div class="diet">${tags.map(t=>`<span>${t}</span>`).join('')}</div><button type="button" class="add${q?' n':''}" data-n="${n}" data-p="${p}">${q?'Added ×'+q+' · + more':'Add'}</button>`;gridEl.appendChild(el);});}
  tabsEl.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$$('button',tabsEl).forEach(x=>x.classList.remove('on'));b.classList.add('on');render(b.dataset.m);});
  gridEl.addEventListener('click',e=>{const b=e.target.closest('.add');if(!b)return;const n=b.dataset.n,p=+b.dataset.p;cart[n]=cart[n]||{p,q:0};cart[n].q++;b.classList.add('n');b.textContent='Added ×'+cart[n].q+' · + more';onChange&&onChange();});
  render(tabsEl.querySelector('.on').dataset.m);
  return {rerender:()=>render(tabsEl.querySelector('.on').dataset.m)};
}

/* ---------- LANE BOOKING ---------- */
(function(){
  const daysEl=$('#days');if(!daysEl)return;
  const slotsEl=$('#slots'),mapEl=$('#lanemap');
  const state={day:0,slot:null,slotIdx:0,bowlers:6,hours:2,mode:'Glow',picked:new Set(),food:{},foodWhen:0};
  const preTabs=$('#preTabs');if(preTabs){mountMenu(preTabs,$('#preGrid'),state.food,()=>update());seg('preWhen',b=>{state.foodWhen=+b.dataset.w;update();});}
  const today=new Date();today.setHours(0,0,0,0);const days=[];for(let i=0;i<7;i++){const d=new Date(today);d.setDate(today.getDate()+i);days.push(d);}
  const st=shabbosTimes();
  days.forEach((d,i)=>{const b=document.createElement('button');b.type='button';b.className='day';const dow=d.getDay();let sub=DAYS[dow];if(dow===6){sub='Motzei Shabbos';b.classList.add('closed');}if(dow===5)sub='Fri · day';
    b.innerHTML=`<small>${sub}</small><b>${d.getDate()}</b><small>${d.toLocaleString('en-US',{month:'short'})}</small>`;
    b.addEventListener('click',()=>{state.day=i;$$('.day',daysEl).forEach(x=>x.classList.remove('on'));b.classList.add('on');buildSlots();});daysEl.appendChild(b);});
  function slotList(dow){
    if(dow===6){const o=st.open?new Date(st.open.toLocaleString('en-US',{timeZone:'America/New_York'})):null;const base=o?o.getHours()+ (o.getMinutes()>=30?0.5:0):21;const s=[];for(let h=base;h<=24.5;h+=0.5)s.push(fmtH(h));return{slots:s,note:`Motzei Shabbos: doors open about an hour after Shabbos ends (≈ ${fmtNY(st.ends)}). Last lane at 12:30 AM.`,peak:true};}
    if(dow===5){const c=st.close?new Date(st.close.toLocaleString('en-US',{timeZone:'America/New_York'})):null;const end=c?c.getHours()+(c.getMinutes()>=30?0.5:0):13;const s=[];for(let h=11;h<=end-1;h+=0.5)s.push(fmtH(h));return{slots:s,note:`Friday: we close at ${fmtNY(st.close)}, two hours before candle lighting. Day rates apply.`,peak:false};}
    if(dow===0)return{slots:r(11,21.5),note:'Sunday: Daylight mode till 5 PM, Glow after. Kids bowl free with a meal till 5.',peak:true};
    if(dow===4)return{slots:r(16,23),note:'Thursday: lanes from 8 PM bundle with the live show.',peak:true};
    return{slots:r(16,22),note:'Weeknight off-peak rate before 7 PM.',peak:false};
    function r(a,b){const s=[];for(let h=a;h<=b;h+=0.5)s.push(fmtH(h));return s;}
  }
  const soldOut=new Set(['8:00 PM','9:30 PM','7:30 PM']);
  function buildSlots(){slotsEl.innerHTML='';state.slot=null;const d=days[state.day];const info=slotList(d.getDay());
    info.slots.forEach((s,i)=>{const b=document.createElement('button');b.type='button';b.className='slot';b.textContent=s;if(soldOut.has(s)&&i>2){b.disabled=true;b.title='Sold out';}
      b.addEventListener('click',()=>{state.slot=s;state.slotIdx=i;$$('.slot',slotsEl).forEach(x=>x.classList.remove('on'));b.classList.add('on');buildMap();update();});slotsEl.appendChild(b);});
    $('#slotNote').textContent=info.note;const f=$$('.slot',slotsEl).find(x=>!x.disabled);if(f)f.click();}
  function buildMap(){if(!mapEl)return;mapEl.innerHTML='';state.picked.clear();const need=Math.ceil(state.bowlers/6);const seed=state.day*7+state.slotIdx;
    for(let i=1;i<=16;i++){const l=document.createElement('button');l.type='button';l.className='lane';l.textContent=i;const busy=((i*7+seed*3)%5===0)||((i+seed)%11===0);if(busy){l.classList.add('busy');l.disabled=true;l.title='Taken';}
      l.addEventListener('click',()=>{if(state.picked.has(i)){state.picked.delete(i);l.classList.remove('pick');}else{if(state.picked.size>=need){toast(`You only need ${need} lane${need>1?'s':''}. Add bowlers to pick more.`);return;}state.picked.add(i);l.classList.add('pick');}update();});
      mapEl.appendChild(l);}
    // auto-pick first free adjacent lanes
    const free=$$('.lane:not(.busy)',mapEl);for(let i=0;i<Math.min(need,free.length);i++){free[i].click();}}
  $('#bMinus').addEventListener('click',()=>{state.bowlers=Math.max(1,state.bowlers-1);buildMap();update();});
  $('#bPlus').addEventListener('click',()=>{state.bowlers=Math.min(60,state.bowlers+1);buildMap();update();});
  seg('dur',b=>{state.hours=+b.dataset.h;update();});seg('mode',b=>{state.mode=b.textContent;update();});
  $('#addons').addEventListener('change',update);
  function update(){const d=days[state.day],dow=d.getDay();const lanes=Math.ceil(state.bowlers/6);
    const peak=(dow===0||dow===4||dow===6)||(dow>=1&&dow<=3&&state.slotIdx>=6);const rate=peak?48:34;const laneCost=lanes*state.hours*rate,shoes=state.bowlers*5.5;let add=0;$$('#addons input:checked').forEach(i=>add+=+i.dataset.p);
    let food=0,foodCount=0;const fl=$('#sFoodList');if(fl)fl.innerHTML='';Object.entries(state.food).forEach(([n,{p,q}])=>{food+=p*q;foodCount+=q;if(fl){const d=document.createElement('div');d.innerHTML=`<dt>${q} × ${n}</dt><dd>$${p*q}</dd>`;fl.appendChild(d);}});
    const total=(laneCost+shoes+add+food)*TAX;
    $('#bowlers').value=state.bowlers;$('#laneCalc').textContent=`${lanes} lane${lanes>1?'s':''} needed · up to 6 bowlers each`;
    $('#sWhen').textContent=state.slot?`${DAYS[dow]} ${d.toLocaleString('en-US',{month:'short',day:'numeric'})} · ${state.slot}`:'Pick a time';
    $('#sLanes').textContent=`${lanes} × ${state.hours} hr · lane${state.picked.size>1?'s':''} ${[...state.picked].sort((a,b)=>a-b).join(', ')||'—'}`;
    $('#sRate').textContent=`${money(laneCost)} (${peak?'peak':'off-peak'} $${rate}/hr)`;$('#sShoes').textContent=money(shoes)+` · ${state.bowlers} pairs`;$('#sAdd').textContent=money(add);$('#sMode').textContent=state.mode;const sf=$('#sFood');if(sf){sf.textContent=foodCount?`${money(food)} · ${foodCount} item${foodCount>1?'s':''}`:'$0';$('#sFoodWhen').textContent=foodCount?(state.foodWhen?`${state.foodWhen} min after start`:'Ready when you arrive'):'—';}$('#sTotal').textContent=money(total);$('#bookOk').hidden=true;}
  $('#holdBtn').addEventListener('click',()=>{const d=days[state.day];if(state.picked.size===0){toast('Pick a lane on the map first.');return;}
    $('#bookOkText').textContent=`Lane${state.picked.size>1?'s':''} ${[...state.picked].sort((a,b)=>a-b).join(', ')} on ${DAYS[d.getDay()]} ${d.toLocaleString('en-US',{month:'short',day:'numeric'})} at ${state.slot}, ${state.mode} mode, ${state.hours} hr.${Object.keys(state.food).length?` Food pre-ordered, ${state.foodWhen?state.foodWhen+' minutes in':'ready at the lane when you arrive'}.`:''} Held for 10 minutes. Confirmation code WL-${Math.floor(1000+Math.random()*9000)}.`;$('#bookOk').hidden=false;toast('Lanes held for 10 minutes.');});
  daysEl.firstChild.click();
})();

/* ---------- MENU ---------- */
(function(){
  const grid=$('#menuGrid');if(!grid)return;
  const cart={};let mode='lane';
  const mm=mountMenu($('#menuTabs'),grid,cart,draw);
  const modeT=$('#orderMode');if(modeT)modeT.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$$('button',modeT).forEach(x=>x.classList.remove('on'));b.classList.add('on');mode=b.dataset.mode;$('#laneField').hidden=mode!=='lane';$('#pickupField').hidden=mode!=='pickup';$('#cartSend').textContent=mode==='lane'?'Send to my lane':'Place pickup order';});
  function draw(){const list=$('#cartList');list.innerHTML='';let t=0,c=0;Object.entries(cart).forEach(([n,{p,q}])=>{if(q<=0){delete cart[n];return;}t+=p*q;c+=q;const d=document.createElement('div');d.innerHTML=`<dt>${n}</dt><dd><button class="qty" data-n="${n}" data-d="-1" aria-label="Fewer">−</button>${q}<button class="qty" data-n="${n}" data-d="1" aria-label="More">+</button> $${p*q}</dd>`;list.appendChild(d);});
    $('#cartEmpty').hidden=c>0;$('#cartTotal').textContent=money(t*TAX);$('#cartOk').hidden=true;}
  $('#cartList').addEventListener('click',e=>{const b=e.target.closest('.qty');if(!b)return;cart[b.dataset.n].q+=+b.dataset.d;draw();mm.rerender();});
  $('#cartSend').addEventListener('click',()=>{if(!Object.keys(cart).length){toast('Add something first.');return;}const lane=$('#laneNo')?.value||'7';$('#cartOkText').textContent=mode==='lane'?`Heading to lane ${lane}. About 12 minutes. Keep bowling.`:`Pickup in about 20 minutes at the kitchen window. Order WL-${Math.floor(1000+Math.random()*9000)}.`;$('#cartOk').hidden=false;toast(mode==='lane'?'Order sent to the lane.':'Pickup order placed.');});
})();

/* ---------- EVENTS & TICKETS ---------- */
(function(){
  const grid=$('#evgrid');if(!grid)return;const box=$('#ticketBox');let price=0,qty=2;
  $('#filters').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$$('button',e.currentTarget).forEach(x=>x.classList.remove('on'));b.classList.add('on');const f=b.dataset.f;$$('.evc',grid).forEach(c=>c.classList.toggle('hide',f!=='all'&&c.dataset.t!==f));});
  grid.addEventListener('click',e=>{const b=e.target.closest('[data-buy]');if(!b)return;price=+b.dataset.pr;qty=2;$('#tTitle').textContent=b.dataset.buy;$('#tOk').hidden=true;box.hidden=false;calc();box.scrollIntoView({block:'center',behavior:'smooth'});});
  function calc(){$('#tQty').value=qty;const lane=$('#tLane').checked?96:0,table=$('#tTable').checked?60:0;$('#tTotal').textContent=money(price*qty+lane+table);}
  $('#tMinus').addEventListener('click',()=>{qty=Math.max(1,qty-1);calc();});$('#tPlus').addEventListener('click',()=>{qty=Math.min(20,qty+1);calc();});
  $('#tLane').addEventListener('change',calc);$('#tTable').addEventListener('change',calc);
  $('#tBuy').addEventListener('click',()=>{$('#tOk').hidden=false;toast('Tickets sent to your phone.');});
})();

/* ---------- PARTY BUILDER ---------- */
(function(){
  const g=$('#guests');if(!g)return;
  const tiers={lane:{name:'Lane Party',base:0,perGuest:34,min:8,max:60,food:0},suite:{name:'Private Suite',base:1900,perGuest:0,min:20,max:120,food:38},buyout:{name:'Full Buyout',base:9500,perGuest:0,min:150,max:400,food:48}};let tier='suite';
  function clamp(){const t=tiers[tier];g.min=t.min;g.max=t.max;if(+g.value<t.min)g.value=t.min;if(+g.value>t.max)g.value=t.max;}
  $('#tiers').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$$('button',e.currentTarget).forEach(x=>x.classList.remove('on'));b.classList.add('on');tier=b.dataset.tier;clamp();calc();});
  g.addEventListener('input',calc);$('#paddons').addEventListener('change',calc);seg('occ',calc);
  $('#pdate').addEventListener('change',e=>{const d=new Date(e.target.value+'T12:00:00');const note=$('#pdateNote');if(isNaN(d))return;
    if(d.getDay()===6){note.textContent='That is Shabbos. We can do Motzei Shabbos from one hour after Shabbos ends, or pick another day.';note.style.color='var(--magenta)';}
    else if(d.getDay()===5){note.textContent='Fridays end two hours before Shabbos. Daytime parties only.';note.style.color='var(--muted)';}
    else{note.textContent='Available. We hold it for 48 hours once requested.';note.style.color='var(--lime)';}});
  function calc(){const t=tiers[tier],n=+g.value;$('#guestsOut').value=n;$('#guestNote').textContent=`${t.name}: ${t.min} to ${t.max} guests${tier==='suite'?', 4 dedicated lanes, more on request':tier==='lane'?', one lane per 6 guests':', the whole building'}.`;
    const base=t.base+t.perGuest*n,food=t.food*n;let add=0;$$('#paddons input:checked').forEach(i=>{if(i.dataset.pp)add+=+i.dataset.pp*n;if(i.dataset.flat)add+=+i.dataset.flat;});
    $('#pTier').textContent=t.name;$('#pGuests').textContent=n;$('#pBase').textContent=money(base);$('#pFood').textContent=tier==='lane'?'included':money(food);$('#pAdd').textContent=money(add);$('#pTotal').textContent=money(base+food+add);$('#pDeposit').textContent=money((base+food+add)*0.25);$('#pOk').hidden=true;}
  $('#pSend').addEventListener('click',()=>{const occ=$('#occ .on').textContent;$('#pOkText').textContent=`${tiers[tier].name} for ${g.value} guests, ${occ}. The events team will confirm the date and send the deposit link within one business day.`;$('#pOk').hidden=false;toast('Request sent to the events team.');});
  clamp();calc();
})();

/* ---------- CATERING ---------- */
(function(){
  const tabs=$('#caterTabs');if(!tabs)return;
  tabs.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$$('button',tabs).forEach(x=>x.classList.remove('on'));b.classList.add('on');$$('[data-cater]').forEach(p=>p.hidden=p.dataset.cater!==b.dataset.c);});
  const hc=$('#cHead'),out=$('#cHeadOut'),est=$('#cEst');const per={kiddush:14,lunch:22,simcha:58,shabbos:36};
  function calc(){const type=$('#cType').value;out.value=hc.value;est.textContent=money(hc.value*per[type]);}
  hc.addEventListener('input',calc);$('#cType').addEventListener('change',calc);calc();
})();

/* ---------- LEAGUES ---------- */
(function(){
  const f=$('#leagueForm');if(!f)return;const pl=$('#players'),po=$('#playersOut'),fee=$('#leagueFee');
  function calc(){po.value=pl.value;const div=$('#division').value;const per={mens:185,womens:185,youth:120,corporate:220,mixed:185}[div];fee.textContent=`${money(per*pl.value)} per season · ${money(per)} per player`;}
  pl.addEventListener('input',calc);$('#division').addEventListener('change',calc);calc();
})();

/* ---------- GIFT CARDS ---------- */
(function(){
  const card=$('#giftCard');if(!card)return;let amt=50,design='glow';
  seg('gAmt',b=>{amt=+b.dataset.a;$('#gCustom').value='';paint();});$('#gCustom').addEventListener('input',e=>{if(e.target.value){amt=Math.max(10,Math.min(1000,+e.target.value));$$('#gAmt button').forEach(x=>x.classList.remove('on'));paint();}});
  seg('gDesign',b=>{design=b.dataset.d;paint();});$('#gTo').addEventListener('input',paint);$('#gFrom').addEventListener('input',paint);
  function paint(){card.className='gift '+design;$('#gAmtOut').textContent='$'+amt;$('#gToOut').textContent=($('#gTo').value||'For you')+($('#gFrom').value?' · from '+$('#gFrom').value:'');$('#gTotal').textContent='$'+amt;}
  $('#gBuy').addEventListener('click',()=>{$('#gOk').hidden=false;toast('Gift card sent.');});paint();
})();

/* ---------- ADMIN PREVIEW ---------- */
(function(){
  const heat=$('#heat');if(!heat)return;const hours=['11','12','1','2','3','4','5','6','7','8','9','10','11','12'];
  heat.innerHTML='<span></span>'+hours.map(h=>`<span style="text-align:center">${h}</span>`).join('');
  ['Sun','Mon','Tue','Wed','Thu','Motzei'].forEach((d,r)=>{heat.innerHTML+=`<span class="lbl">${d}</span>`+hours.map((h,c)=>{let v=(Math.sin(r*1.3+c*0.6)+1)/2;if(d==='Motzei'&&c<9)v=0;if(d!=='Sun'&&d!=='Motzei'&&c<5)v=0;if(c>=8)v=Math.min(1,v+0.35);const a=(0.08+v*0.9).toFixed(2);return `<span class="h" title="${d} ${h}: ${Math.round(v*16)} of 16 lanes" style="background:rgba(255,46,209,${a})"></span>`;}).join('');});
})();
})();
