// Election-day bloc scenarios. Deterministic and independent of the presentation layer.
// This is a WHAT-IF model, not a scientifically validated forecast or an official result.
export const HISTORIC_2022={
  right:['מחל','ט','שס','ג','ב'],
  left:['פה','כן','ל','אמת','מרצ'],
  arab:['עם','ום','ד'],
  haredi:['שס','ג'],
  democrats:['אמת','מרצ'],
  raam:['עם'],
  otzmaJoint:['ט']
};
export const COUNT_2026={
  right:['מחל','ט','ב','שס','ג','ני','בי','בקר','י'],
  left:['רק','דרך','ל','אמת','פה'],
  arab:['עם','ודם','ד','בד'],
  haredi:['שס','ג'],
  democrats:['אמת'],
  raam:['עם'],
  otzmaJoint:['ב']
};
const safe=n=>Math.max(0,Number(n)||0);
const sum=(obj,keys)=>keys.reduce((n,k)=>n+safe(obj?.[k]),0);
export function modelHistoric(cities, snapshot){
  const byCode=new Map((snapshot?.localities||[]).map(c=>[String(c.code??c.cityCode),c]));
  const matched=cities.filter(c=>byCode.has(String(c.cityCode)));
  if(!matched.length) return {ok:false,reason:'אין נתוני הצבעה חיים שניתן להתאים ליישובים ההיסטוריים',matched:0,total:cities.length};
  const stats={right:0,left:0,arab:0,haredi:0,democrats:0,raam:0,otzmaJoint:0};
  let observedVoters=0,observedEligible=0,priorPaceBase=0,usable=0;
  const nationalEligible=cities.reduce((n,c)=>n+safe(c.eligibleVoters),0);
  // Compare the current-to-2022 observed ballot ratio on the SAME localities.
  // Use the weighted mean for not-yet-reported localities, rather than simply
  // omitting them (which would make an early 5-town update wildly misleading).
  for(const c of matched){
    const live=byCode.get(String(c.cityCode));
    const eligible=safe(live.eligible??live.eligibleVoters??c.eligibleVoters);
    const cast=safe(live.voters??live.totalVotes);
    if(!eligible||!c.eligibleVoters||!c.totalVotes||cast>eligible*1.02)continue;
    observedVoters+=cast;observedEligible+=eligible;
    priorPaceBase+=c.totalVotes*eligible/c.eligibleVoters;usable++;
  }
  if(!priorPaceBase)return {ok:false,reason:'אין די נתוני השתתפות תקינים',matched:0,total:cities.length};
  const nationalPace=observedVoters/priorPaceBase;
  for(const c of cities){
    if(!c.eligibleVoters||!c.totalVotes)continue;
    const live=byCode.get(String(c.cityCode));
    const eligible=safe(live?.eligible??live?.eligibleVoters??c.eligibleVoters);
    const cast=safe(live?.voters??live?.totalVotes);
    const weight=live&&eligible&&cast<=eligible*1.02
      ?cast/c.totalVotes
      :nationalPace*eligible/c.eligibleVoters;
    for(const [key,letters] of Object.entries(HISTORIC_2022))stats[key]+=sum(c.parties,letters)*weight;
  }
  return {ok:true,stats,matched:usable,total:cities.length,observedVoters,observedEligible,
    coverage:observedEligible/Math.max(1,nationalEligible),
    nationalPace,coverageNote:'יישובים שלא דיווחו נכללים לפי קצב ההצבעה הממוצע של היישובים המדווחים'};
}

/**
 * Explain (do not alter) the historical-turnout scenario in auditable terms.
 * A stronghold means >=50% of valid 2022 locality votes went to Arab lists;
 * this is NOT a demographic classification of residents.
 * Locality snapshots may cover only reporting polling stations, so summary
 * turnout must never be represented as an official electorate-wide total.
 */
export function turnoutAudit(cities,snapshot,modeled=null){
  if(!Array.isArray(cities)||!snapshot||!Array.isArray(snapshot.localities))return {ok:false};
  const byCode=new Map(snapshot.localities.map(x=>[String(x.code??x.cityCode),x]));
  const group=()=>({localities:0,eligible:0,liveCast:0,previousCast:0});
  const arabStronghold=group(),others=group();
  const localTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(snapshot.timestamp||Date.now()));
  const localMinutes=Number(localTime.slice(0,2))*60+Number(localTime.slice(3));
  const cityObservations=[];
  const past={right:0,left:0,arab:0};
  let seen=0;
  for(const c of cities){
    const eligible=safe(c.eligibleVoters),prev=safe(c.totalVotes),valid=safe(c.validVotes);
    if(eligible<=0||prev<=0||valid<=0)continue;
    for(const [name,letters] of Object.entries({right:HISTORIC_2022.right,left:HISTORIC_2022.left,arab:HISTORIC_2022.arab}))past[name]+=sum(c.parties,letters);
    const live=byCode.get(String(c.cityCode));if(!live)continue;
    const nowEligible=safe(live.eligible??live.eligibleVoters??eligible);
    const cast=Number(live.voters??live.totalVotes);
    if(!nowEligible||!Number.isFinite(cast)||cast<0||cast>nowEligible*1.02)continue;
    // A precinct subset's turnout ratio is an observation, not a locality census.
    const stronghold=sum(c.parties,HISTORIC_2022.arab)/valid>=0.5;
    const g=stronghold?arabStronghold:others;
    g.localities++;g.eligible+=nowEligible;g.liveCast+=cast;g.previousCast+=prev*nowEligible/eligible;seen++;
    const clock=String(live.observationTime||'');
    if(/^([01]\\d|2[0-3]):[0-5]\\d$/.test(clock)){
      const minutes=Number(clock.slice(0,2))*60+Number(clock.slice(3,5));
      if(minutes<=localMinutes)cityObservations.push({minutes,eligible:nowEligible});
    }
  }
  if(!seen)return {ok:false};
  const mean=g=>({
    localities:g.localities,
    turnout2026Pct:g.eligible?100*g.liveCast/g.eligible:null,
    turnout2022FinalPct:g.eligible?100*g.previousCast/g.eligible:null,
    paceVs2022Final:g.previousCast?g.liveCast/g.previousCast:null
  });
  const observedEligible=cityObservations.reduce((a,x)=>a+x.eligible,0);
  const staleEligible=cityObservations.filter(x=>localMinutes-x.minutes>60).reduce((a,x)=>a+x.eligible,0);
  cityObservations.sort((a,b)=>a.minutes-b.minutes);
  let runningEligible=0,medianMinute=null;
  for(const x of cityObservations){
    runningEligible+=x.eligible;
    if(runningEligible>=observedEligible/2){medianMinute=x.minutes;break;}
  }
  const fmtMinute=n=>n==null?null:String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
  const medianLocalityTime=fmtMinute(medianMinute);
  const staleEligibleSharePct=observedEligible?100*staleEligible/observedEligible:null;
  const raw=modeled?.ok?modeled:modelHistoric(cities,snapshot);
  if(!raw.ok)return {ok:false};
  const baseline=largestRemainder(past,120);
  const adjusted=largestRemainder({right:raw.stats.right,left:raw.stats.left,arab:raw.stats.arab},120);
  const totalEligible=arabStronghold.eligible+others.eligible;
  const observedPct=totalEligible?100*(arabStronghold.liveCast+others.liveCast)/totalEligible:null;
  const official=Number(snapshot.nationalTurnoutPct);
  const officialPct=snapshot.nationalTurnoutPct==null||!Number.isFinite(official)||official<0||official>100?null:official;
  return {
    ok:true,baselineArabSeats:baseline.arab,adjustedArabSeats:adjusted.arab,
    pastArabVotes:past.arab,pastClassifiedVotes:past.right+past.left+past.arab,
    strongholds:mean(arabStronghold),otherLocalities:mean(others),
    matchedLocalities:seen,
    observedLocalityTurnoutPct:observedPct,
    sourceNationalTurnoutPct:officialPct,
    turnoutGapPp:officialPct!=null&&observedPct!=null?officialPct-observedPct:null,
    weightedMedianLocalityTime:medianLocalityTime,
    localitiesOver60MinOldPct:staleEligibleSharePct
  };
}

export function modelCount(cities, snapshot){
  const byCode=new Map(cities.map(c=>[String(c.cityCode),c]));
  const stats={right:0,left:0,arab:0,haredi:0,democrats:0,raam:0,otzmaJoint:0};
  let matched=0,obsVotes=0,historyExpected=0;
  for(const row of snapshot?.localities||[]){
    const h=byCode.get(String(row.code??row.cityCode));if(!h)continue;
    const parties=row.parties||row.votes||{};
    const counted=Object.values(parties).reduce((a,b)=>a+safe(b),0);
    if(!counted)continue;
    matched++;obsVotes+=counted;
    // Counted municipality's distribution is applied to its full 2022 vote weight.
    // This corrects cross-locality counted-order bias, not within-locality polling-station bias.
    const weight=Math.max(1,safe(h.validVotes))/counted;historyExpected+=safe(h.validVotes);
    for(const [key,letters]of Object.entries(COUNT_2026))stats[key]+=sum(parties,letters)*weight;
  }
  if(!matched)return {ok:false,reason:'אין עדיין תוצאות ספירה רשמיות מתאימות',matched:0,total:cities.length};
  return {ok:true,stats,matched,total:cities.length,observedVoters:obsVotes,coverage:matched/Math.max(1,cities.length),unclassified:0};
}
export function largestRemainder(weights,seats=120){
  const entries=Object.entries(weights).map(([name,weight])=>({name,weight:safe(weight)}));
  const total=entries.reduce((s,x)=>s+x.weight,0);
  if(total<=0)return Object.fromEntries(entries.map(x=>[x.name,0]));
  const shares=entries.map((x,i)=>({...x,i,real:x.weight/total*seats}));
  const out=Object.fromEntries(shares.map(x=>[x.name,Math.floor(x.real)]));
  let rem=seats-Object.values(out).reduce((a,b)=>a+b,0);
  shares.sort((a,b)=>(b.real-Math.floor(b.real))-(a.real-Math.floor(a.real))||a.i-b.i);
  for(let i=0;i<rem;i++)out[shares[i].name]++;
  return out;
}
export function scenario(base,opts={}){
  const raw=base.stats||base;
  const start=largestRemainder({left:raw.left,right:raw.right,arab:raw.arab},120);
  const y=Math.min(15,Math.floor(safe(opts.yamcha))),m=Math.min(15,Math.floor(safe(opts.miluim)));
  const grantedY=y>=4?y:0,grantedM=m>=4?m:0;
  // Arab seats are unaffected by new parties: deductions come ONLY from non-Arab blocs.
  const nonArab=start.left+start.right;
  let reduced=largestRemainder({left:start.left,right:start.right},nonArab-grantedY-grantedM);
  // Below-threshold scenario: withdraw proportionally, redistribute 50/50.
  const shock=(y<4?y:0)+(m<4?m:0);
  if(shock){
    const retained=largestRemainder({left:reduced.left,right:reduced.right},reduced.left+reduced.right-shock);
    const returnHalf=largestRemainder({left:1,right:1},shock);
    reduced={left:retained.left+returnHalf.left,right:retained.right+returnHalf.right};
  }
  const s={right:reduced.right,left:reduced.left,arab:start.arab,y:grantedY,m:grantedM};
  const oratio=raw.right>0?raw.otzmaJoint/raw.right:0;
  const dratio=raw.left>0?raw.democrats/raw.left:0;
  const hratio=raw.right>0?raw.haredi/raw.right:0;
  const rratio=raw.arab>0?raw.raam/raw.arab:0;
  const defaultO=Math.round(s.right*(opts.countMode?oratio:oratio*6/14));
  s.o=Math.min(s.right,opts.otzmaOverride==null?defaultO:Math.floor(safe(opts.otzmaOverride)));
  s.h=Math.min(Math.max(0,s.right-s.o),Math.round(s.right*hratio));
  s.d=Math.min(s.left,opts.countMode?Math.round(s.left*dratio):10);
  s.ra=Math.min(s.arab,Math.round(s.arab*rratio));
  return s;
}
export function coalitions(s){
  return [
    ['ימין בלבד',s.right],
    ['שמאל בלבד',s.left],
    ['שמאל + רע״ם',s.left+s.ra],
    ['שמאל + המילואימניקים + רע״ם',s.left+s.m+s.ra],
    ['ימין + עמך ישראל',s.right+s.y],
    ['קואליציה רחבה ללא עוצמה יהודית, חרדים והדמוקרטים',s.right+s.left+s.m+s.y-s.o-s.h-s.d]
  ].map(([label,seats])=>({label,seats,possible:seats>=61,margin:seats-61}));
}