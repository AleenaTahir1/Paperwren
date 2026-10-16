import { readFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { boot, openFixture } from "./helpers";

async function openBytes(page: Page, bytes: Uint8Array, name: string) {
	await page.evaluate(
		({ b64, name }) => {
			const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
			window.__paperwrenTestFile = new File([bytes], name);
		},
		{ b64: Buffer.from(bytes).toString("base64"), name },
	);
	await page.getByTestId("open-file").click();
}

test("picture opacity survives parsing and reaches the slide image", async ({
	page,
}) => {
	await boot(page);
	const files = unzipSync(
		new Uint8Array(readFileSync("fixtures/viewer-regressions/effects.pptx")),
	);
	let changed = false;
	files["ppt/slides/slide1.xml"] = strToU8(
		strFromU8(files["ppt/slides/slide1.xml"]).replace(
			/<a:blip\b([^>]*?)(\/?)>/g,
			(_, attrs, closed) => {
				changed = true;
				return `<a:blip${attrs}><a:alphaModFix amt="25000"/>${closed ? "</a:blip>" : ""}`;
			},
		),
	);
	expect(changed).toBe(true);
	await openBytes(page, zipSync(files), "opacity.pptx");
	const image = page.getByTestId("slides-scroll").locator("img").first();
	await expect(image).toBeVisible({ timeout: 20000 });
	await expect(image).toHaveCSS("opacity", "0.25");
	expect(
		await image.evaluate(
			(el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
		),
	).toBe(true);
});

test("JSON presentation preserves large numbers and duplicate keys", async ({
	page,
}) => {
	await boot(page);
	await openBytes(
		page,
		new TextEncoder().encode('{"id":9007199254740993,"id":1e400}'),
		"precision.json",
	);
	const text = page.getByTestId("text-scroll");
	await expect(text).toContainText("9007199254740993");
	await expect(text).toContainText("1e400");
	expect((await text.innerText()).match(/"id"/g)).toHaveLength(2);
});

test("legacy text can be decoded explicitly without changing the file", async ({
	page,
}) => {
	await boot(page);
	await openBytes(page, new Uint8Array([0x82, 0xa0]), "japanese.txt");
	await expect(page.getByTestId("text-scroll")).toBeVisible();
	await page.getByTestId("file-more").click();
	await page.getByTestId("text-encoding").click();
	await page.getByRole("button", { name: "SHIFT-JIS", exact: true }).click();
	await expect(page.getByTestId("text-scroll")).toHaveText("あ");
});

test("dark app theme preserves authored spreadsheet colors and font size", async ({
	page,
}) => {
	await boot(page, { settings: { theme: "dark" } });
	await openFixture(page, "viewer-regressions/styled.xlsx");
	const grid = page.getByTestId("sheet-grid");
	await expect(grid).toBeVisible({ timeout: 20000 });
	const colors = await grid.locator("[data-r][data-c]").evaluateAll((cells) =>
		cells.map((el) => ({
			bg: getComputedStyle(el).backgroundColor,
			size: getComputedStyle(el).fontSize,
		})),
	);
	expect(colors.some((c) => c.bg === "rgb(31, 78, 120)")).toBe(true);
	expect(
		colors.some((c) => Math.abs(Number.parseFloat(c.size) - 14.6667) < 0.01),
	).toBe(true);
});

test("printing Word from Reading view restores the authored paper width", async ({
	page,
}) => {
	await boot(page, { settings: { readingView: true } });
	await openFixture(page, "viewer-regressions/multipage.docx");
	await expect(
		page.getByTestId("doc-scroll").locator("section.docx").first(),
	).toBeVisible({ timeout: 20000 });
	await page.evaluate(() => {
		window.print = () => {};
	});
	await page.getByTestId("file-more").click();
	await page.getByTestId("file-print").click();
	const paper = page.locator("#pw-print section.docx").first();
	await expect(paper).toHaveAttribute("style", /width:\s*595\.3pt/);
	await expect(page.locator("#pw-print section.docx")).toHaveCount(3);
	const fit = await page
		.locator("#pw-print > div")
		.evaluate((el) => Number(getComputedStyle(el).zoom));
	expect(fit).toBeGreaterThan(0.9);
	expect(fit).toBeLessThanOrEqual(1);
	await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
});

test("spreadsheet print keeps floating pictures and charts", async ({
	page,
}) => {
	await boot(page);
	await openFixture(page, "viewer-regressions/grid.xlsx");
	await expect(page.getByTestId("sheet-object")).toHaveCount(2, {
		timeout: 20000,
	});
	await page.evaluate(() => {
		window.print = () => {};
	});
	await page.getByTestId("file-more").click();
	await page.getByTestId("file-print").click();
	await expect(
		page.locator('#pw-print svg[data-testid="slide-chart"]'),
	).toHaveCount(1);
	await expect(page.locator("#pw-print img")).toHaveCount(1);
	await expect(
		page.locator('#pw-print svg[data-testid="slide-chart"]'),
	).toHaveAttribute("width", "100%");
	await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
});

test("unsupported spreadsheet charts leave a visible placeholder", async ({
	page,
}) => {
	await boot(page);
	const files = unzipSync(
		new Uint8Array(readFileSync("fixtures/viewer-regressions/grid.xlsx")),
	);
	let changed = false;
	for (const name of Object.keys(files))
		if (name.startsWith("xl/charts/") && name.endsWith(".xml")) {
			const xml = strFromU8(files[name]);
			if (xml.includes("barChart")) {
				files[name] = strToU8(xml.replaceAll("barChart", "radarChart"));
				changed = true;
			}
		}
	expect(changed).toBe(true);
	await openBytes(page, zipSync(files), "unsupported.xlsx");
	await expect(page.getByTestId("sheet-object")).toHaveCount(2, {
		timeout: 20000,
	});
	await expect(
		page
			.getByTestId("sheet-object")
			.filter({ hasText: "Chart preview unavailable" }),
	).toHaveCount(1);
	await expect(
		page.getByTestId("sheet-object").getByTestId("slide-chart"),
	).toHaveCount(0);
});
