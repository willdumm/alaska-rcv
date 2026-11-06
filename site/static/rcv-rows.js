// A contest's "rows" array repeats ranking index, house district, counting group, count. The page and
// the scripts share this file, so only it knows that layout. The counting group IDs are checked against the Division's
// manifest by extract_cvr.py.
export const GROUP = { ELECTION_DAY: 1, ABSENTEE: 2, EARLY: 3, QUESTIONED: 4 };

export function* eachRow(c) {
  const { rows } = c;
  for (let i = 0; i < rows.length; i += 4) {
    yield { pattern: rows[i], hd: rows[i + 1], group: rows[i + 2], count: rows[i + 3] };
  }
}

// [[ranking, count], ...] for the ballots in a contest, or in one district, merged by ranking.
export function ballotCounts(c, hd = "all") {
  const counts = new Map();
  for (const row of eachRow(c)) {
    if (hd === "all" || row.hd === hd) counts.set(row.pattern, (counts.get(row.pattern) || 0) + row.count);
  }
  return [...counts].map(([pattern, count]) => [c.patterns[pattern], count]);
}
