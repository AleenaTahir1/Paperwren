import { Marked } from "marked";
import { describe, expect, it } from "vitest";
import { markdownMath } from "../markdownMath";

const md = new Marked(markdownMath);
const html = (text: string) => md.parse(text, { async: false }) as string;

describe("markdownMath", () => {
	it("marks maths in a line and on lines of its own", () => {
		expect(html("Euler: $e^{i\\pi} + 1 = 0$.")).toContain(
			'<span class="pw-math">e^{i\\pi} + 1 = 0</span>',
		);
		expect(html("$$\n\\frac{a}{b} < c\n$$\n")).toContain(
			'<div class="pw-math" data-display="block">\\frac{a}{b} &lt; c</div>',
		);
	});

	it("leaves prices, escapes and code alone", () => {
		expect(html("It costs $5 or $10.")).not.toContain("pw-math");
		expect(html("A $ sign and $ another")).not.toContain("pw-math");
		expect(html("Not \\$x$ maths")).not.toContain("pw-math");
		expect(html("`$x$` in code")).not.toContain("pw-math");
	});
});
