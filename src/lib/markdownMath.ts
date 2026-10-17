/**
 * Maths in Markdown, written as TeX the way GitHub and most notes apps
 * read it: `$x^2$` in a line, `$$ … $$` on lines of its own. Marked
 * leaves a placeholder holding the TeX as text; `drawMaths` sets it
 * once KaTeX has loaded, which happens only for a file that has any.
 */

import type { MarkedExtension, Tokens } from "marked";

const escapeHtml = (text: string) =>
	text.replace(
		/[&<>"]/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
	);

const placeholder = (tex: string, block: boolean) =>
	block
		? `<div class="pw-math" data-display="block">${escapeHtml(tex)}</div>\n`
		: `<span class="pw-math">${escapeHtml(tex)}</span>`;

/**
 * `$…$` in a line counts only when the dollars hug the TeX, as in
 * `$x$`, and the closing one is not followed by a digit: "costs $5 and
 * $10" stays prose.
 */
const INLINE = /^\$(?!\s)((?:\\[\s\S]|[^\\$\n])+?)(?<!\s)\$(?![\d$])/;
const BLOCK = /^\$\$([\s\S]+?)\$\$[ \t]*(?:\n|$)/;

export const markdownMath: MarkedExtension = {
	extensions: [
		{
			name: "mathBlock",
			level: "block",
			start: (src) => src.match(/^\$\$/m)?.index,
			tokenizer(src) {
				const m = BLOCK.exec(src);
				if (m)
					return {
						type: "mathBlock",
						raw: m[0],
						text: m[1].trim(),
					} as Tokens.Generic;
			},
			renderer: (token) => placeholder(token.text, true),
		},
		{
			name: "mathInline",
			level: "inline",
			start: (src) => {
				const at = src.search(/(?<!\\)\$/);
				return at < 0 ? undefined : at;
			},
			tokenizer(src) {
				const m = INLINE.exec(src);
				if (m)
					return {
						type: "mathInline",
						raw: m[0],
						text: m[1],
					} as Tokens.Generic;
			},
			renderer: (token) => placeholder(token.text, false),
		},
	],
};

/** Draws the maths placed in `root`, loading KaTeX first. TeX it cannot
 * read is shown as it was written, in its error colour. */
export async function drawMaths(root: HTMLElement): Promise<void> {
	const spots = [...root.querySelectorAll<HTMLElement>(".pw-math")];
	if (!spots.length) return;
	const [{ default: katex }] = await Promise.all([
		import("katex"),
		import("katex/dist/katex.min.css"),
	]);
	for (const spot of spots) {
		if (!spot.isConnected || spot.dataset.drawn) continue;
		const tex = spot.textContent ?? "";
		try {
			katex.render(tex, spot, {
				displayMode: spot.dataset.display === "block",
				throwOnError: false,
				// No \href, \url or \includegraphics: a file cannot reach out.
				trust: false,
				maxExpand: 1000,
				maxSize: 50,
			});
			spot.dataset.drawn = "1";
		} catch {
			spot.textContent = tex;
		}
	}
}
