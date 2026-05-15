"""
TIRPAN ML — Finding Classifier (Model 1)
==========================================
Multi-output XGBoost classifier that labels pentest findings with:
  - risk_level     : critical / high / medium / low / info
  - attack_phase   : reconnaissance / scanning / exploitation / post_exploitation /
                     lateral_movement / exfiltration / impact / other
  - asset_category : network / web_application / authentication /
                     operating_system / service / data / other
  - mitre_ttps     : list of top-3 predicted MITRE ATT&CK technique IDs

Model size: ~8 MB  |  Inference: <2ms  |  No GPU required.

Usage:
    from ml.finding_classifier import FindingClassifierML
    clf = FindingClassifierML()
    clf.train(finding_df)          # pandas DataFrame
    clf.save("ml/models/finding_clf.pkl")

    result = clf.predict_finding({"title": "...", "description": "...", "cvss_score": 7.5})
    # {"risk_level": "high", "attack_phase": "exploitation", ...}
"""

from __future__ import annotations

import json
import logging
import os
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

# Top-N TTPs to return from multi-label prediction
_TOP_N_TTPS = 3


class FindingClassifierML:
    """
    Lightweight ML finding classifier.
    Train once, then use predict_finding() at runtime.
    """

    def __init__(self) -> None:
        self._pipeline = None       # sklearn Pipeline (risk_level + attack_phase + asset_category)
        self._ttp_mlb = None        # MultiLabelBinarizer for TTP labels
        self._ttp_clf = None        # OneVsRestClassifier for TTP multi-label
        self._trained = False

    # ── Public API ─────────────────────────────────────────────────────────

    @classmethod
    def load(cls, path: str | Path = MODEL_PATH) -> "FindingClassifierML":
        """Load a previously saved model."""
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
        """Persist model to disk."""
        import joblib
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump({
            "pipeline": self._pipeline,
            "ttp_mlb":  self._ttp_mlb,
            "ttp_clf":  self._ttp_clf,
        }, path)
        logger.info("FindingClassifierML saved to %s (%.1f MB)", path, path.stat().st_size / 1e6)

    def train(self, df) -> dict:
        """
        Train on a pandas DataFrame with columns:
            text, cvss_score, attack_vector, exploit_type, platform,
            risk_level, attack_phase, asset_category, mitre_ttps

        Returns dict with training metrics.
        """
        try:
            import pandas as pd
            import numpy as np
            from sklearn.pipeline import Pipeline
            from sklearn.compose import ColumnTransformer
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.preprocessing import LabelEncoder, OneHotEncoder, StandardScaler
            from sklearn.multioutput import MultiOutputClassifier
            from sklearn.model_selection import train_test_split
            from sklearn.metrics import classification_report
            from xgboost import XGBClassifier
        except ImportError as e:
            raise ImportError(f"Required package missing: {e}. Run: pip install scikit-learn xgboost") from e

        logger.info("Training FindingClassifier on %d samples…", len(df))

        # ── Prepare features ───────────────────────────────────────────────
        df = df.copy()
        df["text"] = df["text"].fillna("").astype(str)
        df["cvss_score"] = pd.to_numeric(df.get("cvss_score", 0), errors="coerce").fillna(0.0)
        df["exploit_type"] = df.get("exploit_type", pd.Series([""] * len(df))).fillna("").astype(str)
        df["platform"] = df.get("platform", pd.Series([""] * len(df))).fillna("").astype(str)
        df["attack_vector"] = df.get("attack_vector", pd.Series([""] * len(df))).fillna("").astype(str)

        # Validate labels
        for col, valid in [("risk_level", RISK_LEVELS), ("attack_phase", ATTACK_PHASES), ("asset_category", ASSET_CATS)]:
            df[col] = df[col].fillna("other" if col != "risk_level" else "info")
            df = df[df[col].isin(valid)]

        if len(df) < 100:
            raise ValueError(f"Too few training samples after filtering: {len(df)}")

        # ── Build multi-output pipeline ────────────────────────────────────
        text_feat = TfidfVectorizer(
            max_features=8000,
            ngram_range=(1, 2),
            sublinear_tf=True,
            strip_accents="unicode",
        )
        cat_feat = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
        num_feat = StandardScaler()

        preprocessor = ColumnTransformer([
            ("text", text_feat, "text"),
            ("cat",  cat_feat,  ["exploit_type", "platform", "attack_vector"]),
            ("num",  num_feat,  ["cvss_score"]),
        ])

        xgb = XGBClassifier(
            n_estimators=200,
            max_depth=5,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,
            eval_metric="mlogloss",
            verbosity=0,
            tree_method="hist",
        )

        pipeline = Pipeline([
            ("prep", preprocessor),
            ("clf",  MultiOutputClassifier(xgb, n_jobs=1)),
        ])

        # ── Encode target labels with per-column LabelEncoder ──────────────
        # LabelEncoder ensures labels are always 0-indexed for XGBoost,
        # even when some global classes are absent from the training data.
        from sklearn.preprocessing import LabelEncoder as LE
        label_encoders: list[LE] = []
        y_encoded_cols = []
        output_col_names = ["risk_level", "attack_phase", "asset_category"]
        for col in output_col_names:
            le = LE()
            encoded = le.fit_transform(df[col].values)
            label_encoders.append(le)
            y_encoded_cols.append(encoded)

        y = np.column_stack(y_encoded_cols)
        X_feat = df[["text", "cvss_score", "exploit_type", "platform", "attack_vector"]]

        # Use stratify only when enough samples per class
        unique_classes, class_counts = np.unique(y[:, 0], return_counts=True)
        can_stratify = len(unique_classes) > 1 and min(class_counts) >= 2
        X_train, X_test, y_train, y_test = train_test_split(
            X_feat, y, test_size=0.15, random_state=42,
            stratify=y[:, 0] if can_stratify else None,
        )

        logger.info("Fitting pipeline (%d train, %d test)…", len(X_train), len(X_test))
        # Remove output columns where train has only one unique class
        valid_outputs = []
        for i in range(y_train.shape[1]):
            if len(np.unique(y_train[:, i])) > 1:
                valid_outputs.append(i)
            else:
                logger.warning("Output column %d (%s) has only 1 class — skipping", i, output_col_names[i])
        if not valid_outputs:
            raise ValueError("All output columns have only one class — not enough data diversity")
        y_train_valid = y_train[:, valid_outputs]
        y_test_valid  = y_test[:,  valid_outputs]
        output_names_valid = [output_col_names[i] for i in valid_outputs]

        pipeline.fit(X_train, y_train_valid)
        # Store encoders and metadata for inference decoding
        pipeline._valid_outputs   = valid_outputs
        pipeline._output_names    = output_names_valid
        pipeline._label_encoders  = label_encoders  # list[LabelEncoder] for all 3 outputs

        # ── TTP multi-label classifier ─────────────────────────────────────
        ttp_metrics = {}
        ttp_rows = df[df["mitre_ttps"].apply(lambda x: isinstance(x, list) and len(x) > 0)]
        if len(ttp_rows) >= 50:
            from sklearn.multiclass import OneVsRestClassifier
            from sklearn.preprocessing import MultiLabelBinarizer
            mlb = MultiLabelBinarizer()
            y_ttp = mlb.fit_transform(ttp_rows["mitre_ttps"])
            if y_ttp.shape[1] > 0:
                ttp_pipeline = Pipeline([
                    ("prep", ColumnTransformer([
                        ("text", TfidfVectorizer(max_features=5000, ngram_range=(1, 2), sublinear_tf=True), "text"),
                    ])),
                    ("clf",  OneVsRestClassifier(XGBClassifier(
                        n_estimators=100, max_depth=4, verbosity=0, tree_method="hist",
                        eval_metric="logloss",
                    ))),
                ])
                ttp_pipeline.fit(ttp_rows[["text"]], y_ttp)
                self._ttp_mlb = mlb
                self._ttp_clf = ttp_pipeline
                ttp_metrics = {"ttp_samples": len(ttp_rows), "ttp_classes": y_ttp.shape[1]}

        self._pipeline = pipeline
        self._trained  = True

        # ── Evaluation metrics ─────────────────────────────────────────────
        from sklearn.metrics import accuracy_score, f1_score
        y_pred = pipeline.predict(X_test)
        metrics = {}
        all_output_names = ["risk_level", "attack_phase", "asset_category"]
        for out_idx, (col_i, name) in enumerate(zip(valid_outputs, output_names_valid)):
            acc = accuracy_score(y_test_valid[:, out_idx], y_pred[:, out_idx])
            f1  = f1_score(y_test_valid[:, out_idx], y_pred[:, out_idx], average="macro", zero_division=0)
            metrics[name] = {"accuracy": round(acc, 4), "f1_macro": round(f1, 4)}
            logger.info("%s — accuracy=%.3f  f1_macro=%.3f", name, acc, f1)

        metrics.update(ttp_metrics)
        return metrics

    def predict_finding(self, finding: dict) -> dict:
        """
        Classify a single finding dict.

        Returns dict compatible with FindingClassification.to_dict():
            {"attack_phase", "asset_category", "mitre_ttps", "risk_level", "summary", "source"}
        """
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

        X = pd.DataFrame([{
            "text": text,
            "cvss_score": cvss,
            "exploit_type": exploit_type,
            "platform": platform,
            "attack_vector": attack_vector,
        }])

        pred = self._pipeline.predict(X)[0]
        proba = self._pipeline.predict_proba(X)

        valid_outputs    = getattr(self._pipeline, "_valid_outputs",   [0, 1, 2])
        label_encoders   = getattr(self._pipeline, "_label_encoders",  None)
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
                # Legacy models saved without LabelEncoder — use hardcoded lists
                legacy = [RISK_LEVELS, ATTACK_PHASES, ASSET_CATS]
                decoded[orig_col] = legacy[orig_col][raw] if raw < len(legacy[orig_col]) else defaults[orig_col]

        risk_level, attack_phase, asset_category = decoded[0], decoded[1], decoded[2]

        # Confidence: use max proba of first available estimator
        confidence = float(max(proba[0][0])) if proba else 0.5

        # TTP prediction
        mitre_ttps: list[str] = []
        if self._ttp_clf is not None and self._ttp_mlb is not None:
            try:
                ttp_pred = self._ttp_clf.predict_proba(X[["text"]])
                top_idx = sorted(range(len(ttp_pred[0])), key=lambda i: -ttp_pred[0][i])[:_TOP_N_TTPS]
                mitre_ttps = [
                    self._ttp_mlb.classes_[i]
                    for i in top_idx
                    if ttp_pred[0][i] >= 0.3
                ]
            except Exception:
                pass

        # Fallback TTPs from CVSS/type if model returned nothing
        if not mitre_ttps:
            mitre_ttps = _fallback_ttps(finding)

        # ── Post-processing: correct trivially wrong ML outputs ────────────
        # The model was trained primarily on CVSS-derived labels. When CVSS=0
        # it outputs "info" regardless of the vulnerability text. Apply
        # keyword-based corrections so the agent gets sensible classifications.
        text_for_check = (
            str(finding.get("title", "")) + " " +
            str(finding.get("description", ""))
        ).lower()

        risk_level, attack_phase = _keyword_correction(
            text_for_check, risk_level, attack_phase, cvss
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
    """Return the loaded ML classifier, or None if model file doesn't exist."""
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
    """Force reload of model on next call to get_ml_classifier()."""
    global _instance
    _instance = None


# ── Helper functions ──────────────────────────────────────────────────────────

def _finding_to_text(finding: dict) -> str:
    """Combine finding fields into a single text string for TF-IDF."""
    parts = []
    for key in ("title", "description", "service", "service_version", "cve_id", "exploit_path"):
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
    # Attack-type patterns only — no brand/version names.
    # Brand names (vsftpd, unrealircd) have non-critical variants (DoS, aux modules)
    # so rely on the attack TYPE being in the title/description.
    "backdoor", "remote code exec", "arbitrary code exec", "rce",
    "command exec", "command inject", "unauthenticated rce",
    "buffer overflow", "heap overflow", "use-after-free",
    "zero-day", "0-day", "eternalblue",
    "ms17-010", "shellshock", "log4shell", "log4j",
]

_HIGH_KEYWORDS = [
    "sql injection", "sqli", "privilege escalat", "privesc",
    "authentication bypass", "auth bypass", "ssrf", "xxe",
    "remote file inclus", "deserialization", "code inject",
    "path traversal", "directory traversal", "ldap inject",
    "xml inject", "os command", "xss stored", "csrf bypass",
]

_EXPLOIT_PHASE_KEYWORDS = [
    "backdoor", "remote code exec", "rce", "command exec",
    "buffer overflow", "exploit", "injection", "sqli",
    "authentication bypass", "auth bypass", "deserializ",
]

_POST_EXPLOIT_PHASE_KEYWORDS = [
    "privilege escalat", "privesc", "credential dump",
    "local privilege", "kernel exploit", "sudo exploit",
]


def _keyword_correction(
    text: str,
    risk_level: str,
    attack_phase: str,
    cvss: float,
) -> tuple[str, str]:
    """
    Post-process ML outputs to fix trivially wrong predictions.

    The model maps CVSS → risk_level, so CVSS=0 always outputs "info".
    When the text clearly describes a dangerous vulnerability, override.
    """
    corrected_risk = risk_level
    corrected_phase = attack_phase

    # ── Risk level correction ──────────────────────────────────────────────
    if risk_level in ("info", "low") and cvss == 0.0:
        if any(kw in text for kw in _CRITICAL_KEYWORDS):
            corrected_risk = "critical"
        elif any(kw in text for kw in _HIGH_KEYWORDS):
            corrected_risk = "high"

    # ── Attack phase correction ────────────────────────────────────────────
    # "impact" is for destructive actions (DoS, data destruction), not for
    # exploit-type vulnerabilities.
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
