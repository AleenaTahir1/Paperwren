import { describe, expect, it } from "vitest";
import { matches, matchesIn } from "../find";

describe("matchesIn", () => {
	it("ignores case unless asked", () => {
		expect(matchesIn("Report and REPORT", "report")).toEqual([0, 11]);
		expect(
			matchesIn("Report and REPORT", "REPORT", {
				matchCase: true,
				wholeWords: false,
			}),
		).toEqual([11]);
	});

	it("finds whole words only when asked", () => {
		const words = { matchCase: false, wholeWords: true };
		expect(matchesIn("cat category cat.", "cat")).toEqual([0, 4, 13]);
		expect(matchesIn("cat category cat.", "cat", words)).toEqual([0, 13]);
		// Letters of any script make a word.
		expect(matchesIn("قلمدان قلم", "قلم", words)).toEqual([7]);
		// A partial match is passed over, and the next one still found.
		expect(matchesIn("aaa a", "a", words)).toEqual([4]);
	});

	it("does not let matches overlap, and stops at the limit", () => {
		expect(matchesIn("aaaa", "aa")).toEqual([0, 2]);
		expect(matchesIn("a a a", "a", undefined, 2)).toEqual([0, 2]);
		expect(matchesIn("anything", "")).toEqual([]);
	});

	it("keeps offsets right when lower-casing changes a letter's length", () => {
		// "İ" lower-cases to two characters: the text is then searched as
		// it is, so offsets still point into it.
		expect(matchesIn("İstanbul x", "x")).toEqual([9]);
		expect(matches("Sheet total", "TOTAL")).toBe(true);
	});
});
