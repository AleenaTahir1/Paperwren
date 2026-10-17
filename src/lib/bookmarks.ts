/**
 * Bookmarks: places in a document the reader asked to come back to.
 * They live in the app's own storage, by file (the same identity as
 * recents), and are never written into the document. Pure functions over
 * plain data, so every rule is unit-tested without React.
 */

import { cleanPosition } from "./recents";
import type { Position } from "./types";

export interface Bookmark {
	id: string;
	/** What the place is called: "Page 12", or the words found there. */
	label: string;
	position: Position;
	/** When it was made. */
	at: number;
}

/** Every file's bookmarks, by file id. */
export type Bookmarks = Record<string, Bookmark[]>;

export const BOOKMARKS_KEY = "bookmarks_v1";
/** A file keeps this many; more is a list nobody reads. */
const MAX_PER_FILE = 500;
const MAX_LABEL = 120;

/** Where a position falls in reading order. */
export function orderOf(position: Position): number {
	switch (position.kind) {
		case "pdf":
			// Down the page: a larger "top" (PDF points from the bottom) is
			// higher up, so earlier.
			return position.page * 1e6 - Math.min(1e6 - 1, Math.max(0, position.top));
		case "slides":
			return position.slide;
		case "sheet":
			return position.sheet * 1e12 + position.top * 1e4 + position.left;
		case "scroll":
			return position.ratio;
	}
}

/** Two positions so close a second bookmark there would be the same. */
export function samePlace(a: Position, b: Position): boolean {
	if (a.kind !== b.kind) return false;
	switch (a.kind) {
		case "pdf":
			return (
				b.kind === "pdf" && a.page === b.page && Math.abs(a.top - b.top) < 40
			);
		case "slides":
			return b.kind === "slides" && a.slide === b.slide;
		case "sheet":
			return (
				b.kind === "sheet" &&
				a.sheet === b.sheet &&
				Math.abs(a.top - b.top) < 40 &&
				Math.abs(a.left - b.left) < 40
			);
		case "scroll":
			return b.kind === "scroll" && Math.abs(a.ratio - b.ratio) < 0.005;
	}
}

const tidyLabel = (label: string) => {
	const one = label.replace(/\s+/g, " ").trim();
	return one.length > MAX_LABEL ? `${one.slice(0, MAX_LABEL - 1)}…` : one;
};

/** Add a bookmark (or rename the one already at that place), keeping
 * the list in reading order. */
export function addBookmark(list: Bookmark[], mark: Bookmark): Bookmark[] {
	const label = tidyLabel(mark.label);
	const kept = list.filter((b) => !samePlace(b.position, mark.position));
	return [...kept, { ...mark, label }]
		.sort((a, b) => orderOf(a.position) - orderOf(b.position))
		.slice(0, MAX_PER_FILE);
}

export function removeBookmark(list: Bookmark[], id: string): Bookmark[] {
	return list.filter((b) => b.id !== id);
}

/** Validate what storage gave back; anything unusable is dropped. */
export function normalizeBookmarks(value: unknown): Bookmarks {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const out: Bookmarks = {};
	for (const [file, raw] of Object.entries(value as Record<string, unknown>)) {
		if (!Array.isArray(raw)) continue;
		let list: Bookmark[] = [];
		for (const item of raw) {
			if (!item || typeof item !== "object") continue;
			const b = item as Record<string, unknown>;
			const position = cleanPosition(b.position);
			if (!position || typeof b.id !== "string") continue;
			list = addBookmark(list, {
				id: b.id,
				label: typeof b.label === "string" ? b.label : "",
				position,
				at: typeof b.at === "number" && Number.isFinite(b.at) ? b.at : 0,
			});
		}
		if (list.length) out[file] = list;
	}
	return out;
}
