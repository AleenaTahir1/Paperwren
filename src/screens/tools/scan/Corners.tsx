import { msg, t } from "@/lib/i18n";
import { type Point, type Quad, isConvex } from "@/lib/scan/geometry";
import {
	type KeyboardEvent,
	type PointerEvent,
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import s from "./Scan.module.css";

const CORNERS = [
	msg("Top left corner"),
	msg("Top right corner"),
	msg("Bottom right corner"),
	msg("Bottom left corner"),
];
const EDGES = [
	msg("Top edge"),
	msg("Right edge"),
	msg("Bottom edge"),
	msg("Left edge"),
];

/** Room kept around the picture inside the stage, in CSS pixels. */
const GUTTER = 24;
const LOUPE = 128;
const ZOOM = 3;

/** Fit a width × height picture into the stage, centred. */
export function useFit(
	stage: React.RefObject<HTMLElement | null>,
	width: number,
	height: number,
) {
	const [box, setBox] = useState({ left: 0, top: 0, scale: 0 });
	useLayoutEffect(() => {
		const el = stage.current;
		if (!el || !width || !height) return;
		const fit = () => {
			const w = Math.max(1, el.clientWidth - GUTTER * 2);
			const h = Math.max(1, el.clientHeight - GUTTER * 2);
			const scale = Math.min(w / width, h / height);
			setBox({
				scale,
				left: (el.clientWidth - width * scale) / 2,
				top: (el.clientHeight - height * scale) / 2,
			});
		};
		fit();
		const ro = new ResizeObserver(fit);
		ro.observe(el);
		return () => ro.disconnect();
	}, [stage, width, height]);
	return box;
}

/** Draw `from` into a canvas once it is mounted (and again if it changes). */
export function usePainted(
	from: CanvasImageSource | null,
	width: number,
	height: number,
	quarters = 0,
) {
	const [el, setEl] = useState<HTMLCanvasElement | null>(null);
	useEffect(() => {
		const ctx = el?.getContext("2d");
		if (!el || !ctx || !from) return;
		el.width = width;
		el.height = height;
		ctx.save();
		ctx.translate(width / 2, height / 2);
		ctx.rotate((quarters * Math.PI) / 2);
		const [w, h] = quarters % 2 ? [height, width] : [width, height];
		ctx.imageSmoothingQuality = "high";
		try {
			ctx.drawImage(from, -w / 2, -h / 2, w, h);
		} catch {
			// A picture already let go of: the next one is on its way.
		}
		ctx.restore();
	}, [el, from, width, height, quarters]);
	return setEl;
}

interface Drag {
	/** 0-3 a corner, 4-7 the edge after that corner. */
	which: number;
	from: Point;
	start: Quad;
	id: number;
}

/**
 * The photo with the page's outline over it: four corners and four
 * edges to drag (or move with the arrow keys), a magnifier beside the
 * finger while a corner moves, and the rest of the photo dimmed.
 */
export function Corners({
	image,
	quad,
	onChange,
	showHandles,
	children,
}: {
	image: HTMLCanvasElement;
	/** In `image` pixels. */
	quad: Quad;
	onChange: (quad: Quad) => void;
	showHandles: boolean;
	/** Drawn over the photo (what is happening, while it happens). */
	children?: ReactNode;
}) {
	const stage = useRef<HTMLDivElement>(null);
	const frame = useRef<HTMLDivElement>(null);
	const { width, height } = image;
	const box = useFit(stage, width, height);
	const canvas = usePainted(image, width, height);
	const drag = useRef<Drag | null>(null);
	const [active, setActive] = useState<number | null>(null);
	const loupe = useRef<HTMLCanvasElement>(null);
	const scale = box.scale || 1;
	const good = isConvex(quad);
	// The outline as last changed here, ahead of the next render: keys
	// held down repeat faster than the screen redraws.
	const latest = useRef(quad);
	latest.current = quad;

	const toImage = (e: { clientX: number; clientY: number }): Point => {
		const rect = frame.current?.getBoundingClientRect();
		if (!rect || !rect.width) return { x: 0, y: 0 };
		const k = rect.width / width;
		return { x: (e.clientX - rect.left) / k, y: (e.clientY - rect.top) / k };
	};
	const clamp = (p: Point): Point => ({
		x: Math.min(width, Math.max(0, p.x)),
		y: Math.min(height, Math.max(0, p.y)),
	});
	/** Move corner or edge `which` of `start` by (dx, dy). */
	const moved = (start: Quad, which: number, dx: number, dy: number): Quad => {
		const next = start.map((p) => ({ ...p })) as Quad;
		const ends = which < 4 ? [which] : [which - 4, (which - 3) % 4];
		// An edge moves only as far as both its corners can.
		let mx = dx;
		let my = dy;
		for (const i of ends) {
			mx = Math.min(width - start[i].x, Math.max(-start[i].x, mx));
			my = Math.min(height - start[i].y, Math.max(-start[i].y, my));
		}
		for (const i of ends)
			next[i] = clamp({ x: start[i].x + mx, y: start[i].y + my });
		return next;
	};
	const focusPoint = (q: Quad, which: number): Point => {
		if (which < 4) return q[which];
		const a = q[which - 4];
		const b = q[(which - 3) % 4];
		return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
	};

	const down = (which: number) => (e: PointerEvent<SVGElement>) => {
		if (e.button !== 0) return;
		e.preventDefault();
		try {
			(e.currentTarget as Element).setPointerCapture(e.pointerId);
		} catch {
			// The svg still hears the moves while the pointer stays over it.
		}
		drag.current = { which, from: toImage(e), start: quad, id: e.pointerId };
		setActive(which);
	};
	const move = (e: PointerEvent<SVGElement>) => {
		const d = drag.current;
		if (!d || d.id !== e.pointerId) return;
		const at = toImage(e);
		onChange(moved(d.start, d.which, at.x - d.from.x, at.y - d.from.y));
	};
	const up = (e: PointerEvent<SVGElement>) => {
		if (drag.current?.id !== e.pointerId) return;
		drag.current = null;
		setActive(null);
	};
	const key = (which: number) => (e: KeyboardEvent<SVGElement>) => {
		const step = Math.max(width, height) * (e.shiftKey ? 0.02 : 0.004);
		const by: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, -step],
			ArrowDown: [0, step],
		};
		const d = by[e.key];
		if (!d) return;
		e.preventDefault();
		e.stopPropagation();
		const next = moved(latest.current, which, d[0], d[1]);
		latest.current = next;
		onChange(next);
	};

	// The magnifier: the photo around the moving point, three times as
	// large as shown, with the outline and a cross at the point.
	const point = active === null ? null : focusPoint(quad, active);
	useEffect(() => {
		const el = loupe.current;
		const ctx = el?.getContext("2d");
		if (!el || !ctx || !point) return;
		const density = Math.min(2, window.devicePixelRatio || 1);
		const size = LOUPE * density;
		el.width = size;
		el.height = size;
		const side = LOUPE / (scale * ZOOM);
		const sx = point.x - side / 2;
		const sy = point.y - side / 2;
		const k = size / side;
		ctx.fillStyle = "#000";
		ctx.fillRect(0, 0, size, size);
		ctx.imageSmoothingQuality = "high";
		try {
			ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
		} catch {
			return;
		}
		const accent =
			getComputedStyle(el).getPropertyValue("--accent").trim() || "#2b6e66";
		ctx.strokeStyle = accent;
		ctx.lineWidth = 2 * density;
		ctx.beginPath();
		quad.forEach((p, i) => {
			const x = (p.x - sx) * k;
			const y = (p.y - sy) * k;
			if (i) ctx.lineTo(x, y);
			else ctx.moveTo(x, y);
		});
		ctx.closePath();
		ctx.stroke();
		const c = size / 2;
		const arm = 9 * density;
		for (const [color, w] of [
			["rgba(0,0,0,0.7)", 3.5],
			["#fff", 1.5],
		] as const) {
			ctx.strokeStyle = color;
			ctx.lineWidth = w * density;
			ctx.beginPath();
			ctx.moveTo(c - arm, c);
			ctx.lineTo(c + arm, c);
			ctx.moveTo(c, c - arm);
			ctx.lineTo(c, c + arm);
			ctx.stroke();
		}
	});
	// Beside the finger, never under it: the far top corner of the
	// photo, or the bottom when the finger is near the top.
	const loupeAt = point
		? {
				left:
					point.x * scale < (width * scale) / 2 ? width * scale - LOUPE - 8 : 8,
				top:
					point.y * scale < LOUPE + 40 && height * scale > LOUPE * 2 + 40
						? height * scale - LOUPE - 8
						: 8,
			}
		: null;

	const r = (px: number) => px / scale;
	const touch =
		typeof window !== "undefined" &&
		window.matchMedia?.("(pointer: coarse)").matches;
	const hit = r(touch ? 26 : 18);
	const path = `M0 0H${width}V${height}H0Z M${quad.map((p) => `${p.x} ${p.y}`).join("L")}Z`;

	return (
		<div ref={stage} className={s.stage}>
			{box.scale > 0 && (
				<div
					ref={frame}
					className={s.frame}
					style={{
						left: box.left,
						top: box.top,
						width: width * box.scale,
						height: height * box.scale,
					}}
				>
					<canvas ref={canvas} />
					<svg
						className={s.overlay}
						viewBox={`0 0 ${width} ${height}`}
						preserveAspectRatio="none"
						onPointerMove={move}
						onPointerUp={up}
						onPointerCancel={up}
						data-testid="scan-corners"
					>
						<title>{t("The page's outline")}</title>
						<path className={s.mask} d={path} />
						<polygon
							className={s.outline}
							data-bad={!good || undefined}
							points={quad.map((p) => `${p.x},${p.y}`).join(" ")}
						/>
						{showHandles && (
							<g className={s.handles}>
								{quad.map((p, i) => {
									const n = quad[(i + 1) % 4];
									const mid = { x: (p.x + n.x) / 2, y: (p.y + n.y) / 2 };
									return (
										<g key={`e${i}`}>
											<circle
												className={s.hit}
												cx={mid.x}
												cy={mid.y}
												r={hit * 0.8}
												tabIndex={0}
												role="button"
												aria-label={t(EDGES[i])}
												onPointerDown={down(4 + i)}
												onKeyDown={key(4 + i)}
												data-testid={`scan-edge-${i}`}
											/>
											<circle
												className={s.edgeHandle}
												cx={mid.x}
												cy={mid.y}
												r={r(6)}
											/>
										</g>
									);
								})}
								{quad.map((p, i) => (
									<g key={`c${i}`}>
										<circle
											className={s.hit}
											cx={p.x}
											cy={p.y}
											r={hit}
											tabIndex={0}
											role="button"
											aria-label={t(CORNERS[i])}
											onPointerDown={down(i)}
											onKeyDown={key(i)}
											data-testid={`scan-corner-${i}`}
										/>
										<circle
											className={s.handle}
											cx={p.x}
											cy={p.y}
											r={r(active === i ? 13 : 10)}
										/>
									</g>
								))}
							</g>
						)}
					</svg>
					{loupeAt && (
						<div className={s.loupe} style={loupeAt} aria-hidden="true">
							<canvas ref={loupe} />
						</div>
					)}
					{children}
				</div>
			)}
		</div>
	);
}
