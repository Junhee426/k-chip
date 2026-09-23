import { ORBITS, createProject } from './data.js';
import {
  CSV_COLUMNS,
  environmentCsv,
  evaluate,
  importEnvironmentCsv,
  removePart,
  toCsv,
  validateProject,
  verificationTasks,
} from './model.js';
import {
  createLab,
  flipBit,
  injectPreset,
  inspectLab,
  resetMemory,
  runCampaign,
  scrubMemory,
  validateLab,
} from './fault-lab.js';
import { labPage } from './lab-view.js';
import { selected, state } from './state.js';
import { badge, btn, card, fmt, h, icon, metric, notice, table } from './ui.js';
import { download, notify } from './dom.js';
import { controls, evidenceNotice } from './forms.js';
import {
  costPage,
  dataPage,
  overview,
  pages,
  partsPage,
  protectionPage,
  verificationPage,
} from './pages.js';
import { labCsv, printLabReport, printReport, resultCsv, saveProject } from './reports.js';

const app = document.querySelector('#app');
// render() replaces #app wholesale, so remember which control had focus (by its
// data-* identity and position among same-identity controls) and put it back.
const FOCUS_KEYS = [
  'path',
  'labConfig',
  'task',
  'partBasis',
  'labView',
  'labBit',
  'page',
  'orbit',
  'part',
  'mode',
  'action',
];
function focusState() {
  const el = document.activeElement;
  if (!el || el === app || !app.contains(el)) return null;
  const key = FOCUS_KEYS.find(k => el.dataset[k] !== undefined);
  const attrs = key ? Object.entries(el.dataset) : el.name ? [['name', el.name]] : null;
  if (!attrs) return null;
  const selector =
    el.tagName.toLowerCase() +
    attrs
      .map(([k, v]) =>
        k === 'name'
          ? `[name="${CSS.escape(v)}"]`
          : `[data-${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${CSS.escape(v)}"]`,
      )
      .join('');
  let range = null;
  try {
    if (typeof el.selectionStart === 'number') range = [el.selectionStart, el.selectionEnd];
  } catch {}
  return {
    selector,
    index: [...app.querySelectorAll(selector)].indexOf(el),
    range,
  };
}
function restoreFocus(state) {
  if (!state) return;
  const el = app.querySelectorAll(state.selector)[state.index];
  if (!el) return;
  el.focus({ preventScroll: true });
  if (state.range)
    try {
      el.setSelectionRange(...state.range);
    } catch {}
}
function render() {
  state.project.lab ??= createLab();
  validateProject(state.project);
  const r = evaluate(state.project),
    p = pages[state.page];
  const focus = focusState();
  app.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand">${icon('chip')}<div><strong>K-LEO <span style="color:#5be3b6">CHIP</span></strong><small>SPACE ELECTRONICS LAB</small></div></div><div class="nav-caption">분석 워크스페이스</div><nav class="nav" aria-label="분석 메뉴">${Object.entries(
    pages,
  )
    .map(
      ([id, x]) =>
        `<button type="button" data-page="${id}" class="${id === state.page ? 'active' : ''}" ${id === state.page ? 'aria-current="page"' : ''}>${icon(x[3])}${x[0]}</button>`,
    )
    .join(
      '',
    )}</nav><div class="side-bottom"><p>궤도 조건부터<br>반도체 적용·검증까지</p><span class="version">V1.1.0 · DESIGN LAB</span></div></aside><div class="main-wrap"><header class="topbar"><div class="crumb">K-LEO / <strong>우주반도체 적용성</strong></div><div class="top-actions">${btn('불러오기', 'load', 'upload')}${btn('시나리오 저장', 'save', 'download')}${btn('보고서 인쇄', 'print', 'print')}</div></header><main class="main" id="main"><div class="page-heading"><div><p class="eyebrow">${p[1]}</p><h1>${p[0]}</h1><p class="subheading">${p[2]}</p></div>${state.page === 'lab' ? (state.campaign ? btn('실험 CSV', 'lab-csv', 'download') : btn('궤도별 분석', 'go-overview', 'arrow')) : btn('결과 CSV', 'results', 'download')}</div>${state.page === 'lab' ? '' : controls() + evidenceNotice(r)}${{ lab: () => labPage(state.project.lab, state.campaign, { card, btn, badge, table, fmt, h, notice, metric }), overview: overview, parts: partsPage, protection: protectionPage, verification: verificationPage, cost: costPage, data: dataPage }[state.page](r)}<footer class="footer"><span>K-LEO CHIP · ${h(state.project.title)}</span><span>메모리 설계·적용성 · <a href="./kleo-chip-v1.1.0-source.zip" download>소스 코드 다운로드</a></span></footer></main></div></div>`;
  restoreFocus(focus);
}
function update(fn) {
  const draft = structuredClone(state.project);
  fn(draft);
  validateProject(draft);
  state.project = draft;
  render();
}
app.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  try {
    if (b.dataset.labView) {
      update(p => (p.lab.view = b.dataset.labView));
      app.querySelector(`[data-lab-view="${b.dataset.labView}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (b.dataset.labBit !== undefined) {
      update(
        p =>
          (p.lab = flipBit(
            p.lab,
            b.dataset.bank,
            Number(b.dataset.labBit),
            Number(b.dataset.copy),
          )),
      );
      app
        .querySelector(
          `[data-lab-bit="${b.dataset.labBit}"][data-bank="${b.dataset.bank}"][data-copy="${b.dataset.copy}"]`,
        )
        ?.focus({ preventScroll: true });
      return;
    }
    if (b.dataset.page) {
      state.page = b.dataset.page;
      render();
      window.scrollTo({ top: 0 });
      return;
    }
    if (b.dataset.orbit) {
      update(p => (p.mission.orbitId = b.dataset.orbit));
      return;
    }
    if (b.dataset.part) {
      update(p => (p.selectedPartId = b.dataset.part));
      return;
    }
    if (b.dataset.mode) {
      update(p => (p.protection.mode = b.dataset.mode));
      return;
    }
    const a = b.dataset.action;
    if (!a) return;
    if (a.startsWith('go-')) {
      state.page = a.slice(3);
      render();
      window.scrollTo({ top: 0 });
      return;
    }
    if (['lab-single', 'lab-double', 'lab-common', 'lab-triple'].includes(a)) {
      update(p => (p.lab = injectPreset(p.lab, a.slice(4))));
      return;
    }
    if (a === 'lab-clear') {
      update(p => (p.lab = resetMemory(p.lab)));
      return;
    }
    if (a === 'lab-scrub') {
      const before = inspectLab(state.project.lab)[state.project.lab.view];
      update(p => (p.lab = scrubMemory(p.lab)));
      notify(
        state.project.lab.view === 'ecc' && before.flag === 'uncorrectable'
          ? '정정 불가 신호: 저장값을 덮어쓰지 않았습니다.'
          : inspectLab(state.project.lab)[state.project.lab.view].mismatch
            ? '회로 계산값을 썼지만 원본과 다른 데이터가 남아 있습니다.'
            : '회로가 계산한 정상값으로 저장 비트를 복구했습니다.',
      );
      return;
    }
    if (a === 'lab-run') {
      state.campaign = runCampaign(state.project.lab);
      render();
      notify('반복 오류 주입 실험을 완료했습니다.');
      return;
    }
    if (a === 'lab-csv') {
      labCsv();
      return;
    }
    if (a === 'save') saveProject();
    if (a === 'load') document.querySelector('#project-file').click();
    if (a === 'results') resultCsv();
    if (a === 'environment')
      download(
        'kleo-chip-environment.csv',
        environmentCsv(state.project),
        'text/csv;charset=utf-8',
      );
    if (a === 'import-env') document.querySelector('#environment-file').click();
    if (a === 'template') {
      const rows = [
        CSV_COLUMNS,
        ...ORBITS.map(o => [
          o.id,
          o.altitudeKm,
          o.inclinationDeg,
          state.project.mission.shieldMm,
          '',
          state.project.selectedPartId,
          '',
          '',
          '',
          'user',
          '분석자료 제목 또는 URL',
          '환경 모델과 차폐 형상',
          '분석 시기와 태양활동',
          'raw',
        ]),
      ];
      download('kleo-chip-environment-template.csv', toCsv(rows), 'text/csv;charset=utf-8');
    }
    if (a === 'tasks') {
      const rows = [
        ['category', 'task', 'priority', 'status', 'details', 'part', 'orbit'],
        ...verificationTasks(evaluate(state.project), state.project).map(t => [
          t.category,
          t.title,
          t.priority,
          t.status,
          t.detail,
          selected().name,
          state.project.mission.orbitId,
        ]),
      ];
      download('kleo-chip-verification.csv', toCsv(rows), 'text/csv;charset=utf-8');
    }
    if (a === 'print') {
      if (state.page === 'lab') printLabReport();
      else printReport();
    }
    if (a === 'reset') {
      if (
        window.confirm('현재 입력을 예시 시나리오로 되돌릴까요? 저장하지 않은 변경은 없어집니다.')
      ) {
        state.project = createProject();
        state.campaign = null;
        render();
        notify('예시 시나리오로 복원했습니다.');
      }
    }
    if (a === 'delete-part') {
      const name = selected().name;
      if (window.confirm(`'${name}' 부품과 이 부품 전용 환경·오류율 자료를 삭제할까요?`)) {
        state.project = removePart(state.project, state.project.selectedPartId);
        render();
        notify('부품을 삭제했습니다.');
      }
    }
    if (a === 'add-part' || a === 'clone-part') {
      update(p => {
        const original = structuredClone(p.parts.find(x => x.id === p.selectedPartId));
        const id = 'user-' + crypto.randomUUID().slice(0, 8);
        const part =
          a === 'clone-part'
            ? {
                ...original,
                id,
                name: original.name + ' · 복사',
                tidBasis: 'user',
              }
            : {
                ...original,
                id,
                name: '사용자 메모리',
                vendor: '사용자 입력',
                grade: '미분류',
                tidKrad: null,
                tidBasis: 'user',
                tidSource: '미확보',
                source: '사용자 입력',
                notes: '시험조건·근거자료를 입력하세요.',
                lot: '미확인',
                unitCostKrw: null,
                powerW: null,
              };
        p.parts.push(part);
        p.selectedPartId = id;
      });
      notify('부품을 추가했습니다. 환경·오류율 자료는 별도로 연결하세요.');
    }
  } catch (error) {
    notify(error.message, true);
  }
});
// Chrome fires change after focus leaves the field but before it reaches the next
// one; handle it on the next task so render() can restore focus to the Tab target.
app.addEventListener('change', e => {
  const el = e.target;
  setTimeout(() => {
    try {
      if (el.dataset.labConfig) {
        const key = el.dataset.labConfig;
        if (!['pattern', 'trials', 'seed'].includes(key)) return;
        const value =
          key === 'pattern' ? el.value : el.value.trim() === '' ? NaN : Number(el.value);
        const next = structuredClone(state.project.lab);
        next[key] = value;
        validateLab(next);
        state.campaign = null;
        update(p => (p.lab = next));
        return;
      }
      if (el.dataset.task) {
        update(p => (p.taskStatus[el.dataset.task] = el.value));
        return;
      }
      if (el.dataset.partBasis) {
        update(p => (p.parts.find(x => x.id === p.selectedPartId).tidBasis = el.value));
        return;
      }
      if (!el.dataset.path) return;
      const path = el.dataset.path;
      let value =
        el.type === 'number'
          ? el.value === '' && el.dataset.nullable
            ? null
            : Number(el.value)
          : el.value;
      if (el.type === 'number' && el.value === '' && !el.dataset.nullable)
        throw Error('숫자 입력이 필요합니다.');
      if (el.dataset.percent) value /= 100;
      update(p => {
        const seg = path.split('.');
        let obj = p;
        if (seg[0] === 'part') {
          obj = p.parts.find(x => x.id === p.selectedPartId);
          seg.shift();
        }
        for (const k of seg.slice(0, -1)) obj = obj[k];
        obj[seg.at(-1)] = value;
        if (
          path.startsWith('part.') &&
          ['tidKrad', 'densityBits', 'tidSource'].includes(seg.at(-1))
        )
          obj.tidBasis = 'user';
      });
    } catch (error) {
      el.setAttribute('aria-invalid', 'true');
      notify(error.message, true);
    }
  });
});
app.addEventListener('submit', e => {
  if (e.target.id === 'lab-data-form') {
    e.preventDefault();
    try {
      const hex = new FormData(e.target).get('hex').trim();
      const next = resetMemory(state.project.lab, hex);
      state.campaign = null;
      update(p => (p.lab = next));
      notify('기준 데이터를 기록하고 메모리를 초기화했습니다.');
    } catch (error) {
      notify(error.message, true);
    }
    return;
  }
  if (e.target.id !== 'env-editor') return;
  e.preventDefault();
  try {
    const f = new FormData(e.target),
      num = k => (f.get(k).trim() === '' ? null : Number(f.get(k)));
    update(p => {
      const m = p.mission,
        o = ORBITS.find(x => x.id === m.orbitId),
        basis = f.get('basis'),
        dose = num('dose');
      const matched = x => x.orbitId === m.orbitId && Math.abs(x.shieldMm - m.shieldMm) < 1e-8;
      for (const row of p.environments.filter(matched)) {
        const changed =
          row.annualTidKrad !== dose ||
          row.basis !== basis ||
          row.source !== f.get('source') ||
          row.model !== f.get('model') ||
          row.epoch !== f.get('epoch');
        if (changed && row.partId !== p.selectedPartId) {
          row.seuPerBitDay = null;
          row.sefiPerDeviceDay = null;
          row.selPerDeviceDay = null;
          row.notes = '환경 조건 또는 근거 변경: 이 부품의 오류율 재해석 필요';
        }
        row.annualTidKrad = dose;
        row.basis = basis;
        row.source = f.get('source');
        row.model = f.get('model');
        row.epoch = f.get('epoch');
      }
      const row = {
        orbitId: o.id,
        altitudeKm: o.altitudeKm,
        inclinationDeg: o.inclinationDeg,
        shieldMm: m.shieldMm,
        annualTidKrad: dose,
        partId: p.selectedPartId,
        seuPerBitDay: num('seu'),
        sefiPerDeviceDay: num('sefi'),
        selPerDeviceDay: num('sel'),
        basis,
        source: f.get('source'),
        model: f.get('model'),
        epoch: f.get('epoch'),
        rateKind: f.get('rateKind'),
        notes: '선택 조건에서 직접 입력한 자료',
      };
      const i = p.environments.findIndex(x => matched(x) && x.partId === p.selectedPartId);
      if (i < 0) p.environments.push(row);
      else p.environments[i] = row;
    });
    notify('선택 조건의 환경·오류율을 적용했습니다.');
  } catch (error) {
    notify(error.message, true);
  }
});
document.querySelector('#project-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 4e6) throw Error('프로젝트는 4 MB 이하만 지원합니다.');
    const p = JSON.parse(await file.text());
    validateProject(p);
    p.lab ??= createLab();
    state.project = p;
    state.campaign = null;
    render();
    notify('시나리오와 모든 입력자료를 불러왔습니다.');
  } catch (error) {
    notify('불러오기 실패: ' + error.message, true);
  } finally {
    e.target.value = '';
  }
});
document.querySelector('#environment-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2e6) throw Error('CSV는 2 MB 이하만 지원합니다.');
    const next = importEnvironmentCsv(state.project, await file.text());
    if (window.confirm(`검증된 ${next.environments.length}행으로 전체 환경자료를 교체할까요?`)) {
      state.project = next;
      render();
      notify('환경자료를 교체했습니다. 일치하는 조건만 계산에 사용합니다.');
    }
  } catch (error) {
    notify('CSV 가져오기 실패: ' + error.message, true);
  } finally {
    e.target.value = '';
  }
});
try {
  render();
} catch (e) {
  app.innerHTML = `<main class="boot"><h1>분석 화면을 열 수 없습니다</h1><p>${h(e.message)}</p><p>페이지를 새로고침해 다시 시도해주세요.</p></main>`;
}
