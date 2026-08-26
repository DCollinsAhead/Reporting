const express = require('express');
const { searchAll, getFieldId } = require('../jiraClient');
const cache = require('../cache');
const { enrichWithParentOpportunity } = require('../workloadAggregation');

const router = express.Router();
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 300);

// The 5 Quotation pages (Overall/Warehousing/Configuration/Integration/IMS)
// are the same "Quoting" child-issue dataset, each filtered to a different
// parent Opportunity Type - one shared endpoint, filtered client-side by tab,
// beats five near-identical Jira queries for what's really one dataset.
//
// Simplified from the source report: the two lineClusteredColumnComboChart
// visuals (a full-history trend and a recent-window trend) are combined here
// into one monthly-created-count chart, and "Time To Completion (Days)" is
// approximated as (resolutiondate - created) since the exact Power BI
// calculated-column formula for it wasn't available.
const EXCLUDED_STATUSES = new Set(['Cancelled', 'Not Foundry', 'Not Required']);

router.get('/api/quotation', async (req, res) => {
  const projectKey = process.env.JIRA_PROJECT_KEY || 'FPT';
  const cacheKey = `quotation:${projectKey}`;

  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const opportunityTypeField = await getFieldId('Opportunity Type');

    const jql = `project = ${projectKey} AND issuetype = "Quoting"`;
    const issues = await searchAll(jql, ['assignee', 'status', 'created', 'resolutiondate', 'parent']);
    const inScope = issues.filter((i) => !EXCLUDED_STATUSES.has(i.fields.status?.name));

    const parentInfo = await enrichWithParentOpportunity(inScope, opportunityTypeField);

    const quotes = inScope.map((issue) => {
      const parentKey = issue.fields.parent?.key;
      const parent = parentKey ? parentInfo.get(parentKey) : null;
      const created = issue.fields.created;
      const resolved = issue.fields.resolutiondate;
      return {
        key: issue.key,
        assignee: issue.fields.assignee?.displayName || 'Unassigned',
        opportunityType: parent?.opportunityType || 'Unknown',
        createdMonth: created ? created.slice(0, 7) : null,
        isDone: resolved != null,
        timeToCompletionDays: resolved ? Math.round((new Date(resolved) - new Date(created)) / 86400000) : null,
      };
    });

    const payload = { project: projectKey, quotes, updatedAt: new Date().toISOString() };
    cache.set(cacheKey, payload, CACHE_TTL_SECONDS);
    res.json(payload);
  } catch (err) {
    console.error('quotation failed:', err);
    res.status(502).json({ error: 'Failed to load quotation data from Jira' });
  }
});

module.exports = router;
