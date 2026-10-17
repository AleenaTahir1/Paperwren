import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { readOfficeMeta } from "../officeMeta";

const zip = (files: Record<string, string>) =>
	zipSync(
		Object.fromEntries(
			Object.entries(files).map(([name, text]) => [name, strToU8(text)]),
		),
	).buffer as ArrayBuffer;

const CORE = `<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>Quarterly  report</dc:title><dc:subject/><dc:creator>Ayesha Khan</dc:creator>
<cp:lastModifiedBy>Omar</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">2024-03-01T09:30:00Z</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">1601-01-01T00:00:00Z</dcterms:modified>
</cp:coreProperties>`;

const APP = `<?xml version="1.0" encoding="UTF-8"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>Microsoft Office Word</Application><Pages>3</Pages><Words>1250</Words>
</Properties>`;

const META = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
<office:meta><meta:initial-creator>Lena</meta:initial-creator><dc:creator>Marco</dc:creator>
<meta:creation-date>2023-05-02T10:00:00</meta:creation-date><dc:date>2023-06-01T12:00:00</dc:date>
<meta:generator>LibreOffice/7.6.4.1$Linux_X86_64</meta:generator>
<meta:document-statistic meta:page-count="2" meta:word-count="420"/></office:meta>
</office:document-meta>`;

describe("readOfficeMeta", () => {
	it("reads an Office file's properties", () => {
		const meta = readOfficeMeta(
			zip({ "docProps/core.xml": CORE, "docProps/app.xml": APP }),
			"docx",
		);
		expect(meta.title).toBe("Quarterly report");
		expect(meta.subject).toBeUndefined();
		expect(meta.author).toBe("Ayesha Khan");
		expect(meta.lastAuthor).toBe("Omar");
		expect(meta.created?.toISOString()).toBe("2024-03-01T09:30:00.000Z");
		// Word writes 1601 for "never"; it is not shown.
		expect(meta.modified).toBeUndefined();
		expect(meta.application).toBe("Microsoft Office Word");
		expect(meta.pages).toBe(3);
		expect(meta.words).toBe(1250);
	});

	it("reads an OpenDocument file's properties", () => {
		const meta = readOfficeMeta(zip({ "meta.xml": META }), "odt");
		expect(meta.author).toBe("Lena");
		expect(meta.lastAuthor).toBe("Marco");
		expect(meta.created?.getFullYear()).toBe(2023);
		expect(meta.modified?.getMonth()).toBe(5);
		expect(meta.application).toBe("LibreOffice");
		expect(meta.pages).toBe(2);
		expect(meta.words).toBe(420);
	});

	it("gives nothing for other files or broken ones", () => {
		expect(readOfficeMeta(zip({ "docProps/core.xml": CORE }), "pdf")).toEqual(
			{},
		);
		expect(readOfficeMeta(new ArrayBuffer(8), "docx")).toEqual({});
		expect(
			readOfficeMeta(zip({ "docProps/core.xml": "<oops" }), "xlsx"),
		).toEqual({});
	});
});
