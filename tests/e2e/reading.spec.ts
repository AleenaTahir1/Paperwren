import { type Page, expect, test } from "@playwright/test";
import { boot, openFixture } from "./helpers";

/** The colour at the middle of the first copied picture of a PDF page. */
const pictureMiddle = (page: Page) =>
	page
		.locator(".pw-picture")
		.first()
		.evaluate((el) => {
			const canvas = el as HTMLCanvasElement;
			const ctx = canvas.getContext("2d");
			// The left third of the fixture's picture is red.
			const [r, g, b] =
				ctx?.getImageData(canvas.width / 6, canvas.height / 4, 1, 1).data ?? [];
			return [r, g, b];
		});

test.describe("page colour", () => {
	test("a PDF turns dark or sepia from its menu, and its pictures do not", async ({
		page,
	}) => {
		await boot(page);
		await openFixture(page, "features/pictures.pdf");
		await expect(page.getByTestId("pdf-page")).toHaveText("1 / 3", {
			timeout: 20_000,
		});
		const main = page.locator("[data-page-color]");
		await expect(main).toHaveAttribute("data-page-color", "original");

		await page.getByTestId("file-more").click();
		await page.getByTestId("page-color").click();
		await page.getByTestId("page-color-dark").click();
		await expect(main).toHaveAttribute("data-page-color", "dark");
		await expect(page.locator(".pw-picture")).toHaveCount(1);
		await expect(page.locator(".pw-pictures").first()).toBeVisible();
		const [r, g, b] = await pictureMiddle(page);
		expect(r).toBeGreaterThan(200);
		expect(g).toBeLessThan(70);
		expect(b).toBeLessThan(70);

		await page.getByTestId("file-more").click();
		await page.getByTestId("page-color").click();
		await page.getByTestId("page-color-sepia").click();
		await expect(main).toHaveAttribute("data-page-color", "sepia");
		await expect(page.locator(".pw-pictures").first()).toBeVisible();

		await page.getByTestId("file-more").click();
		await page.getByTestId("page-color").click();
		await page.getByTestId("page-color-original").click();
		await expect(page.locator(".pw-pictures").first()).toBeHidden();
	});

	test("the paper can follow the theme, and the old dark pages switch did", async ({
		page,
	}) => {
		await boot(page, {
			settings_v2: { theme: "dark", darkPages: true },
		});
		await openFixture(page, "sample.docx");
		await expect(page.locator("[data-page-color]")).toHaveAttribute(
			"data-page-color",
			"dark",
			{ timeout: 20_000 },
		);
		await page.getByTestId("viewer-back").click();
		await page.getByTestId("open-settings").click();
		await expect(page.getByTestId("page-color-theme")).toHaveAttribute(
			"aria-checked",
			"true",
		);
		await page.getByTestId("page-color-sepia").click();
		await page.getByTestId("settings-back").click();
		await openFixture(page, "sample.txt");
		await expect(page.getByTestId("text-scroll")).toHaveAttribute(
			"data-theme",
			"sepia",
		);
	});
});

test.describe("on a desktop", () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	test("two pages side by side are still there after a restart", async ({
		page,
	}) => {
		await boot(page, {}, "?desktop");
		await openFixture(page, "sample.pdf");
		await expect(page.getByTestId("pdf-page-field")).toHaveValue("1", {
			timeout: 20_000,
		});
		await page.getByTestId("file-more").click();
		await page.getByTestId("pdf-spread").click();
		const paired = () =>
			page
				.getByTestId("pdf-scroll")
				.locator(".page")
				.evaluateAll((pages) => {
					const [a, b] = pages.map((el) =>
						Math.round(el.getBoundingClientRect().top),
					);
					return a === b;
				});
		await expect.poll(paired).toBe(true);
		// Let the position be saved, then start again.
		await page.waitForTimeout(800);
		await page.getByTestId("viewer-back").click();
		await page.reload();
		await page
			.getByTestId("recent")
			.first()
			.getByRole("button")
			.first()
			.click();
		await expect(page.getByTestId("pdf-page-field")).toHaveValue("1", {
			timeout: 20_000,
		});
		await expect.poll(paired).toBe(true);
	});
});
