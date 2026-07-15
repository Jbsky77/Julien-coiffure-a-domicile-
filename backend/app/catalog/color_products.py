"""Curated professional colour catalogue.

This module is deliberately structured application data: the source Markdown is
never parsed at runtime. Only concrete references explicitly present in the
verified catalogue are selectable.
"""
from __future__ import annotations

import hashlib
import re
import unicodedata


CATEGORIES = [
    "Coloration permanente",
    "Coloration demi-permanente / ton sur ton",
    "Coloration temporaire / crÃ©ative",
    "DÃ©coloration / mÃ¨ches / balayage",
    "Oxydant / activateur",
    "Correcteur / booster / additif technique",
]

L = "Lâ€™OrÃ©al Professionnel"
W = "Wella Professionals"
S = "Schwarzkopf Professional"


def _slug(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _product(brand, category, range_name, product_name, *, shade_code=None,
             normalized_shade_code=None, shade_name=None, format=None,
             stock_unit="unitÃ©", package_amount=None, package_amount_unit=None,
             developer_percent=None, developer_volume=None, subrange=None,
             source_url=None):
    stable = "|".join(str(x or "") for x in (
        brand, category, range_name, subrange, product_name, shade_code, format,
        developer_percent, developer_volume,
    ))
    suffix = hashlib.sha1(stable.casefold().encode("utf-8")).hexdigest()[:10]
    return {
        "id": f"cat_{_slug(brand)[:10]}_{_slug(range_name)[:18]}_{suffix}",
        "brand": brand,
        "normalizedCategory": category,
        "range": range_name,
        "subrange": subrange,
        "productName": product_name,
        "shadeCode": shade_code,
        "normalizedShadeCode": normalized_shade_code,
        "shadeName": shade_name,
        "format": format,
        "developerPercent": developer_percent,
        "developerVolume": developer_volume,
        "ean": None,
        "manufacturerReference": None,
        "sourceUrl": source_url,
        "stockUnit": stock_unit,
        "packageAmount": package_amount,
        "packageAmountUnit": package_amount_unit,
        "active": True,
    }


PRODUCTS = []


def _add_variants(brand, category, range_name, product_name, codes, *,
                  names=None, format=None, stock_unit="tube",
                  package_amount=None, package_amount_unit=None, subrange=None):
    names = names or {}
    for code in codes:
        PRODUCTS.append(_product(
            brand, category, range_name, product_name,
            shade_code=code, shade_name=names.get(code), format=format,
            stock_unit=stock_unit, package_amount=package_amount,
            package_amount_unit=package_amount_unit, subrange=subrange,
        ))


# L'OrÃ©al Professionnel â€” concrete variants only.
majirel_names = {
    "1": "Noir", "3": "ChÃ¢tain foncÃ©", "4": "ChÃ¢tain", "5": "ChÃ¢tain clair",
    "6": "Blond foncÃ©", "7": "Blond", "8": "Blond clair",
    "9": "Blond trÃ¨s clair", "10": "Blond trÃ¨s trÃ¨s clair",
    "4.3": "ChÃ¢tain dorÃ©", "5.3": "ChÃ¢tain clair dorÃ©",
    "6.3": "Blond foncÃ© dorÃ©", "7.3": "Blond dorÃ©",
    "8.3": "Blond clair dorÃ©", "9.3": "Blond trÃ¨s clair dorÃ©",
}
for code, name in majirel_names.items():
    PRODUCTS.append(_product(
        L, CATEGORIES[0], "Majirel", "Majirel", shade_code=code,
        normalized_shade_code=(f"{code}/0" if code in {"1", "3", "4", "5", "6", "7", "8", "9", "10"} else code),
        shade_name=name, format="60 ml", stock_unit="tube",
        package_amount=60, package_amount_unit="ml",
    ))
_add_variants(L, CATEGORIES[5], "Majirel Booster", "Majirel Booster", ["Bleu", "Violet", "Vert", "Jaune", "Orange", "Rouge"], stock_unit="tube")
PRODUCTS.append(_product(L, CATEGORIES[3], "Majicontrast", "Majicontrast", stock_unit="tube"))
PRODUCTS.append(_product(L, CATEGORIES[3], "Base Contrast", "Base Contrast", stock_unit="tube"))
PRODUCTS.append(_product(L, CATEGORIES[0], "iNOA", "iNOA Clear", format="60 g", stock_unit="tube", package_amount=60, package_amount_unit="g"))
_add_variants(L, CATEGORIES[5], "iNOA Boosters", "Booster iNOA", ["Bleu", "Violet", "Vert", "Jaune", "Orange", "Rouge"], stock_unit="tube")

dia_codes = "5.07 5.11 5.12 5.31 5.4 5.66 5.8 6.11 6.13 6.23 6.28 6.3 6.34 6.35 6.45 6.46 6.64 6.66 6.8 7.01 7.11 7.12 7.13 7.18 7.23 7.3 7.31 7.4 7.40 7.43 7.8 8.1 8.11 8.18 8.21 8.23 8.24 8.28 8.3 8.34 8.43 9.01 9.02 9.03 9.11 9.12 9.13 9.18 9.2 9.21 9.31 9.82 10.01 10.02 10.12 10.13 10.18 10.21 10.22 10.23 10.24 10.32 10.82".split()
_add_variants(L, CATEGORIES[1], "Dia Light", "Dia Light", ["Clear", *dia_codes], format="60 ml", package_amount=60, package_amount_unit="ml")
_add_variants(L, CATEGORIES[5], "Dia Light Boosters", "Booster Dia Light", ["Bleu", "Violet", "Vert", "Jaune", "Orange", "Rouge"], stock_unit="tube")
PRODUCTS.append(_product(L, CATEGORIES[1], "Dia Color", "Dia Color", format="60 ml", stock_unit="tube", package_amount=60, package_amount_unit="ml"))

for name, fmt, amount, unit in [
    ("PÃ¢te DÃ©colorante 7 Tons", "500 g", 500, "g"),
    ("Poudre Multi-Techniques 8 Tons", "500 g", 500, "g"),
    ("Poudre Multi-Techniques 9 Tons", "500 g", 500, "g"),
    ("Poudre Multi-Techniques 9 Bonder Inside", "500 g", 500, "g"),
    ("Baume DÃ©colorant Violet 8 Tons Bonder Inside", "500 g", 500, "g"),
]:
    PRODUCTS.append(_product(L, CATEGORIES[3], "Blond Studio", name, format=fmt, stock_unit="pot", package_amount=amount, package_amount_unit=unit))
for name in ["Blond Studio Platinium Plus", "Blond Studio Platinium Ammonia-Free", "Efassor"]:
    PRODUCTS.append(_product(L, CATEGORIES[3], "Blond Studio", name, stock_unit="unitÃ©"))

def _developer(brand, range_name, name, percent=None, volumes=None, fmt=None, amount=None):
    PRODUCTS.append(_product(
        brand, CATEGORIES[4], range_name, name, format=fmt, stock_unit="flacon",
        package_amount=amount, package_amount_unit="ml" if amount else None,
        developer_percent=percent, developer_volume=volumes,
    ))

for vol, pct in [(6, "1,8 %"), (9, "2,7 %"), (15, "4,5 %")]:
    _developer(L, "Dia Activateur", f"Dia Activateur {vol} volumes", pct, vol, "1 000 ml", 1000)
for vol, pct in [(10, "3 %"), (20, "6 %"), (30, "9 %")]:
    _developer(L, "iNOA Oxydant Riche", f"iNOA Oxydant Riche {vol} volumes", pct, vol, "1 000 ml", 1000)
for vol, pct in [(12.5, None), (20, "6 %"), (30, "9 %"), (40, "12 %")]:
    _developer(L, "Oxydant CrÃ¨me", f"Oxydant CrÃ¨me {str(vol).replace('.', ',')} volumes", pct, vol, "1 000 ml", 1000)
for family in ["Huile-DÃ©veloppeur", "Nutri-DÃ©veloppeur"]:
    for vol in (20, 30):
        _developer(L, "Blond Studio Developer", f"Blond Studio {family} {vol} volumes", volumes=vol, fmt="1 000 ml", amount=1000)
PRODUCTS.append(_product(L, CATEGORIES[5], "Metal Detox", "Spray prÃ©-traitement Metal Detox", format="500 ml", stock_unit="flacon", package_amount=500, package_amount_unit="ml"))
_add_variants(L, CATEGORIES[2], "Hair Touch Up", "Hair Touch Up", ["Noir", "Brun", "ChÃ¢tain", "Acajou", "Blond dorÃ©"], stock_unit="flacon")

# Wella Professionals.
PRODUCTS.append(_product(W, CATEGORIES[0], "Koleston Perfect ME+", "Koleston Perfect ME+", format="60 ml", stock_unit="tube", package_amount=60, package_amount_unit="ml"))
illumina_names = {"8/36": "Luminescent Clay", "9/37": "Blonde Glow", "7/42": "Copper Blush", "7/75": "Brunette Shimmer"}
_add_variants(W, CATEGORIES[0], "Illumina Color", "Illumina Color", list(illumina_names), names=illumina_names, format="60 ml", package_amount=60, package_amount_unit="ml")
_add_variants(W, CATEGORIES[0], "Color Xpress", "Color Xpress", "2 3 4 5 5/1 6 6/02 6/07 7".split(), stock_unit="tube")
PRODUCTS.append(_product(W, CATEGORIES[0], "Supernatural Color", "Supernatural Color", format="120 g", stock_unit="tube", package_amount=120, package_amount_unit="g"))
color_touch = "2/0 3/0 4/0 5/0 6/0 6/05 7/0 7/03 8/0 8/05 9/03 10/0 10/05 5/1 5/3 5/37 6/3 6/35 6/37 7/1 7/3 8/3 8/35 8/38 9/16 9/36 5/97 7/86 7/89 7/97 8/81 9/86 9/96 9/97 10/81 4/71 4/77 5/71 5/73 6/7 6/71 6/75 6/77 7/7 7/71 7/73 7/75 8/71 8/73 9/73 9/75 10/73 3/66 3/68 4/57 4/6 5/4 5/5 6/4 6/47 7/4 7/43 7/47 8/41 8/43 10/6".split()
_add_variants(W, CATEGORIES[1], "Color Touch", "Color Touch", color_touch, format="60 ml", package_amount=60, package_amount_unit="ml")
_add_variants(W, CATEGORIES[5], "Color Touch Special Mix", "Color Touch Special Mix", "0/00 0/34 0/45 0/68 0/88".split(), format="60 ml", package_amount=60, package_amount_unit="ml")
PRODUCTS.append(_product(W, CATEGORIES[1], "Shinefinity Color Glaze", "Shinefinity 00/00 Clear", shade_code="00/00", shade_name="Clear", stock_unit="flacon"))
for name in ["Caramel Glaze", "Chocolate Touch", "Copper Glow", "Golden Gloss", "Rose Blaze", "Blue", "Lilac Frost", "Mint", "Pearl Blonde", "Pink", "Red"]:
    PRODUCTS.append(_product(W, CATEGORIES[2], "Color Fresh Mask", "Color Fresh Mask", shade_code=name, shade_name=name, stock_unit="flacon"))
for name, fmt, amount in [("BlondorPlex Poudre DÃ©colorante 9", "400 g", 400), ("Blondor Multi Blonde 7", "400 g", 400), ("BlondorPlex Masque NÂº2", "500 ml", 500)]:
    PRODUCTS.append(_product(W, CATEGORIES[3], "Blondor", name, format=fmt, stock_unit="pot", package_amount=amount, package_amount_unit="g" if "g" in fmt else "ml"))
for name in ["Blondor Soft Blonde 7", "Blondor Freelights"]:
    PRODUCTS.append(_product(W, CATEGORIES[3], "Blondor", name, stock_unit="pot"))
for vol, pct in [(6, "1,9 %"), (13, "4 %"), (20, "6 %"), (30, "9 %"), (40, "12 %")]:
    _developer(W, "Welloxon Perfect", f"Welloxon Perfect {vol} volumes", pct, vol)
for name, pct, vol in [("Color Touch Emulsion 1,9 %", "1,9 %", 6), ("Color Touch Emulsion 4 %", "4 %", 13), ("Color Touch Plus Emulsion 4 %", "4 %", 13)]:
    _developer(W, "Ã‰mulsions Color Touch", name, pct, vol)
for pct in ("6 %", "9 %", "12 %"):
    _developer(W, "Freelights Developer", f"Freelights Developer {pct}", pct)
for name in ["Shinefinity Activateur Bol & Pinceau", "Shinefinity Activateur Flacon"]:
    _developer(W, "Shinefinity Activateur", name)
for name in ["WellaPlex NÂº1 Bond Maker", "WellaPlex NÂº2 Bond Stabilizer", "WellaPlex NÂº3 Hair Stabilizer", "Color.id Additive", "Color Renew"]:
    PRODUCTS.append(_product(W, CATEGORIES[5], "Additifs techniques Wella", name, stock_unit="flacon"))

# Schwarzkopf Professional.
PRODUCTS.append(_product(S, CATEGORIES[0], "IGORA ZERO AMM", "IGORA ZERO AMM", format="60 ml", stock_unit="tube", package_amount=60, package_amount_unit="ml"))
PRODUCTS.append(_product(S, CATEGORIES[0], "IGORA COLOR10", "IGORA COLOR10", format="60 ml", stock_unit="tube", package_amount=60, package_amount_unit="ml"))
_add_variants(S, CATEGORIES[0], "IGORA ROYAL Highlifts", "IGORA ROYAL Highlifts", "10-0 10-1 10-21 10-4 12-0 12-1 12-2 12-19 12-21 12-22 12-49 12-91".split(), format="60 ml", package_amount=60, package_amount_unit="ml")
_add_variants(S, CATEGORIES[5], "IGORA VIBRANCE Boosters", "IGORA VIBRANCE Booster", "0-11 0-22 0-33 0-55 0-77 0-88 0-89 0-99".split(), format="60 ml", package_amount=60, package_amount_unit="ml")
PRODUCTS.append(_product(S, CATEGORIES[5], "IGORA VIBRANCE", "IGORA VIBRANCE Clear/Diluant", shade_code="0-00", shade_name="Clear", format="60 ml", stock_unit="flacon", package_amount=60, package_amount_unit="ml"))
chroma = {"6-46": "Cacao Brut", "6-88": "Rouge Rubis", "7-77": "CuivrÃ© Ã‰tincelant", "8-46": "Caramel GlacÃ©", "8-19": "Lavande GivrÃ©", "9-12": "Gris Platine", "9.5-1": "Argent PerlÃ©", "9.5-19": "Rose PoudrÃ©", "9.5-4": "Beige Sable", "Rouge": "Rouge", "Rose": "Rose", "Violet": "Violet", "Bleu": "Bleu", "Clear": "Clear"}
_add_variants(S, CATEGORIES[2], "Chroma ID", "Chroma ID", list(chroma), names=chroma, stock_unit="pot")
for name in ["Poudre DÃ©colorante Premium 9+", "Argile DÃ©colorante"]:
    PRODUCTS.append(_product(S, CATEGORIES[3], "BLONDME", name, stock_unit="pot"))
PRODUCTS.append(_product(S, CATEGORIES[5], "BLONDME", "Additif Neutralisant BLONDME", stock_unit="flacon"))
for name in ["IGORA VARIO BLOND Super Plus", "IGORA VARIO BLOND Plus", "IGORA VARIO BLOND Cool Lift"]:
    PRODUCTS.append(_product(S, CATEGORIES[3], "IGORA VARIO BLOND", name, stock_unit="pot"))
for vol, pct in [(10, "3 %"), (20, "6 %"), (30, "9 %"), (40, "12 %")]:
    _developer(S, "IGORA ROYAL Oil Developer", f"IGORA ROYAL Oil Developer {pct} â€” {vol} volumes", pct, vol)
for name, pct, vol in [("Gel Activateur 1,9 %", "1,9 %", 6), ("Lotion Activatrice 1,9 %", "1,9 %", 6), ("Lotion Activatrice 4 %", "4 %", 13)]:
    _developer(S, "IGORA VIBRANCE Activateur", name, pct, vol)
for pct, vol in [("2 %", 7), ("6 %", 20), ("9 %", 30), ("12 %", 40)]:
    _developer(S, "BLONDME RÃ©vÃ©lateur Premium", f"RÃ©vÃ©lateur Premium BLONDME {pct} â€” {vol} volumes", pct, vol, "1 000 ml", 1000)
for name in ["Bond Enforcing Color Remover", "Goodbye Yellow", "Goodbye Orange"]:
    PRODUCTS.append(_product(S, CATEGORIES[5], "Correcteurs techniques", name, stock_unit="flacon"))

PRODUCT_BY_ID = {product["id"]: product for product in PRODUCTS}
BRANDS = [L, W, S]
