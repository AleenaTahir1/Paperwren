/**
 * Source code with its syntax coloured (highlight.js). Only the language
 * a file needs is loaded, the first time one is opened; a file past
 * HIGHLIGHT_MAX characters is shown plain, as colouring it would slow
 * the page more than it helps.
 */

import { extensionOf } from "./formats";

export const HIGHLIGHT_MAX = 400_000;

type Loader = () => Promise<{ default: unknown }>;

/** highlight.js's languages this app knows, each its own small chunk. */
const LOADERS: Record<string, Loader> = {
	javascript: () => import("highlight.js/lib/languages/javascript"),
	typescript: () => import("highlight.js/lib/languages/typescript"),
	python: () => import("highlight.js/lib/languages/python"),
	ruby: () => import("highlight.js/lib/languages/ruby"),
	go: () => import("highlight.js/lib/languages/go"),
	rust: () => import("highlight.js/lib/languages/rust"),
	java: () => import("highlight.js/lib/languages/java"),
	kotlin: () => import("highlight.js/lib/languages/kotlin"),
	swift: () => import("highlight.js/lib/languages/swift"),
	c: () => import("highlight.js/lib/languages/c"),
	cpp: () => import("highlight.js/lib/languages/cpp"),
	csharp: () => import("highlight.js/lib/languages/csharp"),
	php: () => import("highlight.js/lib/languages/php"),
	bash: () => import("highlight.js/lib/languages/bash"),
	powershell: () => import("highlight.js/lib/languages/powershell"),
	dos: () => import("highlight.js/lib/languages/dos"),
	sql: () => import("highlight.js/lib/languages/sql"),
	css: () => import("highlight.js/lib/languages/css"),
	scss: () => import("highlight.js/lib/languages/scss"),
	less: () => import("highlight.js/lib/languages/less"),
	xml: () => import("highlight.js/lib/languages/xml"),
	ini: () => import("highlight.js/lib/languages/ini"),
	gradle: () => import("highlight.js/lib/languages/gradle"),
	dart: () => import("highlight.js/lib/languages/dart"),
	lua: () => import("highlight.js/lib/languages/lua"),
	r: () => import("highlight.js/lib/languages/r"),
	perl: () => import("highlight.js/lib/languages/perl"),
	diff: () => import("highlight.js/lib/languages/diff"),
	json: () => import("highlight.js/lib/languages/json"),
	yaml: () => import("highlight.js/lib/languages/yaml"),
	dockerfile: () => import("highlight.js/lib/languages/dockerfile"),
	makefile: () => import("highlight.js/lib/languages/makefile"),
	markdown: () => import("highlight.js/lib/languages/markdown"),
};

/** A file's extension (or, for a few, its whole name) to its language. */
const BY_EXTENSION: Record<string, string> = {
	js: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	jsx: "javascript",
	ts: "typescript",
	tsx: "typescript",
	py: "python",
	rb: "ruby",
	go: "go",
	rs: "rust",
	java: "java",
	kt: "kotlin",
	kts: "kotlin",
	swift: "swift",
	c: "c",
	h: "c",
	cpp: "cpp",
	cc: "cpp",
	hpp: "cpp",
	cs: "csharp",
	php: "php",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	ps1: "powershell",
	bat: "dos",
	sql: "sql",
	css: "css",
	scss: "scss",
	less: "less",
	html: "xml",
	htm: "xml",
	vue: "xml",
	xml: "xml",
	plist: "xml",
	csproj: "xml",
	toml: "ini",
	ini: "ini",
	properties: "ini",
	conf: "ini",
	cfg: "ini",
	env: "ini",
	gradle: "gradle",
	dart: "dart",
	lua: "lua",
	r: "r",
	pl: "perl",
	diff: "diff",
	patch: "diff",
	json: "json",
	yml: "yaml",
	yaml: "yaml",
};
const BY_NAME: Record<string, string> = {
	dockerfile: "dockerfile",
	makefile: "makefile",
	gnumakefile: "makefile",
};

/** The language a file is written in, by its name, or null. */
export function languageOf(name: string): string | null {
	const base = name.split(/[\\/]/).pop()?.toLowerCase() ?? "";
	return BY_NAME[base] ?? BY_EXTENSION[extensionOf(base)] ?? null;
}

interface Hljs {
	registerLanguage(name: string, language: unknown): void;
	getLanguage(name: string): unknown;
	highlight(code: string, options: { language: string }): { value: string };
	highlightElement(el: HTMLElement): void;
}

let core: Promise<Hljs> | null = null;
async function engine(language: string): Promise<Hljs | null> {
	const load = LOADERS[language];
	if (!load) return null;
	core ??= import("highlight.js/lib/core").then(
		(m) => (m as unknown as { default: Hljs }).default,
	);
	const hljs = await core;
	if (!hljs.getLanguage(language))
		hljs.registerLanguage(language, (await load()).default);
	return hljs;
}

/** `text` as HTML with its syntax coloured (escaped by highlight.js),
 * or null when its language is not known or it is too long. */
export async function highlight(
	text: string,
	language: string,
): Promise<string | null> {
	if (text.length > HIGHLIGHT_MAX) return null;
	const hljs = await engine(language);
	return hljs ? hljs.highlight(text, { language }).value : null;
}

/** Colour the code blocks of rendered Markdown that name a language
 * ("```python"). */
export async function highlightBlocks(root: HTMLElement) {
	for (const block of root.querySelectorAll<HTMLElement>(
		'pre code[class*="language-"]',
	)) {
		const named = /language-([\w+-]+)/.exec(block.className)?.[1] ?? "";
		const language =
			(LOADERS[named] ? named : null) ??
			BY_EXTENSION[named.toLowerCase()] ??
			null;
		if (!language || (block.textContent?.length ?? 0) > HIGHLIGHT_MAX) continue;
		const hljs = await engine(language);
		if (!hljs || !block.isConnected) continue;
		block.innerHTML = hljs.highlight(block.textContent ?? "", {
			language,
		}).value;
		block.classList.add("hljs");
	}
}

/**
 * Highlighted HTML cut into lines, for line numbers: a span that runs
 * across a line end (a long comment) is closed at the end of each line
 * and opened again at the start of the next, so every line stands on
 * its own.
 */
export function splitLines(html: string): string[] {
	const lines: string[] = [];
	const open: string[] = [];
	let line = "";
	const tag = /<span[^>]*>|<\/span>|\n/g;
	let at = 0;
	for (let m = tag.exec(html); m; m = tag.exec(html)) {
		line += html.slice(at, m.index);
		at = m.index + m[0].length;
		if (m[0] === "\n") {
			lines.push(line + "</span>".repeat(open.length));
			line = open.join("");
		} else if (m[0] === "</span>") {
			open.pop();
			line += m[0];
		} else {
			open.push(m[0]);
			line += m[0];
		}
	}
	lines.push(line + html.slice(at));
	return lines;
}
