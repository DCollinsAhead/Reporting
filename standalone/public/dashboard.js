// Same origin as the API - the local server serves this file and answers
// /api/* itself, so no base URL or CORS config is needed.
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

const STAGE_ORDER = ['To Do', 'In Progress', 'Done'];
const STAGE_COLOR = {
  'To Do': 'var(--stage-todo)',
  'In Progress': 'var(--stage-inprogress)',
  Done: 'var(--stage-done)',
};

const tooltip = document.getElementById('tooltip');

function showTooltip(evt, text) {
  tooltip.textContent = text;
  tooltip.style.left = `${evt.clientX}px`;
  tooltip.style.top = `${evt.clientY}px`;
  tooltip.style.display = 'block';
}

function hideTooltip() {
  tooltip.style.display = 'none';
}

function barRow({ label, value, max, color, tooltipText }) {
  const row = document.createElement('div');
  row.className = 'bar-row';

  const labelEl = document.createElement('div');
  labelEl.className = 'bar-label';
  labelEl.textContent = label;
  labelEl.title = label;

  const track = document.createElement('div');
  track.className = 'bar-track';
  const fill = document.createElement('div');
  fill.className = 'bar-fill';
  fill.style.width = `${max > 0 ? Math.max((value / max) * 100, 2) : 0}%`;
  fill.style.background = color;
  track.appendChild(fill);

  const valueEl = document.createElement('div');
  valueEl.className = 'bar-value';
  valueEl.textContent = value;

  row.append(labelEl, track, valueEl);
  row.addEventListener('mousemove', (evt) => showTooltip(evt, tooltipText));
  row.addEventListener('mouseleave', hideTooltip);

  return row;
}

function renderBarChart(container, rows) {
  container.replaceChildren(...rows.map(barRow));
}

function renderTable(container, headers, rows) {
  const table = document.createElement('table');
  table.className = 'data-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headers.forEach((h) => {
    const th = document.createElement('th');
    th.textContent = h;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.createElement('tbody');
  rows.forEach((cells) => {
    const tr = document.createElement('tr');
    cells.forEach((cell) => {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.append(thead, tbody);
  container.replaceChildren(table);
}

function setupViewToggle(toggleBtn, chartEl, tableEl) {
  toggleBtn.addEventListener('click', () => {
    const showingTable = tableEl.style.display !== 'none';
    tableEl.style.display = showingTable ? 'none' : 'block';
    chartEl.style.display = showingTable ? 'grid' : 'none';
    toggleBtn.textContent = showingTable ? 'View as table' : 'View as chart';
  });
}

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
}

function setSectionStatus(el, message, isError) {
  el.textContent = message;
  el.className = isError ? 'status-line error' : 'status-line';
  el.style.display = message ? 'block' : 'none';
}

async function loadStatusSummary() {
  const chartEl = document.getElementById('status-chart');
  const tableEl = document.getElementById('status-table');
  const statusEl = document.getElementById('status-status');

  try {
    const data = await fetchJSON('/api/status-summary');
    const ordered = [...data.statuses].sort((a, b) => {
      const stageDiff = STAGE_ORDER.indexOf(a.category) - STAGE_ORDER.indexOf(b.category);
      return stageDiff !== 0 ? stageDiff : b.count - a.count;
    });
    const max = Math.max(...ordered.map((s) => s.count), 1);

    renderBarChart(
      chartEl,
      ordered.map((s) => ({
        label: s.status,
        value: s.count,
        max,
        color: STAGE_COLOR[s.category] || 'var(--stage-inprogress)',
        tooltipText: `${s.status} (${s.category}): ${s.count} issue${s.count === 1 ? '' : 's'}`,
      }))
    );

    renderTable(
      tableEl,
      ['Status', 'Stage', 'Issues'],
      ordered.map((s) => [s.status, s.category, s.count])
    );

    setSectionStatus(statusEl, '', false);
    return data.updatedAt;
  } catch (err) {
    console.error(err);
    setSectionStatus(statusEl, 'Could not load status summary from Jira.', true);
    return null;
  }
}

async function loadAssigneeWorkload() {
  const chartEl = document.getElementById('assignee-chart');
  const tableEl = document.getElementById('assignee-table');
  const statusEl = document.getElementById('assignee-status');

  try {
    const data = await fetchJSON('/api/assignee-workload');
    const max = Math.max(...data.assignees.map((a) => a.openCount), 1);

    renderBarChart(
      chartEl,
      data.assignees.map((a) => ({
        label: a.displayName,
        value: a.openCount,
        max,
        color: 'var(--ahead-blue)',
        tooltipText: `${a.displayName}: ${a.openCount} open issue${a.openCount === 1 ? '' : 's'}`,
      }))
    );

    renderTable(
      tableEl,
      ['Assignee', 'Open issues'],
      data.assignees.map((a) => [a.displayName, a.openCount])
    );

    setSectionStatus(statusEl, '', false);
    return data.updatedAt;
  } catch (err) {
    console.error(err);
    setSectionStatus(statusEl, 'Could not load assignee workload from Jira.', true);
    return null;
  }
}

async function refreshAll() {
  const [statusUpdatedAt] = await Promise.all([loadStatusSummary(), loadAssigneeWorkload()]);
  const stamp = document.getElementById('last-updated');
  stamp.textContent = statusUpdatedAt
    ? `Last updated ${new Date(statusUpdatedAt).toLocaleTimeString()}`
    : 'Last updated -';
}

document.getElementById('refresh-btn').addEventListener('click', refreshAll);
setupViewToggle(
  document.getElementById('status-toggle'),
  document.getElementById('status-chart'),
  document.getElementById('status-table')
);
setupViewToggle(
  document.getElementById('assignee-toggle'),
  document.getElementById('assignee-chart'),
  document.getElementById('assignee-table')
);

refreshAll();
setInterval(refreshAll, REFRESH_INTERVAL_MS);
