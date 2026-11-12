export function tunForHuxi(huxi, rules) {
  if (rules.mode === 'ten') {
    const scoringHuxi = huxi === 10 ? 15 : huxi;
    return scoringHuxi === 11 ? 1 : 2 + Math.floor((scoringHuxi - 12) / 3);
  }
  return 1 + Math.floor((huxi - rules.minimum) / 3);
}

export function settle(winner, offer, hu, rules) {
  const names = [];
  const openingName = offer.kind === 'opening' ? (winner === offer.source ? '天胡' : '地胡') : null;
  if (rules.mode !== 'six') {
    if (hu.red === 0) names.push(['黑胡', 5]);
    if (hu.red === 1) names.push(['点胡', 3]);
    if (hu.red >= 13) names.push(['十三红', 5]);
    else if (hu.red >= 10) names.push(['十红', 2]);
    if (openingName) names.push([openingName, 5]);
    if (offer.kind === 'draw' && winner === offer.source) names.push(['自摸', 1]);
    if (!names.length) names.push(['平胡', 1]);
  }

  const tun = tunForHuxi(hu.huxi, rules);
  const unit = names.reduce((value, [, multiplier]) => value * multiplier, tun);
  const seats = rules.seats ?? 3;
  const payout = (seats - 1) * unit;
  const delta = Array(seats).fill(offer.kind === 'discard' ? 0 : -unit);
  if (offer.kind === 'discard') delta[offer.source] = -payout;
  delta[winner] = payout;
  return { winner, hu, tun, names, delta, offer, openingName };
}
