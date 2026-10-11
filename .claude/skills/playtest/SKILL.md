---
name: playtest
description: Play the Army Rush game (game/) in a phone-sized headless browser, look at screenshots and gameplay metrics, check the player's feedback, and write a prioritized fix list. Use when asked to playtest, play the game, find what needs improving, or check feedback in game/playtest/FEEDBACK.md.
---

# Playtest Army Rush

The Android APK wraps the same web build, so playing `game/dist` in headless Chromium plays the real game.
An Android emulator is not available in the cloud container (no /dev/kvm and no access to the Android SDK).

## Steps

1. Build: `cd game && npm ci && npm run build`.
2. Read `game/playtest/FEEDBACK.md`. Every point in it must be checked and answered in the report.
3. Play. Choose levels that cover early, middle and late game, plus any level the feedback names:
   ```
   node tools/playtest.mjs --levels 1-1,1-3,2-2,4-1,6-3 --styles bot,naive --speed 2 --out playtest/run-<date>
   ```
   Options: `--difficulty recruit|soldier|veteran|nightmare`, `--upgrades N` (all upgrades at level N),
   `--shots-every SECONDS`, `--dist <folder>` to test an older build.
   Each run prints a summary line and writes `report.json` and screenshots (`w<world>-l<level>-<style>-<sec>s.png`).
4. Look at the screenshots with the Read tool: at least the start, every gate or board row you can find,
   each enemy charge, the boss fight and the result screen for each run. Judge it as a player would:
   is it readable, does it feel fair, is there tension, does anything look broken?
5. Read `report.json`. Useful signals:
   - `bullets.medianTravel` / `maxTravel` vs. how far up the track you can see in the screenshots
   - `rewards.missedAfterOpening`, `rewards.gatesThatHitMax`
   - `losses` by cause (clash, stomp, crash, gate, burn), `enemies.clashes`, `enemies.peakDanger`
   - `bossFightSeconds`, `bossHpLeft`, `result`, `timeline`
   - `errors` (any JavaScript error is a bug)
   - `fps` is software rendering and only useful for relative comparisons
6. Optionally run the balance bot for numbers: `node tools/balance.mjs soldier career`.
7. Write `game/playtest/REPORT.md` with these sections:
   - **Feedback check**: a table with one row per FEEDBACK.md point: status (fixed / still a problem / partly),
     the evidence (screenshot file or metric), and a proposed fix.
   - **New problems found**: what you saw, where (file + level + time), and why it hurts the game.
   - **Fix list**: numbered, most important first, each a concrete change (which file or system, what to
     change, what number to use). This is what gets handed to the developer.
   - **Metrics**: a table of the key numbers from each run.
   Only report what you saw or measured. Name the screenshot or metric for every claim.
8. Do not change the game's source code during a playtest. The report is the deliverable.
