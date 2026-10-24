# Playtest report, round 2 (QA build "qa1", 2026-10-11)

A playtest agent played the web build in headless Chromium at phone size (390×844) across all 8 worlds: 20 runs, 0 JavaScript errors, median bullet travel 120–132 m, 0 rewards missed. Screenshots were in `playtest/qa1-*` (git-ignored). This file lists its findings and what was changed afterwards. The changes were re-checked with `npm test`, `tools/balance.mjs`, `tools/economy.mjs` and new headless screenshots (`playtest/qa2`, `playtest/qa3`).

## Bugs

| # | Finding | Fix | Checked by |
|---|---|---|---|
| 1 | Mid-boss health bar never showed: each boss view overwrote the "boss visible" flag, so only the last (final) boss counted | The flag now only follows the current boss | `qa2` screenshots show "Mini-boss 1/3" with its bar |
| 2 | Rewards that were opened during a boss fight stayed where they were | They now run to the army at 14 m/s while the boss is engaged | sim code; 0 missed rewards in `qa2` |
| 3 | "STAGE CLEAR! +N TROOPS" clipped off the screen edge | Split into two lines; every pop-up text is kept inside the screen | code |
| 4 | Rocket and plasma blasts whited out the screen | Blasts in the same 3 m spot within 0.12 s are merged; blast size capped | `qa2` rocket run screenshots |
| 5 | Enemy number labels drawn over the HUD | Labels hidden in the top 110 px and behind the current boss | code |
| 6 | Late mid-bosses were walls (one had 3.9 M HP) | Boss HP is sized to your army when the shield drops: at most ~22 s of your fire (mid-boss 14 s) | balance tables below |
| 7 | Version showed `v1.0.dev` locally | Expected: CI builds stamp the real version | — |

## Polish

| # | Finding | Change |
|---|---|---|
| 8 | HUD title and boss name hard to read | Dark pill behind them. Bundled font "Lilita One" (SIL Open Font License) because Android has no "Arial Black", which made text thin |
| 9 | Tutorial ran on timers | Each step now waits for the action (drag, gate passed, board opened, dodge) or a time limit; the world banner hides while the coach bubble shows |
| 10 | Bonus run had no decision | Each bonus tile now has a fixed troop cost, so you choose how far to go |
| 11 | Army snowballed through stacked % gates | Damage and fire-rate gates now add instead of multiply; a duplicate weapon board gives +15% damage |
| 12 | No ending | Note after the last level of each world, and an "all worlds beaten" note with credits after level 8-5 |
| 13 | No help after a defeat | Defeat tip based on what happened, plus an Upgrades button when you can afford one |
| 14 | Prices had no coin icon; locked weapons said "W1-5" | Coin icons on price buttons; "Clear 1-4" style unlock text |
| 15 | No sound toggles in Pause | Sound and Music toggles added to Pause |
| 16 | Weapon chip wrapped on narrow screens | Chip kept on one line |
| 17 | README weapon table out of date | Regenerated from `src/data.js` |
| 18 | Dark ring at the bottom during the bonus run | Not a bug: it is the outlined number on the bonus tile the army just crossed (`qa3` close-up) |

## Balance after the changes

`node tools/balance.mjs <difficulty> career` (perfect dodging bot, 120 runs):

| Difficulty | Wins | Average level | Average final-boss fight |
|---|---|---|---|
| Recruit | 120 | 152 s | 10.8 s |
| Soldier | 120 | 155 s | 12.5 s |
| Veteran | 120 | 159 s | 15.2 s |
| Nightmare | 119 | 164 s | 21.5 s |

`node tools/economy.mjs <difficulty> 0.6` (sloppy bot playing the whole career with its own coins):

| Difficulty | Levels cleared | Attempts |
|---|---|---|
| Soldier | 40/40 | 40 |
| Veteran | 40/40 | 42 |
| Nightmare | 40/40 | 93 |

## Still needs a phone

Smoothness, touch feel and sound levels can't be measured headless. Please note anything on your phone in `FEEDBACK.md`.
