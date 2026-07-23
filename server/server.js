const http = require("http");
const { WebSocketServer } = require("ws");
const fs = require("fs");

const LOG = "server.log";
function log(m) { const l=`[${new Date().toISOString()}] ${m}\n`; process.stdout.write(l); fs.appendFileSync(LOG, l); }

process.on("uncaughtException", e => log(`FATAL: ${e.message}\n${e.stack}`));
process.on("unhandledRejection", r => log(`FATAL: ${r}`));

let extWs = null;
let rid = 0;
const pending = new Map();

const httpServer = http.createServer((req, res) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
  if (req.method !== "POST") { res.writeHead(405, cors); res.end("{}"); return; }

  let body = "";
  req.on("data", c => body += c);
  req.on("end", () => {
    let parsed;
    try { parsed = JSON.parse(body); } catch { res.writeHead(400, cors); res.end(JSON.stringify({error:"Invalid JSON"})); return; }

    const method = ({ "/navigate":"navigate","/click":"click","/type":"type","/extract":"extract","/screenshot":"screenshot","/eval":"eval" })[req.url];
    if (!method) { res.writeHead(404, cors); res.end(JSON.stringify({error:"Unknown"})); return; }

    if (!extWs || extWs.readyState !== 1) { res.writeHead(503, cors); res.end(JSON.stringify({error:"Extension not connected"})); return; }

    const id = ++rid;
    const msg = JSON.stringify({ id, type: method, params: parsed });

    pending.set(id, { res, cors });
    const t = setTimeout(() => { if (pending.delete(id)) { res.writeHead(504, cors); res.end(JSON.stringify({error:"Timeout"})); } }, 15000);

    try {
      extWs.send(msg);
      log(`Sent: id=${id} type=${method}`);
    } catch (e) {
      clearTimeout(t);
      pending.delete(id);
      res.writeHead(503, cors); res.end(JSON.stringify({error:"Send failed"}));
      log(`Send failed: ${e.message}`);
    }
  });
});

httpServer.listen(3001, () => log("HTTP on :3001"));

const wss = new WebSocketServer({ port: 3002 });
wss.on("connection", (ws) => {
  log("Extension connected");
  if (extWs && extWs.readyState === 1) try { extWs.close(); } catch(e) {}
  extWs = ws;
  ws.send(JSON.stringify({ type: "connected", message: "OK" }));

  ws.on("message", (raw) => {
    let d;
    try { d = JSON.parse(raw.toString()); } catch { return; }
    if (d.type === "ping") { ws.send(JSON.stringify({type:"pong"})); return; }
    if (d.type === "result" && d.id) {
      const e = pending.get(d.id);
      if (e) { clearTimeout(e._timeout); pending.delete(d.id); e.res.writeHead(200, e.cors); e.res.end(JSON.stringify({success:true, result:d.result})); log(`Result: id=${d.id}`); }
    }
    if (d.type === "error" && d.id) {
      const e = pending.get(d.id);
      if (e) { clearTimeout(e._timeout); pending.delete(d.id); e.res.writeHead(200, e.cors); e.res.end(JSON.stringify({success:false, error:d.error})); log(`Error: id=${d.id} ${d.error}`); }
    }
  });

  ws.on("close", () => {
    log("Extension disconnected");
    if (extWs === ws) extWs = null;
    for (const [id, e] of pending) { clearTimeout(e._timeout); e.res.writeHead(503, e.cors); e.res.end(JSON.stringify({error:"Disc"})); pending.delete(id); }
  });
});

log(`WS on :3002`);
