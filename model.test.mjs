import test from 'node:test';import assert from 'node:assert/strict';
import {largestRemainder,scenario,coalitions,modelHistoric,modelCount} from './model.mjs';
const base={stats:{right:50,left:40,arab:10,otzmaJoint:12,haredi:18,democrats:10,raam:4}};
test('apportionment sums exactly 120',()=>assert.equal(Object.values(largestRemainder({right:44,left:41,arab:15})).reduce((a,b)=>a+b),120));
test('scenario totals 120 for every slider setting',()=>{for(let y=0;y<=15;y++)for(let m=0;m<=15;m++){const s=scenario(base,{yamcha:y,miluim:m});assert.equal(s.left+s.right+s.arab+s.y+s.m,120)}});
test('under threshold parties receive no seats',()=>{const s=scenario(base,{yamcha:3,miluim:2});assert.equal(s.y,0);assert.equal(s.m,0)});
test('otzma override clamped to right',()=>{const s=scenario(base,{otzmaOverride:999});assert.equal(s.o,s.right)});
test('coalition 6 excludes the three requested subgroups',()=>{const s=scenario(base,{yamcha:5,miluim:6,otzmaOverride:7});assert.equal(coalitions(s)[5].seats,s.right+s.left+s.m+s.y-s.o-s.h-s.d)});
test('historical municipality rate adjustment',()=>{const cities=[{cityCode:'1',eligibleVoters:100,totalVotes:50,validVotes:50,parties:{'מחל':30,'פה':10,'עם':10}}];const res=modelHistoric(cities,{localities:[{code:'1',eligible:100,voters:25}]});assert.equal(res.ok,true);assert.equal(res.stats.right,15)});
test('count mode uses party codes',()=>{const cities=[{cityCode:'1',validVotes:100}];const res=modelCount(cities,{localities:[{code:'1',parties:{'מחל':20,'עם':5}}]});assert.equal(res.ok,true);assert.equal(res.stats.right,80);assert.equal(res.stats.arab,20)});

test('additional parties never take seats from Arab bloc',()=>{
  const b={right:70,left:30,arab:20,raam:10,otzmaJoint:16,haredi:8,democrats:5};
  const original=scenario(b,{yamcha:0,miluim:0}).arab;
  for(let a=0;a<=15;a++)for(let m=0;m<=15;m++){
    const s=scenario(b,{yamcha:a,miluim:m});
    assert.equal(s.arab,original);
    assert.equal(s.right+s.left+s.arab+s.m+s.y,120);
  }
});