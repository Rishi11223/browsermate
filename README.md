# BrowseMate

AI-powered browser agent Chrome extension. Connects via WebSocket to a local bridge server, allowing **opencode** (or any AI agent) to control your real Chrome browser — navigate, click, type, extract data, take screenshots.

## Architecture

```
You (opencode) → HTTP POST → Bridge Server (localhost:3001)
                                        ↕ WebSocket
                               BrowseMate Extension (localhost:3002)
                                        ↕ DOM API
                               Your Browser (signed-in profile)
```

## Quick Start

### 1. Start the bridge server

```bash
cd server
npm install
npm start
```

### 2. Load the extension in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder

### 3. Connect

Click the extension icon → click **Connect**. Status should turn green.

### 4. Send commands from opencode

```bash
curl -X POST http://localhost:3001/navigate -H "Content-Type: application/json" -d '{"url":"https://google.com"}'
curl -X POST http://localhost:3001/click -H "Content-Type: application/json" -d '{"selector":"input[name=q]"}'
curl -X POST http://localhost:3001/type -H "Content-Type: application/json" -d '{"selector":"input[name=q]","text":"hello world"}'
curl -X POST http://localhost:3001/extract -H "Content-Type: application/json" -d '{"selector":"h3","attr":"textContent"}'
```

## Endpoints

| Method | Path | Params | Description |
|--------|------|--------|-------------|
| POST | `/navigate` | `{url}` | Go to a URL |
| POST | `/click` | `{selector}` | Click element by CSS selector |
| POST | `/type` | `{selector, text}` | Type text into an input |
| POST | `/extract` | `{selector, attr}` | Extract text/attributes from elements |
| POST | `/screenshot` | `{}` | Capture visible tab as PNG |
| POST | `/eval` | `{code}` | Execute JavaScript in the page |
