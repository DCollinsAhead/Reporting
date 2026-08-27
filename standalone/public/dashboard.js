// Same origin as the API - the local server serves this file and answers
// /api/* itself, so no base URL or CORS config is needed.
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const JIRA_BROWSE_BASE = 'https://ahd-foundry.atlassian.net/browse/';

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

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
}

function setSectionStatus(elm, message, isError) {
  elm.textContent = message;
  elm.className = isError ? 'status-line error' : 'status-line';
  elm.style.display = message ? 'block' : 'none';
}

// ---------- Low-level chart renderers ----------

function barRow({ label, value, max, color, tooltipText }) {
  const row = el('div', 'bar-row');
  const labelEl = el('div', 'bar-label', label);
  labelEl.title = label;

  const track = el('div', 'bar-track');
  const fill = el('div', 'bar-fill');
  fill.style.width = `${max > 0 ? Math.max((value / max) * 100, 2) : 0}%`;
  fill.style.background = color;
  track.appendChild(fill);

  const valueEl = el('div', 'bar-value', String(value));

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

// Axis max: smallest "nice" round number at or above the largest bar value.
function niceMax(value) {
  if (value <= 0) return 1;
  const step = value <= 10 ? 5 : value <= 50 ? 10 : value <= 200 ? 25 : 50;
  return Math.ceil(value / step) * step;
}

// Generic bands (50/30/20 split) - a labeled placeholder used when no real
// source config is known. WORKLOAD_BULLET_BANDS below is the exception:
// ground-truthed from the source .pbix's actual Bullet Chart format
// settings, used only for the Engineering Workload "Workload by Assignee"
// chart per explicit request.
const GENERIC_BANDS = [
  { max: 0.5, color: 'var(--status-good)' },
  { max: 0.8, color: 'var(--status-warning)' },
  { max: 1, color: 'var(--status-critical)' },
];

// Engineering Workload's "Workload by Assignee" and "Backlog by Assignee"
// bullet charts, ground-truthed from the source .pbix's Bullet Chart visual
// (targetValue=10, band percentages 0/100/130/150/160/196 of targetValue,
// syncAxis: true - both charts on this page share this same configuration).
const WORKLOAD_BULLET_BANDS = [
  { max: 10, color: '#008000' },
  { max: 13, color: '#F4C430' },
  { max: 15, color: '#E67E22' },
  { max: 19.6, color: '#D9455F' },
];
const WORKLOAD_BULLET_AXIS_MAX = 19.6;

function bulletRow({ label, value, axisMax, bands, tooltipText }) {
  const row = el('div', 'bullet-row');

  const name = el('div', 'bullet-name');
  name.append(el('span', null, label), el('span', null, String(value)));

  const track = el('div', 'bullet-track');
  let prevMax = 0;
  bands.forEach(({ max, color }) => {
    const band = el('div', 'bullet-band');
    const from = bands === GENERIC_BANDS ? prevMax * axisMax : prevMax;
    const to = bands === GENERIC_BANDS ? max * axisMax : max;
    Object.assign(band.style, {
      left: `${(from / axisMax) * 100}%`,
      width: `${((to - from) / axisMax) * 100}%`,
      background: color,
      opacity: bands === GENERIC_BANDS ? 0.55 : 1,
    });
    track.appendChild(band);
    prevMax = max;
  });

  const fill = el('div', 'bullet-fill');
  const pct = axisMax > 0 ? Math.min((value / axisMax) * 100, 100) : 0;
  Object.assign(fill.style, { left: '0', width: `${pct}%` });
  if (bands !== GENERIC_BANDS) fill.style.background = '#000';
  track.appendChild(fill);

  const axis = el('div', 'bullet-axis');
  const ticks = [0, axisMax / 2, axisMax];
  ticks.forEach((tick) => axis.appendChild(el('span', null, String(Number(tick.toFixed(1))))));

  row.append(name, track, axis);
  row.addEventListener('mousemove', (evt) => showTooltip(evt, tooltipText));
  row.addEventListener('mouseleave', hideTooltip);
  return row;
}

function renderBulletChart(container, rows, opts = {}) {
  if (rows.length === 0) {
    container.replaceChildren();
    return;
  }
  const bands = opts.bands || GENERIC_BANDS;
  const axisMax = opts.axisMax ?? niceMax(Math.max(...rows.map((r) => r.value)));
  container.replaceChildren(...rows.map((r) => bulletRow({ ...r, axisMax, bands })));
}

function renderGroupedChart(container, months, series) {
  if (months.length === 0) {
    container.replaceChildren();
    return;
  }
  const max = Math.max(...months.flatMap((m) => series.map((s) => m[s.key])), 1);

  const cols = months.map((m) => {
    const col = el('div', 'grouped-col');
    const bars = el('div', 'grouped-bars');
    series.forEach((s) => {
      const value = m[s.key] || 0;
      const bar = el('div', 'grouped-bar');
      bar.style.height = `${Math.max((value / max) * 100, value > 0 ? 2 : 0)}%`;
      bar.style.background = s.color;
      bar.appendChild(el('span', 'bv', String(value)));
      bar.addEventListener('mousemove', (evt) => showTooltip(evt, `${s.label} - ${m.month}: ${value}`));
      bar.addEventListener('mouseleave', hideTooltip);
      bars.appendChild(bar);
    });
    col.append(bars, el('div', 'grouped-label', m.month));
    return col;
  });

  container.replaceChildren(...cols);
}

function renderWorkItemsTable(container, items, columns) {
  const table = el('table', 'data-table');
  const thead = el('thead');
  const headRow = el('tr');
  columns.forEach((c) => headRow.appendChild(el('th', null, c.header)));
  thead.appendChild(headRow);

  const tbody = el('tbody');
  items.forEach((item) => {
    const tr = el('tr');
    columns.forEach((c) => {
      const td = el('td');
      if (c.pill) {
        const pillClass = item.bucket === 'active' ? 'pill-active' : item.bucket === 'backlog' ? 'pill-backlog' : 'pill-other';
        td.appendChild(el('span', `pill ${pillClass}`, item[c.key] || '—'));
      } else if (c.link && item[c.key]) {
        const link = el('a', null, item[c.key]);
        link.href = `${JIRA_BROWSE_BASE}${item[c.key]}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        td.appendChild(link);
      } else {
        td.textContent = item[c.key] ?? '—';
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.append(thead, tbody);
  container.replaceChildren(table);
}

function renderTimeline(container, items) {
  if (items.length === 0) {
    container.replaceChildren();
    return;
  }
  const dates = items.flatMap((i) => [i.startDate, i.dueDate]).filter(Boolean).map((d) => new Date(d).getTime());
  const min = Math.min(...dates);
  const max = Math.max(...dates);
  const span = Math.max(max - min, 1);

  const table = el('table', 'data-table');
  const thead = el('thead');
  const headRow = el('tr');
  ['Ticket', 'Opportunity Summary', 'Assignee', 'Complexity', 'Timeline'].forEach((h) => headRow.appendChild(el('th', null, h)));
  thead.appendChild(headRow);

  const tbody = el('tbody');
  items.forEach((item) => {
    const tr = el('tr');
    [item.key, item.opportunitySummary, item.assignee, item.complexity].forEach((v) => tr.appendChild(el('td', null, v ?? '—')));

    const timelineTd = el('td');
    const track = el('div', 'timeline-track');
    if (item.startDate && item.dueDate) {
      const s = new Date(item.startDate).getTime();
      const e = new Date(item.dueDate).getTime();
      const bar = el('div', 'timeline-bar');
      bar.style.left = `${((s - min) / span) * 100}%`;
      bar.style.width = `${Math.max(((e - s) / span) * 100, 1.5)}%`;
      bar.title = `${item.startDate.slice(0, 10)} to ${item.dueDate.slice(0, 10)}`;
      track.appendChild(bar);
    }
    timelineTd.appendChild(track);
    tr.appendChild(timelineTd);
    tbody.appendChild(tr);
  });

  table.append(thead, tbody);
  container.replaceChildren(table);
}

// ---------- Shared UI builders ----------

// `banner` swaps the plain <h2> title for the AHEAD Foundry logo + page name
// on a blue rounded band - ground-truthed from the source .pbix's own page
// header (an image visual + textbox visual over a rectangleRounded shape,
// fill #1C4CBF) rather than a new design.
function buildCard(title, subtitle, banner) {
  const card = el('div', 'card');
  if (banner) {
    const bannerEl = el('div', 'page-banner');
    const logo = document.createElement('img');
    logo.src = 'assets/foundry-logo-white.png';
    logo.alt = 'AHEAD Foundry';
    logo.className = 'page-banner-logo';
    bannerEl.append(logo, el('span', 'page-banner-label', `- ${banner}`));
    card.appendChild(bannerEl);
  } else {
    card.appendChild(el('h2', null, title));
  }
  if (subtitle) card.appendChild(el('div', 'sub', subtitle));
  return card;
}

function buildKpiRow(items) {
  const row = el('div', `row cols-${items.length} kpi-row`);
  items.forEach((item) => {
    const panel = el('div', 'panel kpi-mini');
    panel.appendChild(el('div', 'val', '-')).id = item.valueId;
    panel.appendChild(el('div', 'lbl', item.label));
    row.appendChild(panel);
  });
  return row;
}

function buildSlicerBox(slicerId, clearId, title) {
  const box = el('div', 'slicer-box');
  box.appendChild(el('div', 'slicer-title', title));
  const chips = el('div', 'slicer-chips');
  chips.id = slicerId;
  const allChip = el('button', 'slicer-chip all-chip active', 'All');
  allChip.type = 'button';
  const clearChip = el('button', 'slicer-chip clear-chip', 'Clear');
  clearChip.type = 'button';
  clearChip.id = clearId;
  chips.append(allChip, clearChip);
  box.appendChild(chips);
  return box;
}

function setAllChipsActive(slicerId, isActive) {
  document.querySelectorAll(`#${slicerId} .slicer-chip[data-value]`).forEach((chip) => chip.classList.toggle('active', isActive));
  document.querySelector(`#${slicerId} .all-chip`).classList.toggle('active', isActive);
}

function buildSlicerChips(slicerId, values, onToggle) {
  const container = document.getElementById(slicerId);
  container.querySelectorAll('.slicer-chip[data-value]').forEach((c) => c.remove());
  values.forEach((value) => {
    const chip = el('button', 'slicer-chip active', value);
    chip.type = 'button';
    chip.dataset.value = value;
    chip.addEventListener('click', () => {
      const wasActive = chip.classList.contains('active');
      chip.classList.toggle('active', !wasActive);
      document.querySelector(`#${slicerId} .all-chip`).classList.remove('active');
      onToggle(value, !wasActive);
    });
    container.appendChild(chip);
  });
}

// ---------- Opportunity Overview ----------

function buildOpportunityOverviewPanel() {
  const section = el('section', 'page-panel');
  section.id = 'page-opp-overview';

  const typeCard = buildCard('Opportunities by Type');
  typeCard.appendChild(el('div', 'status-line', '')).id = 'opp-type-status';
  const typeChart = el('div');
  typeChart.id = 'opp-type-chart';
  typeCard.appendChild(typeChart);

  const trendCard = buildCard(
    'Opportunity Volume Over Time',
    'New opportunities created per month - Integration, Staging, Warehousing only, last ~2 months'
  );
  const legend = el('div', 'legend');
  [
    ['Integration', 'var(--trend-integration)'],
    ['Staging', 'var(--trend-staging)'],
    ['Warehousing', 'var(--trend-warehousing)'],
  ].forEach(([label, color]) => {
    const item = el('span', 'legend-item');
    const swatch = el('span', 'legend-swatch');
    swatch.style.background = color;
    item.append(swatch, document.createTextNode(label));
    legend.appendChild(item);
  });
  trendCard.appendChild(legend);
  const trendChart = el('div', 'grouped-chart');
  trendChart.id = 'opp-trend-chart';
  trendCard.appendChild(trendChart);

  section.append(typeCard, trendCard);
  return section;
}

async function loadOpportunityOverview() {
  const statusEl = document.getElementById('opp-type-status');
  try {
    const data = await fetchJSON('/api/opportunity-overview');

    renderBarChart(
      document.getElementById('opp-type-chart'),
      data.byType.map((t) => ({ label: t.type, value: t.count, color: 'var(--ahead-blue)', tooltipText: `${t.type}: ${t.count} opportunities` }))
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

// ---------- Generic "workload by assignee" pages ----------
// Shared by Engineering Workload, Operations Workload, Program Management
// Workload - same response shape (kpis/workload/workItems), same Opportunity
// Type slicer, different Jira-side scoping per page.

const WORKLOAD_PAGES = [
  {
    id: 'eng-workload',
    title: 'Engineering Workload',
    subtitle:
      'Unresolved Configuration/Integration Execution & Meta Integration Review issues - weighted by Workload Weight V3. Curt Petty excluded (he has his own Manager\'s Workload page).',
    apiPath: '/api/engineering-workload',
    activeLabel: 'Active Work Items',
    backlogLabel: 'Backlog Work Items',
    hasSlicer: false,
    tableTitle: '',
    banner: 'Engineering',
    hasAssigneeSlicer: true,
  },
  {
    id: 'ops-workload',
    title: 'Operations Workload',
    subtitle: 'Unresolved Operations Execution issues - weighted by Workload Weight V3.',
    apiPath: '/api/operations-workload',
    activeLabel: 'Active Work Items',
    backlogLabel: 'Backlog Work Items',
  },
  {
    id: 'pgm-workload',
    title: 'Program Management Workload',
    subtitle: 'Unresolved PgM Execution issues - weighted by Workload Weight V3.',
    apiPath: '/api/program-management-workload',
    activeLabel: 'Active Work Items',
    backlogLabel: 'Backlog Work Items',
  },
];

const workloadPageState = new Map();

function buildWorkloadPanel(cfg) {
  const section = el('section', 'page-panel');
  section.id = `page-${cfg.id}`;

  const card = buildCard(cfg.title, cfg.subtitle, cfg.banner);
  if (cfg.hasSlicer !== false) {
    card.appendChild(buildSlicerBox(`${cfg.id}-slicer`, `${cfg.id}-clear`, 'Opportunity Type'));
  }
  if (cfg.hasAssigneeSlicer) {
    card.appendChild(buildSlicerBox(`${cfg.id}-assignee-slicer`, `${cfg.id}-assignee-clear`, 'Assignee'));
  }
  card.appendChild(el('div', 'status-line', '')).id = `${cfg.id}-status`;
  card.appendChild(
    buildKpiRow([
      { valueId: `${cfg.id}-kpi-active`, label: cfg.activeLabel },
      { valueId: `${cfg.id}-kpi-backlog`, label: cfg.backlogLabel },
    ])
  );

  const chartsRow = el('div', 'row cols-2');
  const activePanel = el('div', 'panel');
  activePanel.append(el('h3', null, 'Workload by Assignee'), Object.assign(el('div'), { id: `${cfg.id}-workload-chart` }));
  const backlogPanel = el('div', 'panel');
  backlogPanel.append(el('h3', null, 'Backlog by Assignee'), Object.assign(el('div'), { id: `${cfg.id}-backlog-chart` }));
  chartsRow.append(activePanel, backlogPanel);

  const tablePanel = el('div', 'panel');
  tablePanel.style.marginTop = '18px';
  tablePanel.append(
    el('h3', null, cfg.tableTitle ?? 'Work Items'),
    el('div', 'sub', cfg.hasSlicer !== false ? 'Filtered by the Opportunity Type slicer above' : '')
  );
  const tableScroll = el('div', 'table-scroll');
  tableScroll.style.maxHeight = '480px';
  tableScroll.style.overflowY = 'auto';
  const table = el('table', 'data-table');
  table.id = `${cfg.id}-table`;
  tableScroll.appendChild(table);
  tablePanel.appendChild(tableScroll);

  card.append(chartsRow, tablePanel);
  section.appendChild(card);

  if (cfg.hasSlicer !== false) {
    section.querySelector(`#${cfg.id}-slicer .all-chip`).addEventListener('click', () => {
      const state = workloadPageState.get(cfg.id);
      if (!state?.data) return;
      state.selected = new Set(state.data.workItems.map((i) => i.opportunityType));
      setAllChipsActive(`${cfg.id}-slicer`, true);
      renderWorkloadPanel(cfg);
    });
    section.querySelector(`#${cfg.id}-clear`).addEventListener('click', () => {
      const state = workloadPageState.get(cfg.id);
      if (!state) return;
      state.selected = new Set();
      setAllChipsActive(`${cfg.id}-slicer`, false);
      renderWorkloadPanel(cfg);
    });
  }

  if (cfg.hasAssigneeSlicer) {
    section.querySelector(`#${cfg.id}-assignee-slicer .all-chip`).addEventListener('click', () => {
      const state = workloadPageState.get(cfg.id);
      if (!state?.data) return;
      state.assigneeSelected = new Set(state.data.workItems.map((i) => i.assignee));
      setAllChipsActive(`${cfg.id}-assignee-slicer`, true);
      renderWorkloadPanel(cfg);
    });
    section.querySelector(`#${cfg.id}-assignee-clear`).addEventListener('click', () => {
      const state = workloadPageState.get(cfg.id);
      if (!state) return;
      state.assigneeSelected = new Set();
      setAllChipsActive(`${cfg.id}-assignee-slicer`, false);
      renderWorkloadPanel(cfg);
    });
  }

  return section;
}

function renderWorkloadPanel(cfg) {
  const state = workloadPageState.get(cfg.id);
  if (!state?.data) return;
  const { data, selected } = state;

  let filteredItems = cfg.hasSlicer === false ? data.workItems : data.workItems.filter((i) => selected.has(i.opportunityType));
  if (cfg.hasAssigneeSlicer) {
    filteredItems = filteredItems.filter((i) => state.assigneeSelected.has(i.assignee));
  }
  const filteredAssignees = new Set(filteredItems.map((i) => i.assignee));
  const filteredWorkload = data.workload.filter((w) => filteredAssignees.has(w.displayName));

  document.getElementById(`${cfg.id}-kpi-active`).textContent = filteredItems.filter((i) => i.bucket === 'active').length;
  document.getElementById(`${cfg.id}-kpi-backlog`).textContent = filteredItems.filter((i) => i.bucket === 'backlog').length;

  const bulletOpts = cfg.id === 'eng-workload' ? { bands: WORKLOAD_BULLET_BANDS, axisMax: WORKLOAD_BULLET_AXIS_MAX } : {};
  renderBulletChart(
    document.getElementById(`${cfg.id}-workload-chart`),
    filteredWorkload
      .filter((w) => w.activeWeight > 0)
      .sort((a, b) => b.activeWeight - a.activeWeight)
      .map((w) => ({ label: w.displayName, value: w.activeWeight, tooltipText: `${w.displayName}: ${w.activeWeight} weighted active` })),
    bulletOpts
  );
  renderBulletChart(
    document.getElementById(`${cfg.id}-backlog-chart`),
    filteredWorkload
      .filter((w) => w.backlogWeight > 0)
      .sort((a, b) => b.backlogWeight - a.backlogWeight)
      .map((w) => ({ label: w.displayName, value: w.backlogWeight, tooltipText: `${w.displayName}: ${w.backlogWeight} weighted backlog` })),
    bulletOpts
  );

  renderWorkItemsTable(document.getElementById(`${cfg.id}-table`), filteredItems, [
    { key: 'key', header: 'Ticket', link: cfg.id === 'eng-workload' },
    { key: 'opportunitySummary', header: 'Opportunity Summary' },
    { key: 'issueType', header: 'Issue Type' },
    { key: 'status', header: 'Status', pill: true },
    { key: 'complexity', header: 'Complexity' },
  ]);
}

async function loadWorkloadPanel(cfg) {
  const statusEl = document.getElementById(`${cfg.id}-status`);
  try {
    const data = await fetchJSON(cfg.apiPath);
    const types = [...new Set(data.workItems.map((i) => i.opportunityType))].sort((a, b) => a.localeCompare(b));
    const assignees = [...new Set(data.workItems.map((i) => i.assignee))].sort((a, b) => a.localeCompare(b));
    workloadPageState.set(cfg.id, { data, selected: new Set(types), assigneeSelected: new Set(assignees) });
    if (cfg.hasSlicer !== false) {
      buildSlicerChips(`${cfg.id}-slicer`, types, (value, isNowSelected) => {
        const state = workloadPageState.get(cfg.id);
        if (isNowSelected) state.selected.add(value);
        else state.selected.delete(value);
        renderWorkloadPanel(cfg);
      });
      setAllChipsActive(`${cfg.id}-slicer`, true);
    }
    if (cfg.hasAssigneeSlicer) {
      buildSlicerChips(`${cfg.id}-assignee-slicer`, assignees, (value, isNowSelected) => {
        const state = workloadPageState.get(cfg.id);
        if (isNowSelected) state.assigneeSelected.add(value);
        else state.assigneeSelected.delete(value);
        renderWorkloadPanel(cfg);
      });
      setAllChipsActive(`${cfg.id}-assignee-slicer`, true);
    }
    setSectionStatus(statusEl, '', false);
    renderWorkloadPanel(cfg);
    return data.updatedAt;
  } catch (err) {
    console.error(err);
    setSectionStatus(statusEl, `Could not load ${cfg.title.toLowerCase()} from Jira.`, true);
    return null;
  }
}

// ---------- Engineering Manager's Workload ----------

function buildEngManagerWorkloadPanel() {
  const section = el('section', 'page-panel');
  section.id = 'page-eng-mgr-workload';

  const card = buildCard("Engineering Manager's Workload", 'Curt Petty & Taylor Lewis only.');
  card.appendChild(el('div', 'status-line', '')).id = 'eng-mgr-status';

  const chartsRow = el('div', 'row cols-2');
  const activePanel = el('div', 'panel');
  activePanel.append(el('h3', null, 'Workload for Active Projects'), Object.assign(el('div'), { id: 'eng-mgr-active-chart' }));
  const teamPanel = el('div', 'panel');
  teamPanel.append(el('h3', null, 'Workload for Team Assignment'), Object.assign(el('div'), { id: 'eng-mgr-team-chart' }));
  chartsRow.append(activePanel, teamPanel);

  const pendingPanel = el('div', 'panel');
  pendingPanel.style.marginTop = '18px';
  pendingPanel.append(el('h3', null, 'Items Pending Assignment'), Object.assign(el('div'), { id: 'eng-mgr-pending-chart' }));

  const tablePanel = el('div', 'panel');
  tablePanel.style.marginTop = '18px';
  tablePanel.append(el('h3', null, 'Active & Backlog Work Items'), el('div', 'sub', 'Unresolved items for Curt Petty and Taylor Lewis'));
  const tableScroll = el('div');
  tableScroll.style.maxHeight = '480px';
  tableScroll.style.overflowY = 'auto';
  const table = el('table', 'data-table');
  table.id = 'eng-mgr-table';
  tableScroll.appendChild(table);
  tablePanel.appendChild(tableScroll);

  card.append(chartsRow, pendingPanel, tablePanel);
  section.appendChild(card);
  return section;
}

async function loadEngManagerWorkload() {
  const statusEl = document.getElementById('eng-mgr-status');
  try {
    const data = await fetchJSON('/api/engineering-manager-workload');

    renderBulletChart(
      document.getElementById('eng-mgr-active-chart'),
      data.activeProjects
        .filter((w) => w.weight > 0)
        .sort((a, b) => b.weight - a.weight)
        .map((w) => ({ label: w.displayName, value: w.weight, tooltipText: `${w.displayName}: ${w.weight} weighted` }))
    );
    renderBulletChart(
      document.getElementById('eng-mgr-team-chart'),
      data.teamAssignment
        .filter((w) => w.weight > 0)
        .sort((a, b) => b.weight - a.weight)
        .map((w) => ({ label: w.displayName, value: w.weight, tooltipText: `${w.displayName}: ${w.weight} weighted` }))
    );
    renderBarChart(
      document.getElementById('eng-mgr-pending-chart'),
      data.pendingAssignmentByAssignee.map((p) => ({
        label: p.displayName,
        value: p.count,
        color: 'var(--ahead-blue)',
        tooltipText: `${p.displayName}: ${p.count} pending assignment`,
      }))
    );
    renderWorkItemsTable(document.getElementById('eng-mgr-table'), data.workItems, [
      { key: 'key', header: 'Ticket' },
      { key: 'opportunitySummary', header: 'Opportunity Summary' },
      { key: 'issueType', header: 'Issue Type' },
      { key: 'status', header: 'Status', pill: true },
      { key: 'complexity', header: 'Complexity' },
    ]);

    setSectionStatus(statusEl, '', false);
    return data.updatedAt;
  } catch (err) {
    console.error(err);
    setSectionStatus(statusEl, "Could not load engineering manager's workload from Jira.", true);
    return null;
  }
}

// ---------- Engineering Staffing Planning ----------

function buildEngStaffingPanel() {
  const section = el('section', 'page-panel');
  section.id = 'page-eng-staffing';

  const card = buildCard(
    'Engineering Staffing Planning',
    'Projected Workload = Workload Weight V3 for issues that have not started yet (Start date in the future).'
  );
  card.appendChild(el('div', 'status-line', '')).id = 'eng-staffing-status';

  const projPanel = el('div', 'panel');
  projPanel.append(el('h3', null, 'Future (Projected) Workload by Assignee'), Object.assign(el('div'), { id: 'eng-staffing-chart' }));

  const timelinePanel = el('div', 'panel');
  timelinePanel.style.marginTop = '18px';
  timelinePanel.append(
    el('h3', null, 'Projects by Assignee (Timeline)'),
    el('div', 'sub', 'Simplified from the source report\'s Gantt chart'),
    Object.assign(el('div'), { id: 'eng-staffing-timeline' })
  );

  card.append(projPanel, timelinePanel);
  section.appendChild(card);
  return section;
}

async function loadEngStaffingPlanning() {
  const statusEl = document.getElementById('eng-staffing-status');
  try {
    const data = await fetchJSON('/api/engineering-staffing-planning');

    renderBulletChart(
      document.getElementById('eng-staffing-chart'),
      data.projectedWorkload.map((w) => ({ label: w.displayName, value: w.weight, tooltipText: `${w.displayName}: ${w.weight} projected` }))
    );
    renderTimeline(document.getElementById('eng-staffing-timeline'), data.timeline);

    setSectionStatus(statusEl, '', false);
    return data.updatedAt;
  } catch (err) {
    console.error(err);
    setSectionStatus(statusEl, 'Could not load engineering staffing planning from Jira.', true);
    return null;
  }
}

// ---------- Quotation pages ----------
// One shared dataset (the "Quoting" child issues), five filtered views.

const QUOTATION_TABS = [
  { id: 'quote-overall', title: 'Overall Quotation Overview', types: ['IMS', 'Integration', 'Warehousing', 'Warehousing+', 'Staging'] },
  { id: 'quote-warehousing', title: 'Warehousing Quoting Overview', types: ['Warehousing', 'Warehousing+'] },
  { id: 'quote-configuration', title: 'Configuration Quotation', types: ['Staging'] },
  { id: 'quote-integration', title: 'Integration Quotation', types: ['Integration'] },
  { id: 'quote-ims', title: 'IMS Quotation', types: ['IMS'] },
];

function buildQuotationPanel(tab) {
  const section = el('section', 'page-panel');
  section.id = `page-${tab.id}`;

  const card = buildCard(
    tab.title,
    'Simplified from the source report: one monthly-created trend (rather than two overlapping date-range charts) and an approximated Time To Completion (resolved date minus created date).'
  );
  card.appendChild(el('div', 'status-line', '')).id = `${tab.id}-status`;
  card.appendChild(
    buildKpiRow([
      { valueId: `${tab.id}-kpi-total`, label: 'Total Quotes' },
      { valueId: `${tab.id}-kpi-open`, label: 'Open Quotes' },
      { valueId: `${tab.id}-kpi-avg`, label: 'Avg Days to Complete' },
    ])
  );

  const chartsRow = el('div', 'row cols-2');
  const assigneePanel = el('div', 'panel');
  assigneePanel.append(el('h3', null, 'Quote Qty by Assignee'), Object.assign(el('div'), { id: `${tab.id}-assignee-chart` }));
  const trendPanel = el('div', 'panel');
  trendPanel.append(el('h3', null, 'Quotes Created by Month'), Object.assign(el('div'), { id: `${tab.id}-trend-chart` }));
  chartsRow.append(assigneePanel, trendPanel);

  card.appendChild(chartsRow);
  section.appendChild(card);
  return section;
}

let quotationData = null;

function renderQuotationTab(tab) {
  if (!quotationData) return;
  const quotes = quotationData.quotes.filter((q) => tab.types.includes(q.opportunityType));

  document.getElementById(`${tab.id}-kpi-total`).textContent = quotes.length;
  document.getElementById(`${tab.id}-kpi-open`).textContent = quotes.filter((q) => !q.isDone).length;
  const completed = quotes.filter((q) => q.timeToCompletionDays != null);
  const avgDays = completed.length ? Math.round(completed.reduce((sum, q) => sum + q.timeToCompletionDays, 0) / completed.length) : '-';
  document.getElementById(`${tab.id}-kpi-avg`).textContent = avgDays;

  const byAssignee = new Map();
  const byMonth = new Map();
  quotes.forEach((q) => {
    byAssignee.set(q.assignee, (byAssignee.get(q.assignee) || 0) + 1);
    if (q.createdMonth) byMonth.set(q.createdMonth, (byMonth.get(q.createdMonth) || 0) + 1);
  });

  renderBarChart(
    document.getElementById(`${tab.id}-assignee-chart`),
    [...byAssignee.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([assignee, count]) => ({ label: assignee, value: count, color: 'var(--ahead-blue)', tooltipText: `${assignee}: ${count} quotes` }))
  );

  renderBarChart(
    document.getElementById(`${tab.id}-trend-chart`),
    [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ label: month, value: count, color: 'var(--ahead-blue)', tooltipText: `${month}: ${count} created` }))
  );
}

async function loadQuotation() {
  const statusEls = QUOTATION_TABS.map((t) => document.getElementById(`${t.id}-status`));
  try {
    quotationData = await fetchJSON('/api/quotation');
    QUOTATION_TABS.forEach(renderQuotationTab);
    statusEls.forEach((s) => setSectionStatus(s, '', false));
    return quotationData.updatedAt;
  } catch (err) {
    console.error(err);
    statusEls.forEach((s) => setSectionStatus(s, 'Could not load quotation data from Jira.', true));
    return null;
  }
}

// ---------- R&E Issue Tracking ----------

function buildReIssueTrackingPanel() {
  const section = el('section', 'page-panel');
  section.id = 'page-re-tracking';

  const card = buildCard(
    'R&E Issue Tracking',
    `Production Findings from the last 180 days. Shown as ranked bars rather than pie charts - easier to compare at a glance.`
  );
  card.appendChild(el('div', 'status-line', '')).id = 're-tracking-status';

  const chartsRow = el('div', 'row cols-3');
  [
    ['Issue Source', 're-source-chart'],
    ['Issue Type', 're-type-chart'],
    ['Systemic?', 're-systemic-chart'],
  ].forEach(([title, id]) => {
    const panel = el('div', 'panel');
    panel.append(el('h3', null, title), Object.assign(el('div'), { id }));
    chartsRow.appendChild(panel);
  });

  const tablePanel = el('div', 'panel');
  tablePanel.style.marginTop = '18px';
  tablePanel.append(el('h3', null, 'Production Findings'));
  const tableScroll = el('div');
  tableScroll.style.maxHeight = '480px';
  tableScroll.style.overflowY = 'auto';
  const table = el('table', 'data-table');
  table.id = 're-tracking-table';
  tableScroll.appendChild(table);
  tablePanel.appendChild(tableScroll);

  card.append(chartsRow, tablePanel);
  section.appendChild(card);
  return section;
}

async function loadReIssueTracking() {
  const statusEl = document.getElementById('re-tracking-status');
  try {
    const data = await fetchJSON('/api/re-issue-tracking');

    const toRows = (rows) =>
      rows.map((r) => ({ label: r.label, value: r.count, color: 'var(--ahead-blue)', tooltipText: `${r.label}: ${r.count}` }));

    renderBarChart(document.getElementById('re-source-chart'), toRows(data.bySource));
    renderBarChart(document.getElementById('re-type-chart'), toRows(data.byFindingType));
    renderBarChart(document.getElementById('re-systemic-chart'), toRows(data.bySystemic));

    renderWorkItemsTable(document.getElementById('re-tracking-table'), data.findings, [
      { key: 'key', header: 'Ticket' },
      { key: 'summary', header: 'Summary' },
      { key: 'opportunitySummary', header: 'Opportunity' },
      { key: 'source', header: 'Source' },
      { key: 'findingType', header: 'Type' },
      { key: 'systemic', header: 'Systemic?' },
      { key: 'status', header: 'Status', pill: true },
    ]);

    setSectionStatus(statusEl, '', false);
    return data.updatedAt;
  } catch (err) {
    console.error(err);
    setSectionStatus(statusEl, 'Could not load R&E issue tracking from Jira.', true);
    return null;
  }
}

// ---------- Tab shell ----------

// Order and display names taken directly from the source .pbix's
// Report/definition/pages/pages.json pageOrder - the 3 pages marked
// "(Draft)" in the source file are left out.
const PAGES = [
  { id: 'opp-overview', title: 'Opportunity Overview', build: buildOpportunityOverviewPanel, load: loadOpportunityOverview },
  {
    id: 'eng-workload',
    title: 'Engineering Workload',
    build: () => buildWorkloadPanel(WORKLOAD_PAGES[0]),
    load: () => loadWorkloadPanel(WORKLOAD_PAGES[0]),
  },
  { id: 'eng-mgr-workload', title: "Engineering Manager's Workload", build: buildEngManagerWorkloadPanel, load: loadEngManagerWorkload },
  { id: 'eng-staffing', title: 'Engineering Staffing Planning', build: buildEngStaffingPanel, load: loadEngStaffingPlanning },
  { id: 'quote-overall', title: 'Overall Quotation Overview', build: () => buildQuotationPanel(QUOTATION_TABS[0]), load: null },
  { id: 'quote-warehousing', title: 'Warehousing Quoting Overview', build: () => buildQuotationPanel(QUOTATION_TABS[1]), load: null },
  { id: 'quote-configuration', title: 'Configuration Quotation', build: () => buildQuotationPanel(QUOTATION_TABS[2]), load: null },
  { id: 'quote-integration', title: 'Integration Quotation', build: () => buildQuotationPanel(QUOTATION_TABS[3]), load: null },
  { id: 'quote-ims', title: 'IMS Quotation', build: () => buildQuotationPanel(QUOTATION_TABS[4]), load: null },
  {
    id: 'ops-workload',
    title: 'Operations Workload',
    build: () => buildWorkloadPanel(WORKLOAD_PAGES[1]),
    load: () => loadWorkloadPanel(WORKLOAD_PAGES[1]),
  },
  {
    id: 'pgm-workload',
    title: 'Program Management Workload',
    build: () => buildWorkloadPanel(WORKLOAD_PAGES[2]),
    load: () => loadWorkloadPanel(WORKLOAD_PAGES[2]),
  },
  { id: 're-tracking', title: 'R&E Issue Tracking', build: buildReIssueTrackingPanel, load: loadReIssueTracking },
];

function setupTabs() {
  const tabsNav = document.getElementById('page-tabs');
  const panelsContainer = document.getElementById('page-panels');

  PAGES.forEach((page) => {
    const btn = el('button', 'tab-btn', page.title);
    btn.type = 'button';
    btn.dataset.page = page.id;
    tabsNav.appendChild(btn);
    panelsContainer.appendChild(page.build());
  });

  tabsNav.querySelector('.tab-btn').classList.add('active');
  panelsContainer.querySelector('.page-panel').classList.add('active');

  tabsNav.addEventListener('click', (evt) => {
    const btn = evt.target.closest('.tab-btn');
    if (!btn) return;
    tabsNav.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
    panelsContainer.querySelectorAll('.page-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `page-${btn.dataset.page}`));
  });
}

// ---------- Refresh ----------

async function refreshAll() {
  const loaders = [...PAGES.filter((p) => p.load).map((p) => p.load()), loadQuotation()];
  const results = await Promise.all(loaders);
  const stamp = document.getElementById('last-updated');
  const latest = results.find(Boolean);
  stamp.textContent = latest ? `Last updated ${new Date(latest).toLocaleTimeString()}` : 'Last updated -';
}

document.getElementById('refresh-btn').addEventListener('click', refreshAll);

setupTabs();
refreshAll();
setInterval(refreshAll, REFRESH_INTERVAL_MS);
