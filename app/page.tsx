import fs from "node:fs/promises";
import path from "node:path";

type RadarItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  summary: string;
  publishedAt?: string;
  score: number;
  scoreBreakdown: Record<string, number>;
  tags: string[];
  angles: string[];
  recommendation: string;
  selectionReason?: string;
  nextAction?: string;
  opportunity?: { type: string; complaintHits?: string[]; contextHits?: string[] };
};

type RadarData = {
  generatedAt: string;
  sourceCount: number;
  itemCount: number;
  topItems: RadarItem[];
  opportunityItems?: RadarItem[];
  byAction: Record<string, RadarItem[]>;
  sourceStats: Record<string, number>;
  bySource?: { source: string; count: number; averageScore: number; items: RadarItem[] }[];
};

async function loadData(): Promise<RadarData> {
  const file = path.join(process.cwd(), "public", "data", "latest.json");
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return {
      generatedAt: new Date().toISOString(),
      sourceCount: 0,
      itemCount: 0,
      topItems: [],
      byAction: {},
      sourceStats: {},
    };
  }
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(iso));
}

function Score({ value }: { value: number }) {
  return <div className="score">{Math.round(value)}</div>;
}

function SourceNote({ source }: { source: string }) {
  const notes: Record<string, string> = {
    "Hacker News": "看技术人和创业者正在讨论什么，适合找争议点、Show HN/Launch HN 案例和早期产品信号。",
    "GitHub Trending Search": "看新出现且快速涨星的工具/代码项目，适合作为实测案例，但不应单独决定选题。",
    "Hugging Face Models": "看模型和能力层的新热点，适合判断视频、语音、embedding、agent 基建等方向是否升温。",
    "Dev.to": "看开发者教程和 SaaS 实战文章，适合改造成教程、避坑和案例拆解。",
    "AIHOT": "看中文 AI 工具聚合热度，适合判断国内内容受众是否容易理解。",
    "Buzzing": "看 PH/HN/SideProject 等聚合趋势，适合补充跨社区热度。",
    "Buzzing Product Hunt": "从 Buzzing 的 Product Hunt 中文导读里看新产品、AI 工具和 SaaS 发布。",
    "Buzzing Show HN": "从 Buzzing 的 Show HN 里看早期 demo、开发者工具和可复刻的小产品。",
    "Buzzing SideProject": "从 Buzzing 的 SideProject 里看独立开发者真实反馈、增长故事和失败/吐槽。",
    "Buzzing HN Front": "从 Buzzing 的 HN 首页看技术圈高质量讨论、AI 新闻和负反馈信号。",
    "Buzzing HN Ask": "从 Buzzing 的 Ask HN 看用户痛点、工具替代需求和 SaaS 不好用的抱怨。",
    "Buzzing Dev.to": "从 Buzzing 的 Dev.to 看开发者教程、AI 工具实践和 MCP/Agent 经验。",
    "Buzzing Lobsters": "从 Buzzing 的 Lobsters 看开发者深度讨论和基础设施趋势。",
    "Buzzing Tech News": "从 Buzzing 的科技头条补充 AI/软件行业新闻背景。",
    "Buzzing Reddit Ask": "从 Buzzing 的 Reddit 提问里捕捉用户吐槽、替代方案和真实需求。",
    "Product Hunt RSS": "看新产品发布，适合找海外 SaaS、小工具、小程序机会。",
    "X/Twitter": "推特/X 可用于捕捉即时讨论和创始人 thread；当前本机 xurl 未配置，暂未接入自动抓取。",
  };
  return <p className="source-note">{notes[source] ?? "按该来源单独查看候选项，避免综合排序把小来源信号淹没。"}</p>;
}

function ItemCard({ item, lead = false, compact = false }: { item: RadarItem; lead?: boolean; compact?: boolean }) {
  const body = (
    <>
      <div>
        <a href={item.url} target="_blank" rel="noreferrer"><h3>{item.title}</h3></a>
        <p>{item.summary}</p>
        <div className="tags">{item.tags.slice(0, compact ? 5 : 8).map((t) => <span className="tag" key={t}>{t}</span>)}</div>
        {!compact && <div className="explain">
          <div><strong>为什么值得看：</strong>{item.selectionReason?.replace(/^入选原因：/, "") ?? "命中当前 AI/SaaS/内容趋势关键词，且综合评分达到候选阈值。"}</div>
          <div><strong>你应该做什么：</strong>{item.nextAction?.replace(/^建议：/, "") ?? item.recommendation}</div>
        </div>}
        <div className="source">{item.source}{item.publishedAt ? ` · ${fmtTime(item.publishedAt)}` : ""}</div>
      </div>
      <div className="actions">
        <span className="action">{item.recommendation}</span>
        {item.angles.slice(0, 2).map((a) => <span className="pill" key={a}>{a}</span>)}
      </div>
    </>
  );
  if (lead) return <div className="lead"><Score value={item.score}/><div>{body}</div></div>;
  return <div className={compact ? "item compact" : "item"}><Score value={item.score}/>{body}</div>;
}

export default async function Home() {
  const data = await loadData();
  const lead = data.topItems[0];
  const rest = data.topItems.slice(1, 18);
  const actionRows = Object.entries(data.byAction).sort((a,b)=>b[1].length-a[1].length);
  const sourceRows = Object.entries(data.sourceStats).sort((a,b)=>b[1]-a[1]);
  const sourceBuckets = data.bySource ?? sourceRows.map(([source]) => ({ source, count: data.sourceStats[source], averageScore: 0, items: Object.values(data.byAction).flat().filter((item) => item.source === source).slice(0, 5) }));
  const opportunityItems = data.opportunityItems ?? Object.values(data.byAction).flat().filter((item) => item.opportunity).slice(0, 12);
  return (
    <main className="container">
      <section className="hero">
        <div className="hero-main card">
          <div className="kicker">Overseas SaaS Topic Radar</div>
          <h1>海外 SaaS / AI 产品选题雷达</h1>
          <p className="subtitle">每 3 小时扫描 AIHOT、Buzzing、HN、GitHub、Hugging Face、Dev.to、Product Hunt 等公开信号，精选适合公众号、小红书、小程序和海外 SaaS 的候选选题，并给出评分、内容角度和行动建议。</p>
          <div className="meta">
            <span className="pill">最近更新：{fmtTime(data.generatedAt)}</span>
            <span className="pill">候选信号：{data.itemCount}</span>
            <span className="pill">信息源：{data.sourceCount}</span>
            <span className="pill">更新频率：3 小时</span>
          </div>
        </div>
        <div className="hero-side card">
          <div className="metric"><strong>{data.topItems.length}</strong><span>精选候选选题</span></div>
          <div className="metric"><strong>{lead ? Math.round(lead.score) : 0}</strong><span>当前最高分</span></div>
          <div className="metric"><strong>{actionRows[0]?.[0] ?? "-"}</strong><span>主推荐动作</span></div>
        </div>
      </section>

      <section className="grid">
        <div className="section card">
          <h2>今日首推</h2>
          {lead ? <ItemCard item={lead} lead/> : <div className="empty">还没有采集到数据，先运行 npm run refresh。</div>}
        </div>
        <div className="section card">
          <h2>精选选题池</h2>
          {rest.map((item) => <ItemCard key={item.id} item={item}/>)}
        </div>
        <div className="section card two">
          <h2>推荐动作分布</h2>
          <table className="table"><tbody>{actionRows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v.length} 个</td><td>{v.slice(0,3).map(i=>i.title).join(" / ")}</td></tr>)}</tbody></table>
        </div>
        <div className="section card two">
          <h2>信息源贡献</h2>
          <table className="table"><tbody>{sourceRows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
        </div>
        <div className="section card opportunity-section">
          <h2>用户吐槽与开发机会</h2>
          <p className="section-intro">把“某个 SaaS/工具不好用、太贵、难取消、流程痛苦、缺功能”等负反馈作为重要信号：先看原帖评论验证是否高频，再拆 MVP 替代方案。</p>
          {opportunityItems.length ? opportunityItems.map((item) => <ItemCard key={item.id} item={item} compact />) : <div className="empty">暂未抓到明显负反馈；会持续从 Buzzing/HN/Reddit/SideProject 等来源跟踪。</div>}
        </div>
        <div className="section card source-section">
          <h2>按数据源拆看</h2>
          <p className="section-intro">综合排序容易被 GitHub/HF 这种高信号源淹没；这里把每个来源单独展开。推特/X 是独立来源，但当前本机 xurl 未配置，所以先显示接入说明，不混入结果。</p>
          <div className="source-grid">
            {[...sourceBuckets, { source: "X/Twitter", count: 0, averageScore: 0, items: [] }].map((bucket) => (
              <section className="source-card" key={bucket.source}>
                <div className="source-head">
                  <div>
                    <h3>{bucket.source}</h3>
                    <SourceNote source={bucket.source} />
                  </div>
                  <div className="source-metrics"><span>{bucket.count} 条</span>{bucket.averageScore ? <span>均分 {bucket.averageScore}</span> : null}</div>
                </div>
                {bucket.items.length ? bucket.items.map((item) => <ItemCard key={item.id} item={item} compact />) : <div className="empty">当前没有可展示条目，或该来源尚未接入/未过筛选阈值。</div>}
              </section>
            ))}
          </div>
        </div>
      </section>
      <div className="footer">Generated by Hermes · 数据来自公开网页/API，仅作选题雷达与人工筛选参考。</div>
    </main>
  );
}
