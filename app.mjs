import {modelHistoric,modelCount,scenario,coalitions} from './model.mjs';
const $=id=>document.getElementById(id);
const url2022='https://raw.githubusercontent.com/NitzanSelwyn/Voters-IL/main/public/data/rounds/25.json';
let cities=[],turnout=null,count=null,selected='turnout',oOverride=null,loading=false;
const SOURCE_DATE='2026-10-27';
function validSnapshot(data,type){
  if(!data||!Array.isArray(data.localities)||data.localities.length<1)throw Error('חסר מערך יישובים');
  if(!['turnout','count'].includes(data.type)||data.type!==type)throw Error('סוג נתונים לא תקין');
  if(data.test===true||data.mock===true||data.environment==='test'||data.environment==='demo')throw Error('מקור בדיקות / הדגמה אינו מותר');
  if(!data.timestamp||!Number.isFinite(Date.parse(data.timestamp))||new Date(data.timestamp).toLocaleDateString('en-CA',{timeZone:'Asia/Jerusalem'})!==SOURCE_DATE)throw Error('תאריך הנתונים אינו תאריך הבחירות 27.10.2026');
  const maxNow=Date.now()+30*60000;
  if(Date.parse(data.timestamp)>maxNow)throw Error('תאריך עתידי אינו מותר');
  for(const row of data.localities){
    const id=String(row.code??row.cityCode??'');if(!/^\d{1,5}$/.test(id))throw Error('קוד יישוב שגוי');
    if(type==='turnout'){
      const n=Number(row.voters??row.totalVotes),e=Number(row.eligible??row.eligibleVoters);
      if(!Number.isFinite(n)||!Number.isFinite(e)||n<0||e<=0||n>e*1.02)throw Error('נתוני הצבעה לא תקינים');
    } else if(!row.parties||typeof row.parties!=='object')throw Error('נתוני מפלגות חסרים');
  }
  if(new Set(data.localities.map(x=>String(x.code??x.cityCode))).size!==data.localities.length)throw Error('יישוב כפול בקובץ');
  return data;
}
async function fetchJSON(url,timeout=16000){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
  try{const response=await fetch(url,{cache:'no-store',signal:ctrl.signal});if(!response.ok)throw Error('HTTP '+response.status);return await response.json()}finally{clearTimeout(timer)}
}
function own(k){return localStorage.getItem('el26-'+k)||''}
function setStatus(msg,good=false){$('status').textContent=msg;$('status').className=good?'banner ok':'banner'}
function colored(label,number,color){return `<span><i class="dot" style="background:${color}"></i>${label}: ${number}</span>`}
function showForecast(name,raw){
  if(!raw.ok)return `<strong>${name}:</strong> ${raw.reason||'אין נתונים'}`;
  const s=scenario(raw,{yamcha:+$('y').value,miluim:+$('m').value,otzmaOverride:oOverride,countMode:name==='ספירה'});
  return `<strong>${name}:</strong> ימין ${s.right}, שמאל ${s.left}, ערבים ${s.arab} (כיסוי: ${raw.matched}/${raw.total} יישובים)`;
}
function render(){
  $('mOut').textContent=$('m').value;$('yOut').textContent=$('y').value;
  const t=cities.length?modelHistoric(cities,turnout):{ok:false,reason:'היסטוריה עדיין לא נטענה'};
  const c=cities.length?modelCount(cities,count):{ok:false,reason:'היסטוריה עדיין לא נטענה'};
  const current=selected==='count'?c:t;
  $('turnout-mode').style.outline=selected==='turnout'?'2px solid #80adff':'none';
  $('count-mode').style.outline=selected==='count'?'2px solid #80adff':'none';
  $('compare').innerHTML=`<p>${showForecast('השתתפות',t)}</p><p>${showForecast('ספירה',c)}</p>`;
  if(!current.ok){$('basis').textContent=current.reason||'';$('total').textContent='אין נתונים';for(const id of ['rNum','lNum','aNum'])$(id).textContent='—';$('bar').innerHTML='';$('coalitions').innerHTML='<tr><td colspan="2">ממתינים לנתונים תקינים</td></tr>';$('legend').innerHTML='';$('oOut').textContent=oOverride==null?'מחושב אוטומטית':String(oOverride);return;}
  const s=scenario(current,{yamcha:+$('y').value,miluim:+$('m').value,otzmaOverride:oOverride,countMode:selected==='count'});
  const total=s.right+s.left+s.arab+s.m+s.y;
  $('total').textContent=`${total} / 120`;
  $('rNum').textContent=s.right;$('lNum').textContent=s.left;$('aNum').textContent=s.arab;
  $('o').value=s.o;$('oOut').textContent=oOverride==null?`${s.o} (הערכה)`:`${s.o} (ידני)`;
  const elems=[['שמאל',s.left,'left'],['מילואימניקים',s.m,'m'],['ערבים',s.arab,'arab'],['עמך ישראל',s.y,'y'],['ימין',s.right,'right']].filter(x=>x[1]>0);
  $('bar').innerHTML=elems.map(([title,n,key])=>`<div class="segment ${key}" style="flex:${n}" title="${title}: ${n}"><span>${n>=5?`${title} ${n}`:n}</span></div>`).join('');
  $('legend').innerHTML=colored('עוצמה יהודית',s.o,'#508cdb')+colored('רע״ם',s.ra,'#32c6a0')+colored('ש״ס + יהדות התורה',s.h,'#90a0bd')+colored('הדמוקרטים',s.d,'#f595a1');
  $('coalitions').innerHTML=coalitions(s).map(x=>`<tr><td>${x.label}</td><td><b class="${x.possible?'yes':'no'}">${x.seats}</b><span class="muted small"> (${x.margin>=0?'+':''}${x.margin})</span></td></tr>`).join('');
  const snapshot=selected==='count'?count:turnout;
  $('basis').textContent=`${selected==='count'?'ספירת קולות':'אחוזי הצבעה'} · ${current.matched}/${current.total} יישובים · עדכון המקור: ${new Date(snapshot.timestamp).toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'})} · נתונים אינם מדגם אקראי.`;
}
async function refresh(){
  if(loading)return;loading=true;$('refresh').disabled=true;
  let errors=[];
  const wasCountAvailable=!!count;
  try{
    if(!cities.length){
      const data=await fetchJSON(url2022);if(!Array.isArray(data.cities)||!data.cities.length)throw Error('נתוני 2022 ריקים');cities=data.cities;
      $('source-state').textContent=`2022: ${cities.length} יישובים`;
    }
    for(const [type,key] of [['turnout','turnout-url'],['count','count-url']]){
      const userUrl=own(key);
      const u=userUrl||`./data/${type}.json`;
      if(userUrl&&!/^https:\/\//i.test(u)){errors.push(`${type}: כתובת לא מאובטחת`);continue;}
      try{
        const link=new URL(u,location.href);link.searchParams.set('ts',Date.now());
        const d=validSnapshot(await fetchJSON(link.href),type);
        // Keep the newest known snapshot: a CDN must not roll the display backwards.
        const previous=type==='turnout'?turnout:count;
        if(!previous||Date.parse(d.timestamp)>=Date.parse(previous.timestamp)){
          if(type==='turnout')turnout=d;else count=d;
        }
      } catch(e) { errors.push(`${type}: ${e.message}`); }
    }
    const loaded=[turnout&&'השתתפות',count&&'ספירה'].filter(Boolean);
    if(loaded.length){
      setStatus(`נתוני 2026: ${loaded.join(' + ')}. ${errors.length?'עדיין ממתינים לעדכון של: '+errors.join(' | '):'מקורות זמינים.'}`,true);
      const latest=[turnout?.timestamp,count?.timestamp].filter(Boolean).sort().at(-1);
      $('stamp').textContent='מקור אחרון: '+new Date(latest).toLocaleTimeString('he-IL',{timeZone:'Asia/Jerusalem'}); 
    }else setStatus('נתוני 2022 זמינים. ממתינים לנתוני 2026 מאומתים בקובצי המאגר. '+errors.join(' | '));
    if(count&&!wasCountAvailable)selected='count';
  }catch(e){setStatus(`טעינת נתוני 2022 נכשלה: ${e.message}`)}
  finally{loading=false;$('refresh').disabled=false;render()}
}
for(const id of ['m','y'])$(id).addEventListener('input',render);
$('o').addEventListener('input',()=>{oOverride=+$('o').value;render()});
$('reset-o').addEventListener('click',()=>{oOverride=null;render()});
$('refresh').addEventListener('click',refresh);
$('turnout-mode').addEventListener('click',()=>{selected='turnout';render()});
$('count-mode').addEventListener('click',()=>{selected='count';render()});
for(const k of ['turnout-url','count-url'])$(k).value=own(k);
$('save-urls').addEventListener('click',()=>{for(const k of ['turnout-url','count-url'])localStorage.setItem('el26-'+k,$(k).value.trim());refresh()});
$('upload').addEventListener('change',async e=>{
  try{const d=JSON.parse(await e.target.files[0].text());validSnapshot(d,d.type);if(d.type==='turnout')turnout=d;else {count=d;selected='count'}setStatus('קובץ נתוני 2026 נטען ידנית. מקור ותקינות אינם מאומתים אוטומטית.',true);$('stamp').textContent='קובץ מקומי: '+d.timestamp;render()}
  catch(err){setStatus('שגיאה בקריאת קובץ: '+err.message)}e.target.value='';
});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
refresh();