"use strict";
(async function boot() {
  chatInit();
  const h = (location.hash || "").slice(1);
  let pid = null;
  try { pid = localStorage.getItem("ef_pid"); } catch { }
  if (pid) {
    try { const pkg = await api("/projects/" + pid); S.tab = TABS.some(t => t[0] === h) ? h : "overview"; setPlan(pkg); return; } catch { }
  }
  render();
})();
