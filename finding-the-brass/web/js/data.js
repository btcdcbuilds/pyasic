/* Finding the Brass — game content.
 * Everything here is original to this game: characters, town and story.
 */
"use strict";
var BK = window.BK || {};
window.BK = BK;

/* ---------- small utilities ---------- */
BK.util = {
  mulberry32: function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  pick: function (rng, arr) { return arr[Math.floor(rng() * arr.length)]; },
  shuffle: function (rng, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  },
  clamp: function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
  hash: function (str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  },
  fmtTime: function (mins) {
    var m = ((mins % 1440) + 1440) % 1440;
    var h = Math.floor(m / 60), mm = m % 60;
    var ap = h >= 12 ? "pm" : "am";
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ":" + (mm < 10 ? "0" : "") + mm + ap;
  },
  esc: function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
};

/* ---------- knockers: the design on the door tells you who lives there ---------- */
BK.KNOCKERS = {
  lion:    { name: "Lion's head", trait: "wealthy", hint: "Money behind this door. Proud folk who don't like being disturbed, and who often have secrets worth knowing.", color: "#e0b040" },
  fox:     { name: "Fox head", trait: "shifty", hint: "Sly folk. They know plenty, but they don't always tell the truth.", color: "#d08a30" },
  hand:    { name: "Brass hand", trait: "devout", hint: "Pious households. They don't approve of sailors, but they won't lie.", color: "#d8c070" },
  anchor:  { name: "Anchor", trait: "sailor", hint: "Seafaring folk. Rough, generous and handy with their fists.", color: "#c0a050" },
  owl:     { name: "Owl", trait: "scholar", hint: "Learned folk. Hard to fool, but what they tell you is sharp.", color: "#c8b060" },
  rose:    { name: "Rose", trait: "sister", hint: "A rose on the door. Warm-hearted folk, friendly to a sailor far from home.", color: "#e09070" },
  ring:    { name: "Plain ring", trait: "plain", hint: "Ordinary working folk. Tired, wary and honest enough.", color: "#b89848" },
  mermaid: { name: "Mermaid", trait: "gambler", hint: "Gamblers and smugglers. You might win a fortune or lose your shirt.", color: "#d0a060" }
};

/* ---------- the three things you need to pin down her door ---------- */
BK.DISTRICTS = [
  { id: "wharf", name: "The Wharf" },
  { id: "mill", name: "Mill Row" },
  { id: "chapel", name: "Chapel Hill" },
  { id: "rookery", name: "The Rookery" },
  { id: "square", name: "Gaslight Square" }
];
BK.COLOURS = [
  { id: "red", name: "Red door", hex: "#8e1c1c" },
  { id: "green", name: "Green door", hex: "#1f5e2c" },
  { id: "blue", name: "Blue door", hex: "#1c3c80" },
  { id: "black", name: "Black door", hex: "#161616" },
  { id: "yellow", name: "Yellow door", hex: "#b88e1c" },
  { id: "white", name: "White door", hex: "#cfcabc" }
];
BK.KNOCKER_LIST = Object.keys(BK.KNOCKERS).map(function (k) { return { id: k, name: BK.KNOCKERS[k].name + " knocker" }; });
BK.CATS = { district: BK.DISTRICTS, colour: BK.COLOURS, knocker: BK.KNOCKER_LIST };
BK.CAT_LABEL = { district: "Which street", colour: "Door colour", knocker: "Knocker" };

/* ---------- the town's notable locals (they have their own doors) ---------- */
BK.LOCALS = [
  { id: "crake", name: "Alderman Josiah Crake", short: "Crake", role: "Mill owner",
    desc: "Owns half of Brassmoor, and half the houses the brasses rent.", coat: "#3b2f2f", hair: "#bbbbbb", hat: "top" },
  { id: "vane", name: "Mrs Honoria Vane", short: "Vane", role: "Widowed landlady",
    desc: "Collects rents, and knows exactly which tenants are taking the mercury cure.", coat: "#4a2340", hair: "#2a1a10", hat: "bonnet" },
  { id: "mott", name: "Father Silas Mott", short: "Mott", role: "Chaplain of St Bride's",
    desc: "Preaches against sin, and keeps careful notes on where it lives.", coat: "#151515", hair: "#7a6a5a", hat: "none" },
  { id: "pell", name: "Dr Ezra Pell", short: "Pell", role: "Surgeon",
    desc: "Treats the dose quietly, for cash, no names asked.", coat: "#2b3a4a", hair: "#3a2a1a", hat: "bowler" },
  { id: "ruddock", name: "Captain Ned Ruddock", short: "Ruddock", role: "Master of the brig Gannet, your captain",
    desc: "Wants his crew back aboard in one piece and free of the dose.", coat: "#1f2f5a", hair: "#8a4a20", hat: "cap" },
  { id: "lark", name: "Kitty Lark", short: "Lark", role: "Music-hall songbird",
    desc: "Knows every brass in town, and every song about them.", coat: "#7a1f3a", hair: "#d8a040", hat: "feather" },
  { id: "grime", name: "Sergeant Barnaby Grime", short: "Grime", role: "Brassmoor Constabulary",
    desc: "Takes his tea with two sugars and a bribe.", coat: "#1a2440", hair: "#4a3a2a", hat: "helmet" },
  { id: "fenn", name: "Solomon Fenn", short: "Fenn", role: "Pawnbroker",
    desc: "Sells everything a sailor on shore leave could want.", coat: "#3a3a20", hair: "#222222", hat: "cap" }
];

/* ---------- chapters: one brass to find in each ---------- */
BK.CHAPTERS = [
  {
    title: "Chapter I — Ruby Raines",
    target: "Ruby Raines", nickname: "Ruby",
    nights: 5, brasses: 10, dosed: 4, lieChance: 0, enemyBoost: 0,
    intro: [
      "Brassmoor, 1887. The brig Gannet ties up at the Wharf after seven months at sea, and Captain Ruddock gives the crew five nights' shore leave.",
      "You are Jack Halyard, able seaman. Every one of those seven months you've thought about Ruby Raines, the finest brass in Brassmoor. She wrote you letters. She never wrote her address.",
      "Somewhere in this town Ruby works from behind one of the doors. Behind some of the others are brasses who have THE DOSE. The ship's surgeon has warned the whole crew: go up to the wrong room with the wrong brass and you WILL catch it, and you'll be taking mercury for a month.",
      "Ask around. Every clue tells you which street her door is on, what colour it's painted, or what brass knocker hangs on it. When your notes point to one door, knock and go up to her room. Find the brass. Avoid the dose."
    ]
  },
  {
    title: "Chapter II — Velvet Violet",
    target: "Violet Ashdown", nickname: "Velvet Violet",
    nights: 4, brasses: 12, dosed: 6, lieChance: 0.25, enemyBoost: 2,
    intro: [
      "Next voyage, next shore leave. The Gannet's back, and the whole forecastle is talking about one name: Velvet Violet.",
      "Nobody will say where she works. And the dose has been going round the Rookery like a bad penny.",
      "Watch out: some folk behind fox-head and mermaid knockers will lie to you now. A sharp eye (WITS) is your only way of telling."
    ]
  },
  {
    title: "Chapter III — The Brass of Brassmoor",
    target: "Lady Lucinda Fairweather", nickname: "Lady Lucinda",
    nights: 4, brasses: 14, dosed: 8, lieChance: 0.35, enemyBoost: 4,
    intro: [
      "Your last shore leave before the Gannet sails for the Indies. There's a legend in every port: Lady Lucinda, the Brass of Brassmoor. Nobody you know has found her door.",
      "The dose is everywhere this winter. The Lock Hospital has a queue round the block.",
      "One last search, Jack. Knock carefully."
    ]
  }
];

/* ---------- names ---------- */
BK.NAMES = {
  first: ["Agnes", "Albert", "Ada", "Amos", "Bess", "Barnabas", "Clara", "Cyrus", "Dora", "Edwin", "Effie", "Ezekiel",
    "Florence", "Gideon", "Hattie", "Horace", "Ida", "Isaac", "Jemima", "Jonah", "Kezia", "Lemuel", "Lottie", "Mabel",
    "Mordecai", "Nettie", "Obadiah", "Peg", "Percival", "Queenie", "Rufus", "Sal", "Septimus", "Tilly", "Tobias",
    "Ursula", "Victor", "Winnie", "Walter", "Zillah", "Hester", "Silas", "Martha", "Jasper", "Lavinia", "Ned", "Orla", "Cuthbert"],
  brassFirst: ["Dolly", "Nancy", "Sal", "Bess", "Polly", "Moll", "Rosie", "Lil", "Flo", "Nell", "Jenny", "Kit", "Maggie", "Tess", "Annie", "Peg", "Hetty", "Lizzie"],
  brassNick: ["Bonny", "Lively", "Two-Shilling", "Scarlet", "Lucky", "Sweet", "Saucy", "Sailor's", "Gaslight", "Little", "Dancing", "Honest"],
  last: ["Ashby", "Bramble", "Coggins", "Dimmock", "Eldridge", "Fairweather", "Gudgeon", "Hobbs", "Ingle", "Jessop",
    "Kettle", "Loame", "Marrow", "Nettleship", "Oakes", "Pinch", "Quarrie", "Rudd", "Sallow", "Thrupp", "Umber",
    "Venn", "Whitlock", "Yardley", "Bellweather", "Crabbe", "Dunmore", "Grubb", "Haddock", "Mullins", "Pickering", "Spratt"],
  jobs: {
    wharf: ["lighterman", "net-mender", "ship's cook", "stevedore", "rope-maker", "customs man", "oyster seller"],
    mill: ["weaver", "spinner", "mill foreman", "dyer", "bobbin-maker", "loom tuner", "carter"],
    chapel: ["schoolmistress", "verger", "solicitor", "bookseller", "retired colonel", "organist", "apothecary"],
    rookery: ["rag-and-bone man", "laundress", "match-seller", "chimney sweep", "costermonger", "tosher", "gin-shop keeper"],
    square: ["tailor", "clockmaker", "printer", "barber", "milliner", "lamplighter", "cab driver"]
  }
};

BK.DISTRICT_NAMES = {
  wharf: "The Wharf", mill: "Mill Row", chapel: "Chapel Hill", rookery: "The Rookery", square: "Gaslight Square"
};

/* which knockers each district favours */
BK.DISTRICT_KNOCKERS = {
  wharf: ["anchor", "anchor", "mermaid", "fox", "ring", "rose", "lion"],
  mill: ["ring", "ring", "hand", "fox", "lion", "rose", "owl"],
  chapel: ["hand", "owl", "owl", "lion", "lion", "ring", "rose"],
  rookery: ["rose", "rose", "fox", "fox", "ring", "mermaid", "anchor"],
  square: ["lion", "owl", "ring", "fox", "mermaid", "hand", "rose"]
};

/* ---------- items ---------- */
BK.ITEMS = {
  bread:    { name: "Loaf of bread", price: 1, desc: "Restores 15 Nerve.", use: { nerve: 15 } },
  pie:      { name: "Eel pie", price: 2, desc: "Restores 30 Nerve.", use: { nerve: 30 } },
  rum:      { name: "Tot of rum", price: 2, desc: "Restores 35 Nerve but adds 5 Suspicion.", use: { nerve: 35, suspicion: 5 } },
  tonic:    { name: "Dr Pell's Tonic", price: 5, desc: "Fully restores Nerve.", use: { nerve: 999 } },
  oil:      { name: "Lantern oil", price: 2, desc: "Your lantern burns wider for the rest of the night.", use: { lantern: 1 } },
  cologne:  { name: "Bay rum cologne", price: 3, desc: "+2 Charm for the rest of the night.", use: { cologne: 1 } },
  snuff:    { name: "Pinch of snuff", price: 3, desc: "+2 Wits for the rest of the night.", use: { snuff: 1 } },
  mercury:  { name: "Mercury pills", price: 8, desc: "The old cure for the dose. Works 7 times in 10, and tastes like a ship's anchor.", use: { cure: 0.7 } },
  lockpick: { name: "Lockpick", price: 6, desc: "Lets you slip into a house when nobody answers. Breaks after use. Raises Suspicion.", use: null },
  marlin:   { name: "Marlinspike", price: 4, desc: "Weapon: +2 damage.", equip: { slot: "weapon", atk: 2 } },
  cosh:     { name: "Leather cosh", price: 9, desc: "Weapon: +4 damage.", equip: { slot: "weapon", atk: 4 } },
  knuckles: { name: "Brass knuckles", price: 15, desc: "Weapon: +6 damage.", equip: { slot: "weapon", atk: 6 } },
  peacoat:  { name: "Dark pea-coat", price: 5, desc: "Clothing: Suspicion gains are cut by a third.", equip: { slot: "wear", stealth: 1 } },
  oilskin:  { name: "Thick oilskins", price: 10, desc: "Clothing: takes 3 off every hit.", equip: { slot: "wear", def: 3 } },
  // quest trinkets (not sold)
  locket:   { name: "Silver locket", price: 0, desc: "Somebody is missing this.", quest: true },
  letter:   { name: "Sealed letter", price: 0, desc: "Addressed in a careful hand.", quest: true },
  ledger:   { name: "Torn ledger page", price: 0, desc: "Numbers and initials. Someone wants it back.", quest: true },
  spoon:    { name: "Christening spoon", price: 0, desc: "Engraved with a baby's name.", quest: true },
  medal:    { name: "Crimean medal", price: 0, desc: "An old soldier's pride.", quest: true },
  ribbon:   { name: "Blue silk ribbon", price: 0, desc: "A sweetheart's keepsake.", quest: true }
};
BK.SHOP_STOCK = ["bread", "pie", "rum", "tonic", "oil", "cologne", "snuff", "mercury", "lockpick", "marlin", "cosh", "knuckles", "peacoat", "oilskin"];
BK.QUEST_ITEMS = ["locket", "letter", "ledger", "spoon", "medal", "ribbon"];

/* ---------- street enemies ---------- */
BK.ENEMIES = [
  { id: "footpad", name: "Footpad", hp: 18, atk: 4, will: 8, xp: 12, coin: [2, 5], line: "A wiry shape peels out of an alley. \"Your shore pay. Now.\"" },
  { id: "sailor", name: "Drunken sailor", hp: 22, atk: 5, will: 7, xp: 14, coin: [1, 6], line: "A sailor off another ship lurches into your path, half-cut and spoiling for a fight." },
  { id: "dog", name: "Stray mastiff", hp: 14, atk: 4, will: 6, xp: 10, coin: [0, 0], line: "A starving mastiff growls, hackles up, teeth bared." },
  { id: "bully", name: "Bully-boy", hp: 28, atk: 6, will: 10, xp: 20, coin: [3, 8], line: "A big man in a stained waistcoat. \"The girls on this street are spoken for, Jack Tar.\"" },
  { id: "crimp", name: "Crimp", hp: 24, atk: 6, will: 11, xp: 22, coin: [2, 9], line: "A crimp with a cosh. He'd sell you to the next whaler for a pound." },
  { id: "brawler", name: "Gin-mad brawler", hp: 34, atk: 7, will: 12, xp: 28, coin: [2, 7], minCh: 1, line: "Eyes like boiled eggs and fists like hams. He swings before he speaks." },
  { id: "pimp", name: "Jealous fancy-man", hp: 38, atk: 8, will: 13, xp: 34, coin: [5, 12], minCh: 2, line: "A flash cove in a checked suit. \"You've been knocking on MY doors, sailor.\"" }
];

/* ---------- flavour ---------- */
BK.HEADLINES = [
  "BRIG GANNET IN PORT: TOWN BRACES FOR SHORE LEAVE",
  "LOCK HOSPITAL 'FULL TO THE RAFTERS', SAYS MATRON",
  "ALDERMAN PROMISES NEW GAS LAMPS 'BY SPRING, OR THE SPRING AFTER'",
  "MUSIC HALL PACKED FOR MISS LARK'S NEW SONG, 'THE BRASS BEHIND THE DOOR'",
  "TEMPERANCE SOCIETY MEETING POSTPONED, CHAIRMAN 'INDISPOSED'",
  "MERCURY PRICES RISE; APOTHECARIES 'RUN OFF THEIR FEET'",
  "PAWNBROKER REPORTS RECORD TRADE IN SAILORS' WATCHES",
  "CONSTABULARY WARNS OF CRIMPS ON THE WHARF",
  "BRASS KNOCKERS STOLEN FROM THREE DOORS ON MILL ROW",
  "FOG ON THE CANAL: LIGHTERMAN FALLS IN, CLIMBS OUT, FALLS IN AGAIN"
];

BK.RUMOURS = [
  "Folk say the canal gives back what it takes, given time.",
  "The lamplighter swears the gas burns green on Friday nights.",
  "A night with Venus, a lifetime with Mercury, as the old sailors say.",
  "They say the crypt under St Bride's goes further than the church does.",
  "Every brass in Brassmoor knows the secret knock. Few sailors do.",
  "The fox-heads on the Wharf will sell you the same lie twice, at twice the price."
];
