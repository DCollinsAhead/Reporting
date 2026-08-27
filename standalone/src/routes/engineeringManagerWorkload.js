const express = require('express');
const { searchAll, getFieldId, getAccountId } = require('../jiraClient');
const cache = require('../cache');
const { enrichWithParentOpportunity } = require('../workloadAggregation');
const { workloadWeight } = require('../workloadWeights');

const router = express.Router();
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 300);

// This page is scoped to two specific managers, not a Child Issue Type list -
// unlike the other workload pages, it covers every child issue type they're
// assigned to. Its two bullet charts are independent, overlapping status
// exclusions (not a clean active/backlog partition), so this route doesn't
// go through the shared aggregateWorkload helper.
const MANAGERS = ['Curt Petty', 'Taylor Lewis'];
// Explicit inclusion list for "Workload for Active Projects" (per explicit
// request) - Curt Petty/Taylor Lewis scoping already comes from the JQL
// query below, which covers every chart on this page.
const ACTIVE_PROJECTS_STATUSES = new Set(['In Process', 'New', 'On Hold']);
const EXCLUDE_TEAM_ASSIGNMENT = new Set(['Cancelled', 'Complete', 'In Process', 'Pending Assignment']);

router.get('/api/engineering-manager-workload', async (req, res) => {
  const projectKey = process.env.JIRA_PROJECT_KEY || 'FPT';
  const cacheKey = `engineering-manager-workload:${projectKey}`;

  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const complexityField = await getFieldId('Complexity Level');
    const opportunityTypeField = await getFieldId('Opportunity Type');

    // "assignee in (display names)" is unreliable in Jira Cloud JQL - it can
    // silently resolve to 0 issues for a real, active user (confirmed on
    // this instance for "Curt Petty" despite 535 real issues). accountId is
    // the only correctly-typed way to reference a user in JQL.
    const managerAccountIds = await Promise.all(MANAGERS.map((name) => getAccountId(name)));
    const managerList = managerAccountIds.map((id) => `"${id}"`).join(',');
    const jql = `project = ${projectKey} AND assignee in (${managerList})`;
    const issues = await searchAll(jql, ['assignee', 'status', 'issuetype', complexityField, 'parent', 'resolution']);

    const parentInfo = await enrichWithParentOpportunity(issues, opportunityTypeField);

    const activeProjects = new Map();
    const teamAssignment = new Map();
    const pendingAssignmentByAssignee = new Map();
    const workItems = [];

    for (const issue of issues) {
      const displayName = issue.fields.assignee?.displayName || 'Unassigned';
      const issueType = issue.fields.issuetype?.name;
      const statusName = issue.fields.status?.name;
      const complexityValue = issue.fields[complexityField]?.value ?? issue.fields[complexityField] ?? null;
      const weight = workloadWeight(issueType, complexityValue);
      const parentKey = issue.fields.parent?.key;
      const parent = parentKey ? parentInfo.get(parentKey) : null;
      const isUnresolved = issue.fields.resolution == null;

      if (ACTIVE_PROJECTS_STATUSES.has(statusName)) {
        activeProjects.set(displayName, (activeProjects.get(displayName) || 0) + weight);
      }
      if (!EXCLUDE_TEAM_ASSIGNMENT.has(statusName)) {
        teamAssignment.set(displayName, (teamAssignment.get(displayName) || 0) + weight);
      }
      if (statusName === 'Pending Assignment') {
        pendingAssignmentByAssignee.set(displayName, (pendingAssignmentByAssignee.get(displayName) || 0) + 1);
      }

      if (isUnresolved) {
        workItems.push({
          key: issue.key,
          opportunitySummary: parent?.summary || '—',
          opportunityType: parent?.opportunityType || 'Unknown',
          issueType,
          status: statusName,
          bucket: statusName === 'Pending Assignment' ? 'backlog' : 'other',
          complexity: complexityValue || '—',
          assignee: displayName,
        });
      }
    }

    const round = (n) => Math.round(n * 100) / 100;
    const payload = {
      project: projectKey,
      activeProjects: [...activeProjects.entries()].map(([displayName, weight]) => ({ displayName, weight: round(weight) })),
      teamAssignment: [...teamAssignment.entries()].map(([displayName, weight]) => ({ displayName, weight: round(weight) })),
      pendingAssignmentByAssignee: [...pendingAssignmentByAssignee.entries()].map(([displayName, count]) => ({ displayName, count })),
      workItems,
      updatedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, payload, CACHE_TTL_SECONDS);
    res.json(payload);
  } catch (err) {
    console.error('engineering-manager-workload failed:', err);
    res.status(502).json({ error: 'Failed to load engineering manager workload from Jira' });
  }
});

module.exports = router;
