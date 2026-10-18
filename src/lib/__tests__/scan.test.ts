// @vitest-environment node
import { PDFDocument } from "@cantoo/pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { SCAN_MARK, scansToPdf } from "../pdfTools";
import {
	type Quad,
	area,
	clampQuad,
	fullQuad,
	isConvex,
	orderCorners,
	pageSize,
	project,
	quadGap,
	rectToQuad,
} from "../scan/geometry";
import {
	type Pixels,
	allLooks,
	applyLook,
	clean,
	toBlackWhite,
	toGray,
	turn,
	warp,
} from "../scan/pixels";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
	import.meta.url,
).toString();

const tilted: Quad = [
	{ x: 30, y: 20 },
	{ x: 170, y: 40 },
	{ x: 160, y: 230 },
	{ x: 20, y: 210 },
];

/** A width × height picture painted by `paint(x, y) -> [r, g, b]`. */
function picture(
	width: number,
	height: number,
	paint: (x: number, y: number) => [number, number, number],
): Pixels {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			const [r, g, b] = paint(x, y);
			data[i] = r;
			data[i + 1] = g;
			data[i + 2] = b;
			data[i + 3] = 255;
		}
	return { data, width, height };
}

const at = (p: Pixels, x: number, y: number) => {
	const i = (Math.round(y) * p.width + Math.round(x)) * 4;
	return [p.data[i], p.data[i + 1], p.data[i + 2]];
};

describe("scan geometry", () => {
	it("orders four points clockwise from the top left", () => {
		const shuffled = [tilted[2], tilted[0], tilted[3], tilted[1]];
		expect(orderCorners(shuffled)).toEqual(tilted);
	});

	it("tells a page shape from a crossed one", () => {
		expect(isConvex(tilted)).toBe(true);
		const crossed: Quad = [tilted[0], tilted[2], tilted[1], tilted[3]];
		expect(isConvex(crossed)).toBe(false);
		const flat: Quad = [
			{ x: 0, y: 0 },
			{ x: 5, y: 0 },
			{ x: 10, y: 0 },
			{ x: 0, y: 10 },
		];
		expect(isConvex(flat)).toBe(false);
	});

	it("measures area, size and gaps", () => {
		expect(area(fullQuad(100, 50))).toBe(5000);
		expect(fullQuad(100, 100, 0.1)[0]).toEqual({ x: 10, y: 10 });
		const size = pageSize(fullQuad(400, 300));
		expect(size).toEqual({ width: 400, height: 300 });
		expect(pageSize(fullQuad(4000, 3000), 1000)).toEqual({
			width: 1000,
			height: 750,
		});
		expect(quadGap(tilted, tilted)).toBe(0);
		expect(clampQuad(fullQuad(10, 10, -0.5), 10, 10)).toEqual(fullQuad(10, 10));
	});

	it("maps the rectangle's corners onto the quad", () => {
		const h = rectToQuad(140, 190, tilted);
		const corners = [
			[0, 0],
			[140, 0],
			[140, 190],
			[0, 190],
		];
		corners.forEach(([x, y], i) => {
			const p = project(h, x, y);
			expect(p.x).toBeCloseTo(tilted[i].x, 6);
			expect(p.y).toBeCloseTo(tilted[i].y, 6);
		});
	});
});

describe("scan pixels", () => {
	it("straightens a tilted page", () => {
		// A white page with a black mark near its top left, on a dark desk.
		const photo = picture(200, 250, (x, y) => {
			const h = rectToQuad(140, 190, tilted);
			// Inside the page? Test against the four edges.
			const inside = tilted.every((p, i) => {
				const n = tilted[(i + 1) % 4];
				return (n.x - p.x) * (y - p.y) - (n.y - p.y) * (x - p.x) >= 0;
			});
			if (!inside) return [40, 30, 20];
			const mark = project(h, 20, 20);
			return Math.hypot(x - mark.x, y - mark.y) < 6
				? [0, 0, 0]
				: [240, 240, 240];
		});
		const page = warp(photo, tilted, 140, 190);
		expect(page.width).toBe(140);
		expect(page.height).toBe(190);
		// The mark lands where it was drawn on the page...
		expect(at(page, 20, 20)[0]).toBeLessThan(60);
		// ...and the rest is paper: no desk got in.
		for (const [x, y] of [
			[3, 3],
			[136, 3],
			[136, 186],
			[3, 186],
			[70, 95],
		])
			expect(at(page, x, y)[0]).toBeGreaterThan(200);
	});

	it("turns a page a quarter at a time", () => {
		const p = picture(3, 2, (x, y) => [x * 10 + y, 0, 0]);
		const right = turn(p, 1);
		expect([right.width, right.height]).toEqual([2, 3]);
		// The bottom-left pixel comes to the top left.
		expect(at(right, 0, 0)[0]).toBe(at(p, 0, 1)[0]);
		const back = turn(turn(right, 1), 2);
		expect(back.data).toEqual(p.data);
		expect(turn(p, 4)).toBe(p);
	});

	it("whitens shaded, tinted paper and keeps the ink dark", () => {
		// Yellowish paper, darker to the right (a shadow), with a line of ink.
		const photo = picture(300, 200, (x, y) => {
			const light = 1 - (x / 300) * 0.45;
			if (y >= 95 && y <= 99 && x > 40 && x < 260)
				return [40 * light, 38 * light, 35 * light];
			return [220 * light, 205 * light, 160 * light];
		});
		const out = clean(photo);
		for (const x of [10, 150, 290]) {
			const [r, g, b] = at(out, x, 40);
			expect(Math.min(r, g, b)).toBeGreaterThan(235);
		}
		for (const x of [60, 150, 240]) {
			const [r] = at(out, x, 97);
			expect(r).toBeLessThan(90);
		}
	});

	it("does not lift a large dark area to white", () => {
		// A page with a big black box on it, wider than the paper search.
		const photo = picture(300, 300, (x, y) =>
			x > 60 && x < 240 && y > 60 && y < 240 ? [10, 10, 10] : [230, 230, 230],
		);
		const out = clean(photo);
		expect(at(out, 150, 150)[0]).toBeLessThan(80);
		expect(at(out, 20, 20)[0]).toBeGreaterThan(235);
	});

	it("makes grey and black & white pages", () => {
		const photo = picture(120, 80, (x) =>
			x < 40 ? [200, 40, 40] : x < 60 ? [20, 20, 20] : [230, 225, 215],
		);
		const gray = toGray(clean(photo));
		const [r, g, b] = at(gray, 20, 40);
		expect(r).toBe(g);
		expect(g).toBe(b);
		const bw = toBlackWhite(toGray(clean(photo)));
		expect(at(bw, 50, 40)[0]).toBe(0);
		expect(at(bw, 100, 40)[0]).toBe(255);
		for (let i = 0; i < bw.data.length; i += 4)
			expect(bw.data[i]).toBe(bw.data[i + 2]);
	});

	it("keeps faint pencil in black & white beside a strip of dark desk", () => {
		const photo = picture(300, 300, (x, y) => {
			if (y < 30) return [15, 12, 10];
			if (y >= 150 && y <= 152 && x > 40 && x < 260) return [150, 150, 150];
			return [235, 233, 228];
		});
		const bw = toBlackWhite(toGray(clean(photo)));
		expect(at(bw, 150, 151)[0]).toBe(0);
		expect(at(bw, 150, 100)[0]).toBe(255);
		expect(at(bw, 150, 10)[0]).toBe(0);
	});

	it("gives every look, the original untouched", () => {
		const photo = picture(40, 40, () => [180, 170, 150]);
		const before = new Uint8ClampedArray(photo.data);
		const all = allLooks(photo);
		expect(Object.keys(all).sort()).toEqual([
			"bw",
			"clean",
			"gray",
			"original",
		]);
		expect(all.original.data).toEqual(before);
		expect(applyLook(photo, "original")).toBe(photo);
		expect(applyLook(photo, "bw").data).toEqual(all.bw.data);
	});
});

/** A small real JPEG: a white page, as the scanner hands it over. */
async function jpeg(): Promise<Uint8Array> {
	// The smallest baseline JPEG (1 × 1, white), hand-built.
	const hex =
		"ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f00fbfcffd9";
	return Uint8Array.from(hex.match(/../g) ?? [], (h) => Number.parseInt(h, 16));
}

async function words(bytes: Uint8Array) {
	const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
	const out: string[] = [];
	for (let i = 1; i <= doc.numPages; i++) {
		const page = await doc.getPage(i);
		const text = await page.getTextContent();
		out.push(
			text.items
				.map((item) => ("str" in item ? item.str : ""))
				.join(" ")
				.trim(),
		);
	}
	return out;
}

describe("scans to PDF", () => {
	it("gives each page its picture's shape, A4 wide, with the mark", async () => {
		const bytes = await jpeg();
		const pdf = await scansToPdf(
			[
				{ bytes, width: 1000, height: 1400 },
				{ bytes, width: 1600, height: 1000 },
			],
			{ mark: SCAN_MARK },
		);
		const doc = await PDFDocument.load(pdf);
		expect(doc.getPageCount()).toBe(2);
		const [a, b] = doc.getPages().map((p) => p.getSize());
		expect(Math.round(a.width)).toBe(595);
		expect(Math.round(a.height)).toBe(Math.round(595.28 * 1.4));
		// Lying down: as tall as A4 is wide.
		expect(Math.round(b.height)).toBe(595);
		expect(Math.round(b.width)).toBe(Math.round(595.28 * 1.6));
		expect(await words(pdf)).toEqual([SCAN_MARK, SCAN_MARK]);
	});

	it("fits pages to Letter, and leaves the mark off when asked", async () => {
		const bytes = await jpeg();
		const pdf = await scansToPdf([{ bytes, width: 800, height: 1200 }], {
			paper: "letter",
		});
		const doc = await PDFDocument.load(pdf);
		const { width, height } = doc.getPage(0).getSize();
		expect([Math.round(width), Math.round(height)]).toEqual([612, 792]);
		expect(await words(pdf)).toEqual([""]);
	});

	it("refuses no pages", async () => {
		await expect(scansToPdf([])).rejects.toThrow();
	});
});
