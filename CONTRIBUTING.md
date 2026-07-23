# Contributing to BrowseMate

Thanks for your interest! BrowseMate is a browser agent that lets AI control Chrome. Contributions of all kinds are welcome.

## Getting Started

1. Fork the repo
2. Clone your fork: `git clone https://github.com/your-username/browsermate.git`
3. Set up the project:
   ```bash
   cd browsermate/server && npm install
   ```
4. Load `extension/` as unpacked in `chrome://extensions`
5. Start the server: `npm start`

## Development Workflow

1. Create a branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Test manually: load the extension, start the server, verify the endpoint works
4. Commit with a clear message:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation
   - `refactor:` for code restructuring
   - `chore:` for tooling/config changes
5. Push and open a PR

## What Needs Help

- **New endpoints**: scroll, hover, form fill, file upload, etc.
- **Better error handling**: reconnect logic, timeout feedback
- **Security**: permission scoping, CSP headers
- **Docs**: clearer README, animated GIF demo
- **Multi-tab support**: targeting tabs by ID or URL pattern

## Code Style

- Keep it simple — no build step, no TypeScript, no bundler
- Use `const`/`let`, async/await, template literals
- Handle errors gracefully — callbacks should always have error paths
- Comment intent, not mechanics

## PR Checklist

- [ ] Extension loads without errors in `chrome://extensions`
- [ ] Server starts on `localhost:3001` and `3002`
- [ ] New endpoints have corresponding tests in the PR description
- [ ] README is updated if adding/changing endpoints

## Questions?

Open an issue or reach out via the repo discussions.
