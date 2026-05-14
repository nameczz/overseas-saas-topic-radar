# Overseas SaaS Topic Radar

海外 SaaS / AI 工具 / 小程序 / 小红书 / 公众号选题雷达。

它会从公开信息源采集产品、技术、社区和趋势信号，按「爆点潜力、商业价值、内容适配、时效性、可执行性」综合打分，并生成一个可部署到 Vercel 的实时看板。

## 信息源

- AIHOT: `https://aihot.virxact.com/`
- Buzzing: `https://www.buzzing.cc/`
- Hacker News Algolia：AI / SaaS / agent / indie hacker 等关键词
- GitHub Search：近期高增长 AI / SaaS / automation / agent repo
- Hugging Face Models：Trending 模型、空间和 AI 能力信号
- Dev.to：AI / SaaS / startup / product 相关文章
- Product Hunt RSS：新产品信号（如果 RSS 可访问）

## 本地运行

```bash
npm install
npm run refresh
npm run dev
```

打开 <http://localhost:3000>。

## 更新频率

`.github/workflows/update-radar.yml` 每 3 小时执行一次：

1. 采集最新信号
2. 重新评分和生成 `public/data/latest.json`
3. 有变化就 commit/push
4. Vercel 连接该 repo 后会自动重新部署

也支持手动运行：

```bash
npm run refresh
```

## 评分逻辑

总分 0-100：

- 热度/信号强度：25%
- 与海外 SaaS / AI / agent / automation / 小程序机会的相关性：25%
- 公众号/小红书内容传播适配：20%
- 商业化/产品化机会：20%
- 时效性：10%

看板里的「推荐动作」会把候选选题映射到：公众号深度文、小红书卡片、SaaS/小程序机会、资料库追踪。
