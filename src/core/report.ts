/**
 * Turns answered items into a WISC-style practice report: subtest scaled scores, composites,
 * process scores, skill breakdowns and plain-language insights.
 */
import {
  ageEquivalent, classifyScaled, computeProfile, estimateAbility, percentileRank, scaledFromSpeeded, scaledFromTheta,
  type Classification, type ProfileScores,
} from './scoring';
import { COMPOSITES, SUBTESTS, ZONES } from './subtestInfo';
import type { ItemResult, PrimaryIndexId, SubtestId } from './types';

export interface SubtestScore {
  id: SubtestId;
  items: number;
  raw: number;
  maxRaw: number;
  correct: number;
  scaled: number;
  /** Complementary subtests are reported as standard scores (mean 100, SD 15). */
  standard?: number;
  theta?: number;
  ageEquivalent?: string;
  percentile: number;
  classification: Classification;
  /** ±1.96 SE band in scaled points. */
  band: [number, number];
  avgSeconds: number;
  hintsUsed: number;
  overTime: number;
}

export interface ProcessScore {
  id: string;
  label: string;
  value: number;
  kind: 'scaled' | 'raw';
  note?: string;
}

export interface SkillLine {
  skill: string;
  label: string;
  subtest: SubtestId;
  attempts: number;
  correct: number;
  accuracy: number;
}

export type InsightKind = 'strength' | 'growth' | 'observation' | 'celebrate';

export interface Insight {
  kind: InsightKind;
  title: string;
  text: string;
  subtest?: SubtestId;
  index?: PrimaryIndexId;
}

export interface SessionReport {
  age: number;
  subtests: Partial<Record<SubtestId, SubtestScore>>;
  profile: ProfileScores;
  process: ProcessScore[];
  skills: SkillLine[];
  insights: Insight[];
  totals: { items: number; correct: number; minutes: number; hints: number };
}

// ---------- skill labels ----------

const SKILL_WORDS: Record<string, string> = {
  'si:category': 'Naming the group two things belong to', 'si:function': 'Seeing what things are used for',
  'si:property': 'Spotting shared features', 'si:abstract': 'Linking big ideas',
  'vc:picture': 'Naming pictures precisely', 'vc:noun': 'Defining things', 'vc:verb': 'Defining actions',
  'vc:adjective': 'Defining describing words', 'vc:abstract': 'Defining idea words',
  'mr:pattern-row': 'Continuing a pattern', 'mr:analogy': 'Picture analogies', 'mr:progression': 'Step-by-step changes',
  'mr:distribution': 'One-of-each patterns', 'mr:overlay': 'Adding/subtracting shapes', 'mr:count': 'Counting rules',
  'fw:direct': 'Matching weights', 'fw:substitution': 'Swapping equal weights', 'fw:multi-step': 'Multi-step balancing', 'fw:combine': 'Combining weights',
  'ar:count': 'Counting', 'ar:add': 'Adding in your head', 'ar:subtract': 'Taking away', 'ar:two-step': 'Two-step stories',
  'ar:multiply': 'Groups of (multiplying)', 'ar:divide': 'Sharing (dividing)', 'ar:money': 'Money', 'ar:time': 'Time',
  'ar:fraction': 'Fractions', 'ar:percent': 'Percents', 'ar:rate': 'Rates',
  'bd:solid': 'Solid-colour blocks', 'bd:diagonal': 'Half-and-half (diagonal) blocks', 'bd:2x2': '4-block designs',
  'bd:3x3': '9-block designs', 'bd:rotated': 'Tilted designs',
  'vp:rect': 'Simple puzzle shapes', 'vp:rotation': 'Turning pieces in your head', 'vp:irregular': 'Tricky puzzle shapes', 'vp:mirror-trap': 'Spotting flipped pieces',
  'pc:category': 'Finding the group', 'pc:function': 'Finding what things do', 'pc:property': 'Finding shared features', 'pc:abstract': 'Finding hidden links',
  'ds:forward': 'Numbers forward', 'ds:backward': 'Numbers backward', 'ds:sequencing': 'Numbers in order',
  'ps:order': 'Remembering picture order', 'ps:recognition': 'Remembering which pictures',
  'ln:numbers-first': 'Numbers before letters', 'ln:letters-sort': 'Letters in ABC order',
  'st:learn': 'Learning symbols', 'st:delayed': 'Remembering symbols later', 'st:recognition': 'Recognising symbols', 'st:function-words': 'Little symbol words',
  'in:nature': 'Animals & nature', 'in:body': 'The human body', 'in:science': 'Science', 'in:time': 'Time & calendar',
  'in:numbers': 'Numbers & measuring', 'in:geography': 'Places & maps', 'in:world': 'Everyday world', 'in:history': 'History & people',
  'co:safety': 'Staying safe', 'co:health': 'Staying healthy', 'co:social': 'Getting along with others', 'co:rules': 'Why we have rules', 'co:civic': 'How communities work',
};

export function skillLabel(skill: string): string {
  if (SKILL_WORDS[skill]) return SKILL_WORDS[skill];
  const [prefix, rest = ''] = skill.split(':');
  const sub = SUBTESTS[prefix.toUpperCase() as SubtestId];
  const words = rest.replace(/[-_]/g, ' ');
  return sub ? `${sub.kidName}: ${words}` : words || skill;
}

// ---------- scoring helpers ----------

function effectivePoints(r: ItemResult, timed: boolean): number {
  return timed && r.overTime ? 0 : r.points;
}

function powerScore(rs: ItemResult[], age: number, timed: boolean) {
  const est = estimateAbility(rs.map((r) => ({ difficulty: r.difficulty, points: effectivePoints(r, timed), maxPoints: r.maxPoints })), age);
  return { est, scaled: scaledFromTheta(est.theta, age) };
}

function speededScaled(id: SubtestId, rs: ItemResult[], age: number): number {
  const raw = rs.reduce((a, r) => a + r.points, 0);
  const dur = rs.reduce((a, r) => a + (r.meta?.durationSec ?? SUBTESTS[id].defaultTimeLimitSec ?? 120), 0);
  return scaledFromSpeeded(id, raw, age, Math.max(1, dur));
}

export function buildReport(results: ItemResult[], age: number, opts: { timed: boolean }): SessionReport {
  const bySub = new Map<SubtestId, ItemResult[]>();
  for (const r of results) {
    if (!bySub.has(r.subtest)) bySub.set(r.subtest, []);
    bySub.get(r.subtest)!.push(r);
  }

  const subtests: Partial<Record<SubtestId, SubtestScore>> = {};
  const scaledMap: Partial<Record<SubtestId, number>> = {};
  for (const [id, rs] of bySub) {
    const info = SUBTESTS[id];
    let scaled: number;
    let theta: number | undefined;
    let se = 1.2;
    if (info.kind === 'speeded') {
      scaled = speededScaled(id, rs, age);
    } else {
      const p = powerScore(rs, age, opts.timed);
      scaled = p.scaled;
      theta = p.est.theta;
      // SE of theta converted to scaled points.
      se = Math.max(0.8, (3 * p.est.se) / (0.22 * age + 0.2));
    }
    scaledMap[id] = scaled;
    const equivalentComposite = 100 + 5 * (scaled - 10);
    subtests[id] = {
      id,
      items: rs.length,
      raw: rs.reduce((a, r) => a + effectivePoints(r, opts.timed), 0),
      maxRaw: rs.reduce((a, r) => a + r.maxPoints, 0),
      correct: rs.filter((r) => r.correct).length,
      scaled,
      standard: info.tier === 'complementary' ? Math.round(equivalentComposite) : undefined,
      theta,
      ageEquivalent: theta !== undefined ? ageEquivalent(theta) : undefined,
      percentile: percentileRank(scaled, 10, 3),
      classification: classifyScaled(scaled),
      band: [Math.max(1, Math.round(scaled - 1.96 * se)), Math.min(19, Math.round(scaled + 1.96 * se))],
      avgSeconds: rs.reduce((a, r) => a + r.timeMs, 0) / rs.length / 1000,
      hintsUsed: rs.reduce((a, r) => a + r.hintsUsed, 0),
      overTime: rs.filter((r) => r.overTime).length,
    };
  }

  const profile = computeProfile(scaledMap);
  const process = processScores(bySub, age, opts.timed);
  const skills = skillLines(results);
  const insights = makeInsights({ subtests, profile, process, skills, results, age, timed: opts.timed });
  return {
    age,
    subtests,
    profile,
    process,
    skills,
    insights,
    totals: {
      items: results.length,
      correct: results.filter((r) => r.correct).length,
      minutes: Math.round(results.reduce((a, r) => a + Math.min(r.timeMs, 180_000), 0) / 60000),
      hints: results.reduce((a, r) => a + r.hintsUsed, 0),
    },
  };
}

function processScores(bySub: Map<SubtestId, ItemResult[]>, age: number, timed: boolean): ProcessScore[] {
  const out: ProcessScore[] = [];
  const bd = bySub.get('BD');
  if (bd && timed && bd.some((r) => r.overTime)) {
    const noTime = powerScore(bd, age, false).scaled;
    out.push({ id: 'BDn', label: 'Block Design — no time limit', value: noTime, kind: 'scaled', note: 'Credit for designs finished correctly even after the time limit.' });
  }
  if (bd) {
    const rot = bd.reduce((a, r) => a + (r.meta?.rotationError ?? 0), 0);
    out.push({ id: 'BDre', label: 'Block Design rotation errors', value: rot, kind: 'raw' });
    const dim = bd.reduce((a, r) => a + (r.meta?.dimensionError ?? 0), 0);
    if (bd.some((r) => r.meta?.dimensionError !== undefined)) {
      out.push({ id: 'BDde', label: 'Block Design dimension errors', value: dim, kind: 'raw', note: 'The build spread wider or taller than the design.' });
    }
    const second = bd.filter((r) => r.meta?.trial === 2 && r.correct).length;
    if (second) out.push({ id: 'BDt2', label: 'Block Design: right on the second try', value: second, kind: 'raw', note: 'Model items solved after Pip showed the model again.' });
  }
  const ds = bySub.get('DS');
  if (ds) {
    const tasks: [string, string, string][] = [['forward', 'DSf', 'Forward'], ['backward', 'DSb', 'Backward'], ['sequencing', 'DSs', 'Sequencing']];
    for (const [task, id, label] of tasks) {
      const rs = ds.filter((r) => r.skills.includes(`ds:${task}`));
      if (!rs.length) continue;
      out.push({ id, label: `Digit Span ${label}`, value: powerScore(rs, age, timed).scaled, kind: 'scaled' });
      const longest = Math.max(0, ...rs.filter((r) => r.correct).map((r) => r.meta?.span ?? 0));
      out.push({ id: `L${id}`, label: `Longest span ${label.toLowerCase()}`, value: longest, kind: 'raw' });
    }
  }
  const ps = bySub.get('PS');
  if (ps) out.push({ id: 'LPS', label: 'Longest picture span', value: Math.max(0, ...ps.filter((r) => r.points >= r.maxPoints).map((r) => r.meta?.span ?? 0)), kind: 'raw' });
  const ln = bySub.get('LN');
  if (ln) out.push({ id: 'LLNs', label: 'Longest letter–number span', value: Math.max(0, ...ln.filter((r) => r.correct).map((r) => r.meta?.span ?? 0)), kind: 'raw' });
  const ca = bySub.get('CA');
  if (ca) {
    for (const [skill, id, label] of [['ca:random', 'CAr', 'Cancellation — scattered'], ['ca:structured', 'CAs', 'Cancellation — rows']] as const) {
      const rs = ca.filter((r) => r.skills.includes(skill));
      if (rs.length) out.push({ id, label, value: speededScaled('CA', rs, age), kind: 'scaled' });
    }
  }
  for (const id of ['CD', 'SS', 'CA'] as SubtestId[]) {
    const rs = bySub.get(id);
    if (!rs) continue;
    const errors = rs.reduce((a, r) => a + (r.meta?.errors ?? 0), 0);
    out.push({ id: `${id}err`, label: `${SUBTESTS[id].name} errors`, value: errors, kind: 'raw' });
  }
  const ss = bySub.get('SS');
  if (ss) {
    const sum = (k: string) => ss.reduce((a, r) => a + (r.meta?.[k] ?? 0), 0);
    out.push({ id: 'SSse', label: 'Symbol Search set errors', value: sum('setErrors'), kind: 'raw', note: 'Marked a look-alike with a changed part.' });
    out.push({ id: 'SSre', label: 'Symbol Search rotation errors', value: sum('rotationErrors'), kind: 'raw', note: 'Marked a turned or mirrored copy of the target.' });
  }
  return out;
}

function skillLines(results: ItemResult[]): SkillLine[] {
  const map = new Map<string, SkillLine>();
  for (const r of results) {
    if (SUBTESTS[r.subtest].kind === 'speeded') continue;
    for (const s of r.skills) {
      if (/span-\d+$/.test(s)) continue;
      const line = map.get(s) ?? { skill: s, label: skillLabel(s), subtest: r.subtest, attempts: 0, correct: 0, accuracy: 0 };
      line.attempts += 1;
      if (r.correct) line.correct += 1;
      line.accuracy = line.correct / line.attempts;
      map.set(s, line);
    }
  }
  return [...map.values()].sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts);
}

interface InsightInput {
  subtests: Partial<Record<SubtestId, SubtestScore>>;
  profile: ProfileScores;
  process: ProcessScore[];
  skills: SkillLine[];
  results: ItemResult[];
  age: number;
  timed: boolean;
}

function makeInsights(x: InsightInput): Insight[] {
  const out: Insight[] = [];
  const zoneName = (id: PrimaryIndexId) => `${ZONES[id].kidName} (${COMPOSITES[id].name})`;

  // Index strengths & weaknesses relative to the child's own average.
  for (const c of x.profile.indexComparisons) {
    if (c.comparison === 'strength') {
      out.push({ kind: 'strength', index: c.id, title: `Strong in ${ZONES[c.id].kidName}`,
        text: `${zoneName(c.id)} is a personal strength — about ${Math.round(c.diffFromMean)} points above this child's own average. Keep it fun and challenging so it stays a source of confidence.` });
    } else if (c.comparison === 'weakness') {
      out.push({ kind: 'growth', index: c.id, title: `Room to grow in ${ZONES[c.id].kidName}`,
        text: `${zoneName(c.id)} is lower than the child's other areas (about ${Math.round(-c.diffFromMean)} points below their own average). Short, frequent practice with the strategies below helps most.` });
    }
  }
  // Subtest strengths & weaknesses (when no index-level ones exist, these carry the story).
  for (const c of x.profile.subtestComparisons) {
    const info = SUBTESTS[c.id];
    if (c.comparison === 'strength') out.push({ kind: 'strength', subtest: c.id, title: `${info.kidName} shines`, text: `${info.name} is a relative strength. ${info.measures}` });
    if (c.comparison === 'weakness') out.push({ kind: 'growth', subtest: c.id, title: `Practise ${info.kidName}`, text: `${info.name} is a relative weakness. ${info.measures}` });
  }
  if (!x.profile.subtestComparisons.length) {
    const scored = Object.values(x.subtests).filter(Boolean) as SubtestScore[];
    if (scored.length >= 2) {
      const best = scored.reduce((a, b) => (b.scaled > a.scaled ? b : a));
      const worst = scored.reduce((a, b) => (b.scaled < a.scaled ? b : a));
      if (best.scaled - worst.scaled >= 3) {
        out.push({ kind: 'strength', subtest: best.id, title: `${SUBTESTS[best.id].kidName} went great`, text: SUBTESTS[best.id].measures });
        out.push({ kind: 'growth', subtest: worst.id, title: `Keep practising ${SUBTESTS[worst.id].kidName}`, text: SUBTESTS[worst.id].measures });
      }
    }
  }

  // Working memory: storage vs manipulation.
  const get = (id: string) => x.process.find((p) => p.id === id)?.value;
  const dsf = get('DSf');
  const dsb = get('DSb');
  if (dsf !== undefined && dsb !== undefined && dsf - dsb >= 3) {
    out.push({ kind: 'observation', subtest: 'DS', title: 'Holding is easier than juggling',
      text: 'Repeating numbers forward went much better than backward. Remembering is solid; mentally rearranging is the growth area. Practise "say it backward" games with 2–3 items, then build up.' });
  } else if (dsf !== undefined && dsb !== undefined && dsb - dsf >= 3) {
    out.push({ kind: 'observation', subtest: 'DS', title: 'Backward beat forward',
      text: 'Backward and ordering tasks went better than simple repetition — often a sign of attention drifting on the "easy" task. Encourage full listening even when it feels simple.' });
  }

  // Block Design rotation errors.
  const rot = get('BDre');
  if (rot && rot > 0) {
    out.push({ kind: 'observation', subtest: 'BD', title: 'Designs got turned around',
      text: `${rot} design${rot > 1 ? 's were' : ' was'} built correctly but rotated. Teach a final "check the corners against the picture" step before saying done.` });
  }

  // Speed vs accuracy on speeded tasks.
  for (const id of ['CD', 'SS', 'CA'] as SubtestId[]) {
    const rs = x.results.filter((r) => r.subtest === id);
    if (!rs.length) continue;
    const correct = rs.reduce((a, r) => a + (r.meta?.correct ?? r.points), 0);
    const errors = rs.reduce((a, r) => a + (r.meta?.errors ?? 0), 0);
    if (correct + errors >= 8 && errors / (correct + errors) > 0.15) {
      out.push({ kind: 'observation', subtest: id, title: `Fast but slips in ${SUBTESTS[id].kidName}`,
        text: `About ${Math.round((100 * errors) / (correct + errors))}% of answers were mistakes. On these tasks wrong marks cost points, so a steady, careful rhythm scores higher than rushing.` });
    } else if (errors === 0 && x.subtests[id] && x.subtests[id]!.scaled <= 8) {
      out.push({ kind: 'observation', subtest: id, title: `Careful but unhurried in ${SUBTESTS[id].kidName}`,
        text: 'Every answer was accurate, but the pace was slow. Speed games (beat-your-own-record) can help — accuracy is already there.' });
    }
  }

  // Verbal: concrete (1-point) answers.
  const verbal = x.results.filter((r) => ['SI', 'VC', 'CO'].includes(r.subtest) && r.maxPoints === 2);
  if (verbal.length >= 5) {
    const ones = verbal.filter((r) => r.points === 1).length;
    if (ones / verbal.length >= 0.3) {
      out.push({ kind: 'observation', subtest: 'SI', title: 'True answers — now make them "best" answers',
        text: `${ones} of ${verbal.length} word answers were partly right (1 point). Practise the "group word" habit: "They're both ___" and "It's a ___ that ___".` });
    }
  }

  // Timing patterns on power items.
  const timedPower = x.results.filter((r) => SUBTESTS[r.subtest].kind === 'power' && r.timeMs > 0);
  if (timedPower.length >= 8) {
    const quickWrong = timedPower.filter((r) => !r.correct && r.timeMs < 4000).length;
    if (quickWrong / timedPower.length >= 0.2) {
      out.push({ kind: 'observation', title: 'Answering a bit too quickly',
        text: 'Several misses came within a few seconds. A "stop and check" habit (look at every choice before tapping) will likely pick up easy points.' });
    }
    const over = timedPower.filter((r) => r.overTime).length;
    if (x.timed && over >= 3) {
      out.push({ kind: 'observation', title: 'Accurate but needs more time',
        text: `${over} answers came after the time limit. Practise with a gentle timer so the pace feels normal, but keep accuracy first.` });
    }
  }

  // Hints → learning with support.
  const hinted = x.results.filter((r) => r.hintsUsed > 0);
  if (hinted.length >= 3 && hinted.filter((r) => r.correct).length / hinted.length >= 0.6) {
    out.push({ kind: 'celebrate', title: 'Learns quickly with a hint',
      text: 'Most hinted questions were then answered correctly — a great sign that the strategies are sinking in. Fade hints gradually as accuracy rises.' });
  }

  // Confidence calibration (metacognition).
  const conf = x.results.filter((r) => r.confidence !== undefined);
  if (conf.length >= 6) {
    const sureWrong = conf.filter((r) => r.confidence === 3 && !r.correct).length;
    const unsureRight = conf.filter((r) => r.confidence === 1 && r.correct).length;
    if (unsureRight >= 3) out.push({ kind: 'celebrate', title: 'Knows more than they think',
      text: `${unsureRight} answers marked "not sure" were actually right. Point this out — it builds confidence to trust good thinking.` });
    if (sureWrong >= 3) out.push({ kind: 'observation', title: 'Double-check when sure',
      text: `${sureWrong} answers marked "very sure" were wrong. A quick double-check habit helps on puzzle-type questions.` });
  }

  // Skills: best and weakest.
  const solid = x.skills.filter((s) => s.attempts >= 3 && s.accuracy >= 0.8).slice(0, 3);
  const weak = [...x.skills].filter((s) => s.attempts >= 3 && s.accuracy < 0.5).sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
  for (const s of solid) out.push({ kind: 'celebrate', subtest: s.subtest, title: `Great at: ${s.label}`, text: `${s.correct} of ${s.attempts} right.` });
  for (const s of weak) out.push({ kind: 'growth', subtest: s.subtest, title: `Practise: ${s.label}`, text: `${s.correct} of ${s.attempts} right — a good focus for the next few sessions.` });

  return out;
}
