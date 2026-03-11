"""
Phase 11 — CVSS v3.1 Base Score Calculator

Reference: https://www.first.org/cvss/v3.1/specification-document

Supports:
  - Full Base Score calculation from individual metrics
  - Vector string parsing ("AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")
  - Severity label (CRITICAL / HIGH / MEDIUM / LOW / NONE)
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# ── Metric weight tables (CVSS v3.1) ──────────────────────────────────────────

_AV = {"N": 0.85, "A": 0.62, "L": 0.55, "P": 0.20}  # Attack Vector
_AC = {"L": 0.77, "H": 0.44}                          # Attack Complexity
_UI = {"N": 0.85, "R": 0.62}                          # User Interaction
_CIA = {"N": 0.00, "L": 0.22, "H": 0.56}              # C / I / A impact

# Privileges Required — value depends on Scope
_PR_UNCHANGED = {"N": 0.85, "L": 0.62, "H": 0.27}
_PR_CHANGED    = {"N": 0.85, "L": 0.68, "H": 0.50}

# Short → full name mappings for display
_AV_NAMES  = {"N": "Network", "A": "Adjacent", "L": "Local", "P": "Physical"}
_AC_NAMES  = {"L": "Low", "H": "High"}
_PR_NAMES  = {"N": "None", "L": "Low", "H": "High"}
_UI_NAMES  = {"N": "None", "R": "Required"}
_S_NAMES   = {"U": "Unchanged", "C": "Changed"}
_CIA_NAMES = {"N": "None", "L": "Low", "H": "High"}

# Vector string key → attribute name
_KEY_MAP = {
    "AV": "attack_vector",
    "AC": "attack_complexity",
    "PR": "privileges_required",
    "UI": "user_interaction",
    "S":  "scope",
    "C":  "confidentiality",
    "I":  "integrity",
    "A":  "availability",
}


def _roundup(value: float) -> float:
    """CVSS v3.1 Roundup: rounds up to one decimal place."""
    return math.ceil(value * 10) / 10


# ── CvssVector ─────────────────────────────────────────────────────────────────

@dataclass
class CvssVector:
    """
    Holds all 8 CVSS v3.1 Base metric values as single-character codes.

    Defaults represent a moderate remote exploit with partial impact.
    """
    attack_vector:        str = "N"   # N | A | L | P
    attack_complexity:    str = "L"   # L | H
    privileges_required:  str = "N"   # N | L | H
    user_interaction:     str = "N"   # N | R
    scope:                str = "U"   # U | C
    confidentiality:      str = "N"   # N | L | H
    integrity:            str = "N"   # N | L | H
    availability:         str = "N"   # N | L | H

    def to_vector_string(self) -> str:
        """Return the canonical CVSS v3.1 vector string."""
        return (
            f"CVSS:3.1/AV:{self.attack_vector}/AC:{self.attack_complexity}"
            f"/PR:{self.privileges_required}/UI:{self.user_interaction}"
            f"/S:{self.scope}/C:{self.confidentiality}"
            f"/I:{self.integrity}/A:{self.availability}"
        )

    def to_display_dict(self) -> dict:
        """Return a human-readable dict of metric names and values."""
        return {
            "Attack Vector":       _AV_NAMES.get(self.attack_vector, self.attack_vector),
            "Attack Complexity":   _AC_NAMES.get(self.attack_complexity, self.attack_complexity),
            "Privileges Required": _PR_NAMES.get(self.privileges_required, self.privileges_required),
            "User Interaction":    _UI_NAMES.get(self.user_interaction, self.user_interaction),
            "Scope":               _S_NAMES.get(self.scope, self.scope),
            "Confidentiality":     _CIA_NAMES.get(self.confidentiality, self.confidentiality),
            "Integrity":           _CIA_NAMES.get(self.integrity, self.integrity),
            "Availability":        _CIA_NAMES.get(self.availability, self.availability),
        }


# ── CvssCalculator ─────────────────────────────────────────────────────────────

class CvssCalculator:
    """
    CVSS v3.1 Base Score calculator.

    Usage:
        calc = CvssCalculator()
        score = calc.calculate(CvssVector(
            attack_vector="N", attack_complexity="L",
            privileges_required="N", user_interaction="N",
            scope="U", confidentiality="H", integrity="H", availability="H"
        ))
        # → 9.8

        score = calc.from_vector_string("AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")
        # → 9.8
    """

    def calculate(self, vector: CvssVector) -> float:
        """
        Compute the CVSS v3.1 Base Score.

        Formula (from spec):
          ISCBase = 1 - (1-ImpactC)*(1-ImpactI)*(1-ImpactA)
          If scope == UNCHANGED:
            Impact = 6.42 * ISCBase
          Else (scope == CHANGED):
            Impact = 7.52 * (ISCBase - 0.029) - 3.25 * (ISCBase - 0.02)^15

          Exploitability = 8.22 * AV * AC * PR * UI

          If Impact <= 0:
            BaseScore = 0
          Elif scope == UNCHANGED:
            BaseScore = Roundup(min(Impact + Exploitability, 10))
          Else:
            BaseScore = Roundup(min(1.08 * (Impact + Exploitability), 10))
        """
        av = _AV[vector.attack_vector]
        ac = _AC[vector.attack_complexity]
        pr_table = _PR_CHANGED if vector.scope == "C" else _PR_UNCHANGED
        pr = pr_table[vector.privileges_required]
        ui = _UI[vector.user_interaction]
        isc = _CIA[vector.confidentiality]
        isi = _CIA[vector.integrity]
        isa = _CIA[vector.availability]

        isc_base = 1.0 - (1.0 - isc) * (1.0 - isi) * (1.0 - isa)

        if vector.scope == "U":
            impact = 6.42 * isc_base
        else:
            impact = 7.52 * (isc_base - 0.029) - 3.25 * ((isc_base - 0.02) ** 15)

        if impact <= 0:
            return 0.0

        exploitability = 8.22 * av * ac * pr * ui

        if vector.scope == "U":
            raw = min(impact + exploitability, 10.0)
        else:
            raw = min(1.08 * (impact + exploitability), 10.0)

        return _roundup(raw)

    def from_vector_string(self, vector_string: str) -> float:
        """
        Parse a CVSS v3.1 vector string and return the Base Score.

        Accepts strings with or without the "CVSS:3.1/" prefix.
        Example: "AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" → 9.8
        """
        vector = self.parse_vector_string(vector_string)
        return self.calculate(vector)

    @staticmethod
    def parse_vector_string(vector_string: str) -> CvssVector:
        """Parse a CVSS v3.1 vector string into a CvssVector object."""
        s = vector_string.strip()
        if s.upper().startswith("CVSS:3.1/") or s.upper().startswith("CVSS:3.0/"):
            s = s[9:]

        parts = s.split("/")
        kwargs: dict[str, str] = {}
        for part in parts:
            if ":" not in part:
                continue
            key, val = part.split(":", 1)
            attr = _KEY_MAP.get(key.upper())
            if attr:
                kwargs[attr] = val.upper()

        return CvssVector(**kwargs)

    @staticmethod
    def severity_label(score: float) -> str:
        """Return CRITICAL / HIGH / MEDIUM / LOW / NONE for a Base Score."""
        if score >= 9.0:
            return "CRITICAL"
        elif score >= 7.0:
            return "HIGH"
        elif score >= 4.0:
            return "MEDIUM"
        elif score > 0.0:
            return "LOW"
        return "NONE"

    @staticmethod
    def severity_color(score: float) -> str:
        """Return a hex color code for severity (for HTML reports)."""
        if score >= 9.0:
            return "#ff4444"   # critical red
        elif score >= 7.0:
            return "#ff8c42"   # high orange
        elif score >= 4.0:
            return "#ffd43b"   # medium yellow
        elif score > 0.0:
            return "#69db7c"   # low green
        return "#8b949e"       # none grey


# Convenience singleton
cvss = CvssCalculator()
