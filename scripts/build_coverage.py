#!/usr/bin/env python3
"""Turn the Division of Elections' election summary into the dashboard's coverage.json.

Usage: build_coverage.py SUMMARY.txt SUMMARY.csv BALLOTS_JSON RECEIVED_JSON RECEIVED_TABLE CVR_LAST_MODIFIED FETCHED OUT.json
(run with `python3 -I`; the reports are untrusted input)

SUMMARY.txt is the summary PDF as `pdftotext -layout` text, which has the report's time and the
write-in totals. SUMMARY.csv is the per-precinct summary. BALLOTS_JSON is extract_cvr.py's
ballots.json. RECEIVED_JSON holds the "ballots received" table from the results page, by hand:
{"asOf": "...", "received": n, "issued": n}. RECEIVED_TABLE is that page as saved, which gives the
questioned row, and has to agree with RECEIVED_JSON's total. Only a snapshot with no saved table
sets "questioned" and "questionedNote" in RECEIVED_JSON instead. CVR_LAST_MODIFIED is the CVR file's
Last-Modified header, FETCHED the time we downloaded it, both as ISO 8601.
"""
import collections
import csv
import json
import re
import sys

METHODS = {"ed": "Election Day", "ab": "Absentee", "ev": "Early Voting", "q": "Question", "rm": "Remote"}
GROUP_IDS = {"ed": "1", "ab": "2", "ev": "3", "q": "4", "rm": "5"}
PRECINCT = re.compile(r"(\d\d)-\d\d\d ")
GROUPED = re.compile(r"District (\d+)")


def number(text):
    return int(text.replace(",", ""))


def district_of(precinct_name):
    match = PRECINCT.match(precinct_name) or GROUPED.search(precinct_name)
    if match:
        return int(match.group(1))
    return 99 if precinct_name.startswith("HD99") else 0


def parse_report(path):
    with open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    text = "\n".join(lines)
    stamp = re.search(r"Page: 1 of \d+\s+(\S+ \S+ [AP]M)", text).group(1)
    reported = re.search(r"Precincts Reported: ([\d,]+) of ([\d,]+) \(([\d.]+)%\)", text)
    cast = re.search(r"Voters Cast: ([\d,]+) of ([\d,]+) \(([\d.]+)%\)", text)
    report = {
        "stamp": stamp, "status": "UNOFFICIAL RESULTS" if "UNOFFICIAL RESULTS" in text else "",
        "precinctsReported": number(reported.group(1)), "precinctsTotal": number(reported.group(2)),
        "precinctsPercent": float(reported.group(3)),
        "votersCast": number(cast.group(1)), "registered": number(cast.group(2)), "turnoutPercent": float(cast.group(3)),
    }

    # A contest's block: its title, its precincts line, Times Cast, and a write-in row. Candidates' votes come from the CSV.
    contests, title, current = {}, None, None
    for i, line in enumerate(lines):
        if line.startswith("Precincts Reported:") and i > 0 and lines[i - 1].strip() and not lines[i - 1].startswith("UNOFF"):
            match = re.match(r"Precincts Reported: ([\d,]+) of ([\d,]+)", line)
            title = lines[i - 1].strip()
            current = {"precinctsReported": number(match.group(1)), "precinctsTotal": number(match.group(2)),
                       "timesCast": 0, "writeIn": 0}
            contests[title] = current
        elif current is None:
            continue
        elif (match := re.match(r"Times Cast\s+([\d,]+) /", line)):
            current["timesCast"] = number(match.group(1))
        elif line.startswith("Total Votes"):
            current = None
        elif (match := re.match(r"Write-in\s+([\d,]+)", line)):
            current["writeIn"] = number(match.group(1))
    return report, contests


def short_place(precinct_name):
    name = re.sub(r"^\d\d-\d\d\d ", "", precinct_name)
    return re.sub(r"\s+(No\.?\s*|#)\d+$", "", name)


def parse_precincts(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    # Ballots by precinct, from one contest every voter has. The summary repeats them per candidate.
    ballots = {}
    for row in rows:
        if row["Contest_title"] == "U.S. Senator":
            ballots[row["Precinct_name"]] = row

    districts = collections.defaultdict(lambda: {"registered": 0, "summary": collections.Counter(), "zero": [], "places": {}})
    for name, row in ballots.items():
        district = districts[district_of(name)]
        district["registered"] += int(row["Reg_voters"] or 0)
        for key, label in METHODS.items():
            district["summary"][key] += int(row[f"{label}_ballots"] or 0)
        if PRECINCT.match(name):
            if int(row["total_ballots"] or 0) == 0:
                district["zero"].append(name)
            place = short_place(name)
            district["places"][place] = district["places"].get(place, 0) + int(row["Reg_voters"] or 0)

    # First choices per contest and district, for the comparison with the CVR's round 1.
    votes = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
    for row in rows:
        votes[row["Contest_title"]][row["candidate_name"]][district_of(row["Precinct_name"])] += int(row["total_votes"] or 0)
    return districts, votes


def questioned_received(table_path, total):
    with open(table_path, encoding="utf-8") as f:
        text = f.read()
    stated = re.search(r"Total Ballots Received: <em>([\d,]+)</em>", text)
    row = re.search(r">Questioned</td><td[^>]*>[\d,]+</td><td[^>]*>([\d,]+)</td>", text)
    if not stated or not row:
        raise ValueError(f"{table_path}: no total or questioned row")
    if number(stated.group(1)) != total:
        raise ValueError(f"{table_path}: total received is {stated.group(1)}, and received.json has {total}")
    return number(row.group(1))


def main(report_path, csv_path, ballots_path, received_path, table_path, cvr_modified, fetched, out_path):
    report, contests = parse_report(report_path)
    districts, votes = parse_precincts(csv_path)
    with open(ballots_path, encoding="utf-8") as f:
        cvr = json.load(f)
    with open(received_path, encoding="utf-8") as f:
        received = json.load(f)
    if "questioned" not in received:
        received["questioned"] = questioned_received(table_path, received["received"])

    # Every CVR ballot has one row in "measures": district, counting group, BM2, BM3, count.
    by_district = collections.defaultdict(collections.Counter)
    for hd, group, _, _, count in cvr["measures"]:
        by_district[hd][str(group)] += count

    out_districts = {}
    for hd, data in sorted(districts.items()):
        groups = by_district[hd]
        places = sorted(data["places"], key=lambda p: -data["places"][p])[:3]
        out_districts[hd] = {
            "registered": data["registered"],
            "summary": {k: data["summary"][k] for k in METHODS if data["summary"][k]},
            "cvr": {k: groups.get(GROUP_IDS[k], 0) for k in METHODS if groups.get(GROUP_IDS[k], 0)},
            "precinctsWithNoBallots": [short_place(n) for n in data["zero"]],
            "places": places,
        }

    out_contests = {}
    for title, contest in contests.items():
        by_candidate = {name: dict(counts) for name, counts in votes.get(title, {}).items()}
        out_contests[title] = {**contest, "byDistrict": by_candidate}

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "report": report, "cvrLastModified": cvr_modified, "fetched": fetched, "received": received,
            "cvrBallotsByGroup": cvr["ballotsByGroup"], "districts": out_districts, "contests": out_contests,
        }, f, separators=(",", ":"))


if __name__ == "__main__":
    main(*sys.argv[1:])
