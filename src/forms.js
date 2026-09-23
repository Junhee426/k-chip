import { ORBITS } from './data.js';
import { selected, state } from './state.js';
import { h, notice } from './ui.js';

export const getPath = path => path.split('.').reduce((o, k) => o[k], state.project);
export function input(path, label, opts = {}) {
  const value = opts.value !== undefined ? opts.value : getPath(path);
  return `<label><span>${h(label)}</span><input data-path="${h(path)}" aria-label="${h(label)}" type="${opts.type || 'number'}" value="${h(value === null ? '' : value)}" ${opts.min !== undefined ? `min="${opts.min}"` : ''} ${opts.max !== undefined ? `max="${opts.max}"` : ''} step="${opts.step || 'any'}" ${opts.nullable ? 'data-nullable="true"' : ''} ${opts.percent ? 'data-percent="true"' : ''}>${opts.help ? `<small class="help">${h(opts.help)}</small>` : ''}</label>`;
}
export function partInput(key, label, opts = {}) {
  const p = selected();
  return input(`part.${key}`, label, {
    ...opts,
    value: opts.value !== undefined ? opts.value : p[key],
  });
}
export function selectPath(path, label, options) {
  return `<label><span>${h(label)}</span><select data-path="${h(path)}" data-string="true" aria-label="${h(label)}">${options.map(([value, text]) => `<option value="${h(value)}" ${getPath(path) === value ? 'selected' : ''}>${h(text)}</option>`).join('')}</select></label>`;
}
export function partPicker() {
  return `<select class="part-select" data-path="selectedPartId" data-string="true" aria-label="평가 부품 선택">${state.project.parts.map(p => `<option value="${h(p.id)}" ${p.id === state.project.selectedPartId ? 'selected' : ''}>${h(p.name)}</option>`).join('')}</select>`;
}
export function controls() {
  return `<section class="card controls" aria-label="공통 임무 조건">${selectPath(
    'mission.orbitId',
    '목표 궤도',
    ORBITS.map(o => [o.id, o.label]),
  )}${input('mission.years', '임무 수명 (년)', { min: 0.01, max: 50, step: 0.5 })}${input('mission.shieldMm', 'Al 등가 차폐 (mm)', { min: 0.01, max: 100, step: 0.5, help: '일치하는 차폐 자료만 사용' })}${input('mission.doseMargin', '선량 설계 여유계수', { min: 1, max: 20, step: 0.5 })}</section>`;
}
export function evidenceNotice(r) {
  if (r.synthetic)
    return notice(
      '<strong>예시 데이터로 분석 중</strong> 환경 수치와 가상 부품은 계산 흐름을 확인하기 위한 합성 자료입니다. 실제 궤도 예측·부품 선정에는 출처가 있는 환경·시험자료를 가져오세요.',
    );
  return notice(
    '<strong>입력자료 기반 예비 평가</strong> 수치 여유와 자료 공백을 함께 검토하세요. 최종 적용 판단에는 로트·동작조건·파괴성 효과의 근거가 필요합니다.',
    'info',
  );
}
