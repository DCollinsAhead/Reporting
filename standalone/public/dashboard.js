// Same origin as the API - the local server serves this file and answers
// /api/* itself, so no base URL or CORS config is needed.
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

// Order and display names taken directly from the source .pbix's
// Report/definition/pages/pages.json pageOrder - the 3 pages marked
// "(Draft)" in the source file are left out.
const REAL_PAGES = [
  { id: 'opp-overview', title: 'Opportunity Overview', built: true },
  { id: 'eng-workload', title: 'Engineering Workload', built: true },
  {
    id: 'eng-mgr-workload',
    title: "Engineering Manager's Workload",
    built: false,
    visuals: [
      'Scoped to Curt Petty & Taylor Lewis only',
      'Workload for Active Projects (bullet chart)',
      'Workload for Team Assignment (bullet chart)',
      'Active & Backlog Work Items (column chart + table)',
    ],
  },
  {
    id: 'eng-staffing',
    title: 'Engineering Staffing Planning',
    built: false,
    visuals: ['Future (Projected) Workload by Assignee (bullet chart)', 'Projects by Assignee (Gantt chart)'],
  },
  {
    id: 'quote-overall',
    title: 'Overall Quotation Overview',
    built: false,
    visuals: ['Quote Qty by Assignee', 'Quote Qty & Completion Trend (Created vs. Time to Completion)'],
  },
  {
    id: 'quote-warehousing',
    title: 'Warehousing Quoting Overview',
    built: false,
    visuals: ['Same as Overall Quotation, filtered to Warehousing/Warehousing+ opportunities'],
  },
  {
    id: 'quote-configuration',
    title: 'Configuration Quotation',
    built: false,
    visuals: ['Same as Overall Quotation, filtered to Staging opportunities'],
  },
  {
    id: 'quote-integration',
    title: 'Integration Quotation',
    built: false,
    visuals: ['Same as Overall Quotation, filtered to Integration opportunities'],
  },
  {
    id: 'quote-ims',
    title: 'IMS Quotation',
    built: false,
    visuals: ['Same as Overall Quotation, filtered to IMS opportunities'],
  },
  {
    id: 'ops-workload',
    title: 'Operations Workload',
    built: false,
    visuals: ['Active/Backlog KPI tiles', 'Workload & Backlog by Assignee (bullet charts)', 'Work Items table'],
  },
  {
    id: 'pgm-workload',
    title: 'Program Management Workload',
    built: false,
    visuals: ['Active/Backlog KPI tiles', 'Workload & Backlog by Assignee (bullet charts)', 'Work Items table'],
  },
  {
    id: 're-tracking',
    title: 'R&E Issue Tracking',
    built: false,
    visuals: [
      'Production Finding volume over time',
      'Issue Source, Issue Type, and Systemic? breakdowns (pie charts)',
      'Production Findings table',
    ],
  },
];

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
  if (rows.length === 0) {
    container.replaceChildren();
    return;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  container.replaceChildren(...rows.map((r) => barRow({ ...r, max })));
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

function renderGroupedChart(container, months, series) {
  if (months.length === 0) {
    container.replaceChildren();
    return;
  }
  const max = Math.max(...months.flatMap((m) => series.map((s) => m[s.key])), 1);

  const cols = months.map((m) => {
    const col = document.createElement('div');
    col.className = 'grouped-col';

    const bars = document.createElement('div');
    bars.className = 'grouped-bars';
    series.forEach((s) => {
      const value = m[s.key] || 0;
      const bar = document.createElement('div');
      bar.className = 'grouped-bar';
      bar.style.height = `${Math.max((value / max) * 100, value > 0 ? 2 : 0)}%`;
      bar.style.background = s.color;
      const label = document.createElement('span');
      label.className = 'bv';
      label.textContent = value;
      bar.appendChild(label);
      bar.addEventListener('mousemove', (evt) => showTooltip(evt, `${s.label} - ${m.month}: ${value}`));
      bar.addEventListener('mouseleave', hideTooltip);
      bars.appendChild(bar);
    });

    const label = document.createElement('div');
    label.className = 'grouped-label';
    label.textContent = m.month;

    col.append(bars, label);
    return col;
  });

  container.replaceChildren(...cols);
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
    const pillClass = item.bucket === 'active' ? 'pill-active' : item.bucket === 'backlog' ? 'pill-backlog' : 'pill-other';
    pill.className = `pill ${pillClass}`;
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

// ---------- Opportunity Overview ----------

async function loadOpportunityOverview() {
  const statusEl = document.getElementById('opp-type-status');
  try {
    const data = await fetchJSON('/api/opportunity-overview');

    renderBarChart(
      document.getElementById('opp-type-chart'),
      data.byType.map((t) => ({
        label: t.type,
        value: t.count,
        color: 'var(--ahead-blue)',
        tooltipText: `${t.type}: ${t.count} opportunities`,
      }))
    );

    renderGroupedChart(document.getElementById('opp-trend-chart'), data.trend, [
      { key: 'Integration', label: 'Integration', color: 'var(--trend-integration)' },
      { key: 'Staging', label: 'Staging', color: 'var(--trend-staging)' },
      { key: 'Warehousing', label: 'Warehousing', color: 'var(--trend-warehousing)' },
    ]);

    setSectionStatus(statusEl, '', false);
    return data.updatedAt;
  } catch (err) {
    console.error(err);
    setSectionStatus(statusEl, 'Could not load opportunity overview from Jira.', true);
    return null;
  }
}

// ---------- Engineering Workload ----------

let engWorkloadData = null;
let selectedOpportunityTypes = new Set();

function setAllChipsActive(isActive) {
  document.querySelectorAll('#eng-workload-slicer .slicer-chip[data-type]').forEach((chip) => {
    chip.classList.toggle('active', isActive);
  });
  document.querySelector('#eng-workload-slicer .all-chip').classList.toggle('active', isActive);
}

function buildSlicerChips(types) {
  const container = document.getElementById('eng-workload-slicer');
  container.querySelectorAll('.slicer-chip[data-type]:not(.all-chip)').forEach((el) => el.remove());

  types.forEach((type) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'slicer-chip active';
    chip.dataset.type = type;
    chip.textContent = type;
    chip.addEventListener('click', () => {
      const isActive = selectedOpportunityTypes.has(type);
      if (isActive) selectedOpportunityTypes.delete(type);
      else selectedOpportunityTypes.add(type);
      chip.classList.toggle('active', !isActive);
      document.querySelector('#eng-workload-slicer .all-chip').classList.remove('active');
      renderEngineeringWorkloadViews();
    });
    container.appendChild(chip);
  });
}

function renderEngineeringWorkloadViews() {
  if (!engWorkloadData) return;

  const filteredItems = engWorkloadData.workItems.filter((i) => selectedOpportunityTypes.has(i.opportunityType));
  const filteredAssignees = new Set(filteredItems.map((i) => i.assignee));
  const filteredWorkload = engWorkloadData.workload.filter((w) => filteredAssignees.has(w.displayName));

  document.getElementById('kpi-active-count').textContent = filteredItems.filter((i) => i.bucket === 'active').length;
  document.getElementById('kpi-backlog-count').textContent = filteredItems.filter((i) => i.bucket === 'backlog').length;

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
    const types = [...new Set(engWorkloadData.workItems.map((i) => i.opportunityType))].sort((a, b) =>
      a.localeCompare(b)
    );
    selectedOpportunityTypes = new Set(types);
    buildSlicerChips(types);
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
  selectedOpportunityTypes = new Set(engWorkloadData.workItems.map((i) => i.opportunityType));
  setAllChipsActive(true);
  renderEngineeringWorkloadViews();
});

document.getElementById('eng-workload-clear').addEventListener('click', () => {
  selectedOpportunityTypes = new Set();
  setAllChipsActive(false);
  renderEngineeringWorkloadViews();
});

// ---------- Tab shell ----------

function buildPlaceholderPanel(page) {
  const section = document.createElement('section');
  section.className = 'page-panel placeholder';
  section.id = `page-${page.id}`;

  const card = document.createElement('div');
  card.className = 'card';
  const h2 = document.createElement('h2');
  h2.textContent = page.title;
  const p = document.createElement('p');
  p.className = 'sub';
  p.textContent = 'Not yet built. The source report page contains:';
  const ul = document.createElement('ul');
  ul.className = 'placeholder-visual-list';
  page.visuals.forEach((v) => {
    const li = document.createElement('li');
    li.textContent = v;
    ul.appendChild(li);
  });

  card.append(h2, p, ul);
  section.appendChild(card);
  return section;
}

function setupTabs() {
  const tabsNav = document.getElementById('page-tabs');
  const panelsContainer = document.getElementById('page-panels');

  REAL_PAGES.forEach((page) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn';
    btn.dataset.page = page.id;
    btn.textContent = page.title;
    tabsNav.appendChild(btn);

    if (!page.built) {
      panelsContainer.appendChild(buildPlaceholderPanel(page));
    }
  });

  tabsNav.querySelector('.tab-btn').classList.add('active');
  document.querySelector('.page-panel').classList.add('active');

  tabsNav.addEventListener('click', (evt) => {
    const btn = evt.target.closest('.tab-btn');
    if (!btn) return;

    tabsNav.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
    panelsContainer.querySelectorAll('.page-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `page-${btn.dataset.page}`);
    });
  });
}

// ---------- Refresh ----------

async function refreshAll() {
  const [oppUpdatedAt] = await Promise.all([loadOpportunityOverview(), loadEngineeringWorkload()]);
  const stamp = document.getElementById('last-updated');
  stamp.textContent = oppUpdatedAt ? `Last updated ${new Date(oppUpdatedAt).toLocaleTimeString()}` : 'Last updated -';
}

document.getElementById('refresh-btn').addEventListener('click', refreshAll);

setupTabs();
refreshAll();
setInterval(refreshAll, REFRESH_INTERVAL_MS);
