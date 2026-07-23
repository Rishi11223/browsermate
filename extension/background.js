const WS_URL = "ws://127.0.0.1:3002";
let ws = null;
let reconnectTimer = null;
let tabStates = {};
let profileName = "default";

// Load saved profile name
chrome.storage.local.get(["profileName"], (data) => {
  if (data.profileName) profileName = data.profileName;
});

function connect() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;

  try {
    ws = new WebSocket(WS_URL);
  } catch (e) {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log("[agent] WebSocket connected as:", profileName);
    chrome.storage.local.set({ connected: true });
    notifyPopup({ type: "status", connected: true, profile: profileName });
    // Register profile name with server
    ws.send(JSON.stringify({ type: "register", profile: profileName }));
    startHeartbeat();
  };

  ws.onclose = () => {
    console.log("[agent] WebSocket disconnected");
    chrome.storage.local.set({ connected: false });
    notifyPopup({ type: "status", connected: false, profile: profileName });
    stopHeartbeat();
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = (e) => {
    console.error("[agent] WS error:", e.message || "unknown");
    notifyPopup({ type: "log", message: "WS error: " + (e.message || "Connection failed") });
    if (ws) ws.close();
  };

  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.type === "connected") {
      console.log("[agent] Bridge:", msg.message);
      return;
    }

    if (msg.id && msg.type) {
      handleCommand(msg).then((result) => {
        send({ type: "result", id: msg.id, result });
      }).catch((err) => {
        send({ type: "error", id: msg.id, error: err.message });
      });
    }
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3000);
}

function send(data) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

function notifyPopup(data) {
  chrome.runtime.sendMessage(data).catch((e) => {
    if (e.message !== "Could not establish connection. Receiving end does not exist.") {
      console.warn("[agent] notifyPopup error:", e.message);
    }
  });
}

async function handleCommand(msg) {
  const { type, params } = msg;

  switch (type) {
    case "navigate":
      return await cmdNavigate(params);
    case "click":
      return await cmdClick(params);
    case "type":
      return await cmdType(params);
    case "extract":
      return await cmdExtract(params);
    case "screenshot":
      return await cmdScreenshot(params);
    case "eval":
      return await cmdEval(params);
    default:
      throw new Error(`Unknown command: ${type}`);
  }
}

function getActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) reject(new Error("No active tab"));
      else resolve(tabs[0]);
    });
  });
}

function execInTab(tabId, fn, args) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: fn,
        args: args || [],
      },
      (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (results && results[0]) {
          resolve(results[0].result);
        } else {
          reject(new Error("No result from content script"));
        }
      }
    );
  });
}

async function cmdNavigate(params) {
  const url = params.url;
  if (!url) throw new Error("URL required");

  const tab = await getActiveTab();
  await new Promise((resolve, reject) => {
    chrome.tabs.update(tab.id, { url }, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });

  await new Promise((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === tab.id && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 500);
      }
    });
  });

  return { url, title: (await getActiveTab()).title };
}

async function cmdClick(params) {
  const tab = await getActiveTab();
  const selector = params.selector;
  const x = params.x;
  const y = params.y;

  // If coordinates provided, click at those page coordinates (like a human)
  if (x !== undefined && y !== undefined) {
    return await execInTab(tab.id, (cx, cy) => {
      const el = document.elementFromPoint(cx, cy);
      if (!el) throw new Error(`No element at (${cx}, ${cy})`);
      el.scrollIntoView({ behavior: "instant", block: "center" });
      el.click();
      return { clicked: `(${cx}, ${cy})`, tag: el.tagName, text: (el.textContent || "").trim().slice(0, 100) };
    }, [x, y]);
  }

  if (!selector) throw new Error("Provide selector or coordinates (x, y)");

  return await execInTab(tab.id, (sel) => {
    function deepSearch(root, sel) {
      try { const e = root.querySelector(sel); if (e) return e; } catch(e) {}
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) {
          const found = deepSearch(el.shadowRoot, sel);
          if (found) return found;
        }
      }
      return null;
    }
    const el = deepSearch(document, sel);
    if (!el) throw new Error(`Element not found: ${sel}`);
    el.scrollIntoView({ behavior: "instant", block: "center" });
    try {
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    } catch(e) {
      el.click();
    }
    return { clicked: sel, tag: el.tagName, text: (el.textContent || "").trim().slice(0, 100) };
  }, [selector]);
}

async function cmdType(params) {
  const tab = await getActiveTab();
  const selector = params.selector;
  const text = params.text;
  if (!selector) throw new Error("CSS selector required");

  return await execInTab(tab.id, (sel, txt) => {
    function deepSearch(root, sel) {
      try { const e = root.querySelector(sel); if (e) return e; } catch(e) {}
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) {
          const found = deepSearch(el.shadowRoot, sel);
          if (found) return found;
        }
      }
      return null;
    }
    const el = deepSearch(document, sel);
    if (!el) throw new Error(`Element not found: ${sel}`);
    el.scrollIntoView({ behavior: "instant", block: "center" });
    el.focus();
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.value = txt;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      el.textContent = txt;
    }
    return { typed: txt.slice(0, 50) + (txt.length > 50 ? "..." : "") };
  }, [selector, text]);
}

async function cmdExtract(params) {
  const tab = await getActiveTab();
  const selector = params.selector;
  const attr = params.attr || "textContent";

  return await execInTab(tab.id, (sel, at) => {
    // Recursively find elements across shadow DOM boundaries
    function deepQuery(root, sel) {
      let results = [];
      try {
        results = Array.from(root.querySelectorAll(sel));
      } catch(e) {}
      // Also search inside shadow roots
      const all = root.querySelectorAll("*");
      for (const el of all) {
        if (el.shadowRoot) {
          try {
            results = results.concat(Array.from(el.shadowRoot.querySelectorAll(sel)));
          } catch(e) {}
          // Recurse into nested shadow roots
          results = results.concat(deepQuery(el.shadowRoot, sel));
        }
      }
      return results;
    }
    const elements = deepQuery(document, sel);
    return Array.from(elements).map((el) => {
      if (at === "textContent") return el.textContent.trim();
      if (at === "href") return el.href || el.getAttribute("href") || "";
      if (at === "src") return el.src || el.getAttribute("src") || "";
      return el.getAttribute(at) || el[at] || "";
    });
  }, [selector, attr]);
}

async function cmdScreenshot(params) {
  const tab = await getActiveTab();
  // Retry up to 3 times
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        // Ensure tab is active
        chrome.tabs.update(tab.id, { active: true }, () => {
          setTimeout(() => {
            chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }, (d) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else resolve(d);
            });
          }, 500);
        });
      });
      if (dataUrl && dataUrl.length > 100) return { dataUrl };
    } catch(e) {
      if (attempt === 2) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function cmdEval(params) {
  const tab = await getActiveTab();
  const code = params.code;
  if (!code) throw new Error("JavaScript code required");

  return await execInTab(tab.id, (c) => {
    try {
      const fn = new Function(c);
      return fn();
    } catch(e) {
      return "[eval error] " + e.message;
    }
  }, [code]);
}

// Keep extension alive with self-healing heartbeat
let heartbeatTimer = null;

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify({ type: "ping" })); } catch(e) {}
    } else if (!ws || ws.readyState === 3) {
      connect();
    }
  }, 10000);
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "connect") {
    connect();
    sendResponse({ ok: true });
  }
  if (msg.type === "disconnect") {
    if (ws) { ws.close(); ws = null; }
    chrome.storage.local.set({ connected: false });
    sendResponse({ ok: true });
  }
  if (msg.type === "getStatus") {
    sendResponse({ connected: !!(ws && ws.readyState === 1), profile: profileName });
  }
  if (msg.type === "setProfile") {
    profileName = msg.profile || "default";
    chrome.storage.local.set({ profileName });
    // If connected, reconnect with new profile
    if (ws) { ws.close(); ws = null; }
    connect();
    sendResponse({ ok: true, profile: profileName });
  }
  return true;
});

connect();
