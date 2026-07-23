const dot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const tabInfo = document.getElementById("tabInfo");
const logBox = document.getElementById("logBox");

const tabs = document.querySelectorAll(".tab");
const panels = {
  control: document.getElementById("tab-control"),
  logs: document.getElementById("tab-logs"),
};

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    Object.keys(panels).forEach((key) => {
      panels[key].style.display = key === tab.dataset.tab ? "block" : "none";
    });
  });
});

function setStatus(connected) {
  dot.className = "dot " + (connected ? "connected" : "disconnected");
  statusText.textContent = connected ? "Connected" : "Disconnected";
  connectBtn.style.display = connected ? "none" : "block";
  disconnectBtn.style.display = connected ? "block" : "none";
}

function addLog(msg) {
  const div = document.createElement("div");
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logBox.appendChild(div);
  logBox.scrollTop = logBox.scrollHeight;
}

function updateTabInfo() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      const t = tabs[0];
      tabInfo.innerHTML = `<b>${t.title || "Untitled"}</b><br><span style="color:#888;font-size:11px">${t.url || ""}</span>`;
    }
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "status") {
    setStatus(msg.connected);
    addLog(msg.connected ? "Connected to bridge" : "Disconnected from bridge");
  }
});

connectBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "connect" });
  addLog("Connecting...");
});

disconnectBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "disconnect" });
  addLog("Disconnected");
});

// Keep service worker alive while popup is open
const port = chrome.runtime.connect({ name: "keepAlive" });

// Get real connection status from background
chrome.runtime.sendMessage({ type: "getStatus" }, (status) => {
  setStatus(!!(status && status.connected));
});

updateTabInfo();
setInterval(updateTabInfo, 2000);
