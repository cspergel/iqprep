/**
 * Vocabulary bank — ORIGINAL items written for Brain Camp (not WISC items).
 *  - Picture items (young): an emoji is shown, "What is this called?"
 *      2 = the exact name, 1 = a broader / related name ("an animal"), 0 = a different thing.
 *  - Word items: "What does ___ mean?"
 *      2 = a precise definition or good synonym, 1 = vague / partial / just an example,
 *      0 = wrong, the opposite, or a sound-alike word.
 */
import { zero, type WhyMap } from '../_verbal/build';
import type { VerbalBankItem } from '../_verbal/types';

type VcSkill = 'noun' | 'verb' | 'adjective' | 'abstract';

const WHY2 = 'Yes! That says exactly what it means.';
const WHY1 = "That's close, but it's only part of the meaning — or just an example. Say what KIND of thing it is and what makes it special.";
const VC_WHY: WhyMap = {
  w: "That's not what it means.",
  x: "That's the opposite!",
  s: "That's a different word — it only sounds a little like this one.",
};
const ZERO_SAMPLE = 'Only acts it out or points (ask: “Tell me in words”)';

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** A word item. `best` is written so it reads well after "WORD means …". */
function V(
  difficulty: number,
  word: string,
  skill: VcSkill,
  best: string,
  part: string,
  z: [string, string],
  example?: string,
): VerbalBankItem {
  const zeros = z.map((raw) => zero(raw, VC_WHY));
  return {
    id: `VC:${word.toLowerCase()}`,
    difficulty,
    prompt: `What does ${word} mean?`,
    choices: [
      { text: best, points: 2, why: WHY2 },
      { text: part, points: 1, why: WHY1 },
      ...zeros,
    ],
    rubric: { two: [best], one: [part], zero: [...zeros.map((c) => c.text), ZERO_SAMPLE] },
    explanation: `${word} means ${lc(best)}.${example ? ` For example: “${example}”` : ''}`,
    skill: `vc:${skill}`,
  };
}

/** A picture-naming item. */
function P(difficulty: number, name: string, emoji: string, part: string, z: [string, string]): VerbalBankItem {
  const a = /^[aeiou]/.test(name) ? 'an' : 'a';
  const best = `${a} ${name}`;
  const zeros = z.map((t) => ({ text: t, points: 0 as const, why: "That's something different." }));
  return {
    id: `VC:pic-${name.replace(/\s+/g, '-')}`,
    difficulty,
    prompt: 'What is this called?',
    picture: emoji,
    pictureLabel: 'Picture to name',
    choices: [
      { text: best, points: 2, why: "Yes! That's its exact name." },
      { text: part, points: 1, why: "That's true, but it isn't the exact name. Try to name exactly what it is." },
      ...zeros,
    ],
    rubric: { two: [best], one: [part], zero: [...z, ZERO_SAMPLE] },
    explanation: `This is ${best}! “${part}” is true, but the exact name earns the most points.`,
    skill: 'vc:picture',
  };
}

export const VC_BANK: VerbalBankItem[] = [
  // ---- picture naming (youngest) ----
  P(4, 'giraffe', '🦒', 'an animal', ['a spotted horse', 'a zebra']),
  P(4, 'umbrella', '☂️', 'something for rain', ['a sun hat', 'a camping tent']),
  P(4.5, 'penguin', '🐧', 'a bird', ['a swimming duck', 'a snowy owl']),
  P(5, 'pair of scissors', '✂️', 'a tool', ['a kitchen knife', 'a pair of salad tongs']),
  P(5, 'octopus', '🐙', 'a sea animal', ['a jellyfish', 'a hermit crab']),
  P(5.5, 'kangaroo', '🦘', 'an animal', ['a big brown rabbit', 'a deer']),
  P(6, 'anchor', '⚓', 'something on a boat', ['a fishing hook', 'a big metal key']),
  P(6.5, 'telescope', '🔭', 'something for looking', ['a microscope', 'a flashlight']),
  P(7, 'microscope', '🔬', 'a science tool', ['a telescope', 'a video camera']),
  P(7.5, 'volcano', '🌋', 'a mountain', ['a grassy hill', 'a dark cave']),

  // ---- age 4–5 ----
  V(4, 'SHOE', 'noun', 'Something you wear on your foot', 'Something with laces that you tie up in a bow', ['w:A kind of hat', 'w:Something yummy you eat for lunch at the table'], 'Put on your shoes before we go outside.'),
  V(4, 'CUP', 'noun', 'A small container you drink from', 'Something that lives on a shelf in the kitchen', ['w:A kind of shoe', 'w:Something soft and cozy that you sleep on at night']),
  V(4, 'JUMP', 'verb', 'To push off the ground and go up into the air', 'Something frogs and bunnies like to do all day long', ['w:To sit very, very still and not move your legs at all', 'w:To eat quickly'], 'Can you jump over the puddle?'),
  V(4, 'HAPPY', 'adjective', 'Feeling glad and good', 'How you might look when you are at a birthday party', ['x:Feeling sad and gloomy, like you want to sit and cry', 'w:Very tired and ready to go to bed']),
  V(4.5, 'BIRD', 'noun', 'An animal with feathers and wings', 'Something you might hear singing up in a tree in the morning', ['w:A kind of fish', 'w:A kind of plant that grows in the garden']),
  V(4.5, 'BOOK', 'noun', 'Pages with words or pictures that you read', 'Something you get at the library', ['w:A toy that bounces up and down', 's:A curved hook for hanging up coats']),
  V(4.5, 'SLEEP', 'verb', 'To rest your body with your eyes closed', 'Something you do every night after you brush your teeth', ['x:To wake up', 'w:To run fast']),
  V(4.5, 'COLD', 'adjective', 'Not warm — low in temperature, like ice', 'How your fingers feel when you play in the winter snow', ['x:Very hot', 'w:Very loud']),
  V(4.5, 'CHAIR', 'noun', 'A seat with a back, for one person', 'Something you can find in the kitchen or the classroom', ['w:A bed for a dog', 'w:A kind of cup you drink warm milk from']),
  V(5, 'TOOTHBRUSH', 'noun', 'A small brush for cleaning your teeth', 'Something you keep in the bathroom', ['w:A comb for your hair', 'w:A kind of food']),
  V(5, 'BREAKFAST', 'noun', 'The first meal of the day', 'A bowl of cereal with milk and a glass of juice', ['w:A meal you eat at night before you go to bed', 'w:A fast car that wins races']),
  V(5, 'HUNGRY', 'adjective', 'Needing or wanting food', 'How you feel when your tummy rumbles and growls', ['x:So full that you cannot eat another bite', 'w:Wanting to lie down and take a long nap']),
  V(5, 'TEACHER', 'noun', 'A person whose job is to help others learn', 'Someone you see at your school every single day', ['w:A person who fixes cars at a garage', 'w:A kid who sits next to you in your class']),
  V(5, 'LISTEN', 'verb', 'To pay attention to sounds or to what someone says', 'Something you do in class at circle time', ['w:To look very closely at something small', 'w:To talk very loudly so everyone hears you']),
  V(5, 'TINY', 'adjective', 'Very, very small', 'Like an ant crawling along the sidewalk', ['x:Very big, like a giant or a huge elephant', 'w:Very fast, like a race car zooming by']),
  V(5.5, 'PILLOW', 'noun', 'A soft cushion for your head in bed', 'Something soft and squishy that you can hug', ['w:A thick, warm blanket that goes on top of you', 's:A tree with long hanging branches']),
  V(5.5, 'SHOUT', 'verb', 'To say something very loudly', 'What people do at a ball game when their team scores', ['x:To whisper so softly nobody can hear', 'w:To sing a song with your friends']),
  V(5.5, 'SOFT', 'adjective', 'Gentle and easy to squish — not hard', 'Like a pillow or a fluffy teddy bear at bedtime', ['x:Hard like a rock', 'w:Very bright']),
  V(5.5, 'KITCHEN', 'noun', 'The room where food is cooked', 'One of the rooms you can find inside your house', ['w:The room where you sleep at night', 's:A fluffy baby cat that likes to chase balls of yarn']),
  V(5.5, 'GIFT', 'noun', 'A present you give to someone', 'Something you might get on your birthday', ['w:A kind of game', 'w:Something you borrow and have to give back']),
  V(5.5, 'QUIET', 'adjective', 'Making little or no sound', 'How it should be when you are in a library', ['x:Very noisy, with lots of banging and yelling', 'w:Very sleepy and ready for a nap']),

  // ---- age 6–7 ----
  V(6, 'BRAVE', 'adjective', 'Ready to do something hard or scary even when you feel afraid', 'Like a firefighter going into a burning building', ['x:Too scared to try anything new or hard', 'w:Very strong, with big muscles']),
  V(6, 'BRIDGE', 'noun', 'Something built over water or a road so people can cross', 'Something that cars and trucks drive on', ['w:A very tall tower in the middle of a city', 's:A cold box in the kitchen for keeping food']),
  V(6, 'FENCE', 'noun', 'A wall of wood or wire around a yard or field', 'Something you might see in a backyard or on a farm', ['w:A big door that opens for a car', 'w:A garden tool for digging holes']),
  V(6, 'WHISPER', 'verb', 'To speak very softly and quietly', 'What you do in the library so you do not bother anyone', ['x:To yell as loudly as you possibly can', 'w:To whistle a happy song through your lips']),
  V(6, 'ISLAND', 'noun', 'Land with water all around it', 'A place with a sandy beach and palm trees', ['w:A very tall mountain covered in snow', 'w:A big boat']),
  V(6, 'SHARE', 'verb', 'To let others have or use some of what you have', 'Giving a friend some of your crayons at art time', ['x:To keep everything for yourself', 'w:To hide your toys']),
  V(6, 'HEAVY', 'adjective', 'Weighing a lot, so it is hard to lift', 'Like a big rock or a giant bag of dog food', ['x:Very light', 'w:Very wet']),
  V(6, 'ROOF', 'noun', 'The covering on top of a building', 'Something up high on a house where birds sit', ['w:The floor of a house, where you walk around all day', 'w:A tall chimney that lets the smoke out']),
  V(6.5, 'MEDICINE', 'noun', 'Something you take to help you get better when you are sick', 'Something the doctor might give you', ['w:A kind of candy you get at the store', 'w:A loud machine that cleans the floor']),
  V(6.5, 'NEIGHBOR', 'noun', 'A person who lives next to or near you', 'A friendly person who always waves and says hello', ['w:A person who works at the grocery store', 'w:A family pet']),
  V(6.5, 'STORM', 'noun', 'Rough weather with strong wind and rain, snow or lightning', 'When it rains outside and you stay in', ['x:A sunny, calm day at the beach', 'w:A big crowd of people at a game']),
  V(6.5, 'POLITE', 'adjective', 'Using good manners and being respectful', 'Saying please and thank you when someone helps you', ['x:Rude and mean to the people around you', 'w:Very shy']),
  V(6.5, 'MESSY', 'adjective', 'Untidy, with things scattered all over', 'Like a bedroom with toys and socks all over the floor', ['x:Neat and clean', 'w:Very old']),
  V(6.5, 'GRAB', 'verb', 'To take hold of something quickly', 'What you do when you try to catch a ball in the air', ['x:To let go of something you were holding', 'w:To throw something as far as you can']),
  V(7, 'CAREFUL', 'adjective', "Paying close attention so you don't make mistakes or get hurt", 'Walking slowly across a slippery floor', ['w:Not worried about anything at all', 'w:Full of cars, like a busy road']),
  V(7, 'ENORMOUS', 'adjective', 'Very, very big', 'Like a whale swimming in the ocean', ['x:Tiny, like a little bug', 'w:Very loud, like a big drum in a parade']),
  V(7, 'DISCOVER', 'verb', 'To find or learn something for the first time', 'Finding a toy you lost a long time ago under your bed', ['w:To hide something', 'w:To put a lid on something']),
  V(7, 'PUDDLE', 'noun', 'A small pool of water on the ground', 'Something you like to splash in with your rain boots', ['w:A big lake where people go fishing in boats', 's:A curly-haired dog']),
  V(7, 'DESERT', 'noun', 'A very dry place that gets little rain', 'A place with lots of sand and some cactus plants', ['s:A sweet food like cake or pie that you eat after dinner', 'w:A thick, rainy forest']),
  V(7, 'ARGUE', 'verb', 'To disagree with someone using strong or angry words', 'Talking loudly with someone', ['x:To agree with everything someone says', 'w:To play a game with your friends']),
  V(7, 'TRAVEL', 'verb', 'To go from one place to another, often far away', 'Going on a plane or a long car ride with your family', ['x:To stay at home', 'w:To build a house']),
  V(7, 'SHIVER', 'verb', 'To shake because you are cold or scared', 'What your body might do when you play in the snow', ['w:To get all hot and sweaty on a sunny day at the beach', 'w:To sneeze loudly']),
  V(7.5, 'CURIOUS', 'adjective', 'Wanting to know or learn about something', 'Asking lots and lots of questions about everything', ['x:Bored and not interested in anything at all', 'w:Angry and grumpy with everyone around you all day long']),
  V(7.5, 'HARBOR', 'noun', 'A safe place by the shore where boats can stay', 'A place where you can see lots and lots of boats bobbing', ['w:A tall lighthouse', 'w:A place where planes land and take off']),
  V(7.5, 'BOAST', 'verb', 'To brag — to talk too proudly about yourself', 'Saying “I’m the best!” over and over again', ['s:To make bread warm and crispy in a toaster', 'w:To help a friend who is having a really hard time']),
  V(7.5, 'RESCUE', 'verb', 'To save someone from danger', 'What lifeguards do at the swimming pool', ['w:To get lost', 'w:To scare someone by jumping out from behind a door']),
  V(7.5, 'COLLECT', 'verb', 'To gather things and keep them together', 'Having lots of stickers in a special book', ['x:To throw things away', 'w:To sell something']),
  V(7.5, 'CAPTAIN', 'noun', 'The leader of a ship or a team', 'Someone you might see on a big boat', ['w:A sailor who cooks food for everyone on a ship', 'w:A kind of hat you wear in the sun']),

  // ---- age 8–9 ----
  V(8, 'FRAGILE', 'adjective', 'Easy to break', 'Like a glass that you have to hold carefully', ['x:Very strong and hard to hurt', 'w:Very heavy and hard to pick up off the floor']),
  V(8, 'EXPLORE', 'verb', 'To travel around a place to learn about it', 'Going into a dark cave with a flashlight', ['w:To sleep all day', 's:To blow up with a loud bang']),
  V(8, 'CENTURY', 'noun', 'One hundred years', 'A really long time, longer than you can remember', ['w:Ten years in a row', 's:A guard who stands and keeps watch']),
  V(8, 'CONFUSED', 'adjective', 'Not able to understand or think clearly', 'Scratching your head and saying “Huh?”', ['x:Very sure about something', 'w:Very sleepy']),
  V(8, 'PREDICT', 'verb', 'To say what you think will happen before it happens', 'What the weather reporter does on the news every night', ['w:To remember the past', 'w:To protect someone']),
  V(8, 'NERVOUS', 'adjective', 'Worried or a little scared about what might happen', 'Having butterflies in your tummy before a big spelling test', ['x:Calm and relaxed', 'w:Very hungry']),
  V(8, 'GENTLE', 'adjective', 'Kind and careful — not rough', 'Petting a kitten softly with one finger', ['x:Rough and pushy with everyone', 'w:Very loud, like a marching band in a parade']),
  V(8, 'DECORATE', 'verb', 'To make something look nicer by adding pretty things to it', 'Putting up balloons for a party', ['w:To clean something with soap and water', 'w:To break something into little pieces']),
  V(8.5, 'ANCIENT', 'adjective', 'Very, very old — from long ago', 'Like an old stone castle on top of a hill', ['x:Brand new, just out of the box', 'w:Very large, as big as a building in a city']),
  V(8.5, 'IMITATE', 'verb', 'To copy the way someone acts or talks', 'What a parrot does when it hears you talk', ['w:To invite someone over to play', 'w:To get angry']),
  V(8.5, 'PREDATOR', 'noun', 'An animal that hunts and eats other animals', 'A lion, a shark or a big hungry wolf', ['w:A gentle animal that only eats plants and leaves', 'w:A baby animal']),
  V(8.5, 'VOLUNTEER', 'verb', 'To offer to help without being made to or paid', 'Helping out at the school bake sale', ['w:To be forced to do a job you do not want', 'w:To win a prize']),
  V(8.5, 'VANISH', 'verb', 'To disappear suddenly', 'What a magician’s rabbit does in a magic show', ['x:To show up all of a sudden', 's:To paint a shiny, clear coat on a wooden table']),
  V(8.5, 'MAGNIFY', 'verb', 'To make something look bigger than it really is', 'What you do with a microscope', ['x:To make something look smaller', 's:To stick something on with a magnet']),
  V(8.5, 'CONTINENT', 'noun', 'One of the seven huge areas of land on Earth', 'A really big piece of land you can find on a map', ['w:A small island', 'w:A kind of ocean']),
  V(9, 'GENEROUS', 'adjective', 'Happy to give and share with others', 'Giving someone a gift on their birthday', ['x:Selfish and wanting to keep everything', 'w:Very rich']),
  V(9, 'DROUGHT', 'noun', 'A long time with little or no rain', 'When the plants and grass dry up and turn brown', ['x:A big flood that covers the streets', 's:A cold wind that sneaks in through a crack in a window']),
  V(9, 'HABITAT', 'noun', 'The natural home of an animal or plant', 'A big forest where lots of animals and trees live', ['s:Something you do again and again', 'w:A kind of hat']),
  V(9, 'OBEY', 'verb', 'To do what a rule or a person in charge tells you', 'Listening to your teacher', ['x:To break the rules on purpose', 'w:To ask a question']),
  V(9, 'CONCEAL', 'verb', 'To hide something so it cannot be seen', 'Putting a birthday present in the back of the closet', ['x:To show something off to everyone', 'w:To glue something']),
  V(9, 'CAUTIOUS', 'adjective', 'Careful to avoid danger or mistakes', 'Walking slowly and carefully on slippery ice', ['x:Reckless — doing risky things without thinking', 'w:Very excited']),
  V(9, 'MIGRATE', 'verb', 'To move from one region to another, often with the seasons', 'What some birds do in the fall', ['w:To build a nest high up in a tree', 'To sleep all winter in a cozy den || That’s a different word: HIBERNATE.']),
  V(9, 'RIVAL', 'noun', 'Someone you compete against', 'The other team on the field at a soccer game', ['x:A teammate who passes you the ball so you can score', 's:The moment someone gets here']),
  V(9, 'DEVOUR', 'verb', 'To eat something hungrily and quickly', 'Eating a whole pizza all by yourself', ['w:To cook something slowly in the oven', 'w:To share a meal with your whole family']),
  V(9.5, 'TRANSPARENT', 'adjective', 'Clear enough to see through', 'Like the glass in a window or a fish tank', ['x:Too dark to see through at all', 'w:Very shiny, like a new coin']),
  V(9.5, 'EXAGGERATE', 'verb', 'To make something sound bigger or more than it really is', 'Telling a big fish story at dinner', ['x:To tell exactly what happened', 'w:To whisper a secret to a friend']),
  V(9.5, 'ABSORB', 'verb', 'To soak up something, like a liquid', 'What a sponge does when you put it in the bath', ['w:To spill something sticky all over the kitchen table', 'w:To bounce off something and fly away']),
  V(9.5, 'CONFIDENT', 'adjective', 'Feeling sure of yourself and what you can do', 'Raising your hand high when the teacher asks something', ['x:Unsure and doubtful', 's:Kept secret']),
  V(9.5, 'INVESTIGATE', 'verb', 'To look into something carefully to find out the truth', 'What detectives do on TV shows', ['w:To make up a silly story', 's:To put money into a business']),
  V(9.5, 'TRADITION', 'abstract', 'A custom or belief passed down from older people to younger people', 'A special meal your family has every holiday', ['x:A brand-new idea nobody has had before', 'w:A kind of train']),
  V(9.5, 'ENDANGERED', 'adjective', 'At risk of dying out and disappearing forever', 'Being in trouble and needing some help', ['w:Very dangerous to people', 'w:Very common and easy to find everywhere']),
  V(9.5, 'ASSIST', 'verb', 'To help someone', 'Passing the ball to a teammate in a game', ['x:To stop someone from doing something', 's:To keep saying you are right']),

  // ---- age 10–11 ----
  V(10, 'ABUNDANT', 'adjective', 'More than enough; plentiful', 'Lots and lots of apples on a tree', ['x:Very scarce and hard to find anywhere', 'w:Very bright']),
  V(10, 'PERSUADE', 'verb', 'To get someone to agree or do something by giving reasons', 'Asking your parents again and again for dessert', ['w:To force someone to do something they hate', 's:To chase after someone']),
  V(10, 'FLEXIBLE', 'adjective', 'Able to bend easily without breaking — or to change easily', 'Like a gymnast doing the splits', ['x:Stiff and hard to bend at all', 'w:Very fast']),
  V(10, 'HESITATE', 'verb', 'To pause before doing something because you are unsure', 'Standing at the edge of the pool and not jumping in right away', ['x:To rush ahead without stopping', 'w:To hate something']),
  V(10, 'OBSTACLE', 'noun', 'Something in your way that makes it hard to go on', 'A big log lying across the path in the woods', ['w:A prize at the end of a race', 'w:A short rest']),
  V(10, 'ACCURATE', 'adjective', 'Exactly right, with no mistakes', 'Hitting the middle of the target with an arrow', ['w:Very quick, done in just a few seconds', 'w:Almost right, but with a few small mistakes here and there']),
  V(10, 'PRECIOUS', 'adjective', 'Very valuable or dearly loved', 'Like jewels in a treasure chest', ['x:Worth nothing at all, like old junk', 'w:Very bossy, always telling others what to do']),
  V(10, 'BOUNDARY', 'noun', 'A line that marks the edge of an area', 'A fence that goes all the way around a big farm', ['s:A big leap up into the air', 'w:The middle of a place']),
  V(10.5, 'SOLITARY', 'adjective', 'Alone — living or done by yourself', 'A cat sitting by itself on a windowsill', ['x:Full of friends and always in a crowd', 's:Very clean and free of any germs, like a hospital']),
  V(10.5, 'COLLAPSE', 'verb', 'To fall down or cave in suddenly', 'What a sandcastle does when a big wave hits it', ['x:To build something up higher and higher', 's:To clap your hands']),
  V(10.5, 'NUTRITIOUS', 'adjective', 'Full of the good things your body needs to grow and stay healthy', 'Like carrots, broccoli and other vegetables', ['w:Tasting very sweet, like candy', 'w:Making you sick to your stomach']),
  V(10.5, 'ARCHITECT', 'noun', 'A person who designs buildings', 'Someone whose work has something to do with buildings', ['s:Someone who shoots a bow and arrow', 'w:A person who paints the outside of houses']),
  V(10.5, 'EVIDENCE', 'abstract', 'Facts or things that show something is true', 'A muddy footprint found next to the cookie jar', ['w:A wild guess', 'w:A secret plan']),
  V(10.5, 'MISCHIEF', 'abstract', 'Playful behavior that causes small trouble', 'Hiding your brother’s shoes so he can’t find them', ['w:A serious crime', 's:A cloth for blowing your nose']),
  V(10.5, 'TOLERATE', 'verb', 'To put up with something you do not like', 'Sitting all the way through a long, boring show', ['w:To love something more than anything', 'w:To tell on someone']),
  V(11, 'SCARCE', 'adjective', 'Hard to find because there is very little of it', 'Like water in a hot, dry desert', ['x:Plentiful — more than you could ever use', 's:Frightened']),
  V(11, 'RELUCTANT', 'adjective', 'Not wanting to do something', 'Dragging your feet when it is time to do chores', ['x:Eager and excited to get started', 'w:Very shiny, like a polished car']),
  V(11, 'CONSEQUENCE', 'abstract', 'Something that happens as a result of something else', 'Getting soaking wet because you forgot your umbrella at home', ['w:A lucky surprise', 's:The order things come in']),
  V(11, 'FATIGUE', 'noun', 'Being very tired', 'How you feel after running a long race', ['w:Being very hungry for a big snack', 'w:Being very excited about a trip']),
  V(11, 'PERSEVERE', 'verb', 'To keep trying even when something is hard', 'Practicing piano every day for a whole year', ['x:To give up as soon as it gets hard', 's:To save something so it lasts']),
  V(11, 'HAZARD', 'noun', 'A danger — something that could cause harm', 'A wet floor in the school hallway', ['w:A kind of game played with dice', 'x:A safe place']),
  V(11, 'DILIGENT', 'adjective', 'Working hard and carefully', 'Doing all your homework before you go out to play', ['x:Lazy and not wanting to do any work', 'w:Very smart and good at every single subject in school']),
  V(11.5, 'AMBITION', 'abstract', 'A strong wish to achieve something', 'Wanting to be an astronaut when you grow up', ['w:A feeling of being lost and not knowing where to go', 'x:Not wanting to try anything']),
  V(11.5, 'FRUGAL', 'adjective', 'Careful about spending money; not wasteful', 'Buying things when they are on sale at the store', ['x:Wasteful with money', 's:Having to do with fruit']),
  V(11.5, 'ANTICIPATE', 'verb', 'To expect something and get ready for it', 'Waiting and waiting for your birthday to come', ['w:To forget about something', 'w:To be against something']),
  V(11.5, 'DORMANT', 'adjective', 'Asleep or inactive for now, but able to wake up later', 'A quiet volcano that has not erupted', ['w:Dead forever and never coming back', 's:A room where students sleep']),
  V(11.5, 'CONCISE', 'adjective', 'Short and clear, using few words', 'Like a short note you leave on the fridge', ['x:Long and full of lots of extra words', 'w:Very confusing and hard to follow from start to finish']),
  V(11.5, 'COMPROMISE', 'abstract', 'An agreement where each side gives up a little', 'Taking turns choosing which show the family watches', ['w:A promise you break', 'w:Winning an argument']),

  // ---- age 12–13 ----
  V(12, 'DILEMMA', 'abstract', 'A hard choice between two options', 'A problem that you have to think about', ['w:An easy decision', 's:A kind of lemon drink you have in summer']),
  V(12, 'ADEQUATE', 'adjective', 'Good enough for what is needed', 'Something that is sort of okay, I guess', ['w:Excellent and perfect in every single way', 'x:Not nearly enough of what you need']),
  V(12, 'TEDIOUS', 'adjective', 'Long, slow and boring', 'Like folding a huge pile of laundry', ['x:Exciting and full of surprises', 'w:Very tidy and well organized']),
  V(12, 'HOSTILE', 'adjective', 'Unfriendly and ready to fight', 'Like a dog growling at the gate', ['x:Welcoming', 's:A cheap place for travelers to sleep']),
  V(12, 'OBSOLETE', 'adjective', 'No longer used because something newer replaced it', 'Really old, like something you’d find in your grandparents’ attic', ['x:Brand new', 'w:Very expensive']),
  V(12, 'NOVICE', 'noun', 'A beginner who is new at something', 'Some kind of person who is learning stuff', ['x:An expert who knows everything about it', 's:A long made-up story that fills a whole book']),
  V(12, 'VIVID', 'adjective', 'Very bright, clear or lively', 'Bright colors, like in a painting', ['x:Dull and faded, like an old shirt', 'w:Very sleepy and hard to wake up']),
  V(12.5, 'DIVERSE', 'adjective', 'Made up of many different kinds', 'A really big group of people or things', ['x:All the same', 's:Swimming underwater with a mask and flippers']),
  V(12.5, 'RESILIENT', 'adjective', 'Able to recover quickly after something hard', 'Getting back up again', ['w:Easily broken and slow to heal', 's:Making no sound at all']),
  V(12.5, 'VERSATILE', 'adjective', 'Able to do many different things well', 'A really good athlete on the school team', ['x:Good at only one thing', 'w:Changing your mind a lot']),
  V(12.5, 'SURPLUS', 'noun', 'An extra amount beyond what is needed', 'Leftovers from dinner', ['x:A shortage, when there isn’t enough', 'w:A surprise party that you were not expecting']),
  V(13, 'METICULOUS', 'adjective', 'Extremely careful about every small detail', 'Neat and tidy, I think', ['x:Sloppy and careless about the small stuff', 'w:Very fast']),
  V(13, 'SKEPTICAL', 'adjective', 'Doubting whether something is true', 'Sort of not sure about something or other', ['x:Believing everything that anyone tells you', 's:Looking bony and spooky, like a skeleton']),
  V(13, 'AMBIGUOUS', 'adjective', 'Having more than one possible meaning; unclear', 'Confusing in some way', ['x:Perfectly clear', 's:Able to use both hands equally well for writing']),
  V(13, 'EMPATHY', 'abstract', 'Understanding and sharing how someone else feels', 'Being nice to people', ['x:Not caring about others', 's:Being empty']),
  V(13, 'IMPARTIAL', 'adjective', 'Fair to everyone; not taking sides', 'Like a referee at a basketball game', ['s:Only partly finished', 'x:Favoring your friends over everyone else']),
  V(13, 'CONTEMPLATE', 'verb', 'To think deeply about something for a long time', 'Thinking about stuff', ['x:To act without thinking first', 'w:To complain about something you don’t like']),
  V(13, 'BENEVOLENT', 'adjective', 'Kind and wanting to do good for others', 'Nice to people', ['x:Cruel and enjoying being mean to others', 'w:Very powerful']),
  V(13.5, 'INEVITABLE', 'adjective', 'Certain to happen; impossible to avoid', 'Something that will probably happen, maybe', ['x:Impossible — it could never happen', 's:Not able to be seen by anyone']),
  V(13.5, 'PRUDENT', 'adjective', 'Wise and careful when making choices', 'Careful', ['x:Reckless and quick to take wild risks', 's:Very proud of yourself']),
  V(13.5, 'TENACIOUS', 'adjective', 'Holding on firmly; not giving up', 'Stubborn, like someone who won’t budge', ['x:Giving up easily when things get tough', 's:Very good at playing tennis or ping-pong']),
  V(13.5, 'ALLEVIATE', 'verb', 'To make pain or a problem less severe', 'To help with something somehow', ['x:To make a problem even worse', 's:To lift something up high']),

  // ---- age 14–16 ----
  V(14, 'ARBITRARY', 'adjective', 'Based on a random choice or whim, not on a reason', 'Unfair, or just kind of strange', ['x:Carefully planned out step by step', 's:Having to do with trees']),
  V(14, 'INTEGRITY', 'abstract', 'Being honest and doing what is right even when no one is watching', 'Being a good person in general', ['w:Being very smart', 's:A whole number in math']),
  V(14, 'CONSENSUS', 'abstract', 'General agreement among a group', 'When people vote on something together', ['s:An official count of the people in a country', 'x:A big argument where nobody agrees']),
  V(14, 'PRAGMATIC', 'adjective', 'Practical — focused on what actually works', 'Making some kind of plan for something', ['x:Dreamy and unrealistic, with your head in the clouds', 's:Very dramatic']),
  V(14, 'ELOQUENT', 'adjective', 'Able to speak or write in a clear, powerful way', 'Talking a lot to lots of people', ['x:Mumbling and unclear', 's:Stylish and graceful in dress']),
  V(14, 'OBSTINATE', 'adjective', 'Stubbornly refusing to change your mind', 'Difficult and hard to get along with, sometimes', ['x:Easily persuaded', 's:Getting in the way of something']),
  V(14.5, 'MITIGATE', 'verb', 'To make something less harsh or serious', 'To help out in some way', ['x:To make something worse', 's:To move to a new region']),
  V(14.5, 'PARADOX', 'abstract', 'A statement that seems to contradict itself but may be true', 'A kind of puzzle or a tricky thing', ['w:Two doctors who work together', 'w:A simple fact that everyone agrees on']),
  V(14.5, 'CATALYST', 'abstract', 'Something that causes or speeds up a change', 'Something that helps in some way', ['s:A booklet that lists all the things a store sells', 'x:Something that slows things down']),
  V(15, 'EPHEMERAL', 'adjective', 'Lasting for a very short time', 'Fast, or quick in some kind of way', ['x:Lasting forever and never ending at all', 'w:Very thin, like a sheet of paper']),
  V(15, 'AUDACIOUS', 'adjective', 'Very bold and daring', 'Brave, I think — like a hero or something', ['s:Very loud, so everyone can hear it', 'x:Shy and timid around new people']),
  V(15, 'COMPLACENT', 'adjective', 'Too pleased with yourself to notice dangers or try harder', 'Happy and feeling fine', ['w:Always complaining about everything', 's:Ready to obey and go along']),
  V(15, 'REDUNDANT', 'adjective', 'Not needed because it repeats something already there', 'Extra, like something added', ['x:Very important, something you could never do without', 'w:Red in color']),
  V(15.5, 'UBIQUITOUS', 'adjective', 'Found everywhere', 'Common, like something you see a lot', ['x:Very rare and almost impossible to find', 'w:Strange, weird and a little bit spooky']),
  V(15.5, 'ESOTERIC', 'adjective', 'Understood by only a small group with special knowledge', 'Hard to do, kind of tricky', ['x:Known by everyone', 'w:Very old and falling apart']),
  V(15.5, 'MAGNANIMOUS', 'adjective', 'Generous and forgiving, especially toward a rival', 'Nice to people, in a way', ['w:Very large and heavy, like a giant mountain or a ship', 'x:Holding a grudge']),
  V(16, 'PERFUNCTORY', 'adjective', 'Done quickly and without care, just to get it over with', 'Something done fast', ['x:Done perfectly and with care', 's:Full of perfume and smelling sweet']),
  V(16, 'INSIDIOUS', 'adjective', 'Harmful in a slow, sneaky way that is hard to notice', 'Bad, in some kind of way', ['s:Tucked away inside something else', 'x:Obvious and loud, so that everyone notices it right away']),
  V(16, 'EQUANIMITY', 'abstract', 'Calmness, especially in a hard situation', 'Being quiet and still, kind of', ['s:Being equal in size, shape and weight', 'x:Panic, with lots of worry when everything goes wrong']),
];
