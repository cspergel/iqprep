import { describe, expect, it } from 'vitest';
import { isAdult, minimise, toLocalBackups } from './cloud';
import { DEFAULT_SETTINGS, emptyData, type Profile } from './storage';

const today = new Date(Date.UTC(2026, 10, 17)); // 17 Nov 2026

describe('adult check (parent accounts)', () => {
  it('is adult in the month of the 18th birthday, not the month before', () => {
    expect(isAdult(2008, 11, today)).toBe(true);
    expect(isAdult(2008, 12, today)).toBe(false);
    expect(isAdult(2009, 1, today)).toBe(false);
  });
  it('rejects children and impossible dates', () => {
    expect(isAdult(2019, 3, today)).toBe(false);
    expect(isAdult(1985, 13, today)).toBe(false);
    expect(isAdult(1985, 0, today)).toBe(false);
    expect(isAdult(1850, 5, today)).toBe(false);
    expect(isAdult(2030, 5, today)).toBe(false);
    expect(isAdult(NaN, 5, today)).toBe(false);
  });
  it('accepts an ordinary adult', () => {
    expect(isAdult(1985, 6, today)).toBe(true);
  });
});

const sam: Profile = {
  id: 'p1', name: 'Sam Smith', birthDate: '2019-04-23', avatar: 'fox', createdAt: 1,
  settings: { ...DEFAULT_SETTINGS, parentPin: '4321' },
};

describe('what a cloud backup contains', () => {
  const up = minimise([{ profile: sam, data: { ...emptyData('p1'), patches: ['star'] } }], 99);

  it('drops the name, the day of birth and the PIN', () => {
    const p = up.campers[0].profile;
    expect(p.name).toBe('Camper 1');
    expect(p.birthDate).toBe('2019-04-01');
    expect((p.settings as { parentPin?: string }).parentPin).toBeUndefined();
    expect(JSON.stringify(up)).not.toContain('Sam');
    expect(JSON.stringify(up)).not.toContain('4321');
    expect(JSON.stringify(up)).not.toContain('2019-04-23');
  });

  it('keeps the progress itself', () => {
    expect(up.campers[0].data.patches).toEqual(['star']);
    expect(up.savedAt).toBe(99);
  });

  it('restoring keeps the name, birthday and PIN already on this device', () => {
    const [b] = toLocalBackups(up, [sam]);
    expect(b.profile.name).toBe('Sam Smith');
    expect(b.profile.birthDate).toBe('2019-04-23');
    expect(b.profile.settings.parentPin).toBe('4321');
    expect(b.data.patches).toEqual(['star']);
  });

  it('a camper new to this device arrives as "Camper 1", ready to rename', () => {
    const [b] = toLocalBackups(up, []);
    expect(b.profile.name).toBe('Camper 1');
    expect(b.profile.birthDate).toBe('2019-04-01');
  });

  it('refuses something that is not an IQ Prep backup', () => {
    expect(() => toLocalBackups({ app: 'other' } as never, [])).toThrow();
  });
});
