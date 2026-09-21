# Math Forest — rotating level map (design)

Drop-in design artifact for `rajivagarwal/mathQuiz`. Suggested repo location:
`design/math-forest-map/`.

## Files

| File | What it is |
| --- | --- |
| `Math Forest Map.dc.html` | The map screen: infinite bottom-to-top wrap-around scroll, 4 map-lengths long, 28 steps, HUD, progress bar, step detail sheet |
| `MapStep.dc.html` | One step node — number badge + 5 stars on an arc; states: `done` / `current` / `locked` / `milestone` |
| `MathForestLogo.dc.html` | The wooden "Math Forest" sign |
| `assets/forest-tile.jpg` | Seamless vertically-tiling forest background (616×1280) |
| `support.js` | Runtime needed to open the `.dc.html` files directly in a browser |

Open `Math Forest Map.dc.html` in a browser (no build step) to view/interact.

## Behaviour

- Map length = 4 × tile; two identical strips are stacked, the second pinned exactly one
  map-length behind, so scrolling wraps forever with no seam.
- Idle rotation is a CSS animation (compositor-driven); drag, wheel, "Go" and
  tapping a step switch to JS control, then rotation resumes after ~3s idle.
- 7 steps per tile, positions defined by `ANCHORS` (x, y as fractions of a tile).
- Progress model: steps below `currentStep` are complete, one is current, the rest
  locked; every 7th step is a milestone (purple + flag).

## Tunables (props on the map component)

`currentStep` (1–28), `starsPerStep` (3–5), `autoRotate`, `rotateSpeed` (px/s),
`gems`, `coins`.

## Porting notes for the Vite/TS app

The step node, the logo and the map shell are independent; the only shared state is
`currentStep` + per-step `earned` stars, so they map cleanly onto the existing
`src/domain` progress model. Step copy (title + skill focus for all 28 steps) lives in
the `TOPICS` array at the top of the map component's script.
