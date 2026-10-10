# Army Rush: Worlds at War

A 3D army runner / gate shooter for Android, built with Three.js and packaged as an APK with Capacitor. There are no ads and no purchases. Everything is earned by playing.

## Install on Android

1. Open this repository's **Releases** page on your phone (`https://github.com/btcdcbuilds/pyasic/releases`).
2. Open the newest **Army Rush v1.0.N** release and tap the `.apk` file under **Assets**.
3. When Android asks, allow your browser to "Install unknown apps", then tap **Install**.

Every push that changes `game/` builds a new APK through `.github/workflows/game-apk.yml`. You can also start a build by hand from the **Actions** tab ("Army Rush APK", then "Run workflow").

### Keeping your save between updates (one-time setup)

Android only installs an update over an existing app if both APKs are signed with the same key. Without a key stored in GitHub, CI signs each build with a throwaway key. You then have to uninstall the old version first, and that deletes your progress. To fix this, create a key once and store it as repository secrets:

```bash
keytool -genkeypair -keystore armyrush.jks -alias armyrush -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Army Rush"
base64 -w0 armyrush.jks   # copy the output
```

Then go to repo **Settings → Secrets and variables → Actions** and add these secrets:

| Secret | Value |
|---|---|
| `ARMYRUSH_KEYSTORE_BASE64` | the base64 output |
| `ARMYRUSH_KEYSTORE_PASSWORD` | the store password you chose |
| `ARMYRUSH_KEY_ALIAS` | `armyrush` |
| `ARMYRUSH_KEY_PASSWORD` | the key password you chose |

## How to play

| Action | Effect |
|---|---|
| Drag left/right | Steer your army (arrow keys or A/D on desktop) |
| Your army fires automatically | Bullets hit whatever is in their column |
| Shoot a blue gate | Raises its number (each point costs a little more than the last) |
| Shoot a red `-` gate | Lowers the penalty until it flips to a `+` gate |
| Shoot a weapon board to 0 | Your whole army switches to that weapon (or gets +15% damage if it is a downgrade) |
| Shoot a HERO board to 0 | A minigun hero joins you. Each hero fires like 12 soldiers and soaks one wipe |
| Shoot a cage to 0 | Frees prisoners, who join your army |
| Run into a board/wall that still has HP | You lose soldiers in proportion to how much of your army hits it |
| Enemy squad | Shoot it down before contact; on contact both sides lose soldiers 1:1 |
| Boss | Stops your army; stomps kill soldiers every ~1.15 s until it dies |

## Worlds (8 worlds × 5 levels = 40 levels)

| # | World | Gameplay twist | Boss |
|---|---|---|---|
| 1 | Golden Bridge | Tutorial world, no twist | Red Brute |
| 2 | Desert Canyon | Sandstorm: -20% weapon range; more explosive barrels | Sand Golem |
| 3 | Jungle Temple | Dark ruins, rolling boulders, more prisoner cages | Stone Colossus |
| 4 | Frozen Peaks | Ice: your army slides when you steer | Frost Titan |
| 5 | Volcano Forge | Lava geysers erupt in lanes on a timer | Magma Behemoth |
| 6 | Neon City | Enemies have +50% shields; more weapon drops; saw blades | Mech Walker |
| 7 | Sky Fortress | Crosswinds push your army sideways | Storm Warlord |
| 8 | Lunar Base | Shields, geysers, saws and extra weapon drops all at once | Alien Overlord |

## Weapons (10)

| Weapon | Damage | Shots/s | Range | Special | Armory unlock | Price |
|---|---|---|---|---|---|---|
| Pistol | 1 | 2.0 | 24 | - | start | free |
| SMG | 1 | 4.5 | 24 | - | W1-5 | 400 |
| Assault Rifle | 2.2 | 3.6 | 30 | - | W2-4 | 1,200 |
| Combat Shotgun | 1.6 ×5 | 1.6 | 20 | 5 pellets in a spread | W3-3 | 2,500 |
| Minigun | 1.5 | 11 | 28 | - | W4-2 | 5,000 |
| Laser Rifle | 4.5 | 4 | 34 | pierces 2 targets | W5-1 | 9,000 |
| Rocket Launcher | 16 | 1.0 | 34 | explosive splash | W5-5 | 15,000 |
| Plasma Cannon | 9 | 2.6 | 32 | splash + pierce | W6-4 | 24,000 |
| Tesla Arc | 7 | 3.2 | 26 | chains to 3 extra targets | W7-3 | 36,000 |
| Railgun | 40 | 0.9 | 46 | pierces 6 targets | W8-2 | 55,000 |

Damage values are per soldier. Weapon boards inside levels can hand out any of these, scaled to the world you are in.

## Difficulty

| Mode | Enemy/obstacle strength | Bad gates | Coin multiplier |
|---|---|---|---|
| Recruit | ×0.7 | ×0.5 | ×0.8 |
| Soldier | ×1.0 | ×1.0 | ×1.0 |
| Veteran | ×1.6 | ×1.4 | ×1.5 |
| Nightmare | ×2.8 | ×1.9 | ×2.2 |

On top of that, every level scales up. Obstacle HP grows +30% per level index, boss HP grows faster, and later levels have more rows and more negative gates.

### Balance test results

`node tools/balance.mjs <difficulty> <upgrade level> <start weapon>` runs a bot through all 40 levels × 3 random layouts (120 runs). The bot steers greedily, so real players will do somewhat worse.

| Difficulty | Upgrades | Start weapon | Bot wins (of 120) |
|---|---|---|---|
| Recruit | none | Pistol | 108 |
| Soldier | none | Pistol | 92 |
| Veteran | none | Pistol | 42 |
| Nightmare | none | Pistol | 6 |
| Veteran | all Lv 6 | SMG | 118 |
| Nightmare | all Lv 6 | SMG | 100 |
| Nightmare | all Lv 12 | Assault Rifle | 120 |

## Research notes (why it is built this way)

The ads this is modelled on (blue army, `+N` gates, numbered weapon boards, giant red boss) match the "shoot the numbers" ads run by strategy games. Players and regulators have complained that these ads do not show the real game.

| Finding | Source |
|---|---|
| Last War: Survival store art shows "Pick Your Lane", "Grow Your Forces" and a boss in a multiplier gate level | https://apps.apple.com/us/app/-/id6448786147 |
| A parody game ("Real War: Not Fake") was made around Last War's "shooting numbers" ads, whose main game is different | https://www.notebookcheck.net/Someone-actually-made-one-of-those-fake-ad-games-and-it-s-pretty-good.1188256.0.html |
| UK ASA upheld a complaint that Top War ads did not represent the game | https://www.asa.org.uk/rulings/rivergame-ltd-g22-1166092-rivergame-ltd.html |
| UK ASA ruled an Evony ad showing "shooting numbered barrels" misleading | https://asa.org.uk/rulings/top-games-inc-a23-1213924-top-games-inc.html |
| Gate types in gate runners: add resources, change the character, remove resources, fail state | https://supersonic.com/learn/blog/how-to-design-a-hit-gate-runner-the-basics-and-best-practices/ |
| Count Masters reviews complain levels "never get harder" and about heavy ads | https://justuseapp.com/en/app/1568245971/count-masters-crowd-runner-3d/reviews |

How Army Rush responds to these complaints: the ad-style runner **is** the whole game; the 8 worlds play differently from each other; difficulty really ramps up (see the table above); and there are no ads or purchases.

These sources were read through web-search summaries only (the full pages could not be opened from the build environment).

## Develop

```bash
cd game
npm install
npm run dev            # play in a desktop browser (add ?autoplay to watch the bot)
npm run build && npx cap sync android   # then open game/android in Android Studio
```

| File | What it does |
|---|---|
| `src/data.js` | Weapons, worlds, difficulties, upgrades |
| `src/sim.js` | Level generator and gameplay simulation (no rendering, testable in Node) |
| `src/render.js` | Three.js scene, environments, crowds, bosses, effects |
| `src/main.js` | Menus, save data, input, game loop |
| `src/audio.js` | Procedural sound effects (no audio files) |
| `tools/balance.mjs` | Headless bot balance test |
