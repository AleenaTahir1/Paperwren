import { describe, expect, it } from "vitest";
import { TREE_MAX, jsonTree } from "../jsonTree";

describe("jsonTree", () => {
	it("keeps numbers and keys as they were written", () => {
		const tree = jsonTree(
			'{"id":9007199254740993,"id":1e400,"list":[true,null,"a\\"b"]}',
		);
		expect(tree).toEqual({
			kind: "object",
			key: undefined,
			children: [
				{ kind: "number", key: "id", raw: "9007199254740993" },
				{ kind: "number", key: "id", raw: "1e400" },
				{
					kind: "array",
					key: "list",
					children: [
						{ kind: "boolean", key: undefined, raw: "true" },
						{ kind: "null", key: undefined, raw: "null" },
						{ kind: "string", key: undefined, raw: '"a\\"b"' },
					],
				},
			],
		});
	});

	it("reads empty branches and a bare value", () => {
		expect(jsonTree('{"a":{},"b":[]}')).toMatchObject({
			children: [
				{ kind: "object", key: "a", children: [] },
				{ kind: "array", key: "b", children: [] },
			],
		});
		expect(jsonTree(" 42 ")).toEqual({
			kind: "number",
			key: undefined,
			raw: "42",
		});
	});

	it("says when a file is not JSON, or too big for a tree", () => {
		expect(jsonTree("{oops")).toBeNull();
		expect(jsonTree(`[${"0,".repeat(TREE_MAX)}0]`)).toBe("big");
	});
});
