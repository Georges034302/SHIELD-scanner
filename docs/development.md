# SHIELD Scanner Development Guide

**Copyright © 2026 Georges Bou Ghantous. All Rights Reserved.**

> **Note:** This guide is for contributors and developers customizing the scanner. Not needed for normal use.

This guide is for developers who want to contribute to SHIELD Scanner, customize it for specific use cases, or understand the codebase.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Local Development](#local-development)
- [Testing](#testing)
- [Customization Guide](#customization-guide)
- [Contributing](#contributing)
- [Release Process](#release-process)

---

## Development Setup

### Prerequisites

**Required:**
- Git 2.x+
- Node.js 20+ (for report rendering)
- Docker 20+ (for local container testing)
- GitHub CLI (`gh`) 2.x+ (optional but recommended)

**Optional:**
- VS Code with extensions:
  - GitHub Actions
  - YAML
  - ESLint
  - Prettier

---

### Clone Repository

```bash
# Clone via HTTPS
git clone https://github.com/Georges034302/SHIELD-scanner.git
cd SHIELD-scanner

# Or via SSH
git clone git@github.com:Georges034302/SHIELD-scanner.git
cd SHIELD-scanner

# Or via GitHub CLI
gh repo clone Georges034302/SHIELD-scanner
cd SHIELD-scanner
```

---

### Install Dependencies

```bash
# No npm install needed - zero build dependencies!
# Only Node.js runtime required for render script

# Verify Node.js version
node --version  # Should be 20.x or higher

# Verify Docker
docker --version

# Verify GitHub CLI (optional)
gh --version
```

---

## Project Structure

```
SHIELD-scanner/
├── .github/
│   └── workflows/
│       └── scan.yml                # Main workflow orchestration
├── action/
│   ├── action.yml                  # Composite action definition
│   └── scripts/
│       ├── run_container.sh        # SHIELD Framework execution
│       └── render_html.sh          # Report rendering orchestration
├── auth_uploads/                   # Authorization files (ephemeral branches)
├── docs/
│   ├── architecture.md             # Technical architecture
│   ├── deployment.md               # Deployment scenarios
│   ├── development.md              # This file
│   ├── security.md                 # Security model
│   └── usage.md                    # End-user guide
├── logos/
│   └── shield.png                  # Logo for README
├── render/
│   ├── html_from_json.js           # JSON → HTML converter
│   └── template.html               # HTML report template
├── site/
│   ├── app.js                      # Client-side application logic
│   ├── index.html                  # User interface
│   └── styles.css                  # UI styling
├── LICENSE                         # All Rights Reserved license
└── README.md                       # Project overview
```

---

### File Responsibilities

#### Frontend (Static Site)

**site/index.html**
- User interface markup
- Form inputs for scan configuration
- Status display panels
- Log output terminal

**site/app.js**
- GitHub API client (`ghRequest`)
- Authorization file upload (`createAuthBranchAndCommitFile`)
- Workflow dispatch (`dispatchWorkflow`)
- Run discovery and monitoring (`findWorkflowRunForBranch`, `pollRunUntilDone`)
- UI updates and logging

**site/styles.css**
- Visual design system
- Responsive layout (mobile-first)
- Component styling (cards, buttons, inputs)

---

#### Backend (GitHub Actions)

**.github/workflows/scan.yml**
- Workflow inputs definition
- Job orchestration
- Permissions declaration
- Artifact upload
- Pages deployment

**action/action.yml**
- Composite action interface
- Input validation
- Step sequencing

**action/scripts/run_container.sh**
- Container execution wrapper
- Argument parsing and validation
- GHCR authentication
- Output verification

**action/scripts/render_html.sh**
- Report rendering orchestration
- Error handling

---

#### Report Rendering

**render/html_from_json.js**
- JSON parsing and validation
- Data transformation
- HTML generation
- Security (HTML escaping)

**render/template.html**
- HTML structure
- Inline CSS
- Placeholder syntax (`{{VARIABLE}}`)

---

## Local Development

### Running the Frontend Locally

```bash
# Serve static site using Python HTTP server
cd site
python3 -m http.server 8000

# Or using Node.js http-server
npx http-server -p 8000

# Access at: http://localhost:8000
```

**Mock GitHub API (optional):**
```javascript
// Add to app.js for local testing
const MOCK_MODE = window.location.hostname === 'localhost';

async function ghRequest(token, method, url, body) {
  if (MOCK_MODE) {
    return mockGhRequest(method, url, body);
  }
  // ... normal implementation
}

function mockGhRequest(method, url, body) {
  console.log(`MOCK: ${method} ${url}`, body);
  
  if (url.includes('/git/refs')) {
    return { ref: 'refs/heads/mock-branch', object: { sha: 'abc123' } };
  }
  
  if (url.includes('/contents/')) {
    return { content: { path: 'auth_uploads/mock/file.pdf' } };
  }
  
  // ... more mocks
}
```

---

### Testing Workflow Locally

**Using `act` (GitHub Actions local runner):**

```bash
# Install act
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | bash

# Run workflow locally
act workflow_dispatch \
  -e test-event.json \
  -s GITHUB_TOKEN=$(gh auth token) \
  --container-architecture linux/amd64

# test-event.json:
{
  "inputs": {
    "target_url": "https://example.com",
    "mode": "posture",
    "profile": "quick",
    "auth_branch": "auth/test-123",
    "auth_path": ""
  }
}
```

**Limitations:**
- `act` doesn't support all GitHub Actions features
- Pages deployment won't work locally
- Some composite action features may differ

---

### Testing Report Rendering

```bash
# Create sample report.json
cat > output/report.json <<EOF
{
  "meta": {
    "target": "https://example.com",
    "mode": "posture",
    "profile": "standard",
    "grade": "B",
    "score": 78,
    "started_at": "2026-03-03T10:00:00Z",
    "finished_at": "2026-03-03T10:15:00Z"
  },
  "findings": [
    {
      "check_id": "EXT-001",
      "step": 2,
      "title": "HTTPS Redirect",
      "severity": "HIGH",
      "result": "PASS",
      "confidence": "HIGH",
      "evidence": "HTTP redirects to HTTPS"
    }
  ]
}
EOF

# Run renderer
node render/html_from_json.js \
  output/report.json \
  output/report.html \
  render/template.html

# View output
open output/report.html  # macOS
xdg-open output/report.html  # Linux
```

---

### Testing Container Locally

```bash
# Pull SHIELD Framework image
docker pull ghcr.io/Georges034302/SHIELD-framework:latest

# Run scan locally (posture mode)
docker run --rm \
  -v "$(pwd):/work" \
  -w /work \
  ghcr.io/Georges034302/SHIELD-framework:latest \
  bash -lc "/usr/bin/run_all.sh https://example.com --mode posture --profile quick"

# Check outputs
ls -la output/
cat output/report.json | jq .meta
```

---

## Testing

### Manual Testing Checklist

#### Frontend Tests

- [ ] **Form validation**
  - Empty repository field → Error
  - Invalid repository format → Error
  - Empty target URL → Error
  - Missing auth file in authorized mode → Error

- [ ] **GitHub API integration**
  - Invalid token → 401 error displayed
  - Token without `repo` scope → 403 error
  - Non-existent repository → 404 error

- [ ] **File upload**
  - PDF file → Success
  - Large file (>10MB) → Success
  - Invalid file type → Accept anyway (GitHub validates)

- [ ] **Workflow dispatch**
  - Posture mode → No auth file required
  - Authorized mode → Auth file required
  - Quick profile → Fast execution
  - Deep profile → Long execution

- [ ] **Status monitoring**
  - Queued state → Shows waiting message
  - In progress state → Shows running message
  - Completed (success) → Shows artifact links
  - Completed (failure) → Shows error message

- [ ] **UI responsiveness**
  - Desktop (1920x1080) → Full layout
  - Tablet (768x1024) → Responsive grid
  - Mobile (375x667) → Single column

---

#### Backend Tests

```bash
# Test workflow dispatch
gh workflow run scan.yml \
  -f target_url=https://example.com \
  -f mode=posture \
  -f profile=quick \
  -f auth_branch=auth/test-123 \
  -f auth_path=""

# Wait for completion
gh run watch

# Check artifacts
gh run list --limit 1
gh run view --log

# Download artifact
gh run download

# Verify outputs
ls -la shield-report/
cat shield-report/report.json | jq .
```

---

### Automated Testing

**ESLint for JavaScript:**

```bash
# Install ESLint (dev only)
npm install --save-dev eslint

# Create .eslintrc.json
cat > .eslintrc.json <<EOF
{
  "env": {
    "browser": true,
    "es2021": true,
    "node": true
  },
  "extends": "eslint:recommended",
  "parserOptions": {
    "ecmaVersion": 12
  },
  "rules": {
    "no-unused-vars": "warn",
    "no-console": "off"
  }
}
EOF

# Run linter
npx eslint site/app.js render/html_from_json.js
```

---

**ShellCheck for bash scripts:**

```bash
# Install ShellCheck
brew install shellcheck  # macOS
apt install shellcheck   # Ubuntu

# Check scripts
shellcheck action/scripts/*.sh

# Fix common issues
shellcheck -f diff action/scripts/run_container.sh | patch
```

---

**Validate YAML:**

```bash
# Install yamllint
pip install yamllint

# Check workflow files
yamllint .github/workflows/*.yml action/*.yml

# Create .yamllint config
cat > .yamllint <<EOF
extends: default
rules:
  line-length:
    max: 120
  indentation:
    spaces: 2
EOF
```

---

**HTML validation:**

```bash
# Install html-validator
npm install -g html-validator-cli

# Validate HTML
html-validator site/index.html
html-validator render/template.html

# Or use W3C validator online
curl -H "Content-Type: text/html; charset=utf-8" \
  --data-binary @site/index.html \
  https://validator.w3.org/nu/?out=json
```

---

### Integration Tests

```bash
#!/bin/bash
# test-integration.sh - End-to-end integration test

set -euo pipefail

REPO="Georges034302/SHIELD-scanner"
TARGET="https://example.com"
TOKEN="${GITHUB_TOKEN}"

echo "=== Integration Test ==="

# 1. Dispatch workflow
echo "Dispatching workflow..."
RUN_ID=$(gh api "/repos/${REPO}/actions/workflows/scan.yml/dispatches" \
  -f ref=main \
  -f inputs[target_url]="${TARGET}" \
  -f inputs[mode]=posture \
  -f inputs[profile]=quick \
  -f inputs[auth_branch]=auth/test-$(date +%s) \
  -f inputs[auth_path]="" \
  -X POST && echo "OK")

# 2. Wait for run to complete
echo "Waiting for completion..."
sleep 10  # Wait for run to appear

LATEST_RUN=$(gh api "/repos/${REPO}/actions/runs?per_page=1" --jq '.workflow_runs[0].id')

while true; do
  STATUS=$(gh api "/repos/${REPO}/actions/runs/${LATEST_RUN}" --jq '.status')
  echo "Status: ${STATUS}"
  
  if [ "${STATUS}" = "completed" ]; then
    break
  fi
  
  sleep 10
done

# 3. Check conclusion
CONCLUSION=$(gh api "/repos/${REPO}/actions/runs/${LATEST_RUN}" --jq '.conclusion')
echo "Conclusion: ${CONCLUSION}"

if [ "${CONCLUSION}" != "success" ]; then
  echo "FAIL: Workflow did not complete successfully"
  exit 1
fi

# 4. Download artifacts
echo "Downloading artifacts..."
gh run download "${LATEST_RUN}" -n shield-report

# 5. Validate outputs
echo "Validating outputs..."
test -f shield-report/report.json || { echo "FAIL: report.json missing"; exit 1; }
test -f shield-report/report.md || { echo "FAIL: report.md missing"; exit 1; }
test -f shield-report/report.html || { echo "FAIL: report.html missing"; exit 1; }

# 6. Validate JSON structure
jq -e '.meta.target' shield-report/report.json > /dev/null || { echo "FAIL: Invalid JSON"; exit 1; }
jq -e '.findings | length > 0' shield-report/report.json > /dev/null || { echo "FAIL: No findings"; exit 1; }

echo "SUCCESS: All tests passed"
```

---

## Customization Guide

### Custom Branding

**Update logo and title:**

```html
<!-- site/index.html -->
<h1>
  <img src="logos/custom-logo.png" alt="Custom Logo" width="80" align="middle"/> 
  <span>My Custom Scanner</span>
</h1>
```

**Change color scheme:**

```css
/* site/styles.css */
:root{
  --bg:#ffffff;          /* Background color */
  --fg:#0f172a;          /* Text color */
  --muted:#64748b;       /* Muted text */
  --card:#f8fafc;        /* Card background */
  --border:#e2e8f0;      /* Border color */
  --btn:#0ea5e9;         /* Primary button */
  --btn2:#e2e8f0;        /* Secondary button */
}
```

---

### Custom Scan Profiles

**Add new profile to workflow:**

```yaml
# .github/workflows/scan.yml
inputs:
  profile:
    type: choice
    options: 
      - quick
      - standard
      - deep
      - custom-pentest  # ADD NEW
```

**Map to SHIELD Framework arguments:**

```bash
# action/scripts/run_container.sh
ARGS=( "${TARGET_URL}" "--mode" "${MODE}" "--profile" "${PROFILE}" )

# Add custom profile handling
if [[ "${PROFILE}" == "custom-pentest" ]]; then
  ARGS+=( "--aggressive" "--max-threads" "10" "--timeout" "30" )
fi
```

---

### Custom Report Sections

**Extend JSON structure:**

```javascript
// render/html_from_json.js

// Add new section
const customMetrics = {
  totalChecks: findings.length,
  passRate: findings.filter(f => f.result === "PASS").length / findings.length * 100,
  avgConfidence: findings.reduce((sum, f) => sum + confidenceScore(f.confidence), 0) / findings.length
};

// Update template
const html = tpl
  .replaceAll("{{GRADE}}", esc(grade))
  .replaceAll("{{CUSTOM_METRICS}}", renderCustomMetrics(customMetrics));  // ADD
```

**Update template:**

```html
<!-- render/template.html -->
<div class="card">
  <div class="k">Custom Metrics</div>
  <div>{{CUSTOM_METRICS}}</div>
</div>
```

---

### Custom Authentication Methods

**Replace GitHub token with OAuth:**

```javascript
// site/app.js - Add OAuth flow
async function githubOAuthLogin() {
  const clientId = "Iv1.abc123";  // Your GitHub App client ID
  const redirectUri = "https://scanner.example.com/callback";
  const scope = "repo";
  
  const authUrl = `https://github.com/login/oauth/authorize?` +
    `client_id=${clientId}&` +
    `redirect_uri=${redirectUri}&` +
    `scope=${scope}`;
  
  window.location.href = authUrl;
}

// Handle callback
async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  
  if (!code) return;
  
  // Exchange code for token via serverless function
  const response = await fetch('https://api.example.com/oauth/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  
  const { access_token } = await response.json();
  sessionStorage.setItem('github_token', access_token);
  
  // Redirect to main page
  window.location.href = '/';
}

// Update main() to check for OAuth token
if (window.location.pathname === '/callback') {
  handleOAuthCallback();
}
```

---

### Custom Workflow Triggers

**Add scheduled scans:**

```yaml
# .github/workflows/scan.yml
on:
  workflow_dispatch:
    # ... existing inputs
  
  schedule:
    - cron: '0 2 * * 1'  # Weekly Monday 2 AM

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      # ... existing steps
      
      # Use default configuration for scheduled scans
      - name: Set default inputs
        if: github.event_name == 'schedule'
        run: |
          echo "target_url=https://example.com" >> $GITHUB_ENV
          echo "mode=posture" >> $GITHUB_ENV
          echo "profile=standard" >> $GITHUB_ENV
```

---

### Custom Notification Webhooks

**Add Slack notification:**

```yaml
# .github/workflows/scan.yml
jobs:
  scan:
    # ... existing steps
    
    - name: Notify Slack
      if: always()
      env:
        SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
      run: |
        CONCLUSION="${{ job.status }}"
        COLOR=$([ "$CONCLUSION" = "success" ] && echo "good" || echo "danger")
        
        curl -X POST "${SLACK_WEBHOOK}" \
          -H 'Content-Type: application/json' \
          -d "{
            \"attachments\": [{
              \"color\": \"${COLOR}\",
              \"title\": \"SHIELD Scan Completed\",
              \"fields\": [
                {\"title\": \"Target\", \"value\": \"${{ inputs.target_url }}\", \"short\": true},
                {\"title\": \"Status\", \"value\": \"${CONCLUSION}\", \"short\": true},
                {\"title\": \"Report\", \"value\": \"<https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Results>\"}
              ]
            }]
          }"
```

---

## Contributing

### Contribution Workflow

1. **Fork repository**
   ```bash
   gh repo fork Georges034302/SHIELD-scanner --clone
   cd SHIELD-scanner
   ```

2. **Create feature branch**
   ```bash
   git checkout -b feature/my-new-feature
   ```

3. **Make changes**
   - Write code
   - Add tests
   - Update documentation

4. **Test locally**
   ```bash
   # Run all tests
   npm test  # (if test script added)
   shellcheck action/scripts/*.sh
   eslint site/app.js render/html_from_json.js
   ```

5. **Commit changes**
   ```bash
   git add .
   git commit -m "feat: Add new feature"
   
   # Follow conventional commits:
   # feat: New feature
   # fix: Bug fix
   # docs: Documentation
   # style: Formatting
   # refactor: Code restructuring
   # test: Tests
   # chore: Maintenance
   ```

6. **Push and create PR**
   ```bash
   git push origin feature/my-new-feature
   gh pr create \
     --title "Add new feature" \
     --body "Description of changes"
   ```

---

### Code Style Guide

**JavaScript (ESLint):**
```javascript
// ✅ Good
async function fetchData(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

// ❌ Bad
async function fetchData(url){
  const response=await fetch(url)
  if(!response.ok){throw new Error(`HTTP ${response.status}`)}
  return response.json()
}
```

**Bash (ShellCheck):**
```bash
# ✅ Good
set -euo pipefail
readonly TARGET_URL="${1:?target_url required}"
echo "Scanning: ${TARGET_URL}"

# ❌ Bad
TARGET_URL=$1
echo "Scanning: $TARGET_URL"
```

**HTML:**
```html
<!-- ✅ Good -->
<label for="target">
  Target URL
  <input id="target" type="url" required />
</label>

<!-- ❌ Bad -->
<label>
  Target URL
  <input type=url required>
</label>
```

---

### Pull Request Guidelines

**PR title format:**
```
<type>(<scope>): <subject>

Examples:
- feat(frontend): Add dark mode toggle
- fix(workflow): Correct artifact paths
- docs(usage): Update authorization requirements
- refactor(renderer): Simplify HTML escaping
```

**PR description template:**
```markdown
## Description
Brief description of changes

## Motivation
Why is this change needed?

## Changes
- Change 1
- Change 2
- Change 3

## Testing
- [ ] Manual testing completed
- [ ] Automated tests pass
- [ ] Documentation updated

## Screenshots (if applicable)
[Add screenshots]

## Related Issues
Fixes #123
```

---

### Review Checklist

Reviewers should verify:

- [ ] Code follows project style guide
- [ ] Tests added/updated as needed
- [ ] Documentation updated
- [ ] No security issues introduced
- [ ] No breaking changes (or documented)
- [ ] Commit messages follow convention
- [ ] PR description complete
- [ ] CI checks pass

---

## Release Process

### Versioning

**Semantic versioning:** `MAJOR.MINOR.PATCH`

- **MAJOR:** Breaking changes
- **MINOR:** New features (backward compatible)
- **PATCH:** Bug fixes

**Examples:**
- `1.0.0` → `1.0.1` (bug fix)
- `1.0.1` → `1.1.0` (new feature)
- `1.1.0` → `2.0.0` (breaking change)

---

### Creating a Release

```bash
# 1. Update version
vim README.md  # Update version badge/reference

# 2. Update changelog
cat >> CHANGELOG.md <<EOF
## [1.1.0] - 2026-03-03

### Added
- Dark mode toggle
- Custom scan profiles
- Slack notifications

### Fixed
- XSS vulnerability in report rendering
- Token expiration handling

### Changed
- Improved error messages
EOF

# 3. Commit changes
git add .
git commit -m "chore: Prepare v1.1.0 release"

# 4. Create tag
git tag -a v1.1.0 -m "Release v1.1.0"

# 5. Push
git push origin main --tags

# 6. Create GitHub release
gh release create v1.1.0 \
  --title "SHIELD Scanner v1.1.0" \
  --notes-file CHANGELOG.md
```

---

### Hotfix Process

For critical bugs in production:

```bash
# 1. Create hotfix branch from tag
git checkout -b hotfix/1.0.1 v1.0.0

# 2. Fix bug
# ... make changes

# 3. Test thoroughly
# ... run tests

# 4. Commit and tag
git commit -m "fix: Critical security issue"
git tag -a v1.0.1 -m "Hotfix v1.0.1"

# 5. Merge to main
git checkout main
git merge hotfix/1.0.1

# 6. Push
git push origin main --tags

# 7. Create release
gh release create v1.0.1 \
  --title "SHIELD Scanner v1.0.1 (Hotfix)" \
  --notes "Critical security fix"
```

---

## Troubleshooting Development Issues

### Issue: `act` fails with permissions error

```bash
# Solution: Run with sudo or add user to docker group
sudo act workflow_dispatch

# Or permanently:
sudo usermod -aG docker $USER
newgrp docker
```

---

### Issue: Report rendering fails locally

```bash
# Solution: Ensure Node.js 20+
node --version

# Update Node.js via nvm
nvm install 20
nvm use 20
```

---

### Issue: Container pull fails

```bash
# Solution: Authenticate with GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Or use gh CLI
gh auth token | docker login ghcr.io -u $(gh api user --jq .login) --password-stdin
```

---

## Resources

**Documentation:**
- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [GitHub API Docs](https://docs.github.com/en/rest)
- [SHIELD Framework](https://github.com/Georges034302/SHIELD-framework)

**Tools:**
- [act - Local Actions runner](https://github.com/nektos/act)
- [ESLint](https://eslint.org/)
- [ShellCheck](https://www.shellcheck.net/)
- [yamllint](https://yamllint.readthedocs.io/)

---

<sub>© 2026 SHIELD Scanner | [Georges Bou Ghantous](https://github.com/Georges034302)</sub>
