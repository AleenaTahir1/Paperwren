import { describe, expect, it } from "vitest";
import { decodeText } from "../text";

describe("decodeText", () => {
	const buf = (bytes: number[]) => new Uint8Array(bytes).buffer;
	it("allows an explicit encoding for ambiguous legacy text", () => {
		expect(decodeText(buf([0x82, 0xa0]), "shift-jis")).toBe("あ");
		expect(decodeText(buf([0xe9]), "windows-1252")).toBe("é");
		expect(decodeText(buf([0x41, 0]), "utf-16le")).toBe("A");
	});
	it("honours BOMs", () => {
		expect(decodeText(buf([0xff, 0xfe, 0x68, 0x00, 0xe9, 0x00]))).toBe("hé");
		expect(decodeText(buf([0xef, 0xbb, 0xbf, 0x68]))).toBe("h");
	});
	it("falls back to Windows-1252 for invalid UTF-8", () => {
		expect(decodeText(buf([0x63, 0x61, 0x66, 0xe9]))).toBe("café");
		expect(decodeText(buf([0x63, 0x61, 0x66, 0xc3, 0xa9]))).toBe("café");
	});
});
