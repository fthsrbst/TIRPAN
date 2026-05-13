"""
TIRPAN — Finding Classifier

LLM zero-shot sınıflandırıcı: her finding'i gerçek zamanlı olarak
saldırı fazı, varlık kategorisi, MITRE ATT&CK TTP ve risk seviyesine
göre etiketler.

Akış:
  BaseSpecializedAgent.publish_finding()
      → FindingClassifier.classify()
          → LLM (structured JSON prompt)
          → fallback: rule-based heuristic
      → finding dict'e "_cls" bloğu eklenir
      → Brain + UI bu bloğu görür

Tasarım kararları:
  - LLM çağrısı timeout'lanabilir (default 10 s); timeout/hata durumunda
    rule-based fallback devreye girer — agent döngüsü asla bloklanmaz.
  - Sonuçlar hash bazlı in-memory cache'e yazılır (max 512 kayıt).
  - Bütün kategori değerleri ingilizce sabit string'ler; UI filtreler için
    normalize edilmiş anahtar olarak kullanılır.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from dataclasses import asdict, dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# ── Kategori sabitleri ─────────────────────────────────────────────────────────

ATTACK_PHASES = [
    "reconnaissance",
    "scanning",
    "exploitation",
    "post_exploitation",
    "lateral_movement",
    "exfiltration",
    "impact",
    "other",
]

ASSET_CATEGORIES = [
    "network",
    "web_application",
    "authentication",
    "operating_system",
    "service",
    "data",
    "other",
]

RISK_LEVELS = ["critical", "high", "medium", "low", "info"]

# ── Kural tabanlı fallback sözlükleri ─────────────────────────────────────────

_TYPE_TO_PHASE: dict[str, str] = {
    "host_discovered":   "scanning",
    "host":              "scanning",
    "port_open":         "scanning",
    "service_detected":  "scanning",
    "os_detected":       "scanning",
    "vulnerability":     "scanning",
    "exploit_attempt":   "exploitation",
    "exploit_success":   "exploitation",
    "exploit_failure":   "exploitation",
    "flag":              "post_exploitation",
    "session":           "post_exploitation",
    "credential":        "post_exploitation",
    "loot":              "post_exploitation",
    "lateral":           "lateral_movement",
    "exfil":             "exfiltration",
    "data_exfiltrated":  "exfiltration",
    "report_finding":    "other",
}

_TYPE_TO_ASSET: dict[str, str] = {
    "host_discovered":   "network",
    "host":              "network",
    "port_open":         "network",
    "service_detected":  "service",
    "os_detected":       "operating_system",
    "vulnerability":     "service",
    "exploit_attempt":   "service",
    "exploit_success":   "service",
    "credential":        "authentication",
    "loot":              "data",
    "flag":              "data",
    "session":           "operating_system",
}

_TYPE_TO_RISK: dict[str, str] = {
    "exploit_success":   "critical",
    "credential":        "high",
    "loot":              "high",
    "flag":              "high",
    "vulnerability":     "medium",
    "exploit_failure":   "low",
    "port_open":         "low",
    "service_detected":  "low",
    "host_discovered":   "info",
    "host":              "info",
    "os_detected":       "info",
    "session":           "critical",
}

_KNOWN_TTPS: dict[str, list[str]] = {
    "exploit_success": ["T1190", "T1210"],
    "exploit_attempt": ["T1190", "T1210"],
    "credential":      ["T1003", "T1552"],
    "loot":            ["T1005", "T1083"],
    "flag":            ["T1083"],
    "session":         ["T1059"],
    "lateral":         ["T1021"],
    "host_discovered": ["T1018"],
    "port_open":       ["T1046"],
    "vulnerability":   ["T1190"],
    "exfil":           ["T1048"],
}


# ── FindingClassification ─────────────────────────────────────────────────────

@dataclass
class FindingClassification:
    """Bir finding için üretilen sınıflandırma etiketi."""

    attack_phase:     str = "other"
    asset_category:   str = "other"
    mitre_ttps:       list[str] = field(default_factory=list)
    risk_level:       str = "info"
    summary:          str = ""
    source:           str = "llm"   # "llm" | "rule"

    def to_dict(self) -> dict:
        return asdict(self)


# ── FindingClassifier ─────────────────────────────────────────────────────────

class FindingClassifier:
    """
    LLM tabanlı gerçek zamanlı finding sınıflandırıcı.

    Kullanım:
        classifier = FindingClassifier()
        cls = await classifier.classify(finding_dict)
        enriched = {**finding_dict, "_cls": cls.to_dict()}
    """

    _CACHE_MAX = 512
    _LLM_TIMEOUT = 10.0   # saniye

    _SYSTEM_PROMPT = (
        "You are a cybersecurity analyst. Given a pentest finding as JSON, "
        "return ONLY a JSON object with these exact keys:\n"
        '  "attack_phase"   : one of ' + str(ATTACK_PHASES) + "\n"
        '  "asset_category" : one of ' + str(ASSET_CATEGORIES) + "\n"
        '  "mitre_ttps"     : list of MITRE ATT&CK technique IDs (e.g. ["T1190"]), '
        "or empty list if unknown\n"
        '  "risk_level"     : one of ' + str(RISK_LEVELS) + "\n"
        '  "summary"        : one concise English sentence describing the finding\n'
        "No extra keys. No explanations. Only the JSON object."
    )

    def __init__(self) -> None:
        self._cache: dict[str, FindingClassification] = {}
        self._cache_order: list[str] = []

    # ── Public API ────────────────────────────────────────────────────────────

    async def classify(self, finding: dict) -> FindingClassification:
        """
        Finding dict'ini sınıflandır.

        LLM başarılı olursa "llm" kaynaklı sonuç döner.
        Timeout / hata durumunda rule-based fallback devreye girer.
        Sonuç cache'lenir; aynı fingerprint için ikinci kez LLM çağrısı yapılmaz.
        """
        key = self._fingerprint(finding)
        if key in self._cache:
            return self._cache[key]

        result = await self._classify_with_llm(finding)
        self._cache_set(key, result)
        return result

    # ── LLM sınıflandırma ────────────────────────────────────────────────────

    async def _classify_with_llm(self, finding: dict) -> FindingClassification:
        try:
            from core.llm_client import llm_router  # lazy import — döngüsel bağımlılık yok

            compact = self._compact_finding(finding)
            messages = [
                {"role": "system", "content": self._SYSTEM_PROMPT},
                {"role": "user",   "content": f"Finding:\n{compact}"},
            ]
            raw = await asyncio.wait_for(
                llm_router.chat(messages, stream=False),
                timeout=self._LLM_TIMEOUT,
            )
            return self._parse_llm_response(raw)
        except asyncio.TimeoutError:
            logger.debug("FindingClassifier: LLM timeout, falling back to rules")
        except Exception as exc:
            logger.debug("FindingClassifier: LLM error (%s), falling back to rules", exc)

        return self._rule_based(finding)

    @staticmethod
    def _compact_finding(finding: dict) -> str:
        """
        Finding dict'ini LLM'e göndermek için kompakt JSON string'e çevir.
        Büyük blob'ları (output, raw_data) kırpar.
        """
        slim: dict = {}
        skip_keys = {"raw_output", "raw_data", "output_blob"}
        for k, v in finding.items():
            if k in skip_keys:
                continue
            val_str = str(v) if not isinstance(v, (str, int, float, bool, list, dict)) else v
            slim[k] = val_str

        result = json.dumps(slim, ensure_ascii=False, default=str)
        if len(result) > 800:
            result = result[:800] + "…}"
        return result

    @staticmethod
    def _parse_llm_response(raw: str) -> FindingClassification:
        """LLM yanıtından JSON'u çıkar ve doğrula."""
        text = (raw or "").strip()

        # Fenced veya düz JSON
        m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if m:
            text = m.group(1)
        else:
            start = text.find("{")
            end   = text.rfind("}")
            if start != -1 and end != -1:
                text = text[start:end + 1]

        data = json.loads(text)   # parse hatası → caller'a yayılır → rule fallback

        attack_phase   = data.get("attack_phase", "other")
        asset_category = data.get("asset_category", "other")
        risk_level     = data.get("risk_level", "info")
        mitre_ttps     = data.get("mitre_ttps", [])
        summary        = data.get("summary", "")

        # Güvenlik: sadece bilinen değerlere izin ver
        if attack_phase   not in ATTACK_PHASES:    attack_phase   = "other"
        if asset_category not in ASSET_CATEGORIES: asset_category = "other"
        if risk_level     not in RISK_LEVELS:      risk_level     = "info"
        if not isinstance(mitre_ttps, list):       mitre_ttps     = []
        mitre_ttps = [t for t in mitre_ttps if isinstance(t, str) and re.match(r"T\d{4}", t)]

        return FindingClassification(
            attack_phase   = attack_phase,
            asset_category = asset_category,
            mitre_ttps     = mitre_ttps,
            risk_level     = risk_level,
            summary        = str(summary)[:300],
            source         = "llm",
        )

    # ── Rule-based fallback ───────────────────────────────────────────────────

    @staticmethod
    def _rule_based(finding: dict) -> FindingClassification:
        """
        Finding type ve mevcut alanlara bakarak deterministik sınıflandırma üret.
        LLM'in başarısız olduğu durumlarda kullanılır.
        """
        ftype = str(finding.get("type", "")).lower()

        attack_phase   = _TYPE_TO_PHASE.get(ftype, "other")
        asset_category = _TYPE_TO_ASSET.get(ftype, "other")
        mitre_ttps     = list(_KNOWN_TTPS.get(ftype, []))

        # Risk: önce CVSS tabanlı bakış
        risk_level = _rule_risk_from_finding(finding) or _TYPE_TO_RISK.get(ftype, "info")

        summary = _rule_summary(finding)

        return FindingClassification(
            attack_phase   = attack_phase,
            asset_category = asset_category,
            mitre_ttps     = mitre_ttps,
            risk_level     = risk_level,
            summary        = summary,
            source         = "rule",
        )

    # ── Cache helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def _fingerprint(finding: dict) -> str:
        blob = json.dumps(finding, sort_keys=True, default=str)
        return hashlib.md5(blob.encode(), usedforsecurity=False).hexdigest()

    def _cache_set(self, key: str, value: FindingClassification) -> None:
        if key in self._cache:
            return
        if len(self._cache_order) >= self._CACHE_MAX:
            oldest = self._cache_order.pop(0)
            self._cache.pop(oldest, None)
        self._cache[key] = value
        self._cache_order.append(key)


# ── Risk heuristic yardımcıları ───────────────────────────────────────────────

def _rule_risk_from_finding(finding: dict) -> str | None:
    """CVSS skoru veya explicit severity alanı varsa kullan."""
    cvss = finding.get("cvss") or finding.get("cvss_score")
    try:
        score = float(cvss)
        if score >= 9.0: return "critical"
        if score >= 7.0: return "high"
        if score >= 4.0: return "medium"
        if score > 0.0:  return "low"
    except (TypeError, ValueError):
        pass

    sev = str(finding.get("severity", "")).lower()
    if sev in RISK_LEVELS:
        return sev
    return None


def _rule_summary(finding: dict) -> str:
    """Finding'den kısa insan-okunur özet üret."""
    ftype = finding.get("type", "unknown")
    host  = finding.get("host") or finding.get("ip") or finding.get("host_ip", "")
    port  = finding.get("port", "")
    svc   = finding.get("service", "")
    cve   = finding.get("cve") or finding.get("cve_id", "")
    title = finding.get("title", "")

    parts = [str(ftype).replace("_", " ").title()]
    if title:
        parts.append(f'"{title}"')
    if cve:
        parts.append(cve)
    if host:
        loc = str(host)
        if port:
            loc += f":{port}"
        if svc:
            loc += f" ({svc})"
        parts.append(f"on {loc}")

    return " — ".join(parts)


# ── Singleton ─────────────────────────────────────────────────────────────────

finding_classifier = FindingClassifier()
