# HQ Brand Guidelines — Designer Handoff v1.0

**Scope:** HQ parent identity + QED HQ, Sport HQ, Work HQ and Personal HQ.
**Authoritative source:** User-approved decisions in the design conversation and uploaded HQ logo image.
**Status convention:** **APPROVED** = explicit creative approval; **PROPOSED** = design-system starting value; **PENDING** = production QA or unapproved element.

## 01 — Brand foundations [APPROVED]
**HQ** is a home for your own tools: one digital entry point at **ownhq.app** and distinct purpose-built spaces. It should give people control and clarity, without generic product clutter.

**Brand purpose:** Put the user in control of their own tools, spaces and workflows.
**Positioning:** A calm, coherent home for tools built around specific needs.
**Brand character:** Minimal, premium, precise, technical and calm.
**Desired feeling:** In control and organised.
**Audience:** Initially specific individuals/teams; eventually anyone wanting their own HQ.
**Principles:** Control by design; quiet confidence; one family/many identities; function over decoration; freedom within structure.
**Working tagline:** “Your space. Your system. Your rules.” [PROPOSED, not approved as permanent campaign line].

## 02 — Brand architecture [APPROVED]
- Parent brand: **HQ**. The public domain **ownhq.app** is not the logo name.
- Each product uses `[Name] HQ`: Sport HQ, Work HQ, QED HQ, Personal HQ.
- Known URLs: **qed.ownhq.app**, **sport.ownhq.app**. Work HQ and Personal HQ are planned; do not invent live URLs or launch status.
- Parent visibility is subtle. Each HQ is the star. A central portal and shared HQ switcher connect spaces.
- All HQs share brand fundamentals but are free to use specialised workflows and layouts.

## 03 — Parent monogram [APPROVED creative / PENDING final artwork]
**Newest approved mark** is the user's uploaded integrated H/Q black symbol, not the older “01 Balanced” mark. The original attached 95x97 PNG in `06_References/` is the definitive **visual reference**. Any other older monogram in past packages is **superseded**.

**Approved appearance:** black/charcoal monogram on white; single integrated geometric symbol; no gradients, glow, textures, accent fills, heavy borders or decorative effects.
**Default pairing:** `#242424` on `#FFFFFF`. Pure black in the original raster is acceptable as a reference appearance; the charcoal adjustment is a recommended working reproduction.
**Working SVG:** `HQ_Trace_Provisional_Charcoal_Transparent.svg` is a trace generated from a tiny raster (not an original vector). It must be reviewed and reconstructed at high resolution before being used as an official trademark or commercial master. Do not substitute or call older “01 Balanced” SVGs the current master.
**Dark backgrounds:** white monochrome reverse is allowed provisionally for legibility, with correct clearance. Primary brand usage remains black on white.
**Minimum clear space [PROPOSED]:** use at least 0.25x of the icon’s full width around the drawing in standard compositions. Validate with final geometry.
**Minimum size [PENDING]:** test 16px favicon, 24px switcher, 32px nav, 48px card, 180px mobile icon and 512px PWA. A simplified optical small-size master may be necessary.
**Do not:** stretch; rotate; recolour in product accents; add shadows, strokes or embedded gradients; place over visually busy imagery; pair the old and new master logos.

## 04 — Product identity family [APPROVED creative / PENDING optical QA]
Every HQ has a unique abstract white symbol on a solid muted-colour square. The product symbol is not a recoloured parent HQ monogram.

- Sport HQ: circular sequence / movement / rhythm — purple `#75638F` [APPROVED].
- Work HQ: horizontal modular bars / structure / progress — slate blue `#486B94` [APPROVED].
- QED HQ: three outer nodes meeting at central coordination hub — steel blue `#547B91` [APPROVED, revised concept].
- Personal HQ: diamond enclosure around a central point / identity / ownership — raspberry `#9F597A` [APPROVED].

**Product mark standards [PROPOSED measurements]:** square icon canvas; 8% corner radius; white flat geometry; 14–15% nominal internal padding (optically adjusted); consistent perceived size and stroke mass; no gradients/shadows/3D; test at 16/24/32/48px. The product name should appear as `Sport HQ` (with space), not `SportHQ` in the official lockup.

**Approved arrangements:** symbol + product name horizontal lockup; square symbol only; product name only if the identity is already clear in context. Use Geist Sans semibold for names. Do not alter approved symbols between platforms.

## 05 — Colour system
**APPROVED PRIMARY COLOURS**

| Space | Primary | Character |
|---|---|---|
| Sport HQ | `#75638F` | Muted violet |
| Work HQ | `#486B94` | Slate blue |
| QED HQ | `#547B91` | Dusty steel blue |
| Personal HQ | `#9F597A` | Muted raspberry |

**PROPOSED SUPPORT SHADES** (confirm during real UI QA):
Sport light `#F1EDF5`, dark `#594771`; Work light `#EBF0F6`, dark `#345173`; QED light `#EBF2F5`, dark `#3B6075`; Personal light `#F7EDF1`, dark `#793E5D`.

**PROPOSED LIGHT NEUTRALS:** canvas `#FAFAF9`; surface `#FFFFFF`; subtle `#F2F2F0`; border `#E5E5E3`; primary text `#242424`; secondary text `#666666`.
**PROPOSED DARK NEUTRALS:** canvas `#171819`; surface `#222426`; subtle `#2B2E30`; border `#3B3E40`; primary text `#F4F4F2`; secondary text `#ACB0B2`.

**Colour application:** neutral surfaces dominate. Accents signal primary actions, selected navigation, active control states, limited highlights and brand identification. Pale accent tints are appropriate for low-emphasis content. Never rely on colour alone to communicate success, danger or status.
**Buttons:** use the HQ-specific approved accent with white text after accessibility check. Test hover, disabled, loading, dark mode and focus states independently.
**Compliance target:** WCAG 2.2 AA; standard text contrast >= 4.5:1; non-text essential visual indicators >= 3:1. Primary colours against white are around Sport 5.3:1, Work 5.5:1, QED 4.5:1, Personal 5.0:1 (use included exact calculation table). QED is close to threshold and must not be casually lightened.

## 06 — Typography [APPROVED family / PROPOSED scale]
**Primary:** Geist Sans. Use for headings, navigation, labels, buttons, body text and most numerical displays.
**Secondary:** Geist Mono. Use selectively for code, logs, structured identifiers and fields requiring fixed character widths. Tabular numerals in Geist Sans suffice for most ordinary statistics.
**Weight guideline:** 400 regular, 500 medium, 600 semibold, 700 bold. Avoid uncontrolled weight changes.
**Working desktop/mobile scale (px):** h1 36/28, h2 24/22, h3 18/18, body 16/16, compact UI 14/14, metadata 12/12. Heading line height ~1.25; body ~1.5.
**Font assets:** not bundled. Download legal official distribution and verify license for implementation. Use `font-display: swap`, local fallbacks and correct language glyph coverage.
**No all-caps paragraphs.** Keep line lengths moderate and avoid unnecessarily tight tracking in small UI text.

## 07 — Visual language [APPROVED principle / PROPOSED implementation]
- Soft but restrained, not bulbous: default radius around 8px, small around 6px.
- Solid UI glyph icons, consistent optical weight; do not confuse these with unique brand symbols.
- Clear hierarchy with typography, subtle dividers and whitespace rather than saturated filled cards.
- Generous enough spacing for calm scanning; not excessively sparse. Use a base 4px scale, e.g. 4/8/12/16/20/24/32/40/48/64.
- No default gradients, noisy textures, 3D renders or decorative illustration system. Additional graphic language is not yet approved.
- Product-specific data visualisations may use more colours when required for clarity; do not treat product accents as the only permissible chart colour.

## 08 — Digital product system [APPROVED principle / PROPOSED technical values]
- **Shared top bar** with current product identity, an HQ switcher and navigation. No compulsory sidebar.
- **Both portal and switcher**: ownhq.app acts as directory; user can change HQ within shared navigation where authorised.
- **Information density:** balanced. Use a mix of flat sections and soft cards according to content needs.
- **Desktop and mobile:** equal priority. Mobile may collapse top navigation, but must keep product identity and an accessible HQ switcher.
- **Primary CTA:** product accent; secondary action: neutral. Use clear visual and keyboard focus.
- **Components:** approx. 8px radii, light border `#E5E5E3`, primary buttons 40px visual height desktop / touch area at least ~44px on mobile. Ensure 24x24 minimum pointer targets or adequate spacing under WCAG requirements, subject to exceptions.
- **Motion:** short transitions, often 150–200ms, no gratuitous animations; respect `prefers-reduced-motion`.
- **Interaction states:** base, hover, focus-visible, active, disabled, loading, validation, success, error, empty, offline, responsive.
- **Forms and data:** explicit labels, concise error copy, accessible validation, adequate contrast, visible focus, keyboard navigation, logical tab order.
- **Privacy/access:** no assumption that all users have access to every HQ; portal and switcher should respect account permissions.
- **Dark mode:** optional. Dark tokens and accent adaptations remain pending full contrast testing.

## 09 — Brand voice [APPROVED]
Tone: direct, functional, concise. Prefer instructions that help users act. Avoid marketing exaggeration, motivational clichés, excessive exclamation marks and cute error language.

| Use | Avoid |
|---|---|
| Add session | Let's crush your workout! |
| Activity saved | You're absolutely smashing it! |
| No tasks yet | Your productivity journey begins here |
| Open workspace | Unlock your ultimate productivity |
| Something went wrong. Try again. | Oopsie! A tiny snag! |

Use terminology consistently. "HQ" refers to the ecosystem; "Sport HQ" refers to the product. Never call the corporate brand "ownHQ" in logos or brand descriptions; this is the address, not the visual brand name.

## 10 — Use cases and examples
**Parent site:** white background, black HQ logo, product cards showing each coloured symbol, simple copy and accessible switching.
**QED HQ:** internal tools, useful links and onboarding. Steel-blue primary actions; the QED symbol in header; application-focused sections.
**Sport HQ:** planning, logging, running, gym, races, shoes, body and goals. Purple accent; activity statistics may use Geist Mono only when fixed-width alignment improves scanning.
**Work HQ / Personal HQ:** planned product identities; do not depict unannounced features as existing capabilities. Preserve approved colours and symbol family.

## 11 — Asset and production handoff
`02_Logos/Parent_HQ/` contains the original-approved raster *reference* separately from traced provisional vector assets. Final path construction must be visually matched against the original reference; do not assume tracing from a 95px PNG is suitable for external production.
`02_Logos/Products/` contains approved concepts as SVGs and multiple-size PNGs.
`03_Colour_and_Tokens/` contains source tokens, CSS and contrast table.
`04_Typography/` contains font procurement/implementation notes; no proprietary font files are included.
`05_UI_Examples/` contains a standalone HTML preview. Sample controls are visual, not complete production components.

## 12 — Release QA checklist [PENDING]
- Reconstruct approved parent logo at vector-master quality; compare directly to reference and approve optical adjustments.
- Verify product symbol geometry, equality of optical size and 16px silhouette, especially the complex QED intersection.
- Verify logo padding and clear space in navigation, portal, browser and app manifests.
- Verify WCAG 2.2 AA across actual UI colours: text, non-text boundaries, focus, disabled, hover and dark mode.
- Verify correct font loading and typographic rendering in Chrome, Safari and Firefox, and on mobile devices.
- Verify keyboard navigation, switcher/menu accessibility and reduced-motion handling.
- Finalise semantic tokens; identify and remove placeholder UI examples before launch.
- Conduct logo originality / trademark / domain due diligence before external commercial rollout.
- Capture final approved masters with dates, owner, change log and export checksum.

## 13 — Governance
Brand owner should maintain one canonical master asset library. Any new HQ must have an approved name, product purpose, symbol, muted accent colour different from existing products, accessibility checks, portal/switcher integration and design-token registration. Do not alter parent-logo geometry per product.

**Change log**
- v0.1–0.6: strategic identity, product symbols and palette selected.
- v0.7: initial “01 Balanced” typographic monogram selected.
- **v1.0:** supersedes previous parent master with the user's later-uploaded integrated H/Q logo. Original raster saved as authoritative visual reference. Current package contains provisional trace, approved product marks and consolidated designer specifications.
