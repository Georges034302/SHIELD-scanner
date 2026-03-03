<h1>
  <a href="https://georges034302.github.io/SHIELD-scanner/"><img src="logos/shield.png" alt="SHIELD Logo" width="80" align="middle"/></a>
  <a href="https://georges034302.github.io/SHIELD-scanner/" style="vertical-align: middle; display: inline-block; text-decoration: none; color: inherit;">SHIELD® Scanner</a>
</h1>

### GitHub Pages web interface for SHIELD Framework security assessments

> Simple static web UI for running [SHIELD Framework](https://github.com/Georges034302/SHIELD-framework) scans via GitHub Actions. Upload authorization, configure scan, view results. No servers required.

---

## What Is This?

**SHIELD Scanner** is just a web UI that triggers [SHIELD Framework](https://github.com/Georges034302/SHIELD-framework) container scans via GitHub Actions.

**That's it. Simple as:**
1. Open web page → Configure scan → Upload authorization (if needed)
2. GitHub Actions runs SHIELD Framework container
3. View reports on GitHub Pages

**No servers. No databases. No DevOps. Just GitHub.**

---

## Quick Start (3 Steps)

**1. Fork this repo**
```bash
gh repo fork Georges034302/SHIELD-scanner --clone
```

**2. Enable GitHub Pages**
- Settings → Pages → Source: **GitHub Actions**

**3. Access your scanner**
- `https://<your-username>.github.io/SHIELD-scanner/`

**Done.** Open the URL, paste a GitHub token, run scans.

---

## How It Works

```
User opens scanner at github.io URL
  ↓
Modern dashboard with sidebar + main content:
  - GitHub Connection (token, repo)
  - Scan Configuration (target, mode, profile)
  - Live console + status
  - Report summary (grade, findings, severity breakdown)
  ↓
Submit scan:
  - Token used in-browser only (not stored)
  - Creates ephemeral auth/<runId> branch
  - Uploads authorization file (if required)
  - Dispatches workflow via GitHub API
  ↓
GitHub Actions workflow:
  - Clones SHIELD Framework repository
  - Executes 69 security checks
  - Generates reports (JSON/MD/HTML)
  - Deploys UI + reports to Pages
  ↓
Results:
  - Dashboard auto-refreshes from latest/report.json
  - Standalone report at /latest/report.html (shareable)
  - Download JSON/MD from artifacts
```

**Architecture:**
- **Frontend:** Vanilla HTML/CSS/JS dashboard (index.html, app.js, styles.css)
- **Reports:** JSON-driven UI + standalone HTML report (render/html_from_json.js)
- **Backend:** GitHub Actions + SHIELD Framework (cloned at runtime)
- **Storage:** GitHub Pages (UI + reports) + Artifacts (90 days)
- **Auth:** GitHub PAT in-browser (MVP, cleared after use)

---

## Configuration

**Default:** Clones the latest SHIELD Framework from GitHub at runtime (no setup needed)

---

## Using the Scanner

**1. Open your Pages URL**

**2. Fill in the form:**
- Repository: `your-username/SHIELD-scanner`
- GitHub Token: [Generate token](https://github.com/settings/tokens) with `repo` scope
  - 🔒 Token is used **in-browser only** (not stored, cleared after use)
  - Only transmitted to `api.github.com` via HTTPS
- Target URL: `https://example.com` (⚠️ only scan sites you own or have written authorization)
- Mode: `posture` (safe) or `authorized` (active testing)
- Profile: `quick`, `standard`, or `deep`
- Authorization file: Upload PDF/TXT (required for authorized mode)

**3. Submit** and watch live progress in console

**4. Access reports:**
- Dashboard: Auto-refreshes from `latest/report.json`
- Standalone: `/latest/report.html` (shareable link)
- Downloads: JSON/MD from GitHub Actions artifacts

See [docs/usage.md](docs/usage.md) for detailed instructions.

---

## Scan Modes

**🔵 Posture Mode** (safe, no auth required)
- Passive reconnaissance
- No brute force or active testing
- Use for continuous monitoring

**🔴 Authorized Mode** (requires written authorization)
- Active testing (brute force, auth probing)
- Max 10 login attempts
- Upload authorization document first

Read more about SHIELD Framework modes in the [Framework documentation](https://github.com/Georges034302/SHIELD-framework).

---

## Reports

**Three formats generated:**

1. **JSON** (`report.json`) — Structured data, source of truth
2. **Markdown** (`report.md`) — Complete narrative with remediation guidance
3. **HTML** (`report.html`) — Visual summary on GitHub Pages

**Access:**
- Via Pages: `/latest/report.html` or `/runs/<runId>/report.html`
- Via Artifacts: Download from workflow run (90 day retention)

---

## Project Structure

```
├── index.html              ← Scanner UI (interactive dashboard)
├── app.js                  ← Application logic (GitHub API, report rendering)
├── styles.css              ← UI styling (dark theme)
├── .github/workflows/
│   ├── deploy-ui.yml       ← Deploy UI on push (cold start)
│   └── scan.yml            ← Run scan + deploy reports
├── action/                 ← Container execution scripts
│   └── scripts/
│       ├── run_container.sh
│       └── render_html.sh
├── render/                 ← Standalone report generation
│   ├── html_from_json.js   ← JSON → HTML converter
│   └── template.html       ← Report template (shareable)
└── docs/                   ← Documentation
```

**Two HTML pages:**
- **index.html** — Interactive scanner dashboard (you interact here)
- **report.html** — Standalone report page (generated, shareable)

See [docs/architecture.md](docs/architecture.md) for technical details.

---

## Authorization & Legal

⚠️ **Only scan systems you own or have explicit written authorization to test.**

Unauthorized security testing may violate computer crime laws (CFAA, Computer Misuse Act, etc.).

**Authorized mode performs active testing.** Get written authorization first.

See [docs/usage.md](docs/usage.md) for authorization document template.

---

## Security Notes

- **Token handling:** 
  - Used in-browser only for GitHub API calls
  - **Not stored** in localStorage, sessionStorage, or cookies
  - Cleared from password field after scan completes
  - Only sent to `api.github.com` via HTTPS
  - Production should use GitHub App OAuth flow
- **Privacy:** Use private repositories for sensitive assessments  
- **Cleanup:** Delete auth branches after scans: `git push origin --delete auth/<runId>`
- **Retention:** Artifacts auto-delete after 90 days, Pages persist indefinitely

See [docs/security.md](docs/security.md) for security best practices.

---

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/usage.md](docs/usage.md) | How to use the web interface |
| [docs/deployment.md](docs/deployment.md) | Fork, enable Pages, and optional configurations |
| [docs/architecture.md](docs/architecture.md) | Technical details (how it works) |
| [docs/security.md](docs/security.md) | Security best practices |
| [docs/development.md](docs/development.md) | Contributing and customization |

**Most users only need:** Fork repo → Enable Pages → Use the web UI

---

## Contributing

This is a research framework. For bug reports or feature requests, please open an issue with detailed reproduction steps.

---

## License

Copyright © 2026 Georges Bou Ghantous. All Rights Reserved. — see [LICENSE](LICENSE)

<sub>Use, reproduction, modification, and distribution require explicit written permission from the copyright holder.</sub>

---

## Related Projects

- **[SHIELD Framework](https://github.com/Georges034302/SHIELD-framework)** — Core security assessment engine (69 checks across 6 steps)

---

<br>
<sub><i>© 2026 SHIELD Scanner v1.0 &nbsp;|&nbsp; <a href="https://github.com/Georges034302">Georges Bou Ghantous</a></i></sub>

---