// The State House and Senate as wholes: seats by party, from the races in projection.json and the seats not on the ballot.
// The page, the tests and scripts/simulate_projection.mjs share this file. Nothing here touches the DOM or d3.
export const PARTY_GROUPS = [
  { key: "republican", name: "Republican", color: "#e34948" },
  { key: "democrat", name: "Democrat", color: "#2a78d6" },
  { key: "other", name: "Nonpartisan and others", color: "#eda100" },
];

export function partyGroup(registration = "") {
  if (registration.startsWith("Registered Republican")) return "republican";
  if (registration.startsWith("Registered Democrat")) return "democrat";
  return "other";
}

// One entry per simulation: seats per party group, with races that tied in that simulation counted apart. A race with one
// candidate isn't simulated, so that seat counts for its candidate every time, as does a seat that isn't on the ballot.
export function seatsPerRun(chamber, projection) {
  const base = { republican: 0, democrat: 0, other: 0, tied: 0 };
  for (const seat of chamber.notOnBallot) base[partyGroup(seat.party)]++;
  const simulated = [];
  for (const race of chamber.races) {
    const parties = Object.fromEntries(race.candidates.map((x) => [x.letter, partyGroup(x.party)]));
    if (race.candidates.length === 1) base[partyGroup(race.candidates[0].party)]++;
    else simulated.push({ parties, runs: projection.contests[race.id].runs });
  }
  return Array.from({ length: projection.parameters.runs }, (_, run) => {
    const seats = { ...base };
    for (const { parties, runs } of simulated) seats[parties[runs[run].winner] ?? "tied"]++;
    return seats;
  });
}

// Each seat split the simulations reached, most common first. A split is one simulation's seats for every party at once, so it
// shows how the parties' counts go together, which each party's own spread can't.
export function rankedOutcomes(perRun) {
  const outcomes = new Map();
  for (const seats of perRun) {
    const key = [seats.republican, seats.democrat, seats.other, seats.tied].join();
    if (!outcomes.has(key)) outcomes.set(key, { seats, count: 0 });
    outcomes.get(key).count++;
  }
  return [...outcomes.values()].sort((a, b) => b.count - a.count);
}

// Which house districts each State Senate seat covers: A is House Districts 1 and 2, B is 3 and 4, and so on.
export const senateDistricts = (letter) => {
  const n = letter.charCodeAt(0) - "A".charCodeAt(0);
  return [2 * n + 1, 2 * n + 2];
};

export const senateSeatOf = (hd) => String.fromCharCode("A".charCodeAt(0) + Math.floor((hd - 1) / 2));
