"""Fixtures for the reading features: a PDF with pictures, links and
an outline, an EPUB, a comic archive and pictures in newer formats.

Usage: python3 scripts/make-feature-fixtures.py
Needs reportlab and Pillow. Writes fixtures/features/.
"""
import io
import os

from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter
from pypdf.annotations import Highlight, Text
from pypdf.generic import (
    ArrayObject,
    DecodedStreamObject,
    DictionaryObject,
    FloatObject,
    NameObject,
    TextStringObject,
)
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


def extras_pdf():
    """Comments, an attached file and a layer that can be hidden."""
    base = io.BytesIO()
    c = canvas.Canvas(base, pagesize=A4)
    w, h = A4
    c.setFont("Helvetica", 14)
    c.drawString(72, h - 90, "A page with a note, a highlight and a layer.")
    c.drawString(72, h - 120, "This line is highlighted by a reader.")
    c.showPage()
    c.drawString(72, h - 90, "The second page has a note too.")
    c.showPage()
    c.save()
    writer = PdfWriter(clone_from=PdfReader(io.BytesIO(base.getvalue())))
    note = Text(rect=(400, h - 100, 420, h - 80), text="Check this figure before printing.")
    note[NameObject("/T")] = TextStringObject("Ayesha")
    writer.add_annotation(page_number=0, annotation=note)
    top = h - 124
    mark = Highlight(
        rect=(70, top, 330, top + 18),
        quad_points=ArrayObject([FloatObject(v) for v in (70, top + 18, 330, top + 18, 70, top, 330, top)]),
    )
    mark[NameObject("/C")] = ArrayObject([FloatObject(1), FloatObject(0.9), FloatObject(0.2)])
    mark[NameObject("/CA")] = FloatObject(0.4)
    writer.add_annotation(page_number=0, annotation=mark)
    second = Text(rect=(400, h - 100, 420, h - 80), text="Second page remark.")
    writer.add_annotation(page_number=1, annotation=second)
    writer.add_attachment("notes.txt", b"Attached notes: the figures are final.\n")
    # A layer named "Watermark" that draws a line of text.
    ocg = writer._add_object(DictionaryObject({
        NameObject("/Type"): NameObject("/OCG"),
        NameObject("/Name"): TextStringObject("Watermark"),
    }))
    writer._root_object[NameObject("/OCProperties")] = DictionaryObject({
        NameObject("/OCGs"): ArrayObject([ocg]),
        NameObject("/D"): DictionaryObject({
            NameObject("/Order"): ArrayObject([ocg]),
            NameObject("/ON"): ArrayObject([ocg]),
        }),
    })
    page = writer.pages[0]
    resources = page["/Resources"]
    resources[NameObject("/Properties")] = DictionaryObject({NameObject("/WM"): ocg})
    fonts = resources["/Font"]
    font_name = list(fonts.keys())[0]
    layer = DecodedStreamObject()
    layer.set_data(
        f"/OC /WM BDC BT {font_name} 28 Tf 0.85 0.2 0.2 rg 120 300 Td (DRAFT LAYER) Tj ET EMC".encode()
    )
    contents = page["/Contents"]
    stream = writer._add_object(layer)
    if isinstance(contents.get_object(), ArrayObject):
        contents.get_object().append(stream)
    else:
        page[NameObject("/Contents")] = ArrayObject([contents, stream])
    with open(os.path.join(OUT, "extras.pdf"), "wb") as f:
        writer.write(f)


def nocopy_pdf():
    """Opens without a password, but its author asks that it not be copied."""
    from pypdf.constants import UserAccessPermissions as P

    base = io.BytesIO()
    c = canvas.Canvas(base, pagesize=A4)
    c.drawString(72, A4[1] - 90, "Read me, but please do not copy me.")
    c.showPage()
    c.save()
    writer = PdfWriter(clone_from=PdfReader(io.BytesIO(base.getvalue())))
    allowed = P.PRINT | P.PRINT_TO_REPRESENTATION | P.ADD_OR_MODIFY
    writer.encrypt(user_password="", owner_password="owner", permissions_flag=allowed, algorithm="RC4-128")
    with open(os.path.join(OUT, "nocopy.pdf"), "wb") as f:
        writer.write(f)


def margins_pdf():
    """Wide white margins, and one page that prints further out than the
    rest: cropping must not cut it."""
    path = os.path.join(OUT, "margins.pdf")
    c = canvas.Canvas(path, pagesize=A4)
    w, h = A4
    for n in range(1, 5):
        c.setFont("Helvetica", 11)
        if n == 3:
            c.drawString(40, h - 60, "WIDE: this line runs from the left edge to the right edge of the page.")
        for i in range(30):
            c.drawString(170, h - 200 - i * 14, f"Page {n}, line {i + 1}: a narrow column of text.")
        c.showPage()
    c.save()


def main():
    os.makedirs(OUT, exist_ok=True)
    pictures_pdf()
    extras_pdf()
    nocopy_pdf()
    margins_pdf()
    print("wrote", sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()
