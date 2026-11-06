// Ballot measures aren't ranked: each is counted as a two-way contest, from ballots.json's "measures"
// rows (district, group, BM2 vote, BM3 vote, count). summaryName is the title on the Division's reports.
// The page and scripts/simulate_projection.mjs share this file.
const MEASURES = [
  { number: 2, name: "Ballot Measure 2: repeal open primaries and ranked choice", summaryName: "BM#2 24ESEG", column: 2, about: "A yes vote repeals the open primary and ranked-choice general election." },
  { number: 3, name: "Ballot Measure 3: voter qualification", summaryName: "BM#3 25USCV", column: 3, about: "Official title: An Act Addressing Voter Qualification." },
];

// The measures with their contest IDs in this CVR, which extract_cvr.py finds from the manifest.
export const measuresIn = (index) => MEASURES.map((m) => ({ ...m, id: index.measureIds[m.number] }));

export function measureContest(measure, measureRows) {
  const patterns = ["Y", "N", "", "*"];
  return {
    ...measure, measure: true, patterns,
    candidates: [{ letter: "Y", name: "Yes", summaryName: "YES" }, { letter: "N", name: "No", summaryName: "NO" }],
    rows: measureRows.flatMap((row) => [patterns.indexOf(row[measure.column]), row[0], row[1], row[4]]),
  };
}
