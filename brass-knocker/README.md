# The Brass Knocker

An original detective RPG for Android and the web. It is set in Brassmoor, a fictional English mill town in 1887.

You play **Nell Tanner**, a woman the town calls "a brass". She knows every door in Brassmoor and who answers it after dark. Each night she knocks on doors with brass knockers, listens and fights to find out **who** killed someone, **with what**, and **where**. Then she takes the case to the Magistrate.

## Download

| File | What it is |
|---|---|
| `dist/BrassKnocker.apk` | Installable Android build (debug-signed, Android 7.0+ / API 24+) |
| `web/index.html` | The same game: open it in any modern browser |

To install the APK on a phone, copy it over, open it, and allow "install unknown apps" for your file manager when Android asks.

## The game

| Feature | Details |
|---|---|
| Story | 3 chapters, each a newly randomised murder (8 suspects × 8 weapons × 8 places = 512 possible solutions) |
| Town | 72×53-tile map with 5 districts, 58 doors, 43 generated residents, 8 suspects' homes (Fenn's is also the pawnshop) and 7 landmarks |
| Knockers | 8 knocker designs (Lion, Fox, Owl, Rose, Anchor, Hand, Ring, Mermaid). The knocker tells you who lives behind the door: wealthy, liars, scholars, friendly sisters and so on |
| Deduction | Testimony crosses names off your notebook. From Chapter II, fox and mermaid doors can lie, and a Wits check may expose them |
| RPG | Charm, Wits and Grit; levels and XP; Nerve (health); Suspicion (heat); reputation; turn-based street fights; boss fights |
| Systems | Day/night clock (8pm to 5am), night deadlines, gas-lamp lighting, constable patrols, arrests, side quests, secrets you can use as leverage, pawnshop, equipment, gambling, busking, praying |
| Controls | Touch d-pad, tap-to-walk and a big Knock button; keyboard (WASD/arrows, E, N, B, 1–9, Esc); the Android back button opens the pause menu |
| Saving | Autosaves at dawn and when the app is paused |

No external assets are used. All graphics are drawn in code and all sound is synthesised.

## Project layout

```
brass-knocker/
  web/            HTML5 game (index.html, style.css, js/*.js)
  android/        Android Studio / Gradle project that wraps web/ in a WebView
  dist/           Prebuilt APK
```

## Building the APK yourself

Requirements: JDK 17+ and the Android SDK (platform 34, build-tools 34.0.0).

```bash
cd brass-knocker/android
echo "sdk.dir=/path/to/android-sdk" > local.properties
./gradlew assembleDebug
# output: app/build/outputs/apk/debug/app-debug.apk
```

For a Play Store release you need your own signing key: add a `signingConfigs` block to `app/build.gradle` and run `./gradlew assembleRelease` or `bundleRelease`.
