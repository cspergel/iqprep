/**
 * Tagged emoji bank for Picture Concepts.
 *
 * Every picture belongs to one or more groups (its basic category) and to any number of extra tags.
 * Each tag has STRICT members (fair answers for a 7-year-old) and LOOSE members (pictures a child
 * could reasonably argue also fit). Answers are only ever drawn from strict members, but the
 * uniqueness check treats strict ∪ loose as "has this tag", so a picture that might arguably share a
 * concept is never allowed to form a rival answer. Colour, "go-together" and fuzzy tags (handles,
 * soft things, big animals…) are never targets; they exist only to keep rival answers out.
 *
 * Only emoji up to Unicode 13 are used. List entries are separated by spaces; `#tag` pulls in all
 * strict members of another tag.
 */

export type TagKind = 'category' | 'function' | 'property' | 'abstract' | 'color' | 'hidden';

export interface Pic {
  e: string;
  name: string;
  /** Mass or plural noun ("some grapes") rather than "a …". */
  some: boolean;
}

export interface TagDef {
  id: string;
  /** Predicate for a plural subject: "go on your feet", "are animals". */
  label: string;
  kind: TagKind;
  /** Age-equivalent difficulty of spotting this concept. */
  diff: number;
  target: boolean;
  strict: string[];
  loose: string[];
}

// ---------- pictures, by group ----------
// [group tags, items]. Items are "emoji name", '*' after the name = "some …".
const GROUPS: [string, string][] = [
  ['animal fur-maybe', '🐶 dog|🐱 cat|🐭 mouse|🐹 hamster|🐰 rabbit|🦊 fox|🐻 bear|🐼 panda|🐨 koala|🐯 tiger|🦁 lion|🐮 cow|🐷 pig|🐵 monkey|🐴 horse|🐺 wolf|🦓 zebra|🦒 giraffe|🐘 elephant|🦏 rhino|🦛 hippo|🐪 camel|🐑 sheep|🐐 goat|🦌 deer|🐿️ chipmunk|🦔 hedgehog|🦇 bat|🦘 kangaroo|🦥 sloth|🦦 otter|🦨 skunk|🦙 llama|🦍 gorilla|🐆 leopard|🦝 raccoon|🐸 frog'],
  ['animal bird', '🐔 hen|🐧 penguin|🐦 bird|🦆 duck|🦅 eagle|🦉 owl|🦜 parrot|🦢 swan|🦩 flamingo|🦚 peacock|🦃 turkey|🐤 chick|🐓 rooster'],
  ['animal sea-animal', '🐟 fish|🐠 tropical fish|🐡 blowfish|🦈 shark|🐬 dolphin|🐳 whale|🐙 octopus|🦀 crab|🦞 lobster|🦐 shrimp|🦑 squid|🦭 seal'],
  ['animal reptile', '🐢 turtle|🐍 snake|🦎 lizard|🐊 crocodile|🦖 T. rex dinosaur|🦕 long-neck dinosaur'],
  ['animal bug', '🐝 bee|🐛 caterpillar|🦋 butterfly|🐌 snail|🐞 ladybug|🐜 ant|🕷️ spider|🦗 cricket|🦟 mosquito|🪲 beetle|🪱 worm|🪰 fly'],
  ['food fruit', '🍎 apple|🍐 pear|🍊 orange|🍋 lemon|🍌 banana|🍉 watermelon|🍇 grapes*|🍓 strawberry|🍒 cherries*|🍑 peach|🥭 mango|🍍 pineapple|🥥 coconut|🥝 kiwi|🫐 blueberries*|🍈 melon|🥑 avocado'],
  ['food vegetable', '🥕 carrot|🌽 corn|🥦 broccoli|🥒 cucumber|🥬 lettuce|🌶️ hot pepper|🫑 green pepper|🥔 potato|🧅 onion|🧄 garlic|🍆 eggplant|🍠 sweet potato'],
  ['food', '🍞 bread*|🥐 croissant|🥖 long loaf of bread|🧀 cheese*|🥚 egg|🍳 fried egg|🥞 pancakes*|🧇 waffle|🥓 bacon*|🍔 burger|🍟 fries*|🍕 pizza|🌭 hot dog|🥪 sandwich|🌮 taco|🍝 spaghetti*|🍜 noodle soup*|🍚 rice*|🍣 sushi*|🥗 salad|🍿 popcorn*|🥨 pretzel|🧈 butter*|🍗 chicken leg|🥩 steak|🥜 peanuts*|🍲 stew*'],
  ['food sweet', '🍦 ice cream cone|🍧 shaved ice*|🍩 doughnut|🍪 cookie|🎂 birthday cake|🍰 slice of cake|🧁 cupcake|🍫 chocolate*|🍬 candy|🍭 lollipop|🍯 honey*|🥧 pie'],
  ['drink', '🥛 milk*|☕ hot drink|🍵 tea*|🧃 juice box|🥤 cup with a straw|🍼 baby bottle'],
  ['vehicle', '🚗 car|🚕 taxi|🚙 jeep|🚌 bus|🏎️ race car|🚓 police car|🚑 ambulance|🚒 fire truck|🚚 truck|🚜 tractor|🚲 bike|🛴 scooter|🛵 motor scooter|🏍️ motorcycle|🚂 train|🚠 cable car|✈️ airplane|🚁 helicopter|🚀 rocket'],
  ['vehicle boat', '⛵ sailboat|🚤 speedboat|🛶 canoe|🚢 ship'],
  ['clothing', '👕 T-shirt|👖 jeans*|👗 dress|👔 shirt and tie|🧥 coat|🧣 scarf|🧤 gloves*|🧦 socks*|👟 sneaker|👞 shoe|👢 boot|👠 high heel|👡 sandal|🩴 flip-flop|🩰 ballet shoes*|🩳 shorts*|🩱 swimsuit|🎩 top hat|🧢 cap|👒 sun hat|🎓 graduation cap|⛑️ helmet|👑 crown|🥽 goggles*|👓 glasses*|🕶️ sunglasses*|💍 ring|🥼 lab coat|🦺 safety vest'],
  ['tool', '🔨 hammer|🪓 axe|⛏️ pickaxe|🔧 wrench|🪛 screwdriver|🔩 nut and bolt|🪚 saw|🧰 toolbox'],
  ['kitchen', '🍴 fork and knife|🥄 spoon|🥢 chopsticks*|🍽️ plate|🥣 bowl|🫖 teapot|🧂 salt shaker|🔪 kitchen knife'],
  ['instrument', '🎸 guitar|🎹 piano|🎺 trumpet|🎷 saxophone|🥁 drum|🎻 violin|🪕 banjo|🪗 accordion'],
  ['furniture', '🛏️ bed|🛋️ couch|🪑 chair'],
  ['toy', '🧸 teddy bear|🪀 yo-yo|🪁 kite|🧩 puzzle piece|🎲 dice*|🪆 nesting dolls*|🤖 robot|🎮 game controller|♟️ chess piece|🃏 playing card|🪄 magic wand'],
  ['party', '🎈 balloon|🎁 present|🎉 party popper|🎊 confetti ball|🪅 piñata|🎀 ribbon'],
  ['sport', '⚽ soccer ball|🏀 basketball|🏈 football|⚾ baseball|🎾 tennis ball|🏐 volleyball|🎱 pool ball|🏓 ping-pong paddle|🏸 badminton shuttlecock|🥅 goal net|⛳ golf flag|🏒 hockey stick|🥊 boxing glove|⛸️ ice skate|🎿 skis*|🛷 sled|🥌 curling stone|🏆 trophy|🥇 gold medal|🎯 dartboard|🪃 boomerang|🏹 bow and arrow|🛼 roller skate|🛹 skateboard|🥏 flying disc|🎳 bowling pins*'],
  ['plant', '🌳 tree|🌲 pine tree|🌴 palm tree|🌵 cactus|🌻 sunflower|🌹 rose|🌷 tulip|🌸 cherry blossom|🌺 hibiscus flower|🍁 maple leaf|🍂 fallen leaves*|🌱 sprout|🍀 four-leaf clover|🌾 wheat*|🪴 potted plant'],
  ['nature', '🍄 mushroom|🌰 chestnut|🪶 feather|🪨 rock|🪵 log|🐚 seashell|🏔️ snowy mountain|🌋 volcano|🏜️ desert|🌊 wave|💧 water drop|🧊 ice cube|🔥 fire'],
  ['sky', '☀️ sun|🌙 moon|⭐ star|☁️ cloud|🌧️ rain cloud|❄️ snowflake|⛄ snowman|🌈 rainbow|⚡ lightning|🌪️ tornado|🌍 Earth|🪐 planet|☄️ comet|🛰️ satellite'],
  ['thing', '🚪 door|🪟 window|🚽 toilet|🛁 bathtub|🚿 shower|🪞 mirror|🖼️ picture frame|🕰️ mantel clock|📺 TV|💻 laptop|🖥️ computer|📱 phone|☎️ telephone|📷 camera|📻 radio|💡 light bulb|🕯️ candle|🔦 flashlight|🔑 key|🔒 lock|🧹 broom|🧺 basket|🧻 toilet paper*|🧽 sponge|🪣 bucket|🧼 soap*|🪥 toothbrush|🧴 lotion bottle|🧯 fire extinguisher|☂️ umbrella|⛱️ beach umbrella|🔌 plug|🔋 battery|⏰ alarm clock|⌚ watch|⏳ hourglass|⏱️ stopwatch|🧲 magnet|🪜 ladder|📦 box|🎒 backpack|👜 handbag|🧳 suitcase|🛒 shopping cart|🛍️ shopping bags*|🗑️ trash can|✉️ envelope|📰 newspaper|🗺️ map|🧭 compass|🌡️ thermometer|⚖️ balance scale|🔍 magnifying glass|🔭 telescope|🔬 microscope|📏 ruler|📐 triangle ruler|✏️ pencil|🖍️ crayon|🖊️ pen|🖌️ paintbrush|🎨 paint palette|📎 paperclip|📌 pushpin|🧷 safety pin|🪡 sewing needle|🧵 thread*|🧶 yarn*|✂️ scissors*|📚 books*|📓 notebook|🧮 abacus|📅 calendar|🪙 coin|💵 dollar bill|💳 credit card|💰 money bag|💊 pill|💉 shot|🩹 bandage|🩺 stethoscope|📢 loudspeaker|🏮 paper lantern|🚦 traffic light|🎤 microphone|🎧 headphones|🔔 bell|🪢 knot|🎣 fishing rod|🤿 diving mask'],
];

// ---------- tags ----------
// [id, label, kind, diff, strict extras, loose, target?]
type TagRow = [string, string, TagKind, number, string, string, boolean?];

const TAG_ROWS: TagRow[] = [
  // categories (group tags; strict members come from GROUPS)
  ['animal', 'are animals', 'category', 4, '', ''],
  ['bird', 'are birds', 'category', 5, '', '🪶'],
  ['sea-animal', 'live in the sea', 'property', 6.5, '', '🦆 🦢 🐧 🐢 🐚 🌊 🦦'],
  ['reptile', 'are reptiles', 'category', 10.5, '', '🐸'],
  ['bug', 'are bugs and creepy-crawlies', 'category', 5.5, '', ''],
  ['fruit', 'are fruits', 'category', 4, '', '🍆 🥒 🫑 🌶️ 🥜 🌰'],
  ['vegetable', 'are vegetables', 'category', 5.5, '', '🥑 🍄 🥜 🌰'],
  ['food', 'are things you eat', 'category', 4.5, '', '#drink 🌾 🍄 🌰'],
  ['sweet', 'are sweet treats', 'category', 5, '', '#fruit 🥞 🧇 🥐 🧃 🥤 🍠'],
  ['drink', 'are drinks', 'category', 5, '', '💧 🥥 🫖'],
  ['vehicle', 'are vehicles that take you places', 'category', 4, '', '🛷 🛹 🛼 🐴 🐪 🛒 🛰️'],
  ['boat', 'go on the water', 'category', 6, '', '🦆 🦢 🦭 🌊 🏄'],
  ['clothing', 'are things you wear', 'category', 4.5, '⌚', '🎒 👜 🎧 🎀 🩹 🥊 ⛸️ 🛼 🎿 🤿'],
  ['tool', 'are tools for building and fixing', 'category', 6, '', '✂️ 🔪 🪜 🧲 🔦 🧹 🪣 📏 🪡 ⛏️'],
  ['kitchen', 'are used in the kitchen', 'function', 7, '🍳', '#food #drink 🧽 🍼 🧊 🔥'],
  ['instrument', 'make music', 'category', 5, '', '🎤 🎧 📻 🔔 📢'],
  ['furniture', 'are furniture', 'category', 6, '', '🚽 🛁 🪞 🖼️ 🕰️ 📺 🚪 🪟 🧺'],
  ['toy', 'are toys and games', 'category', 5, '', '#ball 🎈 🪅 🪃 🛹 🛴 🥏 🎳 🛷 🎮 🧸'],
  ['ball', 'are balls', 'category', 4.5, '⚽ 🏀 🏈 ⚾ 🎾 🏐 🎱', '🎳 🔮 🧶 🎈 🥌'],
  ['sport', 'go with sports', 'category', 6.5, '', '👟 🩳 🩱 🥽 🚲 🛶 ⛵ 🏎️ 🧢 ⛑️ 🎽 🎣 🤿 🏊'],
  ['plant', 'are plants', 'category', 6, '', '#fruit #vegetable 🍄 🌰 🪵'],
  ['party', 'belong at a birthday party', 'abstract', 7.5, '🎂 🧁', '🍰 🕯️ 🍭 🍬 🍦 🍕 🧸 👑 🪀 🥤 🧃 🍪 🍩 🍫 🎮'],
  ['nature', 'are found in nature', 'hidden', 9, '', '#plant #animal', false],
  ['sky', 'are up in the sky', 'abstract', 9, '☀️ ☁️ 🌙 ⭐ 🌈 ⚡ 🌧️', '#fly 🎈 🛰️ 🪐 ☄️ ❄️ 🌪️ 🪁 🚀'],
  ['thing', 'are things', 'hidden', 20, '', '', false],
  ['fur-maybe', 'are land animals', 'hidden', 20, '', '', false],

  // function
  ['on-feet', 'go on your feet', 'function', 6, '🧦 👟 👞 👢 👠 👡 🩴 🩰 ⛸️ 🛼', '🎿'],
  ['on-head', 'go on your head', 'function', 6, '🎩 🧢 👒 🎓 ⛑️ 👑', '🎧 🥽 👓 🕶️ 🤿 🎀'],
  ['cut', 'are used to cut things', 'function', 7, '✂️ 🔪 🪚 🪓', '🍴 ⛏️'],
  ['write', 'are used to write or draw', 'function', 6.5, '✏️ 🖍️ 🖊️ 🖌️', '🎨 📓 💻 📱 🪶 📏'],
  ['ride', 'are things you can ride on', 'function', 6.5, '🐴 🚲 🛴 🛹 🐪 🛷 🏍️ 🛵', '#vehicle 🐘 🦙 🛼 🐢 🐬 🦒 🐮'],
  ['light', 'give light', 'function', 7.5, '☀️ 💡 🕯️ 🔦 🏮 🚦 ⭐ 🔥', '⚡ 🌙 📺 📱 💻 🖥️ 🌋 ☄️'],
  ['warm', 'keep you warm', 'function', 7.5, '🧥 🧣 🧤 🔥 ☀️', '🧦 👢 🛏️ ☕ 🍵 🍲 🕯️ 🧶 🐑 🎩 🧢 🛋️'],
  ['cool', 'help you cool down', 'function', 9, '🧊 🍧 🍦 🩱 🩳 ⛱️', '🕶️ 👒 🧢 💧 🌊 🥤 🧃 🥛 🍉 ❄️ ⛄ 🌳 🚿 👕 👡 🩴'],
  ['hold-water', 'can hold water', 'function', 8.5, '🪣 🛁 🫖 🥣 🍼 🍵 ☕', '🥛 🧃 🥤 🚿 🧽 🚽 🥥 🍽️'],
  ['measure', 'help you measure things', 'function', 9, '📏 📐 🌡️ ⚖️ ⏱️ ⏳', '⏰ ⌚ 🕰️ 🧭 🥄 📅 🧮'],
  ['time', 'tell you the time', 'function', 8, '⏰ ⌚ ⏳ ⏱️ 🕰️', '📱 💻 📅 🐓 ☀️ 🌙 🔔 🖥️'],
  ['clean', 'help you get clean', 'function', 7, '🧹 🧽 🧼 🪥 🚿 🛁', '🪣 🧻 🧴 💧'],
  ['see', 'help you see better', 'function', 9, '👓 🔍 🔭 🔬', '🕶️ 🥽 💡 🔦 📷 🪟 🪞 🤿'],
  ['carry', 'are for carrying things', 'function', 8, '🎒 👜 🧺 📦 🧳 🛍️ 🛒 🪣 🧰', '🚚 💰 🎁 ✉️ 🦘 🐪 🐴 🥣 🍽️ 🚌'],
  ['sewing', 'are used for sewing or knitting', 'function', 9, '🧵 🧶 🪡', '🧷 ✂️ 📌'],
  ['medicine', 'help when you are sick or hurt', 'function', 8, '💊 💉 🩹 🩺 🌡️ 🚑', '🧼 🛏️ 🍵 🍲'],
  ['emergency', 'help in an emergency', 'function', 7.5, '🚑 🚒 🚓 🧯', '🚁 🩹 💊 🩺 ⛑️ 📢 🔦 ☎️ 📱 🪜'],
  ['money', 'are money you can pay with', 'category', 6.5, '🪙 💵 💳 💰', ''],
  ['fasten', 'hold things together', 'abstract', 11, '📎 🧷 🔩 📌 🪢', '🧵 🪡 🎀 🧲 🧶 🔒 🔨'],

  // properties
  ['wheels', 'have wheels', 'property', 6.5, '🚗 🚕 🚙 🚌 🏎️ 🚓 🚑 🚒 🚚 🚜 🚲 🛴 🛵 🏍️ 🛹 🛼 🛒 🚂', '✈️ 🧳 🚠 🚀'],
  ['wings', 'have wings', 'property', 7, '#bird 🐝 🦋 🐞 🦟 🪰 🦇 ✈️', '🦗 🪲 🚁 🚀 🪶'],
  ['fly', 'can fly', 'property', 7, '🐦 🦅 🦉 🦜 🦆 🦢 🦩 🐝 🦋 🐞 🦟 🪰 🦇 ✈️ 🚁 🚀 🪁', '🐔 🦃 🦚 🐤 🐓 🦗 🪲 🎈 🛰️ 🪶 🐧'],
  ['fur', 'have fur', 'property', 7.5, '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐵 🐺 🦙 🐐 🦌 🐿️ 🦝 🦨 🦦 🦥 🦘 🦍 🐆 🦇', '🐮 🐴 🐷 🐪 🐘 🦏 🦛 🦭 🐑 🦓 🦒 🧸 🧶 🧣 🦔 🧤'],
  ['feathers', 'have feathers', 'property', 7.5, '#bird', '🪶 🏸'],
  ['shell', 'have a shell', 'property', 8.5, '🐢 🐌 🦀 🥚 🥜 🥥 🐚', '🦞 🦐 🌰 🐞 🪲 🍳 🦖 🦕'],
  ['in-water', 'live in water', 'property', 6.5, '#sea-animal', '🦆 🦢 🐧 🐊 🐢 🦦 🦛 🐸 🐚 🦩'],
  ['trees', 'grow on trees', 'property', 8.5, '🍎 🍐 🍊 🍋 🍑 🍒 🥭 🥥 🥑 🌰', '🍌 🍁 🍂 🥝 🍇 🪵 🍈'],
  ['underground', 'grow under the ground', 'property', 10, '🥕 🥔 🧅 🧄 🍠 🥜', '🪱 🍄 🌱 🐜'],
  ['round', 'are round', 'property', 7.5, '⚽ 🏀 ⚾ 🎾 🏐 🎱 🌍 🪙 🍊 🍩 🍪 🍽️ 🎯 🥏', '🔮 🐢 🧮 🥑 🍐 🍎 🍒 🍇 🫐 🍉 🍈 🥥 🍑 🥝 🎈 ☀️ 🪐 ⏰ 🥁 🍳 🥧 🎂 🧁 🍔 🍕 🧀 🥣 🪀 🧶 🧭 🕰️ ⌚ 🔍 🏈 🥚 🧅 🐡 🐞 🍭 🍬 🌙 🥞 🫐 🥌 🧲 🍋 🥔 🍅 🌕 🎡'],
  ['cold', 'are cold', 'property', 7, '🧊 ❄️ ⛄ 🍦 🍧', '🐧 🏔️ ⛸️ 🎿 🛷 🥌 🥛 🧃 🥤 🦭 🧤 🧣 🧥 🍉'],
  ['hot', 'are hot', 'property', 7.5, '🔥 ☀️ ☕ 🌋 🍵 🍲', '🌶️ 🍳 🕯️ 🌡️ 💡 🏜️ 🍕 🌭 🍜 🫖 🚒 🧯'],
  ['sharp', 'are sharp or pointy', 'property', 8, '🔪 ✂️ 🌵 📌 🪡 🪚 🪓 🦔', '✏️ 🖊️ ⛏️ 🧷 🏹 🌹 🍍 🐡 🦈 🦖 ⭐ 🦏 🍴 🥢 📐 🏔️ 🌲 🚀 🐝 🦟 🦀 🦞 🐊 🔩 🪛 ⛳ 🎯 🦷'],
  ['stripes', 'have stripes', 'property', 8, '🦓 🐯 🐝 🦨', '🍉 🐠 🦝 🐿️ 🍭 🐍 🐛 🦋 🎯 🌈 🧣 🦺 🍬 👕'],
  ['spots', 'have spots', 'property', 8, '🐞 🐆 🍄 🎲 🦒', '🐮 🍓 🦌 🍪 🐍 🐡 🐠 🍕 🧀 🦋 🐸 🐶 🍌 🦈'],
  ['screen', 'have a screen', 'property', 8.5, '📺 💻 📱 🖥️', '⌚ 📷 🎮 ⏰'],
  ['strings', 'have strings', 'property', 10.5, '🎸 🎻 🪕 🪁 🪀', '🎹 🎈 🏹 🧵 🧶 🏸 🎾 👟 👞 👢 🩰 🎀 🪅 🕷️ 🎣 🪢 🎁 🏓'],
  ['no-legs', 'have no legs', 'abstract', 11, '🐍 🐟 🐠 🐡 🦈 🐬 🐳 🪱', '🐌 🐙 🦑 🦭 🐚 🐛'],
  ['scales', 'have scales', 'property', 10.5, '🐟 🐠 🐍 🦎 🐊', '🐢 🦖 🦕 🐡 🦈 ⚖️ 🍍 🦋'],
  ['numbers', 'have numbers on them', 'property', 9.5, '⏰ 🕰️ 📅 🎲 📏 🎱 🃏', '🧮 ⌚ ☎️ 📱 💵 🪙 🌡️ ⏱️ ⚖️ 🚦 📐 💳 📰 🏈 🧭'],

  // abstract
  ['from-cow', 'come from a cow', 'abstract', 10, '🥛 🧀 🧈 🥩 🍦', '🍔 👞 👢 🐮 🍕 🎂 🍰 🧁 🍪 🥞 🧇 🥐 🍫 ☕ 🍼 🥪 🌮 🌭 🥊 🏈 ⚾ 🧤 👜 🍝 🥧 🍩 🍧 🍲'],
  ['from-chicken', 'come from a chicken', 'abstract', 9.5, '🥚 🍳 🍗', '🐤 🪶 🎂 🍰 🧁 🥞 🧇 🍪 🥐 🍜 🥪 🍝 🐔 🐓 🍲 🥧 🍩'],
  ['wood', 'are made of wood', 'abstract', 11, '🪵 🪑 🛶 ✏️ 🎻 🥢 🪆 🪃', '🚪 🪜 🧺 🎸 🥁 🛏️ 🌳 🌲 🌴 🪓 🔨 🧹 🖌️ 🏹 🛷 ⛵ 🏒 🪕 🎹 🖼️ 🕰️ 🏓 🧩 ♟️ 🪀 🛹 🧮 📏 🥄 🛋️ 🎳 🖍️ 🪗 ⛏️ 🍁 🍂 🌰 📦 📰 📚 📓'],
  ['glass', 'are made of glass', 'abstract', 12, '🪟 🪞 💡 👓 ⏳', '🥛 🔍 🔭 🔬 🕶️ 📺 💻 📱 🖥️ 🥽 🌡️ 🍼 🔮 🧊 ⌚ 📷 🕰️ ⏰ 🏮 🍵 ☕ 🤿 🚦 🔦'],
  ['metal', 'are made of metal', 'abstract', 12.5, '🔑 🔩 🪙 🧲 🔒 📎 🧷 🪡 🔔 🔧 🥇', '✂️ 🔪 🪚 🪓 ⛏️ 🪛 🔨 🍳 🥄 🍴 🏆 👑 💍 #wheels ✈️ 🚁 🚀 🚢 🛰️ 🎺 🎷 🧯 🪜 🪣 🧰 🫖 ⌚ ⛸️ 🔦 📌 🤖 🚦 🔌 🔋 📢 ⛑️ 🥅 ⛳ 🏒 🎤 🗑️ 🛶 🚠 ⛵ 🚤 🧭 ⚖️ 🔭 🔬 💳 💰 🥌 🛼 🎿 🪃 🏹 🪕 🎸 🥁 🎹 🪗 ☎️ 📷 📻 🕰️ ⏰ ⏱️ 💻 🖥️ 📱 📺 🩺 💉 🍽️ 🥣 🥢 📏 📐 🖊️ ⛏️'],
  ['paper', 'are made of paper', 'abstract', 11.5, '📚 📓 🗺️ ✉️ 📰 🧻 📅 🃏 💵', '🎁 🪁 📦 🛍️ 🖼️ 🏮 🎉 🎊 🪅 🧩 🥤 🧃 💳 🎈 🎀 🍿 ✏️ 🪆'],
  ['beach', 'go with a day at the beach', 'abstract', 8.5, '🩱 🐚 ⛱️ 🩴 🌊 🦀', '🕶️ 🪣 🏐 🌴 ☀️ 🍦 🥥 🐬 ⛵ 🦈 👒 🩳 🐟 🚤 🛶 🐠 🤿 🧴 🍉 🦭 🐙 🦞 🦐 🥏 🪁 🍧 🥤 🧃 🐳 👡 🎣 🦩 🐡 🦑'],
  ['winter', 'go with snowy winter', 'abstract', 8, '⛄ ❄️ 🛷 🎿 ⛸️ 🧣 🧤', '🧥 🥌 🏔️ 🐧 🧊 👢 🦌 🌲 🔥 ☕ 🧦 🍲 🦭 🍵 🕯️'],
  ['school', 'are used at school', 'abstract', 8, '🎒 ✏️ 📏 🖍️ 📚 📓 📐 🧮 🖊️', '✂️ 📎 🖌️ 🎨 🍎 🚌 🔔 🕰️ 🧃 🥪 🔬 🎓 💻 🌍 🗺️ 📅 🧩 📌 🧷 🖥️ ⚽ 🏀 🧭 ⏰'],
  ['farm', 'live on a farm', 'abstract', 6.5, '🐮 🐷 🐔 🐑 🐐 🐴 🐤 🐓 🦃', '🦆 🐶 🐱 🐭 🐰 🦙 🚜 🌽 🥕 🌾 🥚 🥛 🐝 🪱 🥔 🪣 🧺 🍎 🐛 🐜 🪰 🦢 🦌 🐸'],
  ['pet', 'can be pets', 'abstract', 6.5, '🐶 🐱 🐹 🐰 🦜 🐟 🐠', '🐭 🐢 🐍 🦎 🐦 🐴 🐷 🐔 🦔 🐌 🕷️ 🐸 🐐 🐑 🦆 🐤 🦙 🐜 🐓 🦨 🦝 🦊 🐛 🐞 🦗'],
  ['night', 'come out at night', 'abstract', 9.5, '🌙 ⭐ 🦉 🦇 🦝', '🔦 🕯️ 🛏️ 🐺 🦔 🦊 🐱 🐭 🪐 ☄️ 🏮 💡 🦟 🕷️ 🐌 🐸 🦗 🛰️ 🔭 🐨 🦥 🐹 🦨 🐯 🐆 🦁 🪲 🪱 🐍 🐊 🐙 🦈'],
  ['space', 'are found in outer space', 'abstract', 9, '🚀 🪐 🌍 ☄️ 🛰️ 🌙 ⭐ ☀️', '🔭 ✈️'],
  ['desert', 'go with the desert', 'abstract', 9.5, '🐪 🌵 🏜️', '🦎 🐍 ☀️ 🪨 🌴 🔥 🦅 🕷️ 🐜 🦂'],
  ['made-of-water', 'are made of water', 'abstract', 13.5, '💧 🧊 ❄️ 🌧️ ☁️ 🌊 ⛄', '🥛 🧃 🥤 🍵 ☕ 🚿 🛁 🌈 🍉 🥥 🍧 🫖 🍼 🏔️ 🍦 🌪️ ⚡ 🍜 🍲'],
  ['eggs', 'hatch from eggs', 'abstract', 11.5, '#bird #reptile', '🐟 🐠 🐡 🦈 🐙 🦑 🦀 🦞 🦐 🐸 #bug 🥚 🍳'],
  ['living', 'are living things', 'abstract', 12.5, '#animal #plant', '#fruit #vegetable 🍄 🌰 🪵 🍂 🍁 🪶 🐚 🦠 🍗 🥩 🥓 🥚 🍳 🌭 🍔 🍞 🍚 🥜'],
  ['help-plants-grow', 'help plants grow', 'abstract', 14, '☀️ 💧 🌧️ 🐝 🪱', '🌱 🚜 ☁️ 🪴 🦋 🐞 🪣 🚿 🌊 🌍 🪨 🍂 🍁 🦇 🐦 🐜 🧑 🌈'],
  ['breakfast', 'are things you eat for breakfast', 'abstract', 8, '🥞 🧇 🥓 🍳 🥚 🥐 🥣', '🥛 ☕ 🍞 🧈 🍯 🍌 🍓 🫐 🧃 🍊 🍵 🍎 🥖 🍩 🧀 🍑 🍈 🍉 🍐 🍒 🥝 🥭 🍇 🍋 🥑 🍪 🥤 🍼 🍚'],
  ['salty', 'taste salty', 'property', 8.5, '🍟 🥨 🍿 🧂 🥜 🥓', '🍕 🌭 🍔 🧀 🍣 🥪 🌮 🍝 🍜 🍲 🍗 🥩 🌊 🧈 🍚 🍞 🥖 🥐 🍳 🥚 🥗 🥔 🫒'],

  // never targets: colours
  ['red', 'are red', 'color', 6, '🍎 🍓 🍒 🌹 🚒 🎈 🐞 🦀 🦞 🌶️ 🧯 🥊 🍄 🚗 🏮 📌 🧲 👠 ⛑️ 🏎️', '🍉 🎒 🧣 🎁 🍁 🥩 🔥 🎯 🌺 🌷 🦜 🐙 🦐 🎀 🍭 🌋 🎸 🥤 🪀 ☂️ 🍰 🍬 🧨 💄 🥫 🍅 🧧 🍇 🧰 🍣 🧃 🎊 🍗', false],
  ['yellow', 'are yellow', 'color', 6, '🍌 🍋 🌽 🌻 ⭐ ☀️ 🐤 🧀 🚕 🧽 🧈 ⚡', '🐝 🍍 🌙 🎷 🏆 🥇 🍯 🔔 🎺 🥞 🍟 🍳 🦒 🧇 🪙 👑 🎾 🦁 💡 🍝 🍐 🦺 🚌 🥐 🐥 🐓 🐔 🦆 🌼 ✏️ 🥨 🍞 🌾 🏀 🎉 🎊 ⛱️ 🍿 🐆 🐯 🐍 🦋 🌕 🍮 🥚 🍕 🔑 🔒 🧸 🛎', false],
  ['green', 'are green', 'color', 6, '🥦 🥒 🥬 🐸 🐢 🍀 🌲 🌳 🌵 🌱 🫑 🦎 🐊 🦖 🦕 🥑 🐛 🦗', '🍐 🥝 🍈 🌴 🍉 🦜 🍵 🥗 🐍 🧩 🎾 💵 🦚 🌍 🚜 🔋 🪴 🌾 🍏 🍃 🌿 🦠 🧪 🐉 🐲 🍋 🫐 🥎 🍇 🦋 🐞 🪲 ⛳ 🧃 🎄 🧤 🥅', false],
  ['orange', 'are orange', 'color', 6, '🍊 🥕 🦊 🐯 🏀 🦺', '🍠 🦀 🍑 🥭 🔥 🍁 🍂 🐠 🦁 🧀 🦐 🍯 🐹 🦒 🐆 🦧 🥧 🧡 🎃 🐅 🐈 🍤 🏮 🥫 🌅 🧶 🪐 🍪 🐡 🦊 ☄️ 🏉 🏈 🛟 🚧 🥮 🍞 🥖 🥐 🐙 🦞', false],
  ['blue', 'are blue', 'color', 6, '💧 🌊 🫐 👖', '🐳 🐬 🧊 🦋 🐟 🐦 🧢 👕 🚙 🌍 🦕 🩱 ❄️ 🧤 🛋️ 🦚 🥏 ☂️ 🌧️ 🪣 🩳 🚓 🦈 🐋 💎 🧿 💙 🔵 📘 🌐 🧵 🎽 🐠 🛁 🚿 🪟 🌀 🧼 🦭 🧴 👔 👗 🎒 🧣 🧥 🧦 💺 🩺 🚿 🧞', false],
  ['brown', 'are brown', 'color', 6, '🐻 🐴 🐿️ 🦔 🌰 🥔 🍞 🍫 🍪 🥜 🪵 🥥 🦌 🐪 🦘 🥨 🧸 🏈 🐵 🎻 🧺 📦 🧳', '👢 🍩 🦉 🦇 🦍 🍂 🪑 🚪 🎸 🥁 🐌 🍗 🥓 🌭 🍔 🌮 ☕ 🥐 🥖 🥞 🧇 🦦 🦥 🦙 🛶 🪃 🏒 🪜 🐶 🐹 🍠 🥧 🦃 🦅 👜 🐶 👞 🦗 🪲 🐜 🦝 🐺 🦨 🐂 🐃 🐄 🐐 🥩 🍯 🍄 🍲 🥮 🪨 🏜️ 🌴 🥾 🪶 🐓 🐔 🦆 🎒 🧭 🪕 🪘 🪗 🪆 🛷 🛹 🏹 🌳 🌲', false],
  ['white', 'are white', 'color', 6, '🥛 🥚 ☁️ ⛄ 🐑 🦢 🍚 🧻 🧄 🥼 🚑 ✉️', '🐼 🦓 🐮 🐧 🥥 🧂 🍦 🐐 🐰 🎂 🧅 🏐 ⚾ ⚽ 🍼 ❄️ 🦭 🦙 🧊 📰 🥣 🍽️ 🐔 🍳 🎳 🏸 🌸 🦷 🐻‍❄️ 🦄 👻 🕊️ 🍙 🍥 🦴 🩹 🧼 🪥 🚽 🛁 🛰️ 🚀 ✈️ 🛳️ 🚢 ⛵ 🏔️ 🐩 🐇 🦩 🦜 🦈 🐳 🦑 🐙 🧁 🍰 🍧 🎎 🥡 🎲 🩺 💊 💉 🧴 🍶 🧺 🎓 ⛑️ 🏳️ 🚌 🐓 🦆 🦉 🦅 🌼 🌹 🌷 🌺 🌕 🌙 ⭐ 🪶 🐚 🦀 🍝 🧀 🧈 🍞 🍪 🧇 🥞 🦙 🐨 🐭 🐹 🐱 🐶 🐺 🦝 🦨 🦡 🐿️ 🦔 🦇 🦢', false],
  ['black', 'are black', 'color', 6, '🎩 🕷️ 🎱 🕶️ ♟️', '🐧 🐼 🐜 🦍 🦨 🦓 🦇 🎹 🎮 📷 🎧 🐞 ⚽ 🎓 🎤 📱 📺 🦟 🪰 🪲 👞 👢 🐦 🐍 🐈‍⬛ 🦬 🐃 🐂 🐄 🐮 🐺 🦅 🦉 🐦‍⬛ 🖤 🕳️ 🏴 🎥 💻 🖥️ ☎️ 📻 🔌 🔋 🎸 🥁 🎷 🎻 🪕 🐗 🦡 🦝 🐻 🐿️ 🦔 🐶 🐱 🐴 🐫 🐪 🐐 🐑 🦙 🐊 🐢 🦖 🦕 🦎 🐸 🐌 🐛 🦗 🦂 🐙 🦑 🦞 🦀 🐋 🐳 🐬 🦈 🦭 🐟 🐠 🐡', false],
  ['pink', 'are pink', 'color', 6, '🐷 🦩 🌸 🌺 🩰', '🍑 🌷 🍩 🎀 🧁 🐙 🦐 🍬 🍭 🍧 🍉 🍰 🐚 🥩 🦄 💗 🐽 👛 🧠 🍥 🎟️ 🌹 🧽 🐖 🐭 👙 🍦 🍓 🦞 🦑 🦀 🎂 🪅 🌷 🎈 👗 💄 🩱 🍡 🪱 🐛 🦒 🐰 🐹 🦔', false],
  ['purple', 'are purple', 'color', 6, '🍇 🍆', '🔮 🐙 ☂️ 🫐 🪲 🧅 🍠 🦄 👾 💜 🌂 🪀 🎆 🦋 🌷 🍬 🍭 🪁 🧁 🪅 🎁 🧶 🧵 👗 👚 🎒 🪄 🦑 🦞 🌶️ 🫑 🥬 🍈 🍑 🥝 🐉 🌸 🌺 🪻', false],
  ['gray', 'are gray', 'color', 6, '🐘 🐨 🐭 🐺 🦏 🦛 🪨 🦝 🐬', '🦈 🐳 🦭 🌧️ 🔩 🔧 🔨 ⛏️ 🪓 🪛 🪚 🦍 🐟 ☁️ 🏔️ 🛰️ 🗑️ 🎤 🔪 🥄 🍴 💻 🖥️ 🛒 🚀 ✈️ 🛴 🐀 🐁 🐇 🐹 🦔 🐿️ 🦉 🦅 🐦 🐧 🦢 🐊 🦖 🦕 🦎 🐢 🐍 🦇 🦡 🐱 🐶 🐰 🐻 🐼 🐁 🦣 🐃 🐂 🦬 🐐 🐑 🦙 🐴 🦓 🦒 🐪 🐫 🦘 🦦 🦥 🦨 🌪️ 🌫️ ⛈️ 🌩️ 🌨️ 🌑 🌚 🌒 🌘 🌖 🌔 🌓 🌗 🌙 🪐 🌍 ☄️ 🔭 🔬 🧲 🔑 🔒 🔔 🪙 🥇 🏆 ⚙️ 🗜️ 🧰 🧯 🔦 🧭 ⌚ ⏰ ⏱️ 🕰️ 📷 📱 ☎️ 📻 📺 🚂 🚠 🚢 ⛵ 🚤 🛶 🚁 🚗 🚕 🚙 🚌 🏎️ 🚓 🚑 🚒 🚚 🚜 🚲 🛵 🏍️ 🛹 🛼 🛷 🥌 ⛸️ 🎿 🥅 ⛳ 🏒 🏹 🪃 🎯 🎳 🎱 🥏 🎣 🤿', false],

  // never targets: go-together and fuzzy concepts a child might still spot
  ['go-bee', 'go with bees', 'hidden', 9, '🐝 🍯 🌻 🌷 🌸 🌺 🌹', '', false],
  ['go-lock', 'go with locks', 'hidden', 9, '🔑 🔒 🚪', '🧳 📦', false],
  ['go-cookies', 'go with milk and cookies', 'hidden', 9, '🥛 🍪', '🐮', false],
  ['go-bunny', 'go with bunnies', 'hidden', 9, '🐰 🥕', '🥬', false],
  ['go-monkey', 'go with monkeys', 'hidden', 9, '🐵 🍌', '🌴 🦍', false],
  ['go-mouse', 'go with mice', 'hidden', 9, '🐭 🧀 🐱', '', false],
  ['go-cat', 'go with cats', 'hidden', 9, '🐱 🐟 🐠 🐭 🧶', '', false],
  ['go-squirrel', 'go with squirrels', 'hidden', 9, '🐿️ 🌰 🌳', '', false],
  ['go-fishing', 'go with fishing', 'hidden', 9, '🎣 🐟 🐠 🐡 🦈 🐳 🐬 🚤 🛶', '🪱', false],
  ['go-tea', 'go with a tea party', 'hidden', 9, '🫖 🍵 ☕ 🍪 🍰 🧁', '🥛', false],
  ['go-bread', 'go with bread', 'hidden', 9, '🍞 🧈 🥪 🥖 🥐 🍯', '🧀 🥓 🥚 🍳 🔪', false],
  ['go-rain', 'go with rain', 'hidden', 9, '🌧️ ☂️ 🌈 💧 ☁️', '🐌 🪱 🐸 🦆 👢 ⚡ 🌊 🌪️', false],
  ['go-bed', 'go with bedtime', 'hidden', 9, '🛏️ 🧸 🌙', '📚 🥛 🦉 ⭐ 🪥 🕯️ 🛋️', false],
  ['go-bath', 'go in the bathroom', 'hidden', 9, '🛁 🚿 🚽 🧼 🪥 🧻 🧴', '🧽 🪞 💧', false],
  ['go-art', 'are for making art', 'hidden', 9, '🎨 🖌️ 🖍️ ✏️', '✂️ 📏 📐 🖊️ 📓 🧶 🧵 🪡 🖼️', false],
  ['go-house', 'are parts of a house', 'hidden', 9, '🚪 🪟', '🛁 🚽 🚿 🪞 🛏️ 🛋️ 🪑 🖼️ 🕰️', false],
  ['go-king', 'go with kings and queens', 'hidden', 9, '👑 💍', '🏆 🥇 🪄 🦚', false],
  ['go-circus', 'go with the circus or zoo', 'hidden', 9, '🐘 🦁 🐯 🦒 🦓', '🎪 🤹 🐵 🦍 🦛 🦏 🐼 🐨 🦘 🐧', false],
  ['handle', 'have a handle', 'hidden', 9, '☕ 🫖 🪣 🍳 🔨 🪓 🧹 🧳 👜 🛒 🔪 🪚 🥄 🍴 🏓 🏸 🏒 🔧 🪛 ⛏️ ☂️ 🧺 🚪 🛴 🚲 🛵 🏍️ 🪥 🖌️ 🔍 🧰 🍼 🎒 🛍️ ⛱️ 🗑️ 🧯', '🎸 🎻 🪕 🔦 🎤 💄 🔑 🏹 🎣 🥢 🍵 🪃 🎿', false],
  ['soft', 'are soft', 'hidden', 9, '🧸 🛏️ 🛋️ 🧶 🧣 🪶 🧽', '☁️ 🍞 🐑 🧦 🧤 🐱 🐶 🐹 🐼 🐨 🦙 🍦 🧁 🍰 🥐 🍌 🧈 🥞 🐰 🐥 🐤 🦢 🦆 🧥 🩰 🧻 🥖 🍑 🍓 🫐 🍇 🥑 🍥 🍡 🧀 🥚 🍮 🐭 🦊 🐻 🦔 🐿️ 🦝 🦥 🦦 🐵 🐮 🐷 🐴 🐐 🐄 🐖 👕 👗 👖 🩳 🩱 🥼 👔', false],
  ['big', 'are very big', 'hidden', 9, '🐘 🐳 🦒 🦏 🦛 🦖 🦕', '🦍 🐻 🦈 🐪 🐴 🚢 ✈️ 🚂 🚌 🚚 🏔️ 🌍 ☀️ 🪐 🌋 🌳 🌲 🐬 🐊 🦬 🦣 🐋 🚀 🚒 🚜 🛰️ 🌊 🌪️ 🦓 🐄 🐮 🦌 🦁 🐯 🐆 🦘 🐼 🐢', false],
  ['tiny', 'are tiny', 'hidden', 9, '🐜 🐞 🪰 🦟 🐭 🪙 📌 🪡 📎 🧷 🌱 💧 🫐 🔩 💊 🐝', '🐛 🦗 🪲 🐌 🕷️ 🪱 🐤 🦐 🐹 🐁 🍒 🍇 🥜 🌰 🎲 💍 🔑 🧂 ❄️ 🍬 ⭐ 🦋 🐦 🍀 🌸 🪶 🧵 🔋 🩹 ⌚ 🍓 🍃 🦠', false],
  ['shiny', 'are shiny', 'hidden', 9, '💍 👑 🪙 🏆 🥇 🔔 🔑 ⭐ 🪞', '🔮 🔒 🎺 🎷 ✨ 💎 🧲 🔩 🔧 🥄 🍴 🔪 ✂️ 🧊 🌟 ☄️ 🛰️ 🚀 ☀️ 🌙 💡 🔦 🧯 🎱 🏮 🎄 🎀 🎁 🍭 🍬 🍫 🍎 🍒 🥈 🥉 ⚖️ 🕶️ 👓 ⌚ 📱 💻 🖥️ 📺 📷 🍯 🫖 🍳 🪣 🧰 🎻 🎸 🪕 🪗 🚗 🚕 🚙 🏎️ 🚓 🚑 🚒 💳 🪄 ⛸️ 🎿 🏒 🥅 ⛳ 🎣', false],
  ['loud', 'are loud', 'hidden', 9, '📢 ⏰ 🥁 🎺 🔔 🚒 🚑 🚓', '#instrument 🎤 ⚡ 🐓 🐘 🐶 🚂 ✈️ 🚁 🎉 🌋 🦜 🐺 🏍️ 📻 🦁 🐯 🚀 🌪️ 🎊 🐮 🐷 🦆 🐔 🦃 🦚 📱 ☎️ 🎧 📺 🚌 🚚 🚜 🛵 🏎️ 🚗 🚕 🚙 🚢 🦢 🐸 🦗 🦟 🐝 🐵 🦍 🐳 🐬 🐑 🐐 🐴 🦓 🦏 🦛 🐊 🐻 🐱 🐭 🦇 🦉 🦅', false],
  ['buttons', 'have buttons', 'hidden', 9, '🎮 ☎️ 📷 📻 🧥 📱 💻 🖥️', '🎹 ⏰ ⌚ 🔦 🤖 🧸 👔 👕 📺 🧮 🪗 🎷 🎺 🕰️ ⏱️ 🧯 💳 🛵 🏍️ 🚦 🔌 🎧 🎤 👖 👗 🥼 🦺', false],
  ['opens', 'open and close', 'hidden', 9, '🚪 🪟 📚 📓 🧳 📦 🔒 ☂️ 👜 🎒 💻 ✉️ 🎁 🛍️', '🗑️ 🧰 🫖 🪣 ⛱️ 🗺️ 📰 🃏 🪆 🚽 🛁 🚿 🔑 ✂️ 🐊 🦈 🦛 🐳 🌷 🌻 🌸 🌹 🌺 🍼 🧃 🥤 💰 👛 🧴 🧼 🧺 🛒 🚗 🚕 🚙 🚌 🚓 🚑 🚒 🚚 ✈️ 🚂 🚠 🚢 📱 🖥️ 📺 📷 🎹 🪗 🕰️ ⏰ 📅 🥚 🥜 🌰 🥥 🐚 🦀 🦞 🦐 🐢 🐌 🦋 🦇 🦅 🦉 🦜 🐦 🐧 🦆 🦢 🦩 🦚 🐔 🐓 🐤 🦃 🐝 🐞 🪰 🦟 🦗 🪲 🐜 🕷️ 🐛 🪱', false],
  ['four-legs', 'have four legs', 'hidden', 9, '🪑 🛏️ 🛋️ 🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐴 🐺 🦓 🦒 🐘 🦏 🦛 🐪 🐑 🐐 🦌 🐿️ 🦔 🦥 🦨 🦙 🐆 🦝 🐢 🦎 🐊 🦕 🐸 🦦', '🐵 🦍 🦘 🦖 🦭 🦇 🐻‍❄️ 🧸 🤖 🛒 🚜 🚗 🚕 🚙 🚌 🚓 🚑 🚒 🚚 🛹 🛼 🎹 🥅', false],
  ['letters', 'have words or letters on them', 'hidden', 9, '📚 📰 ✉️ 🗺️ 📓 📅', '💵 🃏 💳 🧭 📦 🎁 🪙 🏆 🥇 🎓 📺 📱 💻 🖥️ ⌨️ 🚓 🚑 🚕 🚌', false],
];

// ---------- build ----------

export const strip = (e: string) => e.replace(/️/g, '');

export const PICS: Pic[] = [];
const picByKey = new Map<string, Pic>();
const groupMembers = new Map<string, string[]>();

for (const [tagStr, items] of GROUPS) {
  const tags = tagStr.split(' ');
  for (const raw of items.split('|')) {
    const sp = raw.indexOf(' ');
    const e = raw.slice(0, sp);
    let name = raw.slice(sp + 1).trim();
    const some = name.endsWith('*');
    if (some) name = name.slice(0, -1);
    const k = strip(e);
    if (!picByKey.has(k)) {
      const pic = { e, name, some };
      PICS.push(pic);
      picByKey.set(k, pic);
    }
    for (const t of tags) {
      if (!groupMembers.has(t)) groupMembers.set(t, []);
      groupMembers.get(t)!.push(k);
    }
  }
}

/** Emoji named in tag lists that are not pictures in the bank (ignored; fine for loose lists). */
export const UNKNOWN_STRICT: string[] = [];

const rows = new Map(TAG_ROWS.map((r) => [r[0], r]));
const resolved = new Map<string, Set<string>>();

function expand(list: string, into: Set<string>, strictList: boolean, seen: Set<string>) {
  for (const tok of list.split(/\s+/).filter(Boolean)) {
    if (tok.startsWith('#')) {
      for (const k of strictOf(tok.slice(1), seen)) into.add(k);
    } else {
      const k = strip(tok);
      if (picByKey.has(k)) into.add(k);
      else if (strictList) UNKNOWN_STRICT.push(tok);
    }
  }
}

function strictOf(id: string, seen = new Set<string>()): Set<string> {
  const hit = resolved.get(id);
  if (hit) return hit;
  if (seen.has(id)) throw new Error(`tag cycle at ${id}`);
  seen.add(id);
  const row = rows.get(id);
  if (!row) throw new Error(`unknown tag ${id}`);
  const out = new Set<string>(groupMembers.get(id) ?? []);
  expand(row[4], out, true, seen);
  resolved.set(id, out);
  return out;
}

export const TAGS: TagDef[] = TAG_ROWS.map(([id, label, kind, diff, , looseStr, target]) => {
  const strict = strictOf(id);
  const loose = new Set<string>();
  expand(looseStr, loose, false, new Set());
  for (const k of strict) loose.delete(k);
  return {
    id, label, kind, diff,
    target: target !== false && kind !== 'color' && kind !== 'hidden',
    strict: [...strict],
    loose: [...loose],
  };
});

export const TAG_BY_ID = new Map(TAGS.map((t) => [t.id, t]));

/** Every tag a picture has (strict or loose) — used for the "no rival answer" check. */
export const TAGS_OF = new Map<string, Set<string>>();
for (const p of PICS) TAGS_OF.set(strip(p.e), new Set());
for (const t of TAGS) for (const k of [...t.strict, ...t.loose]) TAGS_OF.get(k)!.add(t.id);
// The 'thing' and 'fur-maybe' group tags are bookkeeping only, not concepts.
for (const s of TAGS_OF.values()) { s.delete('thing'); s.delete('fur-maybe'); }

export const picOf = (key: string) => picByKey.get(strip(key));
