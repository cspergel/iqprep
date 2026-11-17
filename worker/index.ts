/**
 * iqprep.app Worker: static site + game from assets, a small API for optional adult-only parent
 * accounts (cloud backup of minimised progress), and redirects from the old braincamp.app name.
 *
 * Data kept per account: email, a PBKDF2 password hash, when the adult check and consent were given,
 * sessions, and one backup blob (names already removed by the app). No birth date is stored.
 */
import { isAdult } from '../src/core/cloud';

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  EMAIL: { send(message: { to: string; from: { email: string; name: string }; subject: string; text: string; html: string }): Promise<{ messageId: string }> };
}

const SITE = 'https://iqprep.app';
const SESSION_COOKIE = 'iqp_s';
const MINOR_COOKIE = 'iqp_ag';
const SESSION_DAYS = 30;
const MAX_BACKUP_BYTES = 2_000_000;
const PBKDF2_ITERATIONS = 100_000;
const RESET_MINUTES = 60;
const FROM = { email: 'no-reply@iqprep.app', name: 'IQ Prep' };

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const host = url.hostname;

    // The old name and the www host both land on iqprep.app, keeping the path.
    if (host.endsWith('braincamp.app') || host === 'www.iqprep.app') {
      return Response.redirect(`${SITE}${url.pathname}${url.search}`, 301);
    }

    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(req, env, url);
      } catch (e) {
        console.error('api error', e);
        return json({ error: 'Something went wrong. Try again in a minute.' }, 500);
      }
    }
    return env.ASSETS.fetch(req);
  },
};

// ---------- API ----------

async function api(req: Request, env: Env, url: URL): Promise<Response> {
  const route = url.pathname.slice('/api/'.length);
  const method = req.method;

  // Writes must come from our own pages (cookies are SameSite=Lax; this closes the rest).
  if (method !== 'GET' && !sameOrigin(req, url)) return json({ error: 'Not allowed.' }, 403);

  if (route === 'me' && method === 'GET') {
    const user = await currentUser(req, env);
    return json({ user: user ? await publicUser(env, user) : null });
  }

  if (route === 'signup' && method === 'POST') {
    if (readCookie(req, MINOR_COOKIE)) return json({ error: 'Accounts are for grown-ups only. You can keep playing without one.' }, 403);
    const body = await readJson(req);
    const email = normEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    const birthYear = Number(body.birthYear);
    const birthMonth = Number(body.birthMonth);
    if (!isAdult(birthYear, birthMonth)) {
      // Neutral age screen: once a visitor is under 18, the form stays closed on this browser.
      return json({ error: 'Accounts are for grown-ups only. You can keep playing without one.' }, 403, {
        'set-cookie': `${MINOR_COOKIE}=1; Max-Age=31536000; Path=/; Secure; SameSite=Lax`,
      });
    }
    if (!email) return json({ error: 'That email address looks incomplete.' }, 400);
    if (password.length < 10) return json({ error: 'Use a password of at least 10 characters.' }, 400);
    if (body.consent !== true) return json({ error: 'Please confirm you are the parent or guardian and agree to the privacy policy.' }, 400);
    if (!(await allow(env, `signup:${clientIp(req)}`, 10, 3600))) return json({ error: 'Too many tries. Wait an hour and try again.' }, 429);

    const exists = await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first();
    if (exists) return json({ error: 'There is already an account with that email. Sign in instead.' }, 409);

    const salt = randomBytes(16);
    const hash = await hashPassword(password, salt);
    const id = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO users (id, email, pw_hash, pw_salt, adult_confirmed_at, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(id, email, hex(hash), hex(salt), now, now, now).run();
    return withSession(env, id, json({ user: { email, backupAt: null } }));
  }

  if (route === 'login' && method === 'POST') {
    const body = await readJson(req);
    const email = normEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!(await allow(env, `login:${clientIp(req)}`, 20, 900)) || (email && !(await allow(env, `login:${email}`, 8, 900)))) {
      return json({ error: 'Too many tries. Wait 15 minutes and try again.' }, 429);
    }
    const row = email
      ? await env.DB.prepare('SELECT id, pw_hash, pw_salt FROM users WHERE email = ?').bind(email).first<{ id: string; pw_hash: string; pw_salt: string }>()
      : null;
    // Hash even when the account is missing, so timing does not reveal which emails exist.
    const salt = row ? unhex(row.pw_salt) : randomBytes(16);
    const hash = await hashPassword(password, salt);
    const ok = !!row && timingSafeEqual(hash, unhex(row.pw_hash));
    if (!ok || !row) return json({ error: 'That email and password do not match.' }, 401);
    return withSession(env, row.id, json({ user: await publicUser(env, row.id, email!) }));
  }

  if (route === 'logout' && method === 'POST') {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256hex(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': clearSession() });
  }

  if (route === 'reset/request' && method === 'POST') {
    const body = await readJson(req);
    const email = normEmail(body.email);
    // The answer is the same whether or not the account exists, so the form cannot be used to probe emails.
    const done = json({ ok: true });
    if (!email) return json({ error: 'That email address looks incomplete.' }, 400);
    if (!(await allow(env, `reset:${clientIp(req)}`, 10, 3600)) || !(await allow(env, `reset:${email}`, 3, 3600))) {
      return json({ error: 'Too many requests. Wait an hour and try again.' }, 429);
    }
    const row = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
    if (!row) return done;
    const token = b64url(randomBytes(32));
    await env.DB.prepare('INSERT INTO resets (id, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(await sha256hex(token), row.id, Date.now() + RESET_MINUTES * 60_000).run();
    const link = `${SITE}/reset/#t=${token}`;
    try {
      await env.EMAIL.send({
        to: email,
        from: FROM,
        subject: 'Reset your IQ Prep password',
        text: `Someone asked to reset the password for the IQ Prep parent account ${email}.

To choose a new password, open this link within ${RESET_MINUTES} minutes:
${link}

If this wasn't you, ignore this email; your password stays the same.

IQ Prep, ${SITE}`,
        html: `<p>Someone asked to reset the password for the IQ Prep parent account <strong>${escapeHtml(email)}</strong>.</p><p><a href="${link}">Choose a new password</a> (the link works for ${RESET_MINUTES} minutes and only once).</p><p>If this wasn't you, ignore this email; your password stays the same.</p><p>IQ Prep, <a href="${SITE}">iqprep.app</a></p>`,
      });
    } catch (e) {
      console.error('reset email failed', (e as { code?: string }).code ?? e);
    }
    return done;
  }

  if (route === 'reset/confirm' && method === 'POST') {
    const body = await readJson(req);
    const token = typeof body.token === 'string' ? body.token : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < 10) return json({ error: 'Use a password of at least 10 characters.' }, 400);
    if (!(await allow(env, `confirm:${clientIp(req)}`, 20, 3600))) return json({ error: 'Too many tries. Wait an hour and try again.' }, 429);
    const id = await sha256hex(token);
    const row = token
      ? await env.DB.prepare('SELECT user_id, expires_at, used_at FROM resets WHERE id = ?').bind(id).first<{ user_id: string; expires_at: number; used_at: number | null }>()
      : null;
    if (!row || row.used_at || row.expires_at < Date.now()) {
      return json({ error: 'This reset link has expired or was already used. Ask for a new one.' }, 400);
    }
    const salt = randomBytes(16);
    const hash = await hashPassword(password, salt);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(hex(hash), hex(salt), row.user_id),
      env.DB.prepare('UPDATE resets SET used_at = ? WHERE id = ?').bind(Date.now(), id),
      env.DB.prepare('DELETE FROM resets WHERE user_id = ? AND id != ?').bind(row.user_id, id),
      // Changing the password signs out every device.
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id),
    ]);
    return json({ ok: true });
  }

  // Everything below needs a signed-in account.
  const userId = await currentUser(req, env);
  if (!userId) return json({ error: 'Please sign in again.' }, 401);

  if (route === 'backup' && method === 'GET') {
    const row = await env.DB.prepare('SELECT data FROM backups WHERE user_id = ?').bind(userId).first<{ data: string }>();
    return json({ backup: row ? JSON.parse(row.data) : null });
  }

  if (route === 'backup' && method === 'PUT') {
    const text = await req.text();
    if (text.length > MAX_BACKUP_BYTES) return json({ error: 'That backup is too large.' }, 413);
    let parsed: { app?: string; version?: number; campers?: unknown[] };
    try { parsed = JSON.parse(text); } catch { return json({ error: 'That backup could not be read.' }, 400); }
    if (parsed?.app !== 'iq-prep' || parsed.version !== 1 || !Array.isArray(parsed.campers)) {
      return json({ error: 'That backup could not be read.' }, 400);
    }
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO backups (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
    ).bind(userId, text, now).run();
    return json({ backupAt: now });
  }

  if (route === 'account' && method === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM backups WHERE user_id = ?').bind(userId),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
      env.DB.prepare('DELETE FROM resets WHERE user_id = ?').bind(userId),
      env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId),
    ]);
    return json({ ok: true }, 200, { 'set-cookie': clearSession() });
  }

  return json({ error: 'Not found.' }, 404);
}

// ---------- sessions ----------

async function withSession(env: Env, userId: string, res: Response): Promise<Response> {
  const token = b64url(randomBytes(32));
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256hex(token), userId, expires).run();
  const out = new Response(res.body, res);
  out.headers.append('set-cookie', `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_DAYS * 86_400}; Path=/; HttpOnly; Secure; SameSite=Lax`);
  return out;
}

function clearSession(): string {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

async function currentUser(req: Request, env: Env): Promise<string | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?').bind(await sha256hex(token)).first<{ user_id: string; expires_at: number }>();
  if (!row || row.expires_at < Date.now()) return null;
  return row.user_id;
}

async function publicUser(env: Env, userId: string, knownEmail?: string) {
  const u = knownEmail
    ? { email: knownEmail }
    : await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first<{ email: string }>();
  const b = await env.DB.prepare('SELECT updated_at FROM backups WHERE user_id = ?').bind(userId).first<{ updated_at: number }>();
  return { email: u?.email ?? '', backupAt: b?.updated_at ?? null };
}

// ---------- rate limiting ----------

async function allow(env: Env, key: string, max: number, windowSec: number): Promise<boolean> {
  const now = Date.now();
  const row = await env.DB.prepare('SELECT n, reset_at FROM attempts WHERE key = ?').bind(key).first<{ n: number; reset_at: number }>();
  if (!row || row.reset_at < now) {
    await env.DB.prepare('INSERT INTO attempts (key, n, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET n = 1, reset_at = excluded.reset_at')
      .bind(key, now + windowSec * 1000).run();
    return true;
  }
  if (row.n >= max) return false;
  await env.DB.prepare('UPDATE attempts SET n = n + 1 WHERE key = ?').bind(key).run();
  return true;
}

// ---------- helpers ----------

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function sameOrigin(req: Request, url: URL): boolean {
  const origin = req.headers.get('origin');
  return !origin || origin === url.origin;
}

function normEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const e = v.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') ?? 'unknown';
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=') || null;
  }
  return null;
}

async function hashPassword(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return (crypto.subtle as unknown as { timingSafeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean }).timingSafeEqual(a, b);
}

async function sha256hex(s: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

function hex(b: Uint8Array): string {
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function unhex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function b64url(b: Uint8Array): string {
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
