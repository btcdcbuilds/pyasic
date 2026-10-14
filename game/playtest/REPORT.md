# Playtest report — Army Rush v1.0.3 (2026-10-11)

Written by the playtest agent (see `.claude/skills/playtest/SKILL.md`). It played the frozen v1.0.3 web build (`playtest/run-dist-v1.0.3`, the same build the APK wraps) in headless Chromium at phone size (390×844), `--speed 2`, Soldier difficulty. Runs: levels 1-1, 1-3, 2-2, 4-1, 6-3 × styles bot/naive with 0 upgrades (`playtest/run-v1.0.3`), plus 2-2 and 6-3 with 5 upgrades (`playtest/run-v1.0.3-up5`). 14 runs, 0 JavaScript errors, 38 screenshots reviewed. Headless FPS (median ≈10) is software rendering, not a smoothness measurement. Line numbers refer to `sim.js` at commit 1e9d3ad.

The **Status after fixes** column was added by the developer and shows what v1.0.4 and v1.0.5 changed.

**Re-check on v1.0.5** (`playtest/run-v1.0.5*`, same harness): bullets travel a median of 120–121 m in every run (was 42–62); 0 rewards missed after opening (was up to 4 of 8); no gate caps; `tools/test-boss.mjs` passes on 5 levels (boss keeps taking damage for the whole fight). A first version of the new boss attacks was too harsh for a player who never dodges (`naive` lost 142–242 soldiers to them in 1-1/2-2), so hits were softened and early bosses ramp up to full strength by world 3; after that `naive` won 1-1 and lost 2-2 at the final boss after 146 s.

## Feedback check

| # | Feedback | Status in v1.0.3 | Evidence | Status after fixes |
|---|---|---|---|---|
| 1 | "The enemy needs a lot of work. It doesn't work properly." | Still a problem | In 1-1…4-1 squads die before reaching the army (0–3 clashes per run, `peakDanger` ≤0.6 in most runs); `w4-l1-bot-051s.png` shows them dying mid-track. 6-3: the first walled horde wipes the army at 13.8 s (0 upgrades) / 15.5 s (5 upgrades). Squad labels overlap ("25/20/14" in `w1-l1-bot-030s.png`). Squads never shoot back; boss minions spawn beside the army and slide past without clashing (`w1-l3-bot-115s.png`). | v1.0.5: squads charge from 75 m and cut across lanes faster, shoot back, can't slide past, stacked labels offset, world-6 horde smaller |
| 2 | "The end fight against the big guy is not very thoughtful." | Still a problem **and bugged** | No phases, telegraphs or dodgeable attacks; won fights lasted 2.5–7.4 s. In every fight longer than ~8 s the boss stopped taking damage (frozen HP bars in `w1-l3-bot-098s`…`115s`, `w1-l1-naive-076s`…`091s`) — see bug A. | v1.0.4: telegraphed slam/sweep/rocks, phases, shield until close. v1.0.5: bug A fixed, minions charge from 25 m ahead |
| 3 | "More to the level after killing the first big guy." | Still a problem | `won` fires as soon as the boss dies; nothing placed after it. | v1.0.4: 2–3 stages per level, reinforcements after each mid-boss |
| 4 | "Credits, people and rewards time out and have a max." | Still a problem | Not a timer: (a) rewards shot open from the next lane were lost as MISSED (4 of 8 in 2-2 naive; `w2-l2-naive-047s.png`); (b) + gates capped at 2v+5, flipped − gates at +5; 11–24 gates hit MAX per run. | v1.0.4: no MAX cap, opened rewards fly to you. v1.0.5: rewards only open when your army is in their lane, paired gate moved behind the board, flipped gates can grow back to their original size |
| 5 | "Bullets still don't make it all the way up the track." | Still a problem | Median bullet travel 42–62 m vs. track visible to ~120–200 m; bullets end around screen y≈278 while content shows to y≈120–160 (`w2-l2-bot-080s.png`). | v1.0.4: range 60–130 m. v1.0.5: every bullet flies at least 120 m (half damage beyond the weapon's range) |
| 6 | Not very fluent | Can't verify headless | — | Needs a phone check |
| 7 | Bullets don't go far enough | Still a problem | Same as #5 | As #5 |
| 8 | No anxiety when attackers come | Still a problem | `peakDanger` ≤0.6 and ≤3 clashes in most runs, then 6-3 is an instant wipe. | v1.0.5: see #1 |
| 9 | Can hide in a walled lane | Fixed | Horde crosses walls (`up5/w6-l3-bot-015s.png`). | — |
| 10 | Too blocky (kills/effects) | Partly | Boss death is one flat white disc (`w1-l1-bot-076s.png`); ghosts linger at the screen edge (`w6-l3-bot-013s.png`). | v1.0.5: staggered boss-death explosions, ghosts fade faster and stay on the track |
| 11 | Levels too short | Fixed | 727–1299 m, 75–147 s. | — |
| 12 | Rewards captured in wrong lane | Fixed but overshot (#4) | — | v1.0.5: see #4 |
| 13 | Shooting in bursts | Fixed | Continuous streams (`w2-l2-bot-080s.png`). | — |

## New problems found

- **A. Boss becomes invulnerable ~8–9 s into a fight (cause of 4 of 6 losses).** `updateProjectiles` stops scanning at the first entity whose `d − 8 > p.d`, which assumes `ents` stays sorted by distance. The boss walked back past an earlier (dead) squad, so the scan stopped before reaching it. Reproduced on the HEAD source: boss damage 160–272/s for t = 1–8 s, then 0/s from t = 10 to 39 s.
- **B. Bullets fly sideways off the track** when the aim target is level with the army: `vx = Δx / max(0.05, Δd/speed)` explodes when Δd≈0 (`w1-l3-bot-102s.png`).
- **C. World 6 is a difficulty cliff:** the first gauntlet (29/41/53 shielded enemies) wipes a 47–71 pistol army at 13.8 s / 15.5 s.
- **D. Squad labels stack and are unreadable** (`w2-l2-bot-022s.png`).
- **E. Rewards opened from the next lane show MISSED** because bullets spread over the army's radius (`w2-l2-naive-047s.png`).
- **F. The boss doesn't threaten a strong army** (2-2 bot: boss died in 2.5–3.9 s with zero losses).

## Fix list (as written by the agent, most important first)

1. Make the boss always hittable (fix bug A), stop it walking at the army; add a regression test.
2. Rewards: only unlock in the army's lane; stagger the paired gate behind the board; magnetic collection; raise/remove gate caps (a flipped − gate should be able to grow back to its original size).
3. Real boss fight: telegraphed slam / sweep / charge, HP phases, minions that charge from ~25 m ahead, a weak spot, 20–30 s fights.
4. Continue the level after the boss: a second segment ending in a stronger boss or a bonus run-out.
5. Enemy squads: charge from 75 m, steer at 5 m/s, shoot back within 20 m, merge into a clash instead of sliding past, clamp bullet `vx`, merge/offset labels.
6. Smooth world 6: later first gauntlet, smaller hordes.
7. Bullets travel ≥110 m (full damage within weapon range, 50% beyond).
8. Danger vignette + warning sound.
9. Boss-death and ghost effects.

## Metrics (v1.0.3)

| Level | Style | Upgr. | Result | Game s | Army final/peak | Weapon (range) | Bullet median/max m | Boss fight s | Boss HP left/max | Rewards opened/collected/missed | Gates at MAX | Clashes | Peak danger | Losses by cause |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1-1 | bot | 0 | won | 75.5 | 269/332 | smg (42) | 43/51 | 7.4 | 0/13000 | 4/3/1 | 12 | 1 | 0.15 | stomp 59, clash 4 |
| 1-1 | naive | 0 | lost | 90.6 | 0/141 | rifle (52) | 44/54 | 22.7 | 6049/13000 | 3/3/0 | 11 | 3 | 1.5 | crash 4, clash 9, gate 69, stomp 77 |
| 1-3 | bot | 0 | lost | 116.4 | 0/315 | smg (42) | 43/51 | 34 | 4990/17374 | 3/2/1 | 14 | 8 | 0.6 | clash 45, crash 19, stomp 308 |
| 1-3 | naive | 0 | won | 87.1 | 220/239 | rifle (52) | 53/54 | 5.2 | 0/17374 | 4/3/1 | 15 | 1 | 0.27 | crash 13, clash 2, stomp 19 |
| 2-2 | bot | 0 | won | 86.3 | 378/378 | rifle (42) | 42/51 | 3.9 | 0/31030 | 6/6/0 | 20 | 0 | 0.2 | crash 44 |
| 2-2 | naive | 0 | won | 87.5 | 346/377 | rifle (42) | 42/43 | 4.6 | 0/31030 | 8/4/4 | 17 | 1 | 0.24 | crash 12, clash 4, stomp 31 |
| 4-1 | bot | 0 | won | 101.3 | 448/602 | minigun (49) | 49/51 | 7.3 | 0/114428 | 7/7/0 | 19 | 2 | 0.48 | crash 42, clash 30, stomp 154 |
| 4-1 | naive | 0 | lost | 107.2 | 0/278 | laser (60) | 62/67 | 14.6 | 19494/114428 | 7/6/1 | 16 | 2 | 0.36 | crash 41, gate 67, stomp 243, clash 22 |
| 6-3 | bot | 0 | lost | 13.8 | 0/47 | pistol (42) | 44/44 | - | 651938/651938 | 0/0/0 | 1 | 2 | 1.43 | crash 5, clash 49 |
| 6-3 | naive | 0 | lost | 13.8 | 0/54 | pistol (42) | 44/44 | - | 651938/651938 | 0/0/0 | 0 | 2 | 1.49 | crash 1, clash 54 |
| 2-2 | bot | 5 | won | 84.6 | 386/386 | rifle (42) | 42/51 | 2.5 | 0/31030 | 7/7/0 | 21 | 0 | 0.11 | crash 32 |
| 2-2 | naive | 5 | won | 86.2 | 308/308 | rifle (42) | 42/43 | 3.1 | 0/31030 | 7/7/0 | 14 | 3 | 0.47 | crash 21, clash 39 |
| 6-3 | bot | 5 | lost | 15.5 | 0/71 | pistol (42) | 44/44 | - | 651938/651938 | 0/0/0 | 1 | 3 | 1.42 | crash 1, clash 85 |
| 6-3 | naive | 5 | lost | 147.5 | 0/762 | plasma (56) | 56/61 | 22.3 | 375150/651938 | 8/5/3 | 24 | 10 | 0.67 | clash 252, crash 159, gate 167, stomp 620 |
