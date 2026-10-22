// quickLog.js — one-tap "Done" on a planned session (step 20b, Rom's choice).
//
// "Done, no log" is gone: a session ticked without a log was missing from
// the training load, stats and block totals. Now "Done" LOGS it for you:
//   1. something of that sport is already logged that day (and not linked
//      to another session) -> link the two (one tap; asks if there are several)
//   2. the session has a planned duration (its recipe's target time)
//      -> creates the activity with the planned values and links it
//   3. no planned duration (a "just a sport" session), or a match (it needs
//      its match card) -> opens the log form, pre-filled
// Each quick action shows a toast with Undo.

import {
  listActivitiesBetween, listPlannedSessions, saveActivity, deleteActivity, listShoes, listRecentShoeIds,
} from "../storage.js?v=202610212125";
import { getSport, getSessionType, sessionTypeLabel, shoeSurfaceFor } from "../rules.js?v=202610212125";
import { sessionName, sessionDetails, completeSession, reopenSession } from "./plan.js?v=202610212125";
import { openSheet } from "./sheet.js?v=202610212125";
import { showToast } from "./toast.js?v=202610212125";
import { escapeHtml, formatDuration, formatKm } from "./format.js?v=202610212125";

// The pair of shoes to suggest for a run: the last one you ran in with the
// right surface ("road" / "trail"); if you never did, the last pair you used
// at all. Retired pairs are never suggested. (Also used by the log form.)
export function suggestedShoe(shoes, recentShoeIds, surface) {
  const inUse = (id) => shoes.find((shoe) => shoe.id === id && !shoe.retired);
  const sameSurface = recentShoeIds.find((id) => inUse(id) && inUse(id).surface === surface);
  return sameSurface || recentShoeIds.find((id) => inUse(id)) || null;
}

// `onChange` = redraw the screen after an Undo (the toast outlives the action).
// Returns "linked", "logged", "form" or null (nothing done).
export async function doneInOneTap(session, { onChange = () => {} } = {}) {
  const day = session.session_date;
  const [dayActivities, daySessions] = await Promise.all([
    listActivitiesBetween(day, day),
    listPlannedSessions(day, day),
  ]);
  const linked = new Set(daySessions.map((s) => s.activity_id).filter(Boolean));
  const candidates = dayActivities.filter((a) => a.sport === session.sport && !linked.has(a.id));

  // 1. Already logged: link it (never log the same session twice).
  if (candidates.length) {
    const activity = candidates.length === 1 ? candidates[0] : await pickActivity(candidates);
    if (!activity) return null;
    await completeSession(session, activity.id);
    showToast(`${sessionName(session)} linked to what you logged`, {
      actionLabel: "Undo",
      onAction: async () => { await reopenSession(session); onChange(); },
    });
    return "linked";
  }

  // 3. Not enough to log it by itself: the form, pre-filled.
  const details = sessionDetails(session);
  const duration = details && details.target_duration_s;
  const type = getSessionType(session.sport, session.session_type);
  if (!duration || (type && type.matchCard)) {
    window.location.hash = `#/log/new/${session.id}`;
    return "form";
  }

  // 2. Log it with the planned values (no RPE: you can add it later).
  const sport = getSport(session.sport);
  const fields = sport ? sport.fields : [];
  const activity = {
    activity_date: day,
    sport: session.sport,
    session_type: session.session_type ?? null,
    duration_s: duration,
    distance_km: fields.includes("distance") && details.target_distance_km ? Number(details.target_distance_km) : null,
    elevation_m: null,
    stairs_climbed: null,
    rpe: null,
    title: session.title || details.name || null,
    notes: null,
    shoe_id: fields.includes("shoe") ? await shoeFor(session.session_type) : null,
  };
  const saved = await saveActivity(activity, null);
  await completeSession(session, saved.id);
  showToast(`Logged: ${sessionName(session)} · ${formatDuration(duration)}`, {
    actionLabel: "Undo",
    onAction: async () => {
      await deleteActivity(saved.id);
      await reopenSession(session);
      onChange();
    },
  });
  return "logged";
}

// Several activities of that sport that day: which one was it?
async function pickActivity(candidates) {
  const id = await openSheet({
    title: "Which one was it?",
    html: `<p class="muted small">You already logged these that day.</p>
      <div class="sheet-list">${candidates.map((a) => `
        <button type="button" class="sheet-item" data-value="${a.id}">
          ${escapeHtml(a.title || sessionTypeLabel(a.sport, a.session_type))}
          <span class="muted small">${escapeHtml([formatDuration(a.duration_s), a.distance_km != null ? formatKm(a.distance_km) : ""].filter(Boolean).join(" · "))}</span>
        </button>`).join("")}</div>`,
  });
  return candidates.find((a) => a.id === id) || null;
}

// A run gets the usual pair for its surface (same rule as the log form).
async function shoeFor(sessionType) {
  try {
    const [shoes, recent] = await Promise.all([listShoes(), listRecentShoeIds()]);
    return suggestedShoe(shoes, recent, shoeSurfaceFor(sessionType));
  } catch {
    return null; // not worth blocking the log for
  }
}
