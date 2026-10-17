/**
 * A JSON file as a tree to fold and unfold. Built from the file's own
 * tokens, like `prettyJson`, so numbers keep every digit they were
 * written with and a key written twice shows twice.
 */

export type JsonNode =
	| { kind: "object" | "array"; key?: string; children: JsonNode[] }
	| {
			kind: "string" | "number" | "boolean" | "null";
			key?: string;
			/** As written in the file, quotes and escapes included. */
			raw: string;
	  };

/** Past this many values the tree would be too heavy to draw. */
export const TREE_MAX = 50_000;

/** The tree of a JSON text; "big" when it has too many values to draw
 * as one, null when it is not JSON. */
export function jsonTree(source: string): JsonNode | "big" | null {
	try {
		JSON.parse(source);
	} catch {
		return null;
	}
	const tokens =
		source.match(/"(?:\\[\s\S]|[^"\\])*"|[^\s{}\[\],:]+|[{}\[\],:]/g) ?? [];
	let at = 0;
	let count = 0;
	const value = (key?: string): JsonNode => {
		if (++count > TREE_MAX) throw new RangeError("too big");
		const token = tokens[at++];
		if (token === "{" || token === "[") {
			const object = token === "{";
			const close = object ? "}" : "]";
			const children: JsonNode[] = [];
			while (tokens[at] !== close) {
				let name: string | undefined;
				if (object) {
					name = JSON.parse(tokens[at++]) as string;
					at++; // :
				}
				children.push(value(name));
				if (tokens[at] === ",") at++;
			}
			at++;
			return { kind: object ? "object" : "array", key, children };
		}
		const kind =
			token[0] === '"'
				? "string"
				: token === "true" || token === "false"
					? "boolean"
					: token === "null"
						? "null"
						: "number";
		return { kind, key, raw: token };
	};
	try {
		return value();
	} catch {
		return "big";
	}
}
