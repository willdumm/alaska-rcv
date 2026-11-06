// The names of the house districts, from the Division's form H07.
// Usage: node build_district_names.mjs H07_PDF OUT_JSON
// Needs pdftotext. Each row of the form has a senate seat and its two house districts, and a long name wraps onto the next
// line of its own column.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const [pdf, out] = process.argv.slice(2);
const text = execFileSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8" });
const revision = text.match(/H07 \(REV (\d\d\/\d\d\/\d{4})\)/)?.[1];
if (!revision) throw new Error("no H07 revision found: is this the form?");

const lines = text.split("\n");
const heading = lines.findIndex((line) => /HOUSE DISTRICT\s+HOUSE DISTRICT/.test(line));
if (heading < 0) throw new Error("no column headings found");
const rows = lines.slice(heading + 1).filter((line) => !line.includes("H07 (REV"));

// The second column's numbers start a few characters before its heading does.
const SEAT_END = 8;
const secondColumn = lines[heading].lastIndexOf("HOUSE DISTRICT") - 6;
const names = {};
for (const [from, to] of [[SEAT_END, secondColumn], [secondColumn, undefined]]) {
  let open = null;
  for (const row of rows) {
    const part = row.slice(from, to).trim();
    if (!part) continue;
    const start = part.match(/^(\d+)\s+(.*)$/);
    if (start) {
      open = Number(start[1]);
      names[open] = start[2];
      const seat = row.slice(0, SEAT_END).trim();
      if (seat && seat !== String.fromCharCode(65 + Math.floor((open - 1) / 2))) throw new Error(`district ${open} is beside seat ${seat}: did the columns move?`);
    } else if (open) {
      names[open] += names[open].endsWith("/") ? part : ` ${part}`;
    }
  }
}

const numbers = Object.keys(names).map(Number);
if (numbers.length !== 40 || numbers.some((hd) => hd < 1 || hd > 40)) throw new Error(`districts ${numbers}, not 1 to 40`);

writeFileSync(out, `${JSON.stringify({ source: `Division of Elections form H07, rev. ${revision}`, names }, null, 1)}\n`);
