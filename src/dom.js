let toastTimer;
export function notify(msg, error = false) {
  const t = document.querySelector('#toast');
  clearTimeout(toastTimer);
  t.textContent = msg;
  t.hidden = false;
  t.className = error ? 'error' : '';
  toastTimer = setTimeout(() => (t.hidden = true), 5500);
}
export function download(name, body, type) {
  const blob = new Blob([body], { type }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
