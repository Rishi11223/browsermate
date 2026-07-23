const http = require("http");
const { WebSocketServer } = require("ws");

const HTTP_PORT = 3001;
const WS_PORT = 3002;
const LOG = "server.log";
const fs = require("fs");

function log(m) { const l = `[${new Date().toISOString()}] ${m}\n`; process.stdout.write(l); try { fs.appendFileSync(LOG, l); } catch(e) {} }

process.on("uncaughtException", e => log(`FATAL: ${e.message}\n${e.stack?.slice(0, 300)}`));
process.on("unhandledRejection", r => log(`FATAL: ${r}`));

// Store multiple profile connections: Map<profileName, WebSocket>
const profiles = new Map();
let rid = 0;
const pending = new Map();

function getProfile(req) {
  // Extract profile param: query string ?profile=xxx or JSON body field
  const url = new URL(req.url, "http://localhost");
  const queryProfile = url.searchParams?.get?.("profile");
  return queryProfile || "default";
}

const httpServer = http.createServer((req, res) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
  if (req.method !== "POST") { res.writeHead(405, cors); res.end("{}"); return; }

  let body = "";
  req.on("data", c => body += c);
  req.on("end", () => {
    let parsed;
    try { parsed = JSON.parse(body); } catch { res.writeHead(400, cors); res.end(JSON.stringify({error:"Invalid JSON"})); return; }

    // Handle autostart endpoint (no extension needed)
    if (req.url === "/autostart") {
      const action = parsed.action;
      const startupDir = require("path").join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
      const batPath = require("path").join(startupDir, "browsermate-server.bat");
      const exePath = process.argv[1] || process.argv[0];  // pkg exe or node script
      try {
        if (action === "enable") {
          require("fs").writeFileSync(batPath, `@echo off\nstart "" "${exePath}"\n`, "utf8");
          res.writeHead(200, cors); res.end(JSON.stringify({success:true, message:"Auto-start enabled"}));
        } else if (action === "disable") {
          if (require("fs").existsSync(batPath)) require("fs").unlinkSync(batPath);
          res.writeHead(200, cors); res.end(JSON.stringify({success:true, message:"Auto-start disabled"}));
        } else if (action === "status") {
          const enabled = require("fs").existsSync(batPath);
          res.writeHead(200, cors); res.end(JSON.stringify({success:true, enabled, startupPath: batPath}));
        } else {
          res.writeHead(400, cors); res.end(JSON.stringify({error:"Invalid action. Use enable, disable, or status"}));
        }
      } catch(e) {
        res.writeHead(500, cors); res.end(JSON.stringify({error: e.message}));
      }
      return;
    }

    const method = ({"/navigate":"navigate","/click":"click","/type":"type","/extract":"extract","/screenshot":"screenshot","/eval":"eval","/scan":"scan","/clickById":"clickById"})[req.url];
    if (!method) { res.writeHead(404, cors); res.end(JSON.stringify({error:"Unknown"})); return; }

    // Determine target profile
    const profile = parsed.profile || getProfile(req) || "default";
    const ws = profiles.get(profile);

    if (!ws || ws.readyState !== 1) {
      res.writeHead(503, cors);
      res.end(JSON.stringify({error:`Extension not connected for profile: ${profile}`, profiles: Array.from(profiles.keys())}));
      return;
    }

    const id = ++rid;
    const msg = JSON.stringify({ id, type: method, params: parsed });

    pending.set(id, { res, cors });
    const t = setTimeout(() => { if (pending.delete(id)) { res.writeHead(504, cors); res.end(JSON.stringify({error:"Timeout"})); } }, 20000);

    try {
      ws.send(msg);
      log(`[${profile}] Sent: id=${id} type=${method}`);
    } catch (e) {
      clearTimeout(t); pending.delete(id);
      profiles.delete(profile);
      res.writeHead(503, cors); res.end(JSON.stringify({error:"Send failed"}));
      log(`[${profile}] Send failed: ${e.message}`);
    }
  });
});

httpServer.listen(HTTP_PORT, () => log(`HTTP on :${HTTP_PORT}`));

const wss = new WebSocketServer({ port: WS_PORT });
wss.on("connection", (ws) => {
  let profileName = "default";

  ws.on("message", (raw) => {
    let d;
    try { d = JSON.parse(raw.toString()); } catch { return; }

    // First message must contain profile name
    if (d.type === "register") {
      profileName = d.profile || "default";

      // Close existing connection for this profile if any
      const existing = profiles.get(profileName);
      if (existing && existing.readyState === 1 && existing !== ws) {
        try { existing.close(); } catch(e) {}
      }

      profiles.set(profileName, ws);
      log(`[${profileName}] Registered`);
      ws.send(JSON.stringify({ type: "connected", profile: profileName, message: `Bridge established as "${profileName}"` }));
      return;
    }

    if (d.type === "ping") { ws.send(JSON.stringify({type:"pong"})); return; }

    // Route results/errors to pending HTTP requests
    if ((d.type === "result" || d.type === "error") && d.id) {
      const e = pending.get(d.id);
      if (e) {
        clearTimeout(e._timeout); pending.delete(d.id);
        e.res.writeHead(200, e.cors);
        e.res.end(JSON.stringify({success: d.type === "result", result: d.result, error: d.error}));
        log(`[${profileName}] ${d.type}: id=${d.id}`);
      }
    }
  });

  ws.on("close", () => {
    if (profiles.get(profileName) === ws) {
      profiles.delete(profileName);
      log(`[${profileName}] Disconnected`);
    }
    // Reject pending requests for this profile
    for (const [id, e] of pending) {
      if (e._profile === profileName) {
        clearTimeout(e._timeout); pending.delete(id);
        try { e.res.writeHead(503, e.cors); e.res.end(JSON.stringify({error:"Profile disconnected"})); } catch(x) {}
      }
    }
  });
});

log(`WS on :${WS_PORT}`);
log(`Multi-profile ready. Register extensions with {type:"register", profile:"name"}`);
