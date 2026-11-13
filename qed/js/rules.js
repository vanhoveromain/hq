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


// ---------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------

export const PRIORITIES = [
  { value: "critical", label: "Critical", score: 6 },
  { value: "high", label: "High", score: 5 },
  { value: "medium", label: "Medium", score: 4 },
  { value: "low", label: "Low", score: 3 },
  { value: "nice_to_do", label: "Nice to do", score: 2 },
];

// Active = a normal task. The others take a task out of the normal flow.
export const STATES = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "pending_today", label: "Pending today" },
  { value: "to_delegate", label: "To delegate" },
  { value: "delegated", label: "Delegated" },
];

// The 1-3-5 rule: per day, 1 Major, 3 Medium, 5 Small.
export const SCOPES = [
  { value: "major", label: "Major", perDay: 1 },
  { value: "medium", label: "Medium", perDay: 3 },
  { value: "small", label: "Small", perDay: 5 },
];

export const PERIODS = [
  { value: "am", label: "AM" },
  { value: "pm", label: "PM" },
];

// Who a task can be handed to (no database check: add names here freely).
export const DELEGATES = [
  "Alina", "Adriana", "Cristina", "Emma", "Flavio",
  "Gabriella", "Paula", "Kevin", "Martin", "Design",
].map((name) => ({ value: name, label: name }));

// Priority score (decided 2026-11-08, from the Notion formula). Higher = do
// first. First match wins:
//   7  open and due before today (should not happen: the rollover moves them)
//   0  Pending, Delegated, or to settle in a meeting (is_meeting)
//   1  Pending today
//   6…2  Critical, High, Medium, Low, Nice to do
//   0  no priority
// "To delegate" keeps its normal score (its list is sorted by it).
export function priorityScore(task, today) {
  if (!task.done && task.due_date && task.due_date < today) return 7;
  if (task.is_meeting || task.state === "pending" || task.state === "delegated") return 0;
  if (task.state === "pending_today") return 1;
  const priority = PRIORITIES.find((p) => p.value === task.priority);
  return priority ? priority.score : 0;
}

// Open tasks on a project page: by due date (no date last), then score.
export function compareByDueThenScore(a, b, today) {
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }
  return priorityScore(b, today) - priorityScore(a, today);
}


// ---------------------------------------------------------------------
// Priorities of the day: which open task goes in which list
// (decided 2026-11-08, see the Build spec). `today` / `tomorrow` are
// "YYYY-MM-DD" in Brussels. A task can sit in only one of the "my work"
// lists; meetings, To delegate, Delegated and Pending have their own.
// ---------------------------------------------------------------------

const DOING = (t) => (t.state === "active" || t.state === "pending_today") && !t.is_meeting;

export const PRIORITY_LISTS = {
  // To do today and To do tomorrow: your own work (no meetings, nothing parked).
  today:      (t, d) => !t.done && t.due_date === d.today && DOING(t),
  // Safety net (the nightly rollover should leave nothing here): your own
  // work or a task to hand off, due before today.
  overdue:    (t, d) => !t.done && t.due_date && t.due_date < d.today && (DOING(t) || t.state === "to_delegate"),
  tomorrow:   (t, d) => !t.done && t.due_date === d.tomorrow && DOING(t),
  toDelegate: (t, d) => !t.done && t.due_date === d.today && t.state === "to_delegate" && !t.is_meeting,
  meetings:   (t, d) => !t.done && t.due_date === d.today && t.is_meeting,
  delegated:  (t, d) => !t.done && t.due_date && t.due_date <= d.today && t.state === "delegated" && !t.is_meeting,
  pending:    (t, d) => !t.done && t.due_date && t.due_date <= d.today && t.state === "pending" && !t.is_meeting,
};

const PERIOD_RANK = { am: 0, pm: 1 };
const SCOPE_RANK = { major: 0, medium: 1, small: 2 };
const rank = (table, value) => (value in table ? table[value] : Object.keys(table).length);

// To do today / tomorrow: AM, then PM, then no period; then score (high
// first); then Major, Medium, Small; then project name.
export function compareDayTasks(a, b, today, projectName) {
  return rank(PERIOD_RANK, a.period) - rank(PERIOD_RANK, b.period)
    || priorityScore(b, today) - priorityScore(a, today)
    || rank(SCOPE_RANK, a.scope) - rank(SCOPE_RANK, b.scope)
    || projectName(a).localeCompare(projectName(b), "en", { sensitivity: "base" });
}

// Achieved lists: Major, Medium, Small; then period; then score; then project.
export function compareAchieved(a, b, today, projectName) {
  return rank(SCOPE_RANK, a.scope) - rank(SCOPE_RANK, b.scope)
    || rank(PERIOD_RANK, a.period) - rank(PERIOD_RANK, b.period)
    || priorityScore(b, today) - priorityScore(a, today)
    || projectName(a).localeCompare(projectName(b), "en", { sensitivity: "base" });
}

// The 1-3-5 counter for To do today: how many tasks per scope, against
// the room for each (1 Major, 3 Medium, 5 Small). It warns, never blocks.
export function countOneThreeFive(tasks) {
  const counts = SCOPES.map((s) => ({
    ...s,
    count: tasks.filter((t) => t.scope === s.value).length,
  })).map((s) => ({ ...s, over: s.count > s.perDay }));
  const noScope = tasks.filter((t) => !t.scope).length;
  return { scopes: counts, noScope };
}


// ---------------------------------------------------------------------
// Task planner boards (Build spec, step 7). Each board shows open tasks
// in columns; dragging a card to another column sets `field` to that
// column's value. `d` = { today, tomorrow, monday, sunday } (Brussels).
// ---------------------------------------------------------------------

const NOT_PARKED = (t) => t.state !== "pending" && t.state !== "delegated";
const scopeColumns = () => [...SCOPES.map((s) => ({ value: s.value, label: s.label, limit: s.perDay })), { value: null, label: "No scope" }];
const priorityColumns = () => [...PRIORITIES.map((p) => ({ value: p.value, label: p.label })), { value: null, label: "No priority" }];

export const PLANNER_BOARDS = [
  {
    id: "week", label: "This week", field: "due_date",
    // Tasks without a due date get their own column first (Romain,
    // 2026-11-13): drag one onto a day to give it that date.
    filter: (t, d) => !t.due_date || (t.due_date >= d.monday && t.due_date <= d.sunday),
    columns: (d) => [
      { value: null, label: "No date" },
      ...weekDays(d.monday).map((day) => ({ value: day, label: day, isToday: day === d.today })),
    ],
    sort: "project",
    withUndated: true, // the planner also loads open tasks without a date
  },
  {
    id: "week-scope", label: "This week's scope", field: "scope",
    filter: (t, d) => t.due_date >= d.monday && t.due_date <= d.sunday,
    columns: () => scopeColumns().map((c) => ({ ...c, limit: undefined })),
    sort: "score",
  },
  {
    id: "today-scope", label: "Today's scope", field: "scope",
    filter: (t, d) => t.due_date === d.today && NOT_PARKED(t),
    columns: scopeColumns, // with the 1-3-5 room per column
    sort: "score",
  },
  {
    id: "today-priority", label: "Today's priority", field: "priority",
    filter: (t, d) => t.due_date === d.today,
    columns: priorityColumns,
    sort: "score-project",
  },
  {
    id: "tomorrow-priority", label: "Tomorrow's priority", field: "priority",
    filter: (t, d) => t.due_date === d.tomorrow,
    columns: priorityColumns,
    sort: "score",
  },
];

function weekDays(monday) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const [y, m, dd] = monday.split("-").map(Number);
    days.push(new Date(Date.UTC(y, m - 1, dd + i)).toISOString().slice(0, 10));
  }
  return days;
}


// ---------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------

// Reach out date (Notion formula, confirmed 2026-11-08): the day the lead
// was created + 1 year, unless the lead has its own date (reach_out_on,
// 2026-11-09: Romain adds names to the list himself). Days are "YYYY-MM-DD"
// (Brussels). A lead made on 29 February comes back on 1 March.
export function reachOutDate(createdDay, ownDate = null) {
  return ownDate || oneYearAfter(createdDay);
}

export function oneYearAfter(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y + 1, m - 1, d)).toISOString().slice(0, 10);
}

// The Sales tabs. Open = still in play (Lead, Improvements).
export const SALES_TABS = [
  { id: "open", label: "Open", filter: (l) => l.sales_status === "lead" || l.sales_status === "improvements" || !l.sales_status },
  { id: "reach-out", label: "To reach out", filter: (l, today) => l.reach_out <= today },
  { id: "confirmed", label: "Confirmed", filter: (l) => l.sales_status === "confirmed" },
  { id: "declined", label: "Declined", filter: (l) => l.sales_status === "declined" },
  { id: "all", label: "All", filter: () => true },
];
