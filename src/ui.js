export const h = v =>
  String(v ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const fmt = (v, d = 2) =>
  v === null || v === undefined
    ? '자료 부족'
    : v === Infinity
      ? '∞'
      : v !== 0 && Math.abs(v) < 0.001
        ? v.toExponential(2)
        : new Intl.NumberFormat('ko-KR', { maximumFractionDigits: d }).format(v);
export const won = v =>
  v === null
    ? '견적 필요'
    : v >= 1e8
      ? `${fmt(v / 1e8)}억`
      : v >= 1e4
        ? `${fmt(v / 1e4)}만`
        : fmt(v);
export const modeLabel = {
  none: '보호 없음',
  ecc: 'ECC + 스크러빙',
  tmr: 'TMR + 재동기화',
};
export const icons = {
  chip: 'M8 8h8v8H8zM9 3v5m6-5v5M9 16v5m6-5v5M3 9h5m-5 6h5m8-6h5m-5 6h5',
  chart: 'M4 4v16h17M8 15v-4m5 4V7m5 8v-6',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm-4 9 3 3 5-6',
  check: 'M9 5h11M9 12h11M9 19h11M3 5h1M3 12h1M3 19h1',
  cost: 'M4 5h16v14H4zM4 9h16M8 13h2m4 0h2M8 16h2m4 0h2',
  data: 'M5 3h10l4 4v14H5zM14 3v5h5M8 12h8m-8 4h8',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',
  info: 'M12 8h.01M12 11v5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  plus: 'M12 4v16M4 12h16',
  print: 'M7 8V3h10v5M6 17H3V9h18v8h-3M7 14h10v7H7z',
  book: 'M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3zM12 6v15',
};
export const icon = name =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name] || icons.chip}"/></svg>`;
export const badge = (text, type = '') => `<span class="badge ${type}">${h(text)}</span>`;
export const sourceLink = s =>
  /^https?:\/\//i.test(s)
    ? `<a href="${h(s)}" target="_blank" rel="noopener noreferrer">원문 자료 ↗</a>`
    : h(s);
export const btn = (text, action, ico = '', cls = '') =>
  `<button type="button" class="btn ${cls}" data-action="${action}">${ico ? icon(ico) : ''}${h(text)}</button>`;
export function card(title, body, extra = '', sub = '') {
  return `<section class="card"><div class="card-head"><div><h2>${title}</h2>${sub ? `<p class="card-sub">${sub}</p>` : ''}</div>${extra}</div>${body}</section>`;
}
export function metric(label, value, unit, foot, cls = '') {
  return `<div class="card metric"><div class="metric-label">${h(label)}</div><div class="metric-value ${cls}">${h(value)}${unit ? `<small>${h(unit)}</small>` : ''}</div><div class="metric-foot">${h(foot)}</div></div>`;
}
export function notice(text, type = '') {
  return `<div class="notice ${type}">${icon('info')}<p>${text}</p></div>`;
}
export function kv(label, value) {
  return `<div class="kv"><span>${h(label)}</span><b>${value}</b></div>`;
}
export function table(headers, rows, note = '') {
  return `<div class="table-wrap"><table><thead><tr>${headers.map(x => `<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>${note ? `<p class="table-note">${note}</p>` : ''}`;
}
