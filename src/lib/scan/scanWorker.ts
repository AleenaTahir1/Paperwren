/**
 * Straightens and cleans a scanned page off the main thread, so the
 * screen keeps moving while it works. One worker holds one photo.
 */
import { type Quad, pageSize } from "./geometry";
import {
	LOOKS,
	type Look,
	type Pixels,
	allLooks,
	applyLook,
	turn,
	warp,
} from "./pixels";

export type ScanRequest =
	| { kind: "load"; bitmap: ImageBitmap }
	| { kind: "looks"; quad: Quad; quarters: number; size: number }
	| {
			kind: "render";
			quad: Quad;
			quarters: number;
			look: Look;
			maxSide: number;
			quality: number;
			thumb: number;
	  };

export type ScanAnswer =
	| { ok: true; kind: "load" }
	| { ok: true; kind: "looks"; looks: Record<Look, ImageBitmap> }
	| {
			ok: true;
			kind: "render";
			jpeg: Blob;
			thumb: Blob;
			width: number;
			height: number;
	  }
	| { ok: false; error: string };

let source: ImageBitmap | null = null;

/** The part of the photo inside `box`, drawn `by` its size (smaller
 * reads cleaner than sampling a big photo sparsely). */
function photoPixels(
	box: { x: number; y: number; w: number; h: number },
	by: number,
): Pixels {
	if (!source) throw new Error("no photo");
	const width = Math.max(1, Math.round(box.w * by));
	const height = Math.max(1, Math.round(box.h * by));
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) throw new Error("no canvas");
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(source, box.x, box.y, box.w, box.h, 0, 0, width, height);
	const { data } = ctx.getImageData(0, 0, width, height);
	return { data, width, height };
}

/** The straightened page, no side above `maxSide`. */
function straighten(quad: Quad, quarters: number, maxSide: number): Pixels {
	if (!source) throw new Error("no photo");
	const natural = pageSize(quad);
	const fit = Math.min(1, maxSide / Math.max(natural.width, natural.height));
	// Draw the photo a little larger than the page will be, then sample;
	// only the part around the page is drawn at all.
	const by = Math.min(1, fit * 1.25);
	const xs = quad.map((p) => p.x);
	const ys = quad.map((p) => p.y);
	const x = Math.max(0, Math.floor(Math.min(...xs)) - 1);
	const y = Math.max(0, Math.floor(Math.min(...ys)) - 1);
	const box = {
		x,
		y,
		w: Math.max(1, Math.min(source.width, Math.ceil(Math.max(...xs)) + 1) - x),
		h: Math.max(1, Math.min(source.height, Math.ceil(Math.max(...ys)) + 1) - y),
	};
	const q = quad.map((p) => ({
		x: (p.x - x) * by,
		y: (p.y - y) * by,
	})) as Quad;
	const { width, height } = pageSize(q, maxSide);
	return turn(warp(photoPixels(box, by), q, width, height), quarters);
}

function canvasOf(p: Pixels): OffscreenCanvas {
	const canvas = new OffscreenCanvas(p.width, p.height);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("no canvas");
	ctx.putImageData(new ImageData(p.data, p.width, p.height), 0, 0);
	return canvas;
}

async function handle(req: ScanRequest): Promise<ScanAnswer> {
	if (req.kind === "load") {
		source?.close();
		source = req.bitmap;
		return { ok: true, kind: "load" };
	}
	if (req.kind === "looks") {
		const all = allLooks(straighten(req.quad, req.quarters, req.size));
		const looks = {} as Record<Look, ImageBitmap>;
		for (const look of LOOKS) {
			const p = all[look];
			looks[look] = await createImageBitmap(
				new ImageData(p.data, p.width, p.height),
			);
		}
		return { ok: true, kind: "looks", looks };
	}
	const page = applyLook(
		straighten(req.quad, req.quarters, req.maxSide),
		req.look,
	);
	const canvas = canvasOf(page);
	const jpeg = await canvas.convertToBlob({
		type: "image/jpeg",
		quality: req.quality,
	});
	const by = Math.min(1, req.thumb / Math.max(page.width, page.height));
	const small = new OffscreenCanvas(
		Math.max(1, Math.round(page.width * by)),
		Math.max(1, Math.round(page.height * by)),
	);
	const sctx = small.getContext("2d");
	if (!sctx) throw new Error("no canvas");
	sctx.imageSmoothingQuality = "high";
	sctx.drawImage(canvas, 0, 0, small.width, small.height);
	const thumb = await small.convertToBlob({ type: "image/jpeg", quality: 0.8 });
	return {
		ok: true,
		kind: "render",
		jpeg,
		thumb,
		width: page.width,
		height: page.height,
	};
}

// One request at a time, in the order they came.
let queue: Promise<unknown> = Promise.resolve();
self.onmessage = (e: MessageEvent<ScanRequest>) => {
	queue = queue.then(async () => {
		let answer: ScanAnswer;
		try {
			answer = await handle(e.data);
		} catch (err) {
			answer = { ok: false, error: String(err) };
		}
		const moving =
			answer.ok && answer.kind === "looks" ? Object.values(answer.looks) : [];
		(self as unknown as Worker).postMessage(answer, moving);
	});
};
