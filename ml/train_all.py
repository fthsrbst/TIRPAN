"""
TIRPAN ML — Training Script
============================
Downloads datasets and trains all 3 ML models in one shot.

Usage:
    python ml/train_all.py                      # train all models
    python ml/train_all.py --model finding      # train only finding classifier
    python ml/train_all.py --model exploit      # train only exploit predictor
    python ml/train_all.py --model attack_path  # train only attack path suggester
    python ml/train_all.py --cache-dir /tmp/ml_data  # custom cache dir
    python ml/train_all.py --skip-download      # use existing cached data

All trained models are saved to ml/models/.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("ml.train_all")

# Ensure TIRPAN root is on the path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def check_dependencies() -> bool:
    missing = []
    for pkg in ["pandas", "sklearn", "xgboost", "joblib"]:
        try:
            __import__(pkg if pkg != "sklearn" else "sklearn")
        except ImportError:
            missing.append(pkg)
    if missing:
        logger.error(
            "Missing packages: %s\n"
            "Install with: pip install scikit-learn xgboost joblib pandas",
            ", ".join(missing),
        )
        return False
    return True


def train_finding_classifier(finding_df, metrics_out: dict) -> bool:
    """Train and save the finding classifier."""
    logger.info("=" * 60)
    logger.info("MODEL 1 — Finding Classifier")
    logger.info("=" * 60)
    try:
        from ml.finding_classifier import FindingClassifierML
        clf = FindingClassifierML()
        t0 = time.time()
        metrics = clf.train(finding_df)
        elapsed = time.time() - t0
        clf.save()
        metrics_out["finding_classifier"] = {**metrics, "train_time_s": round(elapsed, 1)}
        logger.info("Finding Classifier trained in %.1fs", elapsed)
        _print_metrics(metrics)
        return True
    except Exception as exc:
        logger.error("Finding Classifier training failed: %s", exc, exc_info=True)
        metrics_out["finding_classifier"] = {"error": str(exc)}
        return False


def train_exploit_predictor(exploit_df, metrics_out: dict) -> bool:
    """Train and save the exploit predictor."""
    logger.info("=" * 60)
    logger.info("MODEL 2 — Exploit Success Predictor")
    logger.info("=" * 60)
    try:
        from ml.exploit_predictor import ExploitPredictorML
        pred = ExploitPredictorML()
        t0 = time.time()
        metrics = pred.train(exploit_df)
        elapsed = time.time() - t0
        pred.save()
        metrics_out["exploit_predictor"] = {**metrics, "train_time_s": round(elapsed, 1)}
        logger.info("Exploit Predictor trained in %.1fs", elapsed)
        _print_metrics(metrics)
        return True
    except Exception as exc:
        logger.error("Exploit Predictor training failed: %s", exc, exc_info=True)
        metrics_out["exploit_predictor"] = {"error": str(exc)}
        return False


def train_attack_path(attack_data, metrics_out: dict) -> bool:
    """Build and save the attack path suggester."""
    logger.info("=" * 60)
    logger.info("MODEL 3 — Attack Path Suggester")
    logger.info("=" * 60)
    try:
        from ml.attack_path import AttackPathSuggester
        suggester = AttackPathSuggester()
        t0 = time.time()
        suggester.build(attack_data)
        elapsed = time.time() - t0
        suggester.save()
        n_tech = len(attack_data.get("techniques", []))
        n_kw   = len(attack_data.get("service_ttp_map", {}))
        metrics_out["attack_path"] = {
            "techniques": n_tech,
            "service_keywords": n_kw,
            "build_time_s": round(elapsed, 2),
        }
        logger.info(
            "Attack Path Suggester built: %d techniques, %d keywords in %.2fs",
            n_tech, n_kw, elapsed,
        )
        return True
    except Exception as exc:
        logger.error("Attack Path Suggester build failed: %s", exc, exc_info=True)
        metrics_out["attack_path"] = {"error": str(exc)}
        return False


def _print_metrics(metrics: dict) -> None:
    for k, v in metrics.items():
        if isinstance(v, dict):
            logger.info("  %s: %s", k, v)
        else:
            logger.info("  %s = %s", k, v)


def main() -> int:
    parser = argparse.ArgumentParser(description="TIRPAN ML — Train all models")
    parser.add_argument(
        "--model",
        choices=["all", "finding", "exploit", "attack_path"],
        default="all",
        help="Which model to train (default: all)",
    )
    parser.add_argument(
        "--cache-dir",
        default="ml/data",
        help="Directory for downloaded datasets (default: ml/data)",
    )
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Skip downloading — use existing cached files",
    )
    _default_metrics = str(Path(__file__).resolve().parent / "models" / "train_metrics.json")
    parser.add_argument(
        "--metrics-out",
        default=_default_metrics,
        help="Path to write training metrics JSON",
    )
    args = parser.parse_args()

    if not check_dependencies():
        return 1

    logger.info("TIRPAN ML Training — model=%s  cache=%s", args.model, args.cache_dir)

    # ── Download & prepare datasets ────────────────────────────────────────
    from ml.datasets import build_training_df
    logger.info("Loading datasets from %s…", args.cache_dir)
    t0 = time.time()
    finding_df, exploit_df, attack_data = build_training_df(cache_dir=args.cache_dir)
    logger.info(
        "Datasets ready in %.1fs — finding=%d, exploit=%d",
        time.time() - t0, len(finding_df), len(exploit_df),
    )

    # ── Train selected models ──────────────────────────────────────────────
    all_metrics: dict = {}
    success_count = 0
    total_count = 0

    if args.model in ("all", "finding"):
        total_count += 1
        if train_finding_classifier(finding_df, all_metrics):
            success_count += 1

    if args.model in ("all", "exploit"):
        total_count += 1
        if train_exploit_predictor(exploit_df, all_metrics):
            success_count += 1

    if args.model in ("all", "attack_path"):
        total_count += 1
        if train_attack_path(attack_data, all_metrics):
            success_count += 1

    # ── Save metrics ───────────────────────────────────────────────────────
    metrics_path = Path(args.metrics_out)
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    with open(metrics_path, "w", encoding="utf-8") as fh:
        json.dump(all_metrics, fh, indent=2, default=str)
    logger.info("Metrics saved → %s", metrics_path)

    # ── Summary ────────────────────────────────────────────────────────────
    logger.info("=" * 60)
    logger.info("Training complete: %d/%d models succeeded", success_count, total_count)
    if "finding_classifier" in all_metrics and "risk_level" in all_metrics["finding_classifier"]:
        rl = all_metrics["finding_classifier"]["risk_level"]
        logger.info("  Finding risk_level  accuracy=%.3f  f1=%.3f", rl["accuracy"], rl["f1_macro"])
    if "exploit_predictor" in all_metrics and "roc_auc" in all_metrics["exploit_predictor"]:
        ep = all_metrics["exploit_predictor"]
        logger.info("  Exploit predictor   accuracy=%.3f  auc=%.3f", ep["accuracy"], ep["roc_auc"])
    if "attack_path" in all_metrics and "techniques" in all_metrics["attack_path"]:
        ap = all_metrics["attack_path"]
        logger.info("  Attack path         %d techniques, %d service keywords", ap["techniques"], ap["service_keywords"])
    logger.info("=" * 60)

    return 0 if success_count == total_count else 1


if __name__ == "__main__":
    sys.exit(main())
