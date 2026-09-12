import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../dist/data.js';
import {evaluate,findEnvironment,softErrorModel,atLeastTwoPoisson,costModel,zeroEventUpperRate,validateProject,importEnvironmentCsv,environmentCsv,parseCsv,toCsv} from '../dist/model.js';

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
test('shielding thickness between two known points is log-linearly interpolated',()=>{
 const p=createProject();p.mission.shieldMm=2.5;const r=evaluate(p);
 // leo888 doses at 2mm/3mm are 8 and 5.5 krad(Si)/yr; log-linear midpoint is their geometric mean.
 const expectedDose=Math.sqrt(8*5.5);
 assert.ok(Math.abs(r.dose.annualTidKrad-expectedDose)<1e-9);
 assert.ok(Math.abs(r.missionDose-expectedDose*p.mission.years)<1e-9);
 assert.equal(r.doseInterpolated,true);assert.equal(r.doseNearestOnly,false);
 assert.deepEqual(r.doseBracket,[2,3]);
 assert.ok(r.reasons.some(x=>x.includes('보간')));
 // Only the exact-thickness SEU/SEFI/SEL rate rows are trusted; interpolation is TID-only.
 assert.equal(r.soft,null);
});
test('shielding thickness outside the known range uses the nearest point, never extrapolated',()=>{
 const p=createProject();p.mission.shieldMm=0.5;const r=evaluate(p);
 assert.equal(r.dose.annualTidKrad,15);// the 1mm point for leo888, not a trend continued past it
 assert.equal(r.doseInterpolated,false);assert.equal(r.doseNearestOnly,true);
 assert.ok(r.reasons.some(x=>x.includes('범위를 벗어나')));
 const p2=createProject();p2.mission.shieldMm=10;const r2=evaluate(p2);
 assert.equal(r2.dose.annualTidKrad,5.5);// the 3mm point, not extrapolated further out
 assert.equal(r2.doseNearestOnly,true);
});
test('mismatched orbit geometry is never bridged by shielding interpolation',()=>{
 const p=createProject();p.environments.forEach(e=>e.inclinationDeg=60);
 assert.equal(evaluate(p).missionDose,null);
 p.mission.shieldMm=2.5;assert.equal(evaluate(p).missionDose,null);
});
test('an exact shielding match is used as-is, never routed through interpolation',()=>{
 const p=createProject();
 const {dose,doseInterpolated,doseNearestOnly}=findEnvironment(p,'demo-a','leo888');
 assert.equal(dose.annualTidKrad,8);assert.equal(doseInterpolated,false);assert.equal(doseNearestOnly,false);
});
test('an environment with only one known shielding thickness cannot interpolate, only match or fall back to nearest',()=>{
 const p=createProject();p.environments=p.environments.filter(e=>!(e.orbitId==='leo888'&&e.shieldMm===1));
 p.mission.shieldMm=2.5;
 const {doseInterpolated,doseNearestOnly,dose}=findEnvironment(p,'demo-a','leo888');
 assert.equal(doseInterpolated,true);assert.equal(doseNearestOnly,false);
 assert.ok(Math.abs(dose.annualTidKrad-Math.sqrt(8*5.5))<1e-9);
 p.environments=p.environments.filter(e=>!(e.orbitId==='leo888'&&e.shieldMm===3));
 const single=findEnvironment(p,'demo-a','leo888');
 assert.equal(single.doseInterpolated,false);assert.equal(single.doseNearestOnly,true);
 assert.equal(single.dose.annualTidKrad,8);
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
