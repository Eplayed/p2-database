const EXCLUDED_LEAGUE_PATTERN = /hardcore|(^|\s)hc(\s|$)|ssf|ruthless|standard|\(pl\d+\)/i;

function isPrimaryChallengeLeague(league) {
  return Boolean(league?.name) && !EXCLUDED_LEAGUE_PATTERN.test(league.name);
}

function selectPrimaryChallengeLeague(leagues, snapshots = []) {
  const candidates = (leagues || []).filter(isPrimaryChallengeLeague);
  if (!snapshots.length) return candidates[0] || null;

  return candidates.find((league) => snapshots.some((snapshot) => (
    snapshot.url === league.url && snapshot.type === 'exp'
  ))) || null;
}

module.exports = { isPrimaryChallengeLeague, selectPrimaryChallengeLeague };
