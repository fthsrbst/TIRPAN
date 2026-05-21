"""
TIRPAN ML — Smoke Tests
========================
Sanity-check the three trained models against realistic pentest inputs.

Usage:
    python -m ml.smoke_test
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Any

logging.basicConfig(level=logging.WARNING, format="%(message)s")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


# Each tuple: (description, expected_range_lo, expected_range_hi, exploit_type, platform, cvss)
#
# Aralık seçim mantığı:
#   - Trophy keywords (vsftpd_234, ms17_010, eternalblue, usermap, distcc, ingreslock,
#     drupalgeddon2) → tier-1 floor 0.78 → 0.70-0.95
#   - Tier-2 keywords (log4shell, struts2, jboss, deserializ, tomcat, pwnkit,
#     dirtypipe, zerologon, drupalgeddon3 …) → floor 0.62 → 0.55-0.90
#   - Düz açıklamalar (module path yok, real-world signal yok): model TF-IDF + cat/num
#     üzerinden çalışır; kalibrasyondan sonra çoğu PoC için <0.30 çıkar. Bu doğru.
#   - DoS / handler / scanner → hard-cap 0.30
EXPLOIT_CASES = [
    # Trophy / tier-1
    ("vsftpd 2.3.4 backdoor command execution",       0.70, 0.95, "remote",  "unix",    10.0),
    ("MS17-010 EternalBlue SMB exploit",              0.70, 0.95, "remote",  "windows",  9.3),
    ("Samba usermap_script CVE-2007-2447",            0.55, 0.95, "remote",  "linux",    9.0),
    # Log4Shell tier-2'ye taşındı (gerçekte callback host gerekir)
    ("Log4Shell unauthenticated RCE Log4j",           0.55, 0.90, "remote",  "java",    10.0),
    # Tier-2 keyword'leri tetiklenen açıklamalar
    ("Apache Struts2 OGNL injection",                 0.40, 0.90, "remote",  "linux",    9.8),
    ("JBoss invoker JMX deserialization",             0.40, 0.90, "remote",  "linux",    9.0),
    ("Tomcat manager weak credentials login",         0.25, 0.85, "remote",  "linux",    7.5),
    # Düz PoC açıklamaları — model artık precision-odaklı, vanilla PoC için <0.30 normal
    ("SQL injection in login.php",                    0.00, 0.40, "webapps", "php",      8.0),
    ("WordPress plugin authenticated SQLi",           0.00, 0.40, "webapps", "php",      6.5),
    # Local privesc (key yok) — düz açıklama
    ("Local privilege escalation via setuid",         0.00, 0.30, "local",   "linux",    6.5),
    # Tier-2 "dirtypipe" tetikleniyor
    ("Kernel privesc CVE-2022-0847 dirty pipe",       0.40, 0.85, "local",   "linux",    7.8),
    # Düşük etkiler / DoS / info-disclos
    ("XSS in feedback form",                          0.00, 0.30, "webapps", "php",      4.3),
    ("DoS by malformed TCP packet",                   0.00, 0.30, "dos",     "windows",  5.0),
    ("Information disclosure in HTTP header",         0.00, 0.30, "remote",  "",         2.5),
    ("Outdated WordPress 5.0 installation",           0.00, 0.40, "webapps", "php",      6.0),
]


def test_exploit_predictor() -> dict:
    print("\n" + "=" * 78)
    print("EXPLOIT PREDICTOR — predicts P(success) for pentest exploits")
    print("=" * 78)
    from ml.exploit_predictor import ExploitPredictorML, MODEL_PATH
    if not MODEL_PATH.exists():
        print("  ! Model not trained")
        return {"status": "not_trained"}

    pred = ExploitPredictorML.load(MODEL_PATH)

    passed = failed = 0
    rows = []
    print(f"\n  {'Description':<48} {'Type':<8} {'CVSS':>5} {'Pred':>6}  {'Expected':<13}  Status")
    print("  " + "-" * 95)
    for desc, lo, hi, etype, plat, cvss in EXPLOIT_CASES:
        prob = pred.predict_proba(desc, etype, plat, cvss)
        ok = lo <= prob <= hi
        if ok:
            passed += 1
            mark = "OK"
        else:
            failed += 1
            mark = "FAIL"
        rows.append({"desc": desc, "type": etype, "cvss": cvss, "prob": prob, "ok": ok})
        print(f"  {desc[:47]:<48} {etype:<8} {cvss:>5} {prob:>6.3f}  [{lo:.2f}-{hi:.2f}]   {mark}")
    print()
    print(f"  Passed: {passed}/{passed+failed}")
    return {"passed": passed, "failed": failed, "rows": rows}


def test_finding_classifier() -> dict:
    print("\n" + "=" * 78)
    print("FINDING CLASSIFIER — labels findings with risk/phase/asset/TTPs")
    print("=" * 78)
    from ml.finding_classifier import FindingClassifierML, MODEL_PATH
    if not MODEL_PATH.exists():
        print("  ! Model not trained")
        return {"status": "not_trained"}

    clf = FindingClassifierML.load(MODEL_PATH)

    cases = [
        # (title, cvss, exploit_type, expected_risk, expected_phase_contains_one_of)
        {"title": "vsftpd 2.3.4 Backdoor remote command execution",
         "cvss_score": 10.0, "exploit_type": "remote", "platform": "unix",
         "expect_risk": "critical", "expect_phase": {"exploitation"}},
        {"title": "SQL Injection in admin login form bypass",
         "cvss_score": 8.5, "exploit_type": "webapps", "platform": "php",
         "expect_risk": "high", "expect_phase": {"exploitation"}},
        {"title": "OpenSSH 7.2 brute-force credential stuffing",
         "cvss_score": 5.0, "exploit_type": "remote", "platform": "linux",
         "expect_risk": "medium", "expect_phase": {"post_exploitation", "exploitation"}},
        {"title": "Local privilege escalation via setuid binary",
         "cvss_score": 7.8, "exploit_type": "local", "platform": "linux",
         "expect_risk": "high", "expect_phase": {"post_exploitation"}},
        {"title": "Information disclosure in HTTP server-info header",
         "cvss_score": 2.5, "exploit_type": "remote", "platform": "",
         "expect_risk": "low", "expect_phase": {"reconnaissance", "scanning"}},
        # Zero-CVSS pentest runtime event
        {"title": "exploit_success — Meterpreter shell opened on target",
         "cvss_score": 0.0, "exploit_type": "remote", "platform": "windows",
         "type": "exploit_success",
         "expect_risk": "critical", "expect_phase": {"exploitation", "post_exploitation"}},
        # Credential dump
        {"title": "Mimikatz LSASS credential dump",
         "cvss_score": 0.0, "exploit_type": "local", "platform": "windows",
         "type": "credential",
         "expect_risk": "critical", "expect_phase": {"post_exploitation"}},
    ]

    passed = failed = 0
    print(f"\n  {'Title':<50} {'Risk':<10} {'Phase':<20} {'TTPs':<22} {'OK'}")
    print("  " + "-" * 110)
    for c in cases:
        result = clf.predict_finding(c)
        risk_ok = result["risk_level"] == c["expect_risk"]
        phase_ok = result["attack_phase"] in c["expect_phase"]
        ok = risk_ok and phase_ok
        if ok:
            passed += 1
            mark = "OK"
        else:
            failed += 1
            mark = f"FAIL (risk={risk_ok} phase={phase_ok})"
        ttps = ",".join(result["mitre_ttps"][:3]) or "-"
        print(f"  {c['title'][:49]:<50} {result['risk_level']:<10} {result['attack_phase']:<20} {ttps:<22} {mark}")
    print()
    print(f"  Passed: {passed}/{passed+failed}")
    return {"passed": passed, "failed": failed}


def test_attack_path() -> dict:
    print("\n" + "=" * 78)
    print("ATTACK PATH SUGGESTER — recommends next MITRE TTPs to try")
    print("=" * 78)
    from ml.attack_path import AttackPathSuggester, MODEL_PATH
    if not MODEL_PATH.exists():
        print("  ! Model not trained")
        return {"status": "not_trained"}

    sug = AttackPathSuggester.load(MODEL_PATH)

    cases = [
        # (label, phase, services, host_count, has_shell, platforms, [forbidden_tactics])
        ("Fresh scan, 1 Linux host, FTP+SSH+HTTP",
         "scanning", ["ftp", "ssh", "http", "apache"], 1, False, ["linux"],
         {"lateral-movement", "persistence", "command-and-control", "exfiltration"}),
        ("Multi-host LAN, scanning phase",
         "scanning", ["ftp", "ssh", "smb", "rdp"], 5, False, ["linux", "windows"],
         {"lateral-movement", "persistence"}),
        ("Web vuln found, ready to exploit",
         "exploitation", ["http", "apache", "tomcat"], 3, False, ["linux"],
         {"lateral-movement"}),
        ("Database exposure, exploitation",
         "exploitation", ["mysql", "postgres", "mongodb"], 2, False, ["linux"],
         {"lateral-movement"}),
        ("Windows shell obtained, post-exploit",
         "post_exploitation", ["smb", "winrm", "ms-wbt-server"], 3, True, ["windows"],
         set()),
        ("Linux shell, time for lateral",
         "lateral_movement", ["ssh", "nfs"], 4, True, ["linux"],
         set()),
        ("Linux env: Windows TTPs must NOT appear",
         "post_exploitation", ["ssh", "apache"], 2, True, ["linux"],
         set()),
    ]

    passed = failed = 0
    for label, phase, svcs, hc, shell, plats, forbidden in cases:
        print(f"\n  --- {label} ---")
        print(f"      phase={phase} services={svcs} hosts={hc} shell={shell} platforms={plats}")
        results = sug.suggest(phase, svcs, [], top_n=6, host_count=hc, has_shell=shell, platforms=plats)
        issues = []
        for r in results:
            print(f"      {r.ttp_id:<12} {r.ttp_name[:42]:<42} {r.tactic:<22} conf={r.confidence}")
            if r.tactic in forbidden:
                issues.append(f"forbidden tactic: {r.tactic}")
            # Platform sanity: Linux env shouldn't have windows-only TTPs
            if "linux" in plats and "windows" not in plats:
                if r.ttp_id in {"T1021.001", "T1021.002", "T1003.001", "T1059.001", "T1547.001"}:
                    issues.append(f"windows-only TTP {r.ttp_id} in linux env")
        if not results:
            issues.append("no suggestions returned")
        if issues:
            failed += 1
            print(f"      ! FAIL: {'; '.join(issues)}")
        else:
            passed += 1
    print()
    print(f"  Passed: {passed}/{passed+failed}")
    return {"passed": passed, "failed": failed}


def main():
    results = {}
    try:
        results["exploit_predictor"] = test_exploit_predictor()
    except Exception as exc:
        print(f"  Exploit predictor crashed: {exc}")
        results["exploit_predictor"] = {"error": str(exc)}

    try:
        results["finding_classifier"] = test_finding_classifier()
    except Exception as exc:
        print(f"  Finding classifier crashed: {exc}")
        results["finding_classifier"] = {"error": str(exc)}

    try:
        results["attack_path"] = test_attack_path()
    except Exception as exc:
        print(f"  Attack path crashed: {exc}")
        results["attack_path"] = {"error": str(exc)}

    print("\n" + "=" * 78)
    print("SUMMARY")
    print("=" * 78)
    for name, r in results.items():
        if "error" in r:
            print(f"  {name}: ERROR — {r['error']}")
        elif r.get("status") == "not_trained":
            print(f"  {name}: not trained")
        else:
            tot = r.get("passed", 0) + r.get("failed", 0)
            print(f"  {name}: {r.get('passed', 0)}/{tot}")

    out = Path(__file__).resolve().parent / "models" / "smoke_test.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as fh:
        json.dump(results, fh, indent=2, default=str)
    print(f"\n  Saved → {out}")


if __name__ == "__main__":
    main()
