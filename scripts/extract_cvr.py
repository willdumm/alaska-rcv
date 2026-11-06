#!/usr/bin/env python3
"""Turn an Alaska Division of Elections cast vote record into the dashboard's compact JSON.

Usage: extract_cvr.py CVR_DIR OUT_DIR   (run with `python3 -I`; the CVR is untrusted input)

Each RCV contest becomes contest-<id>.json: its candidates, and its ballots grouped by identical
ranking, house district and counting group. A ranking is one character per rank: A, B, ... for a candidate, W for a write-in, - for a blank rank, * for an overvoted rank.
Tabulating is left to rcv-tabulate.js, so the page and the 2024 validation share one tabulator.
"""
import collections
import glob
import json
import os
import re
import string
import sys

import ijson

MEASURE_PATTERN = re.compile(r"^BM#(\d+)")
STATEWIDE = ("U.S. Senator", "U.S. Representative", "Governor / Lieutenant Governor")
# rcv-rows.js, build_coverage.py and the 2024 scripts rely on these counting group IDs.
GROUPS = {1: "Election Day", 2: "Absentee", 3: "Early Voting", 4: "Question", 5: "Remote"}
# Candidate letters; W is reserved for write-ins.
LETTERS = [c for c in string.ascii_uppercase if c != "W"]


def manifest(cvr_dir, name):
    with open(os.path.join(cvr_dir, f"{name}Manifest.json"), encoding="utf-8") as f:
        return json.load(f)["List"]


def outstack_id(cvr_dir, description):
    return next(c["Id"] for c in manifest(cvr_dir, "OutstackCondition") if c["Description"] == description)


def check_groups(cvr_dir):
    found = {g["Id"]: g["Description"] for g in manifest(cvr_dir, "CountingGroup")}
    if found != GROUPS:
        raise SystemExit(f"Counting groups changed: expected {GROUPS}, found {found}")
    return found


def house_district(portion):
    """A real precinct's ID starts with its district. The Division's absentee, early voting and
    question groups mostly have no usable ID, only a name like "District 12 - Early Voting"."""
    match = re.match(r"(\d+)-\d{3}$", portion["ExternalId"] or "") or re.search(r"District (\d+)", portion["Description"])
    return int(match.group(1)) if match else 0


def ballot_records(cvr_dir):
    for path in sorted(glob.glob(os.path.join(cvr_dir, "CvrExport*.json"))):
        with open(path, "rb") as f:
            for session in ijson.items(f, "Sessions.item", use_float=True):
                # As in RCTab's reader: an adjudicated ballot's Original isn't current, and its Modified supersedes it.
                # Neither the 2024 nor the 2026 CVR has one yet, so a ballot with neither stops the run to be looked at.
                record = session["Original"] if session["Original"]["IsCurrent"] else session.get("Modified")
                if record is None:
                    raise SystemExit(f"{path}: a session has no current record")
                yield session, record


def ranking(contest, letter_of, num_ranks):
    """The ranking string for one contest on one ballot, without trailing blanks."""
    at_rank = collections.defaultdict(list)
    for mark in contest["Marks"]:
        # An ambiguous mark isn't a vote, and doesn't make its rank an overvote.
        if mark["IsVote"]:
            at_rank[mark["Rank"]].append(mark["CandidateId"])
    chars = []
    for rank in range(1, num_ranks + 1):
        marked = at_rank.get(rank, [])
        chars.append("-" if not marked else "*" if len(marked) > 1 else letter_of[marked[0]])
    return "".join(chars).rstrip("-")


def main(cvr_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    groups_manifest = check_groups(cvr_dir)
    overvote, invalid_contest = outstack_id(cvr_dir, "Overvote"), outstack_id(cvr_dir, "InvalidContest")
    contests = {c["Id"]: c for c in manifest(cvr_dir, "Contest")}
    rcv_ids = {i for i, c in contests.items() if c["NumOfRanks"] > 0}
    measures = {i: MEASURE_PATTERN.match(c["Description"]).group(1)
                for i, c in contests.items() if MEASURE_PATTERN.match(c["Description"])}
    bm2_id = next((i for i, n in measures.items() if n == "2"), None)
    bm3_id = next((i for i, n in measures.items() if n == "3"), None)
    parties = {p["Id"]: p["Description"] for p in manifest(cvr_dir, "Party")}
    districts = {p["Id"]: house_district(p) for p in manifest(cvr_dir, "PrecinctPortion")}

    letters, candidates = {}, collections.defaultdict(list)
    for cand in manifest(cvr_dir, "Candidate"):
        cid = cand["ContestId"]
        if cid not in rcv_ids:
            continue
        if cand["Type"] == "WriteIn":
            letters[cand["Id"]] = "W"
            continue
        letter = LETTERS[len(candidates[cid])]
        letters[cand["Id"]] = letter
        candidates[cid].append({"letter": letter, "name": cand["Description"],
                                "parties": [parties[a] for a in cand["Affiliations"]]})

    measure_letters = {}
    for cand in manifest(cvr_dir, "Candidate"):
        if cand["ContestId"] in measures:
            measure_letters[cand["Id"]] = cand["Description"][0]  # Y or N

    def measure_vote(contest):
        # A measure overvote has no IsVote marks, only marks flagged as an overvote.
        if overvote in contest["OutstackConditionIds"]:
            return "*"
        votes = [m for m in contest["Marks"] if m["IsVote"]]
        return measure_letters[votes[0]["CandidateId"]] if votes else ""

    statewide_ids = [i for name in STATEWIDE for i, c in contests.items() if c["Description"] == name]

    tallies = {i: collections.Counter() for i in rcv_ids}
    measure_rows = collections.Counter()
    groups, per_district = collections.Counter(), collections.Counter()
    for session, record in ballot_records(cvr_dir):
        group, hd = session["CountingGroupId"], districts.get(record["PrecinctPortionId"], 0)
        groups[group] += 1
        per_district[hd] += 1
        patterns, votes = {}, {}
        for card in record.get("Cards") or [record]:
            for contest in card["Contests"]:
                cid = contest["Id"]
                # Questioned and absentee ballots can be invalid for a contest (the voter wasn't
                # eligible for it). They stay in the CVR, but the Division doesn't tabulate them.
                if invalid_contest in contest["OutstackConditionIds"]:
                    continue
                if cid in rcv_ids:
                    patterns[cid] = ranking(contest, letters, contests[cid]["NumOfRanks"])
                elif cid in measures:
                    votes[cid] = measure_vote(contest)
        for cid, pattern in patterns.items():
            tallies[cid][(pattern, hd, group)] += 1
        measure_rows[(hd, group, votes.get(bm2_id, ""), votes.get(bm3_id, ""))] += 1

    index = []
    for cid in sorted(rcv_ids):
        strings = sorted({key[0] for key in tallies[cid]})
        position = {s: i for i, s in enumerate(strings)}
        rows = []
        for (pattern, hd, group), count in sorted(tallies[cid].items()):
            rows += [position[pattern], hd, group, count]
        contest = {"id": cid, "name": contests[cid]["Description"], "numRanks": contests[cid]["NumOfRanks"],
                   "candidates": candidates[cid], "patterns": strings, "rows": rows}
        with open(os.path.join(out_dir, f"contest-{cid}.json"), "w", encoding="utf-8") as f:
            json.dump(contest, f, separators=(",", ":"))
        index.append({"id": cid, "name": contest["name"]})

    with open(os.path.join(out_dir, "ballots.json"), "w", encoding="utf-8") as f:
        json.dump({
            "contests": index,
            "statewide": statewide_ids,
            "measureIds": {"2": bm2_id, "3": bm3_id},
            "groups": groups_manifest,
            "ballotsByGroup": dict(sorted(groups.items())),
            "ballotsByDistrict": dict(sorted(per_district.items())),
            # house district, counting group, BM2, BM3, count.
            "measures": [list(key) + [count] for key, count in sorted(measure_rows.items())],
        }, f, separators=(",", ":"))


if __name__ == "__main__":
    main(*sys.argv[1:])
