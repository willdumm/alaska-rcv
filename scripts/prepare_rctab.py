#!/usr/bin/env python3
"""Prepare a Dominion CVR for RCTab, one small directory per contest, because RCTab reads the whole CVR for each contest.

Usage: prepare_rctab.py CVR_DIR WORK_DIR ELECTION_DATE   (run with `python3 -I`; the CVR is untrusted input)

WORK_DIR/contest-<id>/ gets the manifests RCTab's reader needs, a CvrExport_1.json holding only the sessions with that
contest and only that contest's entry on each, and a config.json. The rules are RCTab's own 2024 Alaska test config, except:
- continueUntilTwoCandidatesRemain, so every round compares with `tabulate(..., { ignoreMajority: true })`.
- The write-in is an excluded candidate, so it's passed over as in rcv-tabulate.js.
- Ties use the candidates' order, which is the ballot order `tabulate` uses as its placeholder.
Single-candidate contests have no rounds, so they're skipped. compare_rctab.mjs has the rest of the method.
"""
import collections
import glob
import json
import os
import shutil
import sys

MANIFESTS = ("Contest", "Candidate", "Precinct", "PrecinctPortion")


def rules(num_ranks):
    return {
        "tiebreakMode": "useCandidateOrder", "overvoteRule": "exhaustImmediately",
        "winnerElectionMode": "singleWinnerMajority", "randomSeed": "", "numberOfWinners": "1",
        "multiSeatBottomsUpPercentageThreshold": "", "decimalPlacesForVoteArithmetic": "4",
        "minimumVoteThreshold": "", "maxSkippedRanksAllowed": "1", "maxRankingsAllowed": str(num_ranks),
        "nonIntegerWinningThreshold": False, "doesFirstRoundDetermineThreshold": False, "hareQuota": False,
        "batchElimination": False, "continueUntilTwoCandidatesRemain": True, "stopTabulationEarlyAfterRound": "",
        "exhaustOnDuplicateCandidate": False, "rulesDescription": "", "treatBlankAsUndeclaredWriteIn": False,
    }


def config(contest, candidates, date):
    return {
        "tabulatorVersion": "2.1.0",
        "outputSettings": {"contestName": contest["Description"], "outputDirectory": "output", "contestDate": date,
                           "contestJurisdiction": "Alaska", "contestOffice": contest["Description"],
                           "tabulateByBatch": False, "tabulateByPrecinct": False, "generateCdfJson": False},
        "cvrFileSources": [{"filePath": ".", "contestId": str(contest["Id"]), "firstVoteColumnIndex": "",
                            "firstVoteRowIndex": "", "idColumnIndex": "", "batchColumnIndex": "", "precinctColumnIndex": "",
                            "overvoteDelimiter": "", "provider": "dominion", "overvoteLabel": "", "skippedRankLabel": "",
                            "undeclaredWriteInLabel": "", "treatBlankAsUndeclaredWriteIn": False}],
        "candidates": [{"name": c["Description"], "excluded": c["Type"] == "WriteIn", "aliases": [str(c["Id"])]}
                       for c in candidates],
        "rules": rules(contest["NumOfRanks"]),
    }


def only_contest(record, contest_id):
    """The record cut down to one contest, or None if it doesn't have that contest."""
    cards = []
    for card in record.get("Cards") or [record]:
        kept = [c for c in card["Contests"] if c["Id"] == contest_id]
        if kept:
            cards.append({**card, "Contests": kept})
    return {**record, "Cards": cards} if cards else None


def main(cvr_dir, work_dir, date):
    manifest = lambda name: json.load(open(os.path.join(cvr_dir, f"{name}Manifest.json"), encoding="utf-8"))["List"]
    candidates = collections.defaultdict(list)
    for candidate in manifest("Candidate"):
        candidates[candidate["ContestId"]].append(candidate)
    contests = {}
    for contest in manifest("Contest"):
        running = [c for c in candidates[contest["Id"]] if c["Type"] != "WriteIn"]
        if contest["NumOfRanks"] > 0 and len(running) >= 2:
            contests[contest["Id"]] = contest

    sessions = collections.defaultdict(list)
    for path in sorted(glob.glob(os.path.join(cvr_dir, "CvrExport*.json"))):
        with open(path, encoding="utf-8") as f:
            for session in json.load(f)["Sessions"]:
                original = session["Original"]
                seen = set()
                for card in original.get("Cards") or [original]:
                    seen.update(c["Id"] for c in card["Contests"])
                modified = session.get("Modified")
                if modified:
                    for card in modified.get("Cards") or [modified]:
                        seen.update(c["Id"] for c in card["Contests"])
                for contest_id in seen & contests.keys():
                    cut = {**session, "Original": only_contest(original, contest_id) or {**original, "Cards": []}}
                    if modified:
                        cut["Modified"] = only_contest(modified, contest_id) or {**modified, "Cards": []}
                    sessions[contest_id].append(cut)

    for contest_id, contest in contests.items():
        out = os.path.join(work_dir, f"contest-{contest_id}")
        os.makedirs(out, exist_ok=True)
        for name in MANIFESTS:
            shutil.copy(os.path.join(cvr_dir, f"{name}Manifest.json"), out)
        with open(os.path.join(out, "CvrExport_1.json"), "w", encoding="utf-8") as f:
            json.dump({"Version": "5.17.18.1", "Sessions": sessions[contest_id]}, f, separators=(",", ":"))
        with open(os.path.join(out, "config.json"), "w", encoding="utf-8") as f:
            json.dump(config(contest, candidates[contest_id], date), f, indent=2)
    print(f"{len(contests)} contests prepared in {work_dir}")


if __name__ == "__main__":
    main(*sys.argv[1:])
