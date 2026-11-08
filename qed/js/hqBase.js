// hqBase.js: where QED HQ loads the shared hq files (login, HQ switcher) from.
//
//   qed.ownhq.app          (live)      -> https://ownhq.app/
//   qed-preview.ownhq.app  (test copy) -> https://hq-preview.ownhq.app/
//       Vercel publishes the working branch there, so a test version of QED
//       HQ uses the test version of the login file, and the live sites stay
//       untouched. You still log in on the normal ownhq.app (same cookies).
//   localhost              (serve.py)  -> /_hq/

const HOST = window.location.hostname;

export const ON_OWNHQ = /(^|\.)ownhq\.app$/.test(HOST);
export const IS_PREVIEW = HOST === "qed-preview.ownhq.app";

export const HQ_BASE = IS_PREVIEW
  ? "https://hq-preview.ownhq.app/"
  : ON_OWNHQ ? "https://ownhq.app/" : "/_hq/";
