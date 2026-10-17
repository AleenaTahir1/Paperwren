import { type FileRef, backend } from "@/lib/backend";
import { joinName, nameProblem, splitName } from "@/lib/fileName";
import { t } from "@/lib/i18n";
import type { Reopen } from "@/lib/types";
import { useRecents } from "@/state/recents";
import { Button, Dialog, toast } from "@/ui";
import { useState } from "react";
import s from "./Shell.module.css";

/** Why the system refused a rename, in words. */
function refusal(err: unknown): string {
	const kind = (err as { kind?: unknown })?.kind;
	if (kind === "exists")
		return t("Another file in that folder already has this name");
	if (kind === "not_found") return t("The file is no longer where it was");
	if (kind === "invalid_name") return t("That name can't be used");
	return t("Couldn't rename this file");
}

/**
 * Give a file a new name. The extension stays as it is, so a file
 * keeps opening as what it is. On a desktop the file itself is renamed
 * in its folder (never over another file); on a phone the app holds a
 * copy, and the new name is the one it goes by here and is shared by.
 */
export function RenameDialog({
	file,
	id,
	onClose,
	onRenamed,
}: {
	file: FileRef;
	/** Its id in recents. */
	id: string;
	onClose: () => void;
	onRenamed?: (name: string, reopen: Reopen, id: string) => void;
}) {
	const recents = useRecents();
	const [stem0, ext] = splitName(file.name);
	const [stem, setStem] = useState(stem0);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const problem = nameProblem(stem, ext);

	const submit = async () => {
		if (busy) return;
		if (problem) {
			setError(t(problem));
			return;
		}
		const name = joinName(stem, ext);
		if (name === file.name) {
			onClose();
			return;
		}
		setBusy(true);
		try {
			const reopen = await backend.rename(file, name);
			const now = recents.rename(id, name, reopen);
			onRenamed?.(name, reopen, now);
			toast(t("Renamed to {name}", { name }));
			onClose();
		} catch (err) {
			setError(refusal(err));
			setBusy(false);
		}
	};

	return (
		<Dialog
			open
			title={t("Rename")}
			onClose={onClose}
			testId="rename"
			actions={
				<>
					<Button variant="ghost" onClick={onClose}>
						{t("Cancel")}
					</Button>
					<Button
						onClick={submit}
						disabled={busy || !!problem}
						data-testid="rename-go"
					>
						{t("Rename")}
					</Button>
				</>
			}
		>
			<form
				className={s.renameForm}
				onSubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<div className={s.renameField}>
					<input
						className={s.input}
						dir="auto"
						autoComplete="off"
						spellCheck={false}
						// biome-ignore lint/a11y/noAutofocus: the dialog exists to type a name
						autoFocus
						onFocus={(e) => e.currentTarget.select()}
						value={stem}
						onChange={(e) => {
							setStem(e.target.value);
							setError(null);
						}}
						aria-label={t("New name")}
						aria-invalid={!!error || undefined}
						data-testid="rename-input"
					/>
					{ext && (
						<span className={s.renameExt} dir="ltr">
							{ext}
						</span>
					)}
				</div>
				{(error || (problem && stem.trim())) && (
					<p className={s.renameError} role="alert" data-testid="rename-error">
						{error ?? t(problem ?? "")}
					</p>
				)}
			</form>
		</Dialog>
	);
}
