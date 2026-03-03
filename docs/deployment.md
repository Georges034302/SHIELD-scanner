# SHIELD Scanner Deployment Guide

**Copyright © 2026 Georges Bou Ghantous. All Rights Reserved.**

SHIELD Scanner is a static HTML/JS site that runs entirely on GitHub Pages. No servers, no databases, no complex infrastructure. This guide covers the simple deployment process.

---

## Quick Deployment (3 Steps)

**That's it. You're done.**

1. **Fork or clone this repository**
2. **Enable GitHub Pages:** Settings → Pages → Source: **GitHub Actions**
3. **Access your scanner:** `https://<username>.github.io/SHIELD-scanner/`

---

## Deployment Options

---

## Deployment Options

### Personal Use (Recommended)

```bash
# Fork or clone
gh repo fork Georges034302/SHIELD-scanner --clone
cd SHIELD-scanner

# Enable Pages via GitHub UI or CLI
gh api -X PATCH /repos/Georges034302/SHIELD-scanner \
  -f pages[source][branch]=main
```

**Access:** `https://<your-username>.github.io/SHIELD-scanner/`

---

### Organization Use

Same process, just create the repo in your organization namespace:

```bash
gh repo create myorg/shield-scanner --private --clone
cd shield-scanner

# Copy files from original repo
# Enable Pages: Settings → Pages → Source: GitHub Actions
```

**Access:** `https://myorg.github.io/shield-scanner/`

---

### Template vs Fork

**Fork:** Keep connection to upstream for updates (can't be private on free plans)

**Template:** Independent copy, can be private immediately

Most users should **fork** for easier updates.

---

## Optional Configuration

### Private Repository

**When to use:** Sensitive assessments, client work

**Requirements:** GitHub Pro/Team/Enterprise

**Setup:** Settings → General → Danger Zone → Change visibility → Private

**Note:** Pages can still be public unless you have GitHub Enterprise.

---

### Custom Domain

**Setup:**

1. Add CNAME DNS record: `scanner.yourdomain.com` → `<username>.github.io`
2. Settings → Pages → Custom domain: `scanner.yourdomain.com`
3. Wait for SSL certificate (1-24 hours)
4. ✓ Enforce HTTPS

**Access:** `https://scanner.yourdomain.com/`

---

### Repository Secrets

**None required.** The scanner clones the SHIELD Framework directly from GitHub at runtime.

---

## Troubleshooting

### Pages Not Building

**Symptom:** "Your site is ready to be published" but nothing happens

**Solution:**
1. Check Actions tab for workflow runs
2. Verify Pages source is "GitHub Actions" (not a branch)
3. Wait 2-3 minutes for first deployment

---

### Custom Domain Not Working

**Symptom:** DNS errors or SSL issues

**Solution:**
1. Verify DNS with: `dig scanner.yourdomain.com`
2. Wait 24 hours for SSL certificate provisioning
3. Temporarily disable "Enforce HTTPS" during setup

---

### Workflow Permissions Error

**Symptom:** "Resource not accessible by integration"

**Solution:**
Settings → Actions → General → Workflow permissions → Select "Read and write permissions"

---

## That's It

There's no complex deployment because there's no infrastructure. It's just:
- Static HTML/CSS/JS on GitHub Pages
- GitHub Actions clones and runs SHIELD Framework directly
- Reports published back to Pages

**No servers. No databases. No Docker. No DevOps.**

---

<sub>© 2026 SHIELD Scanner | [Georges Bou Ghantous](https://github.com/Georges034302)</sub>
