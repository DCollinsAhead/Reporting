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

// Axis max: smallest "nice" round number at or above the largest bar value,
// so the meter adapts to whatever live weights come back instead of a fixed 20.
function niceMax(value) {
  if (value <= 0) return 1;
  const step = value <= 10 ? 5 : value <= 50 ? 10 : value <= 200 ? 25 : 50;
  return Math.ceil(value / step) * step;
}

// Thresholds are a generic 50/30/20 split, not the source report's exact
// (unknown) capacity bands - a labeled placeholder until real ones surface.
function bulletRow({ label, value, axisMax, tooltipText }) {
  const row = document.createElement('div');
  row.className = 'bullet-row';

  const name = document.createElement('div');
  name.className = 'bullet-name';
  const nameLabel = document.createElement('span');
  nameLabel.textContent = label;
  const nameValue = document.createElement('span');
  nameValue.textContent = value;
  name.append(nameLabel, nameValue);

  const track = document.createElement('div');
  track.className = 'bullet-track';

  const bandGood = document.createElement('div');
  bandGood.className = 'bullet-band';
  Object.assign(bandGood.style, { left: '0%', width: '50%', background: 'var(--status-good)' });

  const bandWarning = document.createElement('div');
  bandWarning.className = 'bullet-band';
  Object.assign(bandWarning.style, { left: '50%', width: '30%', background: 'var(--status-warning)' });

  const bandCritical = document.createElement('div');
  bandCritical.className = 'bullet-band';
  Object.assign(bandCritical.style, { left: '80%', width: '20%', background: 'var(--status-critical)' });

  const fill = document.createElement('div');
  fill.className = 'bullet-fill';
  const pct = axisMax > 0 ? Math.min((value / axisMax) * 100, 100) : 0;
  Object.assign(fill.style, { left: '0', width: `${pct}%` });

  track.append(bandGood, bandWarning, bandCritical, fill);

  const axis = document.createElement('div');
  axis.className = 'bullet-axis';
  [0, axisMax / 2, axisMax].forEach((tick) => {
    const span = document.createElement('span');
    span.textContent = Number(tick.toFixed(1));
    axis.appendChild(span);
  });

  row.append(name, track, axis);
  row.addEventListener('mousemove', (evt) => showTooltip(evt, tooltipText));
  row.addEventListener('mouseleave', hideTooltip);

  return row;
}

function renderBulletChart(container, rows) {
  if (rows.length === 0) {
    container.replaceChildren();
    return;
  }
  const axisMax = niceMax(Math.max(...rows.map((r) => r.value)));
  container.replaceChildren(...rows.map((r) => bulletRow({ ...r, axisMax })));
}

function renderWorkItemsTable(container, items) {
  const table = document.createElement('table');
  table.className = 'data-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Ticket', 'Opportunity Summary', 'Issue Type', 'Status', 'Complexity'].forEach((h) => {
    const th = document.createElement('th');
    th.textContent = h;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.createElement('tbody');
  items.forEach((item) => {
    const tr = document.createElement('tr');

    const keyTd = document.createElement('td');
    keyTd.textContent = item.key;

    const summaryTd = document.createElement('td');
    summaryTd.textContent = item.opportunitySummary;

    const typeTd = document.createElement('td');
    typeTd.textContent = item.issueType || '—';

    const statusTd = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = `pill ${item.isActive ? 'pill-active' : 'pill-backlog'}`;
    pill.textContent = item.status || '—';
    statusTd.appendChild(pill);

    const complexityTd = document.createElement('td');
    complexityTd.textContent = item.complexity;

    tr.append(keyTd, summaryTd, typeTd, statusTd, complexityTd);
    tbody.appendChild(tr);
  });

  table.append(thead, tbody);
  container.replaceChildren(table);
}

let engWorkloadData = null;
let selectedAssignees = new Set();

function setAllChipsActive(isActive) {
  document.querySelectorAll('#eng-workload-slicer .slicer-chip[data-assignee]').forEach((chip) => {
    chip.classList.toggle('active', isActive);
  });
  document.querySelector('#eng-workload-slicer .all-chip').classList.toggle('active', isActive);
}

function buildSlicerChips(assignees) {
  const container = document.getElementById('eng-workload-slicer');
  container.querySelectorAll('.slicer-chip[data-assignee]:not(.all-chip)').forEach((el) => el.remove());

  assignees.forEach((name) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'slicer-chip active';
    chip.dataset.assignee = name;
    chip.textContent = name;
    chip.addEventListener('click', () => {
      const isActive = selectedAssignees.has(name);
      if (isActive) selectedAssignees.delete(name);
      else selectedAssignees.add(name);
      chip.classList.toggle('active', !isActive);
      document.querySelector('#eng-workload-slicer .all-chip').classList.remove('active');
      renderEngineeringWorkloadViews();
    });
    container.appendChild(chip);
  });
}

function renderEngineeringWorkloadViews() {
  if (!engWorkloadData) return;

  const filteredWorkload = engWorkloadData.workload.filter((w) => selectedAssignees.has(w.displayName));
  const filteredItems = engWorkloadData.workItems.filter((i) => selectedAssignees.has(i.assignee));

  document.getElementById('kpi-active-count').textContent = filteredItems.filter((i) => i.isActive).length;
  document.getElementById('kpi-backlog-count').textContent = filteredItems.filter((i) => !i.isActive).length;

  renderBulletChart(
    document.getElementById('workload-chart'),
    filteredWorkload
      .filter((w) => w.activeWeight > 0)
      .sort((a, b) => b.activeWeight - a.activeWeight)
      .map((w) => ({
        label: w.displayName,
        value: w.activeWeight,
        tooltipText: `${w.displayName}: ${w.activeWeight} weighted active`,
      }))
  );

  renderBulletChart(
    document.getElementById('backlog-chart'),
    filteredWorkload
      .filter((w) => w.backlogWeight > 0)
      .sort((a, b) => b.backlogWeight - a.backlogWeight)
      .map((w) => ({
        label: w.displayName,
        value: w.backlogWeight,
        tooltipText: `${w.displayName}: ${w.backlogWeight} weighted backlog`,
      }))
  );

  renderWorkItemsTable(document.getElementById('work-items-table'), filteredItems);
}

async function loadEngineeringWorkload() {
  const statusEl = document.getElementById('eng-workload-status');

  try {
    engWorkloadData = await fetchJSON('/api/engineering-workload');
    const assignees = engWorkloadData.workload.map((w) => w.displayName).sort((a, b) => a.localeCompare(b));
    selectedAssignees = new Set(assignees);
    buildSlicerChips(assignees);
    setAllChipsActive(true);
    setSectionStatus(statusEl, '', false);
    renderEngineeringWorkloadViews();
    return engWorkloadData.updatedAt;
  } catch (err) {
    console.error(err);
    setSectionStatus(statusEl, 'Could not load engineering workload from Jira.', true);
    return null;
  }
}

document.querySelector('#eng-workload-slicer .all-chip').addEventListener('click', () => {
  if (!engWorkloadData) return;
  selectedAssignees = new Set(engWorkloadData.workload.map((w) => w.displayName));
  setAllChipsActive(true);
  renderEngineeringWorkloadViews();
});

document.getElementById('eng-workload-clear').addEventListener('click', () => {
  selectedAssignees = new Set();
  setAllChipsActive(false);
  renderEngineeringWorkloadViews();
});

async function refreshAll() {
  const [statusUpdatedAt] = await Promise.all([loadStatusSummary(), loadEngineeringWorkload()]);
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

refreshAll();
setInterval(refreshAll, REFRESH_INTERVAL_MS);
