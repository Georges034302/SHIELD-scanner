# SHIELD Scanner Usage Guide

**Copyright © 2026 Georges Bou Ghantous. All Rights Reserved.**

> **Note:** This is detailed reference documentation. For quick start, just open the web UI and fill in the form. This guide covers advanced scenarios and troubleshooting.

This document explains how to use the SHIELD Scanner web interface to run security assessments powered by the [SHIELD Framework](https://github.com/Georges034302/SHIELD-framework).

---

## Overview

SHIELD Scanner is a **GitHub Pages + GitHub Actions** deployment that provides:
- Modern interactive dashboard (sidebar + main content)
- Real-time scan execution and status monitoring
- JSON-driven report rendering with severity breakdown
- Authorization file upload via ephemeral branches
- Automated workflow execution via GitHub Actions
- Dual reports: Interactive dashboard + standalone HTML report

**No server infrastructure required** — everything runs on GitHub's platform.

**Two HTML pages:**
1. **index.html** — Interactive scanner dashboard (submit scans, view live results)
2. **report.html** — Standalone report page (generated per scan, shareable)

---

## Access the Scanner

Once deployed to GitHub Pages:

1. Navigate to your Pages URL: `https://<username>.github.io/<repo-name>/`
2. The interface loads as a static HTML page
3. All scan operations are performed via GitHub API calls from your browser

---

## Running a Scan

### Step 1: Connect to GitHub

**Repository Configuration:**
```
Repository: Georges034302/SHIELD-scanner
Workflow file: scan.yml
```

**GitHub Token (MVP):**
- For MVP deployment, you need a Personal Access Token with `repo` scope
- Generate at: [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
- Required scopes: `repo` (full repository access)
- 🔒 **Security:** Token is used **in-browser only** for GitHub API calls
  - Not stored in localStorage, sessionStorage, or cookies
  - Cleared from password field after scan completes
  - Only transmitted to `api.github.com` via HTTPS
  - Never logged or sent to any third party

> ⚠️ **Production Note:** For production deployments, replace with GitHub App OAuth flow for better security.

---

### Step 2: Configure Scan Parameters

#### Target URL
```
https://example.com
```
The website you want to assess. Must be a fully qualified URL including protocol.

#### Mode Selection

**Posture Mode (Default)** — Safe for CI/CD
- Passive reconnaissance only
- No active testing (brute force, authentication probing)
- **Recommended** for continuous monitoring
- No risk flag required

**Authorized Mode** — Active Testing
- Enables brute force lockout testing
- Active authentication probing
- **Requires written authorization**
- Must upload authorization document

#### Profile Selection

| Profile | Description | Estimated Duration |
|---------|-------------|-------------------|
| `quick` | Rapid assessment, essential checks only | 2-5 minutes |
| `standard` | Balanced coverage (recommended) | 5-15 minutes |
| `deep` | Comprehensive scan, all 69 checks | 15-30 minutes |

---

### Step 3: Upload Authorization (Required for Authorized Mode)

**Accepted Formats:**
- PDF (`.pdf`)
- Text (`.txt`)
- Word (`.doc`, `.docx`)
- Images (`.png`, `.jpg`, `.jpeg`)

**Authorization Document Requirements:**
1. Written permission from website owner
2. Scope definition (target URL, IP address)
3. Testing window (start/end dates)
4. Contact information for website owner
5. Your contact information
6. Signatures (digital or scanned)

**Example Authorization Letter:**
```
SECURITY ASSESSMENT AUTHORIZATION

I, [Website Owner Name], hereby authorize [Your Name/Organization] to perform
security assessment activities on the website https://example.com (IP: 192.0.2.1)
during the period of [Start Date] to [End Date].

Authorized activities include:
- Vulnerability scanning
- Authentication testing
- Security configuration review
- Limited brute force testing (max 10 attempts)

Point of Contact:
[Website Owner Name]
[Email]
[Phone]

Authorized Tester:
[Your Name]
[Email]
[Phone]

Signature: ________________    Date: __________
```

---

### Step 4: Start Scan

Click **"Submit Authorization & Start Scan"** to:

1. **Upload Authorization** — Commits file to ephemeral branch `auth/<runId>`
2. **Dispatch Workflow** — Triggers GitHub Actions workflow `scan.yml`
3. **Monitor Progress** — Polls workflow status every 6 seconds
4. **Generate Reports** — Creates JSON, Markdown, and HTML outputs
5. **Publish Results** — Deploys HTML summary to GitHub Pages

---

## Monitoring Scan Progress

### Real-Time Status

The interface displays:
- **Run ID** — Unique identifier for this scan
- **Auth Branch** — Temporary branch storing authorization file (`auth/<runId>`)
- **Workflow Run** — Direct link to GitHub Actions execution
- **Artifacts** — Link to downloadable reports (JSON, MD)
- **HTML (Pages)** — Public HTML summary at `/latest/report.html`

### Log Output

The log panel shows:
```
[2026-03-03T10:30:00.000Z] Creating auth branch auth/1709460600000-abc123...
[2026-03-03T10:30:02.500Z] Committing authorization file to auth_uploads/...
[2026-03-03T10:30:04.200Z] Dispatching workflow scan.yml...
[2026-03-03T10:30:10.100Z] Workflow run found: https://github.com/.../actions/runs/12345
[2026-03-03T10:30:16.000Z] Status: queued
[2026-03-03T10:30:22.000Z] Status: in_progress
[2026-03-03T10:35:40.000Z] Status: completed (success)
```

---

## Understanding Reports

### 1. JSON Report (`report.json`)
**Source of truth** — Structured data for all findings.

```json
{
  "meta": {
    "target": "https://example.com",
    "mode": "posture",
    "profile": "standard",
    "grade": "B",
    "score": 78,
    "started_at": "2026-03-03T10:30:00Z",
    "finished_at": "2026-03-03T10:35:30Z"
  },
  "findings": [
    {
      "check_id": "EXT-002",
      "step": 2,
      "title": "HSTS Header",
      "severity": "CRITICAL",
      "result": "PASS",
      "confidence": "HIGH",
      "evidence": "Strict-Transport-Security: max-age=31536000; includeSubDomains"
    }
  ]
}
```

### 2. Markdown Report (`report.md`)
**Full narrative** — Complete findings with:
- Remediation guidance
- OWASP WSTG mappings
- CWE references
- Risk ratings

### 3. HTML Summary (`report.html`)
**Curated summary** — Rendered from JSON only:
- Grade and score overview
- Top Critical/High findings
- Severity breakdown by step
- Evidence snippets

**Accessible at:** `https://<username>.github.io/<repo>/latest/report.html`

---

## SHIELD Framework Integration

The scanner runs the [SHIELD Framework](https://github.com/Georges034302/SHIELD-framework) container with the following command structure:

```bash
docker run --rm \
  -v "${GITHUB_WORKSPACE}:/work" \
  -w /work \
  "${IMAGE}" \
  bash -lc "/usr/bin/run_all.sh <args>"
```

### Arguments Passed to Framework

**Posture Mode:**
```bash
/usr/bin/run_all.sh https://example.com --mode posture --profile standard
```

**Authorized Mode:**
```bash
/usr/bin/run_all.sh https://example.com \
  --mode authorized \
  --profile deep \
  --i-accept-risk \
  --authorization-ref /work/auth_uploads/<runId>/<filename>
```

### Container Image

Default: `ghcr.io/georges034302/shield-framework:latest`

**Custom image:** Set repository secret `GHCR_IMAGE`
```
GHCR_IMAGE=ghcr.io/yourusername/shield-framework:v2.0
```

**Private registry authentication:**
```
GHCR_USERNAME=<your-username>
GHCR_TOKEN=<your-token>
```

---

## Workflow Architecture

```
┌─────────────────┐
│  GitHub Pages   │  ← Static HTML/JS/CSS
│  (User Browser) │
└────────┬────────┘
         │ 1. Upload auth file
         │    (commit to auth/<runId>)
         │
         │ 2. Dispatch workflow
         ▼
┌─────────────────┐
│ GitHub Actions  │
│   (scan.yml)    │
└────────┬────────┘
         │ 3. Checkout code
         │ 4. Run SHIELD container
         │ 5. Generate reports
         ▼
┌─────────────────┐
│   Artifacts     │  ← report.json, report.md
│  (Downloadable) │
└─────────────────┘
         │
         │ 6. Deploy HTML to Pages
         ▼
┌─────────────────┐
│  GitHub Pages   │  ← /latest/report.html
│    (Results)    │
└─────────────────┘
```

---

## Security Considerations

### Token Security
- **Never share your GitHub token**
- Use fine-grained tokens with minimal scopes
- Rotate tokens regularly
- For production: Implement GitHub App OAuth

### Authorization Files
- Stored in ephemeral branches (`auth/<runId>`)
- Not automatically cleaned up (manual deletion recommended)
- **Use private repositories** for sensitive assessments

### Public vs Private Repos

**Private Repository (Recommended):**
- Authorization files remain private
- Workflow logs hidden from public
- GitHub Pages can be restricted

**Public Repository:**
- Authorization files visible to anyone with repo access
- Workflow logs publicly visible
- Only use for public-facing assessments with non-sensitive data

---

## Troubleshooting

### Workflow Not Starting
1. Verify repository secrets are set correctly
2. Check token has `repo` scope
3. Ensure workflow file is named exactly `scan.yml`
4. Review Actions tab for permission errors

### Container Pull Failures
```
Error: Failed to pull image ghcr.io/georges034302/shield-framework:latest
```

**Solution:** Set `GHCR_USERNAME` and `GHCR_TOKEN` repository secrets for private images.

### Authorization File Not Found
```
ERROR: authorized mode requires auth_file_path
```

**Solution:** Ensure file upload completed before workflow dispatch. Check auth branch exists.

### HTML Not Updating on Pages
- GitHub Pages deployment may take 1-2 minutes
- Hard refresh browser (Ctrl+F5 / Cmd+Shift+R)
- Check Pages deployment in Settings → Pages

---

## API Rate Limits

GitHub API has rate limits:
- **Authenticated:** 5,000 requests/hour
- **Unauthenticated:** 60 requests/hour

Polling workflow status consumes ~10 requests per scan.

**Best Practice:** Use authenticated requests with Personal Access Token.

---

## Advanced Usage

### Manual Workflow Dispatch

Trigger scans via GitHub CLI:
```bash
gh workflow run scan.yml \
  -f target_url=https://example.com \
  -f mode=posture \
  -f profile=standard \
  -f auth_branch=auth/manual-123 \
  -f auth_path=auth_uploads/manual-123/auth.pdf
```

### Programmatic Integration

Use GitHub REST API from any language:
```bash
curl -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/Georges034302/SHIELD-scanner/actions/workflows/scan.yml/dispatches \
  -d '{
    "ref": "main",
    "inputs": {
      "target_url": "https://example.com",
      "mode": "posture",
      "profile": "standard"
    }
  }'
```

---

## Clean Up

### Delete Authorization Branches

After scan completion:
```bash
git push origin --delete auth/<runId>
```

Or via GitHub web interface:
1. Go to repository → Branches
2. Find `auth/<runId>` branches
3. Click delete (trash icon)

### Remove Old Artifacts

GitHub auto-deletes artifacts after 90 days. Manual deletion:
1. Go to Actions → Workflow run
2. Scroll to Artifacts section
3. Click delete (trash icon)

---

## Support

For issues with:
- **SHIELD Framework** → [Framework Issues](https://github.com/Georges034302/SHIELD-framework/issues)
- **SHIELD Scanner** → [Scanner Issues](https://github.com/Georges034302/SHIELD-scanner/issues)

---

<sub>© 2026 SHIELD Scanner | [Georges Bou Ghantous](https://github.com/Georges034302)</sub>
