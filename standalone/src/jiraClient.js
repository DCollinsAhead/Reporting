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

async function jiraPost(path, body) {
  assertConfigured();
  const res = await fetch(BASE_URL + path, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Jira API ${res.status} on ${path}: ${errBody.slice(0, 300)}`);
  }

  return res.json();
}

// Atlassian removed the classic GET /rest/api/3/search (HTTP 410) in favor of
// two purpose-built endpoints: approximate-count for totals (the new search
// API no longer returns one), and search/jql (cursor-paginated via
// nextPageToken, no startAt/total) for actual issue data.
async function countIssues(jql) {
  const data = await jiraPost('/rest/api/3/search/approximate-count', { jql });
  return data.count;
}

async function searchAll(jql, fields) {
  const issues = [];
  let nextPageToken;

  while (true) {
    const data = await jiraPost('/rest/api/3/search/jql', {
      jql,
      fields,
      maxResults: 100,
      ...(nextPageToken ? { nextPageToken } : {}),
    });
    issues.push(...data.issues);
    if (!data.nextPageToken || data.issues.length === 0) break;
    nextPageToken = data.nextPageToken;
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

// Resolves a custom field's ID by its display name instead of hardcoding
// customfield_NNNNN, which drifts across instances and is easy to get wrong.
// Cached for the process lifetime - the field list doesn't change while running.
let fieldNameToId = null;
async function getFieldId(displayName) {
  if (!fieldNameToId) {
    const fields = await jiraFetch('/rest/api/3/field');
    fieldNameToId = new Map(fields.map((f) => [f.name, f.id]));
  }
  const id = fieldNameToId.get(displayName);
  if (!id) throw new Error(`Jira field not found: "${displayName}"`);
  return id;
}

// Resolves a user's accountId by display name. Jira Cloud's JQL "assignee ="
// with a bare display-name string is unreliable - confirmed empirically on
// this instance: `assignee = "Curt Petty"` returns 0 issues for a real,
// active user with 535 issues, while the equivalent accountId-based query
// returns all of them. accountId is the only reliably-typed way to
// reference a user in JQL, so any assignee-name filter must resolve to it
// first rather than interpolating the display name directly.
let userNameToAccountId = new Map();
async function getAccountId(displayName) {
  if (userNameToAccountId.has(displayName)) return userNameToAccountId.get(displayName);
  const users = await jiraFetch('/rest/api/3/user/search', { query: displayName });
  const match = users.find((u) => u.displayName === displayName) || users[0];
  if (!match) throw new Error(`Jira user not found: "${displayName}"`);
  userNameToAccountId.set(displayName, match.accountId);
  return match.accountId;
}

module.exports = { countIssues, searchAll, getProjectStatuses, getFieldId, getAccountId };
