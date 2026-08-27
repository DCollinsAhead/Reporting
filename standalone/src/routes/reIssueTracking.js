const express = require('express');
const { searchAll, getFieldId } = require('../jiraClient');
const cache = require('../cache');
const { enrichWithParentOpportunity } = require('../workloadAggregation');

const router = express.Router();
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 300);

// The source report's Created-date filter on this page wasn't fully
// extracted; using the 180-day window the report's own text elsewhere on
// this page (and the earlier static-HTML recreation) explicitly labels it as.
const WINDOW_DAYS = 180;

// These two custom field IDs were provided directly (not resolved by name):
// their real Jira display names are the bare "Issue Type"/"Issue Source",
// which collides with the standard `issuetype` field's own display name, so
// getFieldId() can't safely resolve them by name (also, the previously
// assumed names "Production Finding Issue Source/Type" don't exist at all
// in this Jira instance - that mismatch was the "field not found" error).
const ISSUE_SOURCE_FIELD = 'customfield_12690';
const ISSUE_TYPE_FIELD = 'customfield_12689';

router.get('/api/re-issue-tracking', async (req, res) => {
  const projectKey = process.env.JIRA_PROJECT_KEY || 'FPT';
  const cacheKey = `re-issue-tracking:${projectKey}`;

  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const opportunityTypeField = await getFieldId('Opportunity Type');
    const issueSourceField = ISSUE_SOURCE_FIELD;
    const findingTypeField = ISSUE_TYPE_FIELD;
    const systemicField = await getFieldId('Systemic?');

    const jql = `project = ${projectKey} AND issuetype = "Production Finding" AND created >= -${WINDOW_DAYS}d`;
    const issues = await searchAll(jql, [
      'summary',
      'status',
      'created',
      'parent',
      issueSourceField,
      findingTypeField,
      systemicField,
    ]);

    const parentInfo = await enrichWithParentOpportunity(issues, opportunityTypeField);

    const bySource = new Map();
    const byFindingType = new Map();
    const bySystemic = new Map();
    const byMonthAndOppType = new Map();
    const findings = [];

    for (const issue of issues) {
      const source = issue.fields[issueSourceField]?.value ?? issue.fields[issueSourceField] ?? 'Unknown';
      const findingType = issue.fields[findingTypeField]?.value ?? issue.fields[findingTypeField] ?? 'Unknown';
      const systemic = issue.fields[systemicField]?.value ?? issue.fields[systemicField] ?? 'Unknown';
      const parentKey = issue.fields.parent?.key;
      const parent = parentKey ? parentInfo.get(parentKey) : null;
      const oppType = parent?.opportunityType || 'Unknown';
      const month = issue.fields.created.slice(0, 7);

      bySource.set(source, (bySource.get(source) || 0) + 1);
      byFindingType.set(findingType, (byFindingType.get(findingType) || 0) + 1);
      bySystemic.set(systemic, (bySystemic.get(systemic) || 0) + 1);

      if (!byMonthAndOppType.has(month)) byMonthAndOppType.set(month, new Map());
      const monthMap = byMonthAndOppType.get(month);
      monthMap.set(oppType, (monthMap.get(oppType) || 0) + 1);

      findings.push({
        key: issue.key,
        summary: issue.fields.summary,
        opportunitySummary: parent?.summary || '—',
        source,
        findingType,
        systemic,
        status: issue.fields.status?.name,
      });
    }

    const toCounts = (map) => [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

    const payload = {
      project: projectKey,
      bySource: toCounts(bySource),
      byFindingType: toCounts(byFindingType),
      bySystemic: toCounts(bySystemic),
      trend: [...byMonthAndOppType.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, oppTypeMap]) => ({ month, byOpportunityType: toCounts(oppTypeMap) })),
      findings,
      updatedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, payload, CACHE_TTL_SECONDS);
    res.json(payload);
  } catch (err) {
    console.error('re-issue-tracking failed:', err);
    res.status(502).json({ error: 'Failed to load R&E issue tracking from Jira' });
  }
});

module.exports = router;
