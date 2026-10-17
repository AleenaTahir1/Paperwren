import { expect, test } from "@playwright/test";
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
