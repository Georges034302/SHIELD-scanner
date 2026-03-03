<h1>
  <img src="logos/shield.png" alt="SHIELD Logo" width="80" align="middle"/> 
  <span style="vertical-align: middle; display: inline-block;">SHIELD® Scanner</span>
</h1>

### GitHub Pages web interface for SHIELD Framework security assessments

> Simple static web UI for running [SHIELD Framework](https://github.com/Georges034302/SHIELD-framework) scans via GitHub Actions. Upload authorization, configure scan, view results. No servers required.

---

## What Is This?

**SHIELD Scanner** is just a web UI (HTML/CSS/JS) that triggers [SHIELD Framework](https://github.com/Georges034302/SHIELD-framework) container scans via GitHub Actions.

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
User opens web page
  ↓
Paste GitHub token + configure scan
  ↓
Upload authorization (if authorized mode)
  ↓
JavaScript calls GitHub API:
  - Create branch auth/<runId>
  - Commit authorization file
  - Dispatch workflow
  ↓
GitHub Actions runs:
  - Pull SHIELD Framework container
  - Execute scan
  - Generate reports (JSON/MD/HTML)
  - Upload to artifacts + Pages
  ↓
User views results:
  - /latest/report.html on Pages
  - Download artifacts from workflow
```

**Stack:**
- Frontend: Vanilla HTML/CSS/JS (no framework)
- Backend: GitHub Actions + SHIELD Framework container
- Storage: GitHub Pages + Artifacts
- Auth: GitHub Personal Access Token (MVP)

---

## Configuration (Optional)

**Default:** Uses public `ghcr.io/Georges034302/SHIELD-framework:latest` (no setup needed)

**Custom SHIELD image:** Add repository secrets:

| Secret | Value |
|--------|-------|
| `GHCR_IMAGE` | `ghcr.io/your-org/shield-framework:latest` |
| `GHCR_USERNAME` | `your-username` |
| `GHCR_TOKEN` | `ghp_...` |

---

## Using the Scanner

**1. Open your Pages URL**

**2. Fill in the form:**
- Repository: `your-username/SHIELD-scanner`
- GitHub Token: [Generate token](https://github.com/settings/tokens) with `repo` scope
- Target URL: `https://example.com`
- Mode: `posture` or `authorized`
- Profile: `quick`, `standard`, or `deep`
- Authorization file: Upload PDF/TXT (required for authorized mode)

**3. Submit** and watch progress in the log panel

**4. Access reports:**
- HTML: `/latest/report.html` on Pages
- Artifacts: Download from GitHub Actions run

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
site/               ← Web UI (HTML/CSS/JS)
.github/workflows/  ← GitHub Actions workflow
action/             ← Container execution scripts
render/             ← Report HTML rendering
docs/               ← Documentation
```

See [docs/architecture.md](docs/architecture.md) for technical details.

---

## Authorization & Legal

⚠️ **Only scan systems you own or have explicit written authorization to test.**

Unauthorized security testing may violate computer crime laws (CFAA, Computer Misuse Act, etc.).

**Authorized mode performs active testing.** Get written authorization first.

See [docs/usage.md](docs/usage.md) for authorization document template.

---

## Security Notes

- **Token:** MVP uses browser-based GitHub token (production should use OAuth)
- **Privacy:** Use private repositories for sensitive assessments  
- **Cleanup:** Delete auth branches after scans: `git push origin --delete auth/<runId>`
- **Retention:** Artifacts auto delete after 90 days

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