import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../dist/data.js';
import {validateProject,evaluate} from '../dist/model.js';
import {createLab,validateLab,hexToBits,bitsToHex,encode64,decode72,vote64,inspectLab,flipBit,injectPreset,scrubMemory,resetMemory,runCampaign,DATA_POSITIONS} from '../dist/fault-lab.js';

test('SECDED round trips zero, all ones, alternating bits and MSB patterns',()=>{
  for(const hex of ['0000000000000000','FFFFFFFFFFFFFFFF','AAAAAAAAAAAAAAAA','5555555555555555','8000000000000000','0123456789ABCDEF']) {
    const input=hexToBits(hex),code=encode64(input),d=decode72(code);
    assert.equal(code.length,72);assert.equal(d.flag,'clean');assert.equal(bitsToHex(d.data),hex);
  }
});
test('exhaustive SECDED single-error coverage: all 72 data, check, and overall parity bits',()=>{
  for(const hex of ['0000000000000000','FFFFFFFFFFFFFFFF','0123456789ABCDEF']) {
    const original=encode64(hexToBits(hex));
    for(let i=0;i<72;i++) {
      const c=[...original];c[i]^=1;const d=decode72(c);
      assert.equal(d.flag,'corrected');assert.equal(d.correctedPosition,i+1);
      assert.equal(bitsToHex(d.data),hex);assert.deepEqual(d.code,original);
    }
  }
});
test('exhaustive SECDED double-error coverage: all 2,556 position pairs are detected',()=>{
  for(const hex of ['0000000000000000','0123456789ABCDEF']) {
    const original=encode64(hexToBits(hex));
    for(let i=0;i<72;i++)for(let j=i+1;j<72;j++) {
      const c=[...original];c[i]^=1;c[j]^=1;const d=decode72(c);
      assert.equal(d.flag,'uncorrectable',`pair ${i}, ${j}`);assert.deepEqual(d.code,c);
    }
  }
});
test('triple-bit counterexample is exposed even when SECDED falsely reports a correction',()=>{
  const lab=injectPreset(createLab(),'triple'),o=inspectLab(lab);
  assert.equal(o.ecc.flag,'corrected');assert.equal(o.ecc.status,'silent');assert.equal(o.ecc.mismatch,3);
  const scrubbed=scrubMemory(lab);
  assert.equal(inspectLab(scrubbed).ecc.status,'silent');
  assert.notEqual(inspectLab(scrubbed).ecc.hex,lab.hex);
});
test('scrubbing never restores uncorrectable errors from the testbench golden data',()=>{
  const lab=injectPreset(createLab(),'double'),next=scrubMemory(lab);
  assert.deepEqual(lab.ecc,next.ecc);assert.equal(inspectLab(next).ecc.status,'detected');
  const single=injectPreset(createLab(),'single');
  assert.deepEqual(scrubMemory(single).ecc,createLab().ecc);
});
test('TMR masks every possible one-bit upset in its 192 stored bits',()=>{
  const lab=createLab();
  for(let copy=0;copy<3;copy++)for(let bit=0;bit<64;bit++) {
    const changed=flipBit(lab,'tmr',bit,copy),o=inspectLab(changed).tmr;
    assert.equal(o.status,'correct');assert.equal(o.disagreementBits,1);
  }
});
test('TMR common-cause errors can be detected, then silently propagated by blind resynchronization',()=>{
  const lab=injectPreset(createLab(),'common');lab.view='tmr';
  assert.equal(inspectLab(lab).tmr.status,'detected');assert.equal(inspectLab(lab).tmr.mismatch,1);
  const synced=scrubMemory(lab);
  assert.equal(inspectLab(synced).tmr.status,'silent');assert.equal(inspectLab(synced).tmr.disagreementBits,0);
  assert.notEqual(inspectLab(synced).tmr.hex,lab.hex);
});
test('different TMR bit locations remain recoverable; same bit in two copies fails',()=>{
  const lab=flipBit(flipBit(createLab(),'tmr',0,0),'tmr',1,1);
  assert.equal(inspectLab(lab).tmr.status,'correct');
  const other=flipBit(flipBit(createLab(),'tmr',0,0),'tmr',0,1);
  assert.equal(inspectLab(other).tmr.status,'detected');
});
test('seeded campaign is reproducible, counts sum, and does not mutate the lab',()=>{
  const lab=injectPreset(createLab(),'triple');lab.trials=1000;lab.pattern='double';
  const original=structuredClone(lab),a=runCampaign(lab),b=runCampaign(lab);
  assert.deepEqual(a,b);assert.deepEqual(lab,original);
  for(const c of Object.values(a.counts))assert.equal(c.correct+c.detected+c.silent,1000);
  assert.equal(a.counts.ecc.detected,1000);assert.equal(a.counts.raw.silent,1000);
  assert.ok(a.counts.tmr.correct>950);assert.ok(a.counts.tmr.detected>0);
  lab.seed++;assert.notDeepEqual(runCampaign(lab).counts,a.counts);
});
test('single errors recover with SECDED/TMR; correlated TMR fault floor is not hidden',()=>{
  const lab=createLab();lab.trials=100;lab.pattern='single';
  let r=runCampaign(lab);assert.equal(r.counts.ecc.correct,100);assert.equal(r.counts.tmr.correct,100);
  lab.pattern='common';r=runCampaign(lab);assert.equal(r.counts.tmr.detected,100);
});
test('v1.0 scenarios load, v1.1 JSON preserves exact experiment state and reproducibility',()=>{
  const p=createProject();delete p.lab;validateProject(p);assert.equal(evaluate(p).missionDose,40);
  p.lab=injectPreset(createLab(),'double');const q=JSON.parse(JSON.stringify(p));validateProject(q);
  assert.deepEqual(inspectLab(q.lab),inspectLab(p.lab));
  assert.equal(resetMemory(q.lab,'FFFFFFFFFFFFFFFF').hex,'FFFFFFFFFFFFFFFF');
});
test('maximum-size campaign counts every trial for every architecture',()=>{
  // Wall-clock regression guard lives in scripts/bench-campaign.mjs (npm run bench) so
  // that machine speed never decides whether this correctness suite passes.
  const lab=createLab();lab.trials=20000;lab.pattern='double';
  const result=runCampaign(lab);
  for(const c of Object.values(result.counts))assert.equal(c.correct+c.detected+c.silent,20000);
  assert.deepEqual(runCampaign(lab).counts,result.counts);
});
test('invalid bits, malformed imports and unbounded repeat counts are rejected',()=>{
  assert.throws(()=>hexToBits('123'));assert.throws(()=>hexToBits('<img src=x>'));
  assert.throws(()=>decode72(Array(72).fill(2)));assert.throws(()=>vote64([[1]]));
  for(const [key,value] of [['trials',20001],['trials',1.1],['seed',-1],['pattern','__proto__'],['view','constructor']]) {
    const lab=createLab();lab[key]=value;assert.throws(()=>validateLab(lab));
  }
  const lab=createLab();lab.ecc[0]=null;assert.throws(()=>validateProject({...createProject(),lab}));
  assert.throws(()=>flipBit(createLab(),'tmr',64,0));
});
