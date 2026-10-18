/**
 * The shapes of a scan: a page photographed at an angle is a
 * four-cornered outline in the photo, straightened into a rectangle.
 */

export interface Point {
	x: number;
	y: number;
}

/** A page's corners in a picture, clockwise from its top left. */
export type Quad = [Point, Point, Point, Point];

/** The whole picture, or the picture less `inset` (a share of each side). */
export function fullQuad(width: number, height: number, inset = 0): Quad {
	const dx = width * inset;
	const dy = height * inset;
	return [
		{ x: dx, y: dy },
		{ x: width - dx, y: dy },
		{ x: width - dx, y: height - dy },
		{ x: dx, y: height - dy },
	];
}

/** Four points in any order as a quad: clockwise around their middle,
 * starting from the one nearest the picture's top left. */
export function orderCorners(points: Point[]): Quad {
	const cx = points.reduce((n, p) => n + p.x, 0) / points.length;
	const cy = points.reduce((n, p) => n + p.y, 0) / points.length;
	const round = [...points].sort(
		(a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
	);
	let first = 0;
	for (let i = 1; i < round.length; i++)
		if (round[i].x + round[i].y < round[first].x + round[first].y) first = i;
	return [0, 1, 2, 3].map((i) => round[(first + i) % 4]) as Quad;
}

const cross = (o: Point, a: Point, b: Point) =>
	(a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** True when the outline has no dent and no crossing: a shape a page
 * could make. */
export function isConvex(q: Quad): boolean {
	let sign = 0;
	for (let i = 0; i < 4; i++) {
		const c = cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
		if (Math.abs(c) < 1e-9) return false;
		const s = Math.sign(c);
		if (sign && s !== sign) return false;
		sign = s;
	}
	return true;
}

export function area(q: Quad): number {
	let a = 0;
	for (let i = 0; i < 4; i++) {
		const p = q[i];
		const n = q[(i + 1) % 4];
		a += p.x * n.y - n.x * p.y;
	}
	return Math.abs(a) / 2;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export const scaleQuad = (q: Quad, by: number): Quad =>
	q.map((p) => ({ x: p.x * by, y: p.y * by })) as Quad;

/** Keep every corner inside a width × height picture. */
export const clampQuad = (q: Quad, width: number, height: number): Quad =>
	q.map((p) => ({
		x: Math.min(width, Math.max(0, p.x)),
		y: Math.min(height, Math.max(0, p.y)),
	})) as Quad;

/** The straightened page's size in pixels: as long as its longer
 * opposite edges, no side above `maxSide`. */
export function pageSize(
	q: Quad,
	maxSide = Number.POSITIVE_INFINITY,
): { width: number; height: number } {
	const w = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
	const h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
	const by = Math.min(1, maxSide / Math.max(w, h, 1));
	return {
		width: Math.max(1, Math.round(w * by)),
		height: Math.max(1, Math.round(h * by)),
	};
}

/**
 * The projective map that takes the rectangle 0..width × 0..height to
 * the quad: [a, b, c, d, e, f, g, h] with
 * x' = (a x + b y + c) / (g x + h y + 1), y' = (d x + e y + f) / (…).
 */
export function rectToQuad(width: number, height: number, q: Quad): number[] {
	const from: Point[] = [
		{ x: 0, y: 0 },
		{ x: width, y: 0 },
		{ x: width, y: height },
		{ x: 0, y: height },
	];
	// Eight equations, eight unknowns.
	const m: number[][] = [];
	for (let i = 0; i < 4; i++) {
		const { x, y } = from[i];
		const { x: u, y: v } = q[i];
		m.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
		m.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
	}
	for (let col = 0; col < 8; col++) {
		let pivot = col;
		for (let r = col + 1; r < 8; r++)
			if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
		[m[col], m[pivot]] = [m[pivot], m[col]];
		const p = m[col][col];
		if (Math.abs(p) < 1e-12) throw new Error("degenerate quad");
		for (let k = col; k < 9; k++) m[col][k] /= p;
		for (let r = 0; r < 8; r++) {
			if (r === col) continue;
			const f = m[r][col];
			if (!f) continue;
			for (let k = col; k < 9; k++) m[r][k] -= f * m[col][k];
		}
	}
	return m.map((row) => row[8]);
}

export function project(h: number[], x: number, y: number): Point {
	const w = h[6] * x + h[7] * y + 1;
	return {
		x: (h[0] * x + h[1] * y + h[2]) / w,
		y: (h[3] * x + h[4] * y + h[5]) / w,
	};
}

/** The largest corner-to-corner gap between two quads. */
export const quadGap = (a: Quad, b: Quad): number =>
	Math.max(...a.map((p, i) => dist(p, b[i])));
