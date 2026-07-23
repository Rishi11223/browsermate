const dot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const tabInfo = document.getElementById("tabInfo");
const logBox = document.getElementById("logBox");
const profileInput = document.getElementById("profileInput");
const profileBtn = document.getElementById("profileBtn");

const tabs = document.querySelectorAll(".tab");
const panels = {
  control: document.getElementById("tab-control"),
  onboard: document.getElementById("tab-onboard"),
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

function setStatus(connected, profile) {
  dot.className = "dot " + (connected ? "connected" : "disconnected");
  statusText.textContent = connected ? "Connected" + (profile ? " (" + profile + ")" : "") : "Disconnected";
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
    setStatus(msg.connected, msg.profile);
    addLog(msg.connected ? "Connected to bridge" + (msg.profile ? " as \"" + msg.profile + "\"" : "") : "Disconnected from bridge");
  }
  if (msg.type === "log") {
    addLog("[bg] " + msg.message);
  }
});

connectBtn.addEventListener("click", () => {
  addLog("Connecting...");
  chrome.runtime.sendMessage({ type: "connect" }, (resp) => {
    if (chrome.runtime.lastError) {
      addLog("Error: " + chrome.runtime.lastError.message);
    } else {
      addLog("Connect sent: " + JSON.stringify(resp));
      setTimeout(() => {
        chrome.runtime.sendMessage({ type: "getStatus" }, (s) => {
          addLog("Status: " + JSON.stringify(s));
        });
      }, 2000);
    }
  });
});

disconnectBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "disconnect" });
  addLog("Disconnected");
});

// Load and save profile name
chrome.storage.local.get(["profileName"], (data) => {
  profileInput.value = data.profileName || "default";
});
profileBtn.addEventListener("click", () => {
  const name = profileInput.value.trim() || "default";
  chrome.storage.local.set({ profileName: name });
  chrome.runtime.sendMessage({ type: "setProfile", profile: name });
  addLog("Profile set to: " + name);
});
profileInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") profileBtn.click();
});

// Keep service worker alive while popup is open
const port = chrome.runtime.connect({ name: "keepAlive" });

// Show onboarding on first install
chrome.storage.local.get(["onboarded"], (data) => {
  if (!data.onboarded) {
    document.getElementById("onboarding").style.display = "block";
  }
});

document.getElementById("onboardDone").addEventListener("click", () => {
  chrome.storage.local.set({ onboarded: true });
  document.getElementById("onboarding").style.display = "none";
});

// Get real connection status from background
chrome.runtime.sendMessage({ type: "getStatus" }, (status) => {
  if (status) {
    setStatus(!!status.connected);
    if (status.profile) profileInput.value = status.profile;
  }
});

updateTabInfo();
setInterval(updateTabInfo, 2000);
