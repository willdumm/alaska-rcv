// Reads the Division's "ballots received" page, as saved, into received.json's fields. Usage: node received_from_table.mjs PAGE.html
// The page is untrusted input, so it's only ever matched with these patterns. build_coverage.py reads the questioned row itself.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const number = (text) => Number(text.replaceAll(",", ""));

export function readReceived(html) {
  const stamp = html.match(/Table last updated (\w{3})\w* (\d+), (\d{4}) at (\d+:\d\d) ([ap]m)\./);
  const total = html.match(/Total Ballots Received: <em>([\d,]+)<\/em>/);
  const rows = [...html.matchAll(/<tr><td[^>]*>[^<]*<\/td><td[^>]*>([\d,]+)<\/td><td[^>]*>([\d,]+)<\/td><\/tr>/g)];
  if (!stamp || !total || !rows.length) throw new Error("no table date, total or rows on this page");
  const received = number(total[1]);
  const inRows = rows.reduce((sum, row) => sum + number(row[2]), 0);
  if (inRows !== received) throw new Error(`the table's rows add up to ${inRows}, and its total is ${received}`);
  const [, month, day, year, time, half] = stamp;
  return {
    asOf: `${month} ${day}, ${year}, ${time} ${half.toUpperCase()}`,
    received,
    issued: rows.reduce((sum, row) => sum + number(row[1]), 0),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(readReceived(readFileSync(process.argv[2], "utf8"))));
}
