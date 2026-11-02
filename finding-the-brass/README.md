# Finding the Brass

A bawdy Victorian game of luck, ladies and shore leave, for adults. It runs on Android and in a web browser.

You play **Jack Halyard**, a sailor ashore in the fictional port of Brassmoor in 1887, with 30 shillings of pay and 6 nights of shore leave. Walk the gas-lit streets, knock on doors with brass knockers, and see who answers. Some nights are the time of your life. Some nights you get robbed, overcharged, chased off by a fancy-man, or you catch **the dose**.

Nothing explicit is shown: whatever happens once you "go up to her room" stays behind the door. All the ladies are drawn in period dress.

## Download

| File | What it is |
|---|---|
| `dist/FindingTheBrass.apk` | Installable Android build (debug-signed, Android 7.0+ / API 24+) |
| `web/index.html` | The same game: open it in any modern browser |

## How it plays

| Part | Details |
|---|---|
| Knocking | Each door's brass knocker gives you the odds. Rose doors are almost always brass houses. Lions might be a courtesan, or a rich man calling the constables. Hands will just lecture you. |
| The ladies | When a lady answers, her portrait is revealed like a turned card, with her looks and her price. Pay and go up to her room, haggle (Charm), buy her a drink, give her violets, look her over (Wits), or move on. |
| Luck of the draw | Every night upstairs is a gamble: *the night of your life*, *a grand night*, *fair enough*, *disappointing* or *a disaster*. Pricier ladies are safer bets. She might lift your purse, or her fancy-man might demand more. If she falls for you, she won't charge you again. |
| The dose | Go up to the wrong room with a lady who has the dose and you **always** catch it; nothing else gives it. It costs Good Times, Charm and Nerve. Three doses ends your shore leave. Gossip, the landlady, the hospital matron and a careful look can warn you; cures are at the Lock Hospital, Dr Pell's, or mercury pills. |
| Money | Ladies cost 2–25 shillings. Drinks, cures, fines and fancy-men add up. By day you can rest, work the docks for pay, or drink in the gin palace. |
| Score | **Good Times** over the shore leave, with a rank and a saved best score. Each new shore leave brings new ladies behind new doors. |
| The ladies' portraits | Generated in code: every lady has her own face, hair, eyes, gown and jewellery. |
| Little Black Book | Every lady you've met or heard about, with your star ratings, dose and thief warnings, a diary, and a map. |
| Town | 72×53-tile gas-lit map, 5 districts, 58 doors, constables, street fights, a tavern, music hall, church, Lock Hospital and pawnshop. |
| Controls | Touch d-pad, tap-to-walk and a big Knock button; keyboard (WASD/arrows, E, B, I, 1–9, Esc); the Android back button opens the pause menu. |

All graphics are drawn in code and all sounds are synthesised, so the game uses no external assets.

## Building the APK yourself

Requirements: JDK 17+ and the Android SDK (platform 34, build-tools 34.0.0).

```bash
cd finding-the-brass/android
echo "sdk.dir=/path/to/android-sdk" > local.properties
./gradlew assembleDebug
# output: app/build/outputs/apk/debug/app-debug.apk
```
