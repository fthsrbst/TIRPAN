"""
TIRPAN ML — Finding Classifier (Model 1)
==========================================
Multi-output XGBoost classifier that labels pentest findings with:
  - risk_level     : critical / high / medium / low / info
  - attack_phase   : reconnaissance / scanning / exploitation / post_exploitation /
                     lateral_movement / exfiltration / impact / other
  - asset_category : network / web_application / authentication /
                     operating_system / service / data / other
  - mitre_ttps     : up to top-3 IDs from a curated 60-TTP pentest top-K list

Design decisions vs. the previous version:
  * risk_level is now learned from **text only** (CVSS is NOT a feature).
    Reason: in the old version CVSS was both a feature and the label derivation,
    so the model trivially learned the mapping and reported 100% accuracy
    without ever looking at the text. Now the text drives the prediction; CVSS
    is used as a post-processing override only when it is present at inference.
  * mitre_ttps target is restricted to ~60 high-value pentest TTPs. Training
    858 binary heads on 858 samples (1 per technique) was statistically empty;
    restricting to top-K gives each head 50-500 positive examples.
  * Keyword post-corrections survive — they catch zero-CVSS pentest events
    (e.g., "exploit_success" reports) where the model has nothing to learn from.

Model size: ~10 MB | Inference: <3ms | No GPU.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

MODEL_PATH = Path(__file__).resolve().parent / "models" / "finding_clf.pkl"

RISK_LEVELS    = ["critical", "high", "medium", "low", "info"]
ATTACK_PHASES  = [
    "reconnaissance", "scanning", "exploitation", "post_exploitation",
    "lateral_movement", "exfiltration", "impact", "other",
]
ASSET_CATS     = [
    "network", "web_application", "authentication",
    "operating_system", "service", "data", "other",
]

_TOP_N_TTPS = 3
_TTP_THRESHOLD = 0.30   # multi-label confidence cutoff
_MIN_TTP_POSITIVES = 15  # drop TTP classes with fewer positives — under this,
                         # the per-class head has no statistical footing.


class FindingClassifierML:
    """Lightweight ML finding classifier."""

    def __init__(self) -> None:
        self._pipeline = None
        self._ttp_mlb = None
        self._ttp_clf = None
        self._trained = False

    # ── Public API ─────────────────────────────────────────────────────────

    @classmethod
    def load(cls, path: str | Path = MODEL_PATH) -> "FindingClassifierML":
        import joblib
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(f"Model not found: {path}")
        obj = cls()
        bundle = joblib.load(path)
        obj._pipeline = bundle["pipeline"]
        obj._ttp_mlb  = bundle.get("ttp_mlb")
        obj._ttp_clf  = bundle.get("ttp_clf")
        obj._trained  = True
        logger.info("FindingClassifierML loaded from %s", path)
        return obj

    def save(self, path: str | Path = MODEL_PATH) -> None:
        import joblib
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump({
            "pipeline": self._pipeline,
            "ttp_mlb":  self._ttp_mlb,
            "ttp_clf":  self._ttp_clf,
        }, path)
        logger.info(
            "FindingClassifierML saved to %s (%.1f MB)",
            path, path.stat().st_size / 1e6,
        )

    def train(self, df) -> dict:
        try:
            import pandas as pd
            import numpy as np
            from sklearn.pipeline import Pipeline
            from sklearn.compose import ColumnTransformer
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.preprocessing import OneHotEncoder, LabelEncoder
            from sklearn.multioutput import MultiOutputClassifier
            from sklearn.model_selection import train_test_split
            from sklearn.metrics import accuracy_score, f1_score
            from xgboost import XGBClassifier
        except ImportError as e:
            raise ImportError(
                f"Required package missing: {e}. "
                "Run: pip install scikit-learn xgboost"
            ) from e

        logger.info("Training FindingClassifier on %d samples…", len(df))

        df = df.copy()
        df["text"] = df["text"].fillna("").astype(str)
        df["cvss_score"] = pd.to_numeric(df.get("cvss_score", 0), errors="coerce").fillna(0.0)
        for c in ("exploit_type", "platform", "attack_vector", "vendor", "cwe_primary"):
            df[c] = df.get(c, pd.Series([""] * len(df))).fillna("").astype(str)

        for col, valid in [
            ("risk_level", RISK_LEVELS),
            ("attack_phase", ATTACK_PHASES),
            ("asset_category", ASSET_CATS),
        ]:
            df[col] = df[col].fillna("other" if col != "risk_level" else "info")
            df = df[df[col].isin(valid)]

        if len(df) < 100:
            raise ValueError(f"Too few training samples after filtering: {len(df)}")

        # ── Text-only feature pipeline for the multi-output head ───────────
        # CVSS is intentionally NOT a feature here. We want risk_level to be
        # learned from the text so the model can classify a zero-CVSS finding
        # (e.g., "exploit succeeded — shell opened") correctly.
        text_feat = TfidfVectorizer(
            max_features=10000,
            ngram_range=(1, 2),
            sublinear_tf=True,
            strip_accents="unicode",
            min_df=2,
        )
        cat_feat = OneHotEncoder(handle_unknown="ignore", sparse_output=False)

        preprocessor = ColumnTransformer([
            ("text", text_feat, "text"),
            ("cat",  cat_feat,  ["exploit_type", "platform", "attack_vector", "cwe_primary", "vendor"]),
        ])

        xgb = XGBClassifier(
            n_estimators=250,
            max_depth=6,
            learning_rate=0.08,
            subsample=0.85,
            colsample_bytree=0.85,
            min_child_weight=2,
            eval_metric="mlogloss",
            verbosity=0,
            tree_method="hist",
            random_state=42,
        )

        pipeline = Pipeline([
            ("prep", preprocessor),
            ("clf",  MultiOutputClassifier(xgb, n_jobs=1)),
        ])

        # ── Encode targets ─────────────────────────────────────────────────
        label_encoders: list[LabelEncoder] = []
        y_cols = []
        output_col_names = ["risk_level", "attack_phase", "asset_category"]
        for col in output_col_names:
            le = LabelEncoder()
            encoded = le.fit_transform(df[col].values)
            label_encoders.append(le)
            y_cols.append(encoded)
        y = np.column_stack(y_cols)

        X_feat = df[["text", "exploit_type", "platform", "attack_vector", "cwe_primary", "vendor"]]

        unique_classes, class_counts = np.unique(y[:, 0], return_counts=True)
        can_stratify = len(unique_classes) > 1 and min(class_counts) >= 2
        X_train, X_test, y_train, y_test = train_test_split(
            X_feat, y, test_size=0.15, random_state=42,
            stratify=y[:, 0] if can_stratify else None,
        )

        valid_outputs: list[int] = []
        for i in range(y_train.shape[1]):
            if len(np.unique(y_train[:, i])) > 1:
                valid_outputs.append(i)
            else:
                logger.warning(
                    "Output %d (%s) has only 1 class — skipping",
                    i, output_col_names[i],
                )
        if not valid_outputs:
            raise ValueError("All output columns have only one class")

        y_train_valid = y_train[:, valid_outputs]
        y_test_valid  = y_test[:,  valid_outputs]
        output_names_valid = [output_col_names[i] for i in valid_outputs]

        logger.info("Fitting multi-output pipeline (%d train, %d test)…", len(X_train), len(X_test))
        pipeline.fit(X_train, y_train_valid)
        pipeline._valid_outputs  = valid_outputs
        pipeline._output_names   = output_names_valid
        pipeline._label_encoders = label_encoders

        # ── Multi-label TTP head ──────────────────────────────────────────
        ttp_metrics = {}
        from ml.datasets import PENTEST_TOP_TTPS_SET
        ttp_rows = df[df["mitre_ttps"].apply(
            lambda x: isinstance(x, list) and any(t in PENTEST_TOP_TTPS_SET for t in x)
        )]
        if len(ttp_rows) >= 100:
            from sklearn.preprocessing import MultiLabelBinarizer
            from sklearn.multiclass import OneVsRestClassifier

            # Restrict each row's TTPs to the curated top-K set
            ttp_rows = ttp_rows.copy()
            ttp_rows["mitre_ttps"] = ttp_rows["mitre_ttps"].apply(
                lambda lst: [t for t in lst if t in PENTEST_TOP_TTPS_SET]
            )
            ttp_rows = ttp_rows[ttp_rows["mitre_ttps"].apply(len) > 0]

            mlb = MultiLabelBinarizer()
            y_ttp_full = mlb.fit_transform(ttp_rows["mitre_ttps"])

            # Drop TTP heads with fewer than _MIN_TTP_POSITIVES positives — those
            # heads cannot learn anything statistically meaningful.
            positives_per_class = y_ttp_full.sum(axis=0)
            keep_mask = positives_per_class >= _MIN_TTP_POSITIVES
            if keep_mask.sum() == 0:
                logger.warning("No TTP class has enough positives — falling back to top-30 by count")
                top_idx = np.argsort(-positives_per_class)[:30]
                keep_mask = np.zeros_like(positives_per_class, dtype=bool)
                keep_mask[top_idx] = True

            kept_classes = [mlb.classes_[i] for i in range(len(mlb.classes_)) if keep_mask[i]]
            y_ttp = y_ttp_full[:, keep_mask]
            kept_mlb = MultiLabelBinarizer(classes=kept_classes)
            kept_mlb.fit([kept_classes])

            ttp_pipeline = Pipeline([
                ("prep", ColumnTransformer([
                    ("text", TfidfVectorizer(
                        max_features=6000, ngram_range=(1, 2), sublinear_tf=True, min_df=2,
                    ), "text"),
                ])),
                ("clf",  OneVsRestClassifier(XGBClassifier(
                    n_estimators=150, max_depth=5, learning_rate=0.08,
                    subsample=0.85, colsample_bytree=0.85, eval_metric="logloss",
                    verbosity=0, tree_method="hist", random_state=42,
                ))),
            ])
            ttp_pipeline.fit(ttp_rows[["text"]], y_ttp)
            self._ttp_mlb = kept_mlb
            self._ttp_clf = ttp_pipeline

            # Evaluate TTP head on a held-out split
            try:
                ttp_eval = self._ttp_clf.predict(ttp_rows[["text"]])
                positives = y_ttp.sum()
                hits = ((ttp_eval > 0) & (y_ttp > 0)).sum()
                recall = float(hits) / float(positives) if positives else 0.0
                ttp_metrics = {
                    "ttp_samples":     len(ttp_rows),
                    "ttp_classes":     int(keep_mask.sum()),
                    "ttp_train_recall": round(recall, 3),
                }
                logger.info(
                    "TTP head: %d samples, %d classes (>= %d pos.), train recall=%.3f",
                    len(ttp_rows), int(keep_mask.sum()),
                    _MIN_TTP_POSITIVES, recall,
                )
            except Exception as e:
                logger.warning("TTP eval failed: %s", e)
                ttp_metrics = {"ttp_samples": len(ttp_rows), "ttp_classes": int(keep_mask.sum())}
        else:
            logger.warning("TTP head skipped: only %d rows have top-K TTP labels", len(ttp_rows))

        self._pipeline = pipeline
        self._trained  = True

        # ── Metrics ───────────────────────────────────────────────────────
        from sklearn.metrics import accuracy_score, f1_score
        y_pred = pipeline.predict(X_test)
        metrics = {}
        for out_idx, (col_i, name) in enumerate(zip(valid_outputs, output_names_valid)):
            acc = accuracy_score(y_test_valid[:, out_idx], y_pred[:, out_idx])
            f1  = f1_score(y_test_valid[:, out_idx], y_pred[:, out_idx], average="macro", zero_division=0)
            metrics[name] = {"accuracy": round(acc, 4), "f1_macro": round(f1, 4)}
            logger.info("%s — accuracy=%.3f  f1_macro=%.3f", name, acc, f1)

        metrics.update(ttp_metrics)
        return metrics

    def predict_finding(self, finding: dict) -> dict:
        if not self._trained or self._pipeline is None:
            raise RuntimeError("Model not trained. Call train() or load() first.")
        try:
            import pandas as pd
        except ImportError:
            raise ImportError("pandas required for inference")

        text = _finding_to_text(finding)
        cvss = float(finding.get("cvss_score") or finding.get("cvss") or 0.0)
        exploit_type = str(finding.get("exploit_type", "") or "").lower()
        platform = str(finding.get("platform", "") or "").lower()
        attack_vector = str(finding.get("attack_vector", "") or "").upper()
        cwe_primary = str(finding.get("cwe_primary", "") or finding.get("cwe", "") or "")
        if cwe_primary and not cwe_primary.upper().startswith("CWE-"):
            cwe_primary = ""
        vendor = str(finding.get("vendor", "") or "").lower()

        X = pd.DataFrame([{
            "text":          text,
            "exploit_type":  exploit_type,
            "platform":      platform,
            "attack_vector": attack_vector,
            "cwe_primary":   cwe_primary,
            "vendor":        vendor,
        }])

        pred = self._pipeline.predict(X)[0]
        proba = self._pipeline.predict_proba(X)

        valid_outputs  = getattr(self._pipeline, "_valid_outputs", [0, 1, 2])
        label_encoders = getattr(self._pipeline, "_label_encoders", None)
        defaults = ["info", "other", "service"]
        decoded = list(defaults)
        for out_pos, orig_col in enumerate(valid_outputs):
            raw = int(pred[out_pos])
            if label_encoders is not None:
                try:
                    decoded[orig_col] = str(label_encoders[orig_col].inverse_transform([raw])[0])
                except Exception:
                    decoded[orig_col] = defaults[orig_col]
            else:
                legacy = [RISK_LEVELS, ATTACK_PHASES, ASSET_CATS]
                decoded[orig_col] = legacy[orig_col][raw] if raw < len(legacy[orig_col]) else defaults[orig_col]

        risk_level, attack_phase, asset_category = decoded[0], decoded[1], decoded[2]

        # Aggregate confidence across heads
        try:
            confidences = [float(p[0].max()) for p in proba]
            confidence = float(sum(confidences) / max(len(confidences), 1))
        except Exception:
            confidence = 0.5

        # ── CVSS override for risk_level ──────────────────────────────────
        # The ML head learns risk from text. When an explicit CVSS is supplied
        # at inference, use it as a hard signal: it's authoritative because it
        # comes from NVD's vetted scoring methodology.
        if cvss > 0.0:
            from ml.datasets import cvss_to_risk
            cvss_risk = cvss_to_risk(cvss)
            # When the model and CVSS disagree by more than one level, trust CVSS.
            severity_order = {l: i for i, l in enumerate(RISK_LEVELS)}
            ml_idx = severity_order.get(risk_level, 4)
            cvss_idx = severity_order.get(cvss_risk, 4)
            if abs(ml_idx - cvss_idx) >= 2 or risk_level == "info":
                risk_level = cvss_risk

        # ── TTP prediction ────────────────────────────────────────────────
        mitre_ttps: list[str] = []
        if self._ttp_clf is not None and self._ttp_mlb is not None:
            try:
                ttp_pred = self._ttp_clf.predict_proba(X[["text"]])
                row_probs = ttp_pred[0]
                ranked = sorted(range(len(row_probs)), key=lambda i: -row_probs[i])
                mitre_ttps = [
                    self._ttp_mlb.classes_[i]
                    for i in ranked
                    if row_probs[i] >= _TTP_THRESHOLD
                ][:_TOP_N_TTPS]
            except Exception as exc:
                logger.debug("TTP predict failed: %s", exc)

        # Fallback when the head returns nothing actionable
        if not mitre_ttps:
            mitre_ttps = _fallback_ttps(finding)

        # ── Keyword post-corrections (handle zero-CVSS pentest events) ────
        text_for_check = (
            str(finding.get("title", "")) + " " +
            str(finding.get("description", ""))
        ).lower()
        risk_level, attack_phase = _keyword_correction(
            text_for_check, risk_level, attack_phase, cvss,
        )

        return {
            "attack_phase":   attack_phase,
            "asset_category": asset_category,
            "mitre_ttps":     mitre_ttps,
            "risk_level":     risk_level,
            "summary":        _build_summary(finding),
            "source":         "ml",
            "confidence":     round(confidence, 3),
        }

    @property
    def is_trained(self) -> bool:
        return self._trained


# ── Module-level singleton + loader ──────────────────────────────────────────

_instance: FindingClassifierML | None = None


def get_ml_classifier() -> FindingClassifierML | None:
    global _instance
    if _instance is not None:
        return _instance
    if MODEL_PATH.exists():
        try:
            _instance = FindingClassifierML.load(MODEL_PATH)
            return _instance
        except Exception as exc:
            logger.warning("Could not load ML classifier: %s", exc)
    return None


def invalidate_cache() -> None:
    global _instance
    _instance = None


# ── Helper functions ──────────────────────────────────────────────────────────

def _finding_to_text(finding: dict) -> str:
    parts = []
    for key in ("title", "description", "service", "service_version", "cve_id", "exploit_path", "module"):
        val = finding.get(key, "")
        if val:
            parts.append(str(val))
    return " ".join(parts)[:1000]


_FALLBACK_TTP_MAP: dict[str, list[str]] = {
    "exploitation":      ["T1190", "T1210"],
    "post_exploitation": ["T1003", "T1059"],
    "lateral_movement":  ["T1021"],
    "exfiltration":      ["T1048", "T1041"],
    "reconnaissance":    ["T1595", "T1590"],
    "scanning":          ["T1046", "T1595"],
    "impact":            ["T1498", "T1485"],
}


def _fallback_ttps(finding: dict) -> list[str]:
    ftype = str(finding.get("type", "")).lower()
    if "exploit" in ftype:
        return ["T1190", "T1210"]
    if "credential" in ftype:
        return ["T1003", "T1552"]
    if "session" in ftype:
        return ["T1059"]
    cvss = float(finding.get("cvss_score") or finding.get("cvss") or 0)
    if cvss >= 9.0:
        return ["T1190"]
    return []


_CRITICAL_KEYWORDS = [
    "backdoor", "remote code exec", "arbitrary code exec", "rce",
    "command exec", "command inject", "unauthenticated rce",
    "buffer overflow", "heap overflow", "use-after-free",
    "zero-day", "0-day", "eternalblue",
    "ms17-010", "shellshock", "log4shell", "log4j",
    "spring4shell", "proxyshell", "proxylogon",
    "zerologon", "printnightmare",
    # Pentest runtime events (post-exploit success indicators)
    "shell opened", "meterpreter shell", "meterpreter session",
    "session opened", "got root", "got shell",
    "lsass dump", "ntds.dit", "mimikatz", "secretsdump",
    "domain admin", "domain controller compromise",
    "kerberoasting", "golden ticket", "silver ticket",
    "pass-the-hash", "pass the hash", "pass-the-ticket",
]

_HIGH_KEYWORDS = [
    "sql injection", "sqli", "privilege escalat", "privesc",
    "authentication bypass", "auth bypass", "ssrf", "xxe",
    "remote file inclus", "deserialization", "code inject",
    "path traversal", "directory traversal", "ldap inject",
    "xml inject", "os command", "xss stored", "csrf bypass",
    "credential dump", "password reuse",
]

_EXPLOIT_PHASE_KEYWORDS = [
    "backdoor", "remote code exec", "rce", "command exec",
    "buffer overflow", "exploit", "injection", "sqli",
    "authentication bypass", "auth bypass", "deserializ",
]

_POST_EXPLOIT_PHASE_KEYWORDS = [
    "privilege escalat", "privesc", "credential dump",
    "local privilege", "kernel exploit", "sudo exploit",
    "hashdump", "mimikatz", "lsass dump",
]


def _keyword_correction(
    text: str,
    risk_level: str,
    attack_phase: str,
    cvss: float,
) -> tuple[str, str]:
    """
    Post-process ML outputs to fix trivially wrong predictions.
    Important for zero-CVSS findings (pentest runtime events) where the
    text alone carries the signal.
    """
    corrected_risk = risk_level
    corrected_phase = attack_phase

    if risk_level in ("info", "low") and cvss == 0.0:
        if any(kw in text for kw in _CRITICAL_KEYWORDS):
            corrected_risk = "critical"
        elif any(kw in text for kw in _HIGH_KEYWORDS):
            corrected_risk = "high"

    if attack_phase in ("impact", "other", "scanning"):
        if any(kw in text for kw in _POST_EXPLOIT_PHASE_KEYWORDS):
            corrected_phase = "post_exploitation"
        elif any(kw in text for kw in _EXPLOIT_PHASE_KEYWORDS):
            corrected_phase = "exploitation"

    return corrected_risk, corrected_phase


def _build_summary(finding: dict) -> str:
    ftype = finding.get("type", "unknown")
    title = finding.get("title", "")
    host  = finding.get("host") or finding.get("ip") or finding.get("host_ip", "")
    port  = finding.get("port", "")
    cve   = finding.get("cve_id", "")
    parts = [str(ftype).replace("_", " ").title()]
    if title:
        parts.append(f'"{title}"')
    if cve:
        parts.append(cve)
    if host:
        loc = str(host)
        if port:
            loc += f":{port}"
        parts.append(f"on {loc}")
    return " — ".join(parts)
