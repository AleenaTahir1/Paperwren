import { parsePptx } from "@/lib/pptx/parse";
import { SlideChart } from "@/screens/viewer/SlideChart";
import { printSheet, styleCss } from "@/screens/viewer/sheetHelpers";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
	NS,
	chart,
	chartXml,
	deck,
	first,
	group,
	picture,
	shape,
	slide,
	solid,
	textBody,
	workbook,
	xfrm,
} from "./renderingFixtures";

describe("Rendering fidelity regressions", () => {
	it("CONTROL: direct 50% shape alpha is retained", () => {
		expect(first(shape(solid('<a:alpha val="50000"/>'))).fill).toBe(
			"rgba(255, 0, 0, 0.500)",
		);
	});
	it("P01: picture opacity multiplies source alpha", () => {
		expect(
			slide(picture('<a:alphaModFix amt="25000"/>')).elements[0],
		).toMatchObject({ kind: "image", opacity: 0.25 });
		expect(
			slide(picture('<a:alphaModFix amt="50000"/><a:alphaModFix amt="50000"/>'))
				.elements[0],
		).toMatchObject({ opacity: 0.25 });
	});
	it("P02: alphaMod and alphaOff are applied", () => {
		for (const mod of [
			'<a:alphaMod val="50000"/>',
			'<a:alphaOff val="-50000"/>',
		])
			expect(first(shape(solid(mod))).fill).toBe("rgba(255, 0, 0, 0.500)");
	});
	it("P03: scRGB and HSL colors retain color", () => {
		for (const color of [
			'<a:scrgbClr r="100000" g="0" b="0"/>',
			'<a:hslClr hue="0" sat="100000" lum="50000"/>',
		])
			expect(first(shape(`<a:solidFill>${color}</a:solidFill>`)).fill).toBe(
				"rgb(255, 0, 0)",
			);
	});
	it("P03: valid preset colors outside the small lookup retain color", () => {
		expect(
			first(shape('<a:solidFill><a:prstClr val="purple"/></a:solidFill>')).fill,
		).toBe("rgb(128, 0, 128)");
	});
	it("P05: group rotation and flips transform child coordinates", () => {
		const cases = [
			['rot="5400000"', [0, 1, -1, 0, 180, 10]],
			['flipH="1"', [-1, 0, 0, 1, 190, 20]],
			['flipV="1"', [1, 0, 0, -1, 10, 180]],
		] as const;
		for (const [attrs, want] of cases) {
			const child = slide(group(attrs)).elements[0];
			expect(child).toMatchObject({ w: 30, h: 40 });
			want.forEach((n, i) => expect(child.matrix?.[i]).toBeCloseTo(n));
		}
	});
	it("P06: both boolean encodings are read", () => {
		expect(first(shape(solid(), "", xfrm('flipH="true"'))).flipH).toBe(true);
		expect(first(shape(solid(), "", xfrm('flipH="1"'))).flipH).toBe(true);
	});
	it("P09: image grayscale is retained", () => {
		expect(slide(picture("<a:grayscl/>")).elements[0]).toMatchObject({
			imageFilter: "grayscale(1)",
		});
	});
	it("P10: shape picture-fill crop is retained", () => {
		const fill =
			'<a:blipFill><a:blip r:embed="rId2"/>CROP<a:stretch><a:fillRect/></a:stretch></a:blipFill>';
		expect(
			first(shape(fill.replace("CROP", '<a:srcRect l="25000"/>'))),
		).toMatchObject({ imageCrop: [0.25, 0, 0, 0] });
	});
	it("P11: text baseline, character spacing, and caps are retained", () => {
		expect(
			first(
				shape(
					solid(),
					textBody("", "", 'baseline="30000" spc="300" cap="all"'),
				),
			).text,
		).toMatchObject({
			paras: [{ runs: [{ baseline: 0.3, tracking: 4, caps: "all" }] }],
		});
	});
	it("P12: exact line spacing and hanging indent are retained", () => {
		expect(
			first(
				shape(
					solid(),
					textBody(
						"",
						'<a:pPr indent="-200000"><a:lnSpc><a:spcPts val="1200"/></a:lnSpc></a:pPr>',
					),
				),
			).text,
		).toMatchObject({ paras: [{ linePoints: 16, hanging: -200000 / 9525 }] });
	});
	it("P13: numbering preserves scheme and start", () => {
		const para = (type: string, start: number) =>
			`<a:pPr><a:buAutoNum type="${type}" startAt="${start}"/></a:pPr>`;
		expect(
			first(shape(solid(), textBody("", para("arabicPeriod", 7)))).text
				?.paras[0].bullet,
		).toBe("7.");
		expect(
			first(shape(solid(), textBody("", para("romanUcPeriod", 3)))).text
				?.paras[0].bullet,
		).toBe("III.");
	});
	it("P14: vertical directions remain distinct", () => {
		expect(
			first(shape(solid(), textBody('vert="vert270"'))).text,
		).toMatchObject({ verticalMode: "vert270" });
		expect(first(shape(solid(), textBody('vert="vert"'))).text).toMatchObject({
			verticalMode: "vert",
		});
	});
	it("P15: multicolumn and rotated text settings are retained", () => {
		expect(
			first(
				shape(solid(), textBody('numCol="2" spcCol="100000" rot="5400000"')),
			).text,
		).toMatchObject({ columns: 2, columnGap: 100000 / 9525, rotation: 90 });
	});
	it("P16: table cell margins and vertical alignment are retained", () => {
		const table = (props: string) =>
			`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>${xfrm().replaceAll("a:xfrm", "p:xfrm")}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid><a:gridCol w="952500"/></a:tblGrid><a:tr h="952500"><a:tc>${textBody().replaceAll("p:txBody", "a:txBody")}<a:tcPr ${props}/></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
		expect(slide(table('marL="0" anchor="ctr"')).elements[0]).toMatchObject({
			kind: "table",
			rows: [
				{ cells: [{ text: { anchor: "middle", insets: [0, 4.8, 9.6, 4.8] } }] },
			],
		});
	});
	it("P17: AlternateContent with a supported Choice and no Fallback renders", () => {
		const wrapper = `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="p">${shape()}</mc:Choice></mc:AlternateContent>`;
		expect(slide(wrapper).elements).toHaveLength(1);
	});
	it("P18: a theme fill style index resolves gradient paint", () => {
		const ref = (idx: number) =>
			shape('<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>').replace(
				"</p:sp>",
				`<p:style><a:fillRef idx="${idx}"><a:schemeClr val="accent1"/></a:fillRef></p:style></p:sp>`,
			);
		expect(first(ref(1)).fill).toBeDefined();
		expect(first(ref(2)).gradient?.stops.length).toBeGreaterThan(1);
		expect(first(ref(1)).gradient).toBeUndefined();
		expect(first(ref(0)).fill).toBeUndefined();
	});
	it("P19: slide color-map overrides change theme text color", () => {
		const tree = shape('<a:solidFill><a:schemeClr val="tx1"/></a:solidFill>');
		const override =
			'<p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="accent1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>';
		expect(slide(tree, "", override)).not.toEqual(slide(tree));
	});
	it("P20: layout placeholder geometry and fill are inherited", () => {
		const ph = '<p:nvPr><p:ph type="body" idx="1"/></p:nvPr>';
		const layoutShape = shape(solid()).replace("<p:nvPr/>", ph);
		const slideShape = shape("", textBody(), "").replace("<p:nvPr/>", ph);
		const files = unzipSync(deck(slideShape));
		files["ppt/slideLayouts/slideLayout7.xml"] = strToU8(
			`<p:sldLayout ${NS}><p:cSld><p:spTree>${layoutShape}</p:spTree></p:cSld></p:sldLayout>`,
		);
		const el = parsePptx(zipSync(files)).slides[0].elements[0];
		expect(el).toMatchObject({ kind: "shape", w: 100, h: 100 });
		if (el.kind !== "shape") throw new Error("Expected shape");
		expect(el.fill).toBe("rgb(255, 0, 0)");
	});
	it("CONTROL: direct picture crop is retained", () => {
		expect(
			slide(picture("", '<a:srcRect l="25000"/>')).elements[0],
		).toMatchObject({ crop: [0.25, 0, 0, 0] });
	});
	it("C01: unsupported chart settings use a placeholder", () => {
		expect(
			chart(
				chartXml(
					'<c:valAx><c:axId val="9"/><c:scaling><c:logBase val="10"/><c:min val="10"/><c:max val="1000"/></c:scaling><c:axPos val="r"/></c:valAx>',
				),
			),
		).toBeNull();
	});
	it("C02: unsupported chart settings use a placeholder", () => {
		expect(chart(chartXml("", "bar3DChart"))).toBeNull();
	});
	it("C03: stacked line chart retains stacking", () => {
		expect(chart(chartXml("", "lineChart", "stacked"))).toMatchObject({
			stack: "stacked",
		});
	});
	it("C04: a single-slice doughnut retains a hole", () => {
		const draw = (hole: number) =>
			renderToStaticMarkup(
				createElement(SlideChart, {
					w: 300,
					h: 200,
					chart: {
						kind: "pie",
						legend: false,
						slices: [{ label: "A", value: 50, color: "#f00" }],
						hole,
					},
				}),
			);
		expect(draw(0.5).match(/A/g)).toHaveLength(4);
		expect(draw(0).match(/A/g)).toHaveLength(2);
	});
	it("X01: authored cell formatting is retained", () => {
		expect(
			workbook((f) => {
				f["xl/styles.xml"] = strToU8(
					strFromU8(f["xl/styles.xml"])
						.replace(/<sz val="[^"]+"\s*\/>/g, '<sz val="36"/>')
						.replace(/<name val="[^"]+"\s*\/>/g, '<name val="Courier New"/>'),
				);
			}).styles,
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ font: "Courier New", fontSize: 48 }),
			]),
		);
	});
	it("X02: authored cell formatting is retained", () => {
		expect(
			workbook((f) => {
				f["xl/styles.xml"] = strToU8(
					strFromU8(f["xl/styles.xml"]).replace(/<alignment\b[^>]*>/g, (tag) =>
						tag
							.replace(/\s(?:textRotation|vertical)="[^"]*"/g, "")
							.replace(
								"<alignment",
								'<alignment textRotation="90" vertical="top"',
							),
					),
				);
			}).styles,
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ rotation: 90, vertical: "top" }),
			]),
		);
	});
	it("X04: grid styles preserve authored colors", () => {
		expect(styleCss({ fill: "#ffffff", color: "#ff0000" })).toMatchObject({
			background: "#ffffff",
			color: "#ff0000",
		});
	});
	it("X05: spreadsheet print includes floating objects and authored borders", () => {
		const host = document.createElement("div");
		const sheet = {
			name: "Audit",
			rows: 1,
			cols: 1,
			rowHeights: [30],
			rowPrefix: [0, 30],
			rowOrigins: [0],
			colOrigins: [0],
			widths: [100],
			merges: [],
			cells: new Map([[0, { value: "A", style: 0 }]]),
			objects: [{ x: 0, y: 0, w: 20, h: 20, col: 0, dx: 0, image: 0 }],
		};
		printSheet(
			host,
			sheet,
			[100],
			[styleCss({ border: { b: "3px solid #ff0000" } })],
			[{ node: document.createElement("img"), x: 0, y: 0, w: 20, h: 20 }],
		);
		expect(host.querySelector("td")?.textContent).toBe("A");
		expect(host.querySelector("td")?.style.borderBottom).toBe(
			"3px solid rgb(255, 0, 0)",
		);
		expect(host.querySelectorAll("img,svg")).toHaveLength(1);
	});
});

describe("Fidelity edge cases", () => {
	it("clamps alpha after each operation", () => {
		expect(
			first(shape(solid('<a:alphaOff val="50000"/><a:alphaMod val="50000"/>')))
				.fill,
		).toBe("rgba(255, 0, 0, 0.500)");
	});
	it("zero opacity remains transparent", () => {
		expect(
			slide(picture('<a:alphaModFix amt="0"/>')).elements[0],
		).toMatchObject({ opacity: 0 });
	});
	it("uses fallback for an unsupported AlternateContent namespace", () => {
		const wrapper = `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:new="urn:unsupported"><mc:Choice Requires="new">${shape(solid("", "00FF00"))}</mc:Choice><mc:Fallback>${shape()}</mc:Fallback></mc:AlternateContent>`;
		expect(first(wrapper).fill).toBe("rgb(255, 0, 0)");
	});
	it("retains value limits and reversed axes", () => {
		expect(
			chart(
				chartXml(
					'<c:valAx><c:scaling><c:min val="10"/><c:max val="100"/><c:orientation val="maxMin"/></c:scaling></c:valAx><c:catAx><c:scaling><c:orientation val="maxMin"/></c:scaling></c:catAx>',
				),
			),
		).toMatchObject({
			valueAxis: { min: 10, max: 100, reverse: true },
			categoryReverse: true,
		});
		expect(chart(chartXml("<c:valAx/><c:valAx/>"))).toBeNull();
	});
	it("keeps unsupported series from silently disappearing in mixed charts", () => {
		expect(chart(chartXml("<c:radarChart/>"))).toBeNull();
		expect(
			chart(chartXml().replace('ptCount val="1"', 'ptCount val="2001"')),
		).toBeNull();
	});
	it("clips plotted values to authored axis bounds", () => {
		const model = chart(
			chartXml(
				'<c:valAx><c:scaling><c:min val="10"/><c:max val="20"/></c:scaling></c:valAx>',
			),
		);
		if (!model) throw new Error("missing chart");
		const host = document.createElement("div");
		host.innerHTML = renderToStaticMarkup(
			createElement(SlideChart, { chart: model, w: 400, h: 300 }),
		);
		const bounds = host.querySelector("clipPath rect");
		expect(bounds).not.toBeNull();
		expect(
			host.querySelector("rect[clip-path]")?.getAttribute("clip-path"),
		).toContain("url(#");
		expect(host.textContent).not.toContain("50");
	});
	it("stacked line series reach their cumulative height", () => {
		const model = {
			kind: "cartesian" as const,
			legend: false,
			categories: ["A", "B"],
			horizontal: false,
			stack: "stacked" as const,
			percent: false,
			series: [
				{
					name: "first",
					kind: "line" as const,
					color: "red",
					values: [10, 10],
					markers: false,
				},
				{
					name: "second",
					kind: "line" as const,
					color: "blue",
					values: [20, 20],
					markers: false,
				},
			],
		};
		const host = document.createElement("div");
		host.innerHTML = renderToStaticMarkup(
			createElement(SlideChart, { chart: model, w: 400, h: 300 }),
		);
		const points = [...host.querySelectorAll("polyline")].map((el) =>
			(el.getAttribute("points") ?? "")
				.split(" ")
				.map((p) => Number(p.split(",")[1])),
		);
		const top = Number(host.querySelector("clipPath rect")?.getAttribute("y"));
		expect(points).toHaveLength(2);
		expect(points[1][0]).toBeCloseTo(top);
		expect(points[0][0]).toBeGreaterThan(points[1][0]);
	});
	it("shape picture fills keep both crop and opacity", () => {
		expect(
			first(
				shape(
					'<a:blipFill><a:blip r:embed="rId2"><a:alphaModFix amt="25000"/></a:blip><a:srcRect l="25000"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>',
				),
			),
		).toMatchObject({
			image: "blob:audit",
			imageOpacity: 0.25,
			imageCrop: [0.25, 0, 0, 0],
		});
	});
	it("explicit no-effects overrides the theme effect", () => {
		const xml = shape(`${solid()}<a:effectLst/>`).replace(
			"</p:sp>",
			'<p:style><a:effectRef idx="2"><a:schemeClr val="accent1"/></a:effectRef></p:style></p:sp>',
		);
		expect(first(xml).shadow).toBeUndefined();
	});
});
