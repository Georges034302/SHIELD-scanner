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

const CHECK_NAME_MAX_LEN = 96;
const EVIDENCE_MAX_LEN = 140;
const RECOMMENDATION_MAX_LEN = 110;

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

function normalizeSeverityClass(sev){
  const s = String(sev || "info").toLowerCase();
  // Map to CSS classes in template: critical, high, med, low, info
  if (s === "medium") return "med";
  return s;
}

function firstNonEmptyString(values, fallback = ""){
  for(const v of values){
    if(typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return fallback;
}

function toBriefText(value, maxLen = EVIDENCE_MAX_LEN){
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if(!normalized) return "—";
  if(normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 1).trim()}...`;
}

function renderTable(rows){
  if(rows.length === 0) return "<p class='muted'>No findings.</p>";
  const head = "<tr><th>Severity</th><th>Result</th><th>Check (Test Executed)</th><th>Evidence</th><th>Recommendation</th></tr>";
  const body = rows.map(r => {
    const sevClass = normalizeSeverityClass(r.severity);
    const sevDisplay = String(r.severity || "INFO").toUpperCase();
    const checkId = firstNonEmptyString([r.check_id, r.id]);
    const checkName = firstNonEmptyString([
      r.title,
      r.check,
      r.test,
      r.test_name,
      r.name,
      r.check_name,
    ], "Unnamed check");
    const result = firstNonEmptyString([r.result, r.status, r.outcome], "—");
    const evidence = toBriefText(firstNonEmptyString([
      r.evidence,
      r.details,
      r.observed,
      r.message,
      r.output,
    ]), EVIDENCE_MAX_LEN);
    const recommendation = toBriefText(firstNonEmptyString([
      r.recommendation,
      r.remediation,
      r.fix,
      r.mitigation,
      r.next_step,
      r.guidance,
    ], "See report.md for full remediation"), RECOMMENDATION_MAX_LEN);
    const checkNameBrief = toBriefText(checkName, CHECK_NAME_MAX_LEN);
    const checkCell = checkId
      ? `<code>${esc(checkId)}</code> ${esc(checkNameBrief)}`
      : esc(checkNameBrief);
    return `<tr>
      <td><span class="sev sev-${sevClass}">${esc(sevDisplay)}</span></td>
      <td>${esc(result)}</td>
      <td>${checkCell}</td>
      <td class="evidence">${esc(evidence)}</td>
      <td class="recommendation">${esc(recommendation)}</td>
    </tr>`;
  }).join("\n");
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
    .filter(f => ["CRITICAL","HIGH","critical","high"].includes(String(f.severity||"")))
    .sort((a,b) => {
      const order = ["CRITICAL","critical","HIGH","high","MEDIUM","medium","MED","med","LOW","low","INFO","info"];
      const aIdx = order.indexOf(String(a.severity||""));
      const bIdx = order.indexOf(String(b.severity||""));
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    })
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
