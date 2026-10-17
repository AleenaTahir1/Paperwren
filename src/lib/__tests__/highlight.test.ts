import { describe, expect, it } from "vitest";
import { highlight, languageOf, splitLines } from "../highlight";

describe("languageOf", () => {
	it("knows a file's language by its extension, or its name", () => {
		expect(languageOf("main.py")).toBe("python");
		expect(languageOf("App.TSX")).toBe("typescript");
		expect(languageOf("src/Dockerfile")).toBe("dockerfile");
		expect(languageOf("notes.txt")).toBeNull();
	});
});

describe("highlight", () => {
	it("colours code, with its text escaped", async () => {
		const html = await highlight('if x < 1:\n    print("<b>")', "python");
		expect(html).toContain('<span class="hljs-keyword">if</span>');
		expect(html).toContain("&lt;b&gt;");
		expect(html).not.toContain("<b>");
	});

	it("leaves a language it does not know alone", async () => {
		expect(await highlight("x", "klingon")).toBeNull();
	});
});

describe("splitLines", () => {
	it("closes a span at a line end and opens it again on the next line", () => {
		const html = 'a<span class="c">/* one\ntwo */</span>b\nc';
		expect(splitLines(html)).toEqual([
			'a<span class="c">/* one</span>',
			'<span class="c">two */</span>b',
			"c",
		]);
	});
});
