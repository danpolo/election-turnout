import test from 'node:test';
import assert from 'node:assert/strict';
import {mirrorToTurnoutSnapshot} from './live-mirror.mjs';
const historical=Array.from({length:150},(_,i)=>({cityCode:String(100+i),eligibleVoters:1000,totalVotes:600,parties:{מחל:600}}));
const towns=Object.fromEntries(historical.map(x=>[x.cityCode,[40,2,'12:35']]));
const valid={stage:'day',rehearsal:'',updated:'2026-10-27T13:14:02+02:00',turnout:{pct:31.5,updated:'12:49'},live_towns:towns};
const now=new Date('2026-10-27T13:30:00+02:00');
test('adapts real-source format into typed historic-eligible denominator',()=>{
 const s=mirrorToTurnoutSnapshot(valid,historical,now);
 assert.equal(s.localities.length,150);assert.equal(s.localities[0].voters,400);
 assert.equal(s.localities[0].reportingStations,2);assert.equal(s.sourceKind,'third-party-republication');
 assert.equal(s.nationalTurnoutPct,31.5);
});
test('rejects rehearsal and wrong date',()=>{
 assert.throws(()=>mirrorToTurnoutSnapshot({...valid,rehearsal:'yes'},historical,now));
 assert.throws(()=>mirrorToTurnoutSnapshot({...valid,updated:'2026-10-26T13:14:02+02:00'},historical,now));
});
test('rejects fixture with too few reporting localities',()=>{
 assert.throws(()=>mirrorToTurnoutSnapshot({...valid,live_towns:{100:[45,1,'12:35']}},historical,now));
});
test('rejects invalid percentages and unknown localities',()=>{
 const mut={...towns,'100':[105,2,'12:35'],'101':[-4,1,'12:35'],'9999':[40,2,'12:35']};
 const s=mirrorToTurnoutSnapshot({...valid,live_towns:mut},historical,now);
 assert.equal(s.localities.length,148);
});