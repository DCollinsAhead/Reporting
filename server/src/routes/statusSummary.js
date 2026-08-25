const express = require('express');
const { countIssues, getProjectStatuses } = require('../jiraClient');
const cache = require('../cache');

const router = express.Router();
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 300);

function escapeJql(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

router.get('/api/status-summary', async (req, res) => {
  const projectKey = process.env.JIRA_PROJECT_KEY || 'FPT';
  const cacheKey = `status-summary:${projectKey}`;

  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const statuses = await getProjectStatuses(projectKey);

    const counts = await Promise.all(
      statuses.map(async ({ name, category }) => ({
        status: name,
        category,
        count: await countIssues(`project = ${projectKey} AND status = "${escapeJql(name)}"`),
      }))
    );

    const payload = {
      project: projectKey,
      statuses: counts.filter((c) => c.count > 0).sort((a, b) => b.count - a.count),
      updatedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, payload, CACHE_TTL_SECONDS);
    res.json(payload);
  } catch (err) {
    console.error('status-summary failed:', err);
    res.status(502).json({ error: 'Failed to load Jira status summary' });
  }
});

module.exports = router;
