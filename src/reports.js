import { BASIS_LABELS, ORBITS } from './data.js';
import { evaluate, toCsv, verificationTasks } from './model.js';
import { ARCHITECTURES, PATTERNS, inspectLab } from './fault-lab.js';
import { state } from './state.js';
import { fmt, h, modeLabel, table, won } from './ui.js';
import { download, notify } from './dom.js';
import { evidenceNotice } from './forms.js';
import { orbitRows } from './pages.js';

export function labCsv() {
  if (!state.campaign) throw Error('반복 실험을 먼저 실행하세요.');
  const c = state.campaign;
  const rows = [
    [
      'model',
      'data_hex',
      'architecture',
      'pattern',
      'trials',
      'seed',
      'correct',
      'detected_stop_required',
      'silent_corruption',
      'correct_fraction',
      'scope',
    ],
    ...Object.entries(c.counts).map(([k, n]) => [
      c.model,
      c.hex,
      ARCHITECTURES[k],
      PATTERNS[c.pattern],
      c.trials,
      c.seed,
      n.correct,
      n.detected,
      n.silent,
      n.correct / c.trials,
      c.scope,
    ]),
  ];
  download('kleo-chip-fault-campaign.csv', toCsv(rows), 'text/csv;charset=utf-8');
  notify('패턴·시드·범위를 포함한 실험 결과를 저장했습니다.');
}
export function printLabReport() {
  const lab = state.project.lab,
    outcomes = inspectLab(lab),
    labels = {
      correct: '정상 데이터 확보',
      detected: '검출·출력 사용 중단',
      silent: '미검출 손상',
    };
  document.querySelector('#print-root').innerHTML =
    `<h1>K-LEO 반도체 보호설계 실험</h1><p>${h(state.project.title)} · V1.1.0 · ${h(new Date().toLocaleString('ko-KR'))}</p><p>64비트 기준 데이터: ${h(lab.hex)}. 수동 오류 주입 상태는 시나리오 JSON으로 재현할 수 있습니다.</p>${table(
      ['구조', '저장 bit', '회로 계산 데이터', '판정', '오류 bit'],
      Object.entries(outcomes).map(
        ([k, v]) =>
          `<tr><td>${h(ARCHITECTURES[k])}</td><td>${v.physicalBits}</td><td>${v.hex}</td><td>${labels[v.status]}</td><td>${v.mismatch}</td></tr>`,
      ),
    )}<h2>반복 오류 주입</h2>${
      state.campaign
        ? `<p>패턴 ${h(PATTERNS[state.campaign.pattern])} · ${state.campaign.trials}회 · 시드 ${state.campaign.seed} · 기준값 ${state.campaign.hex}</p>${table(
            ['구조', '정상 데이터', '검출·중단 필요', '미검출 손상'],
            Object.entries(state.campaign.counts).map(
              ([k, n]) =>
                `<tr><td>${h(ARCHITECTURES[k])}</td><td>${n.correct}</td><td>${n.detected}</td><td>${n.silent}</td></tr>`,
            ),
          )}`
        : '<p>실행한 반복 실험이 없습니다.</p>'
    }<h2>해석 범위</h2><p>확장 해밍 SECDED (72,64), 비트별 TMR 다수결과 불일치 검출을 계산합니다. TMR 투표기·불일치 검출기는 이상적입니다. 스크러빙은 회로가 계산한 값만 다시 씁니다. 원본 기준값을 이용한 복구는 하지 않습니다.</p><p>반복 실험은 매 시행 초기화 후 구조별 같은 개수의 서로 다른 물리 비트를 반전합니다. 상관 패턴은 TMR의 두 복제본 동일 비트, 다른 구조는 서로 다른 두 물리 비트입니다. 시간·궤도 방사선 발생률·물리 레이아웃·위성 신뢰도는 계산하지 않습니다. 결과 비율을 궤도 발생률에 직접 곱하지 마세요.</p><p>참고: NASA FPGA Mitigation Strategies for Critical Space Applications (2018), https://ntrs.nasa.gov/citations/20180006778</p>`;
  window.print();
}
export const saveProject = () => {
  download('kleo-chip-scenario.json', JSON.stringify(state.project, null, 2), 'application/json');
  notify('시나리오 JSON을 저장했습니다. 다시 불러와 이어서 분석할 수 있습니다.');
};
export function resultCsv() {
  const rows = [
    [
      'scenario',
      'part_id',
      'part_name',
      'orbit',
      'shield_mm',
      'years',
      'mission_tid_krad_si',
      'required_tid_krad_si',
      'tid_margin_ratio',
      'logical_raw_bit_upsets_day',
      'residual_events_day',
      'modeled_recovery_downtime_sec_day',
      'unrecovered_functional_events_day',
      'protection',
      'cost_krw',
      'environment_basis',
      'part_tid_basis',
      'environment_source',
      'part_tid_source',
      'unresolved',
      'scope',
    ],
  ];
  for (const p of state.project.parts)
    for (const o of ORBITS) {
      const r = evaluate(state.project, p.id, o.id);
      rows.push([
        state.project.title,
        p.id,
        p.name,
        o.label,
        state.project.mission.shieldMm,
        state.project.mission.years,
        r.missionDose,
        r.requiredDose,
        r.tidRatio,
        r.soft?.rawPerDay,
        r.soft?.uncorrectablePerDay,
        r.downtime,
        r.unhandled,
        modeLabel[state.project.protection.mode],
        r.cost.total,
        r.dose?.basis,
        p.tidBasis,
        r.dose?.source,
        p.tidSource,
        r.reasons.join(' / '),
        '예비평가; 합성자료는 실제 예측 아님; 중단시간은 검출·복구 가능한 SEU/입력된 SEFI만',
      ]);
    }
  download('kleo-chip-results.csv', toCsv(rows), 'text/csv;charset=utf-8');
  notify('입력 근거와 자료 공백을 포함한 결과 CSV를 저장했습니다.');
}
export function printReport() {
  const r = evaluate(state.project),
    o = ORBITS.find(x => x.id === state.project.mission.orbitId);
  document.querySelector('#print-root').innerHTML =
    `<h1>K-LEO 우주반도체 적용성 검토</h1><p class="print-meta">${h(state.project.title)} · ${h(new Date().toLocaleString('ko-KR'))}</p>${evidenceNotice(r)}<p>평가 부품: <strong>${h(r.part.name)}</strong> · ${h(o.label)} · 수명 ${state.project.mission.years}년 · Al 등가 차폐 ${state.project.mission.shieldMm}mm · 선량 여유계수 ${state.project.mission.doseMargin}</p><h2>궤도별 수치 비교</h2>${table(['궤도', '누적선량<br>krad(Si)', '요구선량<br>krad(Si)', 'TID 여유', '원시 오류<br>회/일', '환경 근거'], orbitRows())}<h2>보호·비용 가정</h2><p>보호설계 ${h(modeLabel[state.project.protection.mode])}, 점검주기 ${state.project.protection.scrubSec}초, 복구시간 ${state.project.protection.recoverySec}초, 검출·복구 성공 ${fmt(state.project.protection.coverage * 100)}%, 기능 영향 ${fmt(state.project.protection.functionalFraction * 100)}%.</p><p>모델상 복구 중단 ${fmt(r.downtime, 5)}초/일 · 미복구 기능 사건 ${fmt(r.unhandled)}회/일. 영구고장·SEL·위성망 가용도 제외.</p><p>제작·검증비 ${won(r.cost.total)}${r.cost.total === null ? '' : '원'} · 예비품 포함 ${r.cost.boards}대. 금액은 입력 가정이며 발사·운용·교체비 제외.</p><h2>검증계획</h2><ul>${verificationTasks(
      r,
      state.project,
    )
      .map(t => `<li><strong>[${h(t.status)}] ${h(t.title)}</strong><br>${h(t.detail)}</li>`)
      .join(
        '',
      )}</ul><h2>근거·제한사항</h2><p>환경: ${h(r.dose?.source || '자료 부족')}<br>모델·시기: ${h(r.dose?.model || '자료 부족')} / ${h(r.dose?.epoch || '자료 부족')}<br>부품 TID: ${h(r.part.tidSource)} (${h(BASIS_LABELS[r.part.tidBasis])})<br>시험조건: ${h(r.part.notes)}</p><p>추가 확인: ${h(r.reasons.join(' / '))}</p><p>고도·차폐 보간 없이 일치하는 연간 환경자료를 사용합니다. TID 수치 여유 충족은 부품 채택 승인이 아니며, 비트 오류율은 위성 고장확률이 아닙니다.</p>`;
  window.print();
}
