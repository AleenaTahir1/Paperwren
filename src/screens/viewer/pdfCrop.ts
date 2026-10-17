/**
 * Crop margins: a PDF's pages shown without the white around what is
 * printed on them, so a phone's narrow screen holds text, not paper.
 *
 * Each page's printed area is found from a small drawing of it. Pages
 * then show the area usual for the document's pages (odd and even pages
 * apart, as a book's margins alternate), widened wherever a page prints
 * further out, so nothing printed is ever cut; and one unusually wide
 * page does not widen the others. pdf.js reads a page's box
 * from one field of its page object; that is what changes, and changes
 * back. Printing always takes the whole page.
 */

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

type Box = [number, number, number, number];

/** A drawing this wide is enough to find the margins. */
const PROBE_WIDTH = 220;
/** Darker than this (of 255) is ink. */
const INK = 232;
/** Kept around what is printed, as a share of the page. */
const PAD = 0.025;
/** Pages read to learn the document's usual printed area. */
const SAMPLES = 8;

interface WithInfo {
	_pageInfo?: { view: Box };
}

const original = new WeakMap<PDFPageProxy, Box>();

/** Whether this pdf.js lets a page's box be changed. */
export function canCrop(page: PDFPageProxy): boolean {
	const view = (page as unknown as WithInfo)._pageInfo?.view;
	return Array.isArray(view) && view.length === 4;
}

/** A page's own, uncropped box. */
export function fullView(page: PDFPageProxy): Box {
	return original.get(page) ?? (page.view as Box);
}

function setView(page: PDFPageProxy, view: Box) {
	const info = (page as unknown as WithInfo)._pageInfo;
	if (!info) return;
	if (!original.has(page)) original.set(page, [...info.view] as Box);
	info.view = view;
}

/** Run `fn` while the page shows its whole box (to draw it for a probe,
 * or for paper). */
export function whole<T>(page: PDFPageProxy, fn: () => T): T {
	const info = (page as unknown as WithInfo)._pageInfo;
	const cropped = info?.view;
	const full = original.get(page);
	if (!info || !full) return fn();
	info.view = full;
	try {
		return fn();
	} finally {
		info.view = cropped as Box;
	}
}

/** The box of a page's printed area, in its own space, or null when it
 * prints nothing (a blank page keeps its paper). */
async function printedArea(page: PDFPageProxy): Promise<Box | null> {
	const full = fullView(page);
	const viewport = whole(page, () =>
		page.getViewport({
			scale: PROBE_WIDTH / Math.max(1, full[2] - full[0]),
			rotation: 0,
		}),
	);
	const canvas = document.createElement("canvas");
	canvas.width = Math.ceil(viewport.width);
	canvas.height = Math.ceil(viewport.height);
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) return null;
	await page.render({ canvasContext: ctx, viewport, intent: "print" }).promise;
	const { data, width, height } = ctx.getImageData(
		0,
		0,
		canvas.width,
		canvas.height,
	);
	canvas.width = canvas.height = 0;
	let top = height;
	let left = width;
	let bottom = -1;
	let right = -1;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			// Transparent is paper too.
			if (data[i + 3] < 16) continue;
			if (Math.min(data[i], data[i + 1], data[i + 2]) >= INK) continue;
			if (y < top) top = y;
			if (y > bottom) bottom = y;
			if (x < left) left = x;
			if (x > right) right = x;
		}
	}
	if (bottom < 0) return null;
	const [ax, ay] = viewport.convertToPdfPoint(left, top);
	const [bx, by] = viewport.convertToPdfPoint(right + 1, bottom + 1);
	return [
		Math.min(ax, bx),
		Math.min(ay, by),
		Math.max(ax, bx),
		Math.max(ay, by),
	];
}

/** Each side where most of the boxes have it (the middle value, leaning
 * to the smaller box). */
function usualBox(boxes: Box[]): Box | null {
	if (!boxes.length) return null;
	const side = (i: number, grow: 1 | -1) => {
		const values = boxes.map((b) => b[i]).sort((a, b) => a - b);
		const mid =
			grow > 0
				? Math.floor((values.length - 1) / 2)
				: Math.floor(values.length / 2);
		return values[mid];
	};
	// Left and bottom grow downwards, right and top upwards.
	return [side(0, -1), side(1, -1), side(2, 1), side(3, 1)];
}

const union = (a: Box | null, b: Box | null): Box | null =>
	!a
		? b
		: !b
			? a
			: [
					Math.min(a[0], b[0]),
					Math.min(a[1], b[1]),
					Math.max(a[2], b[2]),
					Math.max(a[3], b[3]),
				];

/** The printed area with a little paper around it, inside the page. */
function padded(area: Box, page: Box): Box {
	const dx = (page[2] - page[0]) * PAD;
	const dy = (page[3] - page[1]) * PAD;
	return [
		Math.max(page[0], area[0] - dx),
		Math.max(page[1], area[1] - dy),
		Math.min(page[2], area[2] + dx),
		Math.min(page[3], area[3] + dy),
	];
}

/**
 * Crop a document's pages. Pages are cropped as pdf.js asks for them
 * (its page objects are kept, so each is measured once); `stop` puts
 * every page back as it was.
 */
export async function cropPages(doc: PDFDocumentProxy) {
	const own = doc.getPage.bind(doc);
	const areas = new Map<number, Promise<Box | null>>();
	const measure = (n: number) => {
		let area = areas.get(n);
		if (!area) {
			area = own(n)
				.then(printedArea)
				.catch(() => null);
			areas.set(n, area);
		}
		return area;
	};
	// The usual printed area of odd and of even pages.
	const count = doc.numPages;
	const picks = new Set<number>([1, 2, 3, 4]);
	for (let i = 1; i <= SAMPLES; i++)
		picks.add(Math.max(1, Math.round((count * i) / (SAMPLES + 1))));
	const seen: [Box[], Box[]] = [[], []];
	for (const n of [...picks].filter((n) => n <= count)) {
		const area = await measure(n);
		if (area) seen[n % 2].push(area);
	}
	const usual = [usualBox(seen[0]), usualBox(seen[1])];
	const touched = new Set<PDFPageProxy>();
	const crop = async (page: PDFPageProxy, n: number) => {
		const area = await measure(n);
		const common = usual[n % 2] ?? usual[(n + 1) % 2];
		const shown = union(common, area);
		if (!shown || !canCrop(page)) return page;
		setView(page, padded(shown, fullView(page)));
		touched.add(page);
		return page;
	};
	const patched = (n: number) => own(n).then((page) => crop(page, n));
	(doc as { getPage: typeof doc.getPage }).getPage = patched;
	return function stop() {
		// The document's own method, on its prototype, shows again.
		Reflect.deleteProperty(doc, "getPage");
		for (const page of touched) {
			const full = original.get(page);
			if (full) setView(page, full);
		}
	};
}
