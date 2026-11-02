# Finding the Brass

A bawdy Victorian role-playing game for Android and the web, for adults. It is set in Brassmoor, a fictional English port town in 1887.

You play **Jack Halyard**, a sailor on shore leave. Somewhere in town, one particular **brass** (a lady of the night) works from behind one of the doors. Go round knocking on brass knockers, pick up gossip, and work out which door she's behind before your ship sails. Some of the other brasses have **the dose**, so avoid them.

Nothing explicit is shown: whatever happens once you "go up to her room" stays behind the door.

## Download

| File | What it is |
|---|---|
| `dist/FindingTheBrass.apk` | Installable Android build (debug-signed, Android 7.0+ / API 24+) |
| `web/index.html` | The same game: open it in any modern browser |

To install on a phone, copy the APK over, open it, and allow "install unknown apps" when Android asks.

## How it plays

| Part | Details |
|---|---|
| Goal | Find the brass's door and go up to her room, within the nights of shore leave you have |
| Deduction | Her door is pinned down by **street** (5), **door colour** (6) and **brass knocker** (8). Each clue rules one out, and the ♥ counter shows how many doors still fit |
| Knocking | Ordinary households give gossip (and rule their own door out). When a brass answers you can look her over (Wits), ask about the target (Charm/coin), or go up to her room |
| The dose | Some brasses have it. The **only** way to catch it is to go up to the wrong room and sleep with the wrong brass, one who has it, and then you catch it every time. Knocking, talking and looking are always safe. It costs −2 Charm and Nerve every morning, and 3 doses in one shore leave ends it. Spot it first with dose warnings (red ✖ on the map) or a careful look; cure it at the Lock Hospital, Dr Pell's or with mercury pills |
| Chapters | 3 shore leaves: Ruby Raines (5 nights, 10 brasses, 4 dosed), Velvet Violet (4 nights, 12 brasses, 6 dosed, liars appear), Lady Lucinda (4 nights, 14 brasses, 8 dosed) |
| Town | 72×53-tile map with 5 districts and 58 doors, 43 of which can hide a brass. Plus the locals (pawnbroker, surgeon, landlady, constable, your captain and more) and landmarks (tavern, church, Lock Hospital, music hall, mill, warehouse) |
| RPG | Charm, Wits and Grit; levels and XP; Nerve; Suspicion and constables; street fights; side quests; secrets to use as leverage; shop and equipment |
| Controls | Touch d-pad, tap-to-walk and a big Knock button; keyboard (WASD/arrows, E, N, B, 1–9, Esc); the Android back button opens the pause menu |
| Saving | Autosaves at dawn and when the app is paused |

All graphics are drawn in code and all sounds are synthesised, so the game uses no external assets.

## Project layout

```
finding-the-brass/
  web/            HTML5 game (index.html, style.css, js/*.js)
  android/        Gradle project that wraps web/ in a full-screen WebView
  dist/           Prebuilt APK
```

## Building the APK yourself

Requirements: JDK 17+ and the Android SDK (platform 34, build-tools 34.0.0).

```bash
cd finding-the-brass/android
echo "sdk.dir=/path/to/android-sdk" > local.properties
./gradlew assembleDebug
# output: app/build/outputs/apk/debug/app-debug.apk
```

For a Play Store release you need your own signing key: add a `signingConfigs` block to `app/build.gradle` and run `./gradlew bundleRelease`.
