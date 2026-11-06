// Ballots received but not yet counted, per district. The Division only publishes the statewide total,
// so this expects each district to end up with its 2024 share of early and absentee ballots, takes off
// what it has counted already, and scales the rest to the statewide total. It leaves out the Division's questioned
// row, since questionedByDistrict estimates all of those. The page and scripts/simulate_projection.mjs share this
// file, so their estimates can't drift.
export function uncountedByDistrict(coverage, earlyAbsentee2024) {
  const { received, cvrBallotsByGroup } = coverage;
  const ballots = received.received - received.questioned;
  const sum = (values) => values.reduce((a, b) => a + b, 0);
  // The summary can run ahead of the CVR, and then these ballots are already among the hand-counted ones.
  const inSummary = (method) => sum(Object.values(coverage.districts).map((d) => d.summary[method] || 0));
  const statewide = Math.max(0, ballots - Math.max(cvrBallotsByGroup[2] || 0, inSummary("ab")) - Math.max(cvrBallotsByGroup[3] || 0, inSummary("ev")));
  const total2024 = sum(Object.values(earlyAbsentee2024.ballots));
  const raw = new Map(Object.entries(coverage.districts).map(([key, d]) => {
    const expected = (ballots * (earlyAbsentee2024.ballots[key] || 0)) / total2024;
    return [Number(key), Math.max(0, expected - (d.summary.ab || 0) - (d.summary.ev || 0))];
  }));
  const scale = statewide / (sum([...raw.values()]) || 1);
  return new Map([...raw].map(([key, value]) => [key, value * scale]));
}

// How 2026's turnout compares with 2024's, from each district's Election Day ballots in the two CVRs, leaving
// out districts with ballots counted by hand. scale is the typical ratio. sdLog is how far districts stray from it.
export function turnoutSince2024(coverage, questioned2024) {
  const logs = Object.entries(coverage.districts)
    .filter(([key, d]) => d.summary.ed && d.summary.ed === d.cvr.ed && questioned2024.electionDay[key])
    .map(([key, d]) => Math.log(d.cvr.ed / questioned2024.electionDay[key]));
  const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
  return { scale: Math.exp(mean), sdLog: Math.sqrt(logs.reduce((s, x) => s + (x - mean) ** 2, 0) / logs.length) };
}

// Questioned ballots in a contest's summary votes for a district, but not yet in the CVR. They're already among the
// hand-counted ones, so they come off what's still expected. A State House or Senate race has only its share of them.
export function questionedAheadOfCvr(coverage, questioned2024, statewide, hd) {
  const { summary = {}, cvr = {} } = coverage.districts[hd] ?? {};
  const ahead = Math.max(0, (summary.q || 0) - (cvr.q || 0));
  return statewide ? ahead : (ahead * (questioned2024.house[hd] || 0)) / (questioned2024.statewide[hd] || 1);
}

// Questioned ballots expected per district. The Division hasn't published a full count, so this takes 2024's,
// scaled for turnout. Questioned voters often vote outside their own district and then only their statewide races
// count, so a State House or Senate race has far fewer of them than a statewide one.
export function questionedByDistrict(coverage, questioned2024, statewide) {
  const { scale } = turnoutSince2024(coverage, questioned2024);
  const counts = statewide ? questioned2024.statewide : questioned2024.house;
  return new Map(Object.keys(coverage.districts).map((key) => [Number(key), (counts[key] || 0) * scale]));
}
