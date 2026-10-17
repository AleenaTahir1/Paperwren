import { describe, expect, it } from "vitest";
import {
	guessLang,
	pickVoice,
	pieces,
	runningText,
	sentences,
} from "../speech";

const say = (text: string, max?: number) =>
	pieces(text, max).map(([a, b]) => text.slice(a, b));

describe("pieces to read", () => {
	it("are whole sentences, gathered while they fit", () => {
		const text = "One. Two is here! Three? Four.";
		expect(say(text, 12)).toEqual(["One. ", "Two is here! ", "Three? Four."]);
		expect(say(text)).toEqual([text]);
	});

	it("cut an overlong sentence between words", () => {
		const text = `${"word ".repeat(100)}end.`;
		const parts = say(text, 60);
		expect(parts.length).toBeGreaterThan(5);
		for (const part of parts) expect(part.length).toBeLessThanOrEqual(60);
		expect(parts.join("")).toBe(text);
		expect(parts.every((p) => !p.startsWith("ord"))).toBe(true);
	});

	it("say nothing for nothing", () => {
		expect(say("   ")).toEqual([]);
		expect(sentences("")).toEqual([]);
	});
});

describe("runningText", () => {
	it("joins a PDF page's lines and the words broken across them", () => {
		expect(
			runningText(["The exam-", "ple goes", "on here.", "", "New para."]),
		).toBe("The example goes on here.\n\nNew para.");
	});
});

describe("pickVoice", () => {
	const voices = [
		{ lang: "en-US", default: true },
		{ lang: "en-GB" },
		{ lang: "ur-PK" },
	];
	it("takes the document's language and region, then its language", () => {
		expect(pickVoice(voices, "en-GB")?.lang).toBe("en-GB");
		expect(pickVoice(voices, "ur")?.lang).toBe("ur-PK");
		expect(pickVoice(voices, "fr")?.lang).toBe("en-US");
		expect(pickVoice([], "en")).toBeUndefined();
	});
});

describe("guessLang", () => {
	it("knows a script, not a Latin language", () => {
		expect(guessLang("چھوٹی سی چڑیا", "ur")).toBe("ur");
		expect(guessLang("مرحبا بالعالم")).toBe("ar");
		expect(guessLang("नमस्ते दुनिया")).toBe("hi");
		expect(guessLang("你好世界")).toBe("zh");
		expect(guessLang("こんにちは世界")).toBe("ja");
		expect(guessLang("Hello world")).toBeNull();
		expect(guessLang("1234")).toBeNull();
	});
});
