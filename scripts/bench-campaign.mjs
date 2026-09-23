/** Wall-clock guard for runCampaign() at the maximum trial count (20,000).
 * Kept out of `npm test` so slow machines cannot fail the correctness suite.
 * runCampaign() used to re-encode and re-validate the lab on every trial (~650 ms);
 * the median of several runs should stay well under the limit below. */
import { createLab, runCampaign } from '../dist/fault-lab.js';

const LIMIT_MS = Number(process.env.BENCH_LIMIT_MS || 400);
const lab = createLab();
lab.trials = 20000;
lab.pattern = 'double';
runCampaign(lab); // warm-up
const times = [];
for (let i = 0; i < 5; i++) {
  const t0 = performance.now();
  runCampaign(lab);
  times.push(performance.now() - t0);
}
times.sort((a, b) => a - b);
const median = times[2];
console.log(`runCampaign 20,000 trials: median ${median.toFixed(0)} ms (limit ${LIMIT_MS} ms)`);
if (median >= LIMIT_MS) {
  console.error('Campaign benchmark exceeded the limit; check for per-trial re-encoding.');
  process.exit(1);
}
