(() => {
  let elements = new Map();
  let nextId = 1;

  function buildShadowPath(el) {
    const path = [];
    let current = el;
    while (current && current !== document) {
      let selector = current.tagName.toLowerCase();
      if (current.id) selector += "#" + current.id;
      else if (current.className && typeof current.className === "string") {
        const cls = current.className.trim().split(/\s+/).slice(0, 2).join(".");
        if (cls) selector += "." + cls;
      }
      path.unshift(selector);
      current = current.parentElement || current.getRootNode?.().host;
    }
    return path.join(" >>>> ");
  }

  function getRole(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role");
    const aria = el.getAttribute("aria-label") || "";
    if (role === "button" || tag === "button" || tag === "a") return "button";
    if (role === "link" || tag === "a") return "link";
    if (tag === "input" || tag === "textarea" || role === "combobox" || role === "textbox") {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (type === "submit") return "button";
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      return "input";
    }
    if (role === "listbox" || role === "list") return "list";
    if (role === "menu" || role === "menuitem") return "menu";
    if (role === "tab" || role === "tabpanel") return "tab";
    if (role === "dialog" || tag === "dialog") return "dialog";
    if (tag === "select" || tag === "option") return "select";
    return role || tag;
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    if (rect.x < 0 && rect.y < 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    return true;
  }

  function scanElement(el, depth = 0) {
    if (depth > 20) return;
    if (!isVisible(el)) return;

    const tag = el.tagName.toLowerCase();
    const interactiveTags = ["a", "button", "input", "textarea", "select", "option", "label", "summary", "details"];
    const interactiveRoles = ["button", "link", "combobox", "textbox", "listbox", "option", "menuitem", "tab", "tabpanel", "checkbox", "radio", "switch", "slider", "dialog", "menu", "navigation", "search", "form", "heading"];

    const role = el.getAttribute("role");
    const isInteractive = interactiveTags.includes(tag) || (role && interactiveRoles.includes(role)) || el.hasAttribute("onclick") || el.getAttribute("tabindex") === "0" || el.tagName.match(/^[A-Z]/) || el.shadowRoot;

    if (isInteractive && tag !== "html" && tag !== "body" && tag !== "head") {
      const rect = el.getBoundingClientRect();
      const id = nextId++;
      const text = (el.textContent || "").trim().slice(0, 120);
      const aria = el.getAttribute("aria-label") || "";
      const placeholder = el.getAttribute("placeholder") || "";
      const value = el.value || "";

      // Store in WeakMap for later retrieval
      el.__bmId = id;
      elements.set(id, el);

      return {
        id,
        text: text || aria || placeholder || value || "",
        role: getRole(el),
        tag,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visible: isVisible(el),
        shadowDepth: depth,
        selector: buildShadowPath(el),
        aria,
        placeholder,
      };
    }
    return null;
  }

  function scanRecursive(root, depth = 0) {
    let results = [];
    const children = root.children || [];
    for (const child of children) {
      const result = scanElement(child, depth);
      if (result) results.push(result);
      // Recurse into shadow root
      if (child.shadowRoot) {
        const shadowResults = scanRecursive(child.shadowRoot, depth + 1);
        results = results.concat(shadowResults);
      }
      // Recurse into child elements
      const childResults = scanRecursive(child, depth);
      results = results.concat(childResults.filter(r => !results.find(x => x.id === r.id)));
    }
    // Deduplicate
    const seen = new Set();
    return results.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }

  function scanPage() {
    elements.clear();
    nextId = 1;
    return scanRecursive(document);
  }

  function findElementById(id) {
    return elements.get(id) || document.querySelector(`[__bm-id="${id}"]`);
  }

  // MutationObserver for live registry updates
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Remove deleted elements from registry
      for (const removed of mutation.removedNodes) {
        if (removed.__bmId) {
          elements.delete(removed.__bmId);
        }
        // Check children
        if (removed.querySelectorAll) {
          const removedElements = removed.querySelectorAll("[__bm-id]");
          removedElements.forEach(el => elements.delete(el.__bmId));
        }
      }
    }
  });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Listen for commands from background script
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "scanPage") {
      const registry = scanPage();
      sendResponse({ registry });
    }
    if (msg.type === "clickById") {
      const el = findElementById(msg.id);
      if (!el) {
        // Rescan and try again
        const registry = scanPage();
        const entry = registry.find(e => e.id === msg.id);
        if (!entry) { sendResponse({ error: "Element not found" }); return; }
        // Build selector from shadowPath and find element
        const path = entry.selector.split(" >>>> ");
        let root = document;
        for (const sel of path) {
          const found = root.querySelector(sel);
          if (!found) { sendResponse({ error: "Element vanished" }); return; }
          root = found.shadowRoot || found;
        }
        root.click();
        sendResponse({ clicked: entry.text.slice(0, 50) });
        return;
      }
      el.scrollIntoView({ behavior: "instant", block: "center" });
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      sendResponse({ clicked: (el.textContent || el.value || "").trim().slice(0, 50) });
    }
    if (msg.type === "getRegistrySize") {
      sendResponse({ size: elements.size });
    }
    return true;
  });

  console.log("[bm-content] Element registry ready");
})();
