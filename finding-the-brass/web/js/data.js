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

/* ---------- knockers: the design on the door hints at what's behind it ---------- */
BK.KNOCKERS = {
  rose:    { name: "Rose", trait: "sister", hint: "A rose on the door: almost always a brass house. Good odds.", color: "#e09070" },
  anchor:  { name: "Anchor", trait: "sailor", hint: "Sailors' girls work behind a lot of anchors. Cheap, cheerful, and sometimes a jealous husband instead.", color: "#c0a050" },
  mermaid: { name: "Mermaid", trait: "gambler", hint: "Gamblers' houses. Pretty girls, but watch your purse.", color: "#d0a060" },
  fox:     { name: "Fox head", trait: "shifty", hint: "Sly houses. A fair chance of a brass, and a fair chance of a fancy-man.", color: "#d08a30" },
  lion:    { name: "Lion's head", trait: "wealthy", hint: "Money. Sometimes a high-class courtesan, sometimes a furious gentleman who'll call the constables.", color: "#e0b040" },
  ring:    { name: "Plain ring", trait: "plain", hint: "Ordinary working folk, mostly. Now and then a girl earning a bit on the side.", color: "#b89848" },
  owl:     { name: "Owl", trait: "scholar", hint: "Respectable, mostly: governesses, tutors, the odd discreet lady.", color: "#c8b060" },
  hand:    { name: "Brass hand", trait: "devout", hint: "Pious households. You'll get a sermon, not a sweetheart.", color: "#d8c070" }
};
BK.KNOCKER_LIST = Object.keys(BK.KNOCKERS).map(function (k) { return { id: k, name: BK.KNOCKERS[k].name + " knocker" }; });

/* chance that a door with this knocker hides a brass, and which kinds */
BK.KNOCKER_ODDS = {
  rose:    { p: 0.9, tiers: ["street", "parlour", "parlour", "street"] },
  anchor:  { p: 0.55, tiers: ["dollymop", "street", "street"] },
  mermaid: { p: 0.6, tiers: ["street", "parlour"], thief: 0.25 },
  fox:     { p: 0.5, tiers: ["dollymop", "street"], thief: 0.15, fancy: 0.2 },
  lion:    { p: 0.35, tiers: ["courtesan", "parlour", "courtesan"] },
  ring:    { p: 0.3, tiers: ["dollymop", "street"] },
  owl:     { p: 0.15, tiers: ["parlour"] },
  hand:    { p: 0.05, tiers: ["dollymop"] }
};

/* doors are painted in these colours (just for looks now) */
BK.COLOURS = [
  { id: "red", name: "Red door", hex: "#8e1c1c" }, { id: "green", name: "Green door", hex: "#1f5e2c" },
  { id: "blue", name: "Blue door", hex: "#1c3c80" }, { id: "black", name: "Black door", hex: "#161616" },
  { id: "yellow", name: "Yellow door", hex: "#b88e1c" }, { id: "white", name: "White door", hex: "#cfcabc" }
];

/* kinds of brass: price range in shillings, hidden "spark" (how good a night), and risks */
BK.TIERS = {
  dollymop:  { name: "Dollymop", desc: "a part-time girl: cheap, cheerful and a gamble", price: [2, 4], spark: [1, 8], dose: 0.25, thief: 0.2, fancy: 0.12, looks: [2, 4] },
  street:    { name: "Street brass", desc: "a working girl who knows her trade", price: [3, 6], spark: [3, 8], dose: 0.2, thief: 0.15, fancy: 0.3, looks: [2, 4] },
  parlour:   { name: "Parlour girl", desc: "a lady of a respectable house: clean sheets and a fire", price: [6, 10], spark: [5, 9], dose: 0.12, thief: 0.08, fancy: 0.15, looks: [3, 5] },
  courtesan: { name: "Courtesan", desc: "a high-class lady who chooses her gentlemen", price: [12, 18], spark: [7, 10], dose: 0.05, thief: 0.04, fancy: 0.08, looks: [4, 5] },
  legend:    { name: "The Brass of Brassmoor", desc: "the most celebrated lady in the port", price: [25, 25], spark: [10, 10], dose: 0, thief: 0, fancy: 0, looks: [5, 5] }
};
BK.DISTRICT_PRICE = { chapel: 1.35, square: 1.15, mill: 1.0, wharf: 0.9, rookery: 0.8 };
BK.DISTRICT_DOSE = { chapel: -0.05, square: 0, mill: 0, wharf: 0.05, rookery: 0.1 };

/* the town's notable locals (they have their own doors) */
BK.LOCALS = [
  { id: "crake", name: "Alderman Josiah Crake", short: "Crake", role: "Landlord of half the town", desc: "Owns half of Brassmoor, including a good many houses with rose knockers.", coat: "#3b2f2f", hair: "#bbbbbb", hat: "top" },
  { id: "vane", name: "Mrs Honoria Vane", short: "Vane", role: "Widowed landlady", desc: "Knows exactly which of her tenants are taking the mercury cure.", coat: "#4a2340", hair: "#2a1a10", hat: "bonnet", lady: true },
  { id: "mott", name: "Father Silas Mott", short: "Mott", role: "Chaplain of St Bride's", desc: "Preaches against sin, and keeps careful notes on where it lives.", coat: "#151515", hair: "#7a6a5a", hat: "none" },
  { id: "pell", name: "Dr Ezra Pell", short: "Pell", role: "Surgeon", desc: "Treats the dose quietly, for cash, no names asked.", coat: "#2b3a4a", hair: "#3a2a1a", hat: "bowler" },
  { id: "ruddock", name: "Captain Ned Ruddock", short: "Ruddock", role: "Master of the brig Gannet, your captain", desc: "Wants his crew back aboard in one piece and free of the dose.", coat: "#1f2f5a", hair: "#8a4a20", hat: "cap" },
  { id: "lark", name: "Kitty Lark", short: "Lark", role: "Music-hall songbird", desc: "Knows every lady in town worth knowing.", coat: "#7a1f3a", hair: "#d8a040", hat: "feather", lady: true },
  { id: "grime", name: "Sergeant Barnaby Grime", short: "Grime", role: "Brassmoor Constabulary", desc: "Takes his tea with two sugars and a bribe.", coat: "#1a2440", hair: "#4a3a2a", hat: "helmet" },
  { id: "fenn", name: "Solomon Fenn", short: "Fenn", role: "Pawnbroker", desc: "Sells everything a sailor on shore leave could want, and buys back what he can't afford.", coat: "#3a3a20", hair: "#222222", hat: "cap" }
];

BK.LEAVE = { nights: 6, pay: 30 };
BK.INTRO = [
  "Brassmoor, 1887. The brig Gannet ties up at the Wharf after seven months at sea. Captain Ruddock hands out the pay: thirty shillings each, and six nights' shore leave.",
  "You are Jack Halyard, able seaman, and you've got money in your pocket and a town full of doors with brass knockers.",
  "Behind some of those doors are the brasses: the ladies of the night. Knock, see who answers, and take your chances. Some nights you'll have the time of your life. Some nights you'll be robbed, overcharged, or chased off by a jealous fancy-man.",
  "And some of the ladies have THE DOSE. Go up to the wrong room with the wrong brass and you WILL catch it. Look her over first, listen to the gossip, and keep enough money for the cure.",
  "Have the best shore leave you can before the Gannet sails. Your score is your GOOD TIMES."
];
BK.RANKS = [
  [0, "Should Have Stayed Aboard"], [40, "Landlubber"], [90, "A Decent Run Ashore"], [150, "Jolly Jack Tar"], [220, "The Toast of the Fo'c'sle"], [300, "Legend of Brassmoor"]
];

/* ---------- names ---------- */
BK.NAMES = {
  first: ["Agnes", "Albert", "Ada", "Amos", "Bess", "Barnabas", "Clara", "Cyrus", "Dora", "Edwin", "Effie", "Ezekiel",
    "Florence", "Gideon", "Hattie", "Horace", "Ida", "Isaac", "Jemima", "Jonah", "Kezia", "Lemuel", "Lottie", "Mabel",
    "Mordecai", "Nettie", "Obadiah", "Peg", "Percival", "Queenie", "Rufus", "Sal", "Septimus", "Tilly", "Tobias",
    "Ursula", "Victor", "Winnie", "Walter", "Zillah", "Hester", "Silas", "Martha", "Jasper", "Lavinia", "Ned", "Orla", "Cuthbert"],
  brassFirst: ["Dolly", "Nancy", "Sal", "Bess", "Polly", "Moll", "Rosie", "Lil", "Flo", "Nell", "Jenny", "Kit", "Maggie", "Tess", "Annie", "Peg", "Hetty", "Lizzie", "Ruby", "Violet", "Daisy", "Kate", "Mary-Ann", "Lottie"],
  poshFirst: ["Arabella", "Celestine", "Isadora", "Ottoline", "Rosalind", "Seraphina", "Valentina", "Georgiana", "Theodora", "Clementine", "Ophelia", "Evangeline"],
  poshLast: ["de Vere", "Montague", "Ashcombe", "Delacourt", "Beaumont", "St Clair", "Fairfax", "Lisle", "Devereux"],
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
  cologne:  { name: "Bay rum cologne", price: 3, desc: "+2 Charm for the rest of the night: better haggling and better nights.", use: { cologne: 1 } },
  snuff:    { name: "Pinch of snuff", price: 3, desc: "+2 Wits for the rest of the night: better at spotting the dose and thieves.", use: { snuff: 1 } },
  violets:  { name: "Bunch of violets", price: 1, desc: "A gift for a lady. Give it at the door: she warms to you and the night goes better.", use: null },
  rabbit:   { name: "Rabbit's foot", price: 6, desc: "Lucky charm: every night with a lady goes a little better while you carry it.", use: null },
  mercury:  { name: "Mercury pills", price: 8, desc: "The old cure for the dose. Works 7 times in 10, and tastes like a ship's anchor.", use: { cure: 0.7 } },
  marlin:   { name: "Marlinspike", price: 4, desc: "Weapon: +2 damage.", equip: { slot: "weapon", atk: 2 } },
  cosh:     { name: "Leather cosh", price: 9, desc: "Weapon: +4 damage.", equip: { slot: "weapon", atk: 4 } },
  knuckles: { name: "Brass knuckles", price: 15, desc: "Weapon: +6 damage.", equip: { slot: "weapon", atk: 6 } },
  jacket:   { name: "Smart shore-going jacket", price: 8, desc: "Clothing: +1 Charm, and the posher ladies take you more seriously.", equip: { slot: "wear", charm: 1 } },
  oilskin:  { name: "Thick oilskins", price: 10, desc: "Clothing: takes 3 off every hit.", equip: { slot: "wear", def: 3 } }
};
BK.SHOP_STOCK = ["bread", "pie", "rum", "tonic", "cologne", "snuff", "violets", "rabbit", "mercury", "marlin", "cosh", "knuckles", "jacket", "oilskin"];

/* ---------- street enemies ---------- */
BK.ENEMIES = [
  { id: "footpad", name: "Footpad", hp: 18, atk: 4, will: 8, xp: 12, coin: [2, 5], line: "A wiry shape peels out of an alley. \"Your shore pay. Now.\"" },
  { id: "sailor", name: "Drunken sailor", hp: 22, atk: 5, will: 7, xp: 14, coin: [1, 6], line: "A sailor off another ship lurches into your path, half-cut and spoiling for a fight." },
  { id: "dog", name: "Stray mastiff", hp: 14, atk: 4, will: 6, xp: 10, coin: [0, 0], line: "A starving mastiff growls, hackles up, teeth bared." },
  { id: "bully", name: "Bully-boy", hp: 28, atk: 6, will: 10, xp: 20, coin: [3, 8], line: "A big man in a stained waistcoat. \"The girls on this street are spoken for, Jack Tar.\"" },
  { id: "crimp", name: "Crimp", hp: 24, atk: 6, will: 11, xp: 22, coin: [2, 9], line: "A crimp with a cosh. He'd sell you to the next whaler for a pound." },
  { id: "brawler", name: "Gin-mad brawler", hp: 34, atk: 7, will: 12, xp: 28, coin: [2, 7], minCh: 1, line: "Eyes like boiled eggs and fists like hams. He swings before he speaks." },
  { id: "pimp", name: "Jealous fancy-man", hp: 32, atk: 7, will: 12, xp: 30, coin: [4, 10], line: "A flash cove in a checked suit. \"You've been knocking on MY doors, sailor.\"" }
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
