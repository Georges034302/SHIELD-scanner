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

function normalizeKey(key){
  return String(key ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scalarToText(value){
  if(value === null || value === undefined) return "";
  if(typeof value === "string") return value.trim();
  if(typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function valueToText(value){
  const scalar = scalarToText(value);
  if(scalar) return scalar;

  if(Array.isArray(value)){
    return value
      .map(item => valueToText(item))
      .filter(Boolean)
      .slice(0, 6)
      .join("; ");
  }

  if(value && typeof value === "object"){
    const preferred = ["summary", "message", "detail", "details", "value", "text", "finding"];
    for(const wanted of preferred){
      for(const [k, v] of Object.entries(value)){
        if(normalizeKey(k) === normalizeKey(wanted)){
          const text = valueToText(v);
          if(text) return text;
        }
      }
    }
  }

  return "";
}

function getOwnFieldText(obj, keys){
  if(!obj || typeof obj !== "object") return "";
  const wanted = new Set(keys.map(k => normalizeKey(k)));
  for(const [k, v] of Object.entries(obj)){
    if(!wanted.has(normalizeKey(k))) continue;
    const text = valueToText(v);
    if(text) return text;
  }
  return "";
}

function findFieldTextDeep(root, keys, maxDepth = 4){
  const seen = new Set();

  function visit(node, depth){
    if(!node || typeof node !== "object" || depth > maxDepth) return "";
    if(seen.has(node)) return "";
    seen.add(node);

    const direct = getOwnFieldText(node, keys);
    if(direct) return direct;

    for(const value of Object.values(node)){
      if(value && typeof value === "object"){
        const found = visit(value, depth + 1);
        if(found) return found;
      }
    }

    return "";
  }

  return visit(root, 0);
}

function buildRecommendationIndex(report){
  const index = new Map();
  const seen = new Set();

  function visit(node, depth){
    if(!node || typeof node !== "object" || depth > 7) return;
    if(seen.has(node)) return;
    seen.add(node);

    if(!Array.isArray(node)){
      const checkId = firstNonEmptyString([valueToText(node.check_id), valueToText(node.id)]).toLowerCase();
      const recommendation = firstNonEmptyString([
        getOwnFieldText(node, ["recommendation", "remediation", "fix", "mitigation", "next_step", "guidance", "action", "resolution", "solution"]),
        findFieldTextDeep(node, ["recommendation", "remediation", "fix", "mitigation", "next_step", "guidance", "action", "resolution", "solution"], 2),
      ]);
      if(checkId && recommendation && !index.has(checkId)) index.set(checkId, recommendation);
    }

    for(const value of Object.values(node)){
      if(value && typeof value === "object") visit(value, depth + 1);
    }
  }

  visit(report, 0);
  return index;
}

function renderTable(rows, recommendationIndex){
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
      getOwnFieldText(r, ["evidence", "finding", "details", "detail", "observed", "message", "output", "proof", "summary", "description"]),
      findFieldTextDeep(r, ["evidence", "finding", "details", "detail", "observed", "message", "output", "proof", "summary", "description"]),
    ], "Not provided in JSON"), EVIDENCE_MAX_LEN);
    const checkIdLower = checkId.toLowerCase();
    const recommendation = toBriefText(firstNonEmptyString([
      getOwnFieldText(r, ["recommendation", "remediation", "fix", "mitigation", "next_step", "guidance", "action", "resolution", "solution"]),
      findFieldTextDeep(r, ["recommendation", "remediation", "fix", "mitigation", "next_step", "guidance", "action", "resolution", "solution"]),
      recommendationIndex.get(checkIdLower) || "",
    ], "Not provided in JSON"), RECOMMENDATION_MAX_LEN);
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
  const recommendationIndex = buildRecommendationIndex(report);

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
    .replaceAll("{{TOP_FINDINGS_TABLE}}", renderTable(highish, recommendationIndex));

  fs.writeFileSync(outPath, html, "utf8");
  console.log(`Wrote ${outPath}`);
}

main();
