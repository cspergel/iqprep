/**
 * Symbol Translation dictionary: 24 original drawn symbols, each standing for one word.
 * A glyph always means the same word in every code book, so a child never has to unlearn a symbol;
 * code books differ in WHICH words are used and the order they are taught.
 */

/** N = noun, Vi = verb with no object, Vt = verb with an object, A = describing word, F = function word. */
export type StPos = 'N' | 'Vi' | 'Vt' | 'A' | 'F';

export interface StWord {
  word: string;
  pos: StPos;
  /** Emoji for picture answer options (nouns only). */
  emoji?: string;
  /** What the symbol looks like, in kid words. */
  looks: string;
  /** A tiny picture-story that links the shape to the word. */
  story: string;
}

export const DICTIONARY: StWord[] = [
  { word: 'water', pos: 'N', emoji: '💧', looks: 'wavy lines', story: 'Wavy lines are waves of water.' },
  { word: 'home', pos: 'N', emoji: '🏠', looks: 'a little house', story: 'A house shape is your home.' },
  { word: 'sun', pos: 'N', emoji: '☀️', looks: 'a ring with rays', story: 'Rays shine out of the sun.' },
  { word: 'moon', pos: 'N', emoji: '🌙', looks: 'a thin curve', story: 'A thin curve is the moon at night.' },
  { word: 'tree', pos: 'N', emoji: '🌳', looks: 'a triangle on a stick', story: 'A pointy treetop on a trunk.' },
  { word: 'fish', pos: 'N', emoji: '🐟', looks: 'a shape with a tail', story: 'It swims with its tail.' },
  { word: 'bird', pos: 'N', emoji: '🐦', looks: 'a wide wing shape', story: 'Two wings flapping in the sky.' },
  { word: 'cat', pos: 'N', emoji: '🐈', looks: 'a box with two pointy ears', story: 'Two pointy ears — a cat!' },
  { word: 'ball', pos: 'N', emoji: '⚽', looks: 'a circle with curved lines', story: 'A round beach ball.' },
  { word: 'hill', pos: 'N', emoji: '⛰️', looks: 'two bumps', story: 'Bumpy hills to climb.' },
  { word: 'runs', pos: 'Vi', looks: 'an arrow with speed lines', story: 'Zoom! Running forward.' },
  { word: 'jumps', pos: 'Vi', looks: 'a curved arrow', story: 'Up and over — a jump!' },
  { word: 'sleeps', pos: 'Vi', looks: 'a bed', story: 'A bed is for sleeping.' },
  { word: 'sees', pos: 'Vt', looks: 'an eye', story: 'An eye sees things.' },
  { word: 'eats', pos: 'Vt', looks: 'a fork', story: 'A fork is for eating.' },
  { word: 'likes', pos: 'Vt', looks: 'a heart', story: 'A heart means you like it.' },
  { word: 'big', pos: 'A', looks: 'a tall arrow pointing both ways', story: 'Stretching up and down — big!' },
  { word: 'little', pos: 'A', looks: 'two arrows squeezing in', story: 'Squeezing it small — little!' },
  { word: 'happy', pos: 'A', looks: 'a smile curve', story: 'A smile is happy.' },
  { word: 'fast', pos: 'A', looks: 'a lightning bolt', story: 'Lightning is fast!' },
  { word: 'the', pos: 'F', looks: 'a dot', story: 'A little dot points at “the” thing.' },
  { word: 'and', pos: 'F', looks: 'a plus sign', story: 'Plus means “and” — this AND that.' },
  { word: 'is', pos: 'F', looks: 'an equals sign', story: 'Equals means “is”: the cat IS big.' },
  { word: 'on', pos: 'F', looks: 'a box sitting on a line', story: 'The box is ON the line.' },
];

export const WORDS: Record<string, StWord> = Object.fromEntries(DICTIONARY.map((w) => [w.word, w]));

export const wordsByPos = (pos: StPos) => DICTIONARY.filter((w) => w.pos === pos).map((w) => w.word);

export const isFunctionWord = (w: string) => WORDS[w]?.pos === 'F';
