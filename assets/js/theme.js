(function () {
  var key = "stremio_docs_theme";
  var saved;
  try {
    saved = localStorage.getItem(key);
  } catch (_) {
    saved = null;
  }

  var theme = saved;
  if (!theme) {
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    theme = prefersDark ? "dark" : "light";
  }

  document.documentElement.setAttribute("data-theme", theme);
})();
