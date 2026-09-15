import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,SCENARIO_SCHEMA_VERSION} from '../dist/data.js';
import {evaluate,findEnvironment,softErrorModel,atLeastTwoPoisson,costModel,zeroEventUpperRate,validateProject,importEnvironmentCsv,environmentCsv,parseCsv,toCsv,SCENARIO_SCHEMA_VERSION as MODEL_SCHEMA_VERSION} from '../dist/model.js';

test('default scenario: 8 krad/year × 5 years, margin 2, 30 krad component',()=>{
 const p=createProject();validateProject(p);const r=evaluate(p);
 assert.equal(r.missionDose,40);assert.equal(r.requiredDose,80);assert.equal(r.tidRatio,.375);
 assert.equal(r.synthetic,true);assert.ok(r.soft.rawPerDay>0);
});
test('per-bit rate scales with logical bits, and not satellite production quantity',()=>{
 const p=createProject();const r=evaluate(p);assert.ok(Math.abs(r.soft.rawPerDay-7e-8*16777216*2)<1e-12);
 p.mission.satellites=512;assert.equal(evaluate(p).soft.rawPerDay,r.soft.rawPerDay);
 p.mission.devicesPerBoard=4;assert.equal(evaluate(p).soft.rawPerDay,r.soft.rawPerDay*2);
});
test('unsupported shielding or orbit geometry never extrapolates',()=>{
 const p=createProject();p.mission.shieldMm=2.5;const r=evaluate(p);assert.equal(r.missionDose,null);assert.equal(r.soft,null);
 p.mission.shieldMm=2;p.environments.forEach(e=>e.inclinationDeg=60);assert.equal(evaluate(p).missionDose,null);
});
test('vendor TID specifications cannot manufacture unknown SEU or price data',()=>{
 const p=createProject();p.selectedPartId='ut8q512e';const r=evaluate(p);assert.equal(r.soft,null);assert.equal(r.cost.total,null);assert.equal(r.cost.powerW,null);assert.equal(r.part.tidBasis,'spec');
});
test('unknown differs from zero, and protected output rates cannot be corrected twice',()=>{
 const p=createProject();const row=p.environments.find(x=>x.orbitId==='leo888'&&x.shieldMm===2&&x.partId==='demo-a');
 row.seuPerBitDay=0;assert.equal(evaluate(p).soft.rawPerDay,0);
 row.seuPerBitDay=null;assert.equal(evaluate(p).soft,null);
 row.seuPerBitDay=1e-8;row.rateKind='effective';assert.equal(evaluate(p).soft,null);
});
test('rare-event Poisson probabilities stay nonzero and converge to mu²/2',()=>{
 assert.ok(Math.abs(atLeastTwoPoisson(1e-10)/5e-21-1)<1e-8);
 assert.ok(Math.abs(atLeastTwoPoisson(1)-(1-2/Math.E))<1e-14);
});
test('ECC with ideal independent flips benefits from a shorter scrub period; MBU imposes floor',()=>{
 const p=createProject().protection;p.mbuFraction=0;p.mode='ecc';
 const short=softErrorModel(1e-5,65536,1,{...p,scrubSec:1});
 const long=softErrorModel(1e-5,65536,1,{...p,scrubSec:100});
 assert.ok(short.uncorrectablePerDay<long.uncorrectablePerDay);
 const mbu=softErrorModel(1e-5,65536,1,{...p,scrubSec:1,mbuFraction:.1});
 assert.ok(mbu.uncorrectablePerDay>=.032768);
});
test('TMR accounts for triplication and common-cause contribution',()=>{
 const p=createProject();p.protection.mode='tmr';const r=evaluate(p);
 assert.equal(r.soft.physicalRawPerDay,r.soft.rawPerDay*3);assert.equal(r.cost.chips,6);
 p.protection.commonFraction=1;const common=evaluate(p);assert.equal(common.soft.uncorrectablePerDay,common.soft.rawPerDay);
});
test('zero coverage exposes unhandled functional events, not a claim of reliability',()=>{
 const p=createProject();p.protection.coverage=0;const r=evaluate(p);assert.equal(r.downtime,0);assert.ok(r.unhandled>0);
 assert.equal(r.sel,null);assert.ok(r.reasons.includes('SEL/파괴성 효과 검토'));
});
test('cost independently checks ceil spares, screening, protection, shielding, NRE',()=>{
 const p=createProject();const c=costModel(p,p.parts[0]);
 assert.equal(c.boards,282);assert.equal(c.bom,230000);assert.equal(c.total,114860000);
 p.protection.mode='none';assert.equal(costModel(p,p.parts[0]).bom,210000);
});
test('zero events, 95% one-sided limit stays positive and declines with exposure',()=>{
 const rate=zeroEventUpperRate(6,2);assert.ok(Math.abs(rate-(-Math.log(.05)/365.25))<1e-15);assert.equal(zeroEventUpperRate(12,2),rate/2);assert.throws(()=>zeroEventUpperRate(0,2));
});
test('flight observation events are recorded per event type, not as one combined count',()=>{
 const p=createProject();assert.deepEqual(p.flight.events,{seu:0,sel:0,sefi:0});validateProject(p);
 const legacy=createProject();legacy.flight.events=3;assert.throws(()=>validateProject(legacy),/사건유형별/);
 const partial=createProject();delete partial.flight.events.sefi;assert.throws(()=>validateProject(partial));
 const negative=createProject();negative.flight.events.sel=-1;assert.throws(()=>validateProject(negative));
 const fractional=createProject();fractional.flight.events.sefi=1.5;assert.throws(()=>validateProject(fractional));
 const observed=createProject();observed.flight.events.seu=2;validateProject(observed);
});
test('CSV round trip preserves assumptions, missing values, units and quoted source',()=>{
 const p=createProject();p.environments[0].source='Report, page "2"\nline 3';
 const q=importEnvironmentCsv(p,environmentCsv(p));
 assert.equal(q.environments.length,27);assert.equal(q.environments[0].source,p.environments[0].source);assert.equal(q.environments[0].selPerDeviceDay,null);
});
test('unsafe or inconsistent imported data is rejected',()=>{
 const p=createProject();p.mission.years=-1;assert.throws(()=>validateProject(p));
 const q=createProject();q.environments[0].seuPerBitDay=Infinity;assert.throws(()=>validateProject(q));
 const r=createProject();r.environments[0].annualTidKrad=1234;assert.throws(()=>validateProject(r),/선량/);
 const s=createProject();s.environments.push({...s.environments[0]});assert.throws(()=>validateProject(s),/중복/);
 assert.throws(()=>parseCsv('"not closed'));assert.ok(toCsv([['=HYPERLINK("x")']]).includes("'=HYPERLINK"));
});
test('a confirmed-zero SEU count plus an unknown SEFI rate must report the total as unknown, not a confirmed 0 (code review #1)',()=>{
 const p=createProject();
 const row=p.environments.find(x=>x.orbitId==='leo888'&&x.shieldMm===2&&x.partId==='demo-a');
 row.seuPerBitDay=0; // SEU count is confirmed zero
 row.sefiPerDeviceDay=null; // SEFI is unmeasured, not confirmed zero
 const r=evaluate(p);
 assert.equal(r.soft.uncorrectablePerDay,0);
 assert.equal(r.sefi,null);
 // Grand totals must be null ("unknown"), never silently forced to 0 by the unknown SEFI.
 assert.equal(r.functional,null);
 assert.equal(r.recoverable,null);
 assert.equal(r.downtime,null);
 assert.equal(r.unhandled,null);
 // The confirmed/known-only contribution (from SEU alone) stays visible as a separate,
 // genuinely-zero field even though the grand total above is unknown.
 assert.equal(r.functionalConfirmed,0);
 assert.equal(r.recoverableConfirmed,0);
 assert.equal(r.downtimeConfirmed,0);
 assert.equal(r.unhandledConfirmed,0);
 assert.ok(r.reasons.includes('SEFI 시험·발생률'));
});
test('when SEFI is known, the grand total is confirmed + SEFI and is never null',()=>{
 const p=createProject();
 const row=p.environments.find(x=>x.orbitId==='leo888'&&x.shieldMm===2&&x.partId==='demo-a');
 row.seuPerBitDay=0;row.sefiPerDeviceDay=0.0005;
 const r=evaluate(p);
 assert.equal(r.functionalConfirmed,0);
 assert.ok(r.functional>0);
 assert.equal(r.functional,r.functionalConfirmed+r.sefi);
 assert.equal(typeof r.downtime,'number');
 assert.ok(r.downtime>=0);
});
test('when SEU itself is unknown, both the total and the confirmed-only field are null',()=>{
 const p=createProject();
 const row=p.environments.find(x=>x.orbitId==='leo888'&&x.shieldMm===2&&x.partId==='demo-a');
 row.seuPerBitDay=null;row.sefiPerDeviceDay=0.0005;
 const r=evaluate(p);
 assert.equal(r.soft,null);
 assert.equal(r.functional,null);
 assert.equal(r.functionalConfirmed,null);
 assert.equal(r.downtime,null);
 assert.equal(r.downtimeConfirmed,null);
});
test('findEnvironment: a null component-specific dose falls back to the common/wildcard dose, 8 krad/yr over 5 yr = 40 krad total (code review #2)',()=>{
 const p=createProject();
 const own=p.environments.find(x=>x.orbitId==='leo888'&&x.shieldMm===2&&x.partId==='demo-a');
 assert.equal(own.annualTidKrad,8); // shared baseline value for this orbit+shield
 own.annualTidKrad=null; // component-specific dose becomes unknown
 p.environments.push({orbitId:'leo888',altitudeKm:888,inclinationDeg:42,shieldMm:2,annualTidKrad:8,partId:'*',seuPerBitDay:null,sefiPerDeviceDay:null,selPerDeviceDay:null,basis:'user',source:'공통 선량 자료',model:'공통',epoch:'공통',rateKind:'raw',notes:''});
 validateProject(p);
 const {dose,rate}=findEnvironment(p,'demo-a','leo888');
 assert.equal(dose.annualTidKrad,8); // fell back to the wildcard row, not left null
 assert.equal(dose.partId,'*');
 assert.equal(rate.partId,'demo-a'); // demo-a's own error-rate row, never the wildcard row
 assert.equal(rate.seuPerBitDay,own.seuPerBitDay); // its own SEU rate is untouched by the dose fallback
 const r=evaluate(p,'demo-a','leo888');
 assert.equal(r.missionDose,8*p.mission.years);
 assert.equal(r.missionDose,40);
});
test('findEnvironment: error rates are never borrowed from the wildcard row or another component, only the dose is shared',()=>{
 const p=createProject();
 const a=p.environments.find(x=>x.orbitId==='leo888'&&x.shieldMm===2&&x.partId==='demo-a');
 const b=p.environments.find(x=>x.orbitId==='leo888'&&x.shieldMm===2&&x.partId==='demo-b');
 a.seuPerBitDay=1.23e-7;
 p.environments.push({orbitId:'leo888',altitudeKm:888,inclinationDeg:42,shieldMm:2,annualTidKrad:8,partId:'*',seuPerBitDay:9.99e-3,sefiPerDeviceDay:9.99e-3,selPerDeviceDay:9.99e-3,basis:'user',source:'공통',model:'공통',epoch:'공통',rateKind:'raw',notes:''});
 validateProject(p);
 const {rate}=findEnvironment(p,'demo-a','leo888');
 assert.equal(rate.seuPerBitDay,1.23e-7); // demo-a's own rate
 assert.notEqual(rate.seuPerBitDay,b.seuPerBitDay); // never demo-b's rate
 assert.notEqual(rate.seuPerBitDay,9.99e-3); // never the wildcard row's rate
});
test('findEnvironment: a component with no environment row of its own gets the common dose but a null rate, never another component\'s rate',()=>{
 const p=createProject();
 const clone=structuredClone(p.parts.find(x=>x.id==='demo-a'));
 clone.id='demo-d';clone.name='demo-d (no own environment row)';
 p.parts.push(clone);
 p.environments.push({orbitId:'leo888',altitudeKm:888,inclinationDeg:42,shieldMm:2,annualTidKrad:8,partId:'*',seuPerBitDay:null,sefiPerDeviceDay:null,selPerDeviceDay:null,basis:'user',source:'공통',model:'공통',epoch:'공통',rateKind:'raw',notes:''});
 validateProject(p);
 const {dose,rate}=findEnvironment(p,'demo-d','leo888');
 assert.equal(dose.annualTidKrad,8);
 assert.equal(rate,null);
 const r=evaluate(p,'demo-d','leo888');
 assert.equal(r.missionDose,40);
 assert.equal(r.soft,null); // no SEU data was invented for demo-d
});
test('scenario schema version is a single shared source of truth (kleo integration contract)',()=>{
 // data.js and model.js must agree on SCENARIO_SCHEMA_VERSION (re-exported from model.js
 // for convenience) so a saved scenario JSON and the validator that reads it back never
 // drift apart — see SCENARIO_SCHEMA.md for the versioning contract this backs.
 assert.equal(SCENARIO_SCHEMA_VERSION,MODEL_SCHEMA_VERSION);
 const p=createProject();assert.equal(p.schemaVersion,SCENARIO_SCHEMA_VERSION);
 validateProject(p);
 p.schemaVersion=SCENARIO_SCHEMA_VERSION+1;assert.throws(()=>validateProject(p),/schemaVersion/);
 p.schemaVersion=String(SCENARIO_SCHEMA_VERSION);assert.throws(()=>validateProject(p),/schemaVersion/);
});
