// bump-version.mjs — stamps a new version number on every app file.
//
// Why: browsers (and GitHub Pages) keep saved copies of files for a while.
// After an update, a phone could mix a NEW planner.js with an OLD rules.js
// and get stuck on "Loading…". Adding "?v=<version>" to every file address
// makes each release use brand-new addresses, so the browser fetches the
// whole new set together.
//
// Run it once before each pull request (from the sporthq3 folder):
//   node tools/bump-version.mjs            -> version = current date+time
//   node tools/bump-version.mjs 2026-10-14 -> version of your choice
//
// It rewrites, in index.html and every file in js/:
//   from "./views/log.js"        -> from "./views/log.js?v=…"
//   src="js/main.js"             -> src="js/main.js?v=…"
//   href="css/style.css"         -> href="css/style.css?v=…"
// Every import of a file must carry the SAME version (otherwise the browser
// loads it twice), which is why a script does it instead of a human.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ""); // 202610141205
const version = process.argv[2] || stamp;

// Local imports only ("./" or "../"), never the supabase CDN address.
const IMPORT = /(from\s*["'])(\.{1,2}\/[^"'?]+\.js)(\?v=[^"']*)?(["'])/g;
const HTML_REF = /((?:src|href)=")((?:js|css)\/[^"?]+\.(?:js|css))(\?v=[^"]*)?(")/g;

function filesIn(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesIn(path) : path.endsWith(".js") ? [path] : [];
  });
}

let changed = 0;
for (const file of [join(root, "index.html"), ...filesIn(join(root, "js"))]) {
  const before = readFileSync(file, "utf8");
  const pattern = file.endsWith(".html") ? HTML_REF : IMPORT;
  const after = before.replace(pattern, (_, start, path, _old, end) => `${start}${path}?v=${version}${end}`);
  if (after !== before) {
    writeFileSync(file, after);
    changed++;
  }
}
console.log(`Version ${version} stamped in ${changed} files.`);
