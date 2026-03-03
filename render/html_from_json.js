#!/usr/bin/env node
/**
 * JSON -> HTML summary renderer
 * 
 * Copyright © 2026 Georges Bou Ghantous. All Rights Reserved.
 * SHIELD® — Structured Website Security & Resilience Assessment Framework
 * 
 * This file is part of SHIELD Scanner and is subject to the terms of the
 * All Rights Reserved license included in the LICENSE file.
 * 
 * Rule: Do NOT parse Markdown. JSON is truth.
 *
 * Usage:
 *   node render/html_from_json.js output/report.json output/report.html render/template.html
 */
const fs = require("fs");

function must(obj, path){
  const parts = path.split(".");
  let cur = obj;
  for(const p of parts){
    if(cur && Object.prototype.hasOwnProperty.call(cur, p)){
      cur = cur[p];
    } else {
      throw new Error(`report.json missing required field: ${path}`);
    }
  }
  return cur;
}

function esc(s){
  return String(s ?? "").replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function countsBy(arr, key){
  const out = {};
  for(const x of arr){
    const k = x[key] ?? "UNKNOWN";
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function renderTable(rows){
  if(rows.length === 0) return "<p class='muted'>No findings.</p>";
  const head = "<tr><th>Severity</th><th>Result</th><th>Check</th><th>Confidence</th><th>Evidence</th></tr>";
  const body = rows.map(r => (
    `<tr>
      <td><span class="sev sev-${esc(String(r.severity||"INFO")).toLowerCase()}">${esc(r.severity||"INFO")}</span></td>
      <td>${esc(r.result||"")}</td>
      <td><code>${esc(r.check_id||"")}</code> — ${esc(r.title||"")}</td>
      <td>${esc(r.confidence||"")}</td>
      <td class="evidence">${esc(r.evidence||"")}</td>
    </tr>`
  )).join("\n");
  return `<table>${head}${body}</table>`;
}

function main(){
  const [,, inPath, outPath, tplPath] = process.argv;
  if(!inPath || !outPath || !tplPath){
    console.error("Usage: node render/html_from_json.js <report.json> <report.html> <template.html>");
    process.exit(2);
  }
  const report = JSON.parse(fs.readFileSync(inPath, "utf8"));
  const tpl = fs.readFileSync(tplPath, "utf8");

  // Minimal required schema
  const meta = must(report, "meta");
  const findings = must(report, "findings");

  const grade = meta.grade ?? meta.score?.grade ?? "—";
  const score = meta.score ?? meta.score?.value ?? "—";
  const mode = meta.mode ?? "posture";
  const started = meta.started_at ?? meta.start_time ?? "";
  const finished = meta.finished_at ?? meta.end_time ?? "";

  const highish = findings
    .filter(f => ["CRITICAL","HIGH"].includes(String(f.severity||"").toUpperCase()))
    .sort((a,b) => (["CRITICAL","HIGH","MED","LOW","INFO"].indexOf(String(a.severity||"").toUpperCase()) - ["CRITICAL","HIGH","MED","LOW","INFO"].indexOf(String(b.severity||"").toUpperCase())))
    .slice(0, 20);

  const byStep = countsBy(findings, "step");
  const bySeverity = countsBy(findings, "severity");

  const stepsHtml = Object.keys(byStep).sort().map(k => `<li><b>Step ${esc(k)}:</b> ${byStep[k]} findings</li>`).join("");
  const sevHtml = Object.keys(bySeverity).sort().map(k => `<li><b>${esc(k)}:</b> ${bySeverity[k]}</li>`).join("");

  const html = tpl
    .replaceAll("{{GRADE}}", esc(grade))
    .replaceAll("{{SCORE}}", esc(typeof score === "object" ? JSON.stringify(score) : score))
    .replaceAll("{{MODE}}", esc(mode))
    .replaceAll("{{STARTED}}", esc(started))
    .replaceAll("{{FINISHED}}", esc(finished))
    .replaceAll("{{STEPS}}", stepsHtml || "<li class='muted'>No data</li>")
    .replaceAll("{{SEVERITIES}}", sevHtml || "<li class='muted'>No data</li>")
    .replaceAll("{{TOP_FINDINGS_TABLE}}", renderTable(highish));

  fs.writeFileSync(outPath, html, "utf8");
  console.log(`Wrote ${outPath}`);
}

main();
