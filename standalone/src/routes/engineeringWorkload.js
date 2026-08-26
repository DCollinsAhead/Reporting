const express = require('express');
const { searchAll } = require('../jiraClient');
const cache = require('../cache');
const { CHILD_ISSUE_TYPES, workloadWeight, EXCLUDED_ASSIGNEES } = require('../workloadWeights');

const router = express.Router();
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 300);
// Unconfirmed against the live instance - override if it turns out wrong.
const COMPLEXITY_FIELD = process.env.JIRA_COMPLEXITY_FIELD || 'customfield_11501';

const COMPLEXITY_LABELS = {
  '1 - Easy': 'Easy',
  '2 - Medium': 'Medium',
  '3 - Hard': 'Hard',
  '4 - Super Hard': 'Super Hard',
};

router.get('/api/engineering-workload', async (req, res) => {
  const projectKey = process.env.JIRA_PROJECT_KEY || 'FPT';
  const cacheKey = `engineering-workload:${projectKey}`;

  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const typeList = CHILD_ISSUE_TYPES.map((t) => `"${t}"`).join(',');
    const jql = `project = ${projectKey} AND issuetype in (${typeList}) AND statusCategory != Done`;
    const issues = await searchAll(jql, ['assignee', 'status', 'issuetype', COMPLEXITY_FIELD, 'parent']);

    const workloadByAssignee = new Map();
    const workItems = [];
    let activeCount = 0;
    let backlogCount = 0;

    for (const issue of issues) {
      const displayName = issue.fields.assignee?.displayName || 'Unassigned';
      if (EXCLUDED_ASSIGNEES.has(displayName)) continue;

      const issueType = issue.fields.issuetype?.name;
      const statusName = issue.fields.status?.name;
      const complexityValue = issue.fields[COMPLEXITY_FIELD]?.value ?? issue.fields[COMPLEXITY_FIELD] ?? null;
      const weight = workloadWeight(issueType, complexityValue);
      const isActive = statusName === 'In Process';

      if (isActive) activeCount += 1;
      else backlogCount += 1;

      if (!workloadByAssignee.has(displayName)) {
        workloadByAssignee.set(displayName, { displayName, activeWeight: 0, backlogWeight: 0 });
      }
      const entry = workloadByAssignee.get(displayName);
      if (isActive) entry.activeWeight += weight;
      else entry.backlogWeight += weight;

      workItems.push({
        key: issue.key,
        opportunitySummary: issue.fields.parent?.fields?.summary || '—',
        issueType,
        status: statusName,
        isActive,
        complexity: COMPLEXITY_LABELS[complexityValue] || complexityValue || '—',
        assignee: displayName,
      });
    }

    const payload = {
      project: projectKey,
      kpis: { activeCount, backlogCount },
      workload: [...workloadByAssignee.values()].map((w) => ({
        displayName: w.displayName,
        activeWeight: Math.round(w.activeWeight * 100) / 100,
        backlogWeight: Math.round(w.backlogWeight * 100) / 100,
      })),
      workItems,
      updatedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, payload, CACHE_TTL_SECONDS);
    res.json(payload);
  } catch (err) {
    console.error('engineering-workload failed:', err);
    res.status(502).json({ error: 'Failed to load engineering workload from Jira' });
  }
});

module.exports = router;
