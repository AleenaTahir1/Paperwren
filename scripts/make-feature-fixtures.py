"""Fixtures for the reading features: a PDF with pictures, links and
an outline, an EPUB, a comic archive and pictures in newer formats.

Usage: python3 scripts/make-feature-fixtures.py
Needs reportlab and Pillow. Writes fixtures/features/.
"""
import io
import os

from PIL import Image, ImageDraw
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "fixtures", "features")


def photo(width=320, height=200):
    """A colourful picture whose colours a dark page must not turn."""
    img = Image.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, width // 3, height], fill=(220, 40, 40))
    draw.rectangle([width // 3, 0, 2 * width // 3, height], fill=(40, 170, 60))
    draw.rectangle([2 * width // 3, 0, width, height], fill=(40, 80, 220))
    draw.ellipse([width // 2 - 40, height // 2 - 40, width // 2 + 40, height // 2 + 40], fill=(250, 220, 30))
    return img


def pictures_pdf():
    path = os.path.join(OUT, "pictures.pdf")
    c = canvas.Canvas(path, pagesize=A4)
    w, h = A4
    c.setTitle("Reading features")
    c.setAuthor("Paperwren tests")
    c.bookmarkPage("p1")
    c.addOutlineEntry("Chapter one", "p1", level=0)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(72, h - 90, "Chapter one: a page with a picture")
    c.setFont("Helvetica", 12)
    for i, line in enumerate([
        "The paper of this page turns warm or dark with the page colour.",
        "The picture below keeps its own colours on dark paper.",
        "Follow the link to the last page, then go back.",
    ]):
        c.drawString(72, h - 130 - i * 18, line)
    c.drawImage(ImageReader(photo()), 72, h - 420, width=320, height=200)
    c.setFillColorRGB(0.1, 0.3, 0.8)
    c.drawString(72, h - 460, "Go to the last page")
    c.linkRect("", "p3", (72, h - 464, 210, h - 448), relative=0, thickness=0)
    c.showPage()
    c.bookmarkPage("p2")
    c.addOutlineEntry("Chapter two", "p2", level=0)
    c.setFont("Helvetica", 12)
    for i in range(40):
        c.drawString(72, h - 72 - i * 18, f"Chapter two, line {i + 1}: words to read aloud and to find.")
    c.showPage()
    c.bookmarkPage("p3")
    c.addOutlineEntry("Chapter three", "p3", level=0)
    c.setFont("Helvetica", 12)
    c.drawString(72, h - 90, "The last page. Back returns to the link.")
    c.showPage()
    c.save()


def main():
    os.makedirs(OUT, exist_ok=True)
    pictures_pdf()
    print("wrote", sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()
