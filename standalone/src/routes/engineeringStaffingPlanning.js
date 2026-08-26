const express = require('express');
const { searchAll, getFieldId } = require('../jiraClient');
const cache = require('../cache');
const { enrichWithParentOpportunity } = require('../workloadAggregation');
const { workloadWeight } = require('../workloadWeights');

const router = express.Router();
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 300);

// Same 5 engineering child issue types as the Engineering Workload page - the
// source report's Projected Workload bullet chart on this page carried no
// visual-level filter of its own, but the page's table/Gantt do, so this
// scope is applied consistently across the whole page.
const ENGINEERING_ISSUE_TYPES = [
  'Configuration Execution',
  'Configuration Sustainment',
  'Integration Execution',
  'Integration Finalization',
  'Meta Integration Review',
];

// Mirrors the "Projected Workload" DAX measure: the same Workload Weight V3
// lookup, but only counted for work that hasn't started yet.
function projectedWeight(issueType, complexity, startDate) {
  if (!startDate) return 0;
  return new Date() < new Date(startDate) ? workloadWeight(issueType, complexity) : 0;
}

router.get('/api/engineering-staffing-planning', async (req, res) => {
  const projectKey = process.env.JIRA_PROJECT_KEY || 'FPT';
  const cacheKey = `engineering-staffing-planning:${projectKey}`;

  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const complexityField = await getFieldId('Complexity Level');
    const opportunityTypeField = await getFieldId('Opportunity Type');
    const startDateField = await getFieldId('Start date');
    const dueDateField = await getFieldId('Due date');

    const typeList = ENGINEERING_ISSUE_TYPES.map((t) => `"${t}"`).join(',');
    const jql = `project = ${projectKey} AND resolution = Unresolved AND issuetype in (${typeList})`;
    const issues = await searchAll(jql, [
      'assignee',
      'issuetype',
      complexityField,
      'parent',
      startDateField,
      dueDateField,
    ]);

    const parentInfo = await enrichWithParentOpportunity(issues, opportunityTypeField);

    const projectedByAssignee = new Map();
    const timeline = [];

    for (const issue of issues) {
      const displayName = issue.fields.assignee?.displayName || 'Unassigned';
      const issueType = issue.fields.issuetype?.name;
      const complexityValue = issue.fields[complexityField]?.value ?? issue.fields[complexityField] ?? null;
      const startDate = issue.fields[startDateField];
      const dueDate = issue.fields[dueDateField];
      const parentKey = issue.fields.parent?.key;
      const parent = parentKey ? parentInfo.get(parentKey) : null;

      const weight = projectedWeight(issueType, complexityValue, startDate);
      if (weight > 0) {
        projectedByAssignee.set(displayName, (projectedByAssignee.get(displayName) || 0) + weight);
      }

      timeline.push({
        key: issue.key,
        opportunitySummary: parent?.summary || '—',
        assignee: displayName,
        issueType,
        complexity: complexityValue?.replace(/^\d - /, '') || '—',
        startDate: startDate || null,
        dueDate: dueDate || null,
      });
    }

    const round = (n) => Math.round(n * 100) / 100;
    const payload = {
      project: projectKey,
      projectedWorkload: [...projectedByAssignee.entries()]
        .map(([displayName, weight]) => ({ displayName, weight: round(weight) }))
        .sort((a, b) => b.weight - a.weight),
      timeline: timeline.filter((t) => t.startDate || t.dueDate).sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '')),
      updatedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, payload, CACHE_TTL_SECONDS);
    res.json(payload);
  } catch (err) {
    console.error('engineering-staffing-planning failed:', err);
    res.status(502).json({ error: 'Failed to load engineering staffing planning from Jira' });
  }
});

module.exports = router;
