// Coin rewards, shared by the game and tools/economy.mjs so both use the same numbers.
export function levelCoins({ won, L, kills, survivors, stars, bonusMult = 1, distFrac = 1, pickedCoins = 0, diffCoin = 1, incomeLvl = 0 }) {
  const income = 1 + 0.1 * incomeLvl;
  let c;
  if (won) c = (25 + L * 8 + kills * 0.15 + survivors * 0.1) * (1 + 0.25 * (stars - 1)) * bonusMult;
  else c = (8 + L * 2 + kills * 0.08) * Math.min(1, distFrac);
  return Math.round(c * diffCoin * income) + pickedCoins;
}
