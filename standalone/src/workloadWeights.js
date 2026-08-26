// Transcribed from the Power BI model's "Workload Weight V3" DAX measure.
// Only issue types with an entry here count toward engineering workload -
// everything else (Opportunity, Production Finding, generic Subtask, ...)
// is out of scope for this weighting.
//
// Keys must match the "Complexity Level" custom field's actual Jira option
// labels verbatim - confirmed against the live FPT project's field metadata
// and real issues to be the bare "Easy"/"Medium"/"Hard" (no numeric prefix;
// "Super Hard" isn't a configured option on this field at all today, but is
// kept here in case it's added later - an unmatched key is harmless, it just
// can't match anything until then).
const WORKLOAD_WEIGHTS = {
  'Integration Execution': { Easy: 3, Medium: 5, Hard: 7, 'Super Hard': 15 },
  'Meta Integration Review': { Easy: 1, Medium: 2, Hard: 3, 'Super Hard': 6 },
  'Configuration Execution': { Easy: 0.5, Medium: 1, Hard: 3, 'Super Hard': 6 },
  'Configuration Sustainment': { Easy: 0.5, Medium: 1, Hard: 2 },
  'Warehouse Execution': { Easy: 0.5, Medium: 1, Hard: 2 },
  'Integration Finalization': { Easy: 0.5, Medium: 1, Hard: 2 },
  'Operations Execution - Configuration': { Easy: 0.5, Medium: 1, Hard: 2, 'Super Hard': 4 },
  'Operations Execution - Integration': { Easy: 0.5, Medium: 1, Hard: 2, 'Super Hard': 4 },
  'Operations Execution - Warehousing': { Easy: 0.5, Medium: 1, Hard: 2, 'Super Hard': 4 },
  'PgM Execution - Configuration': { Easy: 0.5, Medium: 1, Hard: 2, 'Super Hard': 4 },
  'PgM Execution - Integration': { Easy: 0.5, Medium: 1, Hard: 2, 'Super Hard': 4 },
  'PgM Execution - Warehousing': { Easy: 0.5, Medium: 1, Hard: 2, 'Super Hard': 4 },
  'PgM Execution - IMS': { Easy: 0.5, Medium: 1, Hard: 2, 'Super Hard': 4 },
};

const CHILD_ISSUE_TYPES = Object.keys(WORKLOAD_WEIGHTS);

// Mirrors the DAX SWITCH: an (issue type, complexity) pair with no matching
// branch evaluates to BLANK, which is 0 in a SUM.
function workloadWeight(issueType, complexityLevel) {
  return WORKLOAD_WEIGHTS[issueType]?.[complexityLevel] ?? 0;
}

module.exports = { WORKLOAD_WEIGHTS, CHILD_ISSUE_TYPES, workloadWeight };
