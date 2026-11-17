/**
 * Similarities bank — ORIGINAL pairs written for IQ Prep (not WISC items).
 * Every item is a spoken/written pair: "How are X and Y alike?"
 *   2 points: the key category or essential shared idea ("both are fruit").
 *   1 point:  a concrete, partial or minor likeness ("both are sweet").
 *   0 points: a difference, something true of only one, or untrue.
 */
import { slug, zero, type WhyMap } from '../_verbal/build';
import type { VerbalBankItem } from '../_verbal/types';

type SiSkill = 'category' | 'function' | 'property' | 'abstract';

const WHY2: Record<SiSkill, string> = {
  category: "That's the group they both belong to — the best kind of answer!",
  function: "That's the important job they both do — a great answer!",
  property: "That's the most important thing they share — a great answer!",
  abstract: "That's the big idea they share — a great answer!",
};

const WHY1 = "It's true, but it's only a small detail. A group name or big idea tells more.";

const SI_WHY: WhyMap = {
  w: "That isn't true for both of them.",
};

const LEAD: Record<SiSkill, (key: string) => string> = {
  category: (k) => `Try a word for the whole group: they are both ${k}!`,
  function: (k) => `Think about what they are FOR: they both ${k}!`,
  property: (k) => `Think about the most important thing they share: they both ${k}!`,
  abstract: (k) => `Look for the big idea: they are both ${k}!`,
};

/**
 * @param a     first thing, with the key word(s) in CAPITALS, e.g. "an APPLE"
 * @param key   finishes the teaching sentence ("they are both ___" / "they both ___")
 * @param best  the 2-point answer
 * @param part  the 1-point answer
 * @param z     two 0-point answers ("code:text")
 */
function S(
  difficulty: number,
  a: string,
  b: string,
  skill: SiSkill,
  key: string,
  best: string,
  part: string,
  z: [string, string],
  note?: string,
): VerbalBankItem {
  const zeros = z.map((raw) => zero(raw, SI_WHY));
  return {
    id: `SI:${slug(a)}-${slug(b)}`,
    difficulty,
    prompt: `How are ${a} and ${b} alike?`,
    choices: [
      { text: best, points: 2, why: WHY2[skill] },
      { text: part, points: 1, why: WHY1 },
      ...zeros,
    ],
    rubric: {
      two: [best],
      one: [part],
      zero: [...zeros.map((c) => c.text), "They're both things. (too general)"],
    },
    explanation: `${LEAD[skill](key)} "${part}" is true, but it's only a small detail.${note ? ' ' + note : ''}`,
    skill: `si:${skill}`,
  };
}

export const SI_BANK: VerbalBankItem[] = [
  // ---- age 4–5: very concrete, familiar pairs ----
  S(4, 'a CAT', 'a DOG', 'category', 'ANIMALS', 'Both are animals', 'Both have soft fur', ['d:A dog barks and a cat meows', 'w:Both can fly high']),
  S(4, 'an APPLE', 'a BANANA', 'category', 'FRUIT', 'Both are fruit', 'Both taste sweet', ['d:An apple is red and a banana is yellow', 'w:Both are vegetables'], 'Lots of things are sweet, like candy — "fruit" names their group.'),
  S(4, 'RED', 'BLUE', 'category', 'COLORS', 'Both are colors', 'Both are crayons in the box', ['d:Red and blue look different', 'w:Both are shapes']),
  S(4.5, 'a SHIRT', 'SHOES', 'category', 'CLOTHES (things you wear)', 'Both are clothes you wear', 'Both can go in your closet', ['d:Shoes go on your feet and a shirt goes on your body', 'w:Both are things you eat']),
  S(4.5, 'MILK', 'JUICE', 'category', 'DRINKS', 'Both are drinks', 'Both can come in a carton', ['d:Milk is white and juice is orange', 'w:Both are foods you chew']),
  S(4.5, 'a SPOON', 'a FORK', 'function', 'help you EAT', 'Both are things you eat with', 'Both are shiny', ['d:A fork is pointy and a spoon is round', 'w:Both are used for writing']),
  S(4.5, 'a BALL', 'a DOLL', 'category', 'TOYS', 'Both are toys', 'Both can be kept in a toy box', ['d:You throw a ball but you hug a doll', 'w:Both are foods']),
  S(5, 'a COW', 'a PIG', 'category', 'FARM ANIMALS', 'Both are farm animals', 'Both have four legs and a tail', ['d:A cow says moo and a pig says oink', 'w:Both are birds that lay eggs']),
  S(5, 'BREAD', 'CHEESE', 'category', 'FOODS', 'Both are foods', 'Both can go in a sandwich', ['o:Cheese is made from milk', 'w:Both are drinks']),
  S(5, 'a PEN', 'a PENCIL', 'function', 'are tools for WRITING', 'Both are tools for writing', 'Both are long and thin', ['d:You can erase a pencil but not a pen', 'w:Both are for cutting']),
  S(5, 'a CIRCLE', 'a SQUARE', 'category', 'SHAPES', 'Both are shapes', 'Both can be drawn on paper', ['d:A square has corners and a circle does not', 'w:Both are numbers']),
  S(5, 'FIVE', 'TEN', 'category', 'NUMBERS', 'Both are numbers', 'Both can be shown with your fingers', ['d:Ten is bigger than five', 'w:Both are letters']),
  S(5.5, 'a TRAIN', 'an AIRPLANE', 'function', 'CARRY PEOPLE from place to place', 'Both carry people from place to place', 'Both have windows', ['d:A plane flies and a train rolls on tracks', 'w:Both float on water']),
  S(5.5, 'a HAT', 'a MITTEN', 'function', 'are clothes that KEEP YOU WARM', 'Both are clothes that keep you warm', 'Both are soft and fuzzy, and can come in bright colors', ['o:A mitten goes on your hand', 'w:Both are toys']),
  S(5.5, 'a BEAR', 'a LION', 'category', 'WILD ANIMALS', 'Both are wild animals', 'Both are big and furry', ['d:A lion has a mane and a bear does not', 'w:Both are pets that live in houses']),
  S(5.5, 'a CARROT', 'BROCCOLI', 'category', 'VEGETABLES', 'Both are vegetables', 'Both grow in a garden', ['d:A carrot is orange and broccoli is green', 'w:Both are drinks you pour in a cup']),
  S(5.5, 'a PUPPY', 'a KITTEN', 'category', 'BABY ANIMALS', 'Both are baby animals', 'Both are soft and furry', ['d:A puppy grows into a dog and a kitten grows into a cat', 'w:Both live in the ocean']),
  S(5.5, 'a CUP', 'a BOWL', 'function', 'are dishes that HOLD food or drinks', 'Both are dishes that hold food or drinks', 'Both are in the kitchen', ['d:A cup has a handle on the side and a bowl does not', 'w:Both are clothes']),
  // ---- age 6–7 ----
  S(6, 'a BED', 'a CHAIR', 'category', 'FURNITURE', 'Both are furniture', 'Both have legs that stand on the floor', ['d:You sleep in a bed and sit on a chair', 'w:Both are foods you can eat']),
  S(6, 'a BOAT', 'a CAR', 'function', 'CARRY PEOPLE where they want to go', 'Both are vehicles that carry people', 'Both have seats', ['d:A boat goes on water and a car goes on roads', 'w:Both can fly']),
  S(6, 'RAIN', 'SNOW', 'category', 'WEATHER that falls from clouds', 'Both are kinds of weather that fall from clouds', 'Both can make you wet', ['d:Snow is white and fluffy but rain is clear and runs away', 'w:Both are hot']),
  S(6, 'MORNING', 'NIGHT', 'category', 'TIMES OF DAY', 'Both are times of day', 'Both happen every day', ['d:It is dark at night and light in the morning', 'w:Both are seasons']),
  S(6, 'an EAGLE', 'a PARROT', 'category', 'BIRDS', 'Both are birds', 'Both have feathers', ['o:A parrot can copy words', 'w:Both are fish that swim']),
  S(6, 'HAPPY', 'SAD', 'category', 'FEELINGS', 'Both are feelings', 'You can see both on a face', ['d:Happy feels good and sad does not', 'w:Both are colors in a rainbow']),
  S(6.5, 'a PIANO', 'a DRUM', 'category', 'MUSICAL INSTRUMENTS', 'Both are musical instruments', 'Both make loud or soft sounds', ['d:You hit a drum but press piano keys', 'w:Both are toys you ride around outside']),
  S(6.5, 'a KNIFE', 'SCISSORS', 'function', 'are tools for CUTTING', 'Both are tools for cutting', 'Both are sharp', ['d:Scissors have two blades and a knife has one', 'w:Both are used for eating soup']),
  S(6.5, 'a BEE', 'a BUTTERFLY', 'category', 'INSECTS', 'Both are insects', 'Both have wings', ['o:A bee can sting', 'w:Both are birds']),
  S(6.5, 'a WHEEL', 'a BALL', 'property', 'are ROUND, so they ROLL', 'Both are round, so they can roll', 'Both can be made of rubber', ['o:A ball can bounce high', 'w:Both are square']),
  S(6.5, 'a SINK', 'a BATHTUB', 'function', 'HOLD WATER for washing', 'Both hold water for washing', 'Both have a drain', ['d:You wash your hands in a sink and your body in a tub', 'w:Both are in the garden']),
  S(6.5, 'a KITE', 'a BALLOON', 'property', 'can FLOAT UP in the air', 'Both can float up in the air', 'Both can have strings', ['d:A kite needs wind and a balloon needs air inside', 'w:Both can swim']),
  S(7, 'the SUN', 'a LAMP', 'function', 'GIVE US LIGHT', 'Both give us light', 'Both can be hot', ['d:The sun is in the sky and a lamp is in a house', 'w:Both run on batteries']),
  S(7, 'a HAMMER', 'a SAW', 'category', 'TOOLS for building', 'Both are tools for building', 'Both have handles', ['d:A saw cuts and a hammer pounds', 'w:Both are kitchen dishes']),
  S(7, 'SPRING', 'WINTER', 'category', 'SEASONS', 'Both are seasons of the year', 'Both have weather', ['d:Winter is cold and spring is warm', 'w:Both are months']),
  S(7, 'a CANDLE', 'a FLASHLIGHT', 'function', 'GIVE LIGHT in the dark', 'Both give light in the dark', 'Both can be carried', ['d:A candle has a flame and a flashlight uses batteries', 'w:Both make music']),
  S(7, 'a BICYCLE', 'a SKATEBOARD', 'function', 'are things you RIDE to get around', 'Both are things you ride to get around', 'Both have wheels', ['d:A bike has pedals and a skateboard does not', 'w:Both run on gas']),
  S(7, 'SOAP', 'SHAMPOO', 'function', 'help you GET CLEAN', 'Both are used to get clean', 'Both make bubbles', ['o:Shampoo is for washing hair', 'w:Both are foods']),
  S(7.5, 'a POLICE OFFICER', 'a FIREFIGHTER', 'function', 'are workers who KEEP PEOPLE SAFE', 'Both are workers who keep people safe', 'Both wear uniforms', ['d:A firefighter rides a fire truck and a police officer drives a police car', 'w:Both are doctors']),
  S(7.5, 'a BOOK', 'a NEWSPAPER', 'function', 'are things you READ', 'Both are things you read', 'Both are made of paper', ['o:A newspaper comes out every day', 'w:Both are for listening to music']),
  S(7.5, 'a SOCK', 'a GLOVE', 'function', 'are clothes that COVER and WARM part of your body', 'Both are clothes that cover and warm a part of your body', 'Both come in pairs, one for the left and one for the right', ['o:A glove has fingers', 'w:Both go on your head']),
  S(7.5, 'SALT', 'PEPPER', 'function', 'are SEASONINGS that add flavor to food', 'Both are seasonings that add flavor to food', 'Both come in little shakers that sit on the table', ['d:Salt is white and pepper is black', 'w:Both are sweet']),
  S(7.5, 'RUNNING', 'SWIMMING', 'category', 'kinds of EXERCISE', 'Both are kinds of exercise (ways to move your body)', 'Both can make you tired', ['d:You swim in a pool or lake, but you run on the ground or a track', 'w:Both are things you do while sleeping']),
  // ---- age 8–9 ----
  S(8, 'an EYE', 'an EAR', 'category', 'SENSE ORGANS that tell you about the world', 'Both are body parts for sensing the world (senses)', 'You have two of each', ['d:You see things with your eyes, but you hear sounds with your ears', 'w:Both are on your feet']),
  S(8, 'an ELBOW', 'a KNEE', 'category', 'JOINTS that let your body bend', 'Both are joints that let your body bend', 'Both are parts of your body', ['d:A knee is on your leg and an elbow is on your arm', 'w:Both are bones in your head'], '"Parts of your body" is true of a nose or a toe too — "joints" is more exact.'),
  S(8, 'a COAT', 'an UMBRELLA', 'function', 'PROTECT YOU from the weather', 'Both protect you from the weather', 'Both are things you take outside', ['d:You wear a coat but you hold an umbrella', 'w:Both keep you cool in summer']),
  S(8, 'a CLOCK', 'a CALENDAR', 'function', 'help us KEEP TRACK OF TIME', 'Both help us keep track of time', 'Both have numbers on them', ['d:A clock shows hours and a calendar shows days', 'w:Both make music']),
  S(8, 'a DOOR', 'a WINDOW', 'function', 'are OPENINGS in a wall that open and close', 'Both are openings in a wall that can open and close', 'Both are part of a house', ['o:You walk through a door to go in and out of the house', 'w:Both are furniture']),
  S(8, 'LAUGHING', 'CRYING', 'abstract', 'ways we SHOW OUR FEELINGS', 'Both are ways we show our feelings', 'Both make noise', ['d:You laugh when happy and cry when sad', 'w:Both are things you eat']),
  S(8.5, 'a SHARK', 'a WHALE', 'category', 'SEA ANIMALS', 'Both are animals that live in the sea', 'Both are big swimmers', ['o:A whale has to swim up to the top to breathe air', "Both are fish || A whale is not a fish — it's a mammal that breathes air."]),
  S(8.5, 'an OVEN', 'a REFRIGERATOR', 'category', 'KITCHEN MACHINES (appliances) for food', 'Both are kitchen machines (appliances) for food', 'Both have doors', ['d:An oven gets very hot but a fridge stays cold inside', 'w:Both are for washing clothes']),
  S(8.5, 'a TEACHER', 'a DOCTOR', 'function', 'have JOBS HELPING PEOPLE', 'Both have jobs helping people', 'Both are grown-ups', ['d:A doctor helps sick people and a teacher helps students learn', 'w:Both are kids']),
  S(8.5, 'a MINUTE', 'an HOUR', 'category', 'UNITS OF TIME', 'Both are units of time', 'Both are shown on a clock', ['d:An hour is longer than a minute', 'w:Both measure how heavy something is']),
  S(8.5, 'a NEST', 'a CAVE', 'function', 'are HOMES where animals live', 'Both are places where animals live (shelters)', 'Both are found in nature', ['o:Birds build nests', 'w:Both are made by people']),
  S(9, 'GOLD', 'SILVER', 'category', 'METALS', 'Both are metals', 'Both are shiny and pretty', ['d:Gold is yellow and silver is gray', 'w:Both are made of wood']),
  S(9, 'a RIVER', 'a LAKE', 'category', 'BODIES OF WATER', 'Both are bodies of water', 'Both can have fish', ['d:A river flows and a lake stays still', 'w:Both are made of sand']),
  S(9, 'EARTH', 'MARS', 'category', 'PLANETS', 'Both are planets', 'Both are round like a ball', ['o:Earth has lots of water and life', 'w:Both are stars that shine at night']),
  S(9, 'a SCHOOL', 'a LIBRARY', 'function', 'are places where people go to LEARN', 'Both are places where people go to learn', 'Both have lots of books, tables, chairs and shelves', ['o:A library lets you borrow books', 'w:Both are stores that sell toys']),
  S(9, 'a NOSE', 'a TONGUE', 'category', 'SENSE ORGANS (for smell and taste)', 'Both are sense organs (for smelling and tasting)', 'Both are on your head', ['d:You smell with your nose and taste with your tongue', 'w:Both help you hear']),
  S(9, 'SUGAR', 'HONEY', 'function', 'are SWEETENERS that make food sweet', 'Both are sweeteners that make food sweet', 'Both are kept in the kitchen', ['o:Honey is made by bees', 'w:Both are salty']),
  S(9.5, 'a TELEPHONE', 'a LETTER', 'function', 'are ways to COMMUNICATE', 'Both are ways to communicate with someone', 'Both can be used to say hello', ['d:A letter is written and a phone call is spoken', 'w:Both are kinds of food']),
  S(9.5, 'a MOUNTAIN', 'a HILL', 'category', 'RAISED PARTS OF LAND (landforms)', 'Both are raised parts of land', 'Both can be climbed', ['d:A mountain is taller than a hill', 'w:Both are bodies of water']),
  S(9.5, 'an APPLE', 'a POTATO', 'category', 'FOODS THAT GROW FROM PLANTS', 'Both are foods that grow from plants', 'Both have skins', ['o:An apple grows on a tree', 'w:Both are meats']),
  S(9.5, 'a SNAKE', 'a LIZARD', 'category', 'REPTILES', 'Both are reptiles', 'Both have scaly skin', ['o:A lizard has four legs', 'w:Both are mammals with fur']),
  S(9.5, 'a WHALE', 'a DOLPHIN', 'category', 'MAMMALS that live in the sea', 'Both are mammals that live in the sea', 'Both can swim', ['d:A whale is much bigger than a dolphin', "Both are fish || Neither one is a fish — they breathe air and feed their babies milk."]),
  // ---- age 10–11 ----
  S(10, 'an INCH', 'a CENTIMETER', 'category', 'UNITS FOR MEASURING LENGTH', 'Both are units for measuring length', 'Both are marked on a ruler', ['d:An inch is longer than a centimeter', 'w:Both measure weight']),
  S(10, 'a THERMOMETER', 'a RULER', 'category', 'MEASURING TOOLS', 'Both are tools for measuring', 'Both have numbers and lines', ['d:A ruler measures length and a thermometer measures temperature', 'w:Both are for drawing']),
  S(10, 'ADDITION', 'SUBTRACTION', 'category', 'MATH OPERATIONS', 'Both are math operations (ways to work with numbers)', 'Both use numbers', ['d:Adding makes numbers bigger and subtracting makes them smaller', 'w:Both are kinds of shapes']),
  S(10, 'SLEEP', 'FOOD', 'abstract', 'things your BODY NEEDS to stay healthy', 'Both are things your body needs to stay healthy', 'Both happen every day', ['d:You eat while you are awake, but you sleep with your eyes closed', 'w:Both are bad for you']),
  S(10, 'a CAMERA', 'a PAINTBRUSH', 'function', 'are tools for MAKING PICTURES', 'Both are tools for making pictures', 'Both are used by artists', ['d:A camera takes a photo and a brush uses paint', 'w:Both are for writing letters']),
  S(10.5, 'a POEM', 'a STORY', 'category', 'kinds of WRITING (literature)', 'Both are kinds of writing (literature)', 'Both are found in books', ['o:A poem often rhymes', 'w:Both are dances']),
  S(10.5, 'a PAINTING', 'a STATUE', 'category', 'WORKS OF ART', 'Both are works of art', 'Both can be seen in museums', ['d:A statue is 3-D and a painting is flat', 'w:Both are tools']),
  S(10.5, 'WINNING', 'LOSING', 'abstract', 'possible RESULTS of a game or contest', 'Both are possible results of a game or contest', 'Both happen when you play sports', ['d:Winning usually feels good and losing usually feels bad', 'w:Both mean the game was a tie']),
  S(10.5, 'a NEWSPAPER', 'a TELEVISION', 'function', 'share NEWS AND INFORMATION with lots of people (media)', 'Both share news and information with lots of people', 'Both have pictures', ['d:A television makes sounds and moving pictures, and a newspaper does not', 'w:Both are kinds of furniture']),
  S(11, 'ANGER', 'JOY', 'category', 'EMOTIONS (strong feelings)', 'Both are emotions (strong feelings)', 'You can show both on your face', ['d:Joy feels good and anger feels bad', 'w:Both are colors']),
  S(11, 'WOOL', 'COTTON', 'category', 'natural MATERIALS for making cloth', 'Both are natural materials used to make cloth', 'Both are soft', ['d:Wool comes from sheep but cotton comes from a plant', 'w:Both are metals']),
  S(11, 'STEAM', 'ICE', 'category', 'FORMS OF WATER', 'Both are forms of water', 'Both can be found in a kitchen', ['d:Ice is cold and steam is hot', 'w:Both are kinds of rock']),
  S(11, 'a STOMACH', 'a HEART', 'category', 'ORGANS — body parts with important jobs', 'Both are organs (body parts with important jobs)', 'Both are inside your chest or tummy', ['d:The heart pumps blood and the stomach holds food', 'w:Both are bones']),
  S(11, 'a MAP', 'a COMPASS', 'function', 'help you FIND YOUR WAY', 'Both help you find your way', 'Both are used on hikes', ['d:A map is paper and a compass has a needle', 'w:Both tell time']),
  S(11, 'WATER', 'AIR', 'abstract', 'things LIVING THINGS NEED to survive', 'Both are things living things need to survive', 'Both are usually clear', ['o:You can drink water', 'w:Both are solid']),
  S(11.5, 'a SEED', 'an EGG', 'abstract', 'BEGINNINGS OF NEW LIFE', 'Both are beginnings of new life', 'Both can be small', ['o:An egg has a shell', 'w:Both are food for plants']),
  S(11.5, 'a SWITCH', 'a FAUCET', 'function', 'are controls that TURN SOMETHING ON AND OFF', 'Both are controls that turn something on and off', 'Both are found in a house', ['d:A faucet controls water and a switch controls electricity', 'w:Both are for eating']),
  // ---- age 12–13 ----
  S(12, 'a CATERPILLAR', 'a TADPOLE', 'abstract', 'YOUNG ANIMALS THAT CHANGE SHAPE as they grow', 'Both are young animals that change shape as they grow up', 'Both are small and wiggly', ['d:A caterpillar becomes a butterfly and a tadpole becomes a frog', 'w:Both are fish']),
  S(12, 'FIRST', 'LAST', 'abstract', 'words for a POSITION IN AN ORDER', 'Both tell a position in an order', 'Both are words used in a race', ['d:First is the beginning and last is the end', 'w:Both are numbers you count with']),
  S(12, 'a FRIEND', 'an ENEMY', 'abstract', 'RELATIONSHIPS between people', 'Both are relationships between people', 'Both are people you know', ['d:A friend is nice and an enemy is not', 'g:Both are things']),
  S(12, 'SOLID', 'LIQUID', 'category', 'STATES OF MATTER', 'Both are states of matter', 'Both are words used in science', ['d:A solid keeps its shape and a liquid flows', 'w:Both are kinds of gas, like air']),
  S(12, 'a NOUN', 'a VERB', 'category', 'PARTS OF SPEECH (kinds of words)', 'Both are kinds of words (parts of speech)', 'Both are in sentences', ['d:A verb is an action and a noun is a thing', 'w:Both are math signs']),
  S(12.5, 'a MAYOR', 'a PRESIDENT', 'category', 'ELECTED LEADERS of a government', 'Both are elected leaders of a government', 'Both give speeches', ['d:A president leads a country and a mayor leads a city', 'w:Both are kings']),
  S(12.5, 'HUNGER', 'THIRST', 'abstract', "your BODY'S SIGNALS that it needs something", 'Both are signals that your body needs something', 'Both feel uncomfortable', ['d:Hunger makes you want food and thirst makes you want water', 'w:Both are illnesses']),
  S(12.5, 'a BRIDGE', 'a TUNNEL', 'function', 'let people TRAVEL PAST SOMETHING IN THE WAY', 'Both let people travel past something in the way', 'Cars can drive over or through them', ['d:A bridge goes over things and a tunnel goes under or through them', 'w:Both are buildings people live in']),
  S(13, 'a LAW', 'a RULE', 'abstract', 'GUIDES for what people MUST or MUST NOT do', 'Both tell people what they must or must not do', 'Both can get you in trouble', ['o:Laws are made by governments', 'w:Both are kinds of games']),
  S(13, 'TEMPERATURE', 'WEIGHT', 'abstract', 'things you can MEASURE', 'Both are things you can measure', 'Both have numbers', ['d:Temperature is hot or cold and weight is heavy or light', 'w:Both are colors']),
  S(13, 'a RIVER', 'a ROAD', 'abstract', 'PATHS that things travel along', 'Both are paths that things travel along', 'Both are long', ['d:Boats use rivers and cars use roads', 'w:Both are made of rock']),
  S(13.5, 'a SYMPHONY', 'a PAINTING', 'category', 'WORKS OF ART that people create', 'Both are works of art that people create', 'Both can be beautiful', ['d:You hear a symphony and see a painting', 'w:Both are tools']),
  S(13.5, 'a PROMISE', 'a CONTRACT', 'abstract', 'AGREEMENTS to do something', 'Both are agreements to do something', 'Both use words', ['d:A contract is written down and a promise can be spoken', 'w:Both are kinds of gifts']),
  // ---- age 14–16 ----
  S(14, 'COURAGE', 'HONESTY', 'abstract', 'good CHARACTER TRAITS (virtues)', 'Both are good character traits', 'Both are good things', ['d:Courage is about fear and honesty is about truth', 'w:Both are feelings of sadness']),
  S(14, 'the PAST', 'the FUTURE', 'abstract', 'TIMES THAT ARE NOT NOW', 'Both are times that are not right now', 'Both are talked about in stories', ['d:The past already happened and the future has not', 'w:Both are places on a map']),
  S(14.5, 'a FLOOD', 'a DROUGHT', 'abstract', 'WEATHER DISASTERS about water — too much or too little', 'Both are weather disasters about water (too much or too little)', 'Both can ruin farms, crops and gardens and make food cost more money', ['d:A flood is too much water and a drought is too little', 'w:Both are snowstorms']),
  S(14.5, 'FRICTION', 'GRAVITY', 'category', 'FORCES', 'Both are forces', 'Both are invisible', ['d:Gravity pulls things down and friction rubs against motion', 'w:Both are metals']),
  S(15, 'LIBERTY', 'JUSTICE', 'abstract', 'IDEALS a fair society tries to protect', 'Both are ideals a fair society tries to protect', 'Both are things people want', ['d:Liberty is freedom and justice is fairness', 'w:Both are kinds of buildings']),
  S(15, 'a HYPOTHESIS', 'a GUESS', 'abstract', 'IDEAS about what might be true before you know for sure', 'Both are ideas about what might be true before you know for sure', 'Both are things you think', ['d:A hypothesis gets tested in an experiment and a guess usually does not', 'w:Both are proven facts']),
  S(15, 'an ATOM', 'a CELL', 'abstract', 'TINY BUILDING BLOCKS that bigger things are made of', 'Both are tiny building blocks that bigger things are made of', 'Both are too small to see', ['d:Cells are alive and atoms are not', 'w:Both are planets']),
  S(15.5, 'DEMOCRACY', 'MONARCHY', 'category', 'FORMS OF GOVERNMENT', 'Both are forms of government', 'Both have leaders and their own flags', ['d:In a democracy people vote, and a monarchy has a king or queen', 'w:Both are kinds of money you can spend']),
  S(15.5, 'OXYGEN', 'NITROGEN', 'category', 'GASES IN THE AIR', 'Both are gases in the air', 'Both are invisible', ['o:We need oxygen to breathe', 'w:Both are metals']),
  S(15.5, 'TRUST', 'RESPECT', 'abstract', 'feelings people EARN IN GOOD RELATIONSHIPS', 'Both are feelings people earn in good relationships', 'Both are good things', ['d:Trust is believing in someone and respect is admiring them', 'w:Both are kinds of money']),
  S(16, 'an ECHO', 'a REFLECTION', 'abstract', 'things that happen when something BOUNCES BACK (sound or light)', 'Both happen when something bounces back (sound or light)', 'Both copy you', ['d:An echo is sound and a reflection is light', 'w:Both are kinds of shadows']),
  S(16, 'TAXES', 'RENT', 'abstract', 'MONEY PEOPLE MUST PAY regularly for things they use', 'Both are money people must pay regularly for something they use', 'Both are about money', ['d:Taxes are paid to the government, but rent is paid to a landlord or owner', 'w:Both are gifts']),
  S(16, 'a VOLCANO', 'an EARTHQUAKE', 'abstract', 'NATURAL EVENTS caused by forces deep inside the Earth', 'Both are natural events caused by forces deep inside the Earth', 'Both can shake the ground', ['d:A volcano can pour out hot lava and ash, and an earthquake does not', 'w:Both are kinds of weather']),
  // ---- property pairs: what both ARE made of, or what both do in nature (ages 5–11) ----
  S(5, 'ICE CREAM', 'a SNOWMAN', 'property', 'are COLD and MELT when they warm up', 'Both are cold and melt when they get warm', 'Both can be white', ['d:You eat ice cream, but you build a snowman out in the yard', 'w:Both are hot']),
  S(5.5, 'a FEATHER', 'a LEAF', 'property', 'are so LIGHT they DRIFT through the air', 'Both are so light they drift slowly through the air', 'Both can be found on the ground outside', ['o:A leaf grows on a tree', 'w:Both are heavy']),
  S(6, 'HONEY', 'GLUE', 'property', 'are STICKY', 'Both are sticky', 'Both can come in bottles', ['o:You can eat honey', 'w:Both are hard as a rock'], 'Sticky is what makes honey cling to a spoon and glue hold paper together.'),
  S(6, 'BUTTER', 'YOGURT', 'property', 'are MADE FROM MILK', 'Both are made from milk', 'Both are kept in the fridge', ['d:You spread butter but you eat yogurt with a spoon', 'w:Both grow on plants'], 'Lots of things are kept in the fridge — "made from milk" tells what they really are.'),
  S(6, 'a SPONGE', 'a TOWEL', 'property', 'SOAK UP WATER', 'Both soak up water', 'Both are soft', ['d:A sponge is for washing dishes and a towel is for drying off', 'w:Both are made of glass']),
  S(7, 'a SNAIL', 'a TURTLE', 'property', 'have hard SHELLS that PROTECT their bodies', 'Both have hard shells that protect their bodies', 'Both move slowly', ['o:A turtle can swim', 'w:Both have fur']),
  S(7.5, 'a WINDOW', 'EYEGLASSES', 'property', 'are CLEAR, so you can SEE THROUGH them', 'Both are clear, so you can see through them', 'Both can get smudgy', ['o:Eyeglasses help people see better', 'w:Both are made of wood']),
  S(8, 'WOOD', 'PAPER', 'property', 'are MADE FROM TREES', 'Both are made from trees', 'Both can be found in a classroom', ['d:Paper is thin and wood is thick', 'w:Both are made of metal'], 'Paper is made by mashing up wood into a pulp and pressing it flat.'),
  S(8, 'a RUBBER BAND', 'a SPRING', 'property', 'STRETCH and SPRING BACK into shape', 'Both stretch and then spring back into shape', 'Both can be found in a desk drawer', ['d:A spring is metal and a rubber band is rubber', 'w:Both melt in the sun']),
  S(8.5, 'a CRAYON', 'a CANDLE', 'property', 'are MADE OF WAX', 'Both are made of wax', 'Both come in many colors', ['o:A candle has a wick you can light', 'w:Both are made of glass']),
  S(9, 'SAND', 'a PEBBLE', 'property', 'are little PIECES OF ROCK', 'Both are little pieces of rock', 'Both can be found at the beach', ['d:A pebble is much bigger than a grain of sand', 'w:Both are made of plastic'], 'Waves and wind slowly break big rocks into pebbles, and pebbles into sand.'),
  S(9.5, 'FOG', 'a CLOUD', 'property', 'are made of TINY DROPS OF WATER floating in the air', 'Both are made of tiny drops of water floating in the air', 'Both are gray or white', ['d:Fog stays down near the ground and clouds float high up in the sky', 'w:Both are made of smoke'], 'Fog is really a cloud that sits down near the ground!'),
  S(10, 'a SHADOW', 'a REFLECTION', 'property', 'are IMAGES MADE BY LIGHT', 'Both are images made by light', 'Both can look like you', ['d:A shadow is dark but a reflection shows colors', 'w:Both can be touched and picked up'], 'A shadow is where light is blocked; a reflection is light bouncing back to your eyes.'),
  S(10.5, 'SWEAT', 'TEARS', 'property', 'are SALTY WATER that your BODY MAKES', 'Both are salty water that your body makes', 'Both can make your face wet', ['d:Tears come from your eyes and sweat comes from your skin', 'w:Both come from your stomach']),
  S(11, 'LIGHTNING', 'a STATIC SHOCK', 'property', 'are ELECTRICITY jumping through the air', 'Both are electricity jumping through the air', 'Both happen very fast', ['d:Lightning is huge and bright and a static shock is tiny and quick', 'w:Both are made of fire'], 'The little zap you feel after sliding on a carpet is a tiny cousin of lightning!'),
];
