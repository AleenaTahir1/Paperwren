/**
 * The pictures of a folder browsed in the app, kept for this run: a
 * picture opened from one can step to the next, on a phone too (where
 * the system hands the app one file, not the folder around it).
 */

import { formatFromName } from "./formats";
import type { OpenRequest } from "./types";

const around = new Map<string, OpenRequest[]>();
const byName = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base",
});

/** Remember the pictures of a folder's listing, in name order. */
export function rememberPictures(list: OpenRequest[]) {
	const pictures = list
		.filter((r) => formatFromName(r.name) === "image")
		.sort((a, b) => byName.compare(a.name, b.name));
	for (const picture of pictures) around.set(picture.id, pictures);
}

/** The pictures beside this one, itself included; empty when it was
 * not opened from a folder browsed in the app. */
export const picturesAround = (id: string): OpenRequest[] =>
	around.get(id) ?? [];
