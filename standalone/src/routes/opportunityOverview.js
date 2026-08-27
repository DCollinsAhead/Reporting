const express = require('express');
const { searchAll, getFieldId } = require('../jiraClient');
const cache = require('../cache');

const router = express.Router();
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 300);

// The source report's trend chart only tracks these three types and uses a
// rolling 2-year window - a Power BI RelativeDate filter on Created:
// DateAdd(Now(), -2, TimeUnit.Year) through Now(). (TimeUnit 3 in the PBIR
// filter JSON is Year, not Month - easy to misread since Month is 2.)
// JQL's relative-date shorthand only supports m/h/d/w units (no "y" for
// years - that's rejected outright), so the 2-year window is expressed in
// days here.
const TREND_TYPES = ['Integration', 'Staging', 'Warehousing'];
const TREND_WINDOW_DAYS = 730;

router.get('/api/opportunity-overview', async (req, res) => {
  const projectKey = process.env.JIRA_PROJECT_KEY || 'FPT';
  const cacheKey = `opportunity-overview:${projectKey}`;

  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const opportunityTypeField = await getFieldId('Opportunity Type');

    const allOpportunities = await searchAll(
      `project = ${projectKey} AND issuetype = Opportunity`,
      [opportunityTypeField]
    );

    const byType = new Map();
    for (const issue of allOpportunities) {
      const type = issue.fields[opportunityTypeField]?.value ?? issue.fields[opportunityTypeField] ?? 'Unknown';
      byType.set(type, (byType.get(type) || 0) + 1);
    }

    const trendTypeList = TREND_TYPES.map((t) => `"${t}"`).join(',');
    const trendIssues = await searchAll(
      `project = ${projectKey} AND issuetype = Opportunity AND "Opportunity Type" in (${trendTypeList}) AND created >= -${TREND_WINDOW_DAYS}d`,
      ['created', opportunityTypeField]
    );

    const byMonth = new Map(); // "2026-07" -> { Integration: n, Staging: n, Warehousing: n }
    for (const issue of trendIssues) {
      const type = issue.fields[opportunityTypeField]?.value ?? issue.fields[opportunityTypeField];
      if (!TREND_TYPES.includes(type)) continue;
      const month = issue.fields.created.slice(0, 7); // YYYY-MM
      if (!byMonth.has(month)) byMonth.set(month, { Integration: 0, Staging: 0, Warehousing: 0 });
      byMonth.get(month)[type] += 1;
    }

    const payload = {
      project: projectKey,
      byType: [...byType.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      trend: [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, counts]) => ({ month, ...counts })),
      updatedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, payload, CACHE_TTL_SECONDS);
    res.json(payload);
  } catch (err) {
    console.error('opportunity-overview failed:', err);
    res.status(502).json({ error: 'Failed to load opportunity overview from Jira' });
  }
});

module.exports = router;
