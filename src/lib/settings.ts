import { LANGUAGES, type LanguageSetting } from "./i18n";
import { SPEECH_RATES } from "./speech";
import {
	DEFAULT_SETTINGS,
	type PageColor,
	type PdfFlow,
	type PdfZoom,
	type ResolvedTheme,
	type Settings,
	type ThemeSetting,
} from "./types";

export const THEMES: ThemeSetting[] = ["system", "light", "sepia", "dark"];

/** Themes from v0.10 folded into the three that remain. */
const RETIRED_THEMES: Record<string, ResolvedTheme> = {
	black: "dark",
	aurora: "dark",
	paper: "light",
	glass: "light",
};

export function isDarkTheme(theme: ResolvedTheme): boolean {
	return theme === "dark";
}
const ZOOMS: PdfZoom[] = ["page-width", "page-fit", "auto"];
const FLOWS: PdfFlow[] = ["down", "across"];
export const PAGE_COLORS: PageColor[] = ["original", "sepia", "dark", "theme"];

/** The paper actually drawn: "theme" is Paper's white, Sand's warm
 * page or Ink's dark one. */
export function resolvePageColor(
	setting: PageColor,
	theme: ResolvedTheme,
): Exclude<PageColor, "theme"> {
	if (setting !== "theme") return setting;
	return theme === "dark" ? "dark" : theme === "sepia" ? "sepia" : "original";
}
const LIMITS = [20, 50, 100, 500];

/** Validate stored settings field by field; unknown values fall back
 * to defaults instead of reaching the UI. */
export function normalizeSettings(value: unknown): Settings {
	if (!value || typeof value !== "object") return { ...DEFAULT_SETTINGS };
	const raw = value as Record<string, unknown>;
	const pick = <T>(v: unknown, allowed: T[], fallback: T): T =>
		allowed.includes(v as T) ? (v as T) : fallback;
	const bool = (v: unknown, fallback: boolean) =>
		typeof v === "boolean" ? v : fallback;
	return {
		theme: pick(
			RETIRED_THEMES[raw.theme as string] ?? raw.theme,
			THEMES,
			DEFAULT_SETTINGS.theme,
		),
		language: pick(
			raw.language,
			["system", ...LANGUAGES.map(([lang]) => lang)] as LanguageSetting[],
			DEFAULT_SETTINGS.language,
		),
		pdfZoom: pick(raw.pdfZoom, ZOOMS, DEFAULT_SETTINGS.pdfZoom),
		pdfFlow: pick(raw.pdfFlow, FLOWS, DEFAULT_SETTINGS.pdfFlow),
		rememberPosition: bool(
			raw.rememberPosition,
			DEFAULT_SETTINGS.rememberPosition,
		),
		// "Dark pages" (before 1.2) darkened PDFs in the Ink theme only:
		// the paper that follows the theme does that and more.
		pageColor: pick(
			raw.pageColor ?? (raw.darkPages === true ? "theme" : undefined),
			PAGE_COLORS,
			DEFAULT_SETTINGS.pageColor,
		),
		keepAwake: bool(raw.keepAwake, DEFAULT_SETTINGS.keepAwake),
		keepRecents: bool(raw.keepRecents, DEFAULT_SETTINGS.keepRecents),
		recentsLimit: pick(raw.recentsLimit, LIMITS, DEFAULT_SETTINGS.recentsLimit),
		sidePanel: bool(raw.sidePanel, DEFAULT_SETTINGS.sidePanel),
		readingView: bool(raw.readingView, DEFAULT_SETTINGS.readingView),
		wrapText: bool(raw.wrapText, DEFAULT_SETTINGS.wrapText),
		speechRate: pick(raw.speechRate, SPEECH_RATES, DEFAULT_SETTINGS.speechRate),
	};
}

/** Map the pre-redesign key/value shape ("appearance.theme", five
 * named palettes, ...) onto the new settings. */
export function migrateLegacySettings(value: unknown): Settings {
	if (!value || typeof value !== "object") return { ...DEFAULT_SETTINGS };
	const raw = value as Record<string, unknown>;
	const legacyTheme = raw["appearance.theme"];
	let theme: ThemeSetting = "system";
	if (legacyTheme === "light") theme = "light";
	else if (legacyTheme === "sepia") theme = "sepia";
	else if (
		legacyTheme === "dark" ||
		legacyTheme === "moss" ||
		legacyTheme === "slate"
	)
		theme = "dark";
	const zoom = raw["viewer.zoom_mode_pdf"];
	const limit = raw["files.recents_limit"];
	return normalizeSettings({
		theme,
		pdfZoom:
			zoom === "fit_page" ? "page-fit" : zoom === "100" ? "auto" : "page-width",
		rememberPosition: raw["viewer.remember_position"],
		darkPages: raw["viewer.darken_pages"],
		keepRecents: raw["files.save_recents"],
		recentsLimit: limit === -1 ? 500 : limit,
	});
}

export function resolveTheme(
	theme: ThemeSetting,
	systemDark: boolean,
): ResolvedTheme {
	if (theme === "system") return systemDark ? "dark" : "light";
	return theme;
}
