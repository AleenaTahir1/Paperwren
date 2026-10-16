/** Format whitespace only. Never round numbers, drop duplicate keys, or rewrite
 * string escapes by serializing a JavaScript object back to JSON. */
export function prettyJson(source: string): string {
	try {
		JSON.parse(source);
	} catch {
		return source;
	}
	const tokens =
		source.match(/"(?:\\[\s\S]|[^"\\])*"|[^\s{}\[\],:]+|[{}\[\],:]/g) ?? [];
	const out: string[] = [];
	let depth = 0;
	const newline = () => out.push(`\n${"  ".repeat(Math.min(depth, 40))}`);
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token === "{" || token === "[") {
			out.push(token);
			if (tokens[i + 1] === (token === "{" ? "}" : "]")) out.push(tokens[++i]);
			else {
				depth++;
				newline();
			}
		} else if (token === "}" || token === "]") {
			depth--;
			newline();
			out.push(token);
		} else if (token === ",") {
			out.push(token);
			newline();
		} else if (token === ":") out.push(": ");
		else out.push(token);
	}
	return out.join("");
}
