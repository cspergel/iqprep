# Building a subtest module (Brain Camp)

Brain Camp is a static React + TypeScript (Vite) web app: playful practice for the thinking skills that
WISC-V-style assessments measure. First user: a 7-year-old. Everything runs in the browser (no backend).

## Read first
- `src/core/types.ts` — the contracts (`Item`, `SubtestModule`, `PlayerProps`, `GenerateRequest`, `ScoreOutcome`).
- `src/core/subtestInfo.ts` — names, kid names, discontinue rules, time limits (owned by the lead; don't edit).
- `src/core/rng.ts` — seeded RNG. **Never use `Math.random` in generators.**
- `src/core/speech.ts` — TTS (`speakText`, `speakSequence`). Players also receive a `speak` prop.
- `src/ui/kit.tsx` — `ChoiceGrid`, `NumberPad`, `PipSays`, `Mascot`, `Stars`, `useCountdown`, `TimerBar`.
- `src/ui/shapes.tsx` — shared SVG shapes (`ShapeGlyph`, `Shape`, colours, fills).
- `src/styles/global.css` — classes: `.stage .prompt .card .btn(.primary/.go/.ghost/.small/.big) .choices .choice .entry .pad .chip .hint`.
- **Reference module: `src/subtests/DS/index.tsx` and `DS.test.ts`.** Copy its layout.
- Research notes (may still be being written): `docs/research/wisc-v-reference.md`.

## Rules
1. Only create/modify files inside your assigned `src/subtests/<ID>/` folders (plus a shared helper
   folder you were explicitly given, e.g. `src/subtests/_verbal/`). Do **not** edit `src/core`, `src/ui`,
   `src/styles`, or other agents' folders. If you truly need a core change, describe it in your final report.
2. `src/subtests/<ID>/index.tsx` must `export default` a `SubtestModule`, and also export
   `generate`, `score`, `Player`, `guide` by name.
3. **Original content only.** Never reproduce real WISC-V items. Mimic format, not content.
4. **Difficulty** is age-equivalent years (≈4–17): a typical child of that age passes ~50%. The generator
   must accept any value in 3–18, build an item close to it, and set `item.difficulty` to the *actual*
   difficulty of what it built (as DS does). Higher requested difficulty ⇒ harder item, monotonically.
   The first user is 7, so make the 4–10 range especially rich and varied; still cover up to 16+.
5. **Exactly one correct answer.** Distractors must be plausible but definitively wrong. Verify this in
   tests over hundreds of seeds (write a solver/checker where needed).
6. Determinism: same `(difficulty, seed, variant, age)` ⇒ identical item.
7. `score(item, null)` ⇒ 0 points (timeout/skip). Put process measures in `meta` (numbers only).
8. Kid UX (ages 6–8 first): big touch targets (≥56px), minimal reading, friendly words, works from
   360px-wide phones to desktops, no horizontal scroll. Use `ChoiceGrid` for choices. Use emoji for
   pictures (prefer widely supported emoji, Unicode ≤ 13). Give elements aria-labels.
9. The **runner** (not the player) shows the item's timer, hint button, read-aloud button, feedback
   panel and explanation. So power-item players must NOT render their own timer or explanation text.
   Players must NOT auto-speak the prompt (the runner does that in tutor mode) — except for tasks where
   listening *is* the task (Arithmetic, Letter–Number), which call `speak(text, { force: true })` or
   `speakSequence` themselves, with a visible "hear it again"/start button pattern like DS.
10. **Speeded subtests** (one timed sheet) run their own clock with `useCountdown`, show a start screen
    with a short untimed practice (2–3 examples with feedback), then the timed sheet; submit
    automatically when time is up or the sheet is finished. Set `item.timeLimitSec` to the sheet length.
    Response/score must give `points` = raw score and `meta` = `{ correct, errors, durationSec }` where
    `durationSec` is the actual elapsed seconds.
11. When `reveal` is set: lock input and show the correct answer and the child's choice (ChoiceGrid's
    `reveal` prop does this for choice-based items).
12. `hintLevel` ≥ 1 means the child asked for a hint: players may add a visual scaffold (e.g. highlight
    the rows of a matrix, outline blocks), optional but great for teaching.
13. `item.hints` (gentle → specific), `item.explanation` (kid language, 1–3 sentences), optional
    `item.steps` (worked solution) are required teaching content. `item.speak` = the instruction read aloud.
14. `item.skills` — stable tags like `mr:progression`, `fw:substitution`. These drive the
    "what to practise" analytics, so tag the specific reasoning the item exercises.
15. `guide` (SubtestGuide): kid intro, how to play, 4–6 genuinely useful strategies, parent notes
    (what it measures, which index), common mistakes, everyday off-screen activities.
16. Tests: `src/subtests/<ID>/<ID>.test.ts` with real assertions on real outputs — determinism,
    monotone difficulty, answer uniqueness across many seeds, scoring of right/wrong/partial/null,
    variant handling. A test must fail if the code it checks is broken. No asserting constants you set.
17. Before finishing: `npx vitest run src/subtests/<ID>` and `npx tsc --noEmit -p .` must pass for your
    files (other agents work in parallel; ignore errors that are only in their folders).
18. Keep the styling consistent with the kit: thick ink outlines (`var(--ink)`, 3px), rounded corners,
    the CSS variables in global.css. SVG for diagrams.
