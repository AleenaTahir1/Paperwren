export type Matrix = [number, number, number, number, number, number];
export const multiply = (a: Matrix, b: Matrix): Matrix => [
	a[0] * b[0] + a[2] * b[1],
	a[1] * b[0] + a[3] * b[1],
	a[0] * b[2] + a[2] * b[3],
	a[1] * b[2] + a[3] * b[3],
	a[0] * b[4] + a[2] * b[5] + a[4],
	a[1] * b[4] + a[3] * b[5] + a[5],
];
export const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
export interface TransformBox {
	x: number;
	y: number;
	w: number;
	h: number;
	rot: number;
	flipH: boolean;
	flipV: boolean;
	matrix?: Matrix;
}
/** The complete local transform about the shape's centre. */
export function boxMatrix(b: TransformBox): Matrix {
	if (b.matrix) return b.matrix;
	const radians = (b.rot * Math.PI) / 180;
	const c = Math.cos(radians);
	const s = Math.sin(radians);
	const x = b.flipH ? -1 : 1;
	const y = b.flipV ? -1 : 1;
	return multiply(
		multiply(translate(b.x + b.w / 2, b.y + b.h / 2), [
			c * x,
			s * x,
			-s * y,
			c * y,
			0,
			0,
		]),
		translate(-b.w / 2, -b.h / 2),
	);
}
