import { BASIS_LABELS, ORBITS, SOURCES } from './data.js';
import { evaluate, verificationTasks, zeroEventUpperRate } from './model.js';
import { selected, state } from './state.js';
import {
  badge,
  btn,
  card,
  fmt,
  h,
  kv,
  metric,
  modeLabel,
  notice,
  sourceLink,
  table,
  won,
} from './ui.js';
import { input, partInput, partPicker } from './forms.js';

export const pages = {
  lab: [
    '반도체 설계 실험실',
    'BIT-LEVEL DESIGN LAB',
    '비트를 직접 뒤집고, 오류 정정·검출·복구 동작을 비교합니다.',
    'layers',
  ],
  overview: [
    '분석 대시보드',
    'MISSION OVERVIEW',
    '목표 궤도에서의 선량·오류·비용을 함께 비교합니다.',
    'chart',
  ],
  parts: [
    '부품·시험자료',
    'COMPONENT EVIDENCE',
    '제품 사양, 시험자료와 사용자 가정을 구분해 관리합니다.',
    'chip',
  ],
  protection: [
    '보호·복구 설계',
    'FAULT MITIGATION',
    '오류정정·복구 가정을 바꾸고 잔존 사건과 중단시간을 비교합니다.',
    'shield',
  ],
  verification: [
    '검증계획',
    'VERIFICATION PLAN',
    '부품의 근거를 정리하고 Space-MaCS 이후의 검증 공백을 확인합니다.',
    'check',
  ],
  cost: [
    '비용·양산 비교',
    'COST COMPARISON',
    '소자·보호설계·차폐·시험·개발비를 동일 물량에서 비교합니다.',
    'cost',
  ],
  data: [
    '자료·계산방법',
    'DATA & METHODS',
    '분석자료를 가져오고 계산 가정과 출처를 확인합니다.',
    'data',
  ],
};
export function doseChart() {
  const rs = ORBITS.map(o => evaluate(state.project, state.project.selectedPartId, o.id));
  const limit =
    selected().tidKrad === null ? null : selected().tidKrad / state.project.mission.doseMargin;
  const vals = rs.map(r => r.missionDose).filter(v => v !== null);
  if (!vals.length)
    return '<div class="empty"><strong>환경자료가 필요합니다</strong>목표 궤도·차폐 조건에 맞는 연간 선량을 가져오세요.</div>';
  const max = Math.max(...vals, limit || 0, 1) * 1.15,
    w = 760,
    ht = 245,
    left = 55,
    right = 25,
    top = 20,
    bottom = 38,
    plotW = w - left - right,
    plotH = ht - top - bottom;
  const x = t => left + (plotW * t) / state.project.mission.years,
    y = d => ht - bottom - (d / max) * plotH,
    colors = ['#7a60af', '#087f76', '#4772c6'];
  const grid = Array.from({ length: 5 }, (_, i) => {
    const v = (max * i) / 4;
    return `<line x1="${left}" x2="${w - right}" y1="${y(v)}" y2="${y(v)}" stroke="#e7edf1"/><text x="${left - 10}" y="${y(v) + 4}" text-anchor="end">${fmt(v, 1)}</text>`;
  }).join('');
  const xs = Array.from({ length: 6 }, (_, i) => {
    const t = (state.project.mission.years * i) / 5;
    return `<text x="${x(t)}" y="${ht - 12}" text-anchor="middle">${fmt(t, 1)}년</text>`;
  }).join('');
  const lines = rs
    .map((r, i) =>
      r.missionDose === null
        ? ''
        : `<path d="M ${x(0)} ${y(0)} L ${x(state.project.mission.years)} ${y(r.missionDose)}" stroke="${colors[i]}" stroke-width="${ORBITS[i].id === state.project.mission.orbitId ? 3.5 : 2}" fill="none"/><circle cx="${x(state.project.mission.years)}" cy="${y(r.missionDose)}" r="4" fill="${colors[i]}"/>`,
    )
    .join('');
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${w} ${ht}" role="img" aria-label="임무기간에 비례한 궤도별 누적선량 비교. 정확한 값은 아래 비교표에 있습니다."><text x="${left}" y="12" class="axis-title">krad(Si)</text>${grid}${xs}${limit === null ? '' : `<line x1="${left}" x2="${w - right}" y1="${y(limit)}" y2="${y(limit)}" stroke="#bf8235" stroke-dasharray="6 4"/><text x="${left + 12}" y="${Math.max(18, y(limit) - 8)}" style="fill:#946428">부품 TID ÷ 여유계수</text>`}${lines}</svg></div><p class="chart-caption">연간 평균 선량을 임무기간에 비례 적용한 비교입니다. 태양활동의 시간 변화는 계산하지 않습니다.</p>`;
}
export function orbitRows() {
  return ORBITS.map(o => {
    const r = evaluate(state.project, state.project.selectedPartId, o.id);
    return `<tr class="${o.id === state.project.mission.orbitId ? 'selected' : ''}"><td><button class="btn quiet" data-orbit="${o.id}" aria-label="${h(o.label)} 선택" style="padding:0;min-height:32px">${h(o.label)}${o.id === state.project.mission.orbitId ? '<span class="selected-tag">선택</span>' : ''}</button><span class="secondary">${h(o.name)}</span></td><td class="number">${fmt(r.missionDose)}</td><td class="number">${fmt(r.requiredDose)}</td><td class="number">${fmt(r.tidRatio)}${r.tidRatio === null ? '' : ' ×'}</td><td class="number">${fmt(r.soft?.rawPerDay)}</td><td>${badge(r.synthetic ? '예시' : r.dose ? '입력자료' : '자료 부족', r.synthetic ? 'amber' : r.dose ? 'blue' : '')}</td></tr>`;
  });
}
export function overview(r) {
  const part = r.part;
  return `<div class="metrics">${metric('임무 누적선량', fmt(r.missionDose), r.missionDose === null ? '' : 'krad(Si)', `${state.project.mission.years}년 · ${state.project.mission.shieldMm} mm Al 등가`)}${metric('TID 수치 여유', fmt(r.tidRatio), r.tidRatio === null ? '' : '배', '부품 TID / 여유계수 적용 요구량', r.tidRatio !== null && r.tidRatio < 1 ? 'text-red' : '')}${metric('원시 비트 오류', fmt(r.soft?.rawPerDay), r.soft ? '회/일' : '', `논리 장비 1대 · 소자 ${state.project.mission.devicesPerBoard}개 기준`)}${metric('제작·검증 비용', won(r.cost.total), r.cost.total === null ? '' : '원', `예비품 포함 장비 ${fmt(r.cost.boards, 0)}대 · 가정 비용`)}</div><div class="grid-two">${card('누적선량 비교', doseChart(), `<div class="legend"><span><i class="swatch" style="background:#7a60af"></i>500 km</span><span><i class="swatch"></i>888 km</span><span><i class="swatch" style="background:#4772c6"></i>1,280 km</span></div>`)}${card('평가 중인 반도체', `<div class="card-body"><div class="pill-row">${badge(part.grade)}${badge(BASIS_LABELS[part.tidBasis], part.tidBasis === 'synthetic' ? 'amber' : 'blue')}</div>${partPicker()}<p class="part-description">${h(part.vendor)} · ${fmt(part.densityBits / 1048576)} Mibit</p>${kv('TID 근거', `${fmt(part.tidKrad)} krad(Si)`)}${kv('보호설계', h(modeLabel[state.project.protection.mode]))}${kv('추가 확인 항목', `${r.reasons.length}개`)}<div class="spaced">${btn('부품 자료 검토', 'go-parts', 'arrow')}</div></div>`)}</div><div class="spaced">${card('같은 부품, 세 가지 임무환경', table(['궤도', '누적선량<br>krad(Si)', '요구선량<br>krad(Si)', 'TID 여유', '원시 오류<br>회/일', '환경 근거'], orbitRows(), 'TID 여유가 1배 이상이어도 SEE·구매 로트·동작조건을 별도 검증해야 합니다. 오류 횟수는 위성 고장확률이 아닙니다.'))}</div><div class="grid-equal">${card('검증이 필요한 근거', `<div class="card-body"><div class="pill-row">${r.reasons.length ? r.reasons.map(x => badge(x, 'amber')).join('') : badge('입력 항목 확보 · 내용 검토 필요', 'blue')}</div><p class="input-note">${h(part.notes)}</p><div class="spaced">${btn('검증계획 보기', 'go-verification', 'arrow')}</div></div>`)}${card('현재 분석조건', `<div class="card-body">${kv('환경 모델', h(r.dose?.model || '자료 부족'))}${kv('시기·태양활동', h(r.dose?.epoch || '자료 부족'))}${kv('환경 출처', sourceLink(r.dose?.source || '자료 부족'))}${kv('부품 출처', sourceLink(part.tidSource))}</div>`)}</div>`;
}
export function partsPage(r) {
  const rows = state.project.parts.map(p => {
    const ev = evaluate(state.project, p.id);
    return `<tr class="${p.id === state.project.selectedPartId ? 'selected' : ''}"><td><button class="btn quiet" data-part="${h(p.id)}" style="padding:0;text-align:left;white-space:normal">${h(p.name)}</button><span class="secondary">${h(p.vendor)} · ${h(p.id)}</span></td><td>${h(p.grade)}</td><td class="number">${fmt(p.densityBits / 1048576)}</td><td class="number">${fmt(p.tidKrad)}</td><td>${badge(BASIS_LABELS[p.tidBasis], p.tidBasis === 'synthetic' ? 'amber' : 'blue')}</td><td>${ev.soft ? badge('입력 있음', 'blue') : badge('자료 부족')}</td></tr>`;
  });
  return `${card(`부품 라이브러리 <span class="count">${state.project.parts.length}</span>`, table(['부품', '분류', 'Mibit', 'TID<br>krad(Si)', 'TID 근거', '목표궤도 SEU'], rows, '공개 제품 사양 3종과 합성 부품 3종을 포함합니다. 공개 사양은 구매 로트 시험성적서와 구분합니다.'), btn('사용자 부품 추가', 'add-part', 'plus'))}<div class="grid-equal">${card(
    h(r.part.name),
    `<div class="card-body"><div class="field-grid">${partInput('name', '부품명', { type: 'text' })}${partInput('vendor', '제조사', { type: 'text' })}${partInput('densityBits', '메모리 비트 수', { min: 1, step: 1, help: '16 Mibit = 16,777,216 bit' })}${partInput('tidKrad', 'TID 근거값 (krad(Si))', { nullable: true, min: 0, help: '미확보 시 비워두세요' })}${partInput('lot', '제조 로트·리비전', { type: 'text' })}<label><span>TID 근거 유형</span><select data-part-basis="true">${Object.entries(
      BASIS_LABELS,
    )
      .map(
        ([v, n]) => `<option value="${v}" ${r.part.tidBasis === v ? 'selected' : ''}>${n}</option>`,
      )
      .join(
        '',
      )}</select></label><div class="full">${partInput('tidSource', 'TID 자료 제목 또는 URL', { type: 'text' })}</div><label class="full"><span>시험조건·판정기준·제한사항</span><textarea data-path="part.notes">${h(r.part.notes)}</textarea></label></div><p class="input-note">TID 값·용량·출처를 수정하면 근거 유형이 ‘사용자 자료’로 전환됩니다. 원래 출처와 변경 내용을 함께 기록하세요.</p></div>`,
    `<div class="button-row">${btn('복제', 'clone-part', 'plus')}${btn('삭제', 'delete-part', '', 'danger')}</div>`,
  )}${card('자료 해석', `<div class="card-body explain"><p><strong>제조사 사양</strong>은 제품군의 공개 성능입니다. 선량률·바이어스·온도·어닐링·실패 기준과 구매 등급을 확인해야 합니다.</p><p><strong>SEU</strong>는 목표궤도와 차폐 조건에 해당하는 부품별 원시 비트 오류율이 있어야 계산합니다. 내장 EDAC 적용 후 오류율은 V1.0 보호모델에 다시 넣지 않습니다.</p><p><strong>SEL 시험 LET</strong> 하나로 SEU 곡선이나 모든 임무의 내성을 추정하지 않습니다. 미관측 시험의 입자 플루언스와 동작조건을 확인하세요.</p><p class="spaced">${sourceLink(r.part.tidSource)}</p><div class="spaced">${btn('환경·오류율 자료 입력', 'go-data', 'arrow')}</div></div>`)}</div>`;
}
export function protectionPage(r) {
  const p = state.project.protection;
  const alternatives = ['none', 'ecc', 'tmr'].map(mode => {
    const pr = structuredClone(state.project);
    pr.protection.mode = mode;
    return { mode, r: evaluate(pr) };
  });
  const max = Math.max(...alternatives.map(a => a.r.soft?.uncorrectablePerDay || 0), 1e-15);
  const bars = alternatives
    .map(
      a =>
        `<div class="bar-row"><span>${h(modeLabel[a.mode])}</span><div class="bar"><i style="width:${Math.min(100, ((a.r.soft?.uncorrectablePerDay || 0) / max) * 100)}%;background:${a.mode === p.mode ? '#087f76' : '#98b8c6'}"></i></div><b>${fmt(a.r.soft?.uncorrectablePerDay)}</b></div>`,
    )
    .join('');
  return `<div class="grid-equal" style="margin-top:0">${card('보호설계 가정', `<div class="card-body">${partPicker()}<div class="segmented" aria-label="보호설계 선택">${['none', 'ecc', 'tmr'].map(mode => `<button data-mode="${mode}" class="${p.mode === mode ? 'active' : ''}" aria-pressed="${p.mode === mode}">${mode === 'none' ? '보호 없음' : mode === 'ecc' ? 'ECC' : 'TMR'}</button>`).join('')}</div><div class="field-grid spaced">${input('mission.devicesPerBoard', '장비당 소자 수', { min: 1, step: 1 })}${input('protection.wordBits', '보호 워드 길이 (bit)', { min: 8, max: 4096, step: 1 })}${input('protection.scrubSec', '점검·복구 주기 (초)', { min: 0.01, max: 86400 })}${input('protection.recoverySec', '기능 복구시간 (초)', { min: 0, max: 86400 })}${input('protection.mbuFraction', 'ECC: 동시 다중비트 비율 (%)', { value: p.mbuFraction * 100, percent: true, min: 0, max: 100, help: '같은 워드 내 2-bit 사건 가정' })}${input('protection.commonFraction', 'TMR: 공통원인 비율 (%)', { value: p.commonFraction * 100, percent: true, min: 0, max: 100 })}${input('protection.functionalFraction', '잔존 오류의 기능 영향 (%)', { value: p.functionalFraction * 100, percent: true, min: 0, max: 100 })}${input('protection.coverage', '기능 오류 검출·복구 성공 (%)', { value: p.coverage * 100, percent: true, min: 0, max: 100 })}</div><p class="input-note">보호효과·기능 영향·성공률은 사용자가 검증해야 하는 설계 가정입니다.</p></div>`)}${card('보호 후 잔존 사건 비교', `<div class="card-body"><p class="text-muted small">논리 장비 1대 · 사건/일 · 선형 축</p>${r.soft ? bars : '<div class="empty"><strong>원시 비트 오류율이 필요합니다</strong>부품·궤도에 맞는 raw SEU 자료를 입력하세요.</div>'}${kv('선택 설계 원시 비트 오류', `${fmt(r.soft?.physicalRawPerDay)} 회/일`)}${kv('보호 후 잔존 사건', `${fmt(r.soft?.uncorrectablePerDay)} 회/일`)}${kv('모델상 복구 중단시간', `${fmt(r.downtime, 5)} 초/일`)}${kv('미복구 기능 사건', `${fmt(r.unhandled)} 회/일`)}${kv('장비 소비전력', `${fmt(r.cost.powerW)} W`)}<p class="input-note">복구 중단시간은 검출·복구 가능한 SEU와 입력된 SEFI만 반영합니다. SEL·영구고장·부품 수명·위성망 가용도는 포함하지 않습니다.</p></div>`)}</div><div class="spaced">${card('계산에 적용한 가정', `<div class="card-body explain"><p><strong>ECC:</strong> 독립 오류가 동일 워드·주기 안에 2회 이상 쌓이는 확률과, 같은 워드의 동시 2-bit 사건을 합산합니다. 주기마다 워드가 정상화된다고 가정합니다. 오류 위치의 실제 상관관계·인터리빙 효과는 시험자료로 보완해야 합니다.</p><p><strong>TMR:</strong> 3개 복제본 중 2개 이상에 오류가 생기는 경우를 계산하고 공통원인 사건을 더합니다. 투표기는 이상적이며, 주기마다 재동기화된다고 가정합니다. 소자 수·전력·반도체 구매비는 3배 구성을 반영합니다.</p><p><strong>기능 복구:</strong> 비트 오류, 잔존 사건, 기능 중단을 구분합니다. 정상화 실패와 파괴성 고장은 중단시간 그래프에 숨겨 합산하지 않습니다.</p></div>`)}</div>`;
}
export const EVENT_TYPES = { seu: 'SEU', sel: 'SEL', sefi: 'SEFI' };
export function verificationPage(r) {
  const tasks = verificationTasks(r, state.project),
    done = tasks.filter(t => t.status === '완료').length;
  const bounds = Object.fromEntries(
    Object.keys(EVENT_TYPES).map(k => [
      k,
      state.project.flight.events[k] === 0
        ? zeroEventUpperRate(state.project.flight.months, state.project.flight.devices)
        : null,
    ]),
  );
  const zeroTypes = Object.keys(EVENT_TYPES).filter(k => state.project.flight.events[k] === 0);
  const flightDose = evaluate(state.project, state.project.selectedPartId, 'sso500').dose
    ?.annualTidKrad;
  const flightTotal =
    flightDose === undefined || flightDose === null
      ? null
      : (flightDose * state.project.flight.months) / 12;
  const rows = ORBITS.slice(1).map(o => {
    const ev = evaluate(state.project, state.project.selectedPartId, o.id);
    return `<tr><td>${h(o.label)}</td><td class="number">${fmt(flightTotal)}</td><td class="number">${fmt(ev.missionDose)}</td><td>${badge('추가 환경·효과 검증', 'amber')}</td></tr>`;
  });
  const eventRows = Object.entries(EVENT_TYPES).map(
    ([k, label]) =>
      `<tr><td>${label}</td><td class="number">${fmt(state.project.flight.events[k], 0)}</td><td class="number">${bounds[k] === null ? '—' : fmt(bounds[k])}</td></tr>`,
  );
  return `<div class="metrics">${metric('검증 작업', tasks.length, '항목', '환경·TID·SEE·복구·추적성')}${metric('진행상태 완료', done, '항목', '완료 표시는 담당자 기록이며 승인 아님')}${metric('관측 소자·기간', `${state.project.flight.devices} × ${state.project.flight.months}`, '개·월', 'Space-MaCS 비교 시나리오')}${metric('미관측 사건유형', `${zeroTypes.length} / 3`, '유형', zeroTypes.length ? zeroTypes.map(k => EVENT_TYPES[k]).join('·') + ' 0건 관측' : '전 유형 사건 관측됨')}</div>${card('시제기·양산 적용 검증계획', `<div class="tasks">${tasks.map(t => `<div class="task">${badge(t.category, t.priority === '높음' ? 'amber' : '')}<div><h3>${h(t.title)}</h3><p>${h(t.detail)}</p></div><label><span class="sr-only">${h(t.title)} 진행상태</span><select data-task="${t.id}">${['계획', '진행', '완료'].map(s => `<option ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>`).join('')}</div>`, btn('계획 CSV', 'tasks', 'download'))}<div class="grid-equal">${card('Space-MaCS 관측조건', `<div class="card-body"><div class="field-grid">${input('flight.months', '관측기간 (개월)', { min: 0.01, max: 120 })}${input('flight.devices', '관측 소자 수', { min: 1, step: 1 })}${input('flight.events.seu', 'SEU 관측 사건 수', { min: 0, step: 1 })}${input('flight.events.sel', 'SEL 관측 사건 수', { min: 0, step: 1 })}${input('flight.events.sefi', 'SEFI 관측 사건 수', { min: 0, step: 1 })}</div>${table(['사건유형', '관측 사건', '0건 시 95% 상한<br>회/소자·일'], eventRows)}<p class="input-note">사건유형별로 분리해 기록합니다. 완전 검출·일정 사건율의 포아송 모형을 가정합니다. 사건이 1건 이상인 유형은 0건 상한을 표시하지 않습니다.</p><div class="spaced">${notice('0건 관측은 고장률 0 또는 면역성을 의미하지 않습니다. 산출한 상한은 같은 관측환경의 값이며, 목표궤도에 직접 전용할 수 없습니다.', 'info')}</div></div>`)}${card('목표 임무와 검증 범위 비교', table(['목표 궤도', '500 km 검증 선량<br>krad(Si)', '목표 임무 선량<br>krad(Si)', '검토'], rows, '500 km SSO의 경사각은 97.4° 가정입니다. 동일 선량만으로 입자 에너지·SEE·열조건의 동등성이 성립하지 않습니다.'))}</div>`;
}
export function costPage(r) {
  const rows = state.project.parts.map(p => {
    const ev = evaluate(state.project, p.id);
    return `<tr class="${p.id === state.project.selectedPartId ? 'selected' : ''}"><td>${h(p.name)}<span class="secondary">${h(p.grade)}</span></td><td class="number">${p.unitCostKrw === null ? '견적 필요' : `${fmt(p.unitCostKrw, 0)}원`}</td><td class="number">${fmt(ev.cost.bom, 0)}</td><td class="number">${won(ev.cost.total)}${ev.cost.total === null ? '' : '원'}</td><td class="number">${fmt(ev.cost.powerW)}</td><td>${badge(p.tidBasis === 'synthetic' ? '예시 단가' : p.unitCostKrw === null ? '견적 필요' : '사용자 입력', p.tidBasis === 'synthetic' ? 'amber' : '')}</td></tr>`;
  });
  return `<div class="metrics">${metric('분석 위성 수', fmt(state.project.mission.satellites, 0), '기', '제작 물량 비교 입력')}${metric('예비품 포함 장비', fmt(r.cost.boards, 0), '대', `예비품 ${state.project.cost.sparesPercent}%`)}${metric('반복 제작비', won(r.cost.recurring), r.cost.recurring === null ? '' : '원', '소자·선별·보호·차폐 합산')}${metric('비반복 시험·개발비', won(r.cost.nre), '원', '설계·방사선 검증 가정')}</div><div class="grid-equal">${card('물량·부품 단가', `<div class="card-body">${partPicker()}<div class="field-grid">${input('mission.satellites', '위성 수 (기)', { min: 1, step: 1 })}${input('mission.boardsPerSatellite', '위성당 장비 수 (대)', { min: 1, step: 1 })}${input('mission.devicesPerBoard', '장비당 논리 소자 수 (개)', { min: 1, step: 1 })}${input('cost.sparesPercent', '예비품 비율 (%)', { min: 0, max: 200 })}${partInput('unitCostKrw', '소자 단가 (원)', { min: 0, nullable: true, help: '공개 가격 미확보 시 견적 입력' })}${partInput('powerW', '소자 동작전력 (W)', { min: 0, nullable: true })}</div><p class="input-note">보호설계는 ${h(modeLabel[state.project.protection.mode])}. TMR 선택 시 논리 소자당 실제 소자 3개를 반영합니다. 가상 부품 가격은 예시입니다.</p></div>`)}${card('보호·시험·개발비 가정', `<div class="card-body"><div class="field-grid">${input('cost.protectionPerBoard', '장비당 보호설계 제작비 (원)', { min: 0 })}${input('cost.shieldPerBoard', '장비당 차폐 제작비 (원)', { min: 0 })}${input('cost.screeningPerDevice', '소자당 선별시험비 (원)', { min: 0 })}${input('cost.protectionPowerW', '보호설계 추가전력 (W)', { min: 0 })}${input('cost.qualificationNre', '방사선·인증 시험비 (원)', { min: 0 })}${input('cost.engineeringNre', '설계·소프트웨어 개발비 (원)', { min: 0 })}</div><p class="input-note">실제 견적·공정자료로 갱신하세요. 차폐 두께 변경은 비용·질량을 자동 추정하지 않습니다. 본 비교에는 발사·운용·교체비가 포함되지 않습니다.</p></div>`)}</div><div class="spaced">${card('동일 물량·보호설계의 부품 대안', table(['부품', '소자 단가', '장비 1대 제작비<br>원', '총 제작·검증비', '장비 전력<br>W', '비용 근거'], rows, '실제 부품의 가격·동작전력이 없으면 합계를 산출하지 않습니다. 비용만으로 적용 가능 여부를 판정하지 않습니다.'))}</div>`;
}
export function envEditor(r) {
  const rate = r.rate,
    dose = r.dose;
  return `<form id="env-editor"><div class="field-grid"><label><span>연간 TID (krad(Si)/년)</span><input name="dose" type="number" min="0" step="any" value="${h(dose?.annualTidKrad ?? '')}" placeholder="자료 없으면 비움"></label><label><span>원시 SEU (회/bit/일)</span><input name="seu" type="number" min="0" step="any" value="${h(rate?.seuPerBitDay ?? '')}" placeholder="자료 없으면 비움"></label><label><span>SEFI (회/소자/일)</span><input name="sefi" type="number" min="0" step="any" value="${h(rate?.sefiPerDeviceDay ?? '')}"></label><label><span>SEL (회/소자/일)</span><input name="sel" type="number" min="0" step="any" value="${h(rate?.selPerDeviceDay ?? '')}"></label><label><span>근거 유형</span><select name="basis"><option value="synthetic" ${dose?.basis === 'synthetic' ? 'selected' : ''}>예시·가정</option><option value="user" ${dose?.basis === 'user' ? 'selected' : ''}>사용자 해석자료</option><option value="test" ${dose?.basis === 'test' ? 'selected' : ''}>시험자료와 연결된 해석</option></select></label><label><span>오류율 기준</span><select name="rateKind"><option value="raw" ${rate?.rateKind !== 'effective' ? 'selected' : ''}>원시 비트 오류율 (raw)</option><option value="effective" ${rate?.rateKind === 'effective' ? 'selected' : ''}>보호 후 출력율 (effective)</option></select></label><label class="full"><span>자료 제목·파일명·URL</span><input name="source" required value="${h(dose?.source || '')}"></label><label><span>환경 모델·차폐 형상</span><input name="model" required value="${h(dose?.model || '')}"></label><label><span>분석기간·태양활동 조건</span><input name="epoch" required value="${h(dose?.epoch || '')}"></label></div><div class="spaced"><button class="btn primary" type="submit">선택 조건에 적용</button></div><p class="input-note">${h(ORBITS.find(o => o.id === state.project.mission.orbitId).label)} · ${state.project.mission.shieldMm} mm · ${h(r.part.name)}에 적용합니다. 선량은 같은 환경의 모든 부품에 공유됩니다. 고도·차폐 사이 보간은 하지 않습니다.</p></form>`;
}
export function dataPage(r) {
  return `<div class="grid-equal" style="margin-top:0">${card('선택 조건의 환경·오류율 입력', `<div class="card-body">${partPicker()}${envEditor(r)}</div>`)}<div class="stack">${card('분석자료 가져오기·저장', `<div class="card-body"><p class="explain">시나리오 JSON에는 임무·부품·환경·보호설계·비용·검증 상태와 설계 실험의 비트 상태·난수 시드가 저장됩니다. 반복 실험 결과는 같은 설정으로 다시 실행해 재현합니다. 가져온 자료는 이 브라우저에서 계산하며 서버로 업로드하지 않습니다.</p><div class="download-box"><p><strong>환경·오류율 CSV</strong><br>SPENVIS 원본 전체를 직접 읽는 형식이 아닙니다. 외부 해석 결과를 정규화 양식의 단위에 맞춰 정리하세요.</p><div class="button-row">${btn('빈 양식', 'template', 'download')}${btn('현재 환경 CSV', 'environment', 'download')}${btn('CSV 가져오기', 'import-env', 'upload', 'primary')}</div></div><p class="small text-muted">CSV 가져오기는 전체 환경자료를 교체합니다. 변경 전 시나리오 JSON을 저장할 수 있습니다. 빈 수치는 ‘미확보’, 0은 실제 0으로 처리합니다.</p><div class="button-row spaced">${btn('JSON 저장', 'save', 'download')}${btn('JSON 불러오기', 'load', 'upload')}${btn('예시 시나리오 복원', 'reset')}</div></div>`)}${card('자료 현황', `<div class="card-body">${kv('부품 자료', `${state.project.parts.length}개`)}${kv('환경·부품 조건', `${state.project.environments.length}행`)}${kv('현재 시나리오', h(state.project.title))}<div class="spaced">${input('title', '시나리오 이름', { type: 'text' })}</div></div>`)}</div></div><div class="grid-equal">${card('계산방법과 적용 범위', `<div class="card-body"><details class="method" open><summary>선량과 TID 여유</summary><div class="explain"><p>일치하는 고도·경사각·차폐의 연간 평균 선량만 사용합니다. 임무 선량 = 연간 선량 × 수명, 요구선량 = 임무 선량 × 설계 여유계수입니다. TID 수치 여유 = 부품 TID 근거값 / 요구선량입니다.</p><p>방사선 수송·태양활동 시계열을 자체 계산하지 않습니다. 차폐를 두껍게 했을 때의 효과는 해당 조건의 외부 자료가 있어야 비교합니다. 초기 합성 수치에는 물리적 예측 의미가 없습니다.</p></div></details><details class="method"><summary>메모리 오류·보호 모델</summary><div class="explain"><p>외부 계산된 per-bit-day 원시 SEU율에 소자 용량과 장비당 소자 수를 곱합니다. 양성자/중이온 단면적의 스펙트럼 적분은 SPENVIS 등 외부 도구에서 수행한 결과를 사용합니다.</p><p>ECC는 포아송 동일 워드 다중오류 확률과 동시 2-bit 사건을 합산합니다. TMR은 독립 복제본의 다수결 실패와 공통원인 항을 사용합니다. 모든 보호 워드가 점검주기마다 정상화된다고 가정합니다.</p><p>재시작 중단시간은 검출·복구 성공 사건의 포아송 점유모형입니다. 기능 영향 비율·복구 성공률은 사용자가 검증해야 합니다. SEE 전체의 신뢰도나 위성 고장확률을 계산하지 않습니다.</p></div></details><details class="method"><summary>0건 관측·95% 사건율 상한</summary><div class="explain"><p>0건 관측의 단측 95% 상한 = −ln(0.05) / (관측 소자 수 × 관측일수). 일정 사건율, 소자 간 독립성과 완전 검출을 가정합니다. 같은 관측환경에만 적용되며 다른 궤도에 직접 전용하지 않습니다.</p></div></details><details class="method"><summary>설계 실험과 예비평가의 범위</summary><div class="explain"><p>64비트 SECDED·TMR 설계 실험과 메모리 적용성 예비평가 도구입니다. 트랜지스터 TCAD, 열해석, DDD 수명모델, FPGA 전체 상태 해석, 임무 인증, 위성망 운용 가용도는 포함하지 않습니다. DDD·SEB·SEGR 등은 검증 공백으로 별도 평가해야 합니다.</p><p>시나리오 저장본에는 모든 입력자료가 포함됩니다. 이 페이지를 새로고침하면 저장하지 않은 입력은 예시 시나리오로 초기화됩니다.</p></div></details></div>`)}${card('방법론·제품 사양 출처', `<div class="card-body"><ul class="source-list">${SOURCES.map(s => `<li><a href="${h(s.url)}" target="_blank" rel="noopener noreferrer">${h(s.name)} ↗</a><p>${h(s.note)}</p></li>`).join('')}</ul><p class="input-note">제품 자료 확인 기준: 2026-09-06. 조건·등급·개정판과 구매 로트는 적용 전에 재확인하세요.</p></div>`)}</div>`;
}
