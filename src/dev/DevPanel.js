/**
 * ES module dev panel — ?dev=1 or Vite dev.
 */
export function initDevPanel(hooks = {}) {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('dev') && !import.meta.env?.DEV) return null;

  const style = document.createElement('style');
  style.textContent = `
    #dev-panel { position:fixed; top:8px; right:8px; z-index:99999; font:12px system-ui,sans-serif; }
    #dev-panel .dev-toggle { background:#1e293b;color:#e2e8f0;border:1px solid #475569;padding:4px 10px;cursor:pointer;border-radius:4px; }
    #dev-panel .dev-body { margin-top:6px;background:rgba(15,23,42,.92);color:#e2e8f0;padding:8px;border-radius:6px;max-width:240px; }
    #dev-panel button { margin:2px;padding:4px 8px;font-size:11px;cursor:pointer; }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'dev-panel';
  root.innerHTML = `
    <button type="button" class="dev-toggle">DEV</button>
    <div class="dev-body" hidden>
      <div class="dev-info"></div>
      <div class="dev-actions"></div>
    </div>
  `;
  document.body.appendChild(root);

  const body = root.querySelector('.dev-body');
  root.querySelector('.dev-toggle').addEventListener('click', () => {
    body.hidden = !body.hidden;
  });

  const actions = root.querySelector('.dev-actions');
  const defaults = [
    { label: 'Reload', fn: () => location.reload() },
    { label: 'Clear save', fn: () => { localStorage.clear(); location.reload(); } },
  ];
  const all = [...defaults, ...(hooks.actions || [])];
  for (const a of all) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = a.label;
    btn.addEventListener('click', a.fn);
    actions.appendChild(btn);
  }

  const info = root.querySelector('.dev-info');
  const tick = () => {
    info.textContent = hooks.getStatus?.() ?? location.search || 'dev mode';
    requestAnimationFrame(tick);
  };
  tick();
  return root;
}
