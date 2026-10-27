/**
 * Read-only adapter for independently republished K26 polling-station turnout.
 * Third-party publication: https://github.com/navonyaniv/election-il-2026
 * This is NOT a direct official CEC API, a population-wide city census,
 * a random sample, or the total number of registered 2026 voters.
 */
export const MIRROR_URL='https://raw.githubusercontent.com/navonyaniv/election-il-2026/main/results.json';
export const MIRROR_REPO_URL='https://github.com/navonyaniv/election-il-2026/blob/main/results.json';
const K26_DATE='2026-10-27';
const inIsraelDay=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
/**
 * Percentages are from the reporting stations for each locality.
 * Historical eligible voters are used ONLY as common synthetic denominators
 * to feed the existing bloc-ratio calculation; never present as 2026 counts.
 */
export function mirrorToTurnoutSnapshot(feed, historical,now=new Date()){
  if(!feed||typeof feed!=='object'||Array.isArray(feed))throw Error('נתוני המקור אינם אובייקט');
  if(feed.rehearsal||feed.mock===true||feed.test===true||!['day','results','count','live'].includes(feed.stage))throw Error('מקור ניסוי או שלב בחירות לא מאושר');
  const time=new Date(feed.updated);
  if(!Number.isFinite(time.getTime())||inIsraelDay(time)!==K26_DATE||time>new Date(now.getTime()+30*60000))throw Error('המקור אינו מעודכן ביום הבחירות');
  if(!feed.live_towns||typeof feed.live_towns!=='object'||Array.isArray(feed.live_towns)||Object.keys(feed.live_towns).length<100)throw Error('חסרים די דיווחי יישובים');
  if(!Array.isArray(historical)||historical.length<100)throw Error('בסיס ההצבעה ההיסטורי חסר');
  const histByCode=new Map(historical.map(row=>[String(row.cityCode),row]));
  const localities=[];
  let stations=0;
  for(const [code,entry] of Object.entries(feed.live_towns)){
    const h=histByCode.get(String(code));
    if(!h||!Array.isArray(entry)||entry.length<2)continue;
    const pct=Number(entry[0]),reportedStations=Number(entry[1]);
    const eligible=Number(h.eligibleVoters);
    if(!Number.isFinite(pct)||pct<0||pct>100||!Number.isInteger(reportedStations)||reportedStations<1||!Number.isFinite(eligible)||eligible<1)continue;
    localities.push({code:String(code),eligible,voters:Math.round(eligible*pct/100),observedTurnoutPct:pct,reportingStations:reportedStations,observationTime:entry[2]??null});
    stations+=reportedStations;
  }
  if(localities.length<100)throw Error('מעט מדי יישובים ניתנים להתאמה ל־2022');
  return {
    type:'turnout',timestamp:time.toISOString(),source:MIRROR_REPO_URL,
    sourceKind:'third-party-republication',
    observationAsOf:feed.turnout?.updated||null,
    nationalTurnoutTime:feed.turnout?.time||null,
    nationalTurnoutPct:Number.isFinite(Number(feed.turnout?.pct))?Number(feed.turnout.pct):null,
    sourceReportingStations:stations,
    denominatorNote:'2022 historical registered electorate; current 2026 station-sample turnout percent applied to historical denominator',
    localities
  };
}