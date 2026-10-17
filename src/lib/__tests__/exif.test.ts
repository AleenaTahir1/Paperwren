import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exifDate, readExif } from "../exif";

describe("readExif", () => {
	it("reads the camera, the shot and the place from a photo", () => {
		const facts = readExif(
			new Uint8Array(readFileSync("fixtures/features/photo.jpg")),
		);
		expect(facts.camera).toBe("Canon EOS R6");
		expect(facts.lens).toBe("RF 50mm F1.8");
		expect(facts.taken).toBe("2024:05:01 14:03:21");
		expect(facts.exposure).toBe("1/125 s · f/2.8 · ISO 400 · 50 mm");
		expect(facts.place?.[0]).toBeCloseTo(34.05, 2);
		expect(facts.place?.[1]).toBeCloseTo(-118.25, 2);
	});

	it("says nothing about a picture without it", () => {
		expect(
			readExif(new Uint8Array(readFileSync("fixtures/sample.png"))),
		).toEqual({});
		expect(readExif(new Uint8Array([0xff, 0xd8, 0xff]))).toEqual({});
	});

	it("reads the camera's way of writing a date", () => {
		expect(exifDate("2024:05:01 14:03:22")?.getMonth()).toBe(4);
		expect(exifDate("not a date")).toBeNull();
	});
});
