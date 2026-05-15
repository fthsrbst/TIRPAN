"""
TIRPAN ML — Model Evaluation
==============================
Load saved models and evaluate them on a test set.

Usage:
    python ml/evaluate.py                  # evaluate all loaded models
    python ml/evaluate.py --finding-only   # only finding classifier
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s")
logger = logging.getLogger("ml.evaluate")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def evaluate_finding_classifier() -> dict:
    from ml.finding_classifier import FindingClassifierML, MODEL_PATH
    if not MODEL_PATH.exists():
        return {"status": "not_trained"}
    clf = FindingClassifierML.load(MODEL_PATH)
    # Quick smoke test on a few synthetic examples
    tests = [
        {"title": "vsftpd 2.3.4 Backdoor", "cvss_score": 10.0, "exploit_type": "remote", "platform": "unix"},
        {"title": "SQL Injection in login form", "cvss_score": 8.5, "exploit_type": "webapps", "platform": "php"},
        {"title": "OpenSSH Authentication Bypass", "cvss_score": 7.2, "exploit_type": "remote", "platform": "linux"},
        {"title": "Local privilege escalation via setuid binary", "cvss_score": 6.0, "exploit_type": "local", "platform": "linux"},
        {"title": "Information disclosure in HTTP headers", "cvss_score": 2.5, "exploit_type": "", "platform": ""},
    ]
    results = []
    for t in tests:
        pred = clf.predict_finding(t)
        results.append({
            "input": t["title"],
            "risk_level": pred["risk_level"],
            "attack_phase": pred["attack_phase"],
            "asset_category": pred["asset_category"],
            "mitre_ttps": pred["mitre_ttps"],
            "confidence": pred.get("confidence", 0),
        })
    return {"status": "ok", "smoke_tests": results}


def evaluate_exploit_predictor() -> dict:
    from ml.exploit_predictor import ExploitPredictorML, MODEL_PATH
    if not MODEL_PATH.exists():
        return {"status": "not_trained"}
    pred = ExploitPredictorML.load(MODEL_PATH)
    tests = [
        ("vsftpd 2.3.4 backdoor command execution", "remote", "unix", 10.0),
        ("Local privilege escalation kernel exploit", "local", "linux", 6.5),
        ("Cross-site scripting XSS", "webapps", "php", 4.0),
        ("Denial of service crash", "dos", "windows", 5.0),
    ]
    results = []
    for desc, etype, platform, cvss in tests:
        prob = pred.predict_proba(desc, etype, platform, cvss)
        results.append({"exploit": desc, "prob": prob})
    return {"status": "ok", "smoke_tests": results}


def evaluate_attack_path() -> dict:
    from ml.attack_path import AttackPathSuggester, MODEL_PATH
    if not MODEL_PATH.exists():
        return {"status": "not_trained"}
    sug = AttackPathSuggester.load(MODEL_PATH)
    tests = [
        {"phase": "scanning",    "services": ["ftp", "ssh", "smb"]},
        {"phase": "exploitation","services": ["http", "apache"]},
        {"phase": "post_exploitation", "services": ["ssh", "linux"]},
    ]
    results = []
    for t in tests:
        suggestions = sug.suggest(t["phase"], t["services"], top_n=4)
        results.append({
            "phase": t["phase"],
            "suggestions": [s.to_dict() for s in suggestions],
        })
    return {"status": "ok", "smoke_tests": results}


def main():
    logger.info("TIRPAN ML — Evaluation Report")
    logger.info("=" * 60)

    report = {}

    logger.info("Evaluating Finding Classifier…")
    report["finding_classifier"] = evaluate_finding_classifier()
    _print_section("Finding Classifier", report["finding_classifier"])

    logger.info("Evaluating Exploit Predictor…")
    report["exploit_predictor"] = evaluate_exploit_predictor()
    _print_section("Exploit Predictor", report["exploit_predictor"])

    logger.info("Evaluating Attack Path Suggester…")
    report["attack_path"] = evaluate_attack_path()
    _print_section("Attack Path Suggester", report["attack_path"])

    out = Path("ml/models/eval_report.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as fh:
        json.dump(report, fh, indent=2, default=str)
    logger.info("Report saved → %s", out)


def _print_section(name: str, result: dict) -> None:
    status = result.get("status", "unknown")
    logger.info("  %s: %s", name, status)
    for t in result.get("smoke_tests", []):
        logger.info("    %s", t)
    logger.info("")


if __name__ == "__main__":
    main()
