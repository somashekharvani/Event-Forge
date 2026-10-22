"use strict";
(async function boot() {
  chatInit();
  const h = (location.hash || "").slice(1);
  let pid = null;
  try { pid = localStorage.getItem("ef_pid"); } catch { }
  if (pid) {
    try {
      const pkg = await api("/projects/" + pid);
      S.pid = pkg.project_id;
      S.plan = pkg.plan;
      S.version = pkg.version;
    } catch { }
  }
  if (h && TABS.some(t => t[0] === h)) {
    S.tab = h;
  } else {
    S.tab = "landing";
  }
  render();
})();
