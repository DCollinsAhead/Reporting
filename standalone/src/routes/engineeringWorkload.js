const express = require('express');
const { searchAll, getFieldId } = require('../jiraClient');
const cache = require('../cache');
const { enrichWithParentOpportunity, aggregateWorkload } = require('../workloadAggregation');

const router = express.Router();
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 300);

// Ground truth for this page, taken directly from the source .pbix's page
// and visual filters (Report/definition/pages/.../page.json + visual.json) -
// not guessed. This is a narrower set than the full workload-weight table;
// the other child issue types belong to the Operations/PgM Workload pages.
const ENGINEERING_ISSUE_TYPES = [
  'Configuration Execution',
  'Configuration Sustainment',
  'Integration Execution',
  'Integration Finalization',
  'Meta Integration Review',
];

// "Active" status list, explicitly set to match both the "Active Work
// Items" KPI and the "Workload by Assignee" chart - they share this same
// set (see aggregateWorkload's activeStatuses param), so keeping one list
// here keeps both in sync by construction.
const BACKLOG_STATUSES = new Set(['New', 'Pending Assignment', 'Assigned']);
const ACTIVE_STATUSES = new Set([
  'In Process',
  'Awaiting Parts',
  'On Hold',
  'Pending Response - Account Team/Customer',
  'Pending Response - Foundry Internal',
  'Follow-up',
  'Systemic Resolution In Process',
]);

// Both bullet charts exclude Curt Petty (he gets his own "Engineering
// Manager's Workload" page) - the KPI totals and Work Items table do not.
const BULLET_CHART_EXCLUDED_ASSIGNEES = new Set(['Curt Petty']);

router.get('/api/engineering-workload', async (req, res) => {
  const projectKey = process.env.JIRA_PROJECT_KEY || 'FPT';
  const cacheKey = `engineering-workload:${projectKey}`;

  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const complexityField = await getFieldId('Complexity Level');
    const opportunityTypeField = await getFieldId('Opportunity Type');

    const typeList = ENGINEERING_ISSUE_TYPES.map((t) => `"${t}"`).join(',');
    const jql = `project = ${projectKey} AND resolution = Unresolved AND issuetype in (${typeList})`;
    const issues = await searchAll(jql, ['assignee', 'status', 'issuetype', complexityField, 'parent']);

    const parentInfo = await enrichWithParentOpportunity(issues, opportunityTypeField);
    const { kpis, workload, workItems } = aggregateWorkload(issues, complexityField, {
      activeStatuses: ACTIVE_STATUSES,
      backlogStatuses: BACKLOG_STATUSES,
      excludedFromActiveChart: BULLET_CHART_EXCLUDED_ASSIGNEES,
      excludedFromBacklogChart: BULLET_CHART_EXCLUDED_ASSIGNEES,
      parentInfo,
    });

    const payload = { project: projectKey, kpis, workload, workItems, updatedAt: new Date().toISOString() };
    cache.set(cacheKey, payload, CACHE_TTL_SECONDS);
    res.json(payload);
  } catch (err) {
    console.error('engineering-workload failed:', err);
    res.status(502).json({ error: 'Failed to load engineering workload from Jira' });
  }
});

module.exports = router;
