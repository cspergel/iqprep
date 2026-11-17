/**
 * Process-focused, growth-mindset messages: praise effort and strategy, never "you're so smart".
 * Test mode only praises effort (like a real examiner), never correctness.
 */
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export const praise = {
  correct: () => pick([
    'You figured it out! Your careful looking paid off.',
    'Yes! You checked it step by step.',
    'Great thinking — you found the rule!',
    'Nice! You stuck with it and got it.',
    'That was some smart strategy!',
    'Boom! Your brain worked hard on that one.',
  ]),
  partial: () => pick([
    'Good thinking — that\'s partly right! Let\'s see the very best answer.',
    'You\'re on the right track! Here\'s how to make it even better.',
  ]),
  wrong: () => pick([
    'Not this time — and that\'s how brains grow! Let\'s look together.',
    'Oops! Mistakes help us learn. Here\'s the trick.',
    'Good try! Tricky ones make your brain stronger.',
    'Almost! Let\'s see how it works.',
  ]),
  tryAgain: () => pick([
    'Hmm, not quite. Here\'s a hint — try once more!',
    'Let\'s take another look. Use the hint!',
  ]),
  effort: () => pick([
    'You\'re working so hard!',
    'Great focus!',
    'Keep going — you\'re doing great trying!',
    'I love how carefully you\'re thinking.',
    'Some are tricky — that\'s on purpose. Just do your best!',
  ]),
  blockStart: () => pick([
    'Remember: it\'s OK not to know them all. Everyone misses some!',
    'Take your time and do your best thinking.',
    'Ready? Show me your super-brain strategies!',
  ]),
};
