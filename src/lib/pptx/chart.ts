/**
 * Charts, read from the chart part's CACHED values: the numbers the
 * authoring app itself last drew. The embedded workbook is never
 * opened and nothing is recalculated. A chart on a spreadsheet whose
 * writer stored no cache can instead be given the sheet's own cells
 * to read its ranges from (`ranges`).
 *
 * Covered: bar/column (clustered, stacked, 100%), line, area, pie,
 * doughnut and scatter, including bar+line combinations. Anything
 * else (radar, bubble, surface, stock) reports null and the slide
 * shows a labelled placeholder instead of a wrong picture.
 */

import { path, attrOf, kid, kids } from "./xml";

export interface ChartSeries {
	name: string;
	kind: "bar" | "line" | "area";
	color: string;
	/** One value per category; null where the file has a gap. */
	values: Array<number | null>;
	markers: boolean;
}

export interface ChartPoint {
	x: number;
	y: number;
}

export interface ChartAxis {
	min?: number;
	max?: number;
	reverse?: boolean;
}
export type Chart = {
	title?: string;
	legend: boolean;
	valueAxis?: ChartAxis;
	categoryReverse?: boolean;
	blanks?: "gap" | "zero" | "span";
} & (
	| {
			kind: "cartesian";
			categories: string[];
			series: ChartSeries[];
			/** Bars run sideways (categories on the vertical axis). */
			horizontal: boolean;
			stack: "none" | "stacked" | "percent";
			/** Values are fractions to show as percentages. */
			percent: boolean;
	  }
	| {
			kind: "pie";
			slices: Array<{ label: string; value: number; color: string }>;
			/** Doughnut hole, as a fraction of the radius. */
			hole: number;
	  }
	| {
			kind: "scatter";
			series: Array<{
				name: string;
				color: string;
				points: ChartPoint[];
				line: boolean;
			}>;
	  }
);

/** Colours a chart needs from the deck's theme. */
export interface ChartColors {
	/** A colour-choice holder (solidFill, ...) as CSS, if it has one. */
	resolve(holder: Element | null | undefined): string | undefined;
	/** Theme accent 1..6 as CSS. */
	accent(n: number): string;
}

const MAX_POINTS = 2000;

/** Looks up a range formula ("'Sales'!$B$2:$B$9"); null if unknown. */
export type RangeLookup = (formula: string) => string[] | null;

/** Set for the duration of one readChart call. */
let rangeLookup: RangeLookup | undefined;
let truncated = false;

/** Points of a c:cat / c:val / c:xVal reference, by index: the cache
 * the file stores, or failing that the cells its formula names. */
function cache(ref: Element | null): { values: string[]; format: string } {
	const stored = cached(ref);
	if (stored.values.length || !rangeLookup) return stored;
	const formula = (
		path(ref, "numRef", "f") ??
		path(ref, "strRef", "f") ??
		path(ref, "multiLvlStrRef", "f")
	)?.textContent;
	const cells = formula ? rangeLookup(formula) : null;
	if (cells && cells.length > MAX_POINTS) truncated = true;
	return cells ? { values: cells.slice(0, MAX_POINTS), format: "" } : stored;
}

function cached(ref: Element | null): { values: string[]; format: string } {
	const holder =
		path(ref, "numRef", "numCache") ??
		path(ref, "strRef", "strCache") ??
		kid(ref, "numLit") ??
		kid(ref, "strLit") ??
		kid(path(ref, "multiLvlStrRef", "multiLvlStrCache"), "lvl");
	const count = Math.min(
		MAX_POINTS,
		Number(attrOf(kid(holder, "ptCount"), "val")) || 0,
	);
	const values: string[] = new Array(count).fill("");
	for (const pt of kids(holder, "pt")) {
		const i = Number(attrOf(pt, "idx"));
		if (i >= 0 && i < MAX_POINTS) values[i] = kid(pt, "v")?.textContent ?? "";
	}
	return { values, format: kid(holder, "formatCode")?.textContent ?? "" };
}

const num = (text: string): number | null => {
	if (text.trim() === "") return null;
	const n = Number(text);
	return Number.isFinite(n) ? n : null;
};

function seriesName(ser: Element, index: number): string {
	const tx = kid(ser, "tx");
	const formula = path(tx, "strRef", "f")?.textContent;
	return (
		path(tx, "strRef", "strCache", "pt", "v")?.textContent ??
		kid(tx, "v")?.textContent ??
		(formula ? rangeLookup?.(formula)?.[0] : undefined) ??
		`Series ${index + 1}`
	);
}

function richText(el: Element | null): string | undefined {
	if (!el) return undefined;
	const text = Array.from(el.getElementsByTagNameNS("*", "p"))
		.map((p) =>
			Array.from(p.getElementsByTagNameNS("*", "t"))
				.map((t) => t.textContent)
				.join(""),
		)
		.filter(Boolean)
		.join(" ");
	return text || undefined;
}

export function readChart(
	doc: Document,
	colors: ChartColors,
	ranges?: RangeLookup,
): Chart | null {
	rangeLookup = ranges;
	truncated = false;
	try {
		const result = read(doc, colors);
		return truncated ? null : result;
	} finally {
		rangeLookup = undefined;
	}
}

function read(doc: Document, colors: ChartColors): Chart | null {
	const chart = kid(doc.documentElement, "chart");
	const plot = kid(chart, "plotArea");
	if (!plot) return null;
	const groups = kids(plot).filter((g) => g.localName.endsWith("Chart"));
	const supported = new Set([
		"barChart",
		"lineChart",
		"areaChart",
		"pieChart",
		"doughnutChart",
		"scatterChart",
	]);
	// Never display only the supported series of a mixed chart, or flatten 3D.
	if (groups.some((g) => !supported.has(g.localName))) return null;
	if (
		groups.length > 1 &&
		groups.some((g) =>
			["pieChart", "doughnutChart", "scatterChart"].includes(g.localName),
		)
	)
		return null;
	// Separate/logarithmic axes need a dedicated layout; don't silently use one linear axis.
	const axes = kids(plot, "valAx");
	if (
		axes.length > (groups[0]?.localName === "scatterChart" ? 2 : 1) ||
		axes.some((a) => path(a, "scaling", "logBase"))
	)
		return null;
	if (
		groups.length > 1 &&
		groups.some((g) =>
			["stacked", "percentStacked"].includes(
				attrOf(kid(g, "grouping"), "val") ?? "",
			),
		)
	)
		return null;
	const numeric = (el: Element | null) => {
		const v = attrOf(el, "val");
		return v !== null && Number.isFinite(Number(v)) ? Number(v) : undefined;
	};
	const axis = axes[0];
	const valueAxis: ChartAxis | undefined = axis
		? {
				min: numeric(path(axis, "scaling", "min")),
				max: numeric(path(axis, "scaling", "max")),
				reverse:
					attrOf(path(axis, "scaling", "orientation"), "val") === "maxMin" ||
					undefined,
			}
		: undefined;
	if (
		valueAxis?.min !== undefined &&
		valueAxis.max !== undefined &&
		valueAxis.max <= valueAxis.min
	)
		return null;
	// Scatter has independent numeric axes; reject authored scaling until both are supported.
	if (
		groups[0]?.localName === "scatterChart" &&
		axes.some((a) =>
			kids(kid(a, "scaling")).some(
				(e) => e.localName !== "orientation" || attrOf(e, "val") === "maxMin",
			),
		)
	)
		return null;
	const blanksValue = attrOf(kid(chart, "dispBlanksAs"), "val");
	const blanks =
		blanksValue === "span" || blanksValue === "zero" ? blanksValue : "gap";
	const categoryReverse =
		attrOf(path(kid(plot, "catAx"), "scaling", "orientation"), "val") ===
			"maxMin" || undefined;
	// A truncated plot is a different dataset: use the explicit placeholder instead.
	if (
		Array.from(plot.getElementsByTagNameNS("*", "ptCount")).some(
			(p) => Number(attrOf(p, "val")) > MAX_POINTS,
		) ||
		Array.from(plot.getElementsByTagNameNS("*", "pt")).some(
			(p) => Number(attrOf(p, "idx")) >= MAX_POINTS,
		)
	)
		return null;
	const title = richText(path(chart, "title", "tx", "rich"));
	const legend = !!kid(chart, "legend");
	// Every series in the plot gets the next theme accent unless the
	// file gives it a colour of its own.
	let order = 0;
	const colorOf = (holder: Element | null, lineOnly: boolean) =>
		(lineOnly ? undefined : colors.resolve(kid(holder, "spPr"))) ??
		colors.resolve(path(holder, "spPr", "ln")) ??
		colors.accent(order + 1);

	const cartesian: ChartSeries[] = [];
	let categories: string[] = [];
	let horizontal = false;
	let stack: "none" | "stacked" | "percent" = "none";
	let percent = false;

	for (const group of kids(plot)) {
		const type = group.localName.replace("3D", "");
		if (
			type === "pieChart" ||
			type === "doughnutChart" ||
			type === "ofPieChart"
		) {
			const ser = kid(group, "ser");
			if (!ser) continue;
			const labels = cache(kid(ser, "cat")).values;
			const values = cache(kid(ser, "val")).values.map(num);
			const own = new Map<number, string>();
			for (const dPt of kids(ser, "dPt")) {
				const c = colors.resolve(kid(dPt, "spPr"));
				if (c) own.set(Number(attrOf(kid(dPt, "idx"), "val")), c);
			}
			const slices = values
				.map((value, i) => ({
					label: labels[i] || `${i + 1}`,
					value: Math.abs(value ?? 0),
					color: own.get(i) ?? colors.accent(i + 1),
				}))
				.filter((s) => s.value > 0);
			if (!slices.length) return null;
			const holeSize = Number(attrOf(kid(group, "holeSize"), "val"));
			return {
				kind: "pie",
				title,
				legend,
				slices,
				hole:
					type === "doughnutChart"
						? Math.min(0.9, Math.max(0.1, (holeSize || 50) / 100))
						: 0,
			};
		}
		if (type === "scatterChart") {
			const series = kids(group, "ser").map((ser, i) => {
				const xs = cache(kid(ser, "xVal")).values.map(num);
				const ys = cache(kid(ser, "yVal")).values.map(num);
				const points: ChartPoint[] = [];
				ys.forEach((y, k) => {
					const x = xs.length ? xs[k] : k + 1;
					if (y !== null && x !== null && x !== undefined)
						points.push({ x, y });
				});
				const ln = path(ser, "spPr", "ln");
				const color = colorOf(ser, true);
				order++;
				return {
					name: seriesName(ser, i),
					color,
					points,
					line: !!ln && !kid(ln, "noFill"),
				};
			});
			if (!series.some((s) => s.points.length)) return null;
			return { kind: "scatter", title, legend, series };
		}
		const kind =
			type === "barChart"
				? "bar"
				: type === "lineChart"
					? "line"
					: type === "areaChart"
						? "area"
						: null;
		if (!kind) continue;
		const grouping = attrOf(kid(group, "grouping"), "val");
		if (grouping === "stacked") stack = "stacked";
		else if (grouping === "percentStacked") stack = "percent";
		if (kind === "bar")
			horizontal = attrOf(kid(group, "barDir"), "val") === "bar";
		for (const ser of kids(group, "ser")) {
			const cats = cache(kid(ser, "cat")).values;
			if (cats.length > categories.length) categories = cats;
			const val = cache(kid(ser, "val"));
			if (val.format.includes("%")) percent = true;
			const marker = attrOf(path(ser, "marker", "symbol"), "val");
			cartesian.push({
				name: seriesName(ser, cartesian.length),
				kind,
				color: colorOf(ser, kind === "line"),
				values: val.values.map(num),
				markers: kind === "line" && marker !== "none",
			});
			order++;
		}
	}

	if (!cartesian.length) return null;
	const length = Math.max(
		categories.length,
		...cartesian.map((s) => s.values.length),
	);
	if (!length) return null;
	return {
		kind: "cartesian",
		title,
		legend,
		categories: Array.from({ length }, (_, i) => categories[i] || `${i + 1}`),
		series: cartesian,
		horizontal,
		stack,
		percent,
		valueAxis,
		categoryReverse,
		blanks,
	};
}
