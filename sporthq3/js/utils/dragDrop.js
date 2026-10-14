// dragDrop.js — drag a planner card onto another day.
//
// Built on "pointer events", which work the same for a mouse and a finger:
//   - mouse: press and move a few pixels -> the card follows the pointer
//   - finger: press and HOLD (~0.45 s) -> the card lifts, then follows your
//     finger; a quick swipe still scrolls the page, a quick tap still opens
//     the menu
// While dragging, the day under the pointer is highlighted; letting go on a
// different day calls onDrop(sessionId, day).
//
//   enableDragToDay(daysEl, { canDrag: (card) => true/false, onDrop: async (id, day) => {} })

const HOLD_MS = 450;     // finger: how long to hold before the card lifts
const MOVE_PX = 8;       // mouse: how far to move before it's a drag (not a click)
const EDGE_PX = 70;      // near the top/bottom of the screen: scroll the page

export function enableDragToDay(daysEl, { canDrag, onDrop }) {
  let press = null;      // the card being pressed (before the drag starts)
  let drag = null;       // the drag in progress
  let swallowClick = false;

  daysEl.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const card = event.target.closest(".plan-card[data-session]");
    if (!card || !canDrag(card)) return;
    press = { card, pointerId: event.pointerId, type: event.pointerType, x: event.clientX, y: event.clientY, timer: null };
    // Follow the pointer everywhere on the page, only while pressing
    // (removed again in stopListening, so redraws don't pile them up).
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    if (event.pointerType !== "mouse") {
      // Finger: lift the card only after holding still.
      press.timer = setTimeout(() => press && startDrag(press.x, press.y), HOLD_MS);
    }
  });

  function onMove(event) {
    if (drag) return moveDrag(event.clientX, event.clientY);
    if (!press || event.pointerId !== press.pointerId) return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (press.type === "mouse") {
      if (moved > MOVE_PX) startDrag(event.clientX, event.clientY);
    } else if (moved > MOVE_PX) {
      cancelPress(); // the finger moved before the hold: it's a scroll
    } else {
      press.x = event.clientX;
      press.y = event.clientY;
    }
  }

  async function onUp(event) {
    stopListening();
    if (drag) {
      const { sessionId, fromDay } = drag;
      const day = dayUnder(event.clientX, event.clientY);
      endDrag();
      swallowClick = true; // the click that follows the drop must not open the menu
      setTimeout(() => { swallowClick = false; }, 300); // in case that click never comes
      if (day && day !== fromDay) await onDrop(sessionId, day);
      return;
    }
    cancelPress();
  }

  function onCancel() {
    stopListening();
    if (drag) endDrag();
    cancelPress();
  }

  function stopListening() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
  }

  // Stop the click after a drop, and the phone's "copy / look up" menu on a long press.
  daysEl.addEventListener("click", (event) => {
    if (swallowClick) {
      swallowClick = false; // only the one click that the drop itself creates
      event.stopPropagation();
      event.preventDefault();
    }
  }, true);
  daysEl.addEventListener("contextmenu", (event) => {
    if (event.target.closest(".plan-card[data-session]")) event.preventDefault();
  });

  function cancelPress() {
    if (press && press.timer) clearTimeout(press.timer);
    press = null;
  }

  function startDrag(x, y) {
    const card = press.card;
    const box = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.style.width = `${box.width}px`;
    document.body.appendChild(ghost);
    card.classList.add("is-dragging");
    if (navigator.vibrate) navigator.vibrate(15);
    drag = {
      card, ghost, sessionId: card.dataset.session,
      fromDay: card.closest("section.day").dataset.day,
      offsetX: x - box.left, offsetY: y - box.top, lastY: y, scroller: null,
    };
    if (press.timer) clearTimeout(press.timer);
    press = null;
    // While dragging with a finger, the page must not scroll under it.
    document.addEventListener("touchmove", blockScroll, { passive: false });
    drag.scroller = setInterval(autoScroll, 16);
    moveDrag(x, y);
  }

  function moveDrag(x, y) {
    drag.ghost.style.transform = `translate(${x - drag.offsetX}px, ${y - drag.offsetY}px)`;
    drag.lastY = y;
    const day = dayUnder(x, y);
    daysEl.querySelectorAll("section.day").forEach((section) => {
      section.classList.toggle("is-drop-target", section.dataset.day === day && day !== drag.fromDay);
    });
  }

  function autoScroll() {
    if (drag.lastY < EDGE_PX) window.scrollBy(0, -12);
    else if (drag.lastY > window.innerHeight - EDGE_PX) window.scrollBy(0, 12);
  }

  function endDrag() {
    clearInterval(drag.scroller);
    document.removeEventListener("touchmove", blockScroll);
    drag.ghost.remove();
    drag.card.classList.remove("is-dragging");
    daysEl.querySelectorAll(".is-drop-target").forEach((s) => s.classList.remove("is-drop-target"));
    drag = null;
  }

  // The day section under a point (the ghost is ignored: pointer-events: none).
  function dayUnder(x, y) {
    const element = document.elementFromPoint(x, y);
    const section = element && element.closest("section.day");
    return section && daysEl.contains(section) ? section.dataset.day : null;
  }
}

function blockScroll(event) {
  event.preventDefault();
}
