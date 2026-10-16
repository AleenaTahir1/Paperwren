/** Remaining limitations: passing reproduces the documented issue. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { decodeText } from "@/lib/text";
import { renderAsync } from "docx-preview";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
	deck,
	first,
	gradient,
	picture,
	shape,
	slide,
	solid,
	textBody,
	workbook,
	xfrm,
} from "../../src/lib/__tests__/renderingFixtures";

describe("Remaining rendering limitations", () => {
	it("P04: pattern fills have no paint", () => {
		expect(
			first(
				shape(
					'<a:pattFill prst="pct50"><a:fgClr><a:srgbClr val="FF0000"/></a:fgClr><a:bgClr><a:srgbClr val="0000FF"/></a:bgClr></a:pattFill>',
				),
			).fill,
		).toBeUndefined();
	});
	it("P07: gradient focus and rectangular versus circular paths are lost", () => {
		expect(
			first(
				shape(
					gradient(
						'<a:path path="circle"><a:fillToRect l="20000" t="30000" r="80000" b="70000"/></a:path>',
					),
				),
			).gradient,
		).toEqual(first(shape(gradient('<a:path path="rect"/>'))).gradient);
	});
	it("P07: path gradient backgrounds become linear", () => {
		const bg = `<p:bg><p:bgPr>${gradient('<a:path path="circle"/>')}</p:bgPr></p:bg>`;
		expect(slide("", bg).background).toContain("linear-gradient");
	});
	it("P08: glow and soft edges do not change the shape model", () => {
		expect(
			first(
				shape(
					`${solid()}<a:effectLst><a:glow rad="95250"><a:srgbClr val="00FF00"/></a:glow><a:softEdge rad="95250"/></a:effectLst>`,
				),
			),
		).toEqual(first(shape()));
	});
	it("writes a local browser fixture for picture transparency", () => {
		mkdirSync("public/fixtures/audit", { recursive: true });
		const label = shape("<a:noFill/>", textBody(), xfrm("", 40, 140, 600, 100));
		writeFileSync(
			"public/fixtures/audit/transparency.pptx",
			deck(
				shape(solid('<a:alpha val="25000"/>')) +
					picture('<a:alphaModFix amt="25000"/>') +
					label,
			),
		);
	});
	it("D01: 100 paragraphs with no saved breaks remain one page section", async () => {
		const files = unzipSync(
			new Uint8Array(readFileSync("fixtures/sample.docx")),
		);
		const original = strFromU8(files["word/document.xml"]);
		const section =
			'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>';
		const paragraphs = Array.from(
			{ length: 100 },
			(_, i) =>
				`<w:p><w:r><w:t>Pagination audit paragraph ${i + 1}: this text must continue onto additional pages.</w:t></w:r></w:p>`,
		).join("");
		files["word/document.xml"] = strToU8(
			original.replace(
				/<w:body>[\s\S]*?<\/w:body>/,
				`<w:body>${paragraphs}${section}</w:body>`,
			),
		);
		const bytes = zipSync(files);
		const host = document.createElement("div");
		await renderAsync(bytes, host, host, {
			breakPages: true,
			ignoreLastRenderedPageBreak: false,
			experimental: true,
			useBase64URL: true,
		});
		expect(host.querySelectorAll("section.docx")).toHaveLength(1);
		expect(host.textContent).toContain("Pagination audit paragraph 100");
		mkdirSync("public/fixtures/audit", { recursive: true });
		writeFileSync("public/fixtures/audit/pagination.docx", bytes);
	});
	it("T01: Shift-JIS without BOM is decoded as Windows-1252", () => {
		const bytes = new Uint8Array([0x82, 0xa0]); // Shift-JIS hiragana A.
		expect(new TextDecoder("shift-jis").decode(bytes)).toBe("あ");
		expect(decodeText(bytes.buffer)).not.toBe("あ");
	});
	it("X03: conditional formatting is absent from the parsed style output", () => {
		expect(
			workbook((f) => {
				f["xl/worksheets/sheet1.xml"] = strToU8(
					strFromU8(f["xl/worksheets/sheet1.xml"]).replace(
						"</worksheet>",
						'<conditionalFormatting sqref="A1:A7"><cfRule type="colorScale" priority="1"><colorScale><cfvo type="min"/><cfvo type="max"/><color rgb="FFFF0000"/><color rgb="FF00FF00"/></colorScale></cfRule></conditionalFormatting></worksheet>',
					),
				);
			}),
		).toEqual(workbook(() => {}));
	});
});
