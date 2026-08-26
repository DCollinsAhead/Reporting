const express = require('express');
const { searchAll, getFieldId } = require('../jiraClient');
const cache = require('../cache');
const { enrichWithParentOpportunity, aggregateWorkload } = require('../workloadAggregation');

const router = express.Router();
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 300);

const OPS_ISSUE_TYPES = [
  'Operations Execution - Integration',
  'Operations Execution - Warehousing',
  'Operations Execution - Configuration',
];

const ACTIVE_STATUSES = new Set(['In Process', 'On Hold', 'Awaiting Parts']);
const BACKLOG_STATUSES = new Set(['Assigned', 'New', 'Pending Assignment']);

router.get('/api/operations-workload', async (req, res) => {
  const projectKey = process.env.JIRA_PROJECT_KEY || 'FPT';
  const cacheKey = `operations-workload:${projectKey}`;

  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const complexityField = await getFieldId('Complexity Level');
    const opportunityTypeField = await getFieldId('Opportunity Type');

    const typeList = OPS_ISSUE_TYPES.map((t) => `"${t}"`).join(',');
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
    console.error('operations-workload failed:', err);
    res.status(502).json({ error: 'Failed to load operations workload from Jira' });
  }
});

module.exports = router;
