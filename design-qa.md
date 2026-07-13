# Relay design QA

## Selected direction

- Primary Dashboard reference: `/Users/ashterhaider/.codex/generated_images/019f5d0d-2660-7701-98dc-4fc5f45f6b06/exec-fdc648a2-eb2b-4924-ae4a-020a25ba2dd4.png`
- Secondary Reviews reference: `/Users/ashterhaider/.codex/generated_images/019f5d0d-2660-7701-98dc-4fc5f45f6b06/exec-1117d6be-c8b8-4099-895c-66c8825b2114.png`
- Implementation: `http://127.0.0.1:5173/`
- Reference and implementation comparison viewport: 1487 x 1058

The implementation follows the references' restrained dark palette, compact
sidebar, blue interaction accent, fine borders, type hierarchy, allocation
bar, thesis-state colors, and evidence-first decision language. Relay's real
seven-thesis dataset and per-holding rationale requirements make the finished
screens taller than the concept images; the hierarchy and visual language are
preserved while the content remains complete and usable.

## Comparison evidence

- Dashboard final screenshot: `/Users/ashterhaider/.codex/visualizations/2026/07/13/019f5d0d-2660-7701-98dc-4fc5f45f6b06/relay-final/dashboard-desktop-final.png`
- Dashboard side-by-side comparison: `/Users/ashterhaider/.codex/visualizations/2026/07/13/019f5d0d-2660-7701-98dc-4fc5f45f6b06/relay-final/dashboard-comparison-final.png`
- Reviews final screenshot: `/Users/ashterhaider/.codex/visualizations/2026/07/13/019f5d0d-2660-7701-98dc-4fc5f45f6b06/relay-final/reviews-desktop-final.png`
- Reviews side-by-side comparison: `/Users/ashterhaider/.codex/visualizations/2026/07/13/019f5d0d-2660-7701-98dc-4fc5f45f6b06/relay-final/reviews-comparison-final.png`
- Dashboard mobile: `/Users/ashterhaider/.codex/visualizations/2026/07/13/019f5d0d-2660-7701-98dc-4fc5f45f6b06/relay-final/dashboard-mobile-390x844.png`
- Theses mobile: `/Users/ashterhaider/.codex/visualizations/2026/07/13/019f5d0d-2660-7701-98dc-4fc5f45f6b06/relay-final/theses-mobile-390x844.png`
- Reviews mobile: `/Users/ashterhaider/.codex/visualizations/2026/07/13/019f5d0d-2660-7701-98dc-4fc5f45f6b06/relay-final/reviews-mobile-390x844.png`
- Dashboard tablet: `/Users/ashterhaider/.codex/visualizations/2026/07/13/019f5d0d-2660-7701-98dc-4fc5f45f6b06/relay-final/dashboard-tablet-768x1024.png`

## QA history

### Pass 1

- Fixed an explicit-association error that made the Space thesis inherit
  unrelated companies from a shared infrastructure layer.
- Added canonical thesis, portfolio, and review-evidence loading/error/retry
  states so transient requests cannot masquerade as empty product states.
- Corrected review chronology, a legacy brief redirect, pluralization, and two
  sub-44px mobile targets.
- Added regression tests for each issue in commit `9d008c1`.

### Final pass

- Desktop (1487 x 1058), tablet (768 x 1024), and mobile (390 x 844) render
  without horizontal overflow, clipping, overlapping controls, or broken text
  wrapping.
- Dashboard, Theses, Reviews, Evidence, Sources, Daily readout, search, legacy
  redirects, desktop navigation collapse, and mobile drawer open/close states
  were exercised in the in-app browser.
- The mobile drawer receives focus on open; Escape closes it and restores focus
  to the menu button. The focus-trap implementation and landmarks were also
  inspected. Search receives focus and closes with Escape.
- A seeded review was accepted on an isolated temporary database with separate
  VOO, SMH, and TSM actions, three rationales, and a next-review date. The
  resulting decision history and all values persisted after reload.
- Browser console review found no warnings or errors. The final fresh demo
  database was left unmodified for handoff.
- Contrast, semantic status labels, visible focus treatment, fieldsets, native
  labels, reduced-motion behavior, 44px primary targets, and responsive bottom
  navigation were checked. No P0, P1, or P2 visual/accessibility defects remain.

Final result: passed
