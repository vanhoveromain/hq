// toast.js — a small message at the bottom of the screen that disappears
// by itself, optionally with one button (e.g. "Undo").
//
//   showToast("Linked to your planned Leg workout", { actionLabel: "Undo", onAction: () => … });

let current = null;

export function showToast(message, { actionLabel, onAction, seconds = 6 } = {}) {
  if (current) current.remove(); // only one toast at a time

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  const text = document.createElement("span");
  text.textContent = message;
  toast.appendChild(text);

  if (actionLabel && onAction) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = actionLabel;
    button.addEventListener("click", () => {
      toast.remove();
      onAction();
    });
    toast.appendChild(button);
  }

  document.body.appendChild(toast);
  current = toast;
  setTimeout(() => toast.remove(), seconds * 1000);
}
