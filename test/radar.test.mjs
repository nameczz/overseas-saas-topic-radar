import test from "node:test";
import assert from "node:assert/strict";
import { buildSourceBuckets, detectOpportunitySignals, mapBuzzingFeedItems, mapHuggingFaceModels, scoreItem } from "../scripts/fetch-radar.mjs";

test("scoreItem explains why a topic was selected and what to do next", () => {
  const item = scoreItem({
    title: "Acme AI workflow CRM API",
    url: "https://example.com/acme",
    source: "Example Source",
    summary: "AI agent workflow automation for SaaS customer support with API integration",
    publishedAt: new Date().toISOString(),
    rawSignal: 18,
  });

  assert.equal(typeof item.selectionReason, "string");
  assert.match(item.selectionReason, /入选原因/);
  assert.match(item.selectionReason, /AI|SaaS|工作流|API/);
  assert.equal(typeof item.nextAction, "string");
  assert.match(item.nextAction, /建议/);
  assert.ok(item.nextAction.length >= 12);
});

test("mapHuggingFaceModels turns Hub models into radar source items", () => {
  const items = mapHuggingFaceModels([
    {
      id: "Qwen/Qwen3-Embedding-4B",
      modelId: "Qwen/Qwen3-Embedding-4B",
      tags: ["sentence-transformers", "feature-extraction", "text-embeddings-inference"],
      likes: 123,
      downloads: 45678,
      lastModified: "2026-05-10T00:00:00.000Z",
      pipeline_tag: "feature-extraction",
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].source, "Hugging Face Models");
  assert.equal(items[0].url, "https://huggingface.co/Qwen/Qwen3-Embedding-4B");
  assert.match(items[0].title, /Qwen\/Qwen3-Embedding-4B/);
  assert.match(items[0].summary, /sentence-transformers/);
  assert.ok(items[0].rawSignal > 10);
});

test("buildSourceBuckets lets the dashboard inspect each source separately", () => {
  const items = [
    scoreItem({ title: "HN AI agent workflow", url: "https://news.ycombinator.com/item?id=1", source: "Hacker News", summary: "AI agent workflow discussion", publishedAt: new Date().toISOString(), rawSignal: 15 }),
    scoreItem({ title: "X AI SaaS launch", url: "https://x.com/example/status/1", source: "X/Twitter", summary: "AI SaaS launch thread", publishedAt: new Date().toISOString(), rawSignal: 14 }),
    scoreItem({ title: "HN SaaS API", url: "https://news.ycombinator.com/item?id=2", source: "Hacker News", summary: "SaaS API case", publishedAt: new Date().toISOString(), rawSignal: 13 }),
  ];
  const buckets = buildSourceBuckets(items, 2);

  assert.equal(buckets[0].source, "Hacker News");
  assert.equal(buckets[0].count, 2);
  assert.equal(buckets[0].items.length, 2);
  assert.equal(buckets[1].source, "X/Twitter");
  assert.equal(buckets[1].count, 1);
});

test("mapBuzzingFeedItems preserves Buzzing sub-sources and filters for AI or indie relevance", () => {
  const items = mapBuzzingFeedItems("Buzzing Product Hunt", [
    { title: "Frontdesk AI - AI COO for small business SaaS", link: "https://producthunt.com/posts/frontdesk-ai", contentSnippet: "AI tool for business workflow", isoDate: "2026-05-14T00:00:00.000Z" },
    { title: "Random football match", link: "https://example.com/sports", contentSnippet: "sports recap", isoDate: "2026-05-14T00:00:00.000Z" },
    { title: "I built a side project with 10k users", link: "https://reddit.com/r/SideProject/1", contentSnippet: "indie founder launch story", isoDate: "2026-05-14T00:00:00.000Z" },
  ]);

  assert.equal(items.length, 2);
  assert.equal(items[0].source, "Buzzing Product Hunt");
  assert.match(items.map((item) => item.title).join("\n"), /Frontdesk AI/);
  assert.match(items.map((item) => item.title).join("\n"), /side project/);
});

test("negative user feedback is promoted as a development opportunity", () => {
  const signals = detectOpportunitySignals("Tell HN: This SaaS billing workflow is painfully hard and impossible to cancel");
  assert.equal(signals.hasComplaint, true);
  assert.ok(signals.complaintHits.includes("painfully hard"));

  const item = scoreItem({
    title: "Tell HN: This SaaS billing workflow is painfully hard and impossible to cancel",
    url: "https://news.ycombinator.com/item?id=3",
    source: "Buzzing HN Front",
    summary: "users complain this SaaS is broken, slow and impossible to cancel",
    publishedAt: new Date().toISOString(),
    rawSignal: 14,
  });

  assert.equal(item.opportunity?.type, "用户吐槽/开发机会");
  assert.match(item.recommendation, /用户吐槽|开发机会/);
  assert.match(item.nextAction, /负反馈|MVP|替代方案|开发机会/);
});
