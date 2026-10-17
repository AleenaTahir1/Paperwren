import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readBoxes, readConditional, readXlsxStyles } from "../sheetStyles";
import { DEFAULT_COL_WIDTH, parseWorkbook } from "../workbookModel";

const bytes = (name: string) =>
	new Uint8Array(readFileSync(`fixtures/${name}`));
const buffer = (b: Uint8Array) =>
	b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

describe("readXlsxStyles", () => {
	const data = bytes("viewer-regressions/styled.xlsx");
	const read = () => {
		const found = readXlsxStyles(data);
		if (!found) throw new Error("no styles read");
		const sheet = found.sheets.get("Budget & Plan");
		if (!sheet) throw new Error("sheet missing");
		const at = (addr: string) => found.styles[sheet.get(addr) ?? -1];
		return { found, sheet, at };
	};

	it("reads emphasis, colours, fills and alignment per cell", () => {
		const { at } = read();
		expect(at("A1")).toEqual({
			bold: true,
			color: "#ffffff",
			fill: "#1f4e78",
			align: "center",
		});
		expect(at("E2")).toEqual({ bold: true, color: "#2e7d32" });
		expect(at("E3")).toEqual({
			italic: true,
			color: "#c62828",
			fill: "#fde9e7",
		});
		expect(at("A4")).toEqual({ underline: true, strike: true });
		expect(at("B4")).toMatchObject({ align: "right", wrap: true });
	});

	it("resolves theme colours and their tint", () => {
		// The file's own accent 1 (#4F81BD) lightened by 60%.
		expect(read().at("A7").fill).toBe("#b9cde5");
	});

	it("unescapes sheet names and skips unstyled cells and sheets", () => {
		const { found, sheet } = read();
		expect(sheet.has("A2")).toBe(false);
		expect(found.sheets.has("Plain")).toBe(false);
	});

	it("returns null for files that carry no styling", () => {
		expect(readXlsxStyles(bytes("sample.csv"))).toBeNull();
		expect(readXlsxStyles(bytes("sample.xls"))).toBeNull();
		expect(readXlsxStyles(new Uint8Array([0x50, 0x4b, 1, 2, 3]))).toBeNull();
	});

	it("reaches the grid: styled cells, and filled cells with no value", () => {
		const result = parseWorkbook(XLSX, buffer(data), readXlsxStyles(data));
		if (!result.ok) throw new Error("parse failed");
		const sheet = result.sheets[0];
		const cell = (r: number, c: number) =>
			sheet.cells.find(([cr, cc]) => cr === r && cc === c)?.[2];
		const look = (r: number, c: number) =>
			result.styles?.[cell(r, c)?.style ?? -1];
		expect(look(0, 0)?.fill).toBe("#1f4e78");
		expect(cell(1, 0)?.style).toBeUndefined();
		// Row 6 is a band of filled, empty cells.
		expect(cell(5, 2)).toMatchObject({ value: "" });
		expect(look(5, 2)?.fill).toBe("#fff2cc");
		// "Black" on an unfilled cell is the default ink, not a colour.
		for (const s of result.styles ?? [])
			if (!s.fill) expect(s.color).not.toBe("#000000");
	});

	it("leaves workbooks without styles exactly as before", () => {
		const result = parseWorkbook(XLSX, buffer(bytes("sample.xlsx")), null);
		if (!result.ok) throw new Error("parse failed");
		expect(result.styles).toBeUndefined();
	});
});

describe("frozen panes, borders and floating objects", () => {
	const data = bytes("viewer-regressions/grid.xlsx");
	const extras = () => {
		const found = readXlsxStyles(data);
		if (!found) throw new Error("nothing read");
		return found;
	};

	it("reads the frozen pane", () => {
		expect(extras().freeze.get("Sales")).toEqual({ rows: 1, cols: 2 });
		expect(extras().freeze.has("Targets")).toBe(false);
	});

	it("reads authored borders as CSS", () => {
		const found = extras();
		const style = found.styles[found.sheets.get("Sales")?.get("C2") ?? -1];
		expect(style.border).toEqual({
			t: "2px solid #ff0000",
			r: "2px solid #ff0000",
			b: "2px solid #ff0000",
			l: "2px solid #ff0000",
		});
	});

	it("finds the chart and the picture placed on the sheet", () => {
		const found = extras();
		const anchors = found.anchors.get("Sales") ?? [];
		expect(anchors).toHaveLength(2);
		const chart = anchors.find((a) => a.chartXml);
		const picture = anchors.find((a) => a.image !== undefined);
		expect(chart?.chartXml).toContain("barChart");
		expect(chart?.from).toMatchObject({ col: 8, row: 2 });
		expect(picture?.from).toMatchObject({ col: 8, row: 21 });
		expect(found.media).toHaveLength(1);
		expect(found.media[0].type).toBe("image/png");
		expect(found.media[0].bytes.length).toBeGreaterThan(50);
		expect(found.accents).toHaveLength(6);
	});

	it("carries them into the grid in visible coordinates", () => {
		const result = parseWorkbook(XLSX, buffer(data), readXlsxStyles(data));
		if (!result.ok) throw new Error("parse failed");
		const [sales, targets] = result.sheets;
		expect(sales.freeze).toEqual({ rows: 1, cols: 2 });
		expect(targets.freeze).toBeUndefined();
		expect(sales.objects).toHaveLength(2);
		const chart = sales.objects?.find((o) => o.chartXml);
		// Column I starts after eight columns, the last of which (H) is
		// past the used range and so has the default width; row 3 after
		// two rows.
		expect(sales.cols).toBe(7);
		const left = sales.widths.reduce((a, b) => a + b, 0) + DEFAULT_COL_WIDTH;
		expect(chart?.x).toBe(left);
		expect(chart).toMatchObject({ col: 8, dx: 0 });
		expect(chart?.y).toBe(sales.rowPrefix[2]);
		expect(chart?.w).toBeGreaterThan(200);
		expect(result.media).toHaveLength(1);
	});

	it("places an object that lies wholly past the used cells", () => {
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(
			wb,
			XLSX.utils.aoa_to_sheet([
				["a", "b"],
				["c", "d"],
			]),
			"S",
		);
		const file = XLSX.write(wb, { type: "array", bookType: "xlsx" });
		const point = (col: number, row: number) => ({
			col,
			row,
			colOff: 9525 * 10,
			rowOff: 0,
		});
		// As Excel writes a chart: stretched between two cells.
		const result = parseWorkbook(XLSX, file, {
			styles: [],
			sheets: new Map(),
			freeze: new Map(),
			gridless: new Set(),
			anchors: new Map([
				["S", [{ from: point(4, 5), to: point(9, 15), image: 0 }]],
			]),
			media: [],
			accents: [],
		});
		if (!result.ok) throw new Error("parse failed");
		const [object] = result.sheets[0].objects ?? [];
		expect(object).toMatchObject({
			x: 4 * DEFAULT_COL_WIDTH + 10,
			y: 5 * 30,
			w: 5 * DEFAULT_COL_WIDTH,
			h: 10 * 30,
			col: 4,
			dx: 10,
			endCol: 9,
			endDx: 10,
		});
	});
});

describe("conditional formatting", () => {
	it("reads ranges as the file writes them", () => {
		expect(readBoxes("B2:B6 $D$1 AA10:Z3")).toEqual([
			{ r0: 1, c0: 1, r1: 5, c1: 1 },
			{ r0: 0, c0: 3, r1: 0, c1: 3 },
			{ r0: 2, c0: 25, r1: 9, c1: 26 },
		]);
	});

	it("keeps only the rules it can judge without formulas", () => {
		const xml = `<conditionalFormatting sqref="A1:A9">
			<cfRule type="cellIs" dxfId="0" priority="3" operator="between"><formula>1</formula><formula>5</formula></cfRule>
			<cfRule type="cellIs" dxfId="0" priority="1" operator="equal"><formula>"Yes"</formula></cfRule>
			<cfRule type="cellIs" dxfId="0" priority="2" operator="greaterThan"><formula>$B$1</formula></cfRule>
			<cfRule type="expression" dxfId="0" priority="4"><formula>MOD(ROW(),2)=0</formula></cfRule>
			<cfRule type="containsText" dxfId="0" priority="5" operator="containsText" text="late"><formula>NOT(ISERROR(SEARCH("late",A1)))</formula></cfRule>
		</conditionalFormatting>`;
		const rules = readConditional(xml, [{ fill: "#ff0000" }], []);
		expect(rules.map((r) => r.priority)).toEqual([1, 3, 5]);
		expect(rules[0]).toMatchObject({ kind: "compare", values: ["Yes"] });
		expect(rules[1]).toMatchObject({ kind: "compare", values: [1, 5] });
		expect(rules[2]).toMatchObject({ kind: "text", text: "late" });
	});

	it("colours the cells of a workbook as its rules say", () => {
		const data = bytes("features/birds.xlsx");
		const styles = readXlsxStyles(data);
		expect(styles?.gridless.has("Birds")).toBe(true);
		expect(styles?.gridless.has("Plain")).toBe(false);
		const result = parseWorkbook(XLSX, buffer(data), styles);
		if (!result.ok) throw new Error("not parsed");
		const sheet = result.sheets[0];
		expect(sheet.gridlines).toBe(false);
		expect(result.sheets[1].gridlines).toBeUndefined();
		const look = (r: number, c: number) => {
			const cell = sheet.cells.find(([cr, cc]) => cr === r && cc === c)?.[2];
			return result.styles?.[cell?.style ?? -1] ?? {};
		};
		// Over 100: the light red fill and dark red text of the rule.
		expect(look(4, 1)).toMatchObject({ fill: "#ffc7ce", color: "#9c0006" });
		expect(look(1, 1).fill).toBeUndefined();
		// A colour scale from white to green over 1 to 5.
		expect(look(1, 3).fill).toBe("#ffffff");
		expect(look(3, 3).fill).toBe("#b1dfbd");
		expect(look(5, 3).fill).toBe("#63be7b");
	});
});
