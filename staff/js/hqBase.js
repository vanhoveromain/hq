// hqBase.js: where Staff HQ loads the shared hq login file from.
//
//   staff.ownhq.app          (live)      -> https://ownhq.app/
//   staff-preview.ownhq.app  (test copy) -> https://hq-preview.ownhq.app/
//   localhost                (serve.py)  -> /_hq/

const HOST = window.location.hostname;

export const ON_OWNHQ = /(^|\.)ownhq\.app$/.test(HOST);
export const IS_PREVIEW = HOST === "staff-preview.ownhq.app";

export const HQ_BASE = IS_PREVIEW
  ? "https://hq-preview.ownhq.app/"
  : ON_OWNHQ ? "https://ownhq.app/" : "/_hq/";
