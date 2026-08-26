const express = require('express');
const { searchAll, getFieldId } = require('../jiraClient');
const cache = require('../cache');
const { enrichWithParentOpportunity, aggregateWorkload } = require('../workloadAggregation');

const router = express.Router();
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 300);

const PGM_ISSUE_TYPES = [
  'PgM Execution - Configuration',
  'PgM Execution - Integration',
  'PgM Execution - Warehousing',
  'PgM Execution - IMS',
];

// Union of the page's bullet-chart list (adds "Systemic Resolution In
// Process") and its KPI card list - see Engineering Workload's note on why
// the union is used instead of picking one of the two mismatched lists.
const ACTIVE_STATUSES = new Set([
  'Awaiting Parts',
  'In Process',
  'On Hold',
  'Systemic Resolution In Process',
  'Pending Response - Account Team/Customer',
]);
const BACKLOG_STATUSES = new Set(['Assigned', 'New']);

router.get('/api/program-management-workload', async (req, res) => {
  const projectKey = process.env.JIRA_PROJECT_KEY || 'FPT';
  const cacheKey = `program-management-workload:${projectKey}`;

  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const complexityField = await getFieldId('Complexity Level');
    const opportunityTypeField = await getFieldId('Opportunity Type');

    const typeList = PGM_ISSUE_TYPES.map((t) => `"${t}"`).join(',');
    const jql = `project = ${projectKey} AND resolution = Unresolved AND issuetype in (${typeList})`;
    const issues = await searchAll(jql, ['assignee', 'status', 'issuetype', complexityField, 'parent']);

    const parentInfo = await enrichWithParentOpportunity(issues, opportunityTypeField);
    const { kpis, workload, workItems } = aggregateWorkload(issues, complexityField, {
      activeStatuses: ACTIVE_STATUSES,
      backlogStatuses: BACKLOG_STATUSES,
      parentInfo,
    });

    const payload = { project: projectKey, kpis, workload, workItems, updatedAt: new Date().toISOString() };
    cache.set(cacheKey, payload, CACHE_TTL_SECONDS);
    res.json(payload);
  } catch (err) {
    console.error('program-management-workload failed:', err);
    res.status(502).json({ error: 'Failed to load program management workload from Jira' });
  }
});

module.exports = router;
