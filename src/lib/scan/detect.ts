/**
 * Finding the page in a photo, on the device.
 *
 * Two finders look, and the answer is the one to trust:
 * - a small neural network (DocCornerNet, 1.9 MB, through a trimmed
 *   ONNX Runtime) that finds a page against a busy desk or a page as
 *   pale as the table it lies on;
 * - scanic's edge tracer, which follows the paper's real edges and so
 *   is the more exact of the two when the page stands out clearly.
 * When both agree the traced edges win; when they do not, the network
 * is believed; when neither is sure, the whole photo is offered, a
 * little inset, for the reader to drag into place.
 *
 * Everything the network needs ships with the app: nothing is fetched
 * from anywhere but the app itself.
 */
import modelUrl from "scanic-ml/dist/doccornernet_lean.ort?url";
import ortMjs from "scanic-ml/dist/ort-wasm-simd-threaded.mjs?url";
import ortWasm from "scanic-ml/dist/ort-wasm-simd-threaded.wasm?url";
import {
	type Quad,
	area,
	fullQuad,
	isConvex,
	orderCorners,
	quadGap,
} from "./geometry";

type Scanic = typeof import("scanic");
type Corners = NonNullable<
	Awaited<ReturnType<Scanic["scanDocument"]>>["corners"]
>;

let scanic: Promise<Scanic> | null = null;
const load = () => {
	scanic ??= import("scanic").catch((err) => {
		scanic = null;
		throw err;
	});
	return scanic;
};

/** The finders are loaded ahead of need (while a photo decodes). */
export function warmUp(): void {
	load().catch(() => {});
}

const asQuad = (c: Corners | null | undefined): Quad | null =>
	c ? orderCorners([c.topLeft, c.topRight, c.bottomRight, c.bottomLeft]) : null;

/** A shape a page could make in a width × height photo. */
function plausible(q: Quad | null, width: number, height: number): q is Quad {
	if (!q || !isConvex(q)) return false;
	return area(q) >= width * height * 0.06;
}

export interface Found {
	quad: Quad;
	/** False when the finders were unsure and the whole photo is offered. */
	found: boolean;
	/** Which finder's answer was taken, for tests and diagnostics. */
	by: "edges" | "model" | "none";
}

/** Where the page is in `image` (pixels of `image`). Never throws: a
 * failure offers the whole photo. */
export async function findPage(
	image: HTMLCanvasElement | ImageBitmap,
): Promise<Found> {
	const { width, height } = image;
	const none: Found = {
		quad: fullQuad(width, height, 0.04),
		found: false,
		by: "none",
	};
	let lib: Scanic;
	try {
		lib = await load();
	} catch {
		return none;
	}
	const [model, edges] = await Promise.all([
		lib
			.scanDocument(image, {
				detector: "ml",
				ml: {
					modelUrl,
					// The runtime's loader and its wasm, as the app serves them.
					wasmPaths: { mjs: ortMjs, wasm: ortWasm } as unknown as string,
					numThreads: 1,
					modelFetchTimeoutMs: 0,
					minScore: 0.5,
				},
			})
			.catch(() => null),
		lib
			.scanDocument(image, { mode: "detect", maxProcessingDimension: 800 })
			.catch(() => null),
	]);
	const byModel = model?.success ? asQuad(model.corners) : null;
	const byEdges = edges?.success ? asQuad(edges.corners) : null;
	const okModel = plausible(byModel, width, height);
	const okEdges = plausible(byEdges, width, height);
	const diagonal = Math.hypot(width, height);
	if (okModel && okEdges && quadGap(byModel, byEdges) < diagonal * 0.035)
		return { quad: byEdges, found: true, by: "edges" };
	if (okModel) return { quad: byModel, found: true, by: "model" };
	// Without the network's word, traced edges must cover a fair part of
	// the photo: a small rectangle is more often a label than the page.
	if (okEdges && area(byEdges) >= width * height * 0.2)
		return { quad: byEdges, found: true, by: "edges" };
	return none;
}
