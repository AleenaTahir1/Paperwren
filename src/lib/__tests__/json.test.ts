import { describe, expect, it } from "vitest";
import { prettyJson } from "../json";

describe("lossless JSON display", () => {
	it("preserves large numbers, exponent spelling, negative zero and duplicate keys", () => {
		expect(prettyJson('{"id":9007199254740993,"x":1e400,"x":-0}')).toBe(
			'{\n  "id": 9007199254740993,\n  "x": 1e400,\n  "x": -0\n}',
		);
	});
	it("preserves string escapes and punctuation inside strings", () => {
		const source = '{"text":"[a, b] \\" \\u0061","items":[{},[],true,null]}';
		expect(prettyJson(source)).toContain('"[a, b] \\" \\u0061"');
		expect(JSON.parse(prettyJson(source))).toEqual(JSON.parse(source));
	});
	it("leaves malformed input intact", () => {
		expect(prettyJson("{bad:01}")).toBe("{bad:01}");
	});
});
