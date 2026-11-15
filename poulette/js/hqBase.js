// hqBase.js: where Poulette HQ loads the shared hq files (login, HQ switcher) from.
//
//   poulette.ownhq.app          (live)      -> https://ownhq.app/
//   poulette-preview.ownhq.app  (test copy) -> https://hq-preview.ownhq.app/
//       Vercel publishes the working branch there, so a test version of
//       Poulette HQ uses the test version of the login file; live stays untouched.
//   localhost                   (serve.py)  -> /_hq/

const HOST = window.location.hostname;

export const ON_OWNHQ = /(^|\.)ownhq\.app$/.test(HOST);
export const IS_PREVIEW = HOST === "poulette-preview.ownhq.app";

export const HQ_BASE = IS_PREVIEW
  ? "https://hq-preview.ownhq.app/"
  : ON_OWNHQ ? "https://ownhq.app/" : "/_hq/";
