// drag.js: drag cards between columns (Task planner).
//
//   makeBoardDraggable(boardEl, { onDrop(cardId, columnEl), onTap(cardId, pointerType) })
//
// Cards carry data-card="<id>", columns data-column. Works with:
//   - a mouse: press and move (5 px) to drag;
//   - a finger: press and HOLD (0.35 s) to pick the card up, then drag.
//     A quick swipe still scrolls the page / the columns as usual.
// While dragging, a copy of the card follows the pointer and the column
// under it lights up. Near the left / right edge, the columns scroll.
// A click / tap without dragging calls onTap (open the task).

const HOLD_MS = 350;
const MOVE_PX = 5;

// Returns a function that removes every listener (call it before the board
// is drawn again, so listeners never pile up).
export function makeBoardDraggable(boardEl, { onDrop, onTap }) {
  const stop = new AbortController();
  const opts = { signal: stop.signal };
  const scroller = boardEl.querySelector(".board-columns") || boardEl;
  let press = null;   // { card, x, y, pointerId, type, timer }
  let drag = null;    // { card, ghost, dx, dy, over }

  boardEl.addEventListener("pointerdown", (event) => {
    const card = event.target.closest("[data-card]");
    if (!card || event.button > 0) return;
    // The tick box and buttons inside a card keep working normally.
    if (event.target.closest("input, button, a, select, label")) return;
    press = { card, x: event.clientX, y: event.clientY, pointerId: event.pointerId, type: event.pointerType };
    if (press.type !== "mouse") {
      press.timer = setTimeout(() => startDrag(press.x, press.y), HOLD_MS);
      card.classList.add("is-pressing");
    }
  }, opts);

  document.addEventListener("pointermove", (event) => {
    if (drag) {
      moveDrag(event.clientX, event.clientY);
      return;
    }
    if (!press || event.pointerId !== press.pointerId) return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (press.type === "mouse") {
      if (moved > MOVE_PX) startDrag(event.clientX, event.clientY);
      return;
    }
    // Finger moved before the hold: it's a scroll, not a drag.
    if (moved > 8) cancelPress();
  }, opts);

  document.addEventListener("pointerup", (event) => {
    if (drag) {
      endDrag(true);
      return;
    }
    if (!press || event.pointerId !== press.pointerId) return;
    const card = press.card;
    const type = press.type;
    cancelPress();
    if (onTap) onTap(card.dataset.card, type);
  }, opts);

  document.addEventListener("pointercancel", () => {
    if (drag) endDrag(false);
    cancelPress();
  }, opts);

  // Once a finger has picked a card up, stop the page from scrolling under it.
  document.addEventListener("touchmove", (event) => {
    if (drag) event.preventDefault();
  }, { passive: false, signal: stop.signal });

  // A long press shouldn't open the phone's own menu over the card.
  boardEl.addEventListener("contextmenu", (event) => {
    if (event.target.closest("[data-card]") && press && press.type !== "mouse") event.preventDefault();
  }, opts);

  function cancelPress() {
    if (!press) return;
    clearTimeout(press.timer);
    press.card.classList.remove("is-pressing");
    press = null;
  }

  function startDrag(x, y) {
    if (!press) return;
    const card = press.card;
    clearTimeout(press.timer);
    card.classList.remove("is-pressing");
    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.style.width = `${rect.width}px`;
    document.body.append(ghost);
    card.classList.add("is-dragging");
    drag = { card, ghost, dx: x - rect.left, dy: y - rect.top, over: null };
    press = null;
    if (navigator.vibrate) navigator.vibrate(10);
    moveDrag(x, y);
  }

  function moveDrag(x, y) {
    drag.ghost.style.transform = `translate(${x - drag.dx}px, ${y - drag.dy}px) rotate(1.5deg)`;
    const under = document.elementFromPoint(x, y);
    const column = under && boardEl.contains(under) ? under.closest("[data-column]") : null;
    if (column !== drag.over) {
      if (drag.over) drag.over.classList.remove("is-over");
      if (column) column.classList.add("is-over");
      drag.over = column;
    }
    // Near the edges of the columns area: scroll it.
    const box = scroller.getBoundingClientRect();
    if (x < box.left + 40) scroller.scrollLeft -= 12;
    else if (x > box.right - 40) scroller.scrollLeft += 12;
  }

  function endDrag(drop) {
    const { card, ghost, over } = drag;
    ghost.remove();
    card.classList.remove("is-dragging");
    if (over) over.classList.remove("is-over");
    drag = null;
    if (drop && over && over !== card.closest("[data-column]")) onDrop(card.dataset.card, over);
  }

  return () => {
    if (drag) endDrag(false);
    cancelPress();
    stop.abort();
  };
}
