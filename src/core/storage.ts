/**
 * Local-only persistence. Nothing leaves the device: profiles and history live in localStorage
 * (important for a child user — no accounts, no servers, no tracking).
 */
import type { ItemResult, Mode, SubtestId } from './types';

export interface Settings {
  /** Narrate prompts automatically (tutor mode always narrates). */
  readAloud: boolean;
  sound: boolean;
  /** Show gentle timers during practice (tests always use standard timing). */
  practiceTimers: boolean;
  /** Verbal games: child answers aloud and a grown-up scores with the rubric. */
  parentScoring: boolean;
  /** Ask "How sure are you?" before showing feedback (metacognition). */
  confidencePrompts: boolean;
  /**
   * Strategy toolbox (several alternative approaches, opened by the child). Never shown in tests.
   * onRequest: a closed button only; afterMiss: the button also gets a gentle nudge after a miss; off: hidden.
   */
  strategyToolbox: 'onRequest' | 'afterMiss' | 'off';
  dailyGoalMinutes: number;
  disabledSubtests: SubtestId[];
  /** Show estimated standard scores (FSIQ, indexes) in the grown-up area. */
  showScores: boolean;
  /** Optional 4-digit PIN for the grown-up area. */
  parentPin?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  readAloud: true,
  sound: true,
  practiceTimers: false,
  parentScoring: false,
  confidencePrompts: true,
  strategyToolbox: 'onRequest',
  dailyGoalMinutes: 15,
  disabledSubtests: [],
  showScores: true,
};

export interface Profile {
  id: string;
  name: string;
  /** yyyy-mm-dd */
  birthDate: string;
  avatar: string;
  createdAt: number;
  settings: Settings;
}

export type SessionKind = 'practice' | 'tutor' | 'daily' | 'short' | 'mock' | 'review';

export interface SessionRecord {
  id: string;
  kind: SessionKind;
  title: string;
  mode: Mode;
  startedAt: number;
  endedAt?: number;
  /** Child's age (years) when the session started — scores are computed against it. */
  age: number;
  subtests: SubtestId[];
  results: ItemResult[];
  completed: boolean;
  /** Mock-exam battery id when kind === 'mock'. */
  battery?: string;
}

export interface ReviewCard {
  /** Skill tag this card trains. */
  skill: string;
  subtest: SubtestId;
  /** Leitner box 0–5; higher = longer interval. */
  box: number;
  due: number;
  /** A missed item to retry exactly (retrieval practice after seeing the explanation). */
  retry?: { difficulty: number; seed: number; variant?: string };
  lastSeen: number;
}

export interface ProfileData {
  profileId: string;
  sessions: SessionRecord[];
  badges: { id: string; at: number }[];
  /** yyyy-mm-dd days with any activity. */
  activeDays: string[];
  review: ReviewCard[];
  /** Skills that reached "mastered" (needs a later mixed/test confirmation) with timestamps. */
  mastered: Record<string, number>;
  /** Sticker/patch collection. */
  patches: string[];
}

const PREFIX = 'braincamp:v1:';
const PROFILES_KEY = `${PREFIX}profiles`;
const ACTIVE_KEY = `${PREFIX}active`;
const dataKey = (id: string) => `${PREFIX}data:${id}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Brain Camp: could not save', e);
  }
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function loadProfiles(): Profile[] {
  const list = read<Profile[]>(PROFILES_KEY, []);
  // Fill in settings added in later versions.
  return list.map((p) => ({ ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings } }));
}

export function saveProfiles(profiles: Profile[]): void {
  write(PROFILES_KEY, profiles);
}

export function loadActiveProfileId(): string | null {
  return read<string | null>(ACTIVE_KEY, null);
}

export function saveActiveProfileId(id: string | null): void {
  write(ACTIVE_KEY, id);
}

export function emptyData(profileId: string): ProfileData {
  return { profileId, sessions: [], badges: [], activeDays: [], review: [], mastered: {}, patches: [] };
}

export function loadData(profileId: string): ProfileData {
  return { ...emptyData(profileId), ...read<Partial<ProfileData>>(dataKey(profileId), {}) };
}

export function saveData(data: ProfileData): void {
  write(dataKey(data.profileId), data);
}

export function deleteProfileData(profileId: string): void {
  try {
    localStorage.removeItem(dataKey(profileId));
  } catch {
    /* ignore */
  }
}

export interface Backup {
  app: 'brain-camp';
  version: 1;
  exportedAt: number;
  profile: Profile;
  data: ProfileData;
}

export function makeBackup(profile: Profile, data: ProfileData): Backup {
  return { app: 'brain-camp', version: 1, exportedAt: Date.now(), profile, data };
}

export function parseBackup(text: string): Backup {
  const obj = JSON.parse(text);
  if (!obj || obj.app !== 'brain-camp' || obj.version !== 1 || !obj.profile?.id || !obj.data) {
    throw new Error('This file is not a Brain Camp backup.');
  }
  return obj as Backup;
}

// ---------- dates & age ----------

export function dayKey(t: number | Date = Date.now()): string {
  const d = typeof t === 'number' ? new Date(t) : t;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Age in fractional years on a given date. */
export function ageOn(birthDate: string, on: number | Date = Date.now()): number {
  const [y, m, d] = birthDate.split('-').map(Number);
  const birth = new Date(y, m - 1, d);
  const now = typeof on === 'number' ? new Date(on) : on;
  let years = now.getFullYear() - birth.getFullYear();
  const anniversary = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  if (now < anniversary) years -= 1;
  const lastBirthday = new Date(birth.getFullYear() + years, birth.getMonth(), birth.getDate());
  const nextBirthday = new Date(birth.getFullYear() + years + 1, birth.getMonth(), birth.getDate());
  const frac = (now.getTime() - lastBirthday.getTime()) / (nextBirthday.getTime() - lastBirthday.getTime());
  return years + frac;
}

/** "7 years, 4 months" */
export function formatAge(age: number): string {
  const y = Math.floor(age);
  const m = Math.floor((age - y) * 12);
  return `${y} year${y === 1 ? '' : 's'}${m ? `, ${m} month${m === 1 ? '' : 's'}` : ''}`;
}
