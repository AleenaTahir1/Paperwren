import { type SavedFile, requestForSaved } from "@/lib/backend";
import { t } from "@/lib/i18n";
import type { OpenRequest } from "@/lib/types";
import { toast } from "@/ui";

/** Say where a copy went, offering to open it where it can be. */
export function announceSaved(
	saved: SavedFile,
	open?: (request: OpenRequest) => void,
	size = 0,
) {
	const request = requestForSaved(saved, size);
	toast(
		t("Saved as {name}", { name: saved.name }),
		request && open
			? { label: t("Open"), run: () => open(request) }
			: undefined,
	);
}
