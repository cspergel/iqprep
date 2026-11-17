import { useState } from 'react';
import { navigate } from '../app/router';
import { useStore } from '../app/store';
import { ageOn, dayKey, formatAge } from '../core/storage';
import { Mascot } from '../ui/kit';

const AVATARS = ['🦊', '🦉', '🐻', '🐰', '🐢', '🦁', '🐼', '🐸', '🐙', '🦄', '🐧', '🐯'];

export function Welcome({ adding = false }: { adding?: boolean }) {
  const { createProfile } = useStore();
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [agreed, setAgreed] = useState(false);

  const age = birthDate ? ageOn(birthDate) : null;
  const ageOk = age !== null && age >= 4 && age < 17.5;
  const valid = name.trim().length > 0 && ageOk && agreed;

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="card rise" style={{ marginTop: 20, padding: 0, overflow: 'hidden' }}>
        <div style={{ background: 'var(--pine)', color: '#fff', padding: '24px 24px 18px', borderBottom: 'var(--border)', position: 'relative' }}>
          <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
            <div className="spacer">
              <div className="small" style={{ opacity: 0.85, fontWeight: 700 }}>Welcome to</div>
              <h1 style={{ margin: 0 }}>IQ Prep</h1>
              <p style={{ margin: '6px 0 0' }}>Puzzles, word games, memory missions and speed races — a camp for curious minds.</p>
            </div>
            <Mascot mood="wave" size={120} className="float" />
          </div>
        </div>

        <div className="stack" style={{ padding: 22, gap: 18 }}>
          <h2 style={{ margin: 0 }}>{adding ? 'Add a new camper' : "Let's sign up a camper!"}</h2>

          <label className="stack" style={{ gap: 6 }}>
            <strong>Camper's first name</strong>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="e.g. Sam"
              style={inputStyle} autoComplete="off" />
          </label>

          <label className="stack" style={{ gap: 6 }}>
            <strong>Birthday</strong>
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} max={dayKey()} style={inputStyle} />
            <span className="small muted">
              {age === null ? 'Used only to pick the right difficulty and compare with same-age kids.'
                : ageOk ? `Age ${formatAge(age)} — games will be tuned for this age.` : 'IQ Prep is designed for ages 4 to 16.'}
            </span>
          </label>

          <div className="stack" style={{ gap: 6 }}>
            <strong>Pick a camp buddy</strong>
            <div className="row" role="radiogroup" aria-label="Avatar">
              {AVATARS.map((a) => (
                <button key={a} type="button" role="radio" aria-checked={avatar === a} onClick={() => setAvatar(a)}
                  className="choice" style={{ minHeight: 56, width: 56, fontSize: 30, padding: 0, background: avatar === a ? 'var(--sun)' : undefined }}>
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div className="card flat tint stack" style={{ gap: 8 }}>
            <strong>👋 For grown-ups</strong>
            <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>
              <li>IQ Prep builds the real thinking skills that WISC-V style assessments look at: words and ideas, shapes and space, patterns and logic, memory, and speed. Every question is original — none are real test items.</li>
              <li>Little and often works best: about 15 minutes a day, a few days a week. Stop heavy test-style practice 1–2 weeks before a scheduled evaluation.</li>
              <li>If your child is being evaluated, tell the psychologist what practice they've done. Too much practice can make results less accurate.</li>
              <li>Practice scores are estimates for tracking progress. They are not IQ scores and can't predict a real result.</li>
              <li>Everything stays on this device. No accounts, no tracking, no data sent anywhere.</li>
            </ul>
            <label className="row small" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ width: 22, height: 22, flex: 'none' }} />
              <span>I'm the parent or guardian and I understand the notes above.</span>
            </label>
          </div>

          <div className="row" style={{ justifyContent: 'flex-end' }}>
            {adding && <button className="btn ghost" onClick={() => navigate('/')}>Cancel</button>}
            <button className="btn primary big" disabled={!valid}
              onClick={() => { createProfile({ name: name.trim(), birthDate, avatar }); navigate('/'); }}>
              Start camp! 🏕️
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const inputStyle: React.CSSProperties = {
  font: 'inherit', fontSize: '1.15rem', padding: '12px 14px', borderRadius: 14, border: 'var(--border)', background: 'var(--card)',
  maxWidth: 360, width: '100%',
};
