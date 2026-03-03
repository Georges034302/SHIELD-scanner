/**
 * SHIELD Scanner - GitHub Pages MVP
 * 
 * Copyright © 2026 Georges Bou Ghantous. All Rights Reserved.
 * SHIELD® — Structured Website Security & Resilience Assessment Framework
 * 
 * This file is part of SHIELD Scanner and is subject to the terms of the
 * All Rights Reserved license included in the LICENSE file.
 * 
 * - Upload authorization file
 * - Commit to ephemeral branch auth/<runId>
 * - Dispatch workflow_dispatch (scan.yml)
 * - Poll workflow runs for branch match
 *
 * Security note: This MVP asks for a GitHub token in-browser.
 * Production: replace with GitHub App OAuth.
 */

const $ = (id) => document.getElementById(id);

function logLine(msg){
  const el = $("log");
  const ts = new Date().toISOString();
  el.textContent += `\n[${ts}] ${msg}`;
  el.scrollTop = el.scrollHeight;
}

function setStatus(msg){
  $("status").textContent = msg;
}

function linkHtml(href, label){
  return `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`;
}

async function ghRequest(token, method, url, body){
  const headers = {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  let opts = { method, headers };
  if(body !== undefined){
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try{ json = text ? JSON.parse(text) : null; } catch(e){}
  if(!res.ok){
    throw new Error(`GitHub API ${method} ${url} failed: ${res.status} ${res.statusText} - ${text}`);
  }
  return json;
}

async function createAuthBranchAndCommitFile({token, owner, repo, runId, file}){
  const branch = `auth/${runId}`;
  const authPath = `auth_uploads/${runId}/${file.name || "authorization.bin"}`;

  logLine(`Creating auth branch ${branch}...`);

  // 1) Get default branch ref (main) SHA
  const repoInfo = await ghRequest(token, "GET", `https://api.github.com/repos/${owner}/${repo}`);
  const defaultBranch = repoInfo.default_branch;

  const baseRef = await ghRequest(token, "GET", `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`);
  const baseSha = baseRef.object.sha;

  // 2) Create new ref
  await ghRequest(token, "POST", `https://api.github.com/repos/${owner}/${repo}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: baseSha
  });

  // 3) Read file as base64
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);

  // 4) Create/Update file via Contents API on the new branch
  logLine(`Committing authorization file to ${authPath}...`);
  await ghRequest(token, "PUT",
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(authPath)}`,
    {
      message: `Upload authorization for run ${runId}`,
      content: base64,
      branch
    }
  );

  return { branch, authPath, defaultBranch };
}

async function dispatchWorkflow({token, owner, repo, workflowFile, inputs}){
  logLine(`Dispatching workflow ${workflowFile}...`);
  await ghRequest(token, "POST",
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`,
    {
      ref: "main",
      inputs
    }
  );
}

async function findWorkflowRunForBranch({token, owner, repo, branch, workflowFile, maxWaitMs = 180000}){
  const start = Date.now();
  const pollEveryMs = 5000;

  // Find workflow id from workflow file name
  const wf = await ghRequest(token, "GET", `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}`);
  const wfId = wf.id;

  while(Date.now() - start < maxWaitMs){
    const runs = await ghRequest(token, "GET",
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${wfId}/runs?per_page=10`
    );
    const match = (runs.workflow_runs || []).find(r => r.head_branch === "main" && r.event === "workflow_dispatch" && r.display_title?.includes(branch));
    // Fallback: match by input branch in run name (we set run-name in workflow)
    const match2 = (runs.workflow_runs || []).find(r => r.head_branch === "main" && r.event === "workflow_dispatch" && (r.name || "").includes("SHIELD Scan") && (r.display_title || "").includes(branch));
    const run = match || match2;
    if(run){
      return run;
    }
    logLine("Waiting for workflow run to appear...");
    await new Promise(r => setTimeout(r, pollEveryMs));
  }
  throw new Error("Timed out waiting for workflow run to appear. Check Actions tab.");
}

async function pollRunUntilDone({token, owner, repo, runId, onUpdate}){
  const pollEveryMs = 6000;
  while(true){
    const run = await ghRequest(token, "GET", `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`);
    onUpdate(run);
    if(run.status === "completed") return run;
    await new Promise(r => setTimeout(r, pollEveryMs));
  }
}

function pagesLatestUrl(owner, repo){
  // GitHub Pages URL pattern:
  // https://<owner>.github.io/<repo>/latest/report.html
  return `https://${owner}.github.io/${repo}/latest/report.html`;
}

async function main(){
  $("log").textContent = "Ready.";
  $("startBtn").addEventListener("click", async () => {
    $("startBtn").disabled = true;
    $("log").textContent = "";
    try{
      const repoFull = $("repo").value.trim();
      const token = $("token").value.trim();
      const workflowFile = $("workflow").value.trim() || "scan.yml";
      const targetUrl = $("targetUrl").value.trim();
      const mode = $("mode").value;
      const profile = $("profile").value;
      const file = $("authFile").files && $("authFile").files[0];

      if(!repoFull || !repoFull.includes("/")) throw new Error("Repository must be 'owner/name'.");
      if(!token) throw new Error("GitHub token is required for this MVP.");
      if(!targetUrl) throw new Error("Target URL is required.");
      if(mode === "authorized" && !file) throw new Error("Authorization file is required for authorized mode.");

      const [owner, repo] = repoFull.split("/");
      const runId = `${Date.now()}-${Math.random().toString(16).slice(2,8)}`;

      $("runId").textContent = runId;
      $("log").textContent = "";
      setStatus("Uploading authorization...");

      let authBranch = "";
      let authPath = "";

      if(file){
        const res = await createAuthBranchAndCommitFile({token, owner, repo, runId, file});
        authBranch = res.branch;
        authPath = res.authPath;
      } else {
        authBranch = `auth/${runId}`; // still pass a branch label for run-name
        authPath = "";
      }

      $("authBranch").textContent = authBranch;

      setStatus("Dispatching scan workflow...");
      const inputs = {
        target_url: targetUrl,
        mode,
        profile,
        auth_branch: authBranch,
        auth_path: authPath,
      };

      await dispatchWorkflow({token, owner, repo, workflowFile, inputs});

      setStatus("Waiting for workflow run...");
      const run = await findWorkflowRunForBranch({token, owner, repo, branch: authBranch, workflowFile});

      $("runLink").innerHTML = linkHtml(run.html_url, `Run #${run.run_number}`);
      logLine(`Workflow run found: ${run.html_url}`);

      setStatus("Running scan (polling status)...");
      const done = await pollRunUntilDone({
        token, owner, repo, runId: run.id,
        onUpdate: (r) => {
          logLine(`Status: ${r.status}${r.conclusion ? " ("+r.conclusion+")" : ""}`);
        }
      });

      setStatus(`Completed: ${done.conclusion}`);
      logLine(`Completed: ${done.conclusion}`);

      // Artifacts link
      $("artifactsLink").innerHTML = linkHtml(`${done.html_url}#artifacts`, "Open artifacts");

      // Pages link
      $("pagesLink").innerHTML = linkHtml(pagesLatestUrl(owner, repo), "latest/report.html");

    } catch(err){
      console.error(err);
      setStatus(`Error: ${err.message}`);
      logLine(`ERROR: ${err.message}`);
    } finally {
      $("startBtn").disabled = false;
    }
  });

  $("resetBtn").addEventListener("click", () => {
    $("log").textContent = "Ready.";
    $("status").textContent = "Idle.";
    $("runId").textContent = "—";
    $("authBranch").textContent = "—";
    $("runLink").textContent = "—";
    $("artifactsLink").textContent = "—";
    $("pagesLink").textContent = "—";
  });
}

main();
