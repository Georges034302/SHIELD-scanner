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

The UI is split into two panels for clarity:

**Panel 1: GitHub Connection**
```
Repository: Georges034302/SHIELD-scanner
```
- Repository information is auto-detected from the GitHub Pages URL
- Shows the repository where scans will be executed

**Panel 2: User GitHub Token**
- **Required** — Scan will not start without a valid token
- Generate at: [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
- Required scopes: `repo` (full repository access)
- 🔒 **Security:** Token is used **in-browser only** for GitHub API calls
  - Not stored in localStorage, sessionStorage, or cookies
  - Cleared from password field immediately after scan dispatches
  - Only transmitted to `api.github.com` via HTTPS
  - Never logged or sent to any third party

> ⚠️ **Production Note:** For production deployments, replace with GitHub App OAuth flow for better security.

---

### Step 2: Configure Scan Parameters

#### Target URL
```
https://example.com
```
- The website you want to assess
- Must be a fully qualified URL including protocol
- **Required** — Scan will not start without a valid URL
- Validated before scan execution

#### Mode Selection

**Posture Mode (Default)** — Safe for CI/CD
- Passive reconnaissance only
- No active testing (brute force, authentication probing)
- **Recommended** for continuous monitoring
- No authorization file required

**Authorized Mode** — Active Testing
- Enables brute force lockout testing
- Active authentication probing
- **Requires written authorization file**
- Must upload valid .txt authorization document

#### Profile Selection

| Profile | Description | Estimated Duration |
|---------|-------------|-------------------|
| `quick` | Rapid assessment, essential checks only | 2-5 minutes |
| `standard` | Balanced coverage (recommended) | 5-15 minutes |
| `deep` | Comprehensive scan, all 69 checks | 15-30 minutes |

---

### Step 3: Upload Authorization (Required for Authorized Mode)

**Important: File format changed to .txt only for security and validation purposes.**

**Accepted Format:**
- Text files only (`.txt`)

**Authorization File Requirements:**

The .txt file must contain these **four required fields**:

1. **Site to scan:** [Full URL]
2. **Organization:** [Organization name]
3. **Authorizer:** [Name of person granting authorization]
4. **Admin login:** [Admin email/username or "N/A"]

**Format Example:**

```txt
Site to scan: https://example.com
Organization: Example Corporation
Authorizer: John Doe
Admin login: admin@example.com
```

Or if no admin credentials:
```txt
Site to scan: https://example.com
Organization: Example Corporation
Authorizer: Jane Smith
Admin login: N/A
```

**Field Validation:**
- The UI validates all four fields are present before allowing scan to start
- Field names are case-insensitive
- Fields can be in any order
- Missing fields will show error message with list of missing items

**Additional Content (Optional):**

You may include additional information in the file:

```txt
Site to scan: https://example.com
Organization: Example Corporation
Authorizer: John Doe (Security Manager)
Admin login: admin@example.com

SECURITY ASSESSMENT AUTHORIZATION

Written permission granted to perform security assessment activities
during the period of January 1, 2026 to January 31, 2026.

Authorized activities include:
- Vulnerability scanning
- Authentication testing
- Security configuration review
- Limited brute force testing (max 10 attempts)

Point of Contact: info@example.com
Phone: (555) 123-4567

Signature: [Digitally signed or acknowledged]
Date: January 1, 2026
```

---

### Step 4: Start Scan

**Pre-flight Validation:**

Before the scan starts, the UI validates:
- ✅ GitHub token is present (field not empty)
- ✅ Target URL is present (field not empty)
- ✅ For authorized mode: Authorization file is uploaded
- ✅ For authorized mode: Authorization file is .txt format
- ✅ For authorized mode: All four required fields are present in the file

If validation fails, you'll see a detailed error message explaining what's missing.

**Submit & Start Button:**

Click **"Submit & Start"** to begin the scan:

1. **Validation Phase** — Checks all inputs and auth file content
2. **Upload Authorization** — Commits file to ephemeral branch `auth/<runId>` (if in authorized mode)
3. **Dispatch Workflow** — Triggers GitHub Actions workflow `scan.yml` via API
4. **Monitor Progress** — Polls workflow status every 6 seconds
5. **Wait for Pages** — Waits for GitHub Pages to deploy reports (up to 10 retries with exponential backoff)
6. **Auto-refresh** — Loads report data automatically and enables download buttons

**During Scan:**
- Console shows real-time status updates
- Status line shows current operation
- Run ID, auth branch, and workflow links are populated
- Download buttons remain disabled (greyed out)

**After Scan Completes:**
- Status shows "✓ Done - Report loaded successfully"
- Dashboard auto-refreshes with report data (grade, findings, severity breakdown)
- Download buttons become enabled (blue, clickable)
- Console confirms report loaded

---

## UI Controls Reference

### Primary Buttons

**Submit & Start**
- Validates all inputs before starting
- Clears sensitive data (token, URL, file selection) from DOM after validation
- Disables during scan execution
- Re-enables after scan completes

**Reset**
- Clears all input fields (token, target URL, file selection)
- Resets mode to "posture" and profile to "standard"
- Does not affect displayed report data
- Use this to start fresh without clearing results

### Report Controls

**Clear Report**
- Clears all displayed scan results (grade, findings, severity counts)
- Resets run information (Run ID, auth branch, links)
- Resets console log to "Waiting…"
- Disables download buttons (back to greyed out state)
- Always clickable, even when no data is loaded
- Use this to clean up the UI after viewing results

**Refresh from latest/report.json**
- Manually reloads report data from GitHub Pages
- Shows "Refreshing..." text while loading
- Retries up to 5 times with 2-second delays
- Enables download buttons if report loads successfully
- Use this if auto-refresh fails or you want to load updated data

**Download report.md** / **Download report.json**
- Initially disabled (greyed out, 40% opacity)
- Automatically enabled when report loads successfully
- Downloads reports directly from `/latest/` on GitHub Pages
- Both buttons are blue (primary color) to emphasize importance
- Remain enabled until "Clear Report" is clicked

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
