# Question-type coverage vs the WISC-V formats

The left column lists the item formats the real test uses, from public descriptions (see
`docs/research/wisc-v-reference.md`). The right column lists what Brain Camp generates (original
items only). Regenerate the live catalog with `npm run audit:catalog`.

| Subtest | Real formats (public descriptions) | Brain Camp question types (difficulty in age-years) |
|---|---|---|
| **Similarities** | Verbal pairs, scored 0/1/2: category / function / property / abstract | `si:category` 4–15.5 · `si:function` 5–12.5 · `si:property` 5–11 · `si:abstract` 10–16 (121 items) |
| **Vocabulary** | Picture naming (items 1–4), then oral definitions scored 0/1/2 | `vc:picture` 4–6.5 · `vc:noun` · `vc:verb` · `vc:adjective` 4–16 · `vc:abstract` 10.5–16 (160 items) |
| **Information** | General-knowledge questions, 0/1 | nature · body · science · time (5–15) · numbers · geography · world · history (198 items) |
| **Comprehension** | Practical and social "why" questions; two-concept items need two different reasons | safety · health · social · rules · civic; two-reason items weighted toward older ages (115 items) |
| **Block Design** | Model items (young), 2-block, 4-block, 9-block; diamond designs; time limits | `bd:model` 4–6.6 · `bd:two-block` 4–5 · `bd:2x2` 5.5–11 · `bd:3x3` 11–16.6 · `bd:rotated` (diamond) 9.4–16.6 · `bd:diagonal` |
| **Visual Puzzles** | Choose 3 of 6 pieces; mental rotation, no flips; 30 s | `vp:rect` 4.6–5.8 · `vp:irregular` · `vp:rotation` · `vp:mirror-trap` 9.5–16 |
| **Matrix Reasoning** | 2×2, 3×3 and serial items; 5 options | `mr:pattern-row` 3.5–5.5 · `mr:analogy` · `mr:series` 6–15 · `mr:progression` · `mr:constant` · `mr:distribution` · `mr:position` · `mr:multi-rule` · `mr:overlay` · `mr:count` |
| **Figure Weights** | 1, 2 and 3 scales; substitution, multiplication; 20 s / 30 s | `fw:direct` 4.5–7 · `fw:combine` · `fw:multiply` · `fw:substitution` 8–16.5 · `fw:multi-step` 10.5–16.5 · `fw:subtract` 12–16.5 |
| **Picture Concepts** | 2–3 rows; pick one per row sharing a concept | `pc:category` · `pc:function` · `pc:property` · `pc:abstract` · `pc:three-rows` 7.5+ |
| **Arithmetic** | Picture items (early), then oral word problems; 30 s; mental only | count · add · subtract · compare · two-step · time · money · multiply · divide · missing part · fraction · rate · percent · average · ratio; listening-only in challenges |
| **Digit Span** | Forward, backward and sequencing; 2 trials per span | `ds:forward` · `ds:backward` · `ds:sequencing` (two trials per span in test mode) |
| **Picture Span** | Pictures shown 3 s / 5 s, then picked in order from distractors; 2/1/0 scoring | `ps:recognition` · `ps:order` (2/1/0 scoring, same-family foils) |
| **Letter–Number Sequencing** | Numbers ascending, then letters alphabetical; letters-first also credited; 3 trials per span | numbers-only (young) · `ln:numbers-first` · `ln:letters-sort` (letters-first credited) |
| **Coding** | A (under 8): shapes with marks; B (8+): digits → symbols; 120 s | Version A / B by age; key always visible |
| **Symbol Search** | A: 1 target / 3 symbols; B: 2 targets / 5; correct − incorrect; set and rotation errors | A / B by age; look-alikes split into changed-part (set error) and turned/mirrored (rotation error) |
| **Cancellation** | Random layout, then structured rows; 45 s each; animals among objects | `ca:random` · `ca:structured` |
| **Naming Speed Literacy** | Age 6: colour–object and size–colour–object; 7–8: size–colour–object and letter–number; 9+: letter–number | Same age structure; grown-up-timed (spoken) or tap mode |
| **Naming Speed Quantity** | Name the quantity in each box | 1–4 squares (under 7), 1–5 (7+) |
| **Symbol Translation (IST/DST/RST)** | Learn symbol→word pairs, read symbol sentences; delayed recall; recognition | Shared code book per session; teach cards; delayed and recognition forms |

## Quality guards (automated)

- **Exactly one correct answer.** Brute-force checkers run for Matrix Reasoning (including series), Figure Weights (every consistent weighting), Visual Puzzles (every 3-piece tiling) and Picture Concepts (every one-per-row combination).
- **No test-taking shortcuts** (`npm run audit:cues`):
  - Word games: the best answer is the longest choice only 19–27% of the time and the shortest 23–36% of the time. A test enforces this.
  - Matrix Reasoning: picking the "most typical" option succeeds only ~24% of the time (chance is 20%).
  - Figure Weights: the answer's weight rank is spread across lightest to heaviest. A test enforces this.
  - Answer positions are uniform across A–E in every multiple-choice game.
- **Robustness** (`npm run audit:stress`): every generator survives thousands of seeds across all difficulties and ages without errors.
- **Reproducibility:** any item can be recreated from (subtest, difficulty, seed, variant). Question Gallery flags store exactly this.

## Format fidelity (from `docs/research/format-study.md`, public sources only)

- **Teaching sequence in challenges.** Each block runs demonstrate (Pip) → sample item with feedback (not scored) → scored items. The first two scored items of SI, VC, CO, MR, FW, VP, PC, BD and PS are teaching items that show the answer after a miss.
- **Examiner timing.** A "Do you have an answer?" prompt appears for VP at 20 s, FW at 10 s before the limit, and MR/PC at 30 s. FW, VP and AR have hard limits. MR, PC and BD have soft limits. VP submits on the third pick in tests. AR's clock allows for reading time, and repeats are allowed only on harder items.
- **Response conventions.**
  - Options are numbered 1–n in fixed layouts: MR/FW in one row of 5, VP in 2×3, PC numbered across rows.
  - The colour-blind-safe palette is red, blue, yellow and black.
- **Verbal subtests are say-it-first.** The question is heard, and in tests nothing is printed (VC words never appear). The child answers aloud, then picks the closest choice, or a grown-up scores 0/1/2 from a rubric.
- **Coding is drawn.** The child draws with a finger or stylus, like paper. Strokes are recognised, with rotation errors. Tap mode is optional and its score is reduced, because tap-based Coding inflates scores.
- **Block Design.**
  - Model items give 2 trials (2/1/0).
  - Harder items use an open build board, which records dimension errors.
  - 2×2 diamond designs appear in mid-range items.
- **Picture Span.** A recurring picture pool across the block; earlier targets come back as distractors (proactive interference).
- **Symbol Translation.** The child builds sentences from spoken word tiles. RST options are read aloud.
- **Speed tasks.**
  - NSL has the age-appropriate formats and two trials, with no green.
  - SS shows one active row with faded neighbours, and its samples must be passed.
  - CA has quadrant-balanced targets and animal-related foils (bone, paw prints…).
