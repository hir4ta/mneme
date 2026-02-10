import fs from "node:fs";
import path from "node:path";

interface DecisionItem {
  id: string;
  title?: string;
  decision?: string;
  reasoning?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface PatternItem {
  id: string;
  type?: string;
  title?: string;
  description?: string;
  errorPattern?: string;
  solution?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface RuleItem {
  id: string;
  key?: string;
  text?: string;
  rule?: string;
  category?: string;
  priority?: string;
  rationale?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface UnitItem {
  id: string;
  type: "decision" | "pattern" | "rule";
  kind: "policy" | "pitfall" | "playbook";
  title: string;
  summary: string;
  tags: string[];
  sourceType: "decision" | "pattern" | "rule";
  sourceId: string;
  sourceRefs: Array<{ type: "decision" | "pattern" | "rule"; id: string }>;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

interface AuditEntry {
  timestamp: string;
  actor?: string;
  entity?: string;
  action?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
}

interface HighlightCard {
  title: string;
  subtitle: string;
  subtitleJa: string;
  body: string;
  tags: string[];
  score: number;
}

function toDateOrNull(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWithinRange(date: Date | null, from: Date, to: Date): boolean {
  if (!date) return false;
  const time = date.getTime();
  return time >= from.getTime() && time <= to.getTime();
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsonFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".json") ? [fullPath] : [];
  });
}

function readJsonl(filePath: string): AuditEntry[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  const entries: AuditEntry[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as AuditEntry);
    } catch {
      // skip invalid line
    }
  }
  return entries;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: Date): Date {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function buildApprovedKnowledgeCards(units: UnitItem[]): HighlightCard[] {
  const cards: HighlightCard[] = [];
  for (const item of units) {
    const sourceLabelJa =
      item.sourceType === "decision"
        ? "意思決定"
        : item.sourceType === "pattern"
          ? "パターン"
          : "ルール";
    const latestTimestamp = toDateOrNull(
      item.reviewedAt || item.updatedAt || item.createdAt,
    );
    const freshnessScore = latestTimestamp
      ? Math.max(
          0,
          100 -
            Math.floor(
              (Date.now() - latestTimestamp.getTime()) / (1000 * 60 * 60 * 24),
            ),
        )
      : 0;
    cards.push({
      title: item.title,
      subtitle: `Approved ${item.sourceType}`,
      subtitleJa: `承認済み ${sourceLabelJa}`,
      body: item.summary,
      tags: Array.isArray(item.tags) ? item.tags : [],
      score: 60 + freshnessScore,
    });
  }

  return cards.sort((a, b) => b.score - a.score).slice(0, 6);
}

function renderHtml(params: {
  from: Date;
  to: Date;
  generatedAt: Date;
  newDecisions: DecisionItem[];
  newPatterns: PatternItem[];
  changedRules: RuleItem[];
  touchedUnits: UnitItem[];
  approvedUnits: UnitItem[];
  approvedKnowledgeUnits: UnitItem[];
  pendingUnits: UnitItem[];
  auditEntries: AuditEntry[];
}): string {
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
    auditEntries,
  } = params;

  const highlights = buildApprovedKnowledgeCards(approvedKnowledgeUnits);

  const topTags = new Map<string, number>();
  for (const item of highlights) {
    for (const tag of item.tags) {
      topTags.set(tag, (topTags.get(tag) || 0) + 1);
    }
  }
  const topTagList = Array.from(topTags.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const actorCounts = new Map<string, number>();
  for (const entry of auditEntries) {
    const actor = entry.actor || "unknown";
    actorCounts.set(actor, (actorCounts.get(actor) || 0) + 1);
  }
  const topActors = Array.from(actorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const highlightHtml = highlights
    .map((item) => {
      const tags = item.tags
        .slice(0, 5)
        .map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`)
        .join("");
      return `
        <article class="knowledge-card">
          <p class="sub"><span data-i18n-item="en">${escapeHtml(item.subtitle)}</span><span data-i18n-item="ja">${escapeHtml(item.subtitleJa)}</span></p>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.body)}</p>
          <div class="chips">${tags}</div>
        </article>
      `;
    })
    .join("\n");

  const tagsHtml = topTagList
    .map(
      ([tag, count]) =>
        `<span class="tag-pill">${escapeHtml(tag)} <b>${count}</b></span>`,
    )
    .join("\n");

  const actorsHtml = topActors
    .map(
      ([actor, count]) => `<li>${escapeHtml(actor)} <span>${count}</span></li>`,
    )
    .join("\n");

  const pendingByType = pendingUnits.reduce(
    (acc, unit) => {
      acc[unit.type] = (acc[unit.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const approvalRate =
    touchedUnits.length > 0
      ? Math.round((approvedUnits.length / touchedUnits.length) * 100)
      : 0;
  const newKnowledgeCount =
    newDecisions.length + newPatterns.length + changedRules.length;

  const actionHints = [
    {
      en:
        pendingUnits.length > 0
          ? `Pending approvals remain (${pendingUnits.length}). Prioritize high-impact dev rules first.`
          : "No pending dev rules. Approval queue is healthy.",
      ja:
        pendingUnits.length > 0
          ? `承認待ちの開発ルールが ${pendingUnits.length} 件あります。影響の大きいものから優先承認してください。`
          : "承認待ちはありません。承認キューは健全です。",
    },
    {
      en:
        changedRules.length > 0
          ? `Rules changed this week (${changedRules.length}). Share rationale with the team.`
          : "No rule changes this week. Consider capturing reusable standards.",
      ja:
        changedRules.length > 0
          ? `今週はルール変更が ${changedRules.length} 件ありました。背景理由をチームへ共有してください。`
          : "今週のルール変更はありません。再利用できる標準を追加できないか確認してください。",
    },
    {
      en:
        newPatterns.length > 0
          ? `New patterns detected (${newPatterns.length}). Promote stable ones to approved dev rules.`
          : "Low pattern capture. Run /mneme:save more frequently during debugging sessions.",
      ja:
        newPatterns.length > 0
          ? `今週の新規パターンは ${newPatterns.length} 件です。安定したものは承認済み開発ルールへ昇格してください。`
          : "パターンの蓄積が少なめです。デバッグ中は /mneme:save をこまめに実行してください。",
    },
  ];

  return `<!doctype html>
<html lang="ja" data-lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Weekly Knowledge Report</title>
  <style>
    :root {
      --bg: #efede8;
      --bg-soft: #e7e4de;
      --ink: #1f1e1b;
      --ink-subtle: #4f4b44;
      --card: #f7f4ef;
      --card-deep: #ece8e1;
      --line: #d4d0c8;
      --line-strong: #b5b0a6;
      --chip: #ebe7e0;
      --chip-border: #ccc6bb;
      --shadow: rgba(20, 19, 17, 0.08);
      --hero-dark: #262521;
      --hero-mid: #34322d;
      --hero-soft: #43413a;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      font-family: "Nunito", "Avenir Next", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(980px 460px at 3% -10%, #f8f6f2 0%, transparent 72%),
        radial-gradient(900px 420px at 100% 0%, #e2ded6 0%, transparent 68%),
        repeating-linear-gradient(
          135deg,
          rgba(255, 255, 255, 0.18) 0 2px,
          rgba(255, 255, 255, 0) 2px 8px
        ),
        linear-gradient(180deg, var(--bg), var(--bg-soft));
      line-height: 1.5;
    }
    .wrap {
      max-width: 1160px;
      margin: 0 auto;
      padding: 32px 24px 64px;
    }
    .hero {
      position: relative;
      overflow: hidden;
      background: linear-gradient(
        145deg,
        var(--hero-dark) 0%,
        var(--hero-mid) 56%,
        var(--hero-soft) 100%
      );
      color: #f5f4f1;
      border: 1px solid #4a4740;
      border-radius: 18px;
      padding: 24px;
      box-shadow: 0 12px 30px rgba(10, 10, 10, 0.24);
    }
    .hero::after {
      content: "";
      position: absolute;
      width: 220px;
      height: 220px;
      right: -50px;
      top: -60px;
      border-radius: 999px;
      background: radial-gradient(circle, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0));
      pointer-events: none;
    }
    .hero-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      position: relative;
      z-index: 1;
    }
    .hero h1 {
      margin: 0 0 10px;
      font-size: 32px;
      letter-spacing: 0.1px;
    }
    .hero p {
      margin: 0;
      opacity: 0.94;
      max-width: 760px;
    }
    .hero-sticker {
      display: inline-flex;
      margin-bottom: 12px;
      background: #f0ece5;
      color: #201f1c;
      border: 1px solid #d7d2c7;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      transform: rotate(-2deg);
    }
    .meta {
      margin-top: 12px;
      font-size: 14px;
      opacity: 0.88;
    }
    .lang-switch {
      display: inline-flex;
      border: 1px solid #6a665f;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.04);
    }
    .lang-switch button {
      border: 0;
      background: transparent;
      color: #dad8d2;
      padding: 7px 12px;
      font-size: 12px;
      cursor: pointer;
      transition: background-color 120ms ease, color 120ms ease;
    }
    .lang-switch button.active {
      background: #ece8e1;
      color: #1f1f1c;
    }
    .grid {
      display: grid;
      gap: 14px;
      margin-top: 18px;
    }
    .kpi-grid {
      grid-template-columns: repeat(6, minmax(120px, 1fr));
    }
    .kpi {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px;
      min-height: 96px;
      box-shadow: 0 2px 10px var(--shadow);
      position: relative;
      overflow: hidden;
    }
    .kpi::before {
      content: "";
      position: absolute;
      width: 4px;
      top: 0;
      bottom: 0;
      left: 0;
      background: linear-gradient(180deg, #3a3935, #8b867c);
    }
    .kpi .label {
      color: var(--ink-subtle);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .kpi .value {
      font-size: 30px;
      font-weight: 700;
      margin-top: 6px;
    }

    .section {
      margin-top: 26px;
    }
    .section h2 {
      margin: 0 0 10px;
      font-size: 22px;
      letter-spacing: -0.01em;
    }

    .knowledge-grid {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(2, minmax(260px, 1fr));
    }
    .knowledge-card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 2px 8px var(--shadow);
      position: relative;
      transition: transform 140ms ease, box-shadow 140ms ease;
    }
    .knowledge-card:nth-child(odd) {
      transform: rotate(-0.35deg);
    }
    .knowledge-card:nth-child(even) {
      transform: rotate(0.35deg);
    }
    .knowledge-card:hover {
      transform: translateY(-2px) rotate(0deg);
      box-shadow: 0 8px 18px rgba(15, 14, 12, 0.12);
    }
    .knowledge-card .sub {
      margin: 0 0 6px;
      color: var(--ink-subtle);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
    }
    .knowledge-card h3 {
      margin: 0 0 8px;
      font-size: 18px;
    }
    .knowledge-card p {
      margin: 0;
      color: #3a3731;
    }
    .chips {
      margin-top: 10px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chip {
      background: var(--chip);
      border: 1px solid var(--chip-border);
      border-radius: 999px;
      font-size: 12px;
      padding: 3px 9px;
    }

    .pulse-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
    }
    .pulse {
      background: var(--card-deep);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
    }
    .pulse-label {
      font-size: 12px;
      color: var(--ink-subtle);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .pulse-note {
      margin-top: 8px;
      font-size: 12px;
      color: var(--ink-subtle);
      line-height: 1.45;
    }
    .pulse-value {
      font-size: 28px;
      font-weight: 700;
      margin: 8px 0 10px;
    }
    .meter {
      height: 8px;
      background: #ddd7ce;
      border-radius: 999px;
      overflow: hidden;
    }
    .meter > i {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, #31302b, #7b766d);
    }

    .split {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 14px;
    }
    .panel {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 2px 8px var(--shadow);
    }
    .tag-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin: 0 8px 8px 0;
      background: var(--chip);
      border: 1px solid var(--chip-border);
      border-radius: 999px;
      padding: 5px 10px;
      font-size: 13px;
    }
    .actors {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .actors li {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px dashed var(--line);
      padding: 8px 0;
    }
    .actors li span { color: var(--ink); font-weight: 700; }

    .actions ol {
      margin: 8px 0 0 20px;
      padding: 0;
    }
    .actions li {
      margin: 8px 0;
    }

    footer {
      margin-top: 28px;
      color: var(--ink-subtle);
      font-size: 13px;
      text-align: right;
    }

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
</head>
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
            <span data-i18n="heroTitleJa">週次ナレッジスナップショット</span>
          </h1>
          <p>
            <span data-i18n="heroDescEn">This week, your team captured and refined project knowledge across sessions, development rules, and source artifacts.</span>
            <span data-i18n="heroDescJa">この1週間で、チームはセッション・開発ルール・元データを通じて知見を蓄積し、整理しました。</span>
          </p>
          <div class="meta">
            <span data-i18n="metaEn">Period: ${formatDate(from)} to ${formatDate(to)} | Generated: ${generatedAt.toISOString()}</span>
            <span data-i18n="metaJa">期間: ${formatDate(from)} 〜 ${formatDate(to)} | 生成日時: ${generatedAt.toISOString()}</span>
          </div>
        </div>
        <div class="lang-switch">
          <button type="button" data-lang-btn="ja">日本語</button>
          <button type="button" data-lang-btn="en">EN</button>
        </div>
      </div>
    </section>

    <section class="grid kpi-grid">
      <article class="kpi"><div class="label"><span data-i18n="kpiDecisionEn">New Decisions</span><span data-i18n="kpiDecisionJa">新規意思決定</span></div><div class="value">${newDecisions.length}</div></article>
      <article class="kpi"><div class="label"><span data-i18n="kpiPatternEn">New Patterns</span><span data-i18n="kpiPatternJa">新規パターン</span></div><div class="value">${newPatterns.length}</div></article>
      <article class="kpi"><div class="label"><span data-i18n="kpiRuleEn">Changed Rules</span><span data-i18n="kpiRuleJa">変更ルール</span></div><div class="value">${changedRules.length}</div></article>
      <article class="kpi"><div class="label"><span data-i18n="kpiTouchedEn">Touched Dev Rules</span><span data-i18n="kpiTouchedJa">更新された開発ルール</span></div><div class="value">${touchedUnits.length}</div></article>
      <article class="kpi"><div class="label"><span data-i18n="kpiApprovedEn">Approved Dev Rules</span><span data-i18n="kpiApprovedJa">承認済み開発ルール</span></div><div class="value">${approvedUnits.length}</div></article>
      <article class="kpi"><div class="label"><span data-i18n="kpiPendingEn">Pending Dev Rules</span><span data-i18n="kpiPendingJa">承認待ち開発ルール</span></div><div class="value">${pendingUnits.length}</div></article>
    </section>

    <section class="section">
      <h2><span data-i18n="pulseTitleEn">This Week at a Glance</span><span data-i18n="pulseTitleJa">今週の状況サマリー</span></h2>
      <div class="pulse-grid">
        <article class="pulse">
          <div class="pulse-label"><span data-i18n="pulseApprovalEn">Approval Rate</span><span data-i18n="pulseApprovalJa">承認率</span></div>
          <div class="pulse-value">${approvalRate}%</div>
          <div class="meter"><i style="width:${approvalRate}%"></i></div>
          <div class="pulse-note">
            <span data-i18n="pulseApprovalNoteEn">Among dev rules touched this week, how many were approved.</span>
            <span data-i18n="pulseApprovalNoteJa">今週更新された開発ルールのうち、承認済みになった割合です。</span>
          </div>
        </article>
        <article class="pulse">
          <div class="pulse-label"><span data-i18n="pulseSignalEn">New Knowledge Captured</span><span data-i18n="pulseSignalJa">新規ナレッジ登録</span></div>
          <div class="pulse-value">${newKnowledgeCount}</div>
          <div class="meter"><i style="width:${Math.min(100, newKnowledgeCount * 8)}%"></i></div>
          <div class="pulse-note">
            <span data-i18n="pulseSignalNoteEn">Decisions + patterns + rule updates recorded in this period.</span>
            <span data-i18n="pulseSignalNoteJa">この期間に記録された意思決定・パターン・ルール更新の合計件数です。</span>
          </div>
        </article>
        <article class="pulse">
          <div class="pulse-label"><span data-i18n="pulseQueueEn">Pending Approvals</span><span data-i18n="pulseQueueJa">承認待ち件数</span></div>
          <div class="pulse-value">${pendingUnits.length}</div>
          <div class="meter"><i style="width:${Math.min(100, pendingUnits.length * 10)}%"></i></div>
          <div class="pulse-note">
            <span data-i18n="pulseQueueNoteEn">Dev rules waiting for approval in the project-wide queue.</span>
            <span data-i18n="pulseQueueNoteJa">プロジェクト全体で現在承認待ちの開発ルール件数です。</span>
          </div>
        </article>
      </div>
    </section>

    <section class="section">
      <h2><span data-i18n="topCardsEn">Project Approved Knowledge</span><span data-i18n="topCardsJa">プロジェクトで承認されたナレッジ</span></h2>
      <div class="knowledge-grid">
        ${highlightHtml || '<p><span data-i18n="emptyHighlightsEn">No approved knowledge yet.</span><span data-i18n="emptyHighlightsJa">承認済みナレッジはまだありません。</span></p>'}
      </div>
    </section>

    <section class="section split">
      <article class="panel">
        <h2><span data-i18n="tagHeatEn">Tag Heat</span><span data-i18n="tagHeatJa">タグ頻度</span></h2>
        <div>${tagsHtml || '<p><span data-i18n="emptyTagsEn">No tags in this period.</span><span data-i18n="emptyTagsJa">この期間のタグはありません。</span></p>'}</div>
        <h2 style="margin-top:18px"><span data-i18n="approvalLoadEn">Approval Load</span><span data-i18n="approvalLoadJa">承認キュー内訳</span></h2>
        <p>
          <span data-i18n="pendingByTypeEn">Pending by type: decision=${pendingByType.decision || 0}, pattern=${pendingByType.pattern || 0}, rule=${pendingByType.rule || 0}</span>
          <span data-i18n="pendingByTypeJa">種別ごとの承認待ち: decision=${pendingByType.decision || 0}, pattern=${pendingByType.pattern || 0}, rule=${pendingByType.rule || 0}</span>
        </p>
      </article>
      <article class="panel">
        <h2><span data-i18n="topContribEn">Top Contributors (Audit)</span><span data-i18n="topContribJa">主要コントリビューター（監査ログ）</span></h2>
        <ul class="actors">${actorsHtml || '<li><span data-i18n="emptyActivityEn">no activity</span><span data-i18n="emptyActivityJa">活動なし</span> <span>0</span></li>'}</ul>
      </article>
    </section>

    <section class="section panel actions">
      <h2><span data-i18n="nextActionEn">Suggested Next Actions</span><span data-i18n="nextActionJa">次のアクション提案</span></h2>
      <ol>
        ${actionHints
          .map(
            (item) =>
              `<li><span data-i18n-item="en">${escapeHtml(item.en)}</span><span data-i18n-item="ja">${escapeHtml(item.ja)}</span></li>`,
          )
          .join("\n")}
      </ol>
    </section>

    <footer>
      <span data-i18n="footerEn">Generated by mneme weekly HTML export</span>
      <span data-i18n="footerJa">mneme 週次HTMLエクスポートで生成</span>
    </footer>
  </div>
  <script>
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
  </style>
</body>
</html>`;
}

function main() {
  const projectRoot = process.cwd();
  const mnemeDir = path.join(projectRoot, ".mneme");
  if (!fs.existsSync(mnemeDir)) {
    console.error(".mneme directory not found. Run /init-mneme first.");
    process.exit(1);
  }

  const now = new Date();
  const to = endOfDay(now);
  const from = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));

  const decisions = listJsonFiles(path.join(mnemeDir, "decisions"))
    .map((filePath) => readJsonFile<DecisionItem>(filePath))
    .filter((item): item is DecisionItem => !!item)
    .filter((item) =>
      isWithinRange(toDateOrNull(item.createdAt || item.updatedAt), from, to),
    );

  const patterns = listJsonFiles(path.join(mnemeDir, "patterns"))
    .flatMap((filePath) => {
      const doc = readJsonFile<{
        items?: PatternItem[];
        patterns?: PatternItem[];
      }>(filePath);
      const items = doc?.items || doc?.patterns || [];
      return Array.isArray(items) ? items : [];
    })
    .filter((item) =>
      isWithinRange(toDateOrNull(item.createdAt || item.updatedAt), from, to),
    );

  const ruleFiles = [
    path.join(mnemeDir, "rules", "dev-rules.json"),
    path.join(mnemeDir, "rules", "review-guidelines.json"),
  ];
  const changedRules = ruleFiles
    .flatMap((filePath) => {
      const doc = readJsonFile<{ items?: RuleItem[]; rules?: RuleItem[] }>(
        filePath,
      );
      const items = doc?.items || doc?.rules || [];
      return Array.isArray(items) ? items : [];
    })
    .filter((item) =>
      isWithinRange(toDateOrNull(item.updatedAt || item.createdAt), from, to),
    );

  const unitsDoc = readJsonFile<{ items?: UnitItem[] }>(
    path.join(mnemeDir, "units", "units.json"),
  );
  const allUnits = Array.isArray(unitsDoc?.items) ? unitsDoc.items : [];
  const touchedUnits = allUnits.filter((item) => {
    return (
      isWithinRange(toDateOrNull(item.createdAt), from, to) ||
      isWithinRange(toDateOrNull(item.updatedAt), from, to) ||
      isWithinRange(toDateOrNull(item.reviewedAt), from, to)
    );
  });
  const approvedUnits = touchedUnits.filter(
    (item) => item.status === "approved",
  );
  const approvedKnowledgeUnits = allUnits
    .filter((item) => item.status === "approved")
    .sort((a, b) => {
      const at = toDateOrNull(a.reviewedAt || a.updatedAt || a.createdAt);
      const bt = toDateOrNull(b.reviewedAt || b.updatedAt || b.createdAt);
      return (bt?.getTime() || 0) - (at?.getTime() || 0);
    });
  const pendingUnits = allUnits.filter((item) => item.status === "pending");

  const auditEntries = fs.existsSync(path.join(mnemeDir, "audit"))
    ? fs
        .readdirSync(path.join(mnemeDir, "audit"))
        .filter((name) => name.endsWith(".jsonl"))
        .flatMap((name) => readJsonl(path.join(mnemeDir, "audit", name)))
        .filter((entry) =>
          isWithinRange(toDateOrNull(entry.timestamp), from, to),
        )
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        )
    : [];

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
    auditEntries,
  });

  const outputDir = path.join(mnemeDir, "exports");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(
    outputDir,
    `weekly-knowledge-${formatDate(now)}.html`,
  );
  fs.writeFileSync(outputPath, html, "utf-8");

  console.log(`Generated weekly knowledge HTML: ${outputPath}`);
}

main();
