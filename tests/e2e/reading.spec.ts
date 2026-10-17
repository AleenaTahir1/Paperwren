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

test.describe("PDF pages and links", () => {
	test("pages laid sideways turn with a tap on either side", async ({
		page,
	}) => {
		await boot(page);
		await openFixture(page, "features/pictures.pdf");
		const counter = page.getByTestId("pdf-page");
		await expect(counter).toHaveText("1 / 3", { timeout: 20_000 });
		await page.getByTestId("file-more").click();
		await page.getByTestId("pdf-across").click();
		const scroller = page.getByTestId("pdf-scroll");
		await expect(scroller).toHaveAttribute("data-flow", "across");
		await expect(page.getByTestId("pdf-scale")).toHaveText("Whole page");
		const box = await scroller.boundingBox();
		if (!box) throw new Error("no scroller");
		await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
		await expect(counter).toHaveText("1 / 3");
		// Taps are a touch screen's: send one.
		await scroller.dispatchEvent("touchstart", {
			touches: [
				{ identifier: 0, clientX: box.x + box.width * 0.9, clientY: 300 },
			],
		});
		await scroller.dispatchEvent("touchend", {
			touches: [],
			changedTouches: [
				{ identifier: 0, clientX: box.x + box.width * 0.9, clientY: 300 },
			],
		});
		await expect(counter).toHaveText("2 / 3");
		// The choice holds for the next PDF.
		await page.getByTestId("viewer-back").click();
		await openFixture(page, "sample.pdf");
		await expect(page.getByTestId("pdf-scroll")).toHaveAttribute(
			"data-flow",
			"across",
			{ timeout: 20_000 },
		);
	});

	test("Back retraces a link inside a PDF before it closes the document", async ({
		page,
	}) => {
		await boot(page);
		await openFixture(page, "features/pictures.pdf");
		const counter = page.getByTestId("pdf-page");
		await expect(counter).toHaveText("1 / 3", { timeout: 20_000 });
		await page.locator(".annotationLayer a").first().click();
		await expect(counter).toHaveText("3 / 3");
		await expect(page.getByTestId("pdf-trail")).toHaveText("Back to page 1");
		await page.goBack();
		await expect(counter).toHaveText("1 / 3");
		await expect(page.getByTestId("pdf-trail")).toHaveCount(0);
		await page.goBack();
		await expect(page.getByTestId("home")).toBeVisible();
	});
});

test.describe("PDF pages on a desktop", () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	test("keys, the wheel and a book's cover turn pages laid sideways", async ({
		page,
	}) => {
		await boot(page, { settings_v2: { pdfFlow: "across" } }, "?desktop");
		await openFixture(page, "features/pictures.pdf");
		const field = page.getByTestId("pdf-page-field");
		await expect(field).toHaveValue("1", { timeout: 20_000 });
		await page.keyboard.press("PageDown");
		await expect(field).toHaveValue("2");
		await page.keyboard.press("End");
		await expect(field).toHaveValue("3");
		await page.keyboard.press("Home");
		await expect(field).toHaveValue("1");
		await page.mouse.move(640, 400);
		await page.mouse.wheel(0, 120);
		await expect(field).toHaveValue("2");

		// Two pages at a time, then the first on its own as a cover.
		await page.getByTestId("file-more").click();
		await page.getByTestId("pdf-spread").click();
		await page.keyboard.press("Home");
		await expect(field).toHaveValue("1");
		await page.keyboard.press("ArrowRight");
		await expect(field).toHaveValue("3");
		await page.getByTestId("file-more").click();
		await page.getByTestId("pdf-cover").click();
		await page.keyboard.press("Home");
		await page.keyboard.press("ArrowRight");
		await expect(field).toHaveValue("2");

		// Alt+Left after a link, Alt+Right to return; Ctrl+W still closes.
		await page.getByTestId("file-more").click();
		await page.getByTestId("pdf-spread").click();
		await page.getByTestId("file-more").click();
		await page.getByTestId("pdf-across").click();
		await page.keyboard.press("Home");
		await page.locator(".annotationLayer a").first().click();
		await expect(field).toHaveValue("3");
		await page.keyboard.press("Alt+ArrowLeft");
		await expect(field).toHaveValue("1");
		await page.keyboard.press("Alt+ArrowRight");
		await expect(field).toHaveValue("3");
		await page.keyboard.press("Control+w");
		await expect(page.getByTestId("home")).toBeVisible();
	});
});

test.describe("what a PDF carries besides its pages", () => {
	test("its comments, attachments, layers and details", async ({ page }) => {
		await boot(page);
		await openFixture(page, "features/extras.pdf");
		const counter = page.getByTestId("pdf-page");
		await expect(counter).toHaveText("1 / 2", { timeout: 20_000 });
		// The note's icon ships with the app.
		await expect(page.locator(".annotationLayer img").first()).toHaveJSProperty(
			"complete",
			true,
		);
		expect(
			await page
				.locator(".annotationLayer img")
				.first()
				.evaluate((img) => (img as HTMLImageElement).naturalWidth),
		).toBeGreaterThan(0);

		await page.getByTestId("file-more").click();
		await page.getByTestId("pdf-comments").click();
		const comments = page.getByTestId("pdf-comment");
		await expect(comments).toHaveCount(3);
		await expect(comments.first()).toContainText("Ayesha");
		await expect(comments.first()).toContainText("Check this figure");
		await expect(comments.nth(1)).toContainText("Highlight");
		await comments.nth(2).click();
		await expect(counter).toHaveText("2 / 2");

		await page.getByTestId("file-more").click();
		await page.getByTestId("pdf-layers").click();
		const layer = page.getByTestId("pdf-layer");
		await expect(layer).toHaveText("Watermark");
		await expect(layer).toHaveAttribute("aria-pressed", "true");
		await layer.click();
		await expect(layer).toHaveAttribute("aria-pressed", "false");
		await page.keyboard.press("Escape");

		await page.getByTestId("file-more").click();
		await page.getByTestId("file-details-open").click();
		await expect(page.getByTestId("file-details")).toContainText("Page size");
		await expect(page.getByTestId("file-details")).toContainText("A4");
		await expect(page.getByTestId("file-details")).toContainText("PDF version");
		await page.getByRole("button", { name: "Done" }).click();

		// An attachment opens over the PDF, and is not kept in recents.
		await page.getByTestId("file-more").click();
		await page.getByTestId("pdf-attachments").click();
		await page.getByTestId("pdf-attachment").click();
		await expect(page.getByTestId("viewer")).toContainText(
			"the figures are final",
		);
		await page.getByTestId("viewer-back").click();
		await expect(counter).toHaveText(/\/ 2/, { timeout: 20_000 });
		await page.getByTestId("viewer-back").click();
		await expect(page.getByTestId("recent")).toHaveCount(1);
		await expect(page.getByTestId("recent")).toContainText("extras.pdf");
	});

	test("a PDF that asks not to be copied says so", async ({ page }) => {
		await boot(page);
		await openFixture(page, "features/nocopy.pdf");
		await expect(page.getByText("This PDF restricts copying")).toBeVisible({
			timeout: 20_000,
		});
		await page.getByTestId("file-more").click();
		await page.getByTestId("file-details-open").click();
		await expect(page.getByTestId("file-details")).toContainText(
			"The author asks that its text not be copied",
		);
	});
});

test.describe("find, as a reader means it", () => {
	test("match case and whole words, on a phone, in each kind of file", async ({
		page,
	}) => {
		await boot(page);
		await openFixture(page, "features/pictures.pdf");
		await expect(page.getByTestId("pdf-page")).toHaveText("1 / 3", {
			timeout: 20_000,
		});
		await page.getByTestId("pdf-find").click();
		await page.getByTestId("find-input").fill("chapter");
		await expect(page.getByTestId("find-count")).toHaveText(/of 4\d/, {
			timeout: 10_000,
		});
		await page.getByTestId("find-case").click();
		await expect(page.getByTestId("find-count")).toHaveText("No results");
		await page.getByTestId("viewer-back").click();

		await openFixture(page, "sample.txt");
		await page.getByTestId("text-find").click();
		await page.getByTestId("find-input").fill("fix");
		await expect(page.getByTestId("find-count")).toHaveText("1 of 1");
		await page.getByTestId("find-words").click();
		await expect(page.getByTestId("find-count")).toHaveText("No results");
		await page.getByTestId("find-input").fill("fixture");
		await expect(page.getByTestId("find-count")).toHaveText("1 of 1");
		await page.getByTestId("viewer-back").click();

		await openFixture(page, "sample.xlsx");
		await page.getByTestId("sheet-find").click();
		await page.getByTestId("find-input").fill("a");
		await expect(page.getByTestId("find-count")).toHaveText(/of \d/);
		await page.getByTestId("find-words").click();
		await expect(page.getByTestId("find-count")).toHaveText("No results");
	});
});

test("crop margins fills the screen with text, cuts nothing and is remembered", async ({
	page,
}) => {
	await boot(page);
	await openFixture(page, "features/margins.pdf");
	const counter = page.getByTestId("pdf-page");
	await expect(counter).toHaveText("1 / 4", { timeout: 20_000 });
	// The first line of text, as tall as it is drawn.
	const lineHeight = () =>
		page
			.locator(".pdfViewer .page")
			.first()
			.locator(".textLayer span", { hasText: "line 1:" })
			.first()
			.evaluate((el) => el.getBoundingClientRect().height);
	await expect.poll(lineHeight).toBeGreaterThan(0);
	const before = await lineHeight();
	await page.getByTestId("file-more").click();
	await page.getByTestId("pdf-crop").click();
	// The text grows to fill the width the margins took.
	await expect.poll(lineHeight).toBeGreaterThan(before * 1.5);
	// The page that prints further out keeps all of it.
	const widths = await page
		.locator(".pdfViewer .page")
		.evaluateAll((pages) =>
			pages.map((el) => el.getBoundingClientRect().width),
		);
	expect(widths[2]).toBeGreaterThan(widths[0] * 1.3);
	await page.waitForTimeout(600);
	await page.getByTestId("viewer-back").click();
	await page.getByTestId("recent").first().getByRole("button").first().click();
	await expect(counter).toHaveText("1 / 4", { timeout: 20_000 });
	await expect.poll(lineHeight).toBeGreaterThan(before * 1.5);
	await page.getByTestId("file-more").click();
	await expect(page.getByTestId("pdf-crop")).toHaveAttribute(
		"aria-pressed",
		"true",
	);
});

test.describe("bookmarks", () => {
	test("are added, named, gone back to, kept and deleted", async ({ page }) => {
		await boot(page);
		await openFixture(page, "features/pictures.pdf");
		const counter = page.getByTestId("pdf-page");
		await expect(counter).toHaveText("1 / 3", { timeout: 20_000 });
		const jump = async (n: string) => {
			await counter.click();
			await page.getByTestId("pdf-jump-input").fill(n);
			await page.getByTestId("pdf-jump-go").click();
			await expect(counter).toHaveText(`${n} / 3`);
		};
		await jump("2");
		await page.getByTestId("file-more").click();
		await page.getByTestId("bookmark-add").click();
		await expect(page.getByText("Bookmark added")).toBeVisible();
		await jump("1");
		await page.getByTestId("file-more").click();
		await page.getByTestId("bookmarks").click();
		const marks = page.getByTestId("bookmark");
		await expect(marks).toHaveText(["Page 2"]);
		await marks.first().getByRole("button").first().click();
		await expect(counter).toHaveText("2 / 3");

		// Kept on this device, with the file.
		await page.getByTestId("viewer-back").click();
		await page.reload();
		await page
			.getByTestId("recent")
			.first()
			.getByRole("button")
			.first()
			.click();
		await expect(counter).toHaveText(/\/ 3/, { timeout: 20_000 });
		await page.getByTestId("file-more").click();
		await page.getByTestId("bookmarks").click();
		await expect(marks).toHaveText(["Page 2"]);
		await page.getByTestId("bookmark-remove").click();
		await expect(marks).toHaveCount(0);
		await expect(page.getByTestId("bookmark-list")).toContainText(
			"No bookmarks yet",
		);
	});

	test("a Word document's bookmark is named after its words", async ({
		page,
	}) => {
		await boot(page);
		await openFixture(page, "viewer-regressions/multipage.docx");
		const scroller = page.getByTestId("doc-scroll");
		await expect(scroller).toBeVisible({ timeout: 20_000 });
		await expect
			.poll(() =>
				scroller.evaluate((el) => el.scrollHeight > el.clientHeight * 2),
			)
			.toBe(true);
		await scroller.evaluate((el) => {
			el.scrollTop = el.scrollHeight / 2;
		});
		await page.getByTestId("file-more").click();
		await page.getByTestId("bookmark-add").click();
		await page.getByTestId("file-more").click();
		await page.getByTestId("bookmarks").click();
		const label = (await page.getByTestId("bookmark").textContent()) ?? "";
		expect(label.length).toBeGreaterThan(3);
		expect(label).not.toContain("% through");
		await page.keyboard.press("Escape");
		await scroller.evaluate((el) => {
			el.scrollTop = 0;
		});
		await page.getByTestId("file-more").click();
		await page.getByTestId("bookmarks").click();
		await page.getByTestId("bookmark").getByRole("button").first().click();
		await expect
			.poll(() => scroller.evaluate((el) => el.scrollTop))
			.toBeGreaterThan(100);
	});
});

test.describe("bookmarks on a desktop", () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	test("Ctrl+D adds one, and the side panel lists them", async ({ page }) => {
		await boot(page, {}, "?desktop");
		await openFixture(page, "sample.pptx");
		await expect(page.getByTestId("slide-page-field")).toBeVisible({
			timeout: 20_000,
		});
		await page.keyboard.press("ArrowRight");
		await expect(page.getByTestId("slide-page-field")).toHaveValue("2");
		await page.keyboard.press("Control+d");
		await page.getByTestId("side-toggle").click();
		await page.getByTestId("side-tab-bookmarks").click();
		await expect(page.getByTestId("bookmark")).toHaveText(["Slide 2"]);
		await page.keyboard.press("Home");
		await page.getByTestId("bookmark").getByRole("button").first().click();
		await expect(page.getByTestId("slide-page-field")).toHaveValue("2");
	});
});

test.describe("books", () => {
	test("an EPUB reads as one text, with its contents, pictures and notes", async ({
		page,
	}) => {
		await boot(page);
		await openFixture(page, "features/book.epub", "The Wren's Year.epub");
		const book = page.getByTestId("epub-scroll");
		await expect(book).toContainText("The first wren of spring", {
			timeout: 20_000,
		});
		// The book's own styles (and their web address) are left out.
		await expect(book.locator("link, style")).toHaveCount(0);
		// The cover picture, drawn from inside the book.
		const cover = book.locator("img").first();
		await expect(cover).toHaveAttribute("src", /^blob:/);
		await expect
			.poll(() =>
				cover.evaluate((img) => (img as HTMLImageElement).naturalWidth),
			)
			.toBe(300);
		// A right-to-left chapter reads from the right.
		await expect(book.locator('section[dir="rtl"]')).toContainText("بہار");

		await page.getByTestId("file-more").click();
		await page.getByTestId("epub-contents").click();
		await expect(page.getByTestId("epub-toc")).toHaveText([
			"Spring",
			"Summer",
			"The hot days",
			"بہار",
		]);
		await page.getByTestId("epub-toc").nth(1).click();
		await expect
			.poll(() =>
				page
					.locator("#pw-c2")
					.evaluate((el) => Math.round(el.getBoundingClientRect().top)),
			)
			.toBeLessThan(160);

		// A note's link leads to the note.
		await page.locator("#pw-c1").scrollIntoViewIfNeeded();
		await page.locator('a[href="#pw-c4-n1"]').click();
		await expect(page.locator("#pw-c4-n1")).toBeInViewport();

		await page.getByTestId("epub-find").click();
		await page.getByTestId("find-input").fill("hedge");
		await expect(page.getByTestId("find-count")).toHaveText(/1 of 8\d/);
		await page.keyboard.press("Escape");

		await page.getByTestId("file-more").click();
		await page.getByTestId("file-details-open").click();
		await expect(page.getByTestId("file-details")).toContainText("Hedge Press");
	});

	test("a book locked by its store says so", async ({ page }) => {
		await boot(page);
		await openFixture(page, "features/locked.epub");
		await expect(page.getByTestId("epub-error")).toContainText(
			"This book is locked",
			{ timeout: 20_000 },
		);
	});
});
