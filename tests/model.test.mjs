import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, SCENARIO_SCHEMA_VERSION } from '../src/data.js';
import {
  evaluate,
  softErrorModel,
  atLeastTwoPoisson,
  costModel,
  zeroEventUpperRate,
  validateProject,
  importEnvironmentCsv,
  environmentCsv,
  parseCsv,
  removePart,
  secdedCheckBits,
  toCsv,
  SCENARIO_SCHEMA_VERSION as MODEL_SCHEMA_VERSION,
} from '../src/model.js';

test('default scenario: 8 krad/year × 5 years, margin 2, 30 krad component', () => {
  const p = createProject();
  validateProject(p);
  const r = evaluate(p);
  assert.equal(r.missionDose, 40);
  assert.equal(r.requiredDose, 80);
  assert.equal(r.tidRatio, 0.375);
  assert.equal(r.synthetic, true);
  assert.ok(r.soft.rawPerDay > 0);
});
test('per-bit rate scales with logical bits, and not satellite production quantity', () => {
  const p = createProject();
  const r = evaluate(p);
  assert.ok(Math.abs(r.soft.rawPerDay - 7e-8 * 16777216 * 2) < 1e-12);
  p.mission.satellites = 512;
  assert.equal(evaluate(p).soft.rawPerDay, r.soft.rawPerDay);
  p.mission.devicesPerBoard = 4;
  assert.equal(evaluate(p).soft.rawPerDay, r.soft.rawPerDay * 2);
});
test('unsupported shielding or orbit geometry never extrapolates', () => {
  const p = createProject();
  p.mission.shieldMm = 2.5;
  const r = evaluate(p);
  assert.equal(r.missionDose, null);
  assert.equal(r.soft, null);
  p.mission.shieldMm = 2;
  p.environments.forEach(e => (e.inclinationDeg = 60));
  assert.equal(evaluate(p).missionDose, null);
});
test('vendor TID specifications cannot manufacture unknown SEU or price data', () => {
  const p = createProject();
  p.selectedPartId = 'ut8q512e';
  const r = evaluate(p);
  assert.equal(r.soft, null);
  assert.equal(r.cost.total, null);
  assert.equal(r.cost.powerW, null);
  assert.equal(r.part.tidBasis, 'spec');
});
test('unknown differs from zero, and protected output rates cannot be corrected twice', () => {
  const p = createProject();
  const row = p.environments.find(
    x => x.orbitId === 'leo888' && x.shieldMm === 2 && x.partId === 'demo-a',
  );
  row.seuPerBitDay = 0;
  assert.equal(evaluate(p).soft.rawPerDay, 0);
  row.seuPerBitDay = null;
  assert.equal(evaluate(p).soft, null);
  row.seuPerBitDay = 1e-8;
  row.rateKind = 'effective';
  assert.equal(evaluate(p).soft, null);
});
test('rare-event Poisson probabilities stay nonzero and converge to mu²/2', () => {
  assert.ok(Math.abs(atLeastTwoPoisson(1e-10) / 5e-21 - 1) < 1e-8);
  assert.ok(Math.abs(atLeastTwoPoisson(1) - (1 - 2 / Math.E)) < 1e-14);
});
test('ECC with ideal independent flips benefits from a shorter scrub period; MBU imposes floor', () => {
  const p = createProject().protection;
  p.mbuFraction = 0;
  p.mode = 'ecc';
  const short = softErrorModel(1e-5, 65536, 1, { ...p, scrubSec: 1 });
  const long = softErrorModel(1e-5, 65536, 1, { ...p, scrubSec: 100 });
  assert.ok(short.uncorrectablePerDay < long.uncorrectablePerDay);
  const mbu = softErrorModel(1e-5, 65536, 1, { ...p, scrubSec: 1, mbuFraction: 0.1 });
  assert.ok(mbu.uncorrectablePerDay >= 0.032768);
});
test('TMR accounts for triplication and common-cause contribution', () => {
  const p = createProject();
  p.protection.mode = 'tmr';
  const r = evaluate(p);
  assert.equal(r.soft.physicalRawPerDay, r.soft.rawPerDay * 3);
  assert.equal(r.cost.chips, 6);
  p.protection.commonFraction = 1;
  const common = evaluate(p);
  assert.equal(common.soft.uncorrectablePerDay, common.soft.rawPerDay);
});
test('zero coverage exposes unhandled functional events, not a claim of reliability', () => {
  const p = createProject();
  p.protection.coverage = 0;
  const r = evaluate(p);
  assert.equal(r.downtime, 0);
  assert.ok(r.unhandled > 0);
  assert.equal(r.sel, null);
  assert.ok(r.reasons.includes('SEL/파괴성 효과 검토'));
});
test('cost independently checks ceil spares, screening, protection, shielding, NRE', () => {
  const p = createProject();
  const c = costModel(p, p.parts[0]);
  assert.equal(c.boards, 282);
  assert.equal(c.bom, 230000);
  assert.equal(c.total, 114860000);
  p.protection.mode = 'none';
  assert.equal(costModel(p, p.parts[0]).bom, 210000);
});
test('zero events, 95% one-sided limit stays positive and declines with exposure', () => {
  const rate = zeroEventUpperRate(6, 2);
  assert.ok(Math.abs(rate - -Math.log(0.05) / 365.25) < 1e-15);
  assert.equal(zeroEventUpperRate(12, 2), rate / 2);
  assert.throws(() => zeroEventUpperRate(0, 2));
});
test('flight observation events are recorded per event type, not as one combined count', () => {
  const p = createProject();
  assert.deepEqual(p.flight.events, { seu: 0, sel: 0, sefi: 0 });
  validateProject(p);
  const legacy = createProject();
  legacy.flight.events = 3;
  assert.throws(() => validateProject(legacy), /사건유형별/);
  const partial = createProject();
  delete partial.flight.events.sefi;
  assert.throws(() => validateProject(partial));
  const negative = createProject();
  negative.flight.events.sel = -1;
  assert.throws(() => validateProject(negative));
  const fractional = createProject();
  fractional.flight.events.sefi = 1.5;
  assert.throws(() => validateProject(fractional));
  const observed = createProject();
  observed.flight.events.seu = 2;
  validateProject(observed);
});
test('CSV round trip preserves assumptions, missing values, units and quoted source', () => {
  const p = createProject();
  p.environments[0].source = 'Report, page "2"\nline 3';
  const q = importEnvironmentCsv(p, environmentCsv(p));
  assert.equal(q.environments.length, 27);
  assert.equal(q.environments[0].source, p.environments[0].source);
  assert.equal(q.environments[0].selPerDeviceDay, null);
});
test('unsafe or inconsistent imported data is rejected', () => {
  const p = createProject();
  p.mission.years = -1;
  assert.throws(() => validateProject(p));
  const q = createProject();
  q.environments[0].seuPerBitDay = Infinity;
  assert.throws(() => validateProject(q));
  const r = createProject();
  r.environments[0].annualTidKrad = 1234;
  assert.throws(() => validateProject(r), /선량/);
  const s = createProject();
  s.environments.push({ ...s.environments[0] });
  assert.throws(() => validateProject(s), /중복/);
  assert.throws(() => parseCsv('"not closed'));
  assert.ok(toCsv([['=HYPERLINK("x")']]).includes("'=HYPERLINK"));
});
test('scenario schema version is a single shared source of truth (kleo integration contract)', () => {
  // data.js and model.js must agree on SCENARIO_SCHEMA_VERSION (re-exported from model.js
  // for convenience) so a saved scenario JSON and the validator that reads it back never
  // drift apart — see SCENARIO_SCHEMA.md for the versioning contract this backs.
  assert.equal(SCENARIO_SCHEMA_VERSION, MODEL_SCHEMA_VERSION);
  const p = createProject();
  assert.equal(p.schemaVersion, SCENARIO_SCHEMA_VERSION);
  validateProject(p);
  p.schemaVersion = SCENARIO_SCHEMA_VERSION + 1;
  assert.throws(() => validateProject(p), /schemaVersion/);
  p.schemaVersion = String(SCENARIO_SCHEMA_VERSION);
  assert.throws(() => validateProject(p), /schemaVersion/);
});
test('removing a part drops only its own environment rows and keeps a valid selection', () => {
  const p = createProject();
  const shared = { ...p.environments.find(x => x.partId === 'demo-b'), partId: '*' };
  p.environments.push(shared);
  const next = removePart(p, 'demo-a');
  assert.equal(
    next.parts.some(x => x.id === 'demo-a'),
    false,
  );
  assert.equal(
    next.environments.some(x => x.partId === 'demo-a'),
    false,
  );
  assert.equal(next.selectedPartId, next.parts[0].id);
  assert.ok(next.environments.some(x => x.partId === '*'));
  assert.equal(p.parts.length, 6, 'input project is not mutated');
  const other = removePart(p, 'demo-c');
  assert.equal(other.selectedPartId, 'demo-a');
  assert.throws(() => removePart(p, 'missing'), /찾을 수 없습니다/);
  let one = createProject();
  for (const x of one.parts.slice(1).map(x => x.id)) one = removePart(one, x);
  assert.throws(() => removePart(one, one.parts[0].id), /최소 1개/);
});
test('ECC exposure includes the stored SECDED check bits', () => {
  assert.equal(secdedCheckBits(64), 8);
  assert.equal(secdedCheckBits(32), 7);
  assert.equal(secdedCheckBits(8), 5);
  const p = { ...createProject().protection, mode: 'ecc', mbuFraction: 0, scrubSec: 60 };
  const r = softErrorModel(1e-7, 16777216, 2, p);
  assert.equal(r.storedWordBits, 72);
  assert.ok(Math.abs(r.physicalRawPerDay / r.rawPerDay - 72 / 64) < 1e-12);
  const words = (16777216 * 2) / 64,
    cycles = 86400 / 60;
  const expected = words * cycles * atLeastTwoPoisson((1e-7 * 72) / cycles);
  assert.ok(Math.abs(r.uncorrectablePerDay / expected - 1) < 1e-12);
  // Independent double errors scale with the square of exposed bits: ~(72/64)^2 of a data-only model.
  const dataOnly = words * cycles * atLeastTwoPoisson((1e-7 * 64) / cycles);
  assert.ok(Math.abs(r.uncorrectablePerDay / dataOnly - (72 / 64) ** 2) < 1e-3);
  const none = softErrorModel(1e-7, 16777216, 2, { ...p, mode: 'none' });
  assert.equal(none.physicalRawPerDay, none.rawPerDay);
});
