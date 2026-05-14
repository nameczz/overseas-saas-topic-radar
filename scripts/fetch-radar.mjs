#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import Parser from "rss-parser";
import * as cheerio from "cheerio";

const parser = new Parser({ timeout: 15000 });
const OUT = path.join(process.cwd(), "public", "data", "latest.json");
const SHOULD_WRITE = process.argv.includes("--write") || process.argv.includes("-w");

const KEYWORDS = {
  ai: ["ai", "agent", "llm", "gpt", "claude", "gemini", "openai", "copilot", "automation", "workflow", "rag", "voice", "image", "video", "coding"],
  saas: ["saas", "b2b", "crm", "analytics", "dashboard", "api", "subscription", "billing", "workspace", "productivity", "customer", "support"],
  indie: ["indie", "startup", "founder", "side project", "micro saas", "launch", "product hunt", "mrr", "growth"],
  cnContent: ["template", "tool", "tutorial", "case study", "prompt", "no-code", "小红书", "wechat", "content", "marketing", "creator"],
};
const HOT_TERMS = ["agent", "workflow", "automation", "browser", "coding", "voice", "video", "mcp", "rag", "spreadsheet", "notion", "crm", "email", "newsletter", "design", "commerce", "education", "health", "finance"];
const COMPLAINT_TERMS = [
  "complain", "complaint", "painfully hard", "impossible", "broken", "slow", "expensive", "overpriced", "cancel", "locked in", "lock-in", "hate", "terrible", "awful", "frustrating", "doesn't work", "does not work", "buggy", "missing", "hard to use", "poor", "worst", "problem", "issue", "issues", "churn", "替代", "不好用", "太贵", "吐槽", "很难用", "难用", "取消订阅", "无法", "痛苦", "卡顿", "崩溃", "缺少", "问题"
];
const COMPLAINT_CONTEXT_TERMS = ["saas", "tool", "app", "software", "product", "workflow", "billing", "subscription", "crm", "api", "dashboard", "agent", "ai", "mcp", "automation", "email", "notion", "excel", "spreadsheet", "service", "平台", "工具", "产品", "软件", "订阅", "工作流", "自动化"];
const BUZZING_RSS_SOURCES = [
  ["Buzzing Product Hunt", "https://ph.buzzing.cc/feed.xml", 18],
  ["Buzzing Show HN", "https://showhn.buzzing.cc/feed.xml", 18],
  ["Buzzing SideProject", "https://sideproject.buzzing.cc/feed.xml", 18],
  ["Buzzing HN Front", "https://hnfront.buzzing.cc/feed.xml", 18],
  ["Buzzing HN Ask", "https://askhn.buzzing.cc/feed.xml", 18],
  ["Buzzing Dev.to", "https://dev.buzzing.cc/feed.xml", 18],
  ["Buzzing Lobsters", "https://lobste.buzzing.cc/feed.xml", 12],
  ["Buzzing Tech News", "https://tech.buzzing.cc/feed.xml", 12],
  ["Buzzing Reddit Ask", "https://ask.buzzing.cc/feed.xml", 12],
];

function hash(input) { return crypto.createHash("sha1").update(input).digest("hex").slice(0, 12); }
function clean(s = "") { return String(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function daysOld(date) {
  if (!date) return 14;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return 14;
  return Math.max(0, (Date.now() - t) / 86400000);
}
function keywordHits(text, list) {
  const lower = text.toLowerCase();
  return list.filter(k => lower.includes(k.toLowerCase()));
}
function uniqueByUrl(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = (item.url || item.title).replace(/\?.*$/, "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key); out.push(item);
  }
  return out;
}
async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 16000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 topic-radar/0.1", "accept": "text/html,application/json,application/rss+xml,*/*" }});
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}
async function scrapeLinks(source, url, selector = "a") {
  try {
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    const items = [];
    $(selector).slice(0, 120).each((_, el) => {
      const title = clean($(el).text());
      const href = $(el).attr("href");
      if (!title || title.length < 8 || !href) return;
      let full;
      try { full = new URL(href, url).toString(); } catch { return; }
      if (full.includes("javascript:") || full.includes("#")) return;
      items.push({ title, url: full, source, summary: title, publishedAt: new Date().toISOString(), rawSignal: 8 });
    });
    return items;
  } catch (e) {
    console.warn(`source failed: ${source}: ${e.message}`);
    return [];
  }
}
async function fetchRSS(source, url) {
  try {
    const feed = await parser.parseURL(url);
    return (feed.items || []).slice(0, 40).map(i => ({
      title: clean(i.title),
      url: i.link,
      source,
      summary: clean(i.contentSnippet || i.summary || i.content || i.title).slice(0, 260),
      publishedAt: i.isoDate || i.pubDate || new Date().toISOString(),
      rawSignal: 12,
    })).filter(i => i.title && i.url);
  } catch (e) {
    console.warn(`rss failed: ${source}: ${e.message}`);
    return [];
  }
}
export function detectOpportunitySignals(text = "") {
  const complaintHits = keywordHits(text, COMPLAINT_TERMS);
  const contextHits = keywordHits(text, COMPLAINT_CONTEXT_TERMS);
  return {
    hasComplaint: complaintHits.length > 0 && (contextHits.length > 0 || /tell hn|ask hn|sideproject|product hunt|saas|tool|app/i.test(text)),
    complaintHits,
    contextHits,
  };
}
function isRelevantBuzzingItem(text, source = "") {
  const aiHits = keywordHits(text, KEYWORDS.ai);
  const saasHits = keywordHits(text, KEYWORDS.saas);
  const indieHits = keywordHits(text, KEYWORDS.indie);
  const hotHits = keywordHits(text, HOT_TERMS);
  const opportunity = detectOpportunitySignals(text);
  const sourceBoost = /Product Hunt|Show HN|SideProject|HN Ask|Dev\.to/i.test(source);
  return aiHits.length || saasHits.length || indieHits.length || hotHits.length >= 2 || opportunity.hasComplaint || (sourceBoost && (keywordHits(text, COMPLAINT_CONTEXT_TERMS).length || /build|built|launch|tool|app|product|startup|项目|产品|工具|开发/i.test(text)));
}
export function mapBuzzingFeedItems(source, feedItems = [], limit = 40) {
  return (feedItems || [])
    .slice(0, limit)
    .map((i) => {
      const title = clean(i.title);
      const summary = clean(i.contentSnippet || i.summary || i.content || i.title).slice(0, 280);
      const text = `${title} ${summary}`;
      if (!title || !i.link || !isRelevantBuzzingItem(text, source)) return null;
      const opportunity = detectOpportunitySignals(text);
      return {
        title,
        url: i.link,
        source,
        summary,
        publishedAt: i.isoDate || i.pubDate || new Date().toISOString(),
        rawSignal: opportunity.hasComplaint ? 16 : 13,
      };
    })
    .filter(Boolean);
}
async function fetchBuzzingRssSources() {
  const batches = await Promise.all(BUZZING_RSS_SOURCES.map(async ([source, url, limit]) => {
    try {
      const feed = await parser.parseURL(url);
      return mapBuzzingFeedItems(source, feed.items || [], limit);
    } catch (e) {
      console.warn(`buzzing rss failed: ${source}: ${e.message}`);
      return [];
    }
  }));
  return batches.flat();
}
async function fetchHN() {
  const queries = ["AI SaaS", "AI agent", "automation startup", "indie hacker", "LLM workflow", "browser agent", "micro SaaS"];
  const all = [];
  for (const q of queries) {
    try {
      const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=20`;
      const json = JSON.parse(await fetchText(url));
      for (const h of json.hits || []) {
        all.push({ title: clean(h.title), url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, source: "Hacker News", summary: clean(h.title), publishedAt: h.created_at, rawSignal: Math.min(30, 8 + (h.points || 0) / 12 + (h.num_comments || 0) / 8) });
      }
    } catch (e) { console.warn(`HN failed ${q}: ${e.message}`); }
  }
  return all.filter(i => i.title && i.url);
}
async function fetchGitHub() {
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 21).toISOString().slice(0,10);
  const qs = [
    `ai agent created:>${since} stars:>30`,
    `llm automation created:>${since} stars:>20`,
    `saas boilerplate created:>${since} stars:>20`,
    `mcp server created:>${since} stars:>15`,
  ];
  const all = [];
  for (const q of qs) {
    try {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=20`;
      const json = JSON.parse(await fetchText(url));
      for (const r of json.items || []) {
        all.push({ title: `${r.full_name} ★${r.stargazers_count}`, url: r.html_url, source: "GitHub Trending Search", summary: clean(r.description || r.full_name), publishedAt: r.created_at || r.updated_at, rawSignal: Math.min(35, 10 + Math.log10((r.stargazers_count || 0) + 1) * 8) });
      }
    } catch (e) { console.warn(`GitHub failed ${q}: ${e.message}`); }
  }
  return all;
}
export function mapHuggingFaceModels(models = []) {
  return models
    .map((m) => {
      const id = m.modelId || m.id;
      if (!id) return null;
      const tags = Array.isArray(m.tags) ? m.tags.slice(0, 8) : [];
      const pipeline = m.pipeline_tag || m.pipelineTag || "model";
      const likes = Number(m.likes || 0);
      const downloads = Number(m.downloads || 0);
      const signal = Math.min(32, 9 + Math.log10(likes + 1) * 5 + Math.log10(downloads + 1) * 3);
      const tagText = tags.length ? tags.join(", ") : pipeline;
      return {
        title: `${id} ❤${likes}`,
        url: `https://huggingface.co/${id}`,
        source: "Hugging Face Models",
        summary: `${pipeline}: ${tagText}`,
        publishedAt: m.lastModified || m.createdAt || m.updatedAt || new Date().toISOString(),
        rawSignal: signal,
      };
    })
    .filter(Boolean);
}
async function fetchHuggingFace() {
  try {
    const url = "https://huggingface.co/api/models?sort=likes&direction=-1&limit=40&full=false";
    const json = JSON.parse(await fetchText(url));
    return mapHuggingFaceModels(Array.isArray(json) ? json : []);
  } catch (e) {
    console.warn(`Hugging Face failed: ${e.message}`);
    return [];
  }
}
async function fetchDevto() {
  const tags = ["ai", "saas", "startup", "productivity", "webdev"];
  const all = [];
  for (const tag of tags) {
    try {
      const json = JSON.parse(await fetchText(`https://dev.to/api/articles?tag=${tag}&top=7&per_page=20`));
      for (const a of json || []) {
        all.push({ title: clean(a.title), url: a.url, source: "Dev.to", summary: clean(a.description || a.title), publishedAt: a.published_at, rawSignal: Math.min(28, 8 + (a.public_reactions_count || 0) / 5 + (a.comments_count || 0)) });
      }
    } catch (e) { console.warn(`Dev.to failed ${tag}: ${e.message}`); }
  }
  return all;
}
export function scoreItem(item) {
  const text = `${item.title} ${item.summary}`;
  const aiHits = keywordHits(text, KEYWORDS.ai);
  const saasHits = keywordHits(text, KEYWORDS.saas);
  const indieHits = keywordHits(text, KEYWORDS.indie);
  const contentHits = keywordHits(text, KEYWORDS.cnContent);
  const hotHits = keywordHits(text, HOT_TERMS);
  const opportunitySignals = detectOpportunitySignals(text);
  const complaintBoost = opportunitySignals.hasComplaint ? 8 : 0;
  const signal = Math.min(25, (item.rawSignal || 8) + (opportunitySignals.hasComplaint ? 3 : 0));
  const relevance = Math.min(25, aiHits.length * 4 + saasHits.length * 4 + indieHits.length * 3 + hotHits.length * 2 + (opportunitySignals.hasComplaint ? 4 : 0));
  const contentFit = Math.min(20, 5 + contentHits.length * 3 + (aiHits.length ? 5 : 0) + (hotHits.length ? 4 : 0) + (opportunitySignals.hasComplaint ? 4 : 0));
  const business = Math.min(20, 4 + saasHits.length * 4 + indieHits.length * 3 + (text.toLowerCase().includes("api") ? 3 : 0) + (text.toLowerCase().includes("workflow") ? 3 : 0) + complaintBoost);
  const recency = Math.max(0, Math.min(10, 10 - daysOld(item.publishedAt) * 0.7));
  const score = Math.max(0, Math.min(100, signal + relevance + contentFit + business + recency));
  const opportunity = opportunitySignals.hasComplaint ? { type: "用户吐槽/开发机会", complaintHits: opportunitySignals.complaintHits.slice(0, 5), contextHits: opportunitySignals.contextHits.slice(0, 5) } : undefined;
  const tags = [...new Set([...aiHits, ...saasHits, ...indieHits, ...contentHits, ...hotHits, ...(opportunity ? ["用户吐槽", "开发机会"] : [])])].slice(0, 10);
  const angles = buildAngles(item, { aiHits, saasHits, indieHits, hotHits, opportunity });
  const recommendation = recommend(item, score, { aiHits, saasHits, indieHits, contentHits, opportunity });
  const selectionReason = buildSelectionReason(item, { aiHits, saasHits, indieHits, contentHits, hotHits, signal, relevance, contentFit, business, recency, opportunity });
  const nextAction = buildNextAction(item, Math.round(score), { aiHits, saasHits, indieHits, contentHits, hotHits, opportunity }, recommendation);
  return { ...item, id: hash(item.url || item.title), score: Math.round(score), scoreBreakdown: { signal: Math.round(signal), relevance: Math.round(relevance), contentFit: Math.round(contentFit), business: Math.round(business), recency: Math.round(recency) }, tags: tags.length ? tags : ["trend"], angles, recommendation, selectionReason, nextAction, opportunity };
}
function buildAngles(item, hits) {
  const out = [];
  if (hits.opportunity) out.push("用户吐槽 → 开发机会");
  if (hits.aiHits.length) out.push("AI 工具/工作流拆解");
  if (hits.saasHits.length) out.push("海外 SaaS 产品机会");
  if (hits.indieHits.length) out.push("独立开发者/增长案例");
  if (hits.hotHits.includes("mcp")) out.push("MCP 生态应用清单");
  if (hits.hotHits.includes("coding")) out.push("AI 编程提效实测");
  if (hits.hotHits.includes("browser")) out.push("浏览器 Agent 场景");
  out.push("小红书卡片：痛点-工具-结果");
  return [...new Set(out)].slice(0, 4);
}
function recommend(item, score, hits) {
  if (hits.opportunity) return "用户吐槽/开发机会";
  if (score >= 70 && hits.saasHits.length) return "公众号深度文 + SaaS 机会评估";
  if (score >= 65 && hits.aiHits.length) return "小红书工具卡 + 实测教程";
  if (hits.indieHits.length) return "独立开发案例库";
  if (score >= 55) return "快讯/素材池追踪";
  return "观察名单";
}
function listHits(label, hits, max = 3) {
  return hits.length ? `${label}：${hits.slice(0, max).join("、")}` : "";
}
function buildSelectionReason(item, hits) {
  const parts = [
    `来源 ${item.source} 的信号强度 ${Math.round(hits.signal)}/25`,
    hits.opportunity ? `用户负反馈：${hits.opportunity.complaintHits.slice(0, 3).join("、")}` : "",
    listHits("AI/工具关键词", hits.aiHits),
    listHits("SaaS/商业关键词", hits.saasHits),
    listHits("独立开发/增长关键词", hits.indieHits),
    listHits("内容适配关键词", hits.contentHits),
    listHits("热点场景", hits.hotHits),
  ].filter(Boolean);
  return `入选原因：${parts.slice(0, 4).join("；")}。`;
}
function buildNextAction(item, score, hits, recommendation) {
  if (hits.opportunity) {
    return "建议：把这条负反馈当作开发机会处理，先追原帖评论确认高频痛点，再拆 MVP 替代方案：目标用户、现有 SaaS 不好用点、愿付费场景、可 1 周验证的最小功能。";
  }
  if (recommendation.includes("公众号深度文")) {
    return "建议：先做 30 分钟资料核验，拆成“痛点 → 现有方案 → 商业化机会 → 可复制工作流”，再决定是否写公众号深度文。";
  }
  if (recommendation.includes("小红书")) {
    return "建议：做一张小红书卡片，标题突出具体人群和结果；同时找 2-3 个同类工具做实测对比。";
  }
  if (recommendation.includes("独立开发")) {
    return "建议：加入案例库，补充创始人、定价、获客渠道和 MRR/增长线索，用作后续选题或产品机会素材。";
  }
  if (score >= 55 || hits.hotHits.length) {
    return "建议：先放入素材池追踪 24-48 小时，观察是否有二次传播、竞品跟进或用户评论痛点。";
  }
  return "建议：暂不投入写作，只保留为观察名单；如果后续出现更多讨论或真实用户案例再升级。";
}
export function buildSourceBuckets(items = [], limitPerSource = 5) {
  const grouped = new Map();
  for (const item of items) {
    const source = item.source || "Unknown";
    if (!grouped.has(source)) grouped.set(source, []);
    grouped.get(source).push(item);
  }
  return [...grouped.entries()]
    .map(([source, sourceItems]) => ({
      source,
      count: sourceItems.length,
      averageScore: Math.round(sourceItems.reduce((sum, item) => sum + (item.score || 0), 0) / sourceItems.length),
      items: sourceItems.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, limitPerSource),
    }))
    .sort((a, b) => b.count - a.count || b.averageScore - a.averageScore || a.source.localeCompare(b.source));
}
async function main() {
  const sources = await Promise.all([
    scrapeLinks("AIHOT", "https://aihot.virxact.com/"),
    fetchBuzzingRssSources(),
    fetchRSS("Product Hunt RSS", "https://www.producthunt.com/feed"),
    fetchHN(),
    fetchGitHub(),
    fetchHuggingFace(),
    fetchDevto(),
  ]);
  const merged = uniqueByUrl(sources.flat())
    .map(scoreItem)
    .filter(i => i.score >= 35)
    .sort((a,b) => b.score - a.score)
    .slice(0, 80);
  const topItems = merged.slice(0, 30);
  const opportunityItems = merged.filter((item) => item.opportunity).slice(0, 12);
  const byAction = {};
  const sourceStats = {};
  for (const item of merged) {
    (byAction[item.recommendation] ||= []).push(item);
    sourceStats[item.source] = (sourceStats[item.source] || 0) + 1;
  }
  const data = { generatedAt: new Date().toISOString(), sourceCount: Object.keys(sourceStats).length, itemCount: merged.length, topItems, opportunityItems, byAction, sourceStats, bySource: buildSourceBuckets(merged, 5) };
  if (SHOULD_WRITE) {
    await fs.mkdir(path.dirname(OUT), { recursive: true });
    await fs.writeFile(OUT, JSON.stringify(data, null, 2));
    console.log(`Wrote ${OUT} with ${merged.length} scored items.`);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
