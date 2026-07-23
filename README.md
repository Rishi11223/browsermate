# BrowseMate

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-4285F4)](https://chrome.google.com/webstore)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

AI-powered browser agent Chrome extension. Control your real Chrome browser (with signed-in profile) from opencode, curl, Python, or any HTTP client.

## Features

- **Navigate** — go to any URL and wait for page load
- **Click** — click buttons, links, and elements by CSS selector
- **Type** — fill text into inputs, textareas, and contenteditable fields
- **Extract** — scrape data from pages using selectors
- **Screenshot** — capture visible tab as PNG
- **Eval** — execute JavaScript directly in the page

## How It Works

```
You → HTTP POST → Bridge Server → WebSocket → Chrome Extension → Your Browser
       localhost:3001                     localhost:3002
```

## Quick Start (non-technical)

### 1. Download the server

Download `browsermate-server.exe` from the [Releases page](https://github.com/Rishi11223/browsermate/releases).

### 2. Run the server

Double-click `browsermate-server.exe`. A console window will open — keep it running in the background.

### 3. Install the extension

1. Download this repo as ZIP and extract it
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the `extension/` folder

### 4. Connect

Click the BrowseMate icon in Chrome's toolbar → click **Connect**. The dot turns green.

### 5. Send a command

```bash
curl -X POST http://localhost:3001/navigate \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

## Quick Start (with Node.js)

```bash
cd server
npm install
npm start
```

Then follow steps 3-5 above.

## For Developers

### Build the standalone server

```bash
npm install -g pkg
cd server
pkg server.js --targets node18-win-x64 --output browsermate-server.exe
```

### Commands from any language

```python
import requests
requests.post("http://localhost:3001/navigate", json={"url": "https://google.com"})
```

```javascript
fetch("http://localhost:3001/click", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({selector: "button"})
})
```

## Endpoints

| POST | Params | Description |
|------|--------|-------------|
| `/navigate` | `{url}` | Go to a URL |
| `/click` | `{selector}` | Click element |
| `/type` | `{selector, text}` | Type into input |
| `/extract` | `{selector, attr}` | Extract data |
| `/screenshot` | `{}` | Capture screenshot |
| `/eval` | `{code}` | Run JavaScript |

## Use Cases

- **AI assistants** — let opencode browse the web for you
- **Automation** — script repetitive browser tasks
- **Web scraping** — extract data without API restrictions
- **Testing** — automate form filling and navigation
