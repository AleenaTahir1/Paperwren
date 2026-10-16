import { readFileSync } from "node:fs";
import { readChart } from "@/lib/pptx/chart";
import { parsePptx } from "@/lib/pptx/parse";
import { readXlsxStyles } from "@/lib/sheetStyles";
import { strToU8, unzipSync, zipSync } from "fflate";
import { afterAll, beforeAll } from "vitest";

const NS =
	'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const xfrm = (attrs = "", x = 0, y = 0, w = 100, h = 100) =>
	`<a:xfrm ${attrs}><a:off x="${x * 9525}" y="${y * 9525}"/><a:ext cx="${w * 9525}" cy="${h * 9525}"/></a:xfrm>`;
const solid = (mods = "", color = "FF0000") =>
	`<a:solidFill><a:srgbClr val="${color}">${mods}</a:srgbClr></a:solidFill>`;
const shape = (props = solid(), text = "", transform = xfrm()) =>
	`<p:sp><p:nvSpPr><p:cNvPr id="2" name="Audit shape"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${transform}${props}</p:spPr>${text}</p:sp>`;
const textBody = (props = "", para = "", run = "") =>
	`<p:txBody><a:bodyPr ${props}/><a:lstStyle/><a:p>${para}<a:r><a:rPr sz="2400" ${run}/><a:t>Audit text</a:t></a:r></a:p></p:txBody>`;
const picture = (effects = "", fill = "") =>
	`<p:pic><p:nvPicPr><p:cNvPr id="3" name="Audit picture"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2">${effects}</a:blip>${fill}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm("", 150, 0, 100, 100)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;

function deck(tree: string, bg = "", tail = "") {
	const files = unzipSync(
		new Uint8Array(readFileSync("fixtures/viewer-regressions/effects.pptx")),
	);
	files["ppt/slides/slide1.xml"] = strToU8(
		`<p:sld ${NS}><p:cSld>${bg}<p:spTree>${tree}</p:spTree></p:cSld>${tail}</p:sld>`,
	);
	return zipSync(files);
}
const slide = (tree: string, bg = "", tail = "") =>
	parsePptx(deck(tree, bg, tail)).slides[0];
function first(tree: string) {
	const result = slide(tree).elements[0];
	if (!result || result.kind !== "shape")
		throw new Error("Expected shape fixture");
	return result;
}
const gradient = (geometry: string) =>
	`<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst>${geometry}</a:gradFill>`;
const group = (attrs: string) =>
	`<p:grpSp><p:nvGrpSpPr><p:cNvPr id="10" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm ${attrs}><a:off x="0" y="0"/><a:ext cx="1905000" cy="1905000"/><a:chOff x="0" y="0"/><a:chExt cx="1905000" cy="1905000"/></a:xfrm></p:grpSpPr>${shape(solid(), "", xfrm("", 10, 20, 30, 40))}</p:grpSp>`;

const originalUrl = URL.createObjectURL;
beforeAll(() => {
	URL.createObjectURL = () => "blob:audit";
});
afterAll(() => {
	URL.createObjectURL = originalUrl;
});

const chartXml = (extra = "", kind = "barChart", group = "clustered") =>
	`<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:${kind}><c:grouping val="${group}"/><c:ser><c:idx val="0"/><c:order val="0"/><c:cat><c:strLit><c:ptCount val="1"/><c:pt idx="0"><c:v>A</c:v></c:pt></c:strLit></c:cat><c:val><c:numLit><c:ptCount val="1"/><c:pt idx="0"><c:v>50</c:v></c:pt></c:numLit></c:val></c:ser></c:${kind}>${extra}</c:plotArea></c:chart></c:chartSpace>`;
const chart = (xml: string) =>
	readChart(new DOMParser().parseFromString(xml, "application/xml"), {
		resolve: () => undefined,
		accent: () => "#ff0000",
	});

function workbook(mutate: (files: Record<string, Uint8Array>) => void) {
	const files = unzipSync(
		new Uint8Array(readFileSync("fixtures/viewer-regressions/styled.xlsx")),
	);
	mutate(files);
	const result = readXlsxStyles(zipSync(files));
	if (!result) throw new Error("Expected workbook styles");
	return result;
}

export {
	NS,
	xfrm,
	solid,
	shape,
	textBody,
	picture,
	deck,
	slide,
	first,
	gradient,
	group,
	chartXml,
	chart,
	workbook,
};
