// Alaska's ranked-choice tabulation (AS 15.15.350, 6 AAC 25.071, and the tabulation options printed
// on the Division of Elections' RCV reports). The page and scripts/validate_2024.mjs
// share this file. A ballot is a ranking string: a letter per candidate, W for a write-in, - for a
// blank rank, * for an overvoted rank.

export const INACTIVE = { BLANK: "blanks", EXHAUSTED: "exhausted", OVERVOTE: "overvotes" };

// What a ranking counts for while `continuing` candidates remain: a letter, or a reason it's inactive.
// A write-in rank is passed over, but it isn't a skipped rank. An overvote stops the ballot, even if
// every candidate in it has been eliminated. Two blank ranks in a row stop it too, and a rank repeating
// a candidate already ranked counts as blank. The Division doesn't publish that last rule; it's what
// reproduces its certified 2024 reports exactly (see docs/RULES.md).
export function readBallot(pattern, continuing) {
  let skipped = 0;
  const ranked = new Set();
  for (const char of pattern) {
    if (char === "-" || ranked.has(char)) {
      if (++skipped === 2) return INACTIVE.EXHAUSTED;
      continue;
    }
    skipped = 0;
    if (char !== "W") ranked.add(char);
    if (char === "*") return INACTIVE.OVERVOTE;
    if (continuing.has(char)) return char;
  }
  return INACTIVE.EXHAUSTED;
}

function emptyTally(letters) {
  return Object.fromEntries(letters.map((l) => [l, 0]));
}

// Aggregate counts per unique ranking into rounds. `ballots` is [[pattern, count], ...]. `letters`
// are the candidates on the ballot, in ballot order; `removed` lists ones to treat as not running.
// `ignoreMajority` keeps counting past a first-round majority, which Alaska's count wouldn't: the page
// offers that for when the CVR's majority might not survive the ballots it leaves out.
export function tabulate(ballots, letters, removed = [], { ignoreMajority = false } = {}) {
  const continuing = new Set(letters.filter((l) => !removed.includes(l)));
  let piles = new Map([...continuing].map((l) => [l, []]));
  const nonTransferable = { blanks: 0, exhausted: 0, overvotes: 0 };

  // Round 1: a ballot that never counted for anyone is a blank, unless an overvote stopped it.
  for (const ballot of ballots) {
    const read = readBallot(ballot[0], continuing);
    if (continuing.has(read)) piles.get(read).push(ballot);
    else nonTransferable[read === INACTIVE.OVERVOTE ? "overvotes" : "blanks"] += ballot[1];
  }

  const rounds = [];
  let majorityInRoundOne = false;
  const total = (pile) => pile.reduce((sum, b) => sum + b[1], 0);
  for (;;) {
    const votes = emptyTally(letters);
    for (const [letter, pile] of piles) votes[letter] = total(pile);
    const active = Object.values(votes).reduce((a, b) => a + b, 0);
    const round = { votes, active, ...nonTransferable };
    rounds.push(round);

    const standing = [...continuing].sort((a, b) => votes[a] - votes[b]);
    const leader = standing[standing.length - 1];
    if (rounds.length === 1) majorityInRoundOne = votes[leader] * 2 > active;
    // Tabulation stops when two candidates remain, or at a first-round majority.
    if (continuing.size <= 2 || (rounds.length === 1 && majorityInRoundOne && !ignoreMajority)) {
      const runnerUp = standing[standing.length - 2];
      const tied = runnerUp !== undefined && votes[runnerUp] === votes[leader];
      return { rounds, leader: tied ? null : leader, runnerUp: runnerUp ?? null,
               majorityInRoundOne, tiedFinal: tied };
    }

    // Single elimination: the fewest votes. A tie is decided by lot, which only the Division can
    // do, so it's flagged here and the later candidate on the ballot goes first as a placeholder.
    const fewest = votes[standing[0]];
    const tiedLast = standing.filter((l) => votes[l] === fewest);
    const eliminated = tiedLast[tiedLast.length - 1];
    continuing.delete(eliminated);
    const transfers = { ...emptyTally([...continuing]), exhausted: 0, overvotes: 0 };
    for (const ballot of piles.get(eliminated)) {
      const read = readBallot(ballot[0], continuing);
      transfers[read] += ballot[1];
      if (continuing.has(read)) piles.get(read).push(ballot);
      else nonTransferable[read] += ballot[1];
    }
    piles.delete(eliminated);
    round.eliminated = eliminated;
    round.tieForLast = tiedLast.length > 1 ? tiedLast : null;
    round.transfers = transfers;
  }
}
