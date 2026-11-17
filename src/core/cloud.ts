/**
 * Optional parent accounts: an adult signs in and backs up campers' progress to iqprep.app.
 *
 * Privacy by design: what leaves the device is minimised first. A camper's name never leaves
 * (it becomes "Camper 1", "Camper 2"…), the birthday is cut to the first of its month (enough for
 * age-normed scoring), and the grown-up PIN is dropped. Restoring keeps any name already on this
 * device for the same camper.
 */
import type { Backup, Profile, ProfileData } from './storage';

export const ADULT_AGE = 18;

/** Whole years between a birth month and a date, counting the birth month as already reached. */
export function ageInYears(birthYear: number, birthMonth: number, today: Date = new Date()): number {
  const months = (today.getUTCFullYear() - birthYear) * 12 + (today.getUTCMonth() + 1 - birthMonth);
  return Math.floor(months / 12);
}

/** True only for a plausible birth month at least ADULT_AGE years ago. */
export function isAdult(birthYear: number, birthMonth: number, today: Date = new Date()): boolean {
  if (!Number.isInteger(birthYear) || !Number.isInteger(birthMonth)) return false;
  if (birthMonth < 1 || birthMonth > 12 || birthYear < 1900 || birthYear > today.getUTCFullYear()) return false;
  return ageInYears(birthYear, birthMonth, today) >= ADULT_AGE;
}

export interface CloudCamper {
  profile: Omit<Profile, 'name'> & { name: string };
  data: ProfileData;
}

export interface CloudBackup {
  app: 'iq-prep';
  version: 1;
  savedAt: number;
  campers: CloudCamper[];
}

/** What is uploaded: no names, birthday cut to its month, no PIN. */
export function minimise(campers: { profile: Profile; data: ProfileData }[], now = Date.now()): CloudBackup {
  return {
    app: 'iq-prep',
    version: 1,
    savedAt: now,
    campers: campers.map(({ profile, data }, i) => {
      const { parentPin: _pin, ...settings } = profile.settings as Profile['settings'] & { parentPin?: string };
      void _pin;
      return {
        profile: {
          ...profile,
          name: `Camper ${i + 1}`,
          birthDate: /^\d{4}-\d{2}/.test(profile.birthDate) ? `${profile.birthDate.slice(0, 7)}-01` : profile.birthDate,
          settings: settings as Profile['settings'],
        },
        data,
      };
    }),
  };
}

/** Turn a downloaded backup into local backups, keeping names and PINs already on this device. */
export function toLocalBackups(cloud: CloudBackup, local: Profile[]): Backup[] {
  if (!cloud || cloud.app !== 'iq-prep' || cloud.version !== 1 || !Array.isArray(cloud.campers)) {
    throw new Error('That backup could not be read.');
  }
  return cloud.campers.map(({ profile, data }) => {
    const here = local.find((p) => p.id === profile.id);
    const merged: Profile = here
      ? { ...profile, name: here.name, birthDate: here.birthDate, settings: { ...profile.settings, parentPin: here.settings.parentPin } }
      : profile;
    return { app: 'brain-camp', version: 1, exportedAt: cloud.savedAt, profile: merged, data };
  });
}

// ---------- API ----------

export interface Me { email: string; backupAt: number | null }

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Something went wrong. Try again in a minute.');
  return body as T;
}

export const cloud = {
  me: () => call<{ user: Me | null }>('me'),
  signup: (email: string, password: string, birthYear: number, birthMonth: number, consent: boolean) =>
    call<{ user: Me }>('signup', { method: 'POST', body: JSON.stringify({ email, password, birthYear, birthMonth, consent }) }),
  login: (email: string, password: string) => call<{ user: Me }>('login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => call<{ ok: true }>('logout', { method: 'POST', body: '{}' }),
  save: (backup: CloudBackup) => call<{ backupAt: number }>('backup', { method: 'PUT', body: JSON.stringify(backup) }),
  load: () => call<{ backup: CloudBackup | null }>('backup'),
  remove: () => call<{ ok: true }>('account', { method: 'DELETE', body: '{}' }),
};
