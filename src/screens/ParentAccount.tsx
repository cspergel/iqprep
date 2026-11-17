/**
 * Optional parent account, inside the grown-ups area (already behind the grown-up gate).
 * Adults only: a neutral birth-month question; under 18 closes the form on this device.
 * Backups are minimised before upload (see core/cloud.ts).
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useStore } from '../app/store';
import { cloud, isAdult, minimise, toLocalBackups, type Me } from '../core/cloud';
import { loadData, loadProfiles } from '../core/storage';
import { inputStyle } from './Welcome';

const MINOR_KEY = 'iqprep:accounts-closed';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function closedHere(): boolean {
  try { return localStorage.getItem(MINOR_KEY) === '1' || document.cookie.includes('iqp_ag=1'); } catch { return false; }
}

export function ParentAccount() {
  const { importBackup } = useStore();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [mode, setMode] = useState<'signin' | 'create'>('signin');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(closedHere);
  const [askDelete, setAskDelete] = useState(false);
  const [askRestore, setAskRestore] = useState(false);

  useEffect(() => {
    cloud.me().then((r) => setMe(r.user)).catch(() => setMe(null));
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const backupNow = () => run(async () => {
    const campers = loadProfiles().map((profile) => ({ profile, data: loadData(profile.id) }));
    if (!campers.length) { setMsg('There is nothing to back up yet.'); return; }
    const r = await cloud.save(minimise(campers));
    setMe((m) => (m ? { ...m, backupAt: r.backupAt } : m));
    setMsg(`Backed up ${campers.length} camper${campers.length === 1 ? '' : 's'}. Names stay on this device.`);
  });

  const restore = () => run(async () => {
    setAskRestore(false);
    const { backup } = await cloud.load();
    if (!backup) { setMsg('There is no backup on this account yet.'); return; }
    const list = toLocalBackups(backup, loadProfiles());
    list.forEach((b) => importBackup(b));
    setMsg(`Restored ${list.length} camper${list.length === 1 ? '' : 's'}. Campers new to this device are named "Camper 1" and so on; rename them in Camper details.`);
  });

  if (me === undefined) return <p className="small muted">Checking your account…</p>;

  if (me) {
    return (
      <div className="stack" style={{ gap: 12 }}>
        <p style={{ margin: 0 }}>Signed in as <strong>{me.email}</strong>.</p>
        <p className="small muted" style={{ margin: 0 }}>
          {me.backupAt ? `Last backup: ${new Date(me.backupAt).toLocaleString()}.` : 'No backup yet.'} Backups leave out your children’s names, the day of their birthday and the grown-up PIN.
        </p>
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={backupNow}>Back up now</button>
          {!askRestore
            ? <button className="btn ghost" disabled={busy || !me.backupAt} onClick={() => setAskRestore(true)}>Restore from backup</button>
            : <span className="row" style={{ gap: 6 }}><span className="small"><strong>Replace progress on this device with the backup?</strong></span>
                <button className="btn small" onClick={restore}>Yes</button><button className="btn ghost small" onClick={() => setAskRestore(false)}>No</button></span>}
          <button className="btn ghost" disabled={busy} onClick={() => run(async () => { await cloud.logout(); setMe(null); setMsg('Signed out.'); })}>Sign out</button>
        </div>
        <div className="row">
          {!askDelete
            ? <button className="btn ghost small" onClick={() => setAskDelete(true)}>Delete account and backup</button>
            : <span className="row" style={{ gap: 6 }}><span className="small"><strong>Delete the account and its backup for good? Progress on this device stays.</strong></span>
                <button className="btn small" style={{ background: 'var(--bad)', color: '#fff' }} onClick={() => run(async () => { setAskDelete(false); await cloud.remove(); setMe(null); setMsg('Account and backup deleted.'); })}>Delete</button>
                <button className="btn ghost small" onClick={() => setAskDelete(false)}>Keep</button></span>}
        </div>
        {msg && <p className="small" role="status">{msg}</p>}
      </div>
    );
  }

  if (closed) {
    return <p className="small muted">Accounts are for grown-ups only. Everything still works without one: progress is saved on this device.</p>;
  }

  return <AccountForm mode={mode} setMode={setMode} busy={busy} msg={msg}
    onSignin={(email, password) => run(async () => { const r = await cloud.login(email, password); setMe(r.user); })}
    onCreate={(email, password, y, m, consent) => run(async () => {
      if (!isAdult(y, m)) {
        try { localStorage.setItem(MINOR_KEY, '1'); } catch { /* ignore */ }
        setClosed(true);
        return;
      }
      const r = await cloud.signup(email, password, y, m, consent);
      setMe(r.user);
      setMsg('Account created. Tap “Back up now” to save progress.');
    })} />;
}

function AccountForm({ mode, setMode, busy, msg, onSignin, onCreate }: {
  mode: 'signin' | 'create'; setMode: (m: 'signin' | 'create') => void; busy: boolean; msg: string | null;
  onSignin: (email: string, password: string) => void;
  onCreate: (email: string, password: string, y: number, m: number, consent: boolean) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [consent, setConsent] = useState(false);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => thisYear - i);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'signin') onSignin(email, password);
    else onCreate(email, password, Number(year), Number(month), consent);
  };

  return (
    <form className="stack" style={{ gap: 12, maxWidth: 460 }} onSubmit={submit}>
      <p className="small muted" style={{ margin: 0 }}>
        Optional. A parent account backs up progress so you can restore it on another device. Children do not need one to play.
      </p>
      <div className="row" style={{ gap: 6 }} role="tablist" aria-label="Account">
        <button type="button" role="tab" aria-selected={mode === 'signin'} className="btn small" style={{ background: mode === 'signin' ? 'var(--sun)' : 'var(--card)', minHeight: 40 }} onClick={() => setMode('signin')}>Sign in</button>
        <button type="button" role="tab" aria-selected={mode === 'create'} className="btn small" style={{ background: mode === 'create' ? 'var(--sun)' : 'var(--card)', minHeight: 40 }} onClick={() => setMode('create')}>Create account</button>
      </div>
      <label className="stack" style={{ gap: 4 }}><strong>Email</strong>
        <input style={inputStyle} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="stack" style={{ gap: 4 }}><strong>Password</strong>
        <input style={inputStyle} type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={mode === 'create' ? 10 : undefined} required value={password} onChange={(e) => setPassword(e.target.value)} />
        {mode === 'create' && <span className="small muted">At least 10 characters.</span>}</label>
      {mode === 'create' && (
        <>
          <fieldset className="stack" style={{ gap: 4, border: 0, padding: 0, margin: 0 }}>
            <legend><strong>Your birth month</strong></legend>
            <div className="row" style={{ gap: 8 }}>
              <select style={inputStyle} required value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
                <option value="">Month</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select style={inputStyle} required value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
                <option value="">Year</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <span className="small muted">Used once and not stored.</span>
          </fieldset>
          <label className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 10 }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 22, height: 22, flex: 'none', marginTop: 3 }} />
            <span className="small">I am the parent or guardian of the children who play here, and I agree to the <a href="/privacy/" target="_blank" rel="noopener">privacy policy</a>.</span>
          </label>
        </>
      )}
      <div><button className="btn primary" type="submit" disabled={busy || (mode === 'create' && !consent)}>{mode === 'signin' ? 'Sign in' : 'Create account'}</button></div>
      {msg && <p className="small" role="status">{msg}</p>}
    </form>
  );
}
