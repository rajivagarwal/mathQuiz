# Math Flash

A memory game for arithmetic facts, built for one eight-year-old and one phone.

Five true equations appear for 15 seconds. Then, for 30 seconds, the child has
to prove they stuck. Every wrong answer on offer is a near miss — an adjacent
multiple, an off-by-one, a botched borrow — so getting one right means having
actually remembered it, not reasoning it out.

## The map

Opening the app lands on a path of steps. A step is cleared by getting all five
facts right in one go, which wins up to five gold coins — one fewer for every
retry, never below one. Every fifth step also wins a diamond, and the header
counts both.

Anything short of a clean sweep brings the same five facts back. They are not
tied to the step: the step is just where the child is, and a fresh session
deals a fresh hand at full price. That also means closing and reopening the app
is the way past a step that will not fall — worth knowing, since nothing else
lets a child move on.

Only the coins won at each finished step are stored. The step reached, the
total and the diamonds all follow from that list. The five facts being worked
on and the attempt count are deliberately held in memory alone, which is what
makes a relaunch reset the price.

## The look

The map and the whole app are built from the design in `design/math-forest-map`,
a Claude Design export: the forest tile, the level badges with their star arcs,
the carved sign and the wooden HUD all come from there. The app has one fixed
identity rather than following the device's light or dark theme, because a
painted backdrop cannot invert.

Screens other than the map are parchment panels framed in wood, sitting on the
forest floor. Two typefaces carry it: Baloo 2 for everything the child reads,
and Bricolage Grotesque for the equations alone, because it has tabular figures
and that is what keeps the operators and equals signs in columns.

### Replacing the scenery

`public/scenery/forest-tile.jpg` is the map's backdrop. A replacement must be:

- **Scenery only** — the steps are positioned in code from anchor points, so a
  painted path would drift away from them within a screen.
- **Vertically tileable**, with the same 616 x 1280 proportions. Step positions
  are fractions of a tile, so changing the ratio moves every step off the trail.
- **Clear down the middle**, where the steps sit.

## Two game types

The child picks one on the home screen. Both study the same five facts and both
feed the same spaced-repetition records, so the choice changes how a round is
played, not what it teaches.

**Find the five.** Each equation reappears beside three fakes sharing its
left-hand side — twenty cards in all. The four candidates for `7 × 8` stay
clustered together under one rule, so they can be weighed against each other
rather than hunted for. Selections are silent and reversible until Done; a fact
counts only if its true card was picked and neither fake was.

**Drag the answers.** The equations come back with their answers removed, and
the answers return as eight loose tiles — the five real ones plus three spares.
Without the spares the last tile would place itself, and part of the round could
be solved by elimination instead of memory. Spares are drawn from the near-misses
of the equations on offer and never equal a real answer, which would make them a
valid placement somewhere else.

The equations are reordered between studying and playing, so where one sits on
screen never carries its answer.

Placements are final: a tile turns green or red the moment it lands and stays
put. That is what keeps instant feedback a verdict rather than a hint — trying
tiles until one sticks cannot rescue the score. Tiles can be dragged or, for
small hands and keyboards, tapped once to arm and once to place.

Everything runs on the device. No backend, no accounts, no network after the
first load.

## Running it

```sh
npm install
npm run dev       # development server
npm test          # 206 unit tests over the domain and storage layers
npm run build     # type check, then production bundle into dist/
npm run preview   # serve the production build at /mathQuiz/
```

## Deploying

Push to `main`. The workflow in `.github/workflows/deploy.yml` runs the tests,
builds, and publishes to GitHub Pages. Enable Pages once under
**Settings → Pages → Source: GitHub Actions**.

Two things to know:

- `base` in `vite.config.ts` is `/mathQuiz/` and must match the repository name.
  Rename the repo and the app serves a blank page until this changes too.
- The parent lock uses WebAuthn, which requires a secure origin. It works on the
  Pages HTTPS URL and on `localhost`, and not from a file opened directly.

On the phone, open the Pages URL and use **Add to Home Screen**. The service
worker precaches the whole shell, fonts included, so it runs offline afterwards.

## How the facts work

243 facts, 81 per operation:

| Operation | Definition |
| --- | --- |
| Multiplication | `a × b`, both 1–9 |
| Addition | `a + b`, both 1–9 |
| Subtraction | `a − b = c` where the subtrahend and the answer are both 1–9 |

Subtraction is generated from `(subtrahend, answer)` rather than filtered from
`(minuend, subtrahend)`. That makes "the answer is always one digit, the minuend
at most two" true by construction: `a = b + c` cannot exceed 18.

`7 × 8` and `8 × 7` are tracked as separate facts.

## How a fact becomes learned

Three correct answers on three **different** calendar days. A fact earns at most
one credit per day, so it cannot be ground to mastery in a single sitting. Any
wrong answer resets the streak to zero and demotes a learned fact back.

Facts are drawn by weight: struggling ones at 8 (rising to 20 after repeated
misses), unseen ones at 4, learned ones at 1. Anything asked in the last three
rounds is halved, so the same handful does not repeat back to back.

## Timings

Study and recall durations are set in the **Parents** area, behind the lock.
They ship at 15 seconds to study and 30 to find, and are stored per device.

## What is stored

In `localStorage`, under `mathquiz.v1.*`: the fact records, the last 500 rounds,
the two timer settings, and the parent lock handle. Progress and parent stats
are derived on read, so there is no second copy to drift out of sync. Every read
validates and falls back; every write failure degrades to an in-memory store and
tells the player that progress is not being saved.

## About the parent lock

It is a child-proof gate, not security. There is no server to verify the
WebAuthn assertion against, so the check happens in the page and anyone with
devtools can step past it. Against an eight-year-old it is entirely sufficient,
and nothing behind it is sensitive.

There is no lockout risk either: the credential handle lives in `localStorage`,
so clearing site data removes the enrolment along with the data it guards, and
the app returns to first-run. On a device with no platform authenticator in the
browser, it enrols a 6-digit PIN instead.

## Layout

```
src/
  domain/     facts, distractors, scheduler, round grading, stats — pure, fully tested
  storage/    typed localStorage wrapper with schema version and safe-mode fallback
  auth/       WebAuthn enrolment and verification
  ui/         countdown plus one module per screen
  app.ts      wiring and the round state machine
```

`domain/` and `storage/` hold everything that is easy to get subtly wrong and
impossible to eyeball, and they carry the tests. The UI layer stays thin enough
to verify by looking at it.
