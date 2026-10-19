// Custom session (opened from the planner): a session for one day that
// isn't in the catalogue. It uses the catalogue's editor (views/catalogue.js).
//   #/custom/new/<YYYY-MM-DD>  -> new custom session on that day
//   #/custom/<plannedId>       -> edit it

import { renderEditor } from "./catalogue.js?v=202610192113";

export function render(container, { params = [] } = {}) {
  if (params[0] === "new") return renderEditor(container, null, { date: params[1] });
  return renderEditor(container, null, { plannedId: params[0] });
}
