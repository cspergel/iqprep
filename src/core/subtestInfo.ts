import type { CompositeId, PrimaryIndexId, SubtestId, SubtestKind } from './types';

export type Tier = 'primary' | 'secondary' | 'complementary';
export type ZoneId = PrimaryIndexId | 'EXTRA';

export interface SubtestInfo {
  id: SubtestId;
  name: string;
  /** What the child sees on the camp map. */
  kidName: string;
  icon: string;
  tier: Tier;
  zone: ZoneId;
  kind: SubtestKind;
  /** Plain-language description of what is measured. */
  measures: string;
  /** Test-mode discontinue: stop after this many consecutive zero-point items. */
  discontinueAfter?: number;
  /** Items per standard test-mode administration (upper bound; discontinue may end earlier). */
  testLength: number;
  /** Default time limit for power items in seconds (generator may override per item). */
  defaultTimeLimitSec?: number;
  /** Verbal subtests can be answered aloud and scored by a grown-up with a rubric. */
  parentScorable?: boolean;
  minAge?: number;
}

export const SUBTESTS: Record<SubtestId, SubtestInfo> = {
  SI: { id: 'SI', name: 'Similarities', kidName: 'Alike Game', icon: '🔗', tier: 'primary', zone: 'VCI', kind: 'power',
    measures: 'Verbal concept formation and abstract reasoning — explaining how two things are alike.',
    discontinueAfter: 3, testLength: 18, parentScorable: true },
  VC: { id: 'VC', name: 'Vocabulary', kidName: 'Word Wizard', icon: '📖', tier: 'primary', zone: 'VCI', kind: 'power',
    measures: 'Word knowledge and the ability to explain what words mean.',
    discontinueAfter: 3, testLength: 18, parentScorable: true },
  IN: { id: 'IN', name: 'Information', kidName: 'Know-It-All Quiz', icon: '🌍', tier: 'secondary', zone: 'VCI', kind: 'power',
    measures: 'Breadth of general knowledge picked up from school, reading and the world around.',
    discontinueAfter: 3, testLength: 18 },
  CO: { id: 'CO', name: 'Comprehension', kidName: 'What Would You Do?', icon: '🤝', tier: 'secondary', zone: 'VCI', kind: 'power',
    measures: 'Practical reasoning and understanding of social rules and why they exist.',
    discontinueAfter: 3, testLength: 12, parentScorable: true },

  BD: { id: 'BD', name: 'Block Design', kidName: 'Block Builder', icon: '🟥', tier: 'primary', zone: 'VSI', kind: 'power',
    measures: 'Analyzing a pattern into parts and rebuilding it — spatial reasoning with hands and eyes.',
    discontinueAfter: 2, testLength: 13, defaultTimeLimitSec: 60 },
  VP: { id: 'VP', name: 'Visual Puzzles', kidName: 'Puzzle Pieces', icon: '🧩', tier: 'primary', zone: 'VSI', kind: 'power',
    measures: 'Mentally putting pieces together to make a shape, without touching them.',
    discontinueAfter: 3, testLength: 16, defaultTimeLimitSec: 30 },

  MR: { id: 'MR', name: 'Matrix Reasoning', kidName: 'Pattern Finder', icon: '🔳', tier: 'primary', zone: 'FRI', kind: 'power',
    measures: 'Finding the rule in a visual pattern and using it to fill in the missing piece.',
    discontinueAfter: 3, testLength: 18, defaultTimeLimitSec: 45 },
  FW: { id: 'FW', name: 'Figure Weights', kidName: 'Balance Scales', icon: '⚖️', tier: 'primary', zone: 'FRI', kind: 'power',
    measures: 'Quantitative reasoning — figuring out what keeps a scale balanced (early algebra).',
    discontinueAfter: 3, testLength: 16, defaultTimeLimitSec: 30 },
  PC: { id: 'PC', name: 'Picture Concepts', kidName: 'Picture Pals', icon: '🖼️', tier: 'secondary', zone: 'FRI', kind: 'power',
    measures: 'Spotting the hidden category that links pictures across rows.',
    discontinueAfter: 4, testLength: 16, defaultTimeLimitSec: 45 },
  AR: { id: 'AR', name: 'Arithmetic', kidName: 'Math Stories', icon: '🧮', tier: 'secondary', zone: 'FRI', kind: 'power',
    measures: 'Solving spoken math stories in your head — number sense plus working memory.',
    discontinueAfter: 3, testLength: 16, defaultTimeLimitSec: 30 },

  DS: { id: 'DS', name: 'Digit Span', kidName: 'Number Echo', icon: '🔢', tier: 'primary', zone: 'WMI', kind: 'span',
    measures: 'Holding numbers in mind and repeating them forward, backward and in order.',
    testLength: 24 },
  PS: { id: 'PS', name: 'Picture Span', kidName: 'Picture Parade', icon: '🎞️', tier: 'primary', zone: 'WMI', kind: 'span',
    measures: 'Remembering a set of pictures in the order they were shown.',
    discontinueAfter: 3, testLength: 16 },
  LN: { id: 'LN', name: 'Letter–Number Sequencing', kidName: 'Mix & Sort', icon: '🔤', tier: 'secondary', zone: 'WMI', kind: 'span',
    measures: 'Hearing mixed letters and numbers, then saying numbers in order and letters in ABC order.',
    testLength: 15 },

  CD: { id: 'CD', name: 'Coding', kidName: 'Secret Code', icon: '🗝️', tier: 'primary', zone: 'PSI', kind: 'speeded',
    measures: 'Copying symbols from a key quickly and accurately — visual-motor speed.',
    testLength: 1, defaultTimeLimitSec: 120 },
  SS: { id: 'SS', name: 'Symbol Search', kidName: 'Symbol Spy', icon: '🔍', tier: 'primary', zone: 'PSI', kind: 'speeded',
    measures: 'Quickly deciding whether a target symbol appears in a group — visual scanning speed.',
    testLength: 1, defaultTimeLimitSec: 120 },
  CA: { id: 'CA', name: 'Cancellation', kidName: 'Animal Hunt', icon: '🐾', tier: 'secondary', zone: 'PSI', kind: 'speeded',
    measures: 'Scanning a busy page and marking every animal — selective attention and speed.',
    testLength: 2, defaultTimeLimitSec: 45 },

  NSL: { id: 'NSL', name: 'Naming Speed Literacy', kidName: 'Speedy Namer', icon: '🗣️', tier: 'complementary', zone: 'EXTRA', kind: 'speeded',
    measures: 'How quickly familiar things (colors, shapes, letters, numbers) can be named — linked to reading fluency.',
    testLength: 1 },
  NSQ: { id: 'NSQ', name: 'Naming Speed Quantity', kidName: 'Quick Count', icon: '⚡', tier: 'complementary', zone: 'EXTRA', kind: 'speeded',
    measures: 'How quickly small quantities can be recognized without counting — linked to math fluency.',
    testLength: 1 },
  IST: { id: 'IST', name: 'Immediate Symbol Translation', kidName: 'Symbol Stories', icon: '📜', tier: 'complementary', zone: 'EXTRA', kind: 'power',
    measures: 'Learning picture-symbols for words and reading them back right away.',
    testLength: 12 },
  DST: { id: 'DST', name: 'Delayed Symbol Translation', kidName: 'Symbol Stories (Later)', icon: '⏳', tier: 'complementary', zone: 'EXTRA', kind: 'power',
    measures: 'Remembering the learned symbols after a delay — long-term recall.',
    testLength: 8 },
  RST: { id: 'RST', name: 'Recognition Symbol Translation', kidName: 'Symbol Match', icon: '✅', tier: 'complementary', zone: 'EXTRA', kind: 'power',
    measures: 'Recognizing which word goes with a learned symbol — recognition memory.',
    testLength: 8 },
};

export interface ZoneInfo {
  id: ZoneId;
  name: string;
  kidName: string;
  tagline: string;
  color: string;
  ink: string;
  icon: string;
}

export const ZONES: Record<ZoneId, ZoneInfo> = {
  VCI: { id: 'VCI', name: 'Verbal Comprehension', kidName: 'Word Woods', tagline: 'Words, ideas and knowing stuff', color: 'var(--zone-vci)', ink: 'var(--zone-vci-ink)', icon: '🌲' },
  VSI: { id: 'VSI', name: 'Visual Spatial', kidName: 'Block Canyon', tagline: 'Shapes, blocks and building', color: 'var(--zone-vsi)', ink: 'var(--zone-vsi-ink)', icon: '🏜️' },
  FRI: { id: 'FRI', name: 'Fluid Reasoning', kidName: 'Puzzle Peaks', tagline: 'Patterns, rules and logic', color: 'var(--zone-fri)', ink: 'var(--zone-fri-ink)', icon: '⛰️' },
  WMI: { id: 'WMI', name: 'Working Memory', kidName: 'Memory Lake', tagline: 'Hold it in your head', color: 'var(--zone-wmi)', ink: 'var(--zone-wmi-ink)', icon: '🏞️' },
  PSI: { id: 'PSI', name: 'Processing Speed', kidName: 'Speedy Rapids', tagline: 'Quick eyes, quick hands', color: 'var(--zone-psi)', ink: 'var(--zone-psi-ink)', icon: '🌊' },
  EXTRA: { id: 'EXTRA', name: 'Complementary', kidName: 'Starlight Cave', tagline: 'Naming speed and symbol learning', color: 'var(--zone-extra)', ink: 'var(--zone-extra-ink)', icon: '✨' },
};

export interface CompositeInfo {
  id: CompositeId;
  name: string;
  short: string;
  /** Subtests whose scaled scores sum to this composite (SRI is built from NSI + STI instead). */
  subtests: SubtestId[];
  /** Approx. reliability, used for the standard error of measurement. */
  reliability: number;
  /**
   * Mean intercorrelation of the component subtests (Pearson WISC-V intercorrelation table),
   * used to scale summed scaled scores. Reproduces published composites within about ±1 point.
   */
  avgR: number;
  family: 'primary' | 'full' | 'ancillary' | 'complementary';
  description: string;
}

export const COMPOSITES: Record<CompositeId, CompositeInfo> = {
  FSIQ: { id: 'FSIQ', name: 'Full Scale IQ', short: 'FSIQ', subtests: ['SI', 'VC', 'BD', 'MR', 'FW', 'DS', 'CD'], reliability: 0.96, avgR: 0.315, family: 'full',
    description: 'Overall thinking ability, estimated from the seven core subtests.' },
  VCI: { id: 'VCI', name: 'Verbal Comprehension Index', short: 'VCI', subtests: ['SI', 'VC'], reliability: 0.92, avgR: 0.54, family: 'primary',
    description: 'Using words to reason, understand concepts and show what you know.' },
  VSI: { id: 'VSI', name: 'Visual Spatial Index', short: 'VSI', subtests: ['BD', 'VP'], reliability: 0.92, avgR: 0.55, family: 'primary',
    description: 'Understanding how shapes and parts fit together in space.' },
  FRI: { id: 'FRI', name: 'Fluid Reasoning Index', short: 'FRI', subtests: ['MR', 'FW'], reliability: 0.93, avgR: 0.37, family: 'primary',
    description: 'Discovering rules and solving brand-new problems with logic.' },
  WMI: { id: 'WMI', name: 'Working Memory Index', short: 'WMI', subtests: ['DS', 'PS'], reliability: 0.92, avgR: 0.43, family: 'primary',
    description: 'Holding and working with information in mind for a short time.' },
  PSI: { id: 'PSI', name: 'Processing Speed Index', short: 'PSI', subtests: ['CD', 'SS'], reliability: 0.88, avgR: 0.53, family: 'primary',
    description: 'Doing simple visual tasks quickly and accurately.' },
  QRI: { id: 'QRI', name: 'Quantitative Reasoning Index', short: 'QRI', subtests: ['FW', 'AR'], reliability: 0.95, avgR: 0.55, family: 'ancillary',
    description: 'Reasoning with numbers and quantities.' },
  AWMI: { id: 'AWMI', name: 'Auditory Working Memory Index', short: 'AWMI', subtests: ['DS', 'LN'], reliability: 0.93, avgR: 0.6, family: 'ancillary',
    description: 'Working memory for things you hear.' },
  NVI: { id: 'NVI', name: 'Nonverbal Index', short: 'NVI', subtests: ['BD', 'VP', 'MR', 'FW', 'PS', 'CD'], reliability: 0.95, avgR: 0.32, family: 'ancillary',
    description: 'General ability measured with minimal use of words.' },
  GAI: { id: 'GAI', name: 'General Ability Index', short: 'GAI', subtests: ['SI', 'VC', 'BD', 'MR', 'FW'], reliability: 0.96, avgR: 0.373, family: 'ancillary',
    description: 'Reasoning ability with memory and speed taken out.' },
  CPI: { id: 'CPI', name: 'Cognitive Proficiency Index', short: 'CPI', subtests: ['DS', 'PS', 'CD', 'SS'], reliability: 0.92, avgR: 0.353, family: 'ancillary',
    description: 'How efficiently information is processed (memory + speed).' },
  NSI: { id: 'NSI', name: 'Naming Speed Index', short: 'NSI', subtests: ['NSL', 'NSQ'], reliability: 0.9, avgR: 0.55, family: 'complementary',
    description: 'Speed of naming familiar things — related to reading and math fluency.' },
  STI: { id: 'STI', name: 'Symbol Translation Index', short: 'STI', subtests: ['IST', 'DST', 'RST'], reliability: 0.94, avgR: 0.7, family: 'complementary',
    description: 'Learning and remembering new symbol–word links.' },
  SRI: { id: 'SRI', name: 'Storage and Retrieval Index', short: 'SRI', subtests: [], reliability: 0.94, avgR: 0.35, family: 'complementary',
    description: 'Storing and pulling back information quickly (combines NSI and STI).' },
};

export const PRIMARY_INDEXES: PrimaryIndexId[] = ['VCI', 'VSI', 'FRI', 'WMI', 'PSI'];
export const PRIMARY_SUBTESTS: SubtestId[] = ['SI', 'VC', 'BD', 'VP', 'MR', 'FW', 'DS', 'PS', 'CD', 'SS'];
export const FSIQ_SUBTESTS: SubtestId[] = COMPOSITES.FSIQ.subtests;
export const SECONDARY_SUBTESTS: SubtestId[] = ['IN', 'CO', 'PC', 'AR', 'LN', 'CA'];
export const COMPLEMENTARY_SUBTESTS: SubtestId[] = ['NSL', 'NSQ', 'IST', 'DST', 'RST'];
export const ALL_SUBTESTS = Object.keys(SUBTESTS) as SubtestId[];

export function subtestsInZone(zone: ZoneId): SubtestId[] {
  return ALL_SUBTESTS.filter((id) => SUBTESTS[id].zone === zone);
}
