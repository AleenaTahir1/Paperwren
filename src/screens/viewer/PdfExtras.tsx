/**
 * What a PDF carries besides its pages: files attached to it, the
 * comments and highlights its readers left, and layers that can be
 * shown or hidden. Each is only read when asked for.
 */

import { formatBytes } from "@/lib/backend";
import { locale, msg, t } from "@/lib/i18n";
import { Spinner } from "@/ui";
import { Eye, EyeOff, File as FileIcon } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useState } from "react";
import s from "./PdfView.module.css";
import { shellStyles } from "./Shell";

// ---------- attachments ----------

export interface Attachment {
	name: string;
	bytes: Uint8Array;
	description?: string;
}

/** The files attached to the document as a whole. */
export async function readAttachments(
	doc: PDFDocumentProxy,
): Promise<Attachment[]> {
	const found = (await doc.getAttachments()) as Record<
		string,
		{ filename?: string; content?: Uint8Array; description?: string }
	> | null;
	if (!found) return [];
	return Object.entries(found)
		.filter(([, file]) => file?.content?.byteLength)
		.map(([key, file]) => ({
			name: (file.filename || key).split(/[\\/]/).pop() || key,
			bytes: file.content as Uint8Array,
			description: file.description || undefined,
		}));
}

export function AttachmentList({
	items,
	onOpen,
	compact = false,
}: {
	items: Attachment[];
	onOpen: (item: Attachment) => void;
	compact?: boolean;
}) {
	return (
		<>
			{items.map((item) => (
				<button
					type="button"
					key={item.name}
					className={`${compact ? shellStyles.sideItem : s.outline} ${s.extra}`}
					title={item.description ?? item.name}
					onClick={() => onOpen(item)}
					data-testid="pdf-attachment"
				>
					<FileIcon size={16} aria-hidden="true" />
					<span className={s.extraText}>
						<span dir="auto">{item.name}</span>
						<small>{formatBytes(item.bytes.byteLength)}</small>
					</span>
				</button>
			))}
		</>
	);
}

// ---------- comments ----------

export interface Comment {
	page: number;
	kind: string;
	text: string;
	author?: string;
	/** Where it sits on its page, in the page's own space. */
	rect: number[];
}

const KINDS: Record<string, string> = {
	Text: msg("Note"),
	FreeText: msg("Text box"),
	Highlight: msg("Highlight"),
	Underline: msg("Underline"),
	Squiggly: msg("Underline"),
	StrikeOut: msg("Strikethrough"),
	Ink: msg("Drawing"),
	Square: msg("Shape"),
	Circle: msg("Shape"),
	Line: msg("Shape"),
	Polygon: msg("Shape"),
	PolyLine: msg("Shape"),
	Stamp: msg("Stamp"),
	Caret: msg("Insertion"),
};
/** Marks that say something without words: listed even when empty. */
const MARKS = new Set(["Highlight", "Underline", "Squiggly", "StrikeOut"]);

/** How many pages are read for comments before the list is shown. */
const BATCH = 20;

/**
 * The comments of a document, read page by page while `on`; the list
 * grows as they are found. `done` once every page was read.
 */
export function useComments(doc: PDFDocumentProxy | null, on: boolean) {
	const [state, setState] = useState<{ items: Comment[]; done: boolean }>({
		items: [],
		done: false,
	});
	const [started, setStarted] = useState(false);
	if (on && !started) setStarted(true);
	useEffect(() => {
		if (!doc || !started) return;
		let alive = true;
		(async () => {
			let found: Comment[] = [];
			for (let n = 1; n <= doc.numPages && alive; n++) {
				const page = await doc.getPage(n);
				const notes = (await page.getAnnotations()) as Array<{
					subtype?: string;
					contentsObj?: { str?: string };
					titleObj?: { str?: string };
					rect?: number[];
				}>;
				for (const note of notes) {
					const kind = note.subtype ?? "";
					const text = note.contentsObj?.str?.trim() ?? "";
					if (!(kind in KINDS) || (!text && !MARKS.has(kind))) continue;
					found.push({
						page: n,
						kind,
						text,
						author: note.titleObj?.str?.trim() || undefined,
						rect: note.rect ?? [],
					});
				}
				if (n % BATCH === 0 && alive) {
					setState({ items: found, done: false });
					found = [...found];
				}
			}
			if (alive) setState({ items: found, done: true });
		})().catch(() => alive && setState((s) => ({ ...s, done: true })));
		return () => {
			alive = false;
		};
	}, [doc, started]);
	return state;
}

export function CommentList({
	items,
	done,
	onPick,
	compact = false,
}: {
	items: Comment[];
	done: boolean;
	onPick: (item: Comment) => void;
	compact?: boolean;
}) {
	return (
		<>
			{items.map((item, i) => (
				<button
					type="button"
					key={i}
					className={`${compact ? shellStyles.sideItem : s.outline} ${s.extra} ${s.comment}`}
					onClick={() => onPick(item)}
					data-testid="pdf-comment"
				>
					<span className={s.extraText}>
						<small>
							{[
								t("Page {n}", { n: item.page }),
								t(KINDS[item.kind] ?? KINDS.Text),
								item.author,
							]
								.filter(Boolean)
								.join(" · ")}
						</small>
						{item.text && <span dir="auto">{item.text}</span>}
					</span>
				</button>
			))}
			{!done && (
				<div className={s.extraBusy}>
					<Spinner label={t("Looking for comments")} />
				</div>
			)}
			{done && !items.length && (
				<p className={shellStyles.sideEmpty}>{t("This PDF has no comments")}</p>
			)}
		</>
	);
}

// ---------- layers ----------

export interface Layer {
	id: string;
	name: string;
	visible: boolean;
}

/** The parts of pdf.js's optional content config this file uses. */
export interface LayerConfig {
	getGroups(): Record<string, { name?: string; visible?: boolean }> | null;
	setVisibility(id: string, visible: boolean): void;
}

export function readLayers(config: LayerConfig | null): Layer[] {
	return Object.entries(config?.getGroups() ?? {}).map(([id, group]) => ({
		id,
		name: group?.name?.trim() || t("Untitled layer"),
		visible: group?.visible !== false,
	}));
}

export function LayerList({
	items,
	onToggle,
	compact = false,
}: {
	items: Layer[];
	onToggle: (layer: Layer) => void;
	compact?: boolean;
}) {
	return (
		<>
			{items.map((layer) => (
				<button
					type="button"
					key={layer.id}
					className={`${compact ? shellStyles.sideItem : s.outline} ${s.extra}`}
					aria-pressed={layer.visible}
					onClick={() => onToggle(layer)}
					data-testid="pdf-layer"
				>
					{layer.visible ? (
						<Eye size={16} aria-hidden="true" />
					) : (
						<EyeOff size={16} aria-hidden="true" />
					)}
					<span className={s.extraText} dir="auto">
						{layer.name}
					</span>
				</button>
			))}
		</>
	);
}

// ---------- details ----------

/** Paper sizes by name, in points (portrait). */
const PAPER: Array<[string, number, number]> = [
	["A3", 842, 1191],
	["A4", 595, 842],
	["A5", 420, 595],
	["Letter", 612, 792],
	["Legal", 612, 1008],
	["Tabloid", 792, 1224],
];

/** A page's size as a person reads it: "210 × 297 mm (A4)", in inches
 * where the reader's country measures paper that way. */
export function pageSize(width: number, height: number): string {
	const near = (a: number, b: number) => Math.abs(a - b) <= 3;
	const named = PAPER.find(
		([, w, h]) =>
			(near(width, w) && near(height, h)) ||
			(near(width, h) && near(height, w)),
	)?.[0];
	// Paper is measured in inches in the United States.
	const inches = /-US$/i.test(locale() ?? navigator.language ?? "");
	const size = inches
		? `${(width / 72).toFixed(1)} × ${(height / 72).toFixed(1)} in`
		: `${Math.round((width / 72) * 25.4)} × ${Math.round((height / 72) * 25.4)} mm`;
	return named ? `${size} (${named})` : size;
}
