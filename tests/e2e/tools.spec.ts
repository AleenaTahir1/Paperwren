import { readFileSync } from "node:fs";
import { PDFDocument } from "@cantoo/pdf-lib";
import { type Page, expect, test } from "@playwright/test";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { boot, openFixture } from "./helpers";

test.describe("rename", () => {
	test("a file is renamed from its menu, keeping its extension", async ({
		page,
	}) => {
		await boot(page);
		await openFixture(page, "sample.pdf");
		await expect(page.getByTestId("pdf-page")).toHaveText("1 / 3", {
			timeout: 20_000,
		});
		await page.getByTestId("file-more").click();
		await page.getByTestId("file-rename").click();
		const field = page.getByTestId("rename-input");
		await expect(field).toHaveValue("sample");
		await expect(page.getByTestId("rename")).toContainText(".pdf");

		// What a file name cannot be is said before anything is tried.
		await field.fill("a/b");
		await expect(page.getByTestId("rename-error")).toContainText(
			"can't contain",
		);
		await expect(page.getByTestId("rename-go")).toBeDisabled();
		await field.fill("Quarterly report ");
		await field.press("Enter");
		await expect(page.getByTestId("rename")).toHaveCount(0);
		await expect(page.getByTestId("viewer").locator("header")).toContainText(
			"Quarterly report.pdf",
		);
		await expect(page.getByTestId("pdf-page")).toHaveText("1 / 3", {
			timeout: 20_000,
		});

		await page.getByTestId("viewer-back").click();
		const recent = page.getByTestId("recent").first();
		await expect(recent).toContainText("Quarterly report.pdf");
		await expect(page.getByTestId("recent")).toHaveCount(1);

		// And from Home.
		await recent.getByRole("button", { name: /More actions/ }).click();
		await page.getByTestId("menu-rename").click();
		await page.getByTestId("rename-input").fill("Q3");
		await page.getByTestId("rename-go").click();
		await expect(recent).toContainText("Q3.pdf");
		// It still opens.
		await recent.getByRole("button").first().click();
		await expect(page.getByTestId("pdf-page")).toHaveText("1 / 3", {
			timeout: 20_000,
		});
	});
});

/** Draw a wave on the signature pad. */
async function sign(page: Page) {
	const pad = await page.getByTestId("signature-canvas").boundingBox();
	if (!pad) throw new Error("no pad");
	await page.mouse.move(pad.x + 30, pad.y + pad.height * 0.6);
	await page.mouse.down();
	for (let i = 0; i <= 24; i++)
		await page.mouse.move(
			pad.x + 30 + i * 10,
			pad.y + pad.height * (0.6 + 0.2 * Math.sin(i / 3)),
		);
	await page.mouse.up();
}

/** Save the editor's copy and return its bytes. */
async function saveCopy(page: Page) {
	await page.getByTestId("fill-save").click();
	const download = page.waitForEvent("download");
	await page.getByTestId("fill-save-go").click();
	const file = await download;
	const path = await file.path();
	return {
		name: file.suggestedFilename(),
		bytes: new Uint8Array(readFileSync(path)),
	};
}

test.describe("fill & sign", () => {
	test("a form is filled in and signed, and saved as a copy", async ({
		page,
	}) => {
		await boot(page);
		await openFixture(page, "features/form.pdf");
		await expect(page.getByTestId("pdf-page")).toHaveText("1 / 2", {
			timeout: 20_000,
		});
		await page.getByTestId("file-more").click();
		await page.getByTestId("pdf-fill-sign").click();
		const editor = page.getByTestId("fill-sign");
		await expect(editor.getByTestId("fill-field")).toHaveCount(5);
		await expect(page.getByTestId("fill-save")).toBeDisabled();

		await editor.getByLabel("fullname").fill("Ayesha Khan");
		await editor.getByLabel("agree").click();
		await editor.getByLabel("plan").selectOption("Yearly");
		await editor.getByLabel("size").nth(1).click();

		// The file's signature field: drawn once, kept for next time.
		await editor.getByTestId("fill-sign-here").click();
		await sign(page);
		await page.getByTestId("signature-done").click();
		await expect(editor.getByTestId("fill-item")).toHaveCount(1);
		await expect(editor.getByTestId("fill-sign-here")).toHaveCount(0);

		// A line of text, typed where it was put.
		await editor.getByTestId("fill-tool-text").click();
		const first = await editor.getByTestId("fill-page").first().boundingBox();
		if (!first) throw new Error("no page");
		await page.mouse.click(
			first.x + first.width * 0.1,
			first.y + first.height * 0.4,
		);
		await page.keyboard.type("Approved by the club");
		await page.keyboard.press("Enter");
		// A tick, then taken away again.
		await editor.getByTestId("fill-tool-check").click();
		await page.mouse.click(
			first.x + first.width * 0.8,
			first.y + first.height * 0.6,
		);
		await expect(editor.getByTestId("fill-item")).toHaveCount(3);
		await editor.getByTestId("fill-item-remove").click();
		await expect(editor.getByTestId("fill-item")).toHaveCount(2);

		// The page on its side is signed with the kept signature.
		await editor.getByTestId("fill-page").nth(1).scrollIntoViewIfNeeded();
		await editor.getByTestId("fill-tool-sign").click();
		await page.getByTestId("signature-kept").first().click();
		const second = await editor.getByTestId("fill-page").nth(1).boundingBox();
		if (!second) throw new Error("no page");
		await page.mouse.click(
			second.x + second.width / 2,
			second.y + second.height / 2,
		);
		await expect(editor.getByTestId("fill-item")).toHaveCount(3);

		const saved = await saveCopy(page);
		expect(saved.name).toBe("form (signed).pdf");
		await expect(editor).toHaveCount(0);
		await expect(page.getByText("Saved as form (signed).pdf")).toBeVisible();

		const form = (await PDFDocument.load(saved.bytes)).getForm();
		expect(form.getTextField("fullname").getText()).toBe("Ayesha Khan");
		expect(form.getCheckBox("agree").isChecked()).toBe(true);
		expect(form.getDropdown("plan").getSelected()).toEqual(["Yearly"]);
		expect(form.getRadioGroup("size").getSelected()).toBe("L");
		const doc = await PDFDocument.load(saved.bytes);
		expect(doc.getPage(1).getRotation().angle).toBe(90);
		// The text went in as text, the signatures as pictures.
		const read = await pdfjs.getDocument({
			data: saved.bytes.slice(),
			verbosity: 0,
		}).promise;
		const words = async (n: number) =>
			(await (await read.getPage(n)).getTextContent()).items
				.map((i) => ("str" in i ? i.str : ""))
				.join(" ");
		expect(await words(1)).toContain("Approved by the club");
		for (const n of [1, 2]) {
			const ops = await (await read.getPage(n)).getOperatorList();
			expect(ops.fnArray).toContain(pdfjs.OPS.paintImageXObject);
		}
		await read.destroy();
	});

	test("leaving with changes asks first; a typed signature works too", async ({
		page,
	}) => {
		await boot(page);
		await openFixture(page, "features/form.pdf");
		await expect(page.getByTestId("pdf-page")).toHaveText("1 / 2", {
			timeout: 20_000,
		});
		await page.getByTestId("file-more").click();
		await page.getByTestId("pdf-fill-sign").click();
		const editor = page.getByTestId("fill-sign");
		await editor.getByTestId("fill-tool-sign").click();
		await page.getByTestId("signature-type").click();
		await page.getByTestId("signature-name").fill("Ayesha Khan");
		await page.getByTestId("signature-keep").uncheck();
		await page.getByTestId("signature-done").click();
		const box = await editor.getByTestId("fill-page").first().boundingBox();
		if (!box) throw new Error("no page");
		await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.7);
		await expect(editor.getByTestId("fill-item")).toHaveCount(1);

		// Dragged by its corner it grows, keeping its shape.
		const item = editor.getByTestId("fill-item");
		const before = await item.boundingBox();
		const corner = await editor.getByTestId("fill-item-size").boundingBox();
		if (!before || !corner) throw new Error("no item");
		await page.mouse.move(corner.x + 9, corner.y + 9);
		await page.mouse.down();
		await page.mouse.move(corner.x + 69, corner.y + 40, { steps: 5 });
		await page.mouse.up();
		const after = await item.boundingBox();
		expect(after?.width ?? 0).toBeGreaterThan(before.width * 1.3);
		expect((after?.width ?? 0) / (after?.height ?? 1)).toBeCloseTo(
			before.width / before.height,
			1,
		);

		await page.keyboard.press("Escape");
		await page.getByTestId("fill-close").click();
		await expect(page.getByTestId("fill-leave")).toBeVisible();
		await page.getByRole("button", { name: "Keep editing" }).click();
		await expect(editor).toBeVisible();
		await page.getByTestId("fill-close").click();
		await page.getByTestId("fill-discard").click();
		await expect(editor).toHaveCount(0);

		// The signature was not kept.
		await page.getByTestId("file-more").click();
		await page.getByTestId("pdf-fill-sign").click();
		await editor.getByTestId("fill-tool-sign").click();
		await expect(page.getByTestId("signature-pad")).toBeVisible();
	});
});
