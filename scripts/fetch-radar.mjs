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
function scoreItem(item) {
  const text = `${item.title} ${item.summary}`;
  const aiHits = keywordHits(text, KEYWORDS.ai);
  const saasHits = keywordHits(text, KEYWORDS.saas);
  const indieHits = keywordHits(text, KEYWORDS.indie);
  const contentHits = keywordHits(text, KEYWORDS.cnContent);
  const hotHits = keywordHits(text, HOT_TERMS);
  const signal = Math.min(25, item.rawSignal || 8);
  const relevance = Math.min(25, aiHits.length * 4 + saasHits.length * 4 + indieHits.length * 3 + hotHits.length * 2);
  const contentFit = Math.min(20, 5 + contentHits.length * 3 + (aiHits.length ? 5 : 0) + (hotHits.length ? 4 : 0));
  const business = Math.min(20, 4 + saasHits.length * 4 + indieHits.length * 3 + (text.toLowerCase().includes("api") ? 3 : 0) + (text.toLowerCase().includes("workflow") ? 3 : 0));
  const recency = Math.max(0, Math.min(10, 10 - daysOld(item.publishedAt) * 0.7));
  const score = Math.max(0, Math.min(100, signal + relevance + contentFit + business + recency));
  const tags = [...new Set([...aiHits, ...saasHits, ...indieHits, ...contentHits, ...hotHits])].slice(0, 10);
  const angles = buildAngles(item, { aiHits, saasHits, indieHits, hotHits });
  const recommendation = recommend(item, score, { aiHits, saasHits, indieHits, contentHits });
  return { ...item, id: hash(item.url || item.title), score: Math.round(score), scoreBreakdown: { signal: Math.round(signal), relevance: Math.round(relevance), contentFit: Math.round(contentFit), business: Math.round(business), recency: Math.round(recency) }, tags: tags.length ? tags : ["trend"], angles, recommendation };
}
function buildAngles(item, hits) {
  const out = [];
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
  if (score >= 70 && hits.saasHits.length) return "公众号深度文 + SaaS 机会评估";
  if (score >= 65 && hits.aiHits.length) return "小红书工具卡 + 实测教程";
  if (hits.indieHits.length) return "独立开发案例库";
  if (score >= 55) return "快讯/素材池追踪";
  return "观察名单";
}
async function main() {
  const sources = await Promise.all([
    scrapeLinks("AIHOT", "https://aihot.virxact.com/"),
    scrapeLinks("Buzzing", "https://www.buzzing.cc/"),
    fetchRSS("Product Hunt RSS", "https://www.producthunt.com/feed"),
    fetchHN(),
    fetchGitHub(),
    fetchDevto(),
  ]);
  const merged = uniqueByUrl(sources.flat())
    .map(scoreItem)
    .filter(i => i.score >= 35)
    .sort((a,b) => b.score - a.score)
    .slice(0, 80);
  const topItems = merged.slice(0, 30);
  const byAction = {};
  const sourceStats = {};
  for (const item of merged) {
    (byAction[item.recommendation] ||= []).push(item);
    sourceStats[item.source] = (sourceStats[item.source] || 0) + 1;
  }
  const data = { generatedAt: new Date().toISOString(), sourceCount: Object.keys(sourceStats).length, itemCount: merged.length, topItems, byAction, sourceStats };
  if (SHOULD_WRITE) {
    await fs.mkdir(path.dirname(OUT), { recursive: true });
    await fs.writeFile(OUT, JSON.stringify(data, null, 2));
    console.log(`Wrote ${OUT} with ${merged.length} scored items.`);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}
main().catch(err => { console.error(err); process.exit(1); });
