const express = require('express');
const { searchAll } = require('../jiraClient');
const cache = require('../cache');

const router = express.Router();
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 300);

router.get('/api/assignee-workload', async (req, res) => {
  const projectKey = process.env.JIRA_PROJECT_KEY || 'FPT';
  const cacheKey = `assignee-workload:${projectKey}`;

  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const jql = `project = ${projectKey} AND statusCategory != Done AND assignee is not EMPTY`;
    const issues = await searchAll(jql, ['assignee']);

    const counts = new Map();
    for (const issue of issues) {
      const displayName = issue.fields.assignee?.displayName || 'Unassigned';
      counts.set(displayName, (counts.get(displayName) || 0) + 1);
    }

    const payload = {
      project: projectKey,
      assignees: [...counts.entries()]
        .map(([displayName, openCount]) => ({ displayName, openCount }))
        .sort((a, b) => b.openCount - a.openCount),
      updatedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, payload, CACHE_TTL_SECONDS);
    res.json(payload);
  } catch (err) {
    console.error('assignee-workload failed:', err);
    res.status(502).json({ error: 'Failed to load Jira assignee workload' });
  }
});

module.exports = router;
