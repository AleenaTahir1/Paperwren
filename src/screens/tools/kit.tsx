import { type SavedFile, backend } from "@/lib/backend";
import { t, tn } from "@/lib/i18n";
import { openPdf } from "@/lib/pdfEngine";
import { ToolError, pageCount } from "@/lib/pdfTools";
import { sniffFormat } from "@/lib/sniff";
import type { OpenRequest } from "@/lib/types";
import { PasswordDialog } from "@/screens/viewer/Dialogs";
import { Button, IconButton, toast } from "@/ui";
import { ArrowDown, ArrowUp, FilePlus2, X } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";
import s from "./Tools.module.css";
import { announceSaved } from "./saved";

/** A file a tool works on, read into memory. */
export interface ToolFile {
	key: number;
	name: string;
	bytes: Uint8Array;
	/** PDFs: how many pages, and the password it was opened with. */
	pages?: number;
	password?: string;
}

let keys = 0;

/** What the tools take in. */
export type Takes = "pdf" | "image";

/** Ask for a PDF's password until it opens or the reader gives up. */
function usePassword() {
	const [asking, setAsking] = useState<{
		name: string;
		wrong: boolean;
		answer: (password: string | null) => void;
	} | null>(null);
	const ask = useCallback(
		(name: string, wrong: boolean) =>
			new Promise<string | null>((answer) =>
				setAsking({ name, wrong, answer }),
			),
		[],
	);
	const dialog = asking ? (
		<PasswordDialog
			open
			name={asking.name}
			wrong={asking.wrong}
			onSubmit={(password) => {
				setAsking(null);
				asking.answer(password);
			}}
			onCancel={() => {
				setAsking(null);
				asking.answer(null);
			}}
			testId="tool"
		/>
	) : null;
	return { ask, dialog };
}

/**
 * The files a tool works on: picked one at a time (or handed in), kept
 * in order, moved up and down, taken away. PDFs are opened to count
 * their pages, asking for a password when one is needed.
 */
export function useToolFiles(takes: Takes, initial?: OpenRequest) {
	const [files, setFiles] = useState<ToolFile[]>([]);
	const [busy, setBusy] = useState(false);
	const password = usePassword();

	const adopt = useCallback(
		async (request: OpenRequest) => {
			setBusy(true);
			try {
				const bytes = new Uint8Array(await backend.read(request.reopen));
				const format = sniffFormat(bytes.buffer as ArrayBuffer, request.name);
				if (takes === "pdf" && format !== "pdf") {
					toast(t("{name} isn't a PDF", { name: request.name }));
					return;
				}
				if (takes === "image" && format !== "image") {
					toast(t("{name} isn't a picture", { name: request.name }));
					return;
				}
				const file: ToolFile = { key: ++keys, name: request.name, bytes };
				if (takes === "pdf") {
					let tried: string | undefined;
					let wrong = false;
					for (;;) {
						try {
							file.pages = await pageCount(bytes, tried);
							file.password = tried;
							break;
						} catch (err) {
							if (!(err instanceof ToolError) || err.reason !== "password") {
								toast(t("{name} couldn't be read", { name: request.name }));
								return;
							}
							const answer = await password.ask(request.name, wrong);
							if (answer === null) return;
							tried = answer;
							wrong = true;
						}
					}
				}
				setFiles((list) => [...list, file]);
			} catch {
				toast(t("{name} couldn't be read", { name: request.name }));
			} finally {
				setBusy(false);
			}
		},
		[takes, password.ask],
	);

	const given = useRef(false);
	useEffect(() => {
		if (initial && !given.current) {
			given.current = true;
			adopt(initial);
		}
	}, [initial, adopt]);

	const add = async () => {
		const picked = await backend.pickFile().catch(() => null);
		if (picked) await adopt(picked);
	};
	const move = (key: number, by: -1 | 1) =>
		setFiles((list) => {
			const at = list.findIndex((f) => f.key === key);
			const to = at + by;
			if (at < 0 || to < 0 || to >= list.length) return list;
			const next = [...list];
			[next[at], next[to]] = [next[to], next[at]];
			return next;
		});
	const remove = (key: number) =>
		setFiles((list) => list.filter((f) => f.key !== key));
	return { files, busy, add, move, remove, dialog: password.dialog };
}

/** The files, in order, with a button to add one. */
export function FileList({
	kit,
	several,
	addLabel,
}: {
	kit: ReturnType<typeof useToolFiles>;
	/** Several files, in an order the reader sets. */
	several: boolean;
	addLabel: string;
}) {
	const { files, busy, add, move, remove } = kit;
	return (
		<div className={s.files}>
			{files.map((file, i) => (
				<div key={file.key} className={s.fileRow} data-testid="tool-file">
					<span className={s.fileName} dir="auto">
						{file.name}
					</span>
					{file.pages !== undefined && (
						<span className={s.fileMeta}>
							{tn(file.pages, "{n} page", "{n} pages")}
						</span>
					)}
					{several && (
						<>
							<IconButton
								label={t("Move up")}
								disabled={i === 0}
								onClick={() => move(file.key, -1)}
								data-testid="tool-file-up"
							>
								<ArrowUp size={18} />
							</IconButton>
							<IconButton
								label={t("Move down")}
								disabled={i === files.length - 1}
								onClick={() => move(file.key, 1)}
							>
								<ArrowDown size={18} />
							</IconButton>
						</>
					)}
					<IconButton
						label={t("Remove")}
						onClick={() => remove(file.key)}
						data-testid="tool-file-remove"
					>
						<X size={18} />
					</IconButton>
				</div>
			))}
			{(several || !files.length) && (
				<Button
					variant="secondary"
					onClick={add}
					disabled={busy}
					data-testid="tool-add"
				>
					<FilePlus2 size={18} /> {busy ? t("Opening…") : addLabel}
				</Button>
			)}
		</div>
	);
}

/** Run a tool and save what it made, saying how it went. */
export function useRun(onOpen?: (request: OpenRequest) => void) {
	const [running, setRunning] = useState(false);
	const run = async (
		make: () => Promise<{ name: string; bytes: Uint8Array; mime: string }>,
	): Promise<SavedFile | null> => {
		setRunning(true);
		try {
			const made = await make();
			const saved = await backend.saveFile(made.name, made.bytes, made.mime);
			if (saved) announceSaved(saved, onOpen, made.bytes.length);
			return saved;
		} catch (err) {
			toast(
				err instanceof ToolError && err.reason === "password"
					? t("This PDF's password is needed to save a copy")
					: t("Couldn't save a copy"),
			);
			return null;
		} finally {
			setRunning(false);
		}
	};
	return { running, run };
}

/** A PDF opened for drawing its pages, while it is in use. */
export function usePdf(file: ToolFile | undefined) {
	const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
	useEffect(() => {
		if (!file) {
			setDoc(null);
			return;
		}
		let alive = true;
		let opened: PDFDocumentProxy | null = null;
		openPdf(file.bytes, file.password)
			.then((d) => {
				opened = d;
				if (alive) setDoc(d);
				else d.destroy();
			})
			.catch(() => {});
		return () => {
			alive = false;
			opened?.destroy();
		};
	}, [file]);
	return doc;
}

/** A page drawn small, turned by `turn` degrees. */
export function PageThumb({
	doc,
	page,
	turn = 0,
	width = 120,
}: {
	doc: PDFDocumentProxy;
	page: number;
	turn?: number;
	width?: number;
}) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const [shape, setShape] = useState(1 / 1.41);
	useEffect(() => {
		let alive = true;
		let task: { cancel(): void; promise: Promise<void> } | null = null;
		(async () => {
			const proxy = await doc.getPage(page + 1);
			const el = canvas.current;
			const ctx = el?.getContext("2d");
			if (!alive || !el || !ctx) return;
			const base = proxy.getViewport({
				scale: 1,
				rotation: (proxy.rotate + turn) % 360,
			});
			setShape(base.width / base.height);
			const density = Math.min(2, window.devicePixelRatio || 1);
			const viewport = proxy.getViewport({
				scale: (width * density) / base.width,
				rotation: (proxy.rotate + turn) % 360,
			});
			el.width = Math.ceil(viewport.width);
			el.height = Math.ceil(viewport.height);
			task = proxy.render({ canvasContext: ctx, viewport });
			await task.promise.catch(() => {});
		})().catch(() => {});
		return () => {
			alive = false;
			task?.cancel();
		};
	}, [doc, page, turn, width]);
	return (
		<canvas
			ref={canvas}
			className={s.thumb}
			style={{ width, height: width / shape }}
		/>
	);
}
