"""French phone normalization and validation."""
import re
from typing import Optional


def normalize_french_phone(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    compact = re.sub(r"[\\s.()\\-]", "", str(value).strip())
    if compact.startswith("+33"):
        compact = "0" + compact[3:]
    elif compact.startswith("0033"):
        compact = "0" + compact[4:]
    return compact if re.fullmatch(r"0[67]\\d{8}", compact) else None


def format_french_phone(value: Optional[str]) -> str:
    normalized = normalize_french_phone(value)
    return " ".join(normalized[i:i + 2] for i in range(0, 10, 2)) if normalized else "Téléphone invalide"


def phone_payload(value: Optional[str]) -> dict:
    normalized = normalize_french_phone(value)
    return {"phone_valid": normalized is not None, "phone_normalized": normalized, "phone_display": format_french_phone(value)}
