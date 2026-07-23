# BrowseMate Privacy Policy

BrowseMate does **not** collect, store, or transmit any personal data.

## What the extension does

BrowseMate connects your Chrome browser to a local bridge server running on your own computer. All commands and data stay on your machine — nothing is sent to external servers.

## Data handling

- **WebSocket connection**: Connects only to `ws://127.0.0.1:3002` (your local machine)
- **HTTP commands**: Sent to `http://localhost:3001` (your local machine)
- **Screenshots**: Generated locally, returned to the requester, never stored
- **No telemetry**: No analytics, no tracking, no cookies
- **No third-party services**: The extension does not contact any external server

## Permissions used

- `activeTab` / `scripting` / `tabs` — Needed to inject commands into the active browser tab
- `storage` — Saves your profile name preference locally
- `host_permissions` (`<all_urls>`) — Needed to interact with any page you navigate to
- `webNavigation` — Detects when pages finish loading

## Updates

If this policy changes, you will be notified via the extension's update notes in the Chrome Web Store.
