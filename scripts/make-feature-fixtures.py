"""Fixtures for the reading features: a PDF with pictures, links and
an outline, an EPUB, a comic archive and pictures in newer formats.

Usage: python3 scripts/make-feature-fixtures.py
Needs reportlab, pypdf, Pillow and pillow-heif. Writes fixtures/features/.
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


def epub_book(path, locked=False):
    """A small EPUB 3: a cover drawn as an SVG around a picture, three
    chapters (one right-to-left), a footnote link, a style sheet."""
    import zipfile

    cover = io.BytesIO()
    photo(300, 400).save(cover, "PNG")
    chapter = lambda title, body, lang="en", dir_="ltr": f"""<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="{lang}" dir="{dir_}">
<head><title>{title}</title><link rel="stylesheet" href="../style.css"/></head>
<body>{body}</body></html>"""
    long = "".join(
        f"<p>The wren sang its {i}th song of the morning, small and loud, from the hedge by the wall.</p>"
        for i in range(1, 41)
    )
    files = {
        "META-INF/container.xml": """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>""",
        "OEBPS/book.opf": """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="id">urn:uuid:paperwren-test-book</dc:identifier>
<dc:title>The Wren's Year</dc:title><dc:creator>Paperwren Tests</dc:creator>
<dc:language>en</dc:language><dc:publisher>Hedge Press</dc:publisher></metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/>
<item id="c1" href="text/spring.xhtml" media-type="application/xhtml+xml"/>
<item id="c2" href="text/summer.xhtml" media-type="application/xhtml+xml"/>
<item id="c3" href="text/urdu.xhtml" media-type="application/xhtml+xml"/>
<item id="notes" href="text/notes.xhtml" media-type="application/xhtml+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
<item id="img" href="images/cover.png" media-type="image/png" properties="cover-image"/>
</manifest>
<spine><itemref idref="cover"/><itemref idref="c1"/><itemref idref="c2"/><itemref idref="c3"/><itemref idref="notes" linear="no"/></spine>
</package>""",
        "OEBPS/nav.xhtml": chapter("Contents", """<nav epub:type="toc"><h1>Contents</h1><ol>
<li><a href="text/spring.xhtml">Spring</a></li>
<li><a href="text/summer.xhtml">Summer</a><ol><li><a href="text/summer.xhtml#heat">The hot days</a></li></ol></li>
<li><a href="text/urdu.xhtml">بہار</a></li></ol></nav>"""),
        "OEBPS/style.css": "body { color: red; background: url(https://example.com/x.png); } p { text-indent: 2em; }",
        "OEBPS/text/cover.xhtml": chapter("Cover", """<div><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 300 400"><image width="300" height="400" xlink:href="../images/cover.png"/></svg></div>"""),
        "OEBPS/text/spring.xhtml": chapter("Spring", '<h1>Spring</h1><p>The first wren of spring<a href="notes.xhtml#n1" epub:type="noteref">1</a> came early.</p>' + long),
        "OEBPS/text/summer.xhtml": chapter("Summer", '<h1>Summer</h1>' + long + '<h2 id="heat">The hot days</h2><p>In the heat the wren kept to the shade.</p>'),
        "OEBPS/text/urdu.xhtml": chapter("بہار", "<h1>بہار</h1><p>چھوٹی سی چڑیا صبح سویرے گاتی ہے۔</p>", "ur", "rtl"),
        "OEBPS/text/notes.xhtml": chapter("Notes", '<aside id="n1" epub:type="footnote"><p>1. A note about the first wren.</p></aside>'),
    }
    if locked:
        files["META-INF/encryption.xml"] = """<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/><enc:CipherData><enc:CipherReference URI="OEBPS/text/spring.xhtml"/></enc:CipherData></enc:EncryptedData></encryption>"""
    with zipfile.ZipFile(path, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        for name, body in files.items():
            z.writestr(name, body, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/images/cover.png", cover.getvalue(), compress_type=zipfile.ZIP_STORED)


def exif_photo():
    """A photo with what a camera writes: make, lens, the shot, the place."""
    from PIL.TiffImagePlugin import IFDRational as R

    exif = Image.Exif()
    exif[271] = "Canon"
    exif[272] = "Canon EOS R6"
    exif[306] = "2024:05:01 14:03:22"
    shot = exif.get_ifd(0x8769)
    shot[33434] = R(1, 125)
    shot[33437] = R(28, 10)
    shot[34855] = 400
    shot[36867] = "2024:05:01 14:03:21"
    shot[37386] = R(50, 1)
    shot[42036] = "RF 50mm F1.8"
    gps = exif.get_ifd(0x8825)
    gps[1] = "N"
    gps[2] = (R(34, 1), R(3, 1), R(0, 1))
    gps[3] = "W"
    gps[4] = (R(118, 1), R(15, 1), R(0, 1))
    photo(320, 200).save(os.path.join(OUT, "photo.jpg"), exif=exif.tobytes())


def pictures_in_new_formats():
    """A two-page TIFF, an SVG, and a comic book archive."""
    import zipfile

    pages = [photo(200, 260), Image.new("RGB", (200, 260), (30, 30, 120))]
    ImageDraw.Draw(pages[1]).text((20, 120), "PAGE TWO", fill=(255, 255, 255))
    pages[0].save(os.path.join(OUT, "scan.tif"), save_all=True, append_images=pages[1:], compression="tiff_deflate")
    with open(os.path.join(OUT, "drawing.svg"), "w") as f:
        f.write("""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160">
  <rect width="240" height="160" fill="#2b6e66"/>
  <circle cx="120" cy="80" r="50" fill="#f2c94c"/>
  <script>window.__svgScriptRan = true</script>
</svg>""")
    with zipfile.ZipFile(os.path.join(OUT, "comic.cbz"), "w") as z:
        for n, colour in [(1, (200, 40, 40)), (2, (40, 160, 60)), (10, (40, 80, 200))]:
            page = Image.new("RGB", (300, 450), colour)
            ImageDraw.Draw(page).text((120, 210), f"PAGE {n}", fill=(255, 255, 255))
            buf = io.BytesIO()
            page.save(buf, "JPEG", quality=80)
            z.writestr(f"Wren Comic/page{n}.jpg", buf.getvalue())
        z.writestr("Wren Comic/ComicInfo.xml", "<ComicInfo><Title>Wren</Title></ComicInfo>")
        z.writestr("__MACOSX/Wren Comic/._page1.jpg", b"junk")


def heic_and_avif():
    """Phone photos in newer formats (needs pillow-heif; Pillow writes AVIF)."""
    import pillow_heif

    pillow_heif.register_heif_opener()
    Image.new("RGB", (160, 120), (200, 60, 60)).save(os.path.join(OUT, "photo.heic"), quality=80)
    Image.new("RGB", (160, 120), (60, 160, 60)).save(os.path.join(OUT, "photo.avif"))


def main():
    os.makedirs(OUT, exist_ok=True)
    pictures_pdf()
    extras_pdf()
    nocopy_pdf()
    margins_pdf()
    epub_book(os.path.join(OUT, "book.epub"))
    epub_book(os.path.join(OUT, "locked.epub"), locked=True)
    exif_photo()
    pictures_in_new_formats()
    heic_and_avif()
    print("wrote", sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()
