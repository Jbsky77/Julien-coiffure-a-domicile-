"""Invoice PDF generation (reportlab) — jewel & luxury style."""
import io
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

NAVY = colors.HexColor("#0A192F")
GOLD = colors.HexColor("#C5A059")
SLATE = colors.HexColor("#64748B")
LIGHT = colors.HexColor("#F1F5F9")

LOGO_PATH = Path(__file__).resolve().parent.parent / "assets" / "logo.png"

PAYMENT_LABELS = {"CB": "Carte bancaire", "CHEQUE": "Chèque", "ESPECES": "Espèces", "VIREMENT": "Virement"}


def _fmt_date(iso: str) -> str:
    from app.utils.dates import parse_iso
    d = parse_iso(iso)
    if not d:
        return iso or ""
    try:
        from zoneinfo import ZoneInfo
        d = d.astimezone(ZoneInfo("Europe/Paris"))
    except Exception:
        pass
    return d.strftime("%d/%m/%Y à %Hh%M")


def build_invoice_pdf(invoice: dict, client: dict, brand_name: str) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4

    # Header band
    c.setFillColor(NAVY)
    c.rect(0, h - 52 * mm, w, 52 * mm, fill=1, stroke=0)
    if LOGO_PATH.exists():
        c.drawImage(str(LOGO_PATH), 18 * mm, h - 46 * mm, width=38 * mm, height=38 * mm, mask="auto")
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(62 * mm, h - 24 * mm, brand_name)
    c.setFillColor(GOLD)
    c.setFont("Helvetica", 10)
    c.drawString(62 * mm, h - 31 * mm, "Coiffure à domicile — service premium")
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 14)
    num = invoice.get("invoice_number") or "Facture"
    c.drawRightString(w - 18 * mm, h - 24 * mm, f"FACTURE {num}" if num != "Facture" else "FACTURE")
    c.setFont("Helvetica", 9)
    c.setFillColor(colors.HexColor("#B8C4D4"))
    c.drawRightString(w - 18 * mm, h - 31 * mm, f"Prestation du {_fmt_date(invoice.get('date'))}")

    # Client block
    y = h - 68 * mm
    c.setFillColor(SLATE)
    c.setFont("Helvetica", 8)
    c.drawString(18 * mm, y, "FACTURÉ À")
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 12)
    name = f"{client.get('first_name','')} {client.get('last_name','')}".strip()
    c.drawString(18 * mm, y - 6 * mm, name)
    c.setFont("Helvetica", 9)
    c.setFillColor(SLATE)
    yy = y - 11 * mm
    if client.get("address"):
        c.drawString(18 * mm, yy, client["address"])
        yy -= 5 * mm
    if client.get("phone"):
        c.drawString(18 * mm, yy, client["phone"])

    # Table header
    y = h - 95 * mm
    c.setFillColor(LIGHT)
    c.rect(18 * mm, y - 2 * mm, w - 36 * mm, 9 * mm, fill=1, stroke=0)
    c.setFillColor(SLATE)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(21 * mm, y + 0.5 * mm, "PRESTATION")
    c.drawString(110 * mm, y + 0.5 * mm, "COIFFEUR(SE)")
    c.drawRightString(w - 21 * mm, y + 0.5 * mm, "PRIX")

    # Rows
    y -= 10 * mm
    c.setFont("Helvetica", 10)
    for s in invoice.get("services") or []:
        c.setFillColor(NAVY)
        c.drawString(21 * mm, y, s.get("name", ""))
        c.setFillColor(SLATE)
        c.drawString(110 * mm, y, s.get("stylist", "Julien"))
        if s.get("is_gift"):
            c.setFillColor(GOLD)
            c.drawRightString(w - 21 * mm, y, "Offerte (fidélité)")
        else:
            c.setFillColor(NAVY)
            c.drawRightString(w - 21 * mm, y, f"{s.get('price', 0):.2f} €")
        c.setStrokeColor(LIGHT)
        c.line(18 * mm, y - 3 * mm, w - 18 * mm, y - 3 * mm)
        y -= 9 * mm

    fuel = invoice.get("fuel_supplement") or 0
    if fuel > 0:
        c.setFillColor(SLATE)
        c.drawString(21 * mm, y, "Supplément déplacement")
        c.drawRightString(w - 21 * mm, y, f"{fuel:.2f} €")
        y -= 9 * mm

    # Total
    y -= 4 * mm
    c.setFillColor(NAVY)
    c.rect(w / 2, y - 5 * mm, w / 2 - 18 * mm, 14 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(w / 2 + 5 * mm, y, "TOTAL RÉGLÉ")
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 14)
    c.drawRightString(w - 22 * mm, y, f"{invoice.get('price_final', 0):.2f} €")

    # Payment info
    y -= 14 * mm
    c.setFillColor(SLATE)
    c.setFont("Helvetica", 9)
    mode = PAYMENT_LABELS.get(invoice.get("payment_mode"), invoice.get("payment_mode") or "")
    line = f"Réglée par {mode}" if mode else "Réglée"
    if invoice.get("finished_at"):
        line += f" le {_fmt_date(invoice['finished_at'])}"
    c.drawString(18 * mm, y, line)

    # Footer
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.8)
    c.line(18 * mm, 24 * mm, w - 18 * mm, 24 * mm)
    c.setFillColor(SLATE)
    c.setFont("Helvetica", 8)
    c.drawCentredString(w / 2, 18 * mm, f"{brand_name} — Merci de votre confiance !")
    c.drawCentredString(w / 2, 13 * mm, "TVA non applicable, article 293 B du CGI.")

    c.showPage()
    c.save()
    return buf.getvalue()
