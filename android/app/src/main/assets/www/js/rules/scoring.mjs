export function tunForHuxi(huxi, rules) {
  if (rules.mode === 'ten') {
    const scoringHuxi = huxi === 10 ? 15 : huxi;
    return scoringHuxi === 11 ? 1 : 2 + Math.floor((scoringHuxi - 12) / 3);
  }
  if (rules.mode === 'fifteen' && huxi < 15) return 1;
  return 1 + Math.floor((huxi - rules.minimum) / 3);
}

export function settle(winner, offer, hu, rules) {
  const names = [];
  if (hu.red === 0) names.push(['黑胡', 5]);
  if (hu.red === 1) names.push(['点胡', 3]);
  if (hu.red >= 13) names.push(['十三红', 5]);
  else if (hu.red >= 10) names.push(['十红', 2]);
  if (offer.kind === 'opening' && winner === offer.source) names.push(['天胡', 5]);
  if (offer.kind === 'draw' && winner === offer.source) names.push(['自摸', 1]);
  if (offer.kind === 'discard' && offer.first) names.push(['地胡', 5]);
  if (!names.length) names.push(['平胡', 1]);

  const tun = tunForHuxi(hu.huxi, rules);
  const unit = names.reduce((value, [, multiplier]) => value * multiplier, tun);
  const delta = [-unit, -unit, -unit];
  delta[winner] = 2 * unit;
  if (offer.kind === 'discard') {
    for (const seat of [0, 1, 2]) {
      if (seat !== winner) delta[seat] = seat === offer.source ? -2 * unit : 0;
    }
  }
  return { winner, hu, tun, names, delta, offer };
}
