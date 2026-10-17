/**
 * pdf.js, loaded once when a PDF is first shown or a tool needs to
 * draw one, with the files it reads shipped inside the app.
 */

import type { PDFDocumentProxy } from "pdfjs-dist";

/** Where pdf.js finds its character maps and standard fonts: beside
 * the app (see vite.config.ts), never on the network. */
export const pdfAsset = (dir: string) =>
	new URL(`pdfjs/${dir}/`, document.baseURI).toString();

export async function loadEngine() {
	const pdfjs = await import("pdfjs-dist");
	pdfjs.GlobalWorkerOptions.workerSrc = new URL(
		"pdfjs-dist/build/pdf.worker.min.mjs",
		import.meta.url,
	).toString();
	// pdf_viewer.mjs reads the core library from this global.
	(globalThis as { pdfjsLib?: unknown }).pdfjsLib = pdfjs;
	const viewer = await import("pdfjs-dist/web/pdf_viewer.mjs");
	return { pdfjs, viewer };
}

/** A PDF opened for drawing its pages (a tool's thumbnails, Fill &
 * sign from a tool). pdf.js is handed a copy: the bytes stay usable. */
export async function openPdf(
	bytes: Uint8Array,
	password?: string,
): Promise<PDFDocumentProxy> {
	const { pdfjs } = await loadEngine();
	return pdfjs.getDocument({
		data: bytes.slice(),
		password,
		isEvalSupported: false,
		cMapUrl: pdfAsset("cmaps"),
		cMapPacked: true,
		standardFontDataUrl: pdfAsset("standard_fonts"),
	}).promise;
}
