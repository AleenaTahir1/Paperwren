import { describe, expect, it } from "vitest";
import {
	type Bookmark,
	addBookmark,
	normalizeBookmarks,
	removeBookmark,
	samePlace,
} from "../bookmarks";
import type { Position } from "../types";

const pdf = (page: number, top = 700): Position => ({
	kind: "pdf",
	page,
	top,
	left: 0,
	scale: "page-width",
	rotation: 0,
});
const mark = (id: string, position: Position, label = id): Bookmark => ({
	id,
	label,
	position,
	at: 1,
});

describe("bookmarks", () => {
	it("keeps them in reading order", () => {
		let list: Bookmark[] = [];
		list = addBookmark(list, mark("c", pdf(9)));
		list = addBookmark(list, mark("a", pdf(2, 100)));
		list = addBookmark(list, mark("b", pdf(2, 600)));
		// Higher on page 2 (a larger top) comes first.
		expect(list.map((b) => b.id)).toEqual(["b", "a", "c"]);
	});

	it("a second bookmark at the same place replaces the first", () => {
		let list = addBookmark([], mark("a", pdf(3, 500), "Old"));
		list = addBookmark(list, mark("b", pdf(3, 490), "New"));
		expect(list).toHaveLength(1);
		expect(list[0].label).toBe("New");
		expect(
			samePlace(
				{ kind: "scroll", ratio: 0.5 },
				{ kind: "scroll", ratio: 0.503 },
			),
		).toBe(true);
		expect(
			samePlace({ kind: "slides", slide: 1 }, { kind: "slides", slide: 2 }),
		).toBe(false);
	});

	it("tidies labels and removes by id", () => {
		const long = `  ${"word ".repeat(60)}`;
		const list = addBookmark([], mark("a", pdf(1), long));
		expect(list[0].label.length).toBeLessThanOrEqual(120);
		expect(list[0].label.startsWith("word word")).toBe(true);
		expect(removeBookmark(list, "a")).toEqual([]);
	});

	it("drops what storage cannot use", () => {
		expect(normalizeBookmarks(null)).toEqual({});
		expect(normalizeBookmarks([1, 2])).toEqual({});
		const read = normalizeBookmarks({
			f1: [
				mark("ok", pdf(4)),
				{ id: "no-position", label: "x" },
				{ id: 7, position: pdf(1) },
			],
			f2: "not a list",
			f3: [],
		});
		expect(Object.keys(read)).toEqual(["f1"]);
		expect(read.f1.map((b) => b.id)).toEqual(["ok"]);
	});
});
