// lib/export-weekly-html.ts
import fs2 from "node:fs";
import path2 from "node:path";

// scripts/weekly-report-helpers.ts
import fs from "node:fs";
import path from "node:path";
function toDateOrNull(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function isWithinRange(date, from, to) {
  if (!date) return false;
  const time = date.getTime();
  return time >= from.getTime() && time <= to.getTime();
}
function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}
function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsonFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".json") ? [fullPath] : [];
  });
}
function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  const entries = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
    }
  }
  return entries;
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function formatDate(value) {
  return value.toISOString().slice(0, 10);
}
function startOfDay(value) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}
function endOfDay(value) {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}
function buildApprovedKnowledgeCards(units) {
  const cards = [];
  for (const item of units) {
    const sourceLabelJa = item.sourceType === "decision" ? "\u610F\u601D\u6C7A\u5B9A" : item.sourceType === "pattern" ? "\u30D1\u30BF\u30FC\u30F3" : "\u30EB\u30FC\u30EB";
    const latestTimestamp = toDateOrNull(
      item.reviewedAt || item.updatedAt || item.createdAt
    );
    const freshnessScore = latestTimestamp ? Math.max(
      0,
      100 - Math.floor(
        (Date.now() - latestTimestamp.getTime()) / (1e3 * 60 * 60 * 24)
      )
    ) : 0;
    cards.push({
      title: item.title,
      subtitle: `Approved ${item.sourceType}`,
      subtitleJa: `\u627F\u8A8D\u6E08\u307F ${sourceLabelJa}`,
      body: item.summary,
      tags: Array.isArray(item.tags) ? item.tags : [],
      score: 60 + freshnessScore,
      sourceType: item.sourceType
    });
  }
  return cards.sort((a, b) => b.score - a.score).slice(0, 6);
}
function buildActionHints(params) {
  const { pendingUnits, changedRules, newPatterns } = params;
  return [
    {
      en: pendingUnits.length > 0 ? `Pending approvals remain (${pendingUnits.length}). Prioritize high-impact dev rules first.` : "No pending dev rules. Approval queue is healthy.",
      ja: pendingUnits.length > 0 ? `\u627F\u8A8D\u5F85\u3061\u306E\u958B\u767A\u30EB\u30FC\u30EB\u304C ${pendingUnits.length} \u4EF6\u3042\u308A\u307E\u3059\u3002\u5F71\u97FF\u306E\u5927\u304D\u3044\u3082\u306E\u304B\u3089\u512A\u5148\u627F\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002` : "\u627F\u8A8D\u5F85\u3061\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u627F\u8A8D\u30AD\u30E5\u30FC\u306F\u5065\u5168\u3067\u3059\u3002"
    },
    {
      en: changedRules.length > 0 ? `Rules changed this week (${changedRules.length}). Share rationale with the team.` : "No rule changes this week. Consider capturing reusable standards.",
      ja: changedRules.length > 0 ? `\u4ECA\u9031\u306F\u30EB\u30FC\u30EB\u5909\u66F4\u304C ${changedRules.length} \u4EF6\u3042\u308A\u307E\u3057\u305F\u3002\u80CC\u666F\u7406\u7531\u3092\u30C1\u30FC\u30E0\u3078\u5171\u6709\u3057\u3066\u304F\u3060\u3055\u3044\u3002` : "\u4ECA\u9031\u306E\u30EB\u30FC\u30EB\u5909\u66F4\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u518D\u5229\u7528\u3067\u304D\u308B\u6A19\u6E96\u3092\u8FFD\u52A0\u3067\u304D\u306A\u3044\u304B\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    },
    {
      en: newPatterns.length > 0 ? `New patterns detected (${newPatterns.length}). Promote stable ones to approved dev rules.` : "Low pattern capture. Run /mneme:save more frequently during debugging sessions.",
      ja: newPatterns.length > 0 ? `\u4ECA\u9031\u306E\u65B0\u898F\u30D1\u30BF\u30FC\u30F3\u306F ${newPatterns.length} \u4EF6\u3067\u3059\u3002\u5B89\u5B9A\u3057\u305F\u3082\u306E\u306F\u627F\u8A8D\u6E08\u307F\u958B\u767A\u30EB\u30FC\u30EB\u3078\u6607\u683C\u3057\u3066\u304F\u3060\u3055\u3044\u3002` : "\u30D1\u30BF\u30FC\u30F3\u306E\u84C4\u7A4D\u304C\u5C11\u306A\u3081\u3067\u3059\u3002\u30C7\u30D0\u30C3\u30B0\u4E2D\u306F /mneme:save \u3092\u3053\u307E\u3081\u306B\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    }
  ];
}

// scripts/weekly-report-style.ts
function renderHeadAndStyle() {
  return `<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Weekly Knowledge Report</title>
  <style>
    :root {
      --bg: #f8f7f4;
      --bg-soft: #f0eeea;
      --ink: #1f1e1b;
      --ink-subtle: #4f4b44;
      --card: #ffffff;
      --card-deep: #f5f3ef;
      --line: #e2e0db;
      --line-strong: #ccc9c2;
      --chip: #f0eeea;
      --chip-border: #d4d0c8;
      --shadow: rgba(20, 19, 17, 0.06);
      --session: #40513B;
      --decision: #628141;
      --pattern: #2D8B7A;
      --rule: #E67E22;
      --hero-dark: #40513B;
      --hero-mid: #4a5e43;
      --hero-soft: #628141;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Nunito", "Avenir Next", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(980px 460px at 3% -10%, #f0f4ee 0%, transparent 72%),
        radial-gradient(900px 420px at 100% 0%, #e8efe6 0%, transparent 68%),
        repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.18) 0 2px, rgba(255, 255, 255, 0) 2px 8px),
        linear-gradient(180deg, var(--bg), var(--bg-soft));
      line-height: 1.5;
    }
    .wrap { max-width: 1160px; margin: 0 auto; padding: 32px 24px 64px; }
    .hero { position: relative; overflow: hidden; background: linear-gradient(145deg, var(--hero-dark) 0%, var(--hero-mid) 56%, var(--hero-soft) 100%); color: #f5f4f1; border: 1px solid #4a4740; border-radius: 18px; padding: 24px; box-shadow: 0 12px 30px rgba(10, 10, 10, 0.24); }
    .hero::after { content: ""; position: absolute; width: 220px; height: 220px; right: -50px; top: -60px; border-radius: 999px; background: radial-gradient(circle, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0)); pointer-events: none; }
    .hero-row { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; position: relative; z-index: 1; }
    .hero h1 { margin: 0 0 10px; font-size: 32px; letter-spacing: 0.1px; }
    .hero p { margin: 0; opacity: 0.94; max-width: 760px; }
    .hero-sticker { display: inline-flex; margin-bottom: 12px; background: #e8f0e4; color: #40513B; border: 1px solid #b8ccb0; border-radius: 999px; padding: 4px 10px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; transform: rotate(-2deg); }
    .meta { margin-top: 12px; font-size: 14px; opacity: 0.88; }
    .lang-switch { display: inline-flex; border: 1px solid #6a665f; border-radius: 999px; overflow: hidden; background: rgba(255, 255, 255, 0.04); }
    .lang-switch button { border: 0; background: transparent; color: #dad8d2; padding: 7px 12px; font-size: 12px; cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }
    .lang-switch button.active { background: #ece8e1; color: #1f1f1c; }
    .grid { display: grid; gap: 14px; margin-top: 18px; }
    .kpi-grid { grid-template-columns: repeat(6, minmax(120px, 1fr)); }
    .kpi { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px; min-height: 96px; box-shadow: 0 2px 10px var(--shadow); position: relative; overflow: hidden; }
    .kpi::before { content: ""; position: absolute; width: 4px; top: 0; bottom: 0; left: 0; background: linear-gradient(180deg, var(--session), var(--decision)); }
    .kpi[data-type="decision"]::before { background: linear-gradient(180deg, var(--decision), var(--decision)); }
    .kpi[data-type="pattern"]::before { background: linear-gradient(180deg, var(--pattern), var(--pattern)); }
    .kpi[data-type="rule"]::before { background: linear-gradient(180deg, var(--rule), var(--rule)); }
    .kpi[data-type="session"]::before { background: linear-gradient(180deg, var(--session), var(--decision)); }
    .kpi .label { color: var(--ink-subtle); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    .kpi .value { font-size: 30px; font-weight: 700; margin-top: 6px; }
    .section { margin-top: 26px; }
    .section h2 { margin: 0 0 10px; font-size: 22px; letter-spacing: -0.01em; }
    .knowledge-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(260px, 1fr)); }
    .knowledge-card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px var(--shadow); position: relative; transition: transform 140ms ease, box-shadow 140ms ease; }
    .knowledge-card:hover { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(15, 14, 12, 0.12); }
    .knowledge-card[data-type="decision"] { border-left: 4px solid var(--decision); }
    .knowledge-card[data-type="pattern"] { border-left: 4px solid var(--pattern); }
    .knowledge-card[data-type="rule"] { border-left: 4px solid var(--rule); }
    .knowledge-card .sub { margin: 0 0 6px; color: var(--ink-subtle); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
    .knowledge-card h3 { margin: 0 0 8px; font-size: 18px; }
    .knowledge-card p { margin: 0; color: #3a3731; }
    .chips { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { background: var(--chip); border: 1px solid var(--chip-border); border-radius: 999px; font-size: 12px; padding: 3px 9px; }
    .pulse-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
    .pulse { background: var(--card-deep); border: 1px solid var(--line); border-radius: 12px; padding: 12px; }
    .pulse-label { font-size: 12px; color: var(--ink-subtle); text-transform: uppercase; letter-spacing: 0.08em; }
    .pulse-note { margin-top: 8px; font-size: 12px; color: var(--ink-subtle); line-height: 1.45; }
    .pulse-value { font-size: 28px; font-weight: 700; margin: 8px 0 10px; }
    .meter { height: 8px; background: #ddd7ce; border-radius: 999px; overflow: hidden; }
    .meter > i { display: block; height: 100%; background: linear-gradient(90deg, var(--session), var(--decision)); }
    .split { display: grid; grid-template-columns: 1.2fr 1fr; gap: 14px; }
    .panel { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px var(--shadow); }
    .tag-pill { display: inline-flex; align-items: center; gap: 8px; margin: 0 8px 8px 0; background: var(--chip); border: 1px solid var(--chip-border); border-radius: 999px; padding: 5px 10px; font-size: 13px; }
    .actors { list-style: none; margin: 0; padding: 0; }
    .actors li { display: flex; justify-content: space-between; border-bottom: 1px dashed var(--line); padding: 8px 0; }
    .actors li span { color: var(--ink); font-weight: 700; }
    .actions ol { margin: 8px 0 0 20px; padding: 0; }
    .actions li { margin: 8px 0; }
    footer { margin-top: 28px; color: var(--ink-subtle); font-size: 13px; text-align: right; }
    @media (max-width: 980px) {
      .hero-row { flex-direction: column; }
      .kpi-grid { grid-template-columns: repeat(3, minmax(120px, 1fr)); }
      .knowledge-grid { grid-template-columns: 1fr; }
      .pulse-grid { grid-template-columns: 1fr; }
      .split { grid-template-columns: 1fr; }
    }
    @media print {
      body { background: #fff; }
      .wrap { max-width: none; padding: 0; }
      .hero { box-shadow: none; }
      .panel, .kpi, .knowledge-card { break-inside: avoid; }
    }
  </style>
</head>`;
}
function renderLangSwitchScript() {
  return `<script>
    (function () {
      const root = document.documentElement;
      const key = "mneme-weekly-lang";
      const buttons = Array.from(document.querySelectorAll("[data-lang-btn]"));
      function applyLang(lang) {
        root.setAttribute("data-lang", lang);
        root.setAttribute("lang", lang === "ja" ? "ja" : "en");
        for (const button of buttons) {
          const isActive = button.getAttribute("data-lang-btn") === lang;
          button.classList.toggle("active", isActive);
        }
        try { localStorage.setItem(key, lang); } catch {}
      }
      const preferred = (function () {
        try {
          const saved = localStorage.getItem(key);
          if (saved === "ja" || saved === "en") return saved;
        } catch {}
        return (navigator.language || "").toLowerCase().startsWith("ja") ? "ja" : "en";
      })();
      for (const button of buttons) {
        button.addEventListener("click", function () {
          applyLang(button.getAttribute("data-lang-btn") || "ja");
        });
      }
      applyLang(preferred);
    })();
  </script>
  <style>
    [data-i18n$="En"], [data-i18n-item="en"] { display: none; }
    html[data-lang="en"] [data-i18n$="En"],
    html[data-lang="en"] [data-i18n-item="en"] { display: inline; }
    html[data-lang="en"] [data-i18n$="Ja"],
    html[data-lang="en"] [data-i18n-item="ja"] { display: none; }
    html[data-lang="ja"] [data-i18n$="Ja"],
    html[data-lang="ja"] [data-i18n-item="ja"] { display: inline; }
    html[data-lang="ja"] [data-i18n$="En"],
    html[data-lang="ja"] [data-i18n-item="en"] { display: none; }
  </style>`;
}

// scripts/weekly-report-template.ts
function renderHtml(params) {
  const {
    from,
    to,
    generatedAt,
    newDecisions,
    newPatterns,
    changedRules,
    touchedUnits,
    approvedUnits,
    approvedKnowledgeUnits,
    pendingUnits,
    auditEntries
  } = params;
  const highlights = buildApprovedKnowledgeCards(approvedKnowledgeUnits);
  const topTags = /* @__PURE__ */ new Map();
  for (const item of highlights) {
    for (const tag of item.tags) {
      topTags.set(tag, (topTags.get(tag) || 0) + 1);
    }
  }
  const topTagList = Array.from(topTags.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const actorCounts = /* @__PURE__ */ new Map();
  for (const entry of auditEntries) {
    const actor = entry.actor || "unknown";
    actorCounts.set(actor, (actorCounts.get(actor) || 0) + 1);
  }
  const topActors = Array.from(actorCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const highlightHtml = highlights.map((item) => {
    const tags = item.tags.slice(0, 5).map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("");
    return `
        <article class="knowledge-card" data-type="${item.sourceType || "decision"}">
          <p class="sub"><span data-i18n-item="en">${escapeHtml(item.subtitle)}</span><span data-i18n-item="ja">${escapeHtml(item.subtitleJa)}</span></p>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.body)}</p>
          <div class="chips">${tags}</div>
        </article>
      `;
  }).join("\n");
  const tagsHtml = topTagList.map(
    ([tag, count]) => `<span class="tag-pill">${escapeHtml(tag)} <b>${count}</b></span>`
  ).join("\n");
  const actorsHtml = topActors.map(
    ([actor, count]) => `<li>${escapeHtml(actor)} <span>${count}</span></li>`
  ).join("\n");
  const pendingByType = pendingUnits.reduce(
    (acc, unit) => {
      acc[unit.type] = (acc[unit.type] || 0) + 1;
      return acc;
    },
    {}
  );
  const approvalRate = touchedUnits.length > 0 ? Math.round(approvedUnits.length / touchedUnits.length * 100) : 0;
  const newKnowledgeCount = newDecisions.length + newPatterns.length + changedRules.length;
  const actionHints = buildActionHints({
    pendingUnits,
    changedRules,
    newPatterns
  });
  const actionHintsHtml = actionHints.map(
    (item) => `<li><span data-i18n-item="en">${escapeHtml(item.en)}</span><span data-i18n-item="ja">${escapeHtml(item.ja)}</span></li>`
  ).join("\n");
  return `<!doctype html>
<html lang="ja" data-lang="ja">
${renderHeadAndStyle()}
<body>
  <div class="wrap">
    <section class="hero">
      <div class="hero-row">
        <div>
          <div class="hero-sticker">
            <span data-i18n="stickerEn">TEAM MEMORY ISSUE</span>
            <span data-i18n="stickerJa">TEAM MEMORY ISSUE</span>
          </div>
          <h1>
            <span data-i18n="heroTitleEn">Weekly Knowledge Snapshot</span>
            <span data-i18n="heroTitleJa">\u9031\u6B21\u30CA\u30EC\u30C3\u30B8\u30B9\u30CA\u30C3\u30D7\u30B7\u30E7\u30C3\u30C8</span>
          </h1>
          <p>
            <span data-i18n="heroDescEn">This week, your team captured and refined project knowledge across sessions, development rules, and source artifacts.</span>
            <span data-i18n="heroDescJa">\u3053\u306E1\u9031\u9593\u3067\u3001\u30C1\u30FC\u30E0\u306F\u30BB\u30C3\u30B7\u30E7\u30F3\u30FB\u958B\u767A\u30EB\u30FC\u30EB\u30FB\u5143\u30C7\u30FC\u30BF\u3092\u901A\u3058\u3066\u77E5\u898B\u3092\u84C4\u7A4D\u3057\u3001\u6574\u7406\u3057\u307E\u3057\u305F\u3002</span>
          </p>
          <div class="meta">
            <span data-i18n="metaEn">Period: ${formatDate(from)} to ${formatDate(to)} | Generated: ${generatedAt.toISOString()}</span>
            <span data-i18n="metaJa">\u671F\u9593: ${formatDate(from)} \u301C ${formatDate(to)} | \u751F\u6210\u65E5\u6642: ${generatedAt.toISOString()}</span>
          </div>
        </div>
        <div class="lang-switch">
          <button type="button" data-lang-btn="ja">\u65E5\u672C\u8A9E</button>
          <button type="button" data-lang-btn="en">EN</button>
        </div>
      </div>
    </section>

    <section class="grid kpi-grid">
      <article class="kpi" data-type="decision"><div class="label"><span data-i18n="kpiDecisionEn">New Decisions</span><span data-i18n="kpiDecisionJa">\u65B0\u898F\u610F\u601D\u6C7A\u5B9A</span></div><div class="value">${newDecisions.length}</div></article>
      <article class="kpi" data-type="pattern"><div class="label"><span data-i18n="kpiPatternEn">New Patterns</span><span data-i18n="kpiPatternJa">\u65B0\u898F\u30D1\u30BF\u30FC\u30F3</span></div><div class="value">${newPatterns.length}</div></article>
      <article class="kpi" data-type="rule"><div class="label"><span data-i18n="kpiRuleEn">Changed Rules</span><span data-i18n="kpiRuleJa">\u5909\u66F4\u30EB\u30FC\u30EB</span></div><div class="value">${changedRules.length}</div></article>
      <article class="kpi" data-type="session"><div class="label"><span data-i18n="kpiTouchedEn">Touched Dev Rules</span><span data-i18n="kpiTouchedJa">\u66F4\u65B0\u3055\u308C\u305F\u958B\u767A\u30EB\u30FC\u30EB</span></div><div class="value">${touchedUnits.length}</div></article>
      <article class="kpi" data-type="session"><div class="label"><span data-i18n="kpiApprovedEn">Approved Dev Rules</span><span data-i18n="kpiApprovedJa">\u627F\u8A8D\u6E08\u307F\u958B\u767A\u30EB\u30FC\u30EB</span></div><div class="value">${approvedUnits.length}</div></article>
      <article class="kpi" data-type="session"><div class="label"><span data-i18n="kpiPendingEn">Pending Dev Rules</span><span data-i18n="kpiPendingJa">\u627F\u8A8D\u5F85\u3061\u958B\u767A\u30EB\u30FC\u30EB</span></div><div class="value">${pendingUnits.length}</div></article>
    </section>

    <section class="section">
      <h2><span data-i18n="pulseTitleEn">This Week at a Glance</span><span data-i18n="pulseTitleJa">\u4ECA\u9031\u306E\u72B6\u6CC1\u30B5\u30DE\u30EA\u30FC</span></h2>
      <div class="pulse-grid">
        <article class="pulse">
          <div class="pulse-label"><span data-i18n="pulseApprovalEn">Approval Rate</span><span data-i18n="pulseApprovalJa">\u627F\u8A8D\u7387</span></div>
          <div class="pulse-value">${approvalRate}%</div>
          <div class="meter"><i style="width:${approvalRate}%"></i></div>
          <div class="pulse-note">
            <span data-i18n="pulseApprovalNoteEn">Among dev rules touched this week, how many were approved.</span>
            <span data-i18n="pulseApprovalNoteJa">\u4ECA\u9031\u66F4\u65B0\u3055\u308C\u305F\u958B\u767A\u30EB\u30FC\u30EB\u306E\u3046\u3061\u3001\u627F\u8A8D\u6E08\u307F\u306B\u306A\u3063\u305F\u5272\u5408\u3067\u3059\u3002</span>
          </div>
        </article>
        <article class="pulse">
          <div class="pulse-label"><span data-i18n="pulseSignalEn">New Knowledge Captured</span><span data-i18n="pulseSignalJa">\u65B0\u898F\u30CA\u30EC\u30C3\u30B8\u767B\u9332</span></div>
          <div class="pulse-value">${newKnowledgeCount}</div>
          <div class="meter"><i style="width:${Math.min(100, newKnowledgeCount * 8)}%"></i></div>
          <div class="pulse-note">
            <span data-i18n="pulseSignalNoteEn">Decisions + patterns + rule updates recorded in this period.</span>
            <span data-i18n="pulseSignalNoteJa">\u3053\u306E\u671F\u9593\u306B\u8A18\u9332\u3055\u308C\u305F\u610F\u601D\u6C7A\u5B9A\u30FB\u30D1\u30BF\u30FC\u30F3\u30FB\u30EB\u30FC\u30EB\u66F4\u65B0\u306E\u5408\u8A08\u4EF6\u6570\u3067\u3059\u3002</span>
          </div>
        </article>
        <article class="pulse">
          <div class="pulse-label"><span data-i18n="pulseQueueEn">Pending Approvals</span><span data-i18n="pulseQueueJa">\u627F\u8A8D\u5F85\u3061\u4EF6\u6570</span></div>
          <div class="pulse-value">${pendingUnits.length}</div>
          <div class="meter"><i style="width:${Math.min(100, pendingUnits.length * 10)}%"></i></div>
          <div class="pulse-note">
            <span data-i18n="pulseQueueNoteEn">Dev rules waiting for approval in the project-wide queue.</span>
            <span data-i18n="pulseQueueNoteJa">\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u5168\u4F53\u3067\u73FE\u5728\u627F\u8A8D\u5F85\u3061\u306E\u958B\u767A\u30EB\u30FC\u30EB\u4EF6\u6570\u3067\u3059\u3002</span>
          </div>
        </article>
      </div>
    </section>

    <section class="section">
      <h2><span data-i18n="topCardsEn">Project Approved Knowledge</span><span data-i18n="topCardsJa">\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u3067\u627F\u8A8D\u3055\u308C\u305F\u30CA\u30EC\u30C3\u30B8</span></h2>
      <div class="knowledge-grid">
        ${highlightHtml || '<p><span data-i18n="emptyHighlightsEn">No approved knowledge yet.</span><span data-i18n="emptyHighlightsJa">\u627F\u8A8D\u6E08\u307F\u30CA\u30EC\u30C3\u30B8\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002</span></p>'}
      </div>
    </section>

    <section class="section split">
      <article class="panel">
        <h2><span data-i18n="tagHeatEn">Tag Heat</span><span data-i18n="tagHeatJa">\u30BF\u30B0\u983B\u5EA6</span></h2>
        <div>${tagsHtml || '<p><span data-i18n="emptyTagsEn">No tags in this period.</span><span data-i18n="emptyTagsJa">\u3053\u306E\u671F\u9593\u306E\u30BF\u30B0\u306F\u3042\u308A\u307E\u305B\u3093\u3002</span></p>'}</div>
        <h2 style="margin-top:18px"><span data-i18n="approvalLoadEn">Approval Load</span><span data-i18n="approvalLoadJa">\u627F\u8A8D\u30AD\u30E5\u30FC\u5185\u8A33</span></h2>
        <p>
          <span data-i18n="pendingByTypeEn">Pending by type: decision=${pendingByType.decision || 0}, pattern=${pendingByType.pattern || 0}, rule=${pendingByType.rule || 0}</span>
          <span data-i18n="pendingByTypeJa">\u7A2E\u5225\u3054\u3068\u306E\u627F\u8A8D\u5F85\u3061: decision=${pendingByType.decision || 0}, pattern=${pendingByType.pattern || 0}, rule=${pendingByType.rule || 0}</span>
        </p>
      </article>
      <article class="panel">
        <h2><span data-i18n="topContribEn">Top Contributors (Audit)</span><span data-i18n="topContribJa">\u4E3B\u8981\u30B3\u30F3\u30C8\u30EA\u30D3\u30E5\u30FC\u30BF\u30FC\uFF08\u76E3\u67FB\u30ED\u30B0\uFF09</span></h2>
        <ul class="actors">${actorsHtml || '<li><span data-i18n="emptyActivityEn">no activity</span><span data-i18n="emptyActivityJa">\u6D3B\u52D5\u306A\u3057</span> <span>0</span></li>'}</ul>
      </article>
    </section>

    <section class="section panel actions">
      <h2><span data-i18n="nextActionEn">Suggested Next Actions</span><span data-i18n="nextActionJa">\u6B21\u306E\u30A2\u30AF\u30B7\u30E7\u30F3\u63D0\u6848</span></h2>
      <ol>${actionHintsHtml}</ol>
    </section>

    <footer>
      <span data-i18n="footerEn">Generated by mneme weekly HTML export</span>
      <span data-i18n="footerJa">mneme \u9031\u6B21HTML\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u3067\u751F\u6210</span>
    </footer>
  </div>
  ${renderLangSwitchScript()}
</body>
</html>`;
}

// lib/export-weekly-html.ts
function main() {
  const projectRoot = process.env.MNEME_PROJECT_ROOT || process.cwd();
  const mnemeDir = path2.join(projectRoot, ".mneme");
  if (!fs2.existsSync(mnemeDir)) {
    console.error(".mneme directory not found. Run /init-mneme first.");
    process.exit(1);
  }
  const now = /* @__PURE__ */ new Date();
  const to = endOfDay(now);
  const from = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1e3));
  const decisions = listJsonFiles(path2.join(mnemeDir, "decisions")).map((filePath) => readJsonFile(filePath)).filter((item) => !!item).filter(
    (item) => isWithinRange(toDateOrNull(item.createdAt || item.updatedAt), from, to)
  );
  const patterns = listJsonFiles(path2.join(mnemeDir, "patterns")).flatMap((filePath) => {
    const doc = readJsonFile(filePath);
    const items = doc?.items || doc?.patterns || [];
    return Array.isArray(items) ? items : [];
  }).filter(
    (item) => isWithinRange(toDateOrNull(item.createdAt || item.updatedAt), from, to)
  );
  const ruleFiles = [
    path2.join(mnemeDir, "rules", "dev-rules.json"),
    path2.join(mnemeDir, "rules", "review-guidelines.json")
  ];
  const changedRules = ruleFiles.flatMap((filePath) => {
    const doc = readJsonFile(
      filePath
    );
    const items = doc?.items || doc?.rules || [];
    return Array.isArray(items) ? items : [];
  }).filter(
    (item) => isWithinRange(toDateOrNull(item.updatedAt || item.createdAt), from, to)
  );
  const unitsDoc = readJsonFile(
    path2.join(mnemeDir, "units", "units.json")
  );
  const allUnits = Array.isArray(unitsDoc?.items) ? unitsDoc.items : [];
  const touchedUnits = allUnits.filter((item) => {
    return isWithinRange(toDateOrNull(item.createdAt), from, to) || isWithinRange(toDateOrNull(item.updatedAt), from, to) || isWithinRange(toDateOrNull(item.reviewedAt), from, to);
  });
  const approvedUnits = touchedUnits.filter(
    (item) => item.status === "approved"
  );
  const approvedKnowledgeUnits = allUnits.filter((item) => item.status === "approved").sort((a, b) => {
    const at = toDateOrNull(a.reviewedAt || a.updatedAt || a.createdAt);
    const bt = toDateOrNull(b.reviewedAt || b.updatedAt || b.createdAt);
    return (bt?.getTime() || 0) - (at?.getTime() || 0);
  });
  const pendingUnits = allUnits.filter((item) => item.status === "pending");
  const auditEntries = fs2.existsSync(path2.join(mnemeDir, "audit")) ? fs2.readdirSync(path2.join(mnemeDir, "audit")).filter((name) => name.endsWith(".jsonl")).flatMap((name) => readJsonl(path2.join(mnemeDir, "audit", name))).filter(
    (entry) => isWithinRange(toDateOrNull(entry.timestamp), from, to)
  ).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  ) : [];
  const html = renderHtml({
    from,
    to,
    generatedAt: now,
    newDecisions: decisions,
    newPatterns: patterns,
    changedRules,
    touchedUnits,
    approvedUnits,
    approvedKnowledgeUnits,
    pendingUnits,
    auditEntries
  });
  const outputDir = path2.join(mnemeDir, "exports");
  fs2.mkdirSync(outputDir, { recursive: true });
  const outputPath = path2.join(
    outputDir,
    `weekly-knowledge-${formatDate(now)}.html`
  );
  fs2.writeFileSync(outputPath, html, "utf-8");
  console.log(`Generated weekly knowledge HTML: ${outputPath}`);
}
main();
