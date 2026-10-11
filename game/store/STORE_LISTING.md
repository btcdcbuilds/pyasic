# Store listing and release kit: Army Rush

Everything needed to publish on Google Play. Graphics are in this folder: `icon-512.png`,
`feature-graphic-1024x500.png` and `screenshots/` (1080×1920). Regenerate them with
`npm run build && node tools/store-assets.mjs && python3 tools/make_art.py`.

## Name

| Item | Value |
|---|---|
| App name (max 30 characters) | **Army Rush: Worlds at War** (24 characters) |
| Package name | `com.btcdcbuilds.armyrush` (permanent once published) |

**Name check:** a web search on 2026-10-11 found an iPad game called **"Army Rush!"** on the Apple App Store (https://apps.apple.com/cn/app/id1578913491). It also found several similar names, such as "Rush Army: Run and Shot" and "Rush War: Army Commander". No Google Play app called "Army Rush" came up, but search results are not a trademark search. Before selling, search the Play Store and a trademark database (for example USPTO or EUIPO) yourself. If the name is taken, consider a more distinctive one.

## Short description (max 80 characters)

> Grow your army, shoot the gates, beat giant bosses across 8 worlds. No ads. (75)

## Full description (max 4000 characters)

> Lead your army down the road to war!
>
> Steer your soldiers through gates that multiply your troops, shoot weapon crates to upgrade your whole army, free prisoners and recruit minigun heroes. Then face hordes that charge from every lane, and giant bosses that make you dodge their attacks.
>
> **8 WORLDS, EACH WITH ITS OWN TWIST**
> • Golden Bridge – learn the ropes
> • Desert Canyon – sandstorms cut your range
> • Jungle Temple – rolling boulders and prisoner cages
> • Frozen Peaks – your army slides on the ice
> • Volcano Forge – lava geysers erupt in the lanes
> • Neon City – shielded enemies and saw blades
> • Sky Fortress – crosswinds push you to the edge
> • Lunar Base – everything at once
>
> **10 WEAPONS**
> Pistol, SMG, assault rifle, shotgun, minigun, laser, rocket launcher, plasma cannon, tesla arc and railgun. Each one changes how you play: piercing beams, explosions and chain lightning.
>
> **REAL BOSS FIGHTS**
> Every level has 2–3 stages, and each stage ends with a boss. Watch for the red danger zones and steer out before the slam lands. Hit the glowing weak spot for double damage, and survive the enraged final phase. Then climb the bonus run for up to 5x coins.
>
> **4 THEMES**
> Play every level as the classic army, as Bitcoin Bulls against the bears, in an American football stadium, or on an Aussie rules oval.
>
> **PLAY YOUR WAY**
> • 40 levels and 4 difficulties, from Recruit to Nightmare
> • Permanent upgrades, a weapon armory and daily rewards
> • Plays offline
> • No ads and no in-app purchases. Everything is earned by playing.

**Trademark note for the themes:** keep the listing generic ("American football", "Aussie rules football"). Don't use "NFL", "AFL", team names or league logos in the app, icon, screenshots or text without a licence. The Bitcoin theme is fan art, and the game involves no real cryptocurrency. Read Google Play's current policy on cryptocurrency before publishing, and never claim players earn bitcoin.

## Category and tags

| Item | Value |
|---|---|
| Category | Games → Action (Arcade also fits) |
| Tags | Runner, Shooter, Casual, Offline |
| Contact email | Required by Play: use your developer email |

## Content rating (IARC questionnaire answers)

| Question area | Answer |
|---|---|
| Violence | Yes: cartoon/fantasy violence. Stylised soldiers and monsters; defeated units turn into white ghosts. No blood, no gore, no realistic human death. |
| Sexual content, nudity | No |
| Language | No |
| Controlled substances | No |
| Gambling / simulated gambling | No (the daily reward is a fixed amount; there are no random paid rewards) |
| User interaction / chat / user-generated content | No |
| Shares location / personal info | No |
| Digital purchases | No |

The expected rating is roughly PEGI 7 / ESRB Everyone 10+ for fantasy violence. The questionnaire decides the actual rating.

**Target audience:** choose 13+ (or 16+). Choosing under-13 brings in the Families policy and extra requirements.

## Data safety form

| Question | Answer |
|---|---|
| Does the app collect or share any user data? | **No** |
| Is data encrypted in transit? | Not applicable (nothing is transmitted) |
| Can users request deletion? | Not applicable. Progress lives only on the device; Settings → Reset all progress, or uninstalling, removes it |

The app has no analytics, no ads, no accounts and no network calls. Saves are kept in the app's local storage.

## Privacy policy

Play needs a public URL. Use `store/PRIVACY.md`, for example via the GitHub file link
`https://github.com/btcdcbuilds/pyasic/blob/<branch>/game/store/PRIVACY.md`, or via GitHub Pages.

## Release checklist

1. **Signing key** (once). Create an upload key and store it as repository secrets, as described in `game/README.md`: `ARMYRUSH_KEYSTORE_BASE64`, `ARMYRUSH_KEYSTORE_PASSWORD`, `ARMYRUSH_KEY_ALIAS`, `ARMYRUSH_KEY_PASSWORD`. Back the key file up somewhere safe; losing it means you can't update the app.
2. **Build.** Push or run the "Army Rush APK" workflow. With the secrets set, the GitHub Release contains a signed `.aab` (for Play) and a signed `.apk` (for your phone).
3. **Play Console account** (one-time registration fee). Create the app, and enrol in Play App Signing when asked.
4. **Requirements.**
   - Google's help page says new apps and updates must target **Android 16 (API 36)** from 2026-08-31. This project targets API 36 (`android/variables.gradle`).
   - Reports say new personal developer accounts must run a **closed test with at least 12 testers for 14 days** before going to production. Check the current rule in Play Console.
5. **Store listing.** Paste the texts above, and upload `icon-512.png`, `feature-graphic-1024x500.png` and at least 2 screenshots from `screenshots/`.
6. **Policy forms.** Fill in content rating, target audience, data safety, ads ("No ads") and the privacy policy URL.
7. **Release.** Upload the `.aab` to the testing track, then promote it to production.

**Sources for the requirements above:**
- Google Play target API level: https://support.google.com/googleplay/android-developer/answer/11926878
- Publishing overview (AAB, data safety, closed testing reports): https://www.choicely.com/tutorials/how-to-publish-an-app-on-google-play
