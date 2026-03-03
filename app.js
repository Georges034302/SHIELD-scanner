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

function renderFindingsTable(findings) {
  const tbody = $("findingsTbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!Array.isArray(findings) || findings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">No findings.</td></tr>`;
    return;
  }

  const top = findings
    .slice()
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, 25);

  for (const f of top) {
    const sev = String(f.severity || "INFO").toUpperCase();
    const checkId = f.check_id || f.id || "";
    const title = f.title || "";
    const result = f.result || f.status || "";
    const conf = f.confidence || "";
    const evidence = f.evidence || f.details || "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${sev}</td>
      <td><code>${escapeHtml(checkId)}</code> ${escapeHtml(title)}</td>
      <td>${escapeHtml(result)}</td>
      <td>${escapeHtml(conf)}</td>
      <td class="muted">${escapeHtml(evidence)}</td>
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
}

async function loadLatestReport() {
  try {
    const res = await fetch("latest/report.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`latest/report.json not available (${res.status})`);
    const json = await res.json();
    renderReport(json);
    logLine("Loaded latest/report.json and rendered summary.");
  } catch (e) {
    logLine(`No latest report to render yet: ${e.message}`);
  }
}

/** ---------------- Main flow ---------------- */

async function startScan() {
  $("startBtn").disabled = true;
  $("log").textContent = "";
  setStatus("Validating input...");

  try {
    const repoFull = $("repoDisplay").textContent.trim();
    const token = $("token").value.trim();
    
    // Clear token immediately from DOM for security
    const tokenField = $("token");
    if (tokenField) tokenField.value = "";
    const workflowFile = "scan.yml";
    const targetUrl = $("targetUrl").value.trim();
    const mode = $("mode").value;
    const profile = $("profile").value;
    const authFile = $("authFile").files?.[0] || null;

    ensure(repoFull.length > 0 && repoFull !== "—", "Repository not detected. This page must be accessed from GitHub Pages (https://owner.github.io/repo).");
    ensure(repoFull.includes("/"), "Repository format invalid. Expected 'owner/name'.");
    ensure(token.length > 0, "GitHub token is required (MVP).");
    ensure(targetUrl.length > 0, "Target URL is required.");
    if (mode === "authorized") ensure(authFile, "Authorization file is required for authorized mode.");

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
    setStatus("Refreshing summary...");
    await loadLatestReport();
    setStatus("Done.");

  } catch (e) {
    setStatus(`Error: ${e.message}`);
    logLine(`ERROR: ${e.message}`);
  } finally {
    $("startBtn").disabled = false;
  }
}

function resetUi() {
  setStatus("Idle");
  safeText($("runId"), "—");
  safeText($("authBranch"), "—");
  $("runLink").textContent = "—";
  $("artifactsLink").textContent = "—";
  $("log").textContent = "Waiting…";
  
  // Clear token field for security
  const tokenField = $("token");
  if (tokenField) tokenField.value = "";

  // Summary reset
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
}

function wireEvents() {
  // Auto-detect repository from GitHub Pages URL
  const repoDisplay = $("repoDisplay");
  if (repoDisplay && repoDisplay.textContent === "—") {
    const pagesPattern = /^https?:\/\/([^.]+)\.github\.io\/([^/]+)/;
    const match = window.location.href.match(pagesPattern);
    
    if (match) {
      const [, owner, repo] = match;
      repoDisplay.textContent = `${owner}/${repo}`;
      logLine(`Auto-detected repository: ${owner}/${repo}`);
    }
  }

  $("startBtn")?.addEventListener("click", startScan);
  $("resetBtn")?.addEventListener("click", resetUi);
  $("refreshBtn")?.addEventListener("click", loadLatestReport);

  // Load whatever latest report exists at page open
  loadLatestReport();
}

wireEvents();
