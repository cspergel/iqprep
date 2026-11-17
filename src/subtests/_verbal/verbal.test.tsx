import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerateRequest, Item } from '../../core/types';
import { bankProblems } from './bankChecks';
import { slug, zero } from './build';
import { candidatesFor, generateVerbal, scoreVerbal, spokenText, type VerbalConfig } from './engine';
import type { VerbalBankItem, VerbalPayload, VerbalResponse } from './types';
import { VerbalPlayer } from './VerbalPlayer';

afterEach(cleanup);

const mk = (id: string, difficulty: number): VerbalBankItem => ({
  id: `SI:${id}`,
  difficulty,
  prompt: `How are a CAT and a ${id.toUpperCase()} alike?`,
  choices: [
    { text: 'Both are animals', points: 2, why: 'Group name!' },
    { text: 'Both have fur', points: 1, why: 'Only a detail.' },
    { text: 'A cat meows', points: 0, why: 'Only one.' },
    { text: 'Both can fly', points: 0, why: 'Not true.' },
  ],
  rubric: { two: ['Both are animals'], one: ['Both have fur'], zero: ['A cat meows'] },
  explanation: 'They are both ANIMALS.',
  skill: 'si:category',
});

const BANK = [4, 5, 6, 6, 7, 8, 9, 10, 12, 14, 16].map((d, i) => mk(`x${i}`, d));
const CFG: VerbalConfig = {
  subtest: 'SI', bank: BANK, maxPoints: 2, parentScorable: true,
  hints: () => ['Think of a group.'], scaffold: () => 'They are both ___', rubricNote: 'note',
};
const req = (difficulty: number, seed: number, exclude?: string[]): GenerateRequest => ({ difficulty, seed, age: 7, mode: 'practice', exclude });

describe('verbal engine', () => {
  it('chooses only among the nearest items and keeps them within the window', () => {
    const c = candidatesFor(BANK, 6).map((b) => b.difficulty);
    expect(c.length).toBeLessThanOrEqual(5);
    expect(c.every((d) => Math.abs(d - 6) <= 1.5)).toBe(true);
    expect(c).toContain(6);
    expect(candidatesFor(BANK, 99).map((b) => b.difficulty)).toEqual([16]);
  });

  it('skips excluded ids when a fresh item is close enough, otherwise repeats', () => {
    const near = candidatesFor(BANK, 6).map((b) => b.id);
    const fresh = candidatesFor(BANK, 6, near);
    expect(fresh.some((b) => near.includes(b.id))).toBe(false);
    // Excluding the only top item: nearest fresh one (14) is within tolerance of 16.
    expect(candidatesFor(BANK, 17, ['SI:x10'])[0].id).toBe('SI:x9');
    // Excluding everything falls back to the whole bank.
    expect(candidatesFor(BANK, 8, BANK.map((b) => b.id))[0].difficulty).toBe(8);
  });

  it('copies the bank item into the item and appends the item hint', () => {
    const it = generateVerbal(CFG, req(8, 3));
    const b = BANK.find((x) => x.id === it.id)!;
    expect(it.difficulty).toBe(b.difficulty);
    expect(it.speak).toBe(spokenText(b.prompt));
    expect(it.speak).not.toMatch(/CAT/);
    const withHint = generateVerbal({ ...CFG, bank: [{ ...BANK[0], hint: 'Extra!' }] }, req(4, 1));
    expect(withHint.hints).toEqual(['Think of a group.', 'Extra!']);
  });

  it('scores choices 2/1/0, grown-up scores, and timeouts', () => {
    const it = generateVerbal(CFG, req(6, 1));
    expect(scoreVerbal(it, { choice: 'Both are animals' })).toMatchObject({ points: 2, correct: true });
    expect(scoreVerbal(it, { choice: 'Both have fur' })).toMatchObject({ points: 1, correct: false, feedback: "1 point — true, but there's a better answer! Only a detail." });
    expect(scoreVerbal(it, { choice: 'Both can fly' })).toMatchObject({ points: 0, feedback: 'Not true.' });
    expect(scoreVerbal(it, { parentScore: 1 })).toMatchObject({ points: 1, meta: { parentScored: 1, partial: 1 } });
    expect(scoreVerbal(it, { parentScore: 7 as never }).points).toBe(2);
    expect(scoreVerbal(it, null)).toMatchObject({ points: 0, correct: false });
    const mcOnly = { ...it, payload: { ...it.payload, parentScorable: false } };
    expect(scoreVerbal(mcOnly, { parentScore: 2 }).points).toBe(0);
  });

  it('scores say-first responses exactly like plain choices and records whether the child said it first', () => {
    const it = generateVerbal(CFG, req(6, 1));
    for (const c of it.payload.choices) {
      const plain = scoreVerbal(it, { choice: c.text });
      const said = scoreVerbal(it, { choice: c.text, saidFirst: true, transcript: 'they are both pets' });
      const skipped = scoreVerbal(it, { choice: c.text, saidFirst: false });
      expect(said.points).toBe(plain.points);
      expect(skipped.points).toBe(plain.points);
      expect(said.feedback).toBe(plain.feedback);
      expect(said.meta?.saidFirst).toBe(1);
      expect(skipped.meta?.saidFirst).toBe(0);
      expect(plain.meta && 'saidFirst' in plain.meta).toBe(false);
    }
  });

  it('uses the configured instruction stem for the prompt and the spoken text', () => {
    const it = generateVerbal({ ...CFG, stem: () => 'What is this?' }, req(6, 1));
    expect(it.payload.prompt).toBe('What is this?');
    expect(it.speak).toBe('What is this?');
  });
});

describe('bank helpers', () => {
  it('parses wrong-answer codes and custom reasons', () => {
    expect(zero('d:Cats meow', {})).toMatchObject({ text: 'Cats meow', points: 0 });
    expect(zero('d:Cats meow', {}).why).toMatch(/DIFFERENT/);
    expect(zero('Both fly || Nope, cats cannot fly.', {})).toEqual({ text: 'Both fly', points: 0, why: 'Nope, cats cannot fly.' });
    expect(() => zero('q:??', {})).toThrow();
  });

  it('slugs the capitalised words', () => {
    expect(slug('a POLICE OFFICER')).toBe('police-officer');
    expect(slug('an APPLE')).toBe('apple');
  });

  it('reports broken items', () => {
    const bad: VerbalBankItem = { ...mk('bad', 3), choices: mk('b', 5).choices.map((c) => ({ ...c, points: 2 as const })) };
    const problems = bankProblems([mk('a', 5), mk('a', 6), bad], { prefix: 'SI', maxPoints: 2, skills: ['si:category'], requirePartial: true });
    expect(problems.join('\n')).toMatch(/duplicate id/);
    expect(problems.join('\n')).toMatch(/difficulty 3 out of range/);
    expect(problems.join('\n')).toMatch(/exactly one 2-point/);
  });
});

describe('VerbalPlayer', () => {
  const item: Item<VerbalPayload> = generateVerbal(CFG, req(6, 2));
  const base = { item, mode: 'practice' as const, age: 7, hintLevel: 0 };
  const quiet = () => Promise.resolve();
  const saidIt = () => fireEvent.click(screen.getByRole('button', { name: /I said my answer/ }));

  it('step 1 hides the choices; "I said my answer" reveals them; the pick is submitted once', () => {
    const onSubmit = vi.fn();
    render(<VerbalPlayer {...base} onSubmit={onSubmit} speak={quiet} />);
    expect(screen.queryByRole('button', { name: 'Both are animals' })).toBeNull();
    expect(screen.queryByText(/Which answer is closest/)).toBeNull();
    saidIt();
    expect(screen.getByText(/Which answer is closest to what you said/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Both have fur' }));
    fireEvent.click(screen.getByRole('button', { name: 'Both are animals' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ choice: 'Both have fur', saidFirst: true });
    expect(scoreVerbal(item, onSubmit.mock.calls[0][0]).points).toBe(1);
  });

  it('reads the question aloud on its own, and again on "Hear it again"', async () => {
    const speak = vi.fn(quiet);
    render(<VerbalPlayer {...base} onSubmit={() => undefined} speak={speak} />);
    await waitFor(() => expect(speak).toHaveBeenCalledWith(item.speak, { force: true }));
    expect(speak).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Hear it again' }));
    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak).toHaveBeenLastCalledWith(item.speak, { force: true });
  });

  it('does not auto-read on a reveal', async () => {
    const speak = vi.fn(quiet);
    const response: VerbalResponse = { choice: 'Both are animals' };
    render(<VerbalPlayer {...base} onSubmit={() => undefined} speak={speak} reveal={{ response, outcome: scoreVerbal(item, response) }} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(speak).not.toHaveBeenCalled();
  });

  it('prints the question in practice and tutor, but only a listening card in test mode', () => {
    for (const mode of ['practice', 'tutor'] as const) {
      const { container, unmount } = render(<VerbalPlayer {...base} mode={mode} onSubmit={() => undefined} speak={quiet} />);
      expect(container.textContent).toContain(spokenText(item.payload.prompt));
      unmount();
    }
    const { container } = render(<VerbalPlayer {...base} mode="test" onSubmit={() => undefined} speak={quiet} />);
    expect(screen.getByLabelText('Listening card').textContent).toMatch(/Listen to the question/);
    expect(container.textContent).not.toMatch(/alike/i);
    expect(container.textContent).not.toContain(spokenText(item.payload.prompt));
    saidIt();
    expect(screen.getByRole('button', { name: 'Both are animals' })).toBeTruthy();
    expect(container.textContent).not.toMatch(/alike/i);
  });

  it('offers "Skip to choices" in practice/tutor (recorded as not said first) but not in test mode', () => {
    const onSubmit = vi.fn();
    render(<VerbalPlayer {...base} mode="tutor" onSubmit={onSubmit} speak={quiet} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip to choices' }));
    fireEvent.click(screen.getByRole('button', { name: 'Both are animals' }));
    expect(onSubmit).toHaveBeenCalledWith({ choice: 'Both are animals', saidFirst: false });
    cleanup();
    render(<VerbalPlayer {...base} mode="test" onSubmit={() => undefined} speak={quiet} />);
    expect(screen.queryByRole('button', { name: 'Skip to choices' })).toBeNull();
  });

  it('reads a choice aloud without submitting it', () => {
    const onSubmit = vi.fn();
    const speak = vi.fn(quiet);
    const { container } = render(<VerbalPlayer {...base} onSubmit={onSubmit} speak={speak} />);
    saidIt();
    const chip = container.querySelector('[aria-label="Read aloud: Both are animals"]')!;
    fireEvent.click(chip);
    expect(speak).toHaveBeenCalledWith('Both are animals', { force: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the sentence starter only after a hint, in both steps', () => {
    const { rerender } = render(<VerbalPlayer {...base} onSubmit={() => undefined} speak={quiet} />);
    expect(screen.queryByText(/They are both ___/)).toBeNull();
    rerender(<VerbalPlayer {...base} hintLevel={1} onSubmit={() => undefined} speak={quiet} />);
    expect(screen.getByText(/They are both ___/)).toBeTruthy();
    saidIt();
    expect(screen.getByText(/They are both ___/)).toBeTruthy();
  });

  it('captures a transcript with the browser speech recogniser when there is one', () => {
    class FakeRecognition {
      static last: FakeRecognition | null = null;
      lang = '';
      interimResults = false;
      continuous = false;
      maxAlternatives = 1;
      onresult: ((e: { results: { transcript: string }[][] }) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      started = false;
      constructor() {
        FakeRecognition.last = this;
      }
      start() {
        this.started = true;
      }
      stop() {
        this.onend?.();
      }
      abort() {}
    }
    const w = window as unknown as { webkitSpeechRecognition?: unknown };
    w.webkitSpeechRecognition = FakeRecognition;
    try {
      const onSubmit = vi.fn();
      render(<VerbalPlayer {...base} onSubmit={onSubmit} speak={quiet} />);
      fireEvent.click(screen.getByRole('button', { name: 'Say it to the microphone' }));
      const rec = FakeRecognition.last!;
      expect(rec.started).toBe(true);
      act(() => rec.onresult?.({ results: [[{ transcript: 'they are both pets' }]] }));
      fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }));
      expect(screen.getByLabelText('What you said').textContent).toContain('they are both pets');
      saidIt();
      fireEvent.click(screen.getByRole('button', { name: 'Both are animals' }));
      expect(onSubmit).toHaveBeenCalledWith({ choice: 'Both are animals', saidFirst: true, transcript: 'they are both pets' });
    } finally {
      delete w.webkitSpeechRecognition;
    }
  });

  it('hides the microphone when the browser has no speech recogniser', () => {
    render(<VerbalPlayer {...base} onSubmit={() => undefined} speak={quiet} />);
    expect(screen.queryByRole('button', { name: 'Say it to the microphone' })).toBeNull();
    expect(screen.getByRole('button', { name: /I said my answer/ })).toBeTruthy();
  });

  it('marks the best answer and the 1-point badge on reveal', () => {
    const response: VerbalResponse = { choice: 'Both have fur', saidFirst: true };
    render(
      <VerbalPlayer {...base} onSubmit={() => undefined} speak={quiet} reveal={{ response, outcome: scoreVerbal(item, response) }} />,
    );
    expect(screen.getByLabelText(/Both are animals — best answer/).className).toMatch(/correct/);
    expect(screen.getByText(/1 point — true, but there's a better answer!/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Both are animals' })).toBeNull();
  });

  it('lets a grown-up open the rubric and score a spoken answer (and reads the question aloud)', async () => {
    const onSubmit = vi.fn();
    const speak = vi.fn(quiet);
    render(<VerbalPlayer {...base} parentScoring onSubmit={onSubmit} speak={speak} />);
    await waitFor(() => expect(speak).toHaveBeenCalledWith(item.speak, { force: true }));
    expect(screen.getByText(/alike/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Both are animals' })).toBeNull();
    expect(screen.queryByRole('button', { name: /I said my answer/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Show scoring guide/ }));
    expect(screen.getByLabelText('Scoring guide').textContent).toContain('Both have fur');
    fireEvent.click(screen.getByRole('button', { name: 'Give 2 points' }));
    expect(onSubmit).toHaveBeenCalledWith({ parentScore: 2 });
  });

  it('shows the grown-up score and a model answer on a parent-scored reveal', () => {
    const response: VerbalResponse = { parentScore: 1 };
    render(
      <VerbalPlayer {...base} parentScoring onSubmit={() => undefined} speak={quiet} reveal={{ response, outcome: scoreVerbal(item, response) }} />,
    );
    expect(screen.getByText(/Grown-up gave 1 point/)).toBeTruthy();
    expect(screen.getByText(/Both are animals/)).toBeTruthy();
  });

  it('uses the say-first flow for items that are not parent-scorable, even with grown-up scoring on', () => {
    const mc = { ...item, payload: { ...item.payload, parentScorable: false } };
    render(<VerbalPlayer {...base} item={mc} parentScoring onSubmit={() => undefined} speak={quiet} />);
    expect(screen.queryByRole('button', { name: /scoring guide/ })).toBeNull();
    saidIt();
    expect(screen.getByRole('button', { name: 'Both are animals' })).toBeTruthy();
  });
});
