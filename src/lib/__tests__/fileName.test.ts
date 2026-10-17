import { describe, expect, it } from "vitest";
import { copyName, joinName, nameProblem, splitName } from "../fileName";

describe("file names", () => {
	it("keeps the extension apart", () => {
		expect(splitName("Report.final.pdf")).toEqual(["Report.final", ".pdf"]);
		expect(splitName("notes")).toEqual(["notes", ""]);
		expect(splitName(".env")).toEqual([".env", ""]);
	});

	it("says what is wrong with a name", () => {
		expect(nameProblem("Quarterly report", ".pdf")).toBeNull();
		expect(nameProblem("Résumé – 2026", ".docx")).toBeNull();
		expect(nameProblem("  ")).toBe("Type a name");
		expect(nameProblem("a/b")).toMatch(/can't contain/);
		expect(nameProblem("what?")).toMatch(/can't contain/);
		expect(nameProblem("CON")).toBe("That name is kept by the system");
		expect(nameProblem("lpt1.backup")).toBe("That name is kept by the system");
		expect(nameProblem("ü".repeat(130), ".pdf")).toBe("That name is too long");
	});

	it("tidies what Windows would drop", () => {
		expect(joinName("  Draft. . ", ".pdf")).toBe("Draft.pdf");
		expect(copyName("Lease.pdf", "signed")).toBe("Lease (signed).pdf");
		expect(copyName("scan.png", "pages", ".pdf")).toBe("scan (pages).pdf");
	});
});
