// rules.js: QED HQ's lists and rules, in one place (never inside screen code).
//
// The database stores short codes ("coming_up"); people see labels ("Coming up").
// Fixed lists (type, status) are also checked by the database; the people lists
// (OWNERS, later DELEGATES) are not, so a name can be added here without a
// database change.

// ---------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------

export const PROJECT_TYPES = [
  { value: "own_initiated", label: "Own-initiated" },
  { value: "bespoke", label: "Bespoke" },
  { value: "non_event", label: "Non-event" },
  { value: "sales", label: "Sales" },
];

// In the order a project goes through them.
export const PROJECT_STATUSES = [
  { value: "tbc", label: "Tbc" },
  { value: "coming_up", label: "Coming up" },
  { value: "ongoing", label: "Ongoing" },
  { value: "passed", label: "Passed" },
  { value: "archived", label: "Archived" },
];

// Sales leads only. Tracking only: a confirmed lead stays a lead.
export const SALES_STATUSES = [
  { value: "lead", label: "Lead" },
  { value: "improvements", label: "Improvements" },
  { value: "confirmed", label: "Confirmed" },
  { value: "declined", label: "Declined" },
];

// Who runs a project. Romain = default; the others are projects he follows up.
export const OWNERS = [
  { value: "romain", label: "Romain" },
  { value: "paula", label: "Paula" },
  { value: "gabriella", label: "Gabriella" },
];
export const DEFAULT_OWNER = "romain";

export function labelOf(list, value) {
  const item = list.find((entry) => entry.value === value);
  return item ? item.label : "";
}

// Home's project gallery: one tab per business line, plus "Followed up".
// `filter` = which projects show; `newProject` = what "+ New" pre-fills.
// Archived projects are hidden on every tab unless "Show archived" is on.
// Sales leads live in the Sales module, so Home never shows type "sales"
// unless the lead was given a project status.
const ACTIVE = (p) => p.status !== "archived";
export const HOME_TABS = [
  {
    id: "all", label: "All projects",
    filter: (p) => p.status !== null,
    newProject: { type: "bespoke", status: "coming_up" },
  },
  {
    id: "own", label: "Own-initiated",
    filter: (p) => p.type === "own_initiated",
    newProject: { type: "own_initiated", status: "coming_up" },
  },
  {
    id: "bespoke", label: "Bespoke",
    filter: (p) => p.type === "bespoke",
    newProject: { type: "bespoke", status: "coming_up" },
    // Date, then status (Coming up before Ongoing…), then name.
    sort: ["date", "status", "name"],
  },
  {
    id: "nonevent", label: "Non-event",
    filter: (p) => p.type === "non_event",
    newProject: { type: "non_event", status: "coming_up" },
    sort: ["date", "name"],
  },
  {
    id: "followed", label: "Followed up",
    filter: (p) => p.owner !== DEFAULT_OWNER && p.type !== "sales",
    newProject: { type: "bespoke", status: "coming_up" },
    byOwner: true, // one chip per owner (Paula, Gabriella)
  },
];

export function isVisible(project, showArchived) {
  return showArchived || ACTIVE(project);
}

// Sort helpers: projects without a date go last; then by name.
export function compareProjects(a, b, keys = ["date", "name"]) {
  for (const key of keys) {
    let diff = 0;
    if (key === "date") diff = compareDates(a.date_start, b.date_start);
    if (key === "status") diff = statusRank(a.status) - statusRank(b.status);
    if (key === "name") diff = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    if (diff) return diff;
  }
  return 0;
}

function compareDates(a, b) {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1; // "YYYY-MM-DD" strings sort like dates
}

function statusRank(status) {
  const i = PROJECT_STATUSES.findIndex((s) => s.value === status);
  return i === -1 ? PROJECT_STATUSES.length : i;
}
