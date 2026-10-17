import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { EpubError, chapterId, parseEpub, resolvePath } from "../epub";

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const chapter = (body: string) => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>x</title><style>p { color: red }</style><link rel="stylesheet" href="s.css"/></head>
<body>${body}</body></html>`;

function book(files: Record<string, string | Uint8Array>, opf: string) {
	const all: Record<string, Uint8Array> = {
		mimetype: strToU8("application/epub+zip"),
		"META-INF/container.xml": strToU8(CONTAINER),
		"OEBPS/content.opf": strToU8(opf),
	};
	for (const [k, v] of Object.entries(files))
		all[k] = typeof v === "string" ? strToU8(v) : v;
	return zipSync(all);
}

const OPF3 = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
 <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>The   Wren's Book</dc:title><dc:creator>A. Writer</dc:creator>
  <dc:language>en</dc:language><dc:publisher>Small Press</dc:publisher>
 </metadata>
 <manifest>
  <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  <item id="c2" href="text/two.xhtml" media-type="application/xhtml+xml"/>
  <item id="c1" href="text/one.xhtml" media-type="application/xhtml+xml"/>
  <item id="pic" href="images/wren%20one.png" media-type="image/png"/>
 </manifest>
 <spine><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>`;

const NAV = chapter(`<nav epub:type="toc"><ol>
 <li><a href="text/one.xhtml">One</a></li>
 <li><a href="text/two.xhtml#middle">Two</a><ol><li><a href="text/two.xhtml#deep">Deeper</a></li></ol></li>
</ol></nav>`);

describe("parseEpub", () => {
	const bytes = book(
		{
			"OEBPS/nav.xhtml": NAV,
			"OEBPS/text/one.xhtml": chapter(
				`<h1 id="top">One</h1><p>First <a href="two.xhtml#middle">to two</a>.</p><a id="empty"/><p>After the empty anchor.</p><img src="../images/wren one.png" alt="a wren"/><script>alert(1)</script>`,
			),
			"OEBPS/text/two.xhtml": chapter(
				`<h1 id="middle">Two</h1><p style="color:red" onclick="x()">Middle <a href="https://example.com/">web</a></p><p id="deep">Deep.</p>`,
			),
			"OEBPS/images/wren one.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
		},
		OPF3,
	);
	const read = parseEpub(bytes);

	it("reads what the book says about itself", () => {
		expect(read.title).toBe("The Wren's Book");
		expect(read.author).toBe("A. Writer");
		expect(read.language).toBe("en");
		expect(read.publisher).toBe("Small Press");
	});

	it("reads the chapters in spine order, not manifest order", () => {
		expect(read.chapters.map((c) => c.id)).toEqual([
			chapterId(0),
			chapterId(1),
		]);
		expect(read.chapters[0].html).toContain("First");
		expect(read.chapters[1].html).toContain("Middle");
	});

	it("rewrites links and ids into the one joined document", () => {
		const one = read.chapters[0].html;
		const two = read.chapters[1].html;
		expect(one).toContain('id="pw-c0-top"');
		expect(one).toContain('href="#pw-c1-middle"');
		expect(two).toContain('id="pw-c1-middle"');
		expect(two).toContain('href="https://example.com/"');
	});

	it("keeps text after an empty anchor out of the link", () => {
		const host = document.createElement("div");
		host.innerHTML = read.chapters[0].html;
		const after = [...host.querySelectorAll("p")].find((p) =>
			p.textContent?.includes("After the empty anchor"),
		);
		expect(after?.closest("a")).toBeNull();
	});

	it("drops scripts, styles and handlers, and names pictures for the viewer", () => {
		const one = read.chapters[0].html;
		const two = read.chapters[1].html;
		expect(one).not.toContain("script");
		expect(one).not.toContain("alert");
		expect(two).not.toContain("onclick");
		expect(two).not.toContain("color:red");
		expect(one).toContain('data-pw-src="OEBPS/images/wren one.png"');
		expect(read.images.get("OEBPS/images/wren one.png")?.type).toBe(
			"image/png",
		);
	});

	it("reads the contents from the nav document", () => {
		expect(read.toc).toEqual([
			{ label: "One", target: "pw-c0", items: [] },
			{
				label: "Two",
				target: "pw-c1-middle",
				items: [{ label: "Deeper", target: "pw-c1-deep", items: [] }],
			},
		]);
	});

	it("reads an EPUB 2 table of contents (NCX)", () => {
		const opf = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
 <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Old</dc:title></metadata>
 <manifest>
  <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  <item id="c1" href="one.html" media-type="application/xhtml+xml"/>
 </manifest>
 <spine toc="ncx"><itemref idref="c1"/></spine>
</package>`;
		const ncx = `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>
 <navPoint id="p1"><navLabel><text>Chapter One</text></navLabel><content src="one.html#s1"/></navPoint>
</navMap></ncx>`;
		const old = parseEpub(
			book(
				{
					"OEBPS/toc.ncx": ncx,
					"OEBPS/one.html": chapter('<h2 id="s1">Chapter One</h2>'),
				},
				opf,
			),
		);
		expect(old.toc).toEqual([
			{ label: "Chapter One", target: "pw-c0-s1", items: [] },
		]);
	});

	it("refuses a locked book, and a file that is not one", () => {
		const locked = book(
			{
				"OEBPS/text/one.xhtml": chapter("<p>x</p>"),
				"META-INF/encryption.xml": `<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/><enc:CipherData><enc:CipherReference URI="OEBPS/text/one.xhtml"/></enc:CipherData></enc:EncryptedData></encryption>`,
			},
			OPF3,
		);
		expect(() => parseEpub(locked)).toThrow(EpubError);
		try {
			parseEpub(locked);
		} catch (e) {
			expect((e as EpubError).reason).toBe("drm");
		}
		expect(() => parseEpub(new Uint8Array([1, 2, 3]))).toThrow(EpubError);
	});

	it("only hidden fonts is not a lock", () => {
		const fonts = book(
			{
				"OEBPS/nav.xhtml": NAV,
				"OEBPS/text/one.xhtml": chapter("<p>Readable</p>"),
				"OEBPS/text/two.xhtml": chapter("<p>Too</p>"),
				"META-INF/encryption.xml": `<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/><enc:CipherData><enc:CipherReference URI="OEBPS/fonts/a.otf"/></enc:CipherData></enc:EncryptedData></encryption>`,
			},
			OPF3,
		);
		expect(parseEpub(fonts).chapters[0].html).toContain("Readable");
	});
});

describe("resolvePath", () => {
	it("walks up and down a book's folders", () => {
		expect(resolvePath("OEBPS/text/a.xhtml", "../images/b.jpg")).toBe(
			"OEBPS/images/b.jpg",
		);
		expect(resolvePath("OEBPS/content.opf", "text/a%20b.xhtml")).toBe(
			"OEBPS/text/a b.xhtml",
		);
		expect(resolvePath("a.xhtml", "./b.xhtml")).toBe("b.xhtml");
	});
});
