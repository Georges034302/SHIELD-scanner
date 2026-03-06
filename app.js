/**
 * SHIELD Scanner - app.js (ES Module)
 *
 * Copyright © 2026 Georges Bou Ghantous. All Rights Reserved.
 * SHIELD® — Structured Website Security & Resilience Assessment Framework
 * 
 * This file is part of SHIELD Scanner and is subject to the terms of the
 * All Rights Reserved license included in the LICENSE file.
 *
 * Responsibilities:
 * 1) Commit uploaded authorization file to ephemeral branch auth/<runId>
 * 2) Dispatch workflow_dispatch (scan.yml by default)
 * 3) Poll workflow run status + show links
 * 4) Render report summary from latest/report.json (JSON = truth)
 * 5) Provide download/open links for report.md/report.json (no MD parsing)
 */

const $ = (id) => document.getElementById(id);

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO", "UNKNOWN"];
const FINDINGS_LIMIT_OPTIONS = [20, 50, 100, 200];
const DEFAULT_FINDINGS_LIMIT = 20;
const CHECK_NAME_MAX_LEN = 96;
const EVIDENCE_MAX_LEN = 140;
const RECOMMENDATION_MAX_LEN = 110;

let lastReport = null;
let recommendationIndex = new Map();

function nowIso() {
  return new Date().toISOString();
}

function setStatus(msg) {
  const el = $("status");
  if (el) el.textContent = `Status: ${msg}`;
}

function logLine(msg) {
  const el = $("log");
  if (!el) return;
  el.textContent += `\n[${nowIso()}] ${msg}`;
  el.scrollTop = el.scrollHeight;
}

function safeText(el, text) {
  if (el) el.textContent = text ?? "—";
}

function linkHtml(url, label) {
  return `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`;
}

function latestReportUrl(fileName) {
  return new URL(`latest/${fileName}`, window.location.href).toString();
}

function configureReportLinks() {
  const latestJson = latestReportUrl("report.json");
  const latestMd = latestReportUrl("report.md");

  const openJson = $("openLatestJson");
  const openMd = $("openLatestMd");
  const downloadJson = $("downloadJson");
  const downloadMd = $("downloadMd");

  if (openJson) openJson.href = latestJson;
  if (openMd) openMd.href = latestMd;
  if (downloadJson) downloadJson.href = latestJson;
  if (downloadMd) downloadMd.href = latestMd;
}

function ensure(cond, msg) {
  if (!cond) throw new Error(msg);
}

function b64FromFile(file) {
  return file.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  });
}

/** ---------------- GitHub API ---------------- */

async function ghRequest(token, method, url, body) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const opts = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${res.statusText}\n${text}`);
  }
  return json;
}

async function getRepoInfo(token, owner, repo) {
  return ghRequest(token, "GET", `https://api.github.com/repos/${owner}/${repo}`);
}

async function getBranchSha(token, owner, repo, branch) {
  const ref = await ghRequest(
    token,
    "GET",
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`
  );
  return ref.object.sha;
}

async function createBranch(token, owner, repo, newBranch, baseSha) {
  await ghRequest(token, "POST", `https://api.github.com/repos/${owner}/${repo}/git/refs`, {
    ref: `refs/heads/${newBranch}`,
    sha: baseSha,
  });
}

async function putFileContents(token, owner, repo, path, branch, message, base64Content) {
  await ghRequest(
    token,
    "PUT",
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
    {
      message,
      content: base64Content,
      branch,
    }
  );
}

async function dispatchWorkflow(token, owner, repo, workflowFile, inputs) {
  await ghRequest(
    token,
    "POST",
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(
      workflowFile
    )}/dispatches`,
    {
      ref: "main",
      inputs,
    }
  );
}

async function getWorkflow(token, owner, repo, workflowFile) {
  return ghRequest(
    token,
    "GET",
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}`
  );
}

async function listWorkflowRuns(token, owner, repo, workflowId, perPage = 20) {
  return ghRequest(
    token,
    "GET",
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?per_page=${perPage}`
  );
}

async function getRun(token, owner, repo, runId) {
  return ghRequest(token, "GET", `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`);
}

async function listOpenPullRequestsForHead(token, owner, repo, headOwner, headBranch) {
  const query = new URLSearchParams({
    state: "open",
    head: `${headOwner}:${headBranch}`,
    per_page: "100",
  });
  return ghRequest(
    token,
    "GET",
    `https://api.github.com/repos/${owner}/${repo}/pulls?${query.toString()}`
  );
}

async function closePullRequest(token, owner, repo, prNumber) {
  await ghRequest(
    token,
    "PATCH",
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
    { state: "closed" }
  );
}

async function deleteBranch(token, owner, repo, branchName) {
  await ghRequest(
    token,
    "DELETE",
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branchName)}`
  );
}

async function cleanupEphemeralAuthBranch({ token, owner, repo, branchName }) {
  logLine(`Cleanup: checking open PRs for ${branchName}...`);
  const prs = await listOpenPullRequestsForHead(token, owner, repo, owner, branchName);
  const items = Array.isArray(prs) ? prs : [];

  for (const pr of items) {
    try {
      await closePullRequest(token, owner, repo, pr.number);
      logLine(`Cleanup: closed PR #${pr.number} from ${branchName}.`);
    } catch (e) {
      logLine(`Cleanup warning: failed to close PR #${pr.number}: ${e.message}`);
    }
  }

  try {
    await deleteBranch(token, owner, repo, branchName);
    logLine(`Cleanup: deleted branch ${branchName}.`);
  } catch (e) {
    if (String(e.message || "").includes("404")) {
      logLine(`Cleanup: branch ${branchName} already removed.`);
      return;
    }
    throw e;
  }
}

/**
 * Find the workflow run created for this submission.
 * Strategy:
 * - Use run-name convention "SHIELD Scan — <auth_branch>" (recommended)
 * - Fallback: newest workflow_dispatch run after `dispatchTimeMs`
 */
async function findDispatchedRun({ token, owner, repo, workflowFile, authBranch, dispatchTimeMs }) {
  const wf = await getWorkflow(token, owner, repo, workflowFile);
  const wfId = wf.id;

  const maxWaitMs = 180000; // 3 minutes
  const pollMs = 5000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const runs = await listWorkflowRuns(token, owner, repo, wfId, 30);
    const items = runs.workflow_runs || [];

    // Preferred: match by display_title containing authBranch (requires run-name in workflow)
    let match =
      items.find(
        (r) =>
          r.event === "workflow_dispatch" &&
          (r.display_title || "").includes(authBranch)
      ) || null;

    // Fallback: pick first workflow_dispatch created after dispatch time
    if (!match) {
      match =
        items
          .filter((r) => r.event === "workflow_dispatch")
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;

      if (match) {
        const createdMs = new Date(match.created_at).getTime();
        if (createdMs < dispatchTimeMs - 5000) match = null; // guard
      }
    }

    if (match) return match;

    logLine("Waiting for workflow run to appear...");
    await new Promise((r) => setTimeout(r, pollMs));
  }

  throw new Error("Timed out waiting for the workflow run. Open Actions tab to inspect.");
}

/** ---------------- Report rendering (from JSON only) ---------------- */

function countBySeverity(findings) {
  const out = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0, UNKNOWN: 0 };
  for (const f of findings) {
    const sev = String(f.severity || "UNKNOWN").toUpperCase();
    out[sev] = (out[sev] || 0) + 1;
  }
  return out;
}

function severityRank(sev) {
  const s = String(sev || "UNKNOWN").toUpperCase();
  const idx = SEVERITY_ORDER.indexOf(s);
  return idx === -1 ? SEVERITY_ORDER.length : idx;
}

function firstNonEmptyString(values, fallback = "") {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return fallback;
}

function toBriefText(value, maxLen = 140) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "—";
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 1).trim()}...`;
}

function normalizeKey(key) {
  return String(key ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scalarToText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function valueToText(value) {
  const scalar = scalarToText(value);
  if (scalar) return scalar;

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => valueToText(item))
      .filter((item) => typeof item === "string" && item.length > 0)
      .slice(0, 6);
    return parts.join("; ");
  }

  if (value && typeof value === "object") {
    const preferred = ["summary", "message", "detail", "details", "value", "text", "finding"];
    for (const key of preferred) {
      for (const [k, v] of Object.entries(value)) {
        if (normalizeKey(k) === normalizeKey(key)) {
          const text = valueToText(v);
          if (text) return text;
        }
      }
    }
  }

  return "";
}

function getOwnFieldText(obj, keyCandidates) {
  if (!obj || typeof obj !== "object") return "";
  const wanted = new Set(keyCandidates.map((k) => normalizeKey(k)));
  for (const [key, value] of Object.entries(obj)) {
    if (!wanted.has(normalizeKey(key))) continue;
    const text = valueToText(value);
    if (text) return text;
  }
  return "";
}

function findFieldTextDeep(root, keyCandidates, maxDepth = 4) {
  const wanted = new Set(keyCandidates.map((k) => normalizeKey(k)));
  const seen = new Set();

  function visit(node, depth) {
    if (!node || depth > maxDepth) return "";
    if (typeof node !== "object") return "";
    if (seen.has(node)) return "";
    seen.add(node);

    const direct = getOwnFieldText(node, keyCandidates);
    if (direct) return direct;

    for (const value of Object.values(node)) {
      if (typeof value === "object" && value !== null) {
        const nested = visit(value, depth + 1);
        if (nested) return nested;
      }
    }
    return "";
  }

  if (!root || typeof root !== "object" || wanted.size === 0) return "";
  return visit(root, 0);
}

function getRecommendationForFinding(f) {
  const expected = firstNonEmptyString([
    getOwnFieldText(f, ["expected"]),
    findFieldTextDeep(f, ["expected"]),
  ]);
  const remediationId = firstNonEmptyString([
    scalarToText(f?.remediation_id),
    scalarToText(f?.remediationId),
  ]);

  if (expected && remediationId) return `${expected} (${remediationId})`;
  if (expected) return expected;
  if (remediationId) return `Follow remediation ${remediationId}.`;

  const direct = firstNonEmptyString([
    getOwnFieldText(f, ["recommendation", "remediation", "fix", "mitigation", "next_step", "guidance", "action", "resolution", "solution"]),
    findFieldTextDeep(f, ["recommendation", "remediation", "fix", "mitigation", "next_step", "guidance", "action", "resolution", "solution"]),
  ]);
  if (direct) return direct;

  const checkId = firstNonEmptyString([f?.check_id, f?.id]).toLowerCase();
  if (checkId && recommendationIndex.has(checkId)) {
    return recommendationIndex.get(checkId);
  }
  return "";
}

function buildRecommendationIndex(report) {
  const index = new Map();
  const seen = new Set();

  function visit(node, depth) {
    if (!node || typeof node !== "object" || depth > 7) return;
    if (seen.has(node)) return;
    seen.add(node);

    if (!Array.isArray(node)) {
      const checkId = firstNonEmptyString([valueToText(node.check_id), valueToText(node.id)]).toLowerCase();
      const recommendation = firstNonEmptyString([
        getOwnFieldText(node, ["recommendation", "remediation", "fix", "mitigation", "next_step", "guidance", "action", "resolution", "solution"]),
        findFieldTextDeep(node, ["recommendation", "remediation", "fix", "mitigation", "next_step", "guidance", "action", "resolution", "solution"], 2),
      ]);
      if (checkId && recommendation && !index.has(checkId)) {
        index.set(checkId, recommendation);
      }
    }

    for (const value of Object.values(node)) {
      if (typeof value === "object" && value !== null) {
        visit(value, depth + 1);
      }
    }
  }

  visit(report, 0);
  return index;
}

function getFindingsLimit() {
  const select = $("findingsLimit");
  const parsed = Number(select?.value || DEFAULT_FINDINGS_LIMIT);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_FINDINGS_LIMIT;
  return parsed;
}

function updateFindingsMeta(total, shown) {
  const el = $("findingsMeta");
  if (!el) return;
  if (!total) {
    el.textContent = "No findings loaded.";
    return;
  }
  el.textContent = `Showing ${shown} of ${total} findings (sorted by severity).`;
}

function renderFindingsTable(findings) {
  const tbody = $("findingsTbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!Array.isArray(findings) || findings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">No findings.</td></tr>`;
    updateFindingsMeta(0, 0);
    return;
  }

  const limit = getFindingsLimit();

  const top = findings
    .slice()
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, limit);

  updateFindingsMeta(findings.length, top.length);

  for (const f of top) {
    const sev = String(f.severity || "INFO").toUpperCase();
    const checkId = firstNonEmptyString([f.check_id, f.id]);
    const checkName = firstNonEmptyString([
      f.title,
      f.check,
      f.test,
      f.test_name,
      f.name,
      f.check_name,
    ], "Unnamed check");
    const result = firstNonEmptyString([f.result, f.status, f.outcome], "—");
    const evidence = toBriefText(firstNonEmptyString([
      getOwnFieldText(f, ["found", "evidence", "finding", "details", "detail", "observed", "message", "output", "proof", "summary", "description"]),
      findFieldTextDeep(f, ["found", "evidence", "finding", "details", "detail", "observed", "message", "output", "proof", "summary", "description"]),
    ], "Not provided in JSON"), EVIDENCE_MAX_LEN);
    const recommendation = toBriefText(
      firstNonEmptyString([
        getRecommendationForFinding(f),
      ], "Not provided in JSON"),
      RECOMMENDATION_MAX_LEN
    );
    const checkNameBrief = toBriefText(checkName, CHECK_NAME_MAX_LEN);
    const checkCell = checkId
      ? `<code>${escapeHtml(checkId)}</code> ${escapeHtml(checkNameBrief)}`
      : escapeHtml(checkNameBrief);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${sev}</td>
      <td>${escapeHtml(result)}</td>
      <td>${checkCell}</td>
      <td class="muted evidence-cell">${escapeHtml(evidence)}</td>
      <td class="recommendation-cell">${escapeHtml(recommendation)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderReport(report) {
  // Be permissive about schema while remaining strict about not inventing fields.
  lastReport = report;
  recommendationIndex = buildRecommendationIndex(report);
  const meta = report?.meta || {};
  const findings = Array.isArray(report?.findings) ? report.findings : [];

  const grade = meta.grade ?? meta?.score?.grade ?? "—";
  const mode = meta.mode ?? "—";

  safeText($("sumGrade"), String(grade));
  safeText($("sumMode"), String(mode));
  safeText($("sumFindings"), String(findings.length));
  safeText($("sumUpdated"), new Date().toISOString());

  const sevCounts = countBySeverity(findings);
  safeText($("sevCritical"), String(sevCounts.CRITICAL ?? 0));
  safeText($("sevHigh"), String(sevCounts.HIGH ?? 0));
  safeText($("sevMedium"), String(sevCounts.MEDIUM ?? 0));
  safeText($("sevLow"), String(sevCounts.LOW ?? 0));
  safeText($("sevInfo"), String(sevCounts.INFO ?? 0));

  renderFindingsTable(findings);
  
  // Enable download buttons once report is loaded
  enableDownloadButtons();
}

function enableDownloadButtons() {
  const mdBtn = $("downloadMd");
  const jsonBtn = $("downloadJson");
  if (mdBtn) mdBtn.classList.remove("disabled");
  if (jsonBtn) jsonBtn.classList.remove("disabled");
}

function disableDownloadButtons() {
  const mdBtn = $("downloadMd");
  const jsonBtn = $("downloadJson");
  if (mdBtn) mdBtn.classList.add("disabled");
  if (jsonBtn) jsonBtn.classList.add("disabled");
}

async function loadLatestReport(retries = 0, maxRetries = 10, delayMs = 3000) {
  try {
    const timestamp = Date.now(); // cache bust
    const reportJsonUrl = `${latestReportUrl("report.json")}?t=${timestamp}`;
    const res = await fetch(reportJsonUrl, { cache: "no-store" });
    if (!res.ok) {
      if (retries < maxRetries) {
        const nextDelay = delayMs * Math.pow(1.5, retries); // exponential backoff
        logLine(`latest/report.json not ready yet (${res.status}). Retrying in ${Math.round(nextDelay/1000)}s... (${retries + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, nextDelay));
        return loadLatestReport(retries + 1, maxRetries, delayMs);
      }
      throw new Error(`latest/report.json not available after ${maxRetries} retries (${res.status})`);
    }
    const json = await res.json();
    renderReport(json);
    logLine("✓ Loaded latest/report.json and rendered summary.");
    return true;
  } catch (e) {
    if (retries < maxRetries) {
      const nextDelay = delayMs * Math.pow(1.5, retries);
      logLine(`Error loading report: ${e.message}. Retrying in ${Math.round(nextDelay/1000)}s... (${retries + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, nextDelay));
      return loadLatestReport(retries + 1, maxRetries, delayMs);
    }
    logLine(`⚠ No latest report available: ${e.message}`);
    return false;
  }
}

/** ---------------- Validation ---------------- */

async function validateAuthFile(file) {
  if (!file) {
    throw new Error("Authorization file is required for authorized mode.");
  }
  
  // Check file extension
  if (!file.name.toLowerCase().endsWith('.txt')) {
    throw new Error("Authorization file must be a .txt file.");
  }
  
  // Read and validate file content
  const content = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Failed to read authorization file."));
    reader.readAsText(file);
  });
  
  const contentLower = content.toLowerCase();
  const requiredFields = [
    { pattern: /site\s*(?:to\s*scan)?[:]\s*.+/i, name: "Site to scan" },
    { pattern: /org(?:anization)?[:]\s*.+/i, name: "Organization" },
    { pattern: /authoriz(?:er|or)[:]\s*.+/i, name: "Authorizer" },
    { pattern: /admin\s*login[:]\s*.+/i, name: "Admin login" }
  ];
  
  const missing = [];
  for (const field of requiredFields) {
    if (!field.pattern.test(content)) {
      missing.push(field.name);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(
      `Authorization file is missing required fields:\n${missing.map(f => `  • ${f}`).join('\n')}\n\n` +
      `Example format:\n` +
      `Site to scan: https://example.com\n` +
      `Organization: Example Corp\n` +
      `Authorizer: John Doe\n` +
      `Admin login: admin@example.com (or N/A)`
    );
  }
  
  return content;
}

/** ---------------- Main flow ---------------- */

async function startScan() {
  $("startBtn").disabled = true;
  $("log").textContent = "";
  let finalStatusMessage = "Idle";
  setStatus("Validating input...");
  finalStatusMessage = "Validating input...";

  let cleanupContext = null;

  try {
    const repoFull = $("repoDisplay").textContent.trim();
    const token = $("token").value.trim();
    const targetUrl = $("targetUrl").value.trim();
    const authFile = $("authFile").files?.[0] || null;
    const workflowFile = "scan.yml";
    const mode = $("mode").value;
    const profile = $("profile").value;

    // Validate all inputs BEFORE clearing sensitive fields
    ensure(repoFull.length > 0, "Repository name is missing.");
    ensure(repoFull.includes("/"), "Repository format invalid. Expected 'owner/name'.");
    ensure(token.length > 0, "⚠️ GitHub token is required. Please enter your token.");
    ensure(targetUrl.length > 0, "⚠️ Target URL is required.");
    
    // Validate authorization file for authorized mode
    if (mode === "authorized") {
      ensure(authFile, "⚠️ Authorization file is required for authorized mode.");
      await validateAuthFile(authFile);
      logLine("✓ Authorization file validated successfully.");
    }
    
    // Clear sensitive fields from DOM for security (only after validation passes)
    const tokenField = $("token");
    if (tokenField) tokenField.value = "";
    const targetUrlField = $("targetUrl");
    if (targetUrlField) targetUrlField.value = "";
    const authFileField = $("authFile");
    if (authFileField) authFileField.value = "";

    const [owner, repo] = repoFull.split("/", 2);

    const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const authBranch = `auth/${runId}`;

    safeText($("runId"), runId);
    safeText($("authBranch"), authBranch);
    $("runLink").textContent = "—";
    $("artifactsLink").textContent = "—";

    logLine(`Repo: ${owner}/${repo}`);
    logLine(`Workflow: ${workflowFile}`);
    logLine(`Target: ${targetUrl}`);
    logLine(`Mode: ${mode}, Profile: ${profile}`);
    logLine(`RunId: ${runId}`);

    // Create auth branch + commit auth file if provided
    let authPath = "";
    if (authFile) {
      setStatus("Uploading authorization...");
      const info = await getRepoInfo(token, owner, repo);
      const baseBranch = info.default_branch || "main";
      const baseSha = await getBranchSha(token, owner, repo, baseBranch);

      logLine(`Creating branch ${authBranch} from ${baseBranch}...`);
      await createBranch(token, owner, repo, authBranch, baseSha);

      authPath = `auth_uploads/${runId}/${authFile.name || "authorization.bin"}`;
      const base64 = await b64FromFile(authFile);
      logLine(`Committing authorization to ${authPath}...`);
      await putFileContents(token, owner, repo, authPath, authBranch, `Upload authorization (${runId})`, base64);

      cleanupContext = { token, owner, repo, branchName: authBranch };
    }

    // Dispatch workflow
    setStatus("Dispatching workflow...");
    const dispatchTimeMs = Date.now();
    await dispatchWorkflow(token, owner, repo, workflowFile, {
      target_url: targetUrl,
      mode,
      profile,
      auth_branch: authBranch,
      auth_path: authPath,
    });
    logLine("Workflow dispatched.");

    // Find run
    setStatus("Waiting for run to start...");
    const run = await findDispatchedRun({ token, owner, repo, workflowFile, authBranch, dispatchTimeMs });
    $("runLink").innerHTML = linkHtml(run.html_url, `Run #${run.run_number}`);
    logLine(`Run started: ${run.html_url}`);

    // Poll run to completion
    setStatus("Running scan...");
    while (true) {
      const cur = await getRun(token, owner, repo, run.id);
      logLine(`Run status: ${cur.status}${cur.conclusion ? ` (${cur.conclusion})` : ""}`);

      if (cur.status === "completed") {
        setStatus(`Completed: ${cur.conclusion || "unknown"}`);
        $("artifactsLink").innerHTML = linkHtml(`${cur.html_url}#artifacts`, "Open artifacts");
        break;
      }
      await new Promise((r) => setTimeout(r, 6000));
    }

    // Refresh report summary from Pages latest/report.json
    setStatus("Waiting for Pages deployment...");
    logLine("Workflow complete. Waiting for GitHub Pages to deploy reports...");
    const loaded = await loadLatestReport();
    if (loaded) {
      finalStatusMessage = "✓ Done - Report loaded successfully";
      setStatus(finalStatusMessage);
    } else {
      finalStatusMessage = "⚠ Workflow complete but report not available yet";
      setStatus(finalStatusMessage);
      logLine("⚠ Report may still be deploying. Click 'Refresh from JSON' to try again.");
    }

  } catch (e) {
    finalStatusMessage = `Error: ${e.message}`;
    setStatus(finalStatusMessage);
    logLine(`ERROR: ${e.message}`);
  } finally {
    if (cleanupContext) {
      try {
        setStatus("Finalizing cleanup...");
        await cleanupEphemeralAuthBranch(cleanupContext);
      } catch (e) {
        logLine(`Cleanup warning: ${e.message}`);
      }
    }
    setStatus(finalStatusMessage);
    $("startBtn").disabled = false;
  }
}

function resetUi() {
  // Clear input fields only
  const tokenField = $("token");
  if (tokenField) tokenField.value = "";
  const targetUrlField = $("targetUrl");
  if (targetUrlField) targetUrlField.value = "";
  const authFileField = $("authFile");
  if (authFileField) authFileField.value = "";
  
  // Reset mode and profile to defaults
  const modeField = $("mode");
  if (modeField) modeField.value = "posture";
  const profileField = $("profile");
  if (profileField) profileField.value = "standard";
  
  logLine("Input fields cleared.");
}

function clearReport() {
  // Clear scan status and run info
  setStatus("Idle");
  safeText($("runId"), "—");
  safeText($("authBranch"), "—");
  $("runLink").textContent = "—";
  $("artifactsLink").textContent = "—";
  $("log").textContent = "Waiting…";

  // Clear report summary
  safeText($("sumGrade"), "—");
  safeText($("sumMode"), "—");
  safeText($("sumFindings"), "—");
  safeText($("sumUpdated"), "—");
  safeText($("sevCritical"), "0");
  safeText($("sevHigh"), "0");
  safeText($("sevMedium"), "0");
  safeText($("sevLow"), "0");
  safeText($("sevInfo"), "0");

  const tbody = $("findingsTbody");
  if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="muted">No data loaded yet.</td></tr>`;
  updateFindingsMeta(0, 0);
  lastReport = null;
  
  // Disable download buttons
  disableDownloadButtons();
  
  logLine("Report summary cleared.");
}

async function refreshReport() {
  const btn = $("refreshBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Refreshing...";
  }
  
  setStatus("Refreshing from latest/report.json...");
  logLine("Manually refreshing report...");
  
  try {
    const loaded = await loadLatestReport(0, 5, 2000); // shorter retry for manual refresh
    if (loaded) {
      setStatus("✓ Report refreshed successfully");
    } else {
      setStatus("⚠ Report not available yet");
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Refresh from latest/report.json";
    }
  }
}

function wireEvents() {
  configureReportLinks();

  // Note: Repository is hardcoded in HTML as "Georges034302/SHIELD-scanner"
  // Auto-detection kept for potential future multi-repo support
  const repoDisplay = $("repoDisplay");
  if (repoDisplay) {
    const currentText = repoDisplay.textContent.trim();
    // Only try to detect if somehow the display is empty or shows placeholder
    if (!currentText || currentText === "—" || currentText === "-") {
      const pagesPattern = /^https?:\/\/([^.]+)\.github\.io\/([^/]+)/;
      const match = window.location.href.match(pagesPattern);
      
      if (match) {
        const [, owner, repo] = match;
        repoDisplay.textContent = `${owner}/${repo}`;
        logLine(`Auto-detected repository: ${owner}/${repo}`);
      } else {
        logLine(`⚠️  Repository not auto-detected. Using default: Georges034302/SHIELD-scanner`);
        repoDisplay.textContent = "Georges034302/SHIELD-scanner";
      }
    } else {
      logLine(`Using repository: ${currentText}`);
    }
  }

  $("startBtn")?.addEventListener("click", startScan);
  $("resetBtn")?.addEventListener("click", resetUi);
  $("refreshBtn")?.addEventListener("click", refreshReport);
  $("clearReportBtn")?.addEventListener("click", clearReport);

  const findingsLimitSelect = $("findingsLimit");
  if (findingsLimitSelect) {
    findingsLimitSelect.value = String(DEFAULT_FINDINGS_LIMIT);
    findingsLimitSelect.addEventListener("change", () => {
      const selected = Number(findingsLimitSelect.value);
      if (!FINDINGS_LIMIT_OPTIONS.includes(selected)) {
        findingsLimitSelect.value = String(DEFAULT_FINDINGS_LIMIT);
      }
      const findings = Array.isArray(lastReport?.findings) ? lastReport.findings : [];
      renderFindingsTable(findings);
    });
  }

  // Ensure download buttons start disabled
  disableDownloadButtons();

  // Load whatever latest report exists at page open (with minimal retries)
  loadLatestReport(0, 2, 1000).catch(() => {
    // Silent fail on initial load - user can manually refresh
    // Download buttons remain disabled
  });
}

wireEvents();
