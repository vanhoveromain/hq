// routine.js: two guided routines, full screen like Focus mode
// (UX review #11, Romain 2026-11-13).
//
//   #/routine/plan/<step>   ☀ Plan my day   (morning)
//     1 Catch up      overdue + tasks put off ≥ 2 times (↻), due today
//     2 No date yet   open tasks without a due date
//     3 Your 1-3-5    To do today, with the counter and quick add (always shown)
//     4 Meetings      today's points to settle in a meeting
//   #/routine/close/<step>  ☾ Close the day (evening)
//     1 Achieved      what you ticked today
//     2 What's left   To do today + To delegate still open: push or keep
//     3 Tomorrow      To do tomorrow, with the counter and quick add (always shown)
//
// Steps with nothing in them are skipped (decided when the routine starts, so
// a step doesn't vanish under you while you work in it). Every change saves
// at once (same rows, chips and Undo as everywhere), so leaving early loses
// nothing. Finishing marks the routine done for today on this device (Home's
// reminder uses it).

import {
  listDayTasks, listOpenTasksWithoutDate, listProjects, listMeetingNames, updateTasksEach,
} from "../storage.js";
import { PRIORITY_LISTS, compareDayTasks, countOneThreeFive, priorityScore, pushChanges, ROLLED_SHOW } from "../rules.js";
import { openTaskSheet } from "./taskSheet.js";
import { taskListInnerHtml, wireTaskList, quickAddHtml, wireQuickAdd } from "./taskList.js";
import { showToast } from "../utils/toast.js";
import { escapeHtml, icon } from "../utils/html.js";
import { brusselsToday, addDays, brusselsDayOf, longDay } from "../utils/dates.js";

// ---------------------------------------------------------------------
// Done today? (this device)
// ---------------------------------------------------------------------

const DONE_KEY = (kind) => `qedhq.routine.${kind}`;

export function routineDoneToday(kind) {
  try {
    return localStorage.getItem(DONE_KEY(kind)) === brusselsToday();
  } catch {
    return false;
  }
}

function markDone(kind) {
  try {
    localStorage.setItem(DONE_KEY(kind), brusselsToday());
  } catch { /* private window: the reminder simply stays */ }
}


// ---------------------------------------------------------------------
// The steps
// ---------------------------------------------------------------------

const ROUTINES = {
  plan: {
    title: "Plan my day",
    sun: true,
    finish: "Day planned",
    steps: [
      {
        id: "catch-up", title: "Catch up",
        intro: "Overdue tasks, and tasks you keep putting off (↻). Give each a real date, push it, delegate it, or tick it.",
        tasks: (x) => [
          ...x.tasks.filter((t) => PRIORITY_LISTS.overdue(t, x.d)),
          ...x.tasks.filter((t) => !t.done && t.due_date === x.today && (t.rolled_over || 0) >= ROLLED_SHOW),
        ].sort(x.byScore),
        showPush: true,
      },
      {
        id: "no-date", title: "No date yet",
        intro: "Tasks still waiting for a due date. Tap the date to give them one (or delete what no longer matters).",
        tasks: (x) => x.undated.slice().sort(x.byScore),
      },
      {
        id: "one-three-five", title: "Your 1-3-5 for today",
        intro: "1 major, 3 medium, 5 small. Set the scope and priority, push what doesn't fit, add what's missing.",
        tasks: (x) => x.tasks.filter((t) => PRIORITY_LISTS.today(t, x.d)).sort(x.byDay),
        counterFor: "today",
        quickAddDay: "today",
        showPush: true,
        always: true,
      },
      {
        id: "meetings", title: "Meeting points",
        intro: "What you want to settle in a meeting today. Check the meeting name on each.",
        tasks: (x) => x.tasks.filter((t) => PRIORITY_LISTS.meetings(t, x.d)).sort(x.byDay),
      },
    ],
  },
  close: {
    title: "Close the day",
    sun: false,
    finish: "Day closed",
    steps: [
      {
        id: "achieved", title: "Achieved today",
        intro: "Everything you ticked today. Well done.",
        tasks: (x) => x.tasks.filter((t) => t.done && t.done_at && brusselsDayOf(t.done_at) === x.today),
      },
      {
        id: "left", title: "What's left",
        intro: "Still open for today. Push to tomorrow, give another date, or keep it on today.",
        tasks: (x) => x.tasks.filter((t) => PRIORITY_LISTS.today(t, x.d) || PRIORITY_LISTS.toDelegate(t, x.d)).sort(x.byDay),
        showPush: true,
        pushAll: true,
      },
      {
        id: "tomorrow", title: "A look at tomorrow",
        intro: "Tomorrow's To do. Check the 1-3-5 and add what you already know.",
        tasks: (x) => x.tasks.filter((t) => PRIORITY_LISTS.tomorrow(t, x.d)).sort(x.byDay),
        counterFor: "tomorrow",
        quickAddDay: "tomorrow",
        always: true,
      },
    ],
  },
};

// The routine under way: which steps it kept when it started.
let running = null; // { kind, stepIds }


// ---------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------

export async function render(el, { params = [] } = {}) {
  const kind = ROUTINES[params[0]] ? params[0] : "plan";
  const routine = ROUTINES[kind];
  const stepNo = parseInt(params[1], 10) || 0; // 0 = not started yet (pick the steps)

  if (!el.querySelector(".routine")) el.innerHTML = `<p class="muted">Loading…</p>`;
  const today = brusselsToday();
  const tomorrow = addDays(today, 1);
  let tasks;
  let undated;
  let projects;
  let meetingNames;
  try {
    [tasks, undated, projects, meetingNames] = await Promise.all([
      // Open tasks up to tomorrow + tasks ticked since yesterday (UTC) for "Achieved today".
      listDayTasks(tomorrow, `${addDays(today, -1)}T00:00:00Z`),
      listOpenTasksWithoutDate(),
      listProjects(),
      listMeetingNames().catch(() => []),
    ]);
  } catch (error) {
    el.innerHTML = `<p class="error">Could not load your tasks: ${escapeHtml(error.message)}</p>`;
    return;
  }
  const names = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const projectName = (t) => names[t.project_id] || "";
  const x = {
    tasks, undated, today, d: { today, tomorrow },
    byDay: (a, b) => compareDayTasks(a, b, today, projectName),
    byScore: (a, b) => priorityScore(b, today) - priorityScore(a, today),
  };

  // Starting: keep the steps that have something in them (and the "always" ones).
  if (!stepNo || !running || running.kind !== kind) {
    running = { kind, stepIds: routine.steps.filter((s) => s.always || s.tasks(x).length).map((s) => s.id) };
    if (!stepNo) {
      history.replaceState(null, "", `#/routine/${kind}/1`);
    }
  }
  const steps = running.stepIds.map((id) => routine.steps.find((s) => s.id === id));
  const index = Math.min(Math.max(stepNo, 1), steps.length) - 1;
  const step = steps[index];
  const isLast = index === steps.length - 1;
  const shown = step.tasks(x);
  const redraw = () => render(el, { params: [kind, String(index + 1)] });
  const go = (n) => { window.location.hash = `#/routine/${kind}/${n}`; };

  const used = new Set(tasks.map((t) => t.project_id));
  const projectChoices = projects
    .filter((p) => p.status !== "archived" || used.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  const quickDay = step.quickAddDay === "tomorrow" ? tomorrow : today;

  document.title = `${routine.title} · QED HQ`;
  el.innerHTML = `
    <div class="routine">
      <div class="routine-top">
        <a class="back" href="#/priorities">${icon("back")} Leave</a>
        <span class="routine-step">Step ${index + 1} of ${steps.length}</span>
      </div>
      <p class="routine-kind">${routine.sun ? "☀" : "☾"} ${escapeHtml(routine.title)} · ${escapeHtml(longDay(today))}</p>
      <ol class="routine-dots" aria-hidden="true">${steps.map((s, i) => `<li class="${i < index ? "is-past" : i === index ? "is-now" : ""}">${escapeHtml(s.title)}</li>`).join("")}</ol>
      <h1 class="routine-title">${escapeHtml(step.title)} <span class="count">${shown.length}</span></h1>
      <p class="routine-intro">${escapeHtml(step.intro)}</p>
      ${step.counterFor ? `<p class="routine-counter" id="routine-counter"></p>` : ""}
      ${step.quickAddDay ? quickAddHtml({ today: quickDay, projects, placeholder: step.quickAddDay === "tomorrow" ? "Add a task for tomorrow…" : "Add a task for today…" }) : ""}
      ${step.pushAll && shown.some((t) => !t.done) ? `<button type="button" class="btn secondary small routine-push-all" id="push-all">${icon("forward")} Push all ${shown.length} to tomorrow</button>` : ""}
      ${shown.length
        ? `<ul class="task-list with-project" id="routine-list"></ul>`
        : `<p class="list-empty">${step.id === "one-three-five" ? "Nothing on today yet. Add your tasks above." : "Nothing here any more."}</p>`}
      <div class="routine-nav">
        ${index > 0 ? `<button type="button" class="btn secondary" id="prev">${icon("back")} Back</button>` : "<span></span>"}
        <span class="routine-nav-right">
          ${isLast ? "" : `<button type="button" class="btn secondary" id="skip">Skip</button>`}
          <button type="button" class="btn" id="next">${isLast ? `${icon("check")} ${escapeHtml(routine.finish)}` : "Next"}</button>
        </span>
      </div>
    </div>`;

  // The rows: the usual chips, tick, push arrow, "⋯".
  const listEl = el.querySelector("#routine-list");
  if (listEl) {
    const rowOptions = { today, projects: projectChoices, showPush: Boolean(step.showPush) };
    listEl.innerHTML = taskListInnerHtml(shown, rowOptions);
    wireTaskList(listEl, shown, {
      onOpen: (task) => openTaskSheet(task, { onChange: redraw, meetingNames }),
      onChange: redraw,
      rowOptions,
      meetingNames,
      onSaved: () => drawCounter(),
    });
  }

  function drawCounter() {
    const counterEl = el.querySelector("#routine-counter");
    if (!counterEl) return;
    const day = step.counterFor === "tomorrow" ? { today: tomorrow, tomorrow: addDays(tomorrow, 1) } : x.d;
    const { scopes, noScope } = countOneThreeFive(shown.filter((t) => PRIORITY_LISTS.today(t, day)));
    counterEl.innerHTML = scopes.map((s) =>
      `<span class="${s.over ? "is-over" : s.count === s.perDay ? "is-full" : ""}">${escapeHtml(s.label)} <strong>${s.count}/${s.perDay}</strong></span>`).join("")
      + (noScope ? `<span class="muted">${noScope} without a scope</span>` : "");
  }
  drawCounter();

  const quickAdd = el.querySelector(".quick-add");
  if (quickAdd) wireQuickAdd(quickAdd, { onAdded: redraw });

  const pushAllButton = el.querySelector("#push-all");
  if (pushAllButton) {
    pushAllButton.addEventListener("click", async () => {
      const rows = shown.filter((t) => !t.done && t.due_date !== tomorrow).map((t) => ({
        id: t.id, changes: pushChanges(t, tomorrow), before: { due_date: t.due_date, rolled_over: t.rolled_over || 0 },
      }));
      pushAllButton.disabled = true;
      try {
        await updateTasksEach(rows.map((r) => ({ id: r.id, changes: r.changes })));
      } catch (error) {
        showToast("Could not push: " + error.message);
        pushAllButton.disabled = false;
        return;
      }
      showToast(`${rows.length} task${rows.length === 1 ? "" : "s"} pushed to tomorrow.`, {
        actionLabel: "Undo",
        onAction: async () => { await updateTasksEach(rows.map((r) => ({ id: r.id, changes: r.before }))); redraw(); },
      });
      redraw();
    });
  }

  el.querySelector("#prev")?.addEventListener("click", () => go(index));
  el.querySelector("#skip")?.addEventListener("click", () => go(index + 2));
  el.querySelector("#next").addEventListener("click", () => {
    if (!isLast) {
      go(index + 2);
      return;
    }
    markDone(kind);
    running = null;
    showToast(kind === "plan" ? "Day planned. Have a good one." : "Day closed. See you tomorrow.");
    window.location.hash = "#/priorities";
  });
}
