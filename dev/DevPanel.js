/**
 * Generic dev panel — ?dev=1 or Vite dev server.
 * Plain script (no imports) for legacy games; ES module games can import initDevPanel.
 */
(function initDevPanelGlobal() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('dev')) return;

  const style = document.createElement('style');
  style.textContent = `
    #dev-panel { position:fixed; top:8px; right:8px; z-index:99999; font:12px system-ui,sans-serif; }
    #dev-panel .dev-toggle { background:#1e293b;color:#e2e8f0;border:1px solid #475569;padding:4px 10px;cursor:pointer;border-radius:4px; }
    #dev-panel .dev-body { margin-top:6px;background:rgba(15,23,42,.92);color:#e2e8f0;padding:8px;border-radius:6px;max-width:220px; }
    #dev-panel button { margin:2px;padding:4px 8px;font-size:11px;cursor:pointer; }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'dev-panel';
  root.innerHTML = `
    <button type="button" class="dev-toggle" id="dev-toggle">DEV</button>
    <div class="dev-body" id="dev-body" hidden>
      <div id="dev-info"></div>
      <button type="button" id="dev-reload">Reload</button>
      <button type="button" id="dev-clear-save">Clear localStorage</button>
    </div>
  `;
  document.body.appendChild(root);

  const body = root.querySelector('#dev-body');
  const toggle = root.querySelector('#dev-toggle');
  toggle.addEventListener('click', () => {
    body.hidden = !body.hidden;
  });

  root.querySelector('#dev-reload').addEventListener('click', () => location.reload());
  root.querySelector('#dev-clear-save').addEventListener('click', () => {
    localStorage.clear();
    location.reload();
  });

  const info = root.querySelector('#dev-info');
  const tick = () => {
    info.textContent = `URL: ${location.pathname}${location.search}`;
    requestAnimationFrame(tick);
  };
  tick();
})();
