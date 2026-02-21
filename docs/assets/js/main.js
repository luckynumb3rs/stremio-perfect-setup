(function () {
  var pages = Array.isArray(window.DOCS_PAGES) ? window.DOCS_PAGES.slice() : [];
  var currentPath = window.CURRENT_PATH || "";

  function normalizePath(path) {
    return String(path || "").replace(/^\/+|\/+$/g, "");
  }

  function isGuidePath(path) {
    return /^guide\/.+\.md$/.test(path);
  }

  function displayTitle(raw) {
    return String(raw || "").replace(/\.md$/i, "").replace(/-/g, " ");
  }

  function hasLeadingIcon(title) {
    return /^[\u{2600}-\u{27BF}\u{1F300}-\u{1FAFF}]/u.test(String(title || "").trim());
  }

  function displayChapterTitle(page) {
    var title = displayTitle(page && page.title ? page.title : "");
    if (!title) {
      title = displayTitle(page && page.path ? page.path.split("/").pop() : "");
    }
    if (hasLeadingIcon(title)) return title;
    return "📄 " + title;
  }

  function guideSort(a, b) {
    var ap = normalizePath(a.path);
    var bp = normalizePath(b.path);
    var aIsUpdates = /\/Updates\.md$/i.test(ap);
    var bIsUpdates = /\/Updates\.md$/i.test(bp);
    if (aIsUpdates && !bIsUpdates) return 1;
    if (!aIsUpdates && bIsUpdates) return -1;
    return ap.localeCompare(bp, undefined, { numeric: true, sensitivity: "base" });
  }

  pages = pages.filter(function (p) {
    return p && isGuidePath(normalizePath(p.path));
  }).sort(guideSort);

  function buildTree(items) {
    var root = { children: Object.create(null), order: [] };

    items.forEach(function (item) {
      var rel = normalizePath(item.path).replace(/^guide\//, "").replace(/\.md$/i, "");
      var parts = rel.split("/");
      var node = root;

      for (var i = 0; i < parts.length; i += 1) {
        var key = parts[i];
        if (!node.children[key]) {
          node.children[key] = { key: key, children: Object.create(null), order: [], page: null };
          node.order.push(key);
        }
        node = node.children[key];
        if (i === parts.length - 1) {
          node.page = item;
        }
      }
    });

    return root;
  }

  function renderNode(node, list, level) {
    var keys = node.order.slice().sort(function (a, b) {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    });

    keys.forEach(function (key) {
      var child = node.children[key];
      var li = document.createElement("li");
      var hasChildren = child.order.length > 0;

      if (hasChildren && child.page) {
        var details = document.createElement("details");
        details.open = currentPath.indexOf(child.page.path.replace(/\.md$/i, "")) >= 0;
        var summary = document.createElement("summary");
        summary.className = "nav-summary";
        summary.textContent = displayChapterTitle(child.page);
        details.appendChild(summary);

        var link = document.createElement("a");
        link.className = "nav-link";
        link.href = child.page.url;
        link.textContent = "Open chapter";
        if (normalizePath(child.page.path) === normalizePath(currentPath)) {
          link.setAttribute("aria-current", "page");
        }
        details.appendChild(link);

        var sub = document.createElement("ul");
        sub.className = "nav-children";
        renderNode(child, sub, level + 1);
        details.appendChild(sub);
        li.appendChild(details);
      } else if (child.page) {
        var a = document.createElement("a");
        a.className = "nav-link";
        a.href = child.page.url;
        a.textContent = displayChapterTitle(child.page);
        if (normalizePath(child.page.path) === normalizePath(currentPath)) {
          a.setAttribute("aria-current", "page");
        }
        li.appendChild(a);
      }

      if (li.childNodes.length > 0) {
        list.appendChild(li);
      }
    });
  }

  function renderSidebar() {
    var mount = document.getElementById("sidebar-nav");
    if (!mount) return;

    var home = document.createElement("a");
    home.className = "nav-link";
    home.href = window.HOME_URL || "/";
    home.textContent = "🎬 Home";

    if (normalizePath(currentPath) === "index.md" || normalizePath(currentPath) === "") {
      home.setAttribute("aria-current", "page");
    }

    var ul = document.createElement("ul");
    renderNode(buildTree(pages), ul, 0);

    mount.innerHTML = "";
    mount.appendChild(home);
    mount.appendChild(ul);
  }

  function renderPager() {
    var pager = document.getElementById("pager");
    if (!pager) return;

    var index = pages.findIndex(function (p) {
      return normalizePath(p.path) === normalizePath(currentPath);
    });

    if (index === -1) {
      pager.hidden = true;
      return;
    }

    var prev = pages[index - 1];
    var next = pages[index + 1];

    pager.innerHTML = "";
    if (prev) {
      var prevLink = document.createElement("a");
      prevLink.href = prev.url;
      prevLink.className = "pager__prev";
      prevLink.innerHTML = "<span>Previous</span><strong>" + displayChapterTitle(prev) + "</strong>";
      pager.appendChild(prevLink);
    }

    if (next) {
      var nextLink = document.createElement("a");
      nextLink.href = next.url;
      nextLink.className = "pager__next";
      nextLink.innerHTML = "<span>Next</span><strong>" + displayChapterTitle(next) + "</strong>";
      pager.appendChild(nextLink);
    }

    pager.hidden = pager.children.length === 0;
  }

  function renderQuickNav() {
    var quick = document.getElementById("quick-nav");
    var list = document.getElementById("quick-nav-list");
    var article = document.querySelector(".doc-card");
    if (!quick || !list || !article) return;

    list.innerHTML = "";
    var headers = Array.prototype.slice.call(article.querySelectorAll("h2, h3, h4")).filter(function (h) {
      return !h.closest("#quick-nav");
    });
    if (headers.length === 0) {
      quick.hidden = true;
      return;
    }

    headers.forEach(function (h) {
      if (!h.id) return;
      var li = document.createElement("li");
      li.style.marginLeft = h.tagName === "H2" ? "0" : h.tagName === "H3" ? "0.6rem" : "1.1rem";
      var a = document.createElement("a");
      a.href = "#" + h.id;
      a.textContent = h.textContent;
      li.appendChild(a);
      list.appendChild(li);
    });

    if (list.children.length > 0) {
      var h1 = article.querySelector("h1");
      if (h1 && h1.nextSibling) {
        article.insertBefore(quick, h1.nextSibling);
      }
      quick.hidden = false;
    }
  }

  function setupThemeToggle() {
    var key = "stremio_docs_theme";
    var toggle = document.getElementById("theme-toggle");
    if (!toggle) return;

    function currentTheme() {
      return document.documentElement.getAttribute("data-theme") || "light";
    }

    function apply(theme) {
      document.documentElement.setAttribute("data-theme", theme);
      toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
      try {
        localStorage.setItem(key, theme);
      } catch (_) {}
    }

    apply(currentTheme());
    toggle.addEventListener("click", function () {
      apply(currentTheme() === "dark" ? "light" : "dark");
    });
  }

  function setupMobileNav() {
    var body = document.body;
    var toggle = document.getElementById("nav-toggle");
    var backdrop = document.getElementById("nav-backdrop");

    if (!toggle || !backdrop) return;

    function closeNav() {
      body.classList.remove("nav-open");
      toggle.setAttribute("aria-expanded", "false");
    }

    toggle.addEventListener("click", function () {
      var next = !body.classList.contains("nav-open");
      body.classList.toggle("nav-open", next);
      toggle.setAttribute("aria-expanded", next ? "true" : "false");
    });

    backdrop.addEventListener("click", closeNav);
    window.addEventListener("resize", function () {
      if (window.innerWidth > 1040) {
        closeNav();
      }
    });
  }

  renderSidebar();
  renderQuickNav();
  renderPager();
  setupThemeToggle();
  setupMobileNav();
})();
