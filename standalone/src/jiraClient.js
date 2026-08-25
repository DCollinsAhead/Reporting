const BASE_URL = process.env.JIRA_BASE_URL;
const EMAIL = process.env.JIRA_EMAIL;
const API_TOKEN = process.env.JIRA_API_TOKEN;

function assertConfigured() {
  if (!BASE_URL || !EMAIL || !API_TOKEN) {
    throw new Error('JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN must be set');
  }
}

function authHeader() {
  const token = Buffer.from(`${EMAIL}:${API_TOKEN}`).toString('base64');
  return `Basic ${token}`;
}

async function jiraFetch(path, params = {}) {
  assertConfigured();
  const url = new URL(BASE_URL + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    headers: {
      Authorization: authHeader(),
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira API ${res.status} on ${path}: ${body.slice(0, 300)}`);
  }

  return res.json();
}

// maxResults: 0 still returns an accurate `total` without fetching issue bodies -
// cheap way to get a count for one JQL clause.
async function countIssues(jql) {
  const data = await jiraFetch('/rest/api/3/search', { jql, maxResults: 0 });
  return data.total;
}

async function searchAll(jql, fields) {
  const issues = [];
  let startAt = 0;
  const pageSize = 100;

  while (true) {
    const data = await jiraFetch('/rest/api/3/search', {
      jql,
      fields: fields.join(','),
      startAt,
      maxResults: pageSize,
    });
    issues.push(...data.issues);
    startAt += data.issues.length;
    if (startAt >= data.total || data.issues.length === 0) break;
  }

  return issues;
}

// Distinct statuses actually configured on the project's workflows, deduped by
// name, with the statusCategory Jira already buckets them into (To Do / In
// Progress / Done) - that categorization doubles as our ordinal chart stages.
async function getProjectStatuses(projectKey) {
  const issueTypes = await jiraFetch(`/rest/api/3/project/${projectKey}/statuses`);
  const byName = new Map();
  for (const issueType of issueTypes) {
    for (const status of issueType.statuses) {
      byName.set(status.name, status.statusCategory.name);
    }
  }
  return [...byName.entries()].map(([name, category]) => ({ name, category }));
}

module.exports = { countIssues, searchAll, getProjectStatuses };
