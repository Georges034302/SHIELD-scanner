# SHIELD Scanner Architecture

**Copyright © 2026 Georges Bou Ghantous. All Rights Reserved.**

> **Note:** This is technical reference documentation. Not required for normal use. Read this if you want to understand how the scanner works internally or contribute code.

This document provides a technical deep dive into SHIELD Scanner's architecture, component interactions, and implementation details.

---

## Table of Contents

- [System Architecture](#system-architecture)
- [Component Breakdown](#component-breakdown)
- [Data Flow](#data-flow)
- [GitHub API Integration](#github-api-integration)
- [Workflow Orchestration](#workflow-orchestration)
- [State Management](#state-management)
- [Pages Deployment](#pages-deployment)
- [Security Model](#security-model)
- [Performance Considerations](#performance-considerations)

---

## System Architecture

### High-Level Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     User Browser                                 │
│  ┌────────────────────────────────────────────────────────┐      │
│  │  Static Site (GitHub Pages)                            │      │
│  │  • index.html (UI)                                     │      │
│  │  • app.js (Client logic)                               │      │
│  │  • styles.css (Styling)                                │      │
│  └────────────────┬───────────────────────────────────────┘      │
│                   │ GitHub REST API (HTTPS)                      │
└───────────────────┼──────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                  GitHub Platform                                │
│  ┌──────────────────────────┐   ┌──────────────────────────┐    │
│  │  Git Repository          │   │  GitHub Actions          │    │
│  │  • main branch           │   │  • scan.yml workflow     │    │
│  │  • auth/<runId> branches │   │  • Ubuntu runners        │    │
│  │  • Authorization files   │   │  • Native execution      │    │
│  └──────────┬───────────────┘   └──────────┬───────────────┘    │
│             │                              │                    │
│             │   ┌────────────────────────┐ │                    │
│             └─▶│  Artifacts Storage     │◀┘                    │
│                 │  • report.json         │                      │
│                 │  • report.md           │                      │
│                 │  • report.html         │                      │
│                 └────────────────────────┘                      │
│                               │                                 │
│                               ▼                                 │
│                  ┌─────────────────────────┐                    │
│                  │  GitHub Pages CDN       │                    │
│                  │  • /latest/report.html  │                    │
│                  │  • /runs/<id>/...       │                    │
│                  └─────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│            SHIELD Framework (Cloned at Runtime)                 │
│            (https://github.com/Georges034302/SHIELD-framework)  │
│  • 69 security checks across 6 steps                            │
│  • Multi-format report generation                               │
│  • WordPress authentication support                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### Frontend Layer (Static Site)

#### index.html
```
Purpose: User interface structure
Key sections:
  Sidebar (left):
    - GitHub Connection panel (repository display)
    - User GitHub Token panel (token input with security note)
    - Scan Configuration panel (target, mode, profile, auth file)
    - Run panel (run details and artifact links)
    - Console panel (real-time log output)
  
  Main Content (right):
    - Report Summary header with Clear Report button
    - Download buttons (MD and JSON, state-managed)
    - Summary cards (grade, mode, findings, last updated)
    - Severity breakdown grid
    - Top findings table
```

**UI Layout:**
- Sidebar-content split layout (380px sidebar, flexible content)
- Card-based component design for visual separation
- Responsive: Stacks vertically on mobile (<980px)
- Dark theme optimized for long viewing sessions

**Form Validation:**
- HTML5 `required` attributes on critical fields
- JavaScript content validation for auth files
- Real-time error feedback via status messages
- Pre-flight validation before API calls

**Technical details:**
- Pure HTML5, no templating engine
- Progressive enhancement approach
- Semantic HTML for accessibility
- Responsive grid layout

---

#### app.js
```javascript
// Core responsibilities:
1. Input validation (token, URL, auth file content)
2. GitHub API client wrapper (ghRequest)
3. Authorization branch creation and file upload
4. Workflow dispatch triggering
5. Run discovery via polling
6. Status monitoring loop
7. Report loading with retry logic (exponential backoff)
8. UI state management (buttons, fields, report display)
9. Error handling and logging
```

**Key functions:**

| Function | Purpose | Key Features |
|----------|---------|-------------|
| `validateAuthFile()` | Validates .txt auth file content | Checks for 4 required fields, detailed error messages |
| `createBranch()` | Creates ephemeral auth branch | API: create ref |
| `putFileContents()` | Uploads auth file to branch | API: put contents with base64 encoding |
| `dispatchWorkflow()` | Triggers workflow_dispatch | API: POST dispatch |
| `findDispatchedRun()` | Polls for matching run by name | API: GET runs, matches by auth_branch in run name |
| `getRun()` | Monitors run status | API: GET run/:id |
| `loadLatestReport()` | Loads report with retry logic | Exponential backoff, up to 10 retries |
| `renderReport()` | Renders JSON to dashboard | Updates summary cards, severity grid, findings table |
| `enableDownloadButtons()` | Enables MD/JSON downloads | Removes disabled class |
| `disableDownloadButtons()` | Disables download buttons | Adds disabled class (greyed out) |
| `resetUi()` | Clears input fields only | Resets form to defaults |
| `clearReport()` | Clears report display | Resets all report data, disables downloads |
| `refreshReport()` | Manual report refresh | Retry logic, button feedback |

**Validation Logic:**
```javascript
// Pre-flight validation sequence:
1. Check token present (string length > 0)
2. Check target URL present (string length > 0)
3. If authorized mode:
   a. Check file uploaded (not null)
   b. Check file extension (.txt only)
   c. Read file content as text
   d. Validate presence of 4 required fields:
      - Site to scan: [pattern]
      - Organization: [pattern]
      - Authorizer: [pattern]
      - Admin login: [pattern]
   e. Show detailed error if any field missing
4. Only after validation passes: Clear sensitive fields from DOM
5. Proceed with scan execution
```

**State Management:**
- DOM-based state (no framework)
- Download button states: disabled (initial) → enabled (after report loads) → disabled (on clear)
- Input field clearing: After validation passes (security measure)
- Report loading: Automatic with retry + manual refresh option
- Console log: Append-only with ISO timestamps

**Retry Logic:**
```javascript
// loadLatestReport() retry strategy:
- Initial delay: 3 seconds
- Max retries: 10 (for auto-load after scan)
- Backoff: Exponential (delay *= 1.5 each retry)
- Cache busting: Timestamp query parameter
- Manual refresh: 5 retries with 2-second initial delay
```

---

#### styles.css
```css
Design system:
  - CSS custom properties (variables) for theming
  - System font stack for native look
  - Dark theme (GitHub-inspired color palette)
  - Card-based component layout
  - Status color coding (severity badges)
  - State-based button styles (.disabled, .primary, .link)
  - Responsive breakpoints (mobile-first)
```

**Key CSS Features:**

**Color Variables:**
```css
--primary: #238636 (green, for primary actions)
--danger: #da3633 (red, for destructive actions)
--link: #58a6ff (blue, for links and JSON download)
--crit-bg: rgba(248, 81, 73, 0.12) (critical severity)
--high-bg: rgba(251, 143, 68, 0.12) (high severity)
--med-bg: rgba(245, 200, 66, 0.12) (medium severity)
```

**Button States:**
```css
.btn - Default grey button
.btn.primary - Green button (primary actions)
.btn.disabled - 40% opacity, not-allowed cursor, no pointer events
.btn.link - Transparent with border (secondary actions)
```

**Layout:**
```css
.main-container - Flex container (horizontal split)
.sidebar - 380px fixed width, scrollable
.content - Flexible 1fr, scrollable
@media (max-width: 980px) - Stack vertically
```

**Performance optimizations:**
- No external dependencies (no CDN calls)
- Minimal CSS (~3KB minified)
- No images in CSS (emoji for icons)
- Fast first paint
- Hardware-accelerated transforms for smoothness

---

### Backend Layer (GitHub Actions)

#### Workflow Architecture

**Two complementary workflows:**

1. **deploy-ui.yml** — UI Deployment
   - **Trigger:** Push to main (when index.html, app.js, or styles.css change)
   - **Purpose:** Deploy scanner interface independently
   - **Benefit:** Cold start - UI available immediately after fork, no scan needed
   - **Duration:** ~30 seconds

2. **scan.yml** — Scan Execution + Report Deployment
   - **Trigger:** workflow_dispatch (manual, via scanner UI)
   - **Purpose:** Run security scan + deploy UI + reports
   - **Duration:** 5-30 minutes (depends on profile)

**Why two workflows?**
- **Separation of concerns:** UI updates don't require running scans
- **Faster iteration:** Fix UI bugs without 15-minute scan cycles
- **Cold start solution:** Users can access scanner immediately after forking
- **Independent deployments:** UI and reports update independently

---

#### .github/workflows/scan.yml

**Trigger mechanism:**
```yaml
on:
  workflow_dispatch:
    inputs:
      target_url: string
      mode: choice [posture, authorized]
      profile: choice [quick, standard, deep]
      auth_branch: string
      auth_path: string (optional)
```

**Job structure:**
```
scan (job)
  ├─ Checkout main
  ├─ Checkout authorization branch (conditional)
  ├─ Verify authorization file (conditional)
  ├─ Setup Node.js
  ├─ Run SHIELD + render HTML (composite action)
  ├─ Upload artifacts
  ├─ Prepare Pages content
  ├─ Upload Pages artifact
  └─ Deploy to GitHub Pages
```

**Permissions required:**
```yaml
permissions:
  contents: write     # Clone repo, checkout branches
  actions: read       # Access workflow artifacts
  pages: write        # Deploy to Pages
  id-token: write     # OIDC token for Pages
```

**Concurrency control:**
```yaml
concurrency:
  group: pages        # Shared group with deploy-ui.yml
  cancel-in-progress: false  # Allow queueing
```

> **Note:** Both workflows use `group: pages` to prevent simultaneous Pages deployments (GitHub limitation).

---

#### action/action.yml (Composite Action)

**Purpose:** Encapsulates SHIELD Framework execution logic

**Inputs:**
- `target_url` - Scan target
- `mode` - Assessment mode
- `profile` - Scan depth
- `auth_file_path` - Path to authorization file
- `image` - Container image reference

**Steps:**
1. `run_container.sh` - Execute SHIELD Framework
2. `render_html.sh` - Generate HTML from JSON

**Why composite action?**
- Reusability across workflows
- Encapsulation of complex logic
- Easier testing in isolation
- Versioning independent of workflow

---

### Action Scripts

#### action/scripts/run_container.sh

```bash
Responsibilities:
  1. Validate required inputs
  2. Login to GHCR (if credentials provided)
  3. Build argument array for SHIELD
  4. Mount workspace as /work volume
  5. Execute run_all.sh in container
  6. Verify output files exist
```

**Docker command structure:**
```bash
docker run --rm \
  -v "${GITHUB_WORKSPACE}:/work" \
  -w /work \
  "${IMAGE}" \
  bash -lc "/usr/bin/run_all.sh ${ARGS[*]}"
```

**Volume mounting:**
- Host: `$GITHUB_WORKSPACE` (Actions runner workspace)
- Container: `/work` (working directory)
- Purpose: Share authorization files, write outputs

---

#### action/scripts/render_html.sh

```bash
Responsibilities:
  1. Verify report.json exists
  2. Invoke Node.js renderer
  3. Validate HTML output
```

**Simple orchestration:**
```bash
node render/html_from_json.js \
  output/report.json \
  output/report.html \
  render/template.html
```

---

### Two HTML Pages Architecture

**Critical distinction:** SHIELD Scanner uses two separate HTML pages with different purposes:

#### 1. index.html — Interactive Scanner Dashboard

**Location:** Repository root  
**Purpose:** Primary user interface for submitting and monitoring scans  
**Technology:** Vanilla JavaScript SPA with JSON-driven rendering  

**Features:**
- GitHub connection configuration (repo, token, workflow)
- Scan parameter controls (target, mode, profile)
- Authorization file upload
- Real-time console output and status monitoring
- Live report summary rendering from `latest/report.json`
- Severity breakdown cards (Critical/High/Medium/Low/Info)
- Top 25 findings table
- Download links for JSON/MD reports

**Data source:** Fetches `latest/report.json` and renders interactively

---

#### 2. report.html — Standalone Report Page

**Location:** Generated at `pages/latest/report.html`  
**Purpose:** Shareable, standalone security report (no dependencies)  
**Technology:** Static HTML with inline CSS (fully self-contained)  

**Generation:**
```
report.json → html_from_json.js → report.html
```

**Features:**
- Grade, score, mode, and timing summary cards
- Findings aggregated by step and severity  
- Top 20 Critical/High findings table with evidence
- No external dependencies (CSS inlined)
- Printable and shareable via direct link

**Data source:** Server-side rendered from `report.json` during workflow execution

---

**Why two pages?**
- **index.html:** Interactive dashboard for running scans and viewing live results
- **report.html:** Standalone artifact for sharing, archiving, or compliance documentation
- **Different audiences:** index.html for operators, report.html for stakeholders/auditors
- **Different lifecycles:** index.html is static, report.html is generated per scan

---

### Report Rendering

#### render/html_from_json.js

**Architecture:**
- Input: `report.json` (structured data)
- Template: `template.html` (mustache-style placeholders)
- Output: `report.html` (static HTML)

**Key functions:**

```javascript
must(obj, path)
  // Safe nested property access with error handling

esc(s)
  // HTML entity escaping (prevent XSS)

countsBy(arr, key)
  // Aggregate findings by property

renderTable(rows)
  // Generate HTML tables from finding arrays
```

**Template replacement:**
```javascript
html.replaceAll("{{GRADE}}", esc(grade))
html.replaceAll("{{SCORE}}", esc(score))
html.replaceAll("{{TOP_FINDINGS_TABLE}}", renderTable(highish))
```

**Why not use a template engine?**
- Zero dependencies (portability)
- Simple replacement logic
- Sufficient for static content
- Fast execution (<100ms)

---

## Data Flow

### Authorization Upload Flow

```
1. User selects file in browser
   ↓
2. app.js reads file as ArrayBuffer
   ↓
3. Convert to base64 string
   ↓
4. Get default branch SHA (API call)
   ↓
5. Create new branch auth/<runId> from SHA (API call)
   ↓
6. Commit file to auth_uploads/<runId>/<filename> (API call)
   ↓
7. Return branch name and file path to caller
```

**Code path:**
```javascript
createAuthBranchAndCommitFile({token, owner, repo, runId, file})
  → ghRequest("GET", "/repos/{owner}/{repo}")  // Get default branch
  → ghRequest("GET", "/repos/{owner}/{repo}/git/ref/heads/{branch}")  // Get SHA
  → ghRequest("POST", "/repos/{owner}/{repo}/git/refs")  // Create branch
  → file.arrayBuffer() → base64 encoding
  → ghRequest("PUT", "/repos/{owner}/{repo}/contents/{path}")  // Commit file
  → return {branch, authPath, defaultBranch}
```

**GitHub API specifics:**
- Contents API used for single file commits
- Base64 encoding required for binary files
- Branch must exist before file commit
- Commit message includes runId for traceability

---

### Workflow Dispatch Flow

```
1. Build inputs object from form
   ↓
2. POST to workflow_dispatch endpoint
   ↓
3. GitHub queues workflow run
   ↓
4. Wait for run to appear (polling)
   ↓
5. Parse run metadata (ID, number, URL)
   ↓
6. Return run object to status monitor
```

**API endpoint:**
```
POST /repos/{owner}/{repo}/actions/workflows/{workflow_file}/dispatches
Body: {
  "ref": "main",
  "inputs": {
    "target_url": "https://example.com",
    "mode": "posture",
    "profile": "standard",
    "auth_branch": "auth/123-abc",
    "auth_path": "auth_uploads/123-abc/auth.pdf"
  }
}
```

**Response:** 204 No Content (success) or 404/422 (error)

---

### Run Discovery Flow

**Challenge:** `workflow_dispatch` returns immediately, but run doesn't appear instantly in API

**Solution:** Polling with timeout

```javascript
findWorkflowRunForBranch({token, owner, repo, branch, workflowFile})
  Loop (max 180 seconds):
    → Get workflow ID from file name
    → GET /repos/{owner}/{repo}/actions/workflows/{id}/runs?per_page=10
    → Find run where:
        • head_branch = "main"
        • event = "workflow_dispatch"
        • display_title contains auth branch name
    → If found: return run
    → If not found: wait 5 seconds, retry
  → Timeout: throw error
```

**Why this is hard:**
- Dispatch API doesn't return run ID (GitHub limitation)
- Run may take 1-30 seconds to appear
- Must match by metadata (branch name in display_title)
- Multiple concurrent runs possible

**Matching strategy:**
```javascript
// Primary match: display_title includes auth branch
const match = runs.find(r => 
  r.head_branch === "main" && 
  r.event === "workflow_dispatch" && 
  r.display_title?.includes(branch)
);

// Fallback match: run-name from workflow file
const match2 = runs.find(r =>
  r.head_branch === "main" &&
  r.event === "workflow_dispatch" &&
  r.name?.includes("SHIELD Scan") &&
  r.display_title?.includes(branch)
);
```

---

### Status Monitoring Flow

```
1. Get initial run object
   ↓
2. Poll run status every 6 seconds
   ↓
3. Display status updates to user
   ↓
4. Check status field:
   • "queued" → waiting
   • "in_progress" → running
   • "completed" → done
   ↓
5. Once completed, check conclusion:
   • "success" → scan succeeded
   • "failure" → scan failed
   • "cancelled" → user cancelled
   ↓
6. Display artifacts and Pages links
```

**Polling implementation:**
```javascript
async function pollRunUntilDone({token, owner, repo, runId, onUpdate}) {
  while(true) {
    const run = await ghRequest(token, "GET", 
      `/repos/${owner}/${repo}/actions/runs/${runId}`);
    
    onUpdate(run);  // Callback for UI updates
    
    if(run.status === "completed") {
      return run;  // Exit loop
    }
    
    await new Promise(r => setTimeout(r, 6000));  // Wait 6s
  }
}
```

**Why 6 seconds?**
- Balance between responsiveness and API rate limits
- GitHub Actions status updates ~5-10 second intervals
- Worst case: 5,000 req/hour ÷ 6s = 95 requests max per scan

---

## GitHub API Integration

### Authentication

**Current (MVP):** Personal Access Token in browser
```javascript
const headers = {
  "Authorization": `Bearer ${token}`,
  "Accept": "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28"
};
```

**Production (Recommended):** GitHub App OAuth
```javascript
// OAuth flow:
1. Redirect to GitHub OAuth authorize endpoint
2. User grants permissions
3. GitHub redirects back with code
4. Exchange code for token (server-side)
5. Use token for API calls
```

---

### Rate Limiting

**Limits:**
- Authenticated: 5,000 requests/hour
- Unauthenticated: 60 requests/hour

**Scanner consumption per scan:**
- Authorization upload: 3 requests
- Workflow dispatch: 1 request
- Run discovery: ~10-30 requests (polling)
- Status monitoring: ~10-50 requests (polling)
- **Total: ~25-85 requests per scan**

**Maximum scans per hour:** ~60-200 scans (well within limits)

---

### Error Handling

```javascript
async function ghRequest(token, method, url, body) {
  const res = await fetch(url, opts);
  
  if(!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${method} ${url} failed: 
      ${res.status} ${res.statusText} - ${text}`);
  }
  
  return JSON.parse(await res.text());
}
```

**Common errors:**

| Status | Meaning | Cause |
|--------|---------|-------|
| 401 | Unauthorized | Invalid or expired token |
| 403 | Forbidden | Insufficient permissions or rate limit |
| 404 | Not Found | Repository doesn't exist or no access |
| 422 | Unprocessable Entity | Invalid input data |

---

## Workflow Orchestration

### Lifecycle States

```
Dispatch → Queued → In Progress → Completed
                                      ├─ Success
                                      ├─ Failure
                                      └─ Cancelled
```

**State transitions:**
```yaml
queued:
  # Waiting for runner availability
  # Can take 0-60 seconds depending on queue
  # User sees: "Waiting for runner..."

in_progress:
  # Container is running, checks executing
  # Duration: 2-30 minutes depending on profile
  # User sees: "Running scan (polling status)..."

completed (success):
  # All steps passed, artifacts uploaded
  # User sees: "Completed: success"
  # Next: Display artifact and Pages links

completed (failure):
  # One or more steps failed
  # User sees: "Completed: failure"
  # Next: Link to logs for debugging

completed (cancelled):
  # Manually stopped by user
  # User sees: "Completed: cancelled"
```

---

### Artifact Management

**Upload artifacts:**
```yaml
- uses: actions/upload-artifact@v4
  with:
    name: shield-report
    path: |
      output/report.md
      output/report.json
      output/report.html
```

**Artifact lifecycle:**
- Retention: 90 days (default)
- Access: Requires repository read permission
- Size limit: 2GB per workflow run
- Download: Via API or web UI

**Access via API:**
```javascript
GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts
// Returns list of artifacts with download URLs
```

---

## State Management

### Client-Side State

**No persistent storage** - all state in DOM:

```javascript
// Input state
const config = {
  repo: $("repo").value,
  token: $("token").value,
  workflow: $("workflow").value,
  targetUrl: $("targetUrl").value,
  mode: $("mode").value,
  profile: $("profile").value,
  file: $("authFile").files[0]
};

// Runtime state (displayed in UI)
$("runId").textContent = runId;
$("authBranch").textContent = authBranch;
$("runLink").innerHTML = linkHtml(url, label);
$("log").textContent += logLine;
```

**Why no localStorage/sessionStorage?**
- Token security (don't persist)
- Single-use workflow pattern
- Simplicity (no state hydration)

---

### Server-Side State

**GitHub as state store:**

| State | Storage Location |
|-------|-----------------|
| Authorization file | Git branch `auth/<runId>` |
| Scan outputs | Workflow artifacts (90 days) |
| HTML results | GitHub Pages (indefinite) |
| Execution logs | Workflow run logs (90 days) |
| Input parameters | Workflow run metadata |

**Audit trail:**
```bash
# Historical scans
git log --all --oneline | grep "auth/"

# Branch metadata shows timestamp, uploader
git show auth/123-abc

# Workflow runs API preserves input parameters
GET /repos/{owner}/{repo}/actions/runs
```

---

## Pages Deployment

### Deployment Mechanism

**Modern approach (GitHub Actions):**
```yaml
- name: Prepare Pages content
  shell: bash
  run: |
    mkdir -p pages/latest
    
    # Copy UI files to pages root
    cp index.html app.js styles.css pages/
    cp -r logos pages/
    
    # Copy all three report formats to latest/
    cp output/report.json pages/latest/report.json
    cp output/report.md pages/latest/report.md
    cp output/report.html pages/latest/report.html
    
    # Also save to run-specific folder for history
    SAFE_RUN="${{ inputs.auth_branch }}"
    SAFE_RUN="${SAFE_RUN//\//_}"
    mkdir -p "pages/runs/${SAFE_RUN}"
    cp output/report.json "pages/runs/${SAFE_RUN}/report.json"
    cp output/report.md "pages/runs/${SAFE_RUN}/report.md"
    cp output/report.html "pages/runs/${SAFE_RUN}/report.html"

- uses: actions/upload-pages-artifact@v3
  with:
    path: pages

- uses: actions/deploy-pages@v4
```

**Directory structure deployed to Pages:**
```
pages/
  ├── index.html               # Scanner UI
  ├── app.js                   # Application logic
  ├── styles.css               # Styling
  ├── logos/                   # Brand assets
  ├── latest/
  │   ├── report.json          # Latest scan (JSON format)
  │   ├── report.md            # Latest scan (Markdown format)
  │   └── report.html          # Latest scan (HTML format)
  └── runs/
      ├── auth_123_abc/
      │   ├── report.json      # Historical run 1 (JSON)
      │   ├── report.md        # Historical run 1 (MD)
      │   └── report.html      # Historical run 1 (HTML)
      └── auth_456_def/
          ├── report.json      # Historical run 2 (JSON)
          ├── report.md        # Historical run 2 (MD)
          └── report.html      # Historical run 2 (HTML)
```

**Benefits:**
- All three report formats available via direct URLs
- Versioned history (all runs preserved in /runs/)
- Consistent `/latest/` URL for automation and UI
- Direct linking to specific runs for audit trail
- No artifact download needed for JSON/MD reports

---

### URL Structure

**Patterns:**
```
https://<user>.github.io/<repo>/                       # Scanner UI (index.html)
https://<user>.github.io/<repo>/latest/report.html    # Latest scan (HTML)
https://<user>.github.io/<repo>/latest/report.json    # Latest scan (JSON)
https://<user>.github.io/<repo>/latest/report.md     # Latest scan (Markdown)
https://<user>.github.io/<repo>/runs/<id>/report.html # Specific run (HTML)
https://<user>.github.io/<repo>/runs/<id>/report.json # Specific run (JSON)
https://<user>.github.io/<repo>/runs/<id>/report.md  # Specific run (MD)
```

**URL generation:**
```javascript
// Used by app.js for fetching latest report
function pagesLatestJsonUrl() {
  return `latest/report.json?t=${Date.now()}`; // Relative path + cache bust
}

// Download links in UI
<a href="latest/report.md" download>Download report.md</a>
<a href="latest/report.json" download>Download report.json</a>
```

**Download Button State Management:**
- Buttons initially disabled (`.disabled` class, greyed out)
- Auto-enabled when `loadLatestReport()` succeeds
- Disabled again when "Clear Report" button clicked
- CSS: `opacity: 0.4`, `cursor: not-allowed`, `pointer-events: none`

---

### Cache Considerations

**GitHub Pages CDN caching:**
- Cache-Control: `public, max-age=600` (10 minutes)
- Must wait up to 10 minutes for updates
- Hard refresh bypasses browser cache, not CDN

**Mitigation strategies implemented:**

1. **Retry Logic with Exponential Backoff:**
```javascript
// Automatic retry after scan completion
loadLatestReport(retries = 0, maxRetries = 10, delayMs = 3000)
- Initial delay: 3 seconds
- Max retries: 10 attempts
- Backoff multiplier: 1.5x per retry
- Total wait time: ~90 seconds max

// Manual refresh (faster, fewer retries)
refreshReport() → loadLatestReport(0, 5, 2000)
- Initial delay: 2 seconds
- Max retries: 5 attempts
- User-friendly for quick checks
```

2. **Cache Busting:**
```javascript
fetch(`latest/report.json?t=${Date.now()}`, { cache: "no-store" })
// Timestamp query parameter ensures fresh request
// no-store prevents browser caching
```

3. **URL Immutability:**
- Use `/runs/<id>/` URLs for immutable content (no retries needed)
- `/latest/` expected to have slight delay (handled by retry logic)
- Download links work immediately once enabled (files already deployed)

---

## Security Model

### Trust Boundaries

```
┌─────────────────────────────────────────┐
│  User Browser (Untrusted)               │
│  • Can send arbitrary API requests      │
│  • Token stored in memory only          │
│  • XSS risk mitigated by CSP            │
└──────────────┬──────────────────────────┘
               │ HTTPS + token auth
               ▼
┌─────────────────────────────────────────┐
│  GitHub API (Trusted)                   │
│  • Validates token permissions          │
│  • Enforces rate limits                 │
│  • Audit logs API access                │
└──────────────┬──────────────────────────┘
               │ OIDC + permissions
               ▼
┌─────────────────────────────────────────┐
│  GitHub Actions (Trusted)               │
│  • Isolated runner environment          │
│  • Container execution sandbox          │
│  • No persistent storage                │
└──────────────┬──────────────────────────┘
               │ Docker socket
               ▼
┌─────────────────────────────────────────┐
│  SHIELD Container (Isolated)            │
│  • Read-only filesystem (except /work)  │
│  • No network access to GitHub          │
│  • Limited to scan target only          │
└─────────────────────────────────────────┘
```

---

### Attack Surface

**Client-side (browser):**
- XSS via user input → Mitigated by input sanitization
- Token theft via XSS → Mitigated by CSP headers
- CSRF → Not applicable (no server-side state)

**Server-side (GitHub Actions):**
- Malicious authorization file → Container sandboxing
- Command injection via inputs → Input validation
- Secrets exposure in logs → Masked by GitHub

**Container:**
- Escape to host → Docker security boundaries
- Supply chain attack → Image signature verification
- Malicious scan target → Rate limiting + stability checks

---

## Performance Considerations

### Frontend Performance

**Bundle size:**
- HTML: ~6 KB
- JavaScript: ~8 KB
- CSS: ~2 KB
- **Total: ~16 KB** (single round trip)

**Time to interactive:**
- First paint: <100ms
- JavaScript parse: <50ms
- Ready for input: <200ms

**Optimizations:**
- No framework overhead
- No build step required
- No external dependencies
- Inline critical CSS (optional)

---

### Backend Performance

**Workflow startup time:**
- Queue time: 0-60 seconds (variable)
- Ubuntu runner boot: 5-15 seconds
- Checkout: 1-2 seconds
- Container pull: 5-30 seconds (cached after first run)
- **Total overhead: 10-100 seconds**

**Scan execution time:**
- Quick profile: 2-5 minutes
- Standard profile: 5-15 minutes
- Deep profile: 15-30 minutes

**Parallelization opportunities:**
- Multiple concurrent scans (concurrency: false)
- Container layer caching (automatic)
- Artifact compression (automatic)

---

### API Performance

**Polling overhead:**
- Run discovery: 5-30 seconds (variable)
- Status checks: Every 6 seconds
- Worst case: 300 requests for 30-minute scan
- **Actual: ~50-100 requests per scan**

**Optimization strategies:**
- Exponential backoff (not implemented)
- WebSocket alternative (GitHub doesn't support)
- Webhook callback (requires server)

---

## Scalability

**Single repository handling:**
- Concurrent scans: Limited by runner queue
- Free tier: 2,000 minutes/month
- Paid tier: Unlimited with cost

**Multi-repository setup:**
- Horizontal scaling via repository per client
- Shared SHIELD Framework image
- Centralized secret management

**Enterprise scale:**
- Self-hosted runners for unlimited capacity
- Dedicated runner pools per team
- Custom container registry

---

<sub>© 2026 SHIELD Scanner | [Georges Bou Ghantous](https://github.com/Georges034302)</sub>
