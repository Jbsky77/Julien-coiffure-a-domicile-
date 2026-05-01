"""String / address formatting helpers."""
import re
import unicodedata


def normalize_address(address: str) -> str:
    """Normalize an address for cache lookup.

    Strips accents, lowercases, collapses whitespace and removes most punctuation.
    Two addresses that only differ in casing/spacing/accents collapse to the same
    cache key, avoiding redundant Nominatim requests.
    """
    if not address:
        return ""
    # Unicode NFD + drop combining marks (accents)
    s = unicodedata.normalize("NFD", address)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    # Replace common separators with spaces, then drop remaining punctuation
    s = re.sub(r"[,;:.\-/_]+", " ", s)
    s = re.sub(r"[^a-z0-9 ]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s
