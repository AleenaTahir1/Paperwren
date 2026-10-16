/** DrawingML automatic numbering, with the common Latin/Arabic schemes. */
export function listNumber(value: number, scheme: string): string {
	const n = Math.max(1, Math.min(32767, value));
	let label = String(n);
	if (scheme.startsWith("alpha")) {
		label = "";
		for (let v = n; v > 0; v = Math.floor((v - 1) / 26))
			label = String.fromCharCode(65 + ((v - 1) % 26)) + label;
		if (scheme.startsWith("alphaLc")) label = label.toLowerCase();
	} else if (scheme.startsWith("roman") && n < 4000) {
		label = "";
		let remaining = n;
		for (const [v, s] of [
			[1000, "M"],
			[900, "CM"],
			[500, "D"],
			[400, "CD"],
			[100, "C"],
			[90, "XC"],
			[50, "L"],
			[40, "XL"],
			[10, "X"],
			[9, "IX"],
			[5, "V"],
			[4, "IV"],
			[1, "I"],
		] as const)
			while (remaining >= v) {
				label += s;
				remaining -= v;
			}
		if (scheme.startsWith("romanLc")) label = label.toLowerCase();
	}
	if (scheme.endsWith("ParenBoth")) return `(${label})`;
	if (scheme.endsWith("ParenR")) return `${label})`;
	if (scheme.endsWith("Plain")) return label;
	return `${label}.`;
}
