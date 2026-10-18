/**
 * The pixel work of a scan: straighten the page out of the photo, then
 * give it the look the reader picked. Plain arrays in, plain arrays
 * out, so it runs in a worker and in tests alike.
 */
import { type Quad, project, rectToQuad } from "./geometry";

/** RGBA pixels, four bytes each, row by row. */
export interface Pixels {
	data: Uint8ClampedArray<ArrayBuffer>;
	width: number;
	height: number;
}

/** How a scanned page can look. */
export type Look = "clean" | "original" | "gray" | "bw";
export const LOOKS: Look[] = ["clean", "original", "gray", "bw"];

/**
 * The page inside `quad` of `src`, straightened into a width × height
 * rectangle. Each pixel is read from the photo between its four
 * nearest pixels; the quad should be sampled at about the size it is
 * drawn (shrink the photo first for a small result).
 */
export function warp(
	src: Pixels,
	quad: Quad,
	width: number,
	height: number,
): Pixels {
	const h = rectToQuad(width, height, quad);
	const out = new Uint8ClampedArray(width * height * 4);
	const { data, width: sw, height: sh } = src;
	const maxX = sw - 1;
	const maxY = sh - 1;
	let o = 0;
	for (let y = 0; y < height; y++) {
		const cy = y + 0.5;
		// Along a row the three sums change by a fixed step.
		let nx = h[0] * 0.5 + h[1] * cy + h[2];
		let ny = h[3] * 0.5 + h[4] * cy + h[5];
		let nw = h[6] * 0.5 + h[7] * cy + 1;
		for (let x = 0; x < width; x++) {
			let fx = nx / nw - 0.5;
			let fy = ny / nw - 0.5;
			nx += h[0];
			ny += h[3];
			nw += h[6];
			if (fx < 0) fx = 0;
			else if (fx > maxX) fx = maxX;
			if (fy < 0) fy = 0;
			else if (fy > maxY) fy = maxY;
			const x0 = fx | 0;
			const y0 = fy | 0;
			const x1 = x0 < maxX ? x0 + 1 : x0;
			const y1 = y0 < maxY ? y0 + 1 : y0;
			const ax = fx - x0;
			const ay = fy - y0;
			const i00 = (y0 * sw + x0) * 4;
			const i10 = (y0 * sw + x1) * 4;
			const i01 = (y1 * sw + x0) * 4;
			const i11 = (y1 * sw + x1) * 4;
			const w00 = (1 - ax) * (1 - ay);
			const w10 = ax * (1 - ay);
			const w01 = (1 - ax) * ay;
			const w11 = ax * ay;
			out[o] =
				data[i00] * w00 + data[i10] * w10 + data[i01] * w01 + data[i11] * w11;
			out[o + 1] =
				data[i00 + 1] * w00 +
				data[i10 + 1] * w10 +
				data[i01 + 1] * w01 +
				data[i11 + 1] * w11;
			out[o + 2] =
				data[i00 + 2] * w00 +
				data[i10 + 2] * w10 +
				data[i01 + 2] * w01 +
				data[i11 + 2] * w11;
			out[o + 3] = 255;
			o += 4;
		}
	}
	return { data: out, width, height };
}

/** Where a straightened pixel came from (for tests). */
export const sourceOf = (
	quad: Quad,
	width: number,
	height: number,
	x: number,
	y: number,
) => project(rectToQuad(width, height, quad), x, y);

/** A page turned a quarter at a time, clockwise. */
export function turn(src: Pixels, quarters: number): Pixels {
	const q = ((quarters % 4) + 4) % 4;
	if (!q) return src;
	const { data, width: w, height: h } = src;
	const ow = q === 2 ? w : h;
	const oh = q === 2 ? h : w;
	const out = new Uint8ClampedArray(data.length);
	const s32 = new Uint32Array(data.buffer, data.byteOffset, w * h);
	const o32 = new Uint32Array(out.buffer);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const v = s32[y * w + x];
			if (q === 1) o32[x * ow + (ow - 1 - y)] = v;
			else if (q === 2) o32[(oh - 1 - y) * ow + (ow - 1 - x)] = v;
			else o32[(oh - 1 - x) * ow + y] = v;
		}
	return { data: out, width: ow, height: oh };
}

/**
 * The paper's own colour under each part of the page: the brightest
 * tone nearby (ink is darker than paper), smoothed. Measured on a small
 * grid, one channel at a time, so a shadow, a yellow lamp or a blue
 * daylight cast are all found.
 */
function paperTone(src: Pixels) {
	const { data, width, height } = src;
	const cell = Math.max(1, Math.round(Math.max(width, height) / 160));
	const gw = Math.ceil(width / cell);
	const gh = Math.ceil(height / cell);
	const grids = [0, 1, 2].map(() => new Float32Array(gw * gh));
	// The brightest of each cell, from a sparse sample: a cell's ink is
	// thin, its paper wide.
	const stride = Math.max(1, cell >> 2);
	for (let gy = 0; gy < gh; gy++)
		for (let gx = 0; gx < gw; gx++) {
			const maxes = [0, 0, 0];
			const yEnd = Math.min(height, (gy + 1) * cell);
			const xEnd = Math.min(width, (gx + 1) * cell);
			for (let y = gy * cell; y < yEnd; y += stride)
				for (let x = gx * cell; x < xEnd; x += stride) {
					const i = (y * width + x) * 4;
					for (let c = 0; c < 3; c++)
						if (data[i + c] > maxes[c]) maxes[c] = data[i + c];
				}
			for (let c = 0; c < 3; c++) grids[c][gy * gw + gx] = maxes[c];
		}
	// Wider than a heading's stroke: the brightest within a few cells,
	// then an average to smooth the steps between cells away.
	const spread = (g: Float32Array, r: number, pick: "max" | "mean") => {
		const tmp = new Float32Array(g.length);
		const out = new Float32Array(g.length);
		for (let y = 0; y < gh; y++)
			for (let x = 0; x < gw; x++) {
				let v = 0;
				let n = 0;
				for (let k = -r; k <= r; k++) {
					const xx = Math.min(gw - 1, Math.max(0, x + k));
					const s = g[y * gw + xx];
					if (pick === "max") v = Math.max(v, s);
					else v += s;
					n++;
				}
				tmp[y * gw + x] = pick === "max" ? v : v / n;
			}
		for (let y = 0; y < gh; y++)
			for (let x = 0; x < gw; x++) {
				let v = 0;
				let n = 0;
				for (let k = -r; k <= r; k++) {
					const yy = Math.min(gh - 1, Math.max(0, y + k));
					const s = tmp[yy * gw + x];
					if (pick === "max") v = Math.max(v, s);
					else v += s;
					n++;
				}
				out[y * gw + x] = pick === "max" ? v : v / n;
			}
		return out;
	};
	const tones = grids.map((g) => spread(spread(g, 2, "max"), 3, "mean"));
	// The paper overall: most of the page is paper, so its bright half.
	const lum = new Float32Array(gw * gh);
	for (let i = 0; i < lum.length; i++)
		lum[i] = (tones[0][i] + tones[1][i] + tones[2][i]) / 3;
	const sorted = Float32Array.from(lum).sort();
	const paper = sorted[Math.floor(sorted.length * 0.75)] || 255;
	return { tones, gw, gh, cell, paper };
}

/** The scanner's tone curve: near-white paper to white, ink deepened. */
const LEVELS = (() => {
	const t = new Uint8ClampedArray(512);
	for (let v = 0; v < 512; v++) {
		const n = Math.min(1, Math.max(0, (v - 12) / (238 - 12)));
		t[v] = Math.round(255 * n ** 1.35);
	}
	return t;
})();

/**
 * The page as if it came out of a scanner: the paper made evenly white
 * (shadows, uneven light and colour casts taken out), the ink made
 * darker and crisper, its colours kept.
 */
export function clean(src: Pixels): Pixels {
	const { data, width, height } = src;
	const { tones, gw, gh, cell, paper } = paperTone(src);
	// A dark area wider than the search (a photo, a black bar) is not a
	// shadow: never lift a tone above twice its brightness.
	const floor = Math.max(1, paper * 0.5);
	const out = new Uint8ClampedArray(data.length);
	const half = cell / 2;
	// Each cell row's tones, spread across the page's width once.
	const xs0 = new Int32Array(width);
	const xs1 = new Int32Array(width);
	const xa = new Float32Array(width);
	for (let x = 0; x < width; x++) {
		const f = Math.min(gw - 1, Math.max(0, (x - half) / cell));
		xs0[x] = f | 0;
		xs1[x] = Math.min(gw - 1, xs0[x] + 1);
		xa[x] = f - xs0[x];
	}
	const spread = new Map<number, Float32Array>();
	const rowOf = (gy: number) => {
		let row = spread.get(gy);
		if (row) return row;
		row = new Float32Array(width * 3);
		for (let c = 0; c < 3; c++) {
			const t = tones[c];
			const base = gy * gw;
			for (let x = 0; x < width; x++)
				row[x * 3 + c] =
					t[base + xs0[x]] * (1 - xa[x]) + t[base + xs1[x]] * xa[x];
		}
		if (spread.size > 3) spread.delete(spread.keys().next().value as number);
		spread.set(gy, row);
		return row;
	};
	const SAT = 1.35;
	for (let y = 0; y < height; y++) {
		const gyf = Math.min(gh - 1, Math.max(0, (y - half) / cell));
		const gy0 = gyf | 0;
		const ay = gyf - gy0;
		const r0 = rowOf(gy0);
		const r1 = rowOf(Math.min(gh - 1, gy0 + 1));
		let i = y * width * 4;
		for (let x = 0, k = 0; x < width; x++, k += 3, i += 4) {
			let tr = r0[k] + (r1[k] - r0[k]) * ay;
			let tg = r0[k + 1] + (r1[k + 1] - r0[k + 1]) * ay;
			let tb = r0[k + 2] + (r1[k + 2] - r0[k + 2]) * ay;
			if (tr < floor) tr = floor;
			if (tg < floor) tg = floor;
			if (tb < floor) tb = floor;
			// Divide out the paper's tone: paper becomes white.
			const r = (data[i] * 255) / tr;
			const g = (data[i + 1] * 255) / tg;
			const b = (data[i + 2] * 255) / tb;
			// A little more colour in the ink, which the division pales.
			const m = (r + g + b) / 3;
			let vr = (m + (r - m) * SAT) | 0;
			let vg = (m + (g - m) * SAT) | 0;
			let vb = (m + (b - m) * SAT) | 0;
			vr = vr < 0 ? 0 : vr > 511 ? 511 : vr;
			vg = vg < 0 ? 0 : vg > 511 ? 511 : vg;
			vb = vb < 0 ? 0 : vb > 511 ? 511 : vb;
			out[i] = LEVELS[vr];
			out[i + 1] = LEVELS[vg];
			out[i + 2] = LEVELS[vb];
			out[i + 3] = 255;
		}
	}
	return { data: out, width, height };
}

/** Shades of grey, in place. */
export function toGray(p: Pixels): Pixels {
	const d = p.data;
	for (let i = 0; i < d.length; i += 4) {
		const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
		d[i] = v;
		d[i + 1] = v;
		d[i + 2] = v;
	}
	return p;
}

/** Black ink on white paper, in place, from a grey page: like a fax or
 * a photocopy. The edge between the two is kept a pixel soft, so
 * letters do not come out jagged. */
export function toBlackWhite(p: Pixels): Pixels {
	const d = p.data;
	// Where ink ends and paper starts: Otsu's split of the grey levels,
	// kept to a sensible range (a nearly blank page has no real split).
	const hist = new Float64Array(256);
	for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
	const total = d.length / 4;
	let sum = 0;
	for (let v = 0; v < 256; v++) sum += v * hist[v];
	let below = 0;
	let belowSum = 0;
	let best = 0;
	let split = 170;
	for (let v = 0; v < 256; v++) {
		below += hist[v];
		if (!below) continue;
		const above = total - below;
		if (!above) break;
		belowSum += v * hist[v];
		const m0 = belowSum / below;
		const m1 = (sum - belowSum) / above;
		const between = below * above * (m0 - m1) ** 2;
		if (between > best) {
			best = between;
			split = v;
		}
	}
	split = Math.min(205, Math.max(140, split + 10));
	const curve = new Uint8ClampedArray(256);
	for (let v = 0; v < 256; v++) curve[v] = (v - (split - 14)) * (255 / 28);
	for (let i = 0; i < d.length; i += 4) {
		const v = curve[d[i]];
		d[i] = v;
		d[i + 1] = v;
		d[i + 2] = v;
	}
	return p;
}

/** The page with the chosen look (`src` itself for the original). */
export function applyLook(src: Pixels, look: Look): Pixels {
	if (look === "original") return src;
	const c = clean(src);
	if (look === "clean") return c;
	toGray(c);
	return look === "bw" ? toBlackWhite(c) : c;
}

/** The page in every look, cleaning it once for all three that need it. */
export function allLooks(src: Pixels): Record<Look, Pixels> {
	const c = clean(src);
	const g = toGray({ ...c, data: new Uint8ClampedArray(c.data) });
	const bw = toBlackWhite({ ...g, data: new Uint8ClampedArray(g.data) });
	return { original: src, clean: c, gray: g, bw };
}
