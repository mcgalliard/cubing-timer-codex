# Codex Guide for CubeDesk

This file is the handoff for future Codex sessions working on this repository.

## Product intent

CubeDesk is a local-first Rubik's cube timer. Preserve fast keyboard behavior, accurate monotonic timing, and device-local privacy. Avoid adding accounts, analytics, remote persistence, or large dependencies unless the user explicitly requests them.

## Architecture

- `app/page.tsx` is the force-static route wrapper used by GitHub Pages.
- `app/CubeTimer.tsx` is the client application and owns the timer state machine, solve persistence, statistics, graph, and interface.
- `app/lib/scrambles.ts` exports `CubeSize` and `generateScramble(size)` for 3×3 through 7×7.
- `app/globals.css` contains the complete responsive visual system.
- `app/layout.tsx` owns page metadata and fonts.
- `tests/rendered-html.test.mjs` verifies the built server-rendered shell.
- `.openai/hosting.json` intentionally leaves D1 and R2 disabled because solve data is local.
- `.github/workflows/deploy-pages.yml` validates and deploys the static export to GitHub Pages.
- `docs/assets/` contains README screenshots and the timer demo GIF.

## Timer invariants

Treat these as compatibility requirements:

1. From idle, Space must be held for 1,000 ms before the timer arms.
2. Releasing Space while armed starts the solve.
3. The first fresh Space keydown while running stops exactly once.
4. Key repeat events must never start or stop extra solves.
5. A Space keyup following a stop must not start another solve.
6. Use `performance.now()` for elapsed time and `requestAnimationFrame` only for display updates.
7. Persist the final measured time, not a rounded display value.
8. Keep the current scramble unchanged while timing.
9. Cancel an unfinished hold on window blur or document visibility loss.
10. Ignore global Space handling when an interactive or editable control has focus.

## Storage contract

- Solve key: `cubedesk.solves.v1`
- Selected event key: `cubedesk.size.v1`
- Solve shape: `{ id, size, timeMs, scramble, createdAt }`
- Always validate loaded data and keep the timer usable if storage parsing or writing fails.
- Filter views by cube size without discarding solves for other sizes.
- Delete records by stable ID, never by duration or visible array index.

If the persisted shape changes, introduce a new versioned key or an explicit migration; do not silently reinterpret old data.

## Scramble rules

- Supported sizes are exactly 3 through 7.
- Current lengths are 20, 40, 60, 80, and 100 moves respectively.
- Consecutive moves cannot use the same axis.
- 4×4 and larger may use two-layer wide moves; 6×6 and 7×7 may use three-layer wide moves.
- Standard suffixes are plain, prime, or `2`.

## Statistics

- Session mean includes all visible event solves.
- Ao5 and Ao12 are trimmed averages: sort the latest window and remove one fastest and one slowest solve.
- The graph displays up to the latest 30 solves in chronological order.
- Guard the chart against equal min/max values and short histories.

## Required checks

Run all three before committing behavior changes:

```bash
npm test
npm run lint
npm run build
```

The production Pages build sets `GITHUB_ACTIONS=true` automatically. Vite then uses `/cubing-timer-codex/` as its asset base while local development remains at `/`. Do not hard-code the repository prefix into application links.

For timer-state changes, also manually verify short holds, exactly one start, exactly one stop, key repeat, blur cancellation, event switching, deletion, reload persistence, and both pointer and keyboard flows.

## Visual and accessibility guidance

- Preserve the focused dark speedcubing-workstation aesthetic.
- Keep the timer and scramble dominant in the first viewport.
- Maintain visible focus states, semantic controls, tabular numerals, reduced-motion support, and an `aria-live` state announcement.
- Do not rely on color alone for armed/running/stopped states.
- Keep touch targets at least 44×44 px and test narrow layouts before updating README screenshots.

## Documentation assets

When the interface changes materially, recapture:

- `docs/assets/cubedesk-desktop.png`
- `docs/assets/cubedesk-solve.png`
- `docs/assets/cubedesk-demo.gif`

Do not commit temporary frame images. Keep README media reasonably compressed so cloning remains fast.
