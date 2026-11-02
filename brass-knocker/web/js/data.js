/* The Brass Knocker — game content.
 * Everything here is original to this game: characters, town, weapons and places.
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

/* ---------- the three categories of the mystery ---------- */
BK.SUSPECTS = [
  { id: "crake", name: "Alderman Josiah Crake", short: "Crake", role: "Mill owner",
    desc: "Owns half of Brassmoor and has designs on the other half.", coat: "#3b2f2f", hair: "#bbbbbb", hat: "top" },
  { id: "vane", name: "Mrs Honoria Vane", short: "Vane", role: "Widowed landlady",
    desc: "Collects rents and secrets with equal care.", coat: "#4a2340", hair: "#2a1a10", hat: "bonnet" },
  { id: "mott", name: "Father Silas Mott", short: "Mott", role: "Chaplain of St Bride's",
    desc: "Preaches temperance from the pulpit. Smells faintly of gin.", coat: "#151515", hair: "#7a6a5a", hat: "none" },
  { id: "pell", name: "Dr Ezra Pell", short: "Pell", role: "Surgeon",
    desc: "Buys bodies for his anatomy lessons. Asks no questions.", coat: "#2b3a4a", hair: "#3a2a1a", hat: "bowler" },
  { id: "ruddock", name: "Captain Ned Ruddock", short: "Ruddock", role: "Master of the brig Gannet",
    desc: "Back in port with a hold he refuses to open.", coat: "#1f2f5a", hair: "#8a4a20", hat: "cap" },
  { id: "lark", name: "Kitty Lark", short: "Lark", role: "Music-hall songbird",
    desc: "Every gentleman's favourite. Nobody's friend.", coat: "#7a1f3a", hair: "#d8a040", hat: "feather" },
  { id: "grime", name: "Sergeant Barnaby Grime", short: "Grime", role: "Brassmoor Constabulary",
    desc: "Takes his tea with two sugars and a bribe.", coat: "#1a2440", hair: "#4a3a2a", hat: "helmet" },
  { id: "fenn", name: "Solomon Fenn", short: "Fenn", role: "Pawnbroker",
    desc: "Remembers every ticket he has ever written.", coat: "#3a3a20", hair: "#222222", hat: "cap" }
];

BK.MEANS = [
  { id: "laudanum", name: "Laudanum vial", short: "Laudanum" },
  { id: "shuttle", name: "Mill shuttle", short: "Shuttle" },
  { id: "boathook", name: "Boathook", short: "Boathook" },
  { id: "razor", name: "Cut-throat razor", short: "Razor" },
  { id: "shovel", name: "Coal shovel", short: "Shovel" },
  { id: "wire", name: "Piano wire", short: "Wire" },
  { id: "arsenic", name: "Arsenic-laced gin", short: "Arsenic gin" },
  { id: "knocker", name: "Wrenched-off brass knocker", short: "Brass knocker" }
];

BK.PLACES = [
  { id: "drowned", name: "The Drowned Man tavern", short: "Drowned Man" },
  { id: "mill", name: "Crake's Mill", short: "Mill" },
  { id: "crypt", name: "St Bride's crypt", short: "Crypt" },
  { id: "warehouse", name: "Bonded warehouse", short: "Warehouse" },
  { id: "hall", name: "Empire Music Hall", short: "Music Hall" },
  { id: "pawn", name: "Fenn's back room", short: "Pawn room" },
  { id: "lock", name: "Canal lock", short: "Canal lock" },
  { id: "square", name: "Gaslight Square", short: "Gaslight Sq." }
];

BK.CATS = { suspect: BK.SUSPECTS, means: BK.MEANS, place: BK.PLACES };
BK.CAT_LABEL = { suspect: "Who", means: "With what", place: "Where" };

/* ---------- chapters ---------- */
BK.CHAPTERS = [
  {
    title: "Chapter I — A Knock at Midnight",
    victim: "Rosie Quill",
    nights: 6, lieChance: 0, enemyBoost: 0,
    intro: [
      "Brassmoor, 1887. Fog off the canal, gas lamps hissing, and every door on every street wears a brass knocker.",
      "They call you Nell Tanner, and in this town they call women like you 'a brass'. Respectable folk cross the road. But you know every door in Brassmoor, and who answers it after dark.",
      "Tonight your friend Rosie Quill was found dead. The constables have already decided that a brass's death is no great matter. Some of them would happily hang it on you.",
      "So you'll do it yourself: knock on doors, listen, and find out WHO did it, WITH WHAT, and WHERE. When you're sure, take your case to the Magistrate's Court. You have six nights before the Assizes close the matter."
    ]
  },
  {
    title: "Chapter II — The Lion's Head",
    victim: "Thaddeus Wren, the Alderman's clerk",
    nights: 5, lieChance: 0.25, enemyBoost: 2,
    intro: [
      "Word gets round. A brass who solved a murder is good for business, and bad for the people who'd rather things stayed buried.",
      "A note is pushed under your door: Thaddeus Wren, a clerk with a ledger full of other people's sins, has been found dead.",
      "Be careful. Some doors with fox-head knockers will lie to you now, and a clever ear (WITS) is your only way of telling."
    ]
  },
  {
    title: "Chapter III — Brass and Bone",
    victim: "Magistrate Hollis Brand",
    nights: 5, lieChance: 0.35, enemyBoost: 4,
    intro: [
      "The Magistrate who heard your last two cases is dead, found cold in his own robes.",
      "Brassmoor is frightened. The streets are meaner, the constables are jumpier, and someone has started marking the knockers on certain doors.",
      "One last case, Nell. Knock carefully."
    ]
  }
];

/* ---------- knockers: the design on the door tells you who lives there ---------- */
BK.KNOCKERS = {
  lion:    { name: "Lion's head", trait: "wealthy", hint: "Money behind this door. Proud folk who don't like being disturbed, and who often have secrets worth knowing.", color: "#e0b040" },
  fox:     { name: "Fox head", trait: "shifty", hint: "Sly folk. They know plenty, but they don't always tell the truth.", color: "#d08a30" },
  hand:    { name: "Brass hand", trait: "devout", hint: "Pious households. They don't approve of you, but they won't lie.", color: "#d8c070" },
  anchor:  { name: "Anchor", trait: "sailor", hint: "Seafaring folk. Rough, generous and handy with their fists.", color: "#c0a050" },
  owl:     { name: "Owl", trait: "scholar", hint: "Learned folk. Hard to fool, but their testimony is sharp.", color: "#c8b060" },
  rose:    { name: "Rose", trait: "sister", hint: "A sisters' house: women in your line of work. Friends, if you've treated them well.", color: "#e09070" },
  ring:    { name: "Plain ring", trait: "plain", hint: "Ordinary working folk. Tired, wary and honest enough.", color: "#b89848" },
  mermaid: { name: "Mermaid", trait: "gambler", hint: "Gamblers and smugglers. You might win a fortune or lose your shirt.", color: "#d0a060" }
};

/* ---------- names for generated residents ---------- */
BK.NAMES = {
  first: ["Agnes", "Albert", "Ada", "Amos", "Bess", "Barnabas", "Clara", "Cyrus", "Dora", "Edwin", "Effie", "Ezekiel",
    "Florence", "Gideon", "Hattie", "Horace", "Ida", "Isaac", "Jemima", "Jonah", "Kezia", "Lemuel", "Lottie", "Mabel",
    "Mordecai", "Nettie", "Obadiah", "Peg", "Percival", "Queenie", "Rufus", "Sal", "Septimus", "Tilly", "Tobias",
    "Ursula", "Victor", "Winnie", "Walter", "Zillah", "Hester", "Silas", "Martha", "Jasper", "Lavinia", "Ned", "Orla", "Cuthbert"],
  last: ["Ashby", "Bramble", "Coggins", "Dimmock", "Eldridge", "Fairweather", "Gudgeon", "Hobbs", "Ingle", "Jessop",
    "Kettle", "Loame", "Marrow", "Nettleship", "Oakes", "Pinch", "Quarrie", "Rudd", "Sallow", "Thrupp", "Umber",
    "Venn", "Whitlock", "Yardley", "Bellweather", "Crabbe", "Dunmore", "Grubb", "Haddock", "Mullins", "Pickering", "Spratt"],
  jobs: {
    wharf: ["lighterman", "net-mender", "ship's cook", "stevedore", "rope-maker", "customs man", "oyster seller"],
    mill: ["weaver", "spinner", "mill foreman", "dyer", "bobbin boy's mother", "loom tuner", "carter"],
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
  wharf: ["anchor", "anchor", "mermaid", "fox", "ring", "rose"],
  mill: ["ring", "ring", "hand", "fox", "lion", "rose"],
  chapel: ["hand", "owl", "owl", "lion", "lion", "ring"],
  rookery: ["rose", "rose", "fox", "fox", "ring", "mermaid"],
  square: ["lion", "owl", "ring", "fox", "mermaid", "hand"]
};

/* ---------- items ---------- */
BK.ITEMS = {
  bread:    { name: "Loaf of bread", price: 1, desc: "Restores 15 Nerve.", use: { nerve: 15 } },
  pie:      { name: "Eel pie", price: 2, desc: "Restores 30 Nerve.", use: { nerve: 30 } },
  gin:      { name: "Bottle of gin", price: 2, desc: "Restores 35 Nerve but adds 5 Suspicion.", use: { nerve: 35, suspicion: 5 } },
  tonic:    { name: "Dr Pell's Tonic", price: 5, desc: "Fully restores Nerve.", use: { nerve: 999 } },
  oil:      { name: "Lantern oil", price: 2, desc: "Your lantern burns wider for the rest of the night.", use: { lantern: 1 } },
  perfume:  { name: "Violet perfume", price: 3, desc: "+2 Charm for the rest of the night.", use: { perfume: 1 } },
  snuff:    { name: "Pinch of snuff", price: 3, desc: "+2 Wits for the rest of the night.", use: { snuff: 1 } },
  lockpick: { name: "Lockpick", price: 6, desc: "Lets you slip into a house when nobody answers. Breaks after use. Raises Suspicion.", use: null },
  hatpin:   { name: "Steel hatpin", price: 4, desc: "Weapon: +2 damage.", equip: { slot: "weapon", atk: 2 } },
  cosh:     { name: "Leather cosh", price: 9, desc: "Weapon: +4 damage.", equip: { slot: "weapon", atk: 4 } },
  knuckles: { name: "Brass knuckles", price: 15, desc: "Weapon: +6 damage.", equip: { slot: "weapon", atk: 6 } },
  shawl:    { name: "Grey shawl", price: 5, desc: "Clothing: Suspicion gains are cut by a third.", equip: { slot: "wear", stealth: 1 } },
  corset:   { name: "Whalebone corset", price: 10, desc: "Clothing: takes 3 off every hit.", equip: { slot: "wear", def: 3 } },
  // quest trinkets (not sold)
  locket:   { name: "Silver locket", price: 0, desc: "Somebody is missing this.", quest: true },
  letter:   { name: "Sealed letter", price: 0, desc: "Addressed in a careful hand.", quest: true },
  ledger:   { name: "Torn ledger page", price: 0, desc: "Numbers and initials. Someone wants it back.", quest: true },
  spoon:    { name: "Christening spoon", price: 0, desc: "Engraved with a baby's name.", quest: true },
  medal:    { name: "Crimean medal", price: 0, desc: "An old soldier's pride.", quest: true },
  ribbon:   { name: "Blue silk ribbon", price: 0, desc: "A sweetheart's keepsake.", quest: true }
};
BK.SHOP_STOCK = ["bread", "pie", "gin", "tonic", "oil", "perfume", "snuff", "lockpick", "hatpin", "cosh", "knuckles", "shawl", "corset"];
BK.QUEST_ITEMS = ["locket", "letter", "ledger", "spoon", "medal", "ribbon"];

/* ---------- street enemies ---------- */
BK.ENEMIES = [
  { id: "footpad", name: "Footpad", hp: 18, atk: 4, will: 8, xp: 12, coin: [2, 5], line: "A wiry shape peels out of an alley. \"Purse. Now.\"" },
  { id: "sailor", name: "Drunken sailor", hp: 22, atk: 5, will: 7, xp: 14, coin: [1, 6], line: "A sailor lurches into your path, half-cut and spoiling for a fight." },
  { id: "dog", name: "Stray mastiff", hp: 14, atk: 4, will: 6, xp: 10, coin: [0, 0], line: "A starving mastiff growls, hackles up, teeth bared." },
  { id: "bully", name: "Bully-boy", hp: 28, atk: 6, will: 10, xp: 20, coin: [3, 8], line: "A big man in a stained waistcoat. \"Ain't seen you pay your dues, girl.\"" },
  { id: "snatcher", name: "Resurrection man", hp: 24, atk: 6, will: 11, xp: 22, coin: [2, 9], line: "A spade over his shoulder and grave-dirt under his nails. He doesn't want witnesses." },
  { id: "brawler", name: "Gin-mad brawler", hp: 34, atk: 7, will: 12, xp: 28, coin: [2, 7], minCh: 1, line: "Eyes like a boiled egg's and fists like hams. He swings before he speaks." },
  { id: "marker", name: "Knocker-marker", hp: 38, atk: 8, will: 13, xp: 34, coin: [5, 12], minCh: 2, line: "A hooded figure scraping a chalk mark on a knocker. They turn, and there's a knife in their hand." }
];

/* ---------- flavour ---------- */
BK.HEADLINES = [
  "FOG ON THE CANAL: LIGHTERMAN FALLS IN, CLIMBS OUT, FALLS IN AGAIN",
  "ALDERMAN PROMISES NEW GAS LAMPS 'BY SPRING, OR THE SPRING AFTER'",
  "MUSIC HALL PACKED FOR MISS LARK'S NEW SONG, 'THE KNOCKER ON MY HEART'",
  "TEMPERANCE SOCIETY MEETING POSTPONED, CHAIRMAN 'INDISPOSED'",
  "BRIG GANNET STILL AT ANCHOR; HARBOURMASTER RAISES AN EYEBROW",
  "SURGEON'S ANATOMY LECTURE OVERSUBSCRIBED; BODY SUPPLY 'ADEQUATE'",
  "PAWNBROKER REPORTS RECORD TRADE IN WEDDING RINGS",
  "CONSTABULARY 'CONFIDENT OF AN ARREST', SAYS SERGEANT",
  "BRASS KNOCKERS STOLEN FROM THREE DOORS ON MILL ROW",
  "RATS IN THE BONDED WAREHOUSE 'SIZE OF TERRIERS', CLAIMS WATCHMAN"
];

BK.RUMOURS = [
  "Folk say the canal gives back what it takes, given time.",
  "The lamplighter swears the gas burns green on the nights somebody dies.",
  "Old Ma Venn reckons a lion-head knocker means a man with two families.",
  "They say the crypt under St Bride's goes further than the church does.",
  "A brass who keeps her ears open hears more than a constable with a warrant.",
  "The fox-heads on the Wharf will sell you the same lie twice, at twice the price."
];
