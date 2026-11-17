import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { confirmMastery, newBadges, updateReview } from '../core/progress';
import type { SessionPlan } from '../core/session';
import {
  DEFAULT_SETTINGS, ageOn, dayKey, deleteProfileData, emptyData, loadActiveProfileId, loadData, loadProfiles, newId,
  saveActiveProfileId, saveData, saveProfiles, type Backup, type Profile, type ProfileData, type SessionRecord, type Settings,
} from '../core/storage';
import { setSoundEnabled } from './sound';

interface Store {
  profiles: Profile[];
  profile: Profile | null;
  data: ProfileData | null;
  age: number;
  settings: Settings;
  activePlan: SessionPlan | null;
  createProfile: (p: { name: string; birthDate: string; avatar: string }) => Profile;
  switchProfile: (id: string | null) => void;
  updateProfile: (patch: Partial<Omit<Profile, 'id' | 'settings'>>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  deleteProfile: (id: string) => void;
  startSession: (plan: SessionPlan) => void;
  /** Persist a session (partial or complete); returns newly earned badge ids. */
  saveSession: (record: SessionRecord) => string[];
  importBackup: (b: Backup) => void;
  resetData: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>(() => loadProfiles());
  const [activeId, setActiveId] = useState<string | null>(() => {
    const id = loadActiveProfileId();
    return id && loadProfiles().some((p) => p.id === id) ? id : loadProfiles()[0]?.id ?? null;
  });
  const [data, setData] = useState<ProfileData | null>(() => (activeId ? loadData(activeId) : null));
  const [activePlan, setActivePlan] = useState<SessionPlan | null>(null);

  const profile = profiles.find((p) => p.id === activeId) ?? null;
  const settings = profile?.settings ?? DEFAULT_SETTINGS;
  const age = profile ? ageOn(profile.birthDate) : 7;

  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);

  const persistProfiles = useCallback((next: Profile[]) => {
    setProfiles(next);
    saveProfiles(next);
  }, []);

  const switchProfile = useCallback((id: string | null) => {
    setActiveId(id);
    saveActiveProfileId(id);
    setData(id ? loadData(id) : null);
  }, []);

  const createProfile = useCallback((p: { name: string; birthDate: string; avatar: string }) => {
    const prof: Profile = { id: newId(), createdAt: Date.now(), settings: { ...DEFAULT_SETTINGS }, ...p };
    persistProfiles([...loadProfiles(), prof]);
    saveData(emptyData(prof.id));
    switchProfile(prof.id);
    return prof;
  }, [persistProfiles, switchProfile]);

  const updateProfile = useCallback((patch: Partial<Omit<Profile, 'id' | 'settings'>>) => {
    if (!activeId) return;
    persistProfiles(loadProfiles().map((p) => (p.id === activeId ? { ...p, ...patch } : p)));
  }, [activeId, persistProfiles]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    if (!activeId) return;
    persistProfiles(loadProfiles().map((p) => (p.id === activeId ? { ...p, settings: { ...p.settings, ...patch } } : p)));
  }, [activeId, persistProfiles]);

  const deleteProfile = useCallback((id: string) => {
    const next = loadProfiles().filter((p) => p.id !== id);
    persistProfiles(next);
    deleteProfileData(id);
    if (id === activeId) switchProfile(next[0]?.id ?? null);
  }, [activeId, persistProfiles, switchProfile]);

  const saveSession = useCallback((record: SessionRecord): string[] => {
    if (!activeId) return [];
    const current = loadData(activeId);
    const sessions = current.sessions.some((s) => s.id === record.id)
      ? current.sessions.map((s) => (s.id === record.id ? record : s))
      : [...current.sessions, record];
    let next: ProfileData = { ...current, sessions };
    if (record.results.length > 0) {
      const today = dayKey();
      if (!next.activeDays.includes(today)) next.activeDays = [...next.activeDays, today];
    }
    if (record.completed) {
      next.review = updateReview(next.review, record);
      next.mastered = confirmMastery(next, record);
    }
    const earned = newBadges(next);
    next = { ...next, badges: [...next.badges, ...earned] };
    saveData(next);
    setData(next);
    return earned.map((b) => b.id);
  }, [activeId]);

  const importBackup = useCallback((b: Backup) => {
    const others = loadProfiles().filter((p) => p.id !== b.profile.id);
    persistProfiles([...others, { ...b.profile, settings: { ...DEFAULT_SETTINGS, ...b.profile.settings } }]);
    saveData({ ...emptyData(b.profile.id), ...b.data, profileId: b.profile.id });
    switchProfile(b.profile.id);
  }, [persistProfiles, switchProfile]);

  const resetData = useCallback(() => {
    if (!activeId) return;
    const fresh = emptyData(activeId);
    saveData(fresh);
    setData(fresh);
  }, [activeId]);

  const value = useMemo<Store>(() => ({
    profiles, profile, data, age, settings, activePlan,
    createProfile, switchProfile, updateProfile, updateSettings, deleteProfile,
    startSession: setActivePlan, saveSession, importBackup, resetData,
  }), [profiles, profile, data, age, settings, activePlan, createProfile, switchProfile, updateProfile, updateSettings, deleteProfile, saveSession, importBackup, resetData]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
