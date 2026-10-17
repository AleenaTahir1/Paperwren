import { backend } from "@/lib/backend";
import { t } from "@/lib/i18n";
import {
	type Signature,
	inkBounds,
	inkFromPaper,
	keepSignature,
} from "@/lib/signatures";
import { Button, Dialog, toast } from "@/ui";
import { ImageUp, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import s from "./Tools.module.css";

type Way = "draw" | "type" | "photo";

/** Faces for a typed signature, as the system has them: no fonts are
 * downloaded. The last of each list is there everywhere. */
const HANDS = [
	'"Segoe Script", "Snell Roundhand", "Brush Script MT", "URW Chancery L", cursive',
	'"Lucida Handwriting", "Apple Chancery", "Comic Sans MS", cursive',
	'Georgia, "Noto Serif", "Times New Roman", serif',
];
const INKS = ["#111111", "#1a3c8c"];
/** Pixels per CSS pixel the pad draws at, for a sharp signature. */
const DENSITY = 2;
/** The widest a kept signature is, in pixels. */
const MAX_WIDTH = 1200;

/** What is drawn on `canvas`, cut to its ink, as a signature. */
function cut(canvas: HTMLCanvasElement, initials: boolean): Signature | null {
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const box = inkBounds(data, canvas.width, canvas.height, 8);
	if (!box) return null;
	const scale = Math.min(1, MAX_WIDTH / box.w);
	const out = document.createElement("canvas");
	out.width = Math.max(1, Math.round(box.w * scale));
	out.height = Math.max(1, Math.round(box.h * scale));
	out
		.getContext("2d")
		?.drawImage(
			canvas,
			box.x,
			box.y,
			box.w,
			box.h,
			0,
			0,
			out.width,
			out.height,
		);
	return {
		id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
		src: out.toDataURL("image/png"),
		w: out.width,
		h: out.height,
		initials: initials || undefined,
	};
}

/**
 * Make a signature: draw it with a finger, a pen or the mouse; type it
 * in a handwriting face; or take it from a photo of one signed on
 * paper, whose paper is made clear. It can be kept on this device for
 * the next form.
 */
export function SignaturePad({
	initials = false,
	onDone,
	onClose,
}: {
	initials?: boolean;
	onDone: (signature: Signature) => void;
	onClose: () => void;
}) {
	const [way, setWay] = useState<Way>("draw");
	const [ink, setInk] = useState(INKS[0]);
	const [typed, setTyped] = useState("");
	const [hand, setHand] = useState(0);
	const [keep, setKeep] = useState(true);
	const [drawn, setDrawn] = useState(false);
	const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
	const pad = useRef<HTMLCanvasElement>(null);
	const strokes = useRef<Array<Array<[number, number]>>>([]);

	// The pad draws at a density of its own, whatever its size on screen.
	// biome-ignore lint/correctness/useExhaustiveDependencies: redrawn when the ink changes
	useEffect(() => {
		const canvas = pad.current;
		if (!canvas || way !== "draw") return;
		const fit = () => {
			const box = canvas.getBoundingClientRect();
			canvas.width = Math.round(box.width * DENSITY);
			canvas.height = Math.round(box.height * DENSITY);
			redraw();
		};
		fit();
		const ro = new ResizeObserver(fit);
		ro.observe(canvas);
		return () => ro.disconnect();
	}, [way, ink]);

	const redraw = () => {
		const canvas = pad.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.strokeStyle = ink;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.lineWidth = 2.6 * DENSITY;
		for (const line of strokes.current) {
			const at = (i: number) =>
				[line[i][0] * canvas.width, line[i][1] * canvas.height] as const;
			ctx.beginPath();
			const [x0, y0] = at(0);
			ctx.moveTo(x0, y0);
			if (line.length === 1) ctx.lineTo(x0 + 0.1, y0);
			// Through the middle of each step: a smooth line, not a chain.
			for (let i = 1; i < line.length - 1; i++) {
				const [x, y] = at(i);
				const [nx, ny] = at(i + 1);
				ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
			}
			if (line.length > 1) {
				const [x, y] = at(line.length - 1);
				ctx.lineTo(x, y);
			}
			ctx.stroke();
		}
	};

	const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const box = e.currentTarget.getBoundingClientRect();
		return [
			(e.clientX - box.left) / box.width,
			(e.clientY - box.top) / box.height,
		] as [number, number];
	};

	const fromPhoto = async () => {
		const picked = await backend.pickFile().catch(() => null);
		if (!picked) return;
		try {
			const bytes = await backend.read(picked.reopen);
			const bitmap = await createImageBitmap(new Blob([bytes]));
			const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
			const canvas = document.createElement("canvas");
			canvas.width = Math.round(bitmap.width * scale);
			canvas.height = Math.round(bitmap.height * scale);
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
			const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
			inkFromPaper(image.data);
			ctx.putImageData(image, 0, 0);
			setPhoto(canvas);
		} catch {
			toast(t("That picture couldn't be read"));
		}
	};

	/** The signature as made, drawn on a canvas of its own. */
	const made = (): HTMLCanvasElement | null => {
		if (way === "draw") return drawn ? pad.current : null;
		if (way === "photo") return photo;
		if (!typed.trim()) return null;
		const canvas = document.createElement("canvas");
		const size = 120;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		const font = `${hand === 2 ? "italic " : ""}${size}px ${HANDS[hand]}`;
		ctx.font = font;
		canvas.width = Math.ceil(ctx.measureText(typed).width + size);
		canvas.height = Math.ceil(size * 1.8);
		ctx.font = font;
		ctx.fillStyle = ink;
		ctx.textBaseline = "middle";
		ctx.fillText(typed, size / 2, canvas.height / 2);
		return canvas;
	};

	const done = async () => {
		const canvas = made();
		const signature = canvas ? cut(canvas, initials) : null;
		if (!signature) return;
		if (keep) await keepSignature(signature);
		onDone(signature);
	};
	const ready =
		way === "draw" ? drawn : way === "photo" ? !!photo : !!typed.trim();

	return (
		<Dialog
			open
			title={initials ? t("Your initials") : t("Your signature")}
			onClose={onClose}
			testId="signature-pad"
			actions={
				<>
					<Button variant="ghost" onClick={onClose}>
						{t("Cancel")}
					</Button>
					<Button onClick={done} disabled={!ready} data-testid="signature-done">
						{t("Use it")}
					</Button>
				</>
			}
		>
			<div className={s.ways} role="tablist">
				{(
					[
						["draw", t("Draw")],
						["type", t("Type")],
						["photo", t("Photo")],
					] as const
				).map(([value, label]) => (
					<button
						key={value}
						type="button"
						role="tab"
						aria-selected={way === value}
						className={s.way}
						onClick={() => setWay(value)}
						data-testid={`signature-${value}`}
					>
						{label}
					</button>
				))}
			</div>

			{way === "draw" && (
				<div className={s.padBox}>
					<canvas
						ref={pad}
						className={s.pad}
						aria-label={t("Sign here")}
						onPointerDown={(e) => {
							e.currentTarget.setPointerCapture(e.pointerId);
							strokes.current.push([point(e)]);
							setDrawn(true);
							redraw();
						}}
						onPointerMove={(e) => {
							if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
							strokes.current[strokes.current.length - 1]?.push(point(e));
							redraw();
						}}
						data-testid="signature-canvas"
					/>
					<span className={s.padLine} aria-hidden="true" />
					<div className={s.padTools}>
						{INKS.map((colour) => (
							<button
								key={colour}
								type="button"
								className={s.inkDot}
								style={{ background: colour }}
								aria-pressed={ink === colour}
								aria-label={colour === INKS[0] ? t("Black ink") : t("Blue ink")}
								onClick={() => setInk(colour)}
							/>
						))}
						<Button
							variant="ghost"
							disabled={!drawn}
							onClick={() => {
								strokes.current.pop();
								setDrawn(strokes.current.length > 0);
								redraw();
							}}
						>
							<Undo2 size={16} /> {t("Undo")}
						</Button>
						<Button
							variant="ghost"
							disabled={!drawn}
							onClick={() => {
								strokes.current = [];
								setDrawn(false);
								redraw();
							}}
							data-testid="signature-clear"
						>
							{t("Clear")}
						</Button>
					</div>
				</div>
			)}

			{way === "type" && (
				<div className={s.typed}>
					<input
						className={s.field}
						value={typed}
						onChange={(e) => setTyped(e.target.value)}
						placeholder={initials ? t("Your initials") : t("Your name")}
						aria-label={initials ? t("Your initials") : t("Your name")}
						autoComplete="name"
						data-testid="signature-name"
					/>
					{HANDS.map((family, i) => (
						<button
							key={family}
							type="button"
							className={s.hand}
							aria-pressed={hand === i}
							style={{
								fontFamily: family,
								fontStyle: i === 2 ? "italic" : undefined,
								color: ink,
							}}
							onClick={() => setHand(i)}
						>
							{typed || (initials ? "A.K." : t("Your name"))}
						</button>
					))}
				</div>
			)}

			{way === "photo" && (
				<div className={s.photo}>
					{photo ? (
						<img
							className={s.photoPreview}
							src={photo.toDataURL("image/png")}
							alt={t("Your signature")}
						/>
					) : (
						<p className={s.hint}>
							{t(
								"Sign a white sheet of paper with a dark pen and take a photo of it. The paper is made clear.",
							)}
						</p>
					)}
					<Button
						variant="secondary"
						onClick={fromPhoto}
						data-testid="signature-pick"
					>
						<ImageUp size={18} />{" "}
						{photo ? t("Pick another") : t("Pick a photo")}
					</Button>
				</div>
			)}

			<label className={s.keep}>
				<input
					type="checkbox"
					checked={keep}
					onChange={(e) => setKeep(e.target.checked)}
					data-testid="signature-keep"
				/>
				{t("Keep it on this device for next time")}
			</label>
		</Dialog>
	);
}
