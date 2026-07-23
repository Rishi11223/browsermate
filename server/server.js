const { createServer } = require("http");
const { WebSocketServer } = require("ws");

const HTTP_PORT = 3001;
const WS_PORT = 3002;

const pending = new Map();
let requestId = 0;

function sendToExtension(ws, msg) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

function createRequest(type, params) {
  const id = ++requestId;
  const msg = { id, type, params };
  return { id, msg };
}

// ---- HTTP server (opencode sends commands here) ----
const httpServer = createServer((req, res) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, headers);
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  let body = "";
  req.on("error", (err) => {
    console.error("[server] Request error:", err.message);
  });
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, headers);
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    const method = req.url === "/navigate"
      ? "navigate"
      : req.url === "/click"
        ? "click"
        : req.url === "/type"
          ? "type"
          : req.url === "/extract"
            ? "extract"
            : req.url === "/screenshot"
              ? "screenshot"
              : req.url === "/eval"
                ? "eval"
                : null;

    if (!method) {
      res.writeHead(404, headers);
      res.end(JSON.stringify({ error: "Unknown endpoint" }));
      return;
    }

    if (!global.extensionWs) {
      res.writeHead(503, headers);
      res.end(JSON.stringify({ error: "Extension not connected" }));
      return;
    }

    const { id, msg } = createRequest(method, parsed);

    pending.set(id, { res, headers });
    const timeout = setTimeout(() => {
      pending.delete(id);
      res.writeHead(504, headers);
      res.end(JSON.stringify({ error: "Timeout" }));
    }, 30000);

    msg._timeout = timeout;
    if (!sendToExtension(global.extensionWs, msg)) {
      clearTimeout(timeout);
      pending.delete(id);
      res.writeHead(503, headers);
      res.end(JSON.stringify({ error: "Extension disconnected" }));
    }
  });
});

httpServer.listen(HTTP_PORT, () => {
  console.log(`[server] HTTP bridge on http://localhost:${HTTP_PORT}`);
  console.log(`[server] Endpoints: POST /navigate /click /type /extract /screenshot /eval`);
});

// ---- WebSocket server (extension connects here) ----
const wsServer = new WebSocketServer({ port: WS_PORT });

wsServer.on("connection", (ws) => {
  console.log("[server] Extension connected");

  if (global.extensionWs && global.extensionWs.readyState === 1) {
    global.extensionWs.close();
  }
  global.extensionWs = ws;

  ws.send(JSON.stringify({ type: "connected", message: "Bridge established" }));

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (data.type === "result" && data.id) {
      const entry = pending.get(data.id);
      if (entry) {
        clearTimeout(data._timeout);
        const { res, headers } = entry;
        pending.delete(data.id);
        res.writeHead(200, headers);
        res.end(JSON.stringify({ success: true, result: data.result }));
      }
    }

    if (data.type === "error" && data.id) {
      const entry = pending.get(data.id);
      if (entry) {
        clearTimeout(data._timeout);
        const { res, headers } = entry;
        pending.delete(data.id);
        res.writeHead(200, headers);
        res.end(JSON.stringify({ success: false, error: data.error }));
      }
    }

    if (data.type === "log") {
      console.log(`[extension] ${data.message}`);
    }
  });

  ws.on("close", () => {
    console.log("[server] Extension disconnected");
    if (global.extensionWs === ws) {
      global.extensionWs = null;
    }
    for (const [id, entry] of pending) {
      clearTimeout(entry._timeout);
      entry.res.writeHead(503, { "Access-Control-Allow-Origin": "*" });
      entry.res.end(JSON.stringify({ error: "Extension disconnected" }));
      pending.delete(id);
    }
  });
});

process.on("uncaughtException", (err) => {
  console.error("[server] UNCAUGHT:", err.message, err.stack?.slice(0, 200));
});

process.on("unhandledRejection", (err) => {
  console.error("[server] UNHANDLED:", err.message);
});

console.log(`[server] WebSocket on ws://localhost:${WS_PORT}`);
