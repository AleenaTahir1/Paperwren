/**
 * What a camera wrote into a JPEG photo (its EXIF block): the camera,
 * when it was taken, how, and where. Read for Details only; nothing is
 * changed, and the place is shown to the person whose photo it is.
 */

export interface PhotoFacts {
	camera?: string;
	lens?: string;
	/** "2024:05:01 14:03:22", as the camera wrote it. */
	taken?: string;
	exposure?: string;
	/** Degrees north and east (south and west are negative). */
	place?: [number, number];
}

type Value = number | string | number[];

function readIfd(
	view: DataView,
	start: number,
	at: number,
	little: boolean,
): Map<number, Value> {
	const tags = new Map<number, Value>();
	if (at + 2 > view.byteLength) return tags;
	const count = view.getUint16(at, little);
	for (let i = 0; i < count; i++) {
		const entry = at + 2 + i * 12;
		if (entry + 12 > view.byteLength) break;
		const tag = view.getUint16(entry, little);
		const type = view.getUint16(entry + 2, little);
		const n = view.getUint32(entry + 4, little);
		const size = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8][type] ?? 0;
		if (!size) continue;
		const where =
			size * n <= 4 ? entry + 8 : start + view.getUint32(entry + 8, little);
		if (where + size * n > view.byteLength) continue;
		if (type === 2) {
			let text = "";
			for (let k = 0; k < n; k++) {
				const c = view.getUint8(where + k);
				if (!c) break;
				text += String.fromCharCode(c);
			}
			tags.set(tag, text.trim());
			continue;
		}
		const values: number[] = [];
		for (let k = 0; k < Math.min(n, 16); k++) {
			const p = where + k * size;
			if (type === 3) values.push(view.getUint16(p, little));
			else if (type === 4) values.push(view.getUint32(p, little));
			else if (type === 9) values.push(view.getInt32(p, little));
			else if (type === 5 || type === 10) {
				const num =
					type === 5 ? view.getUint32(p, little) : view.getInt32(p, little);
				const den =
					type === 5
						? view.getUint32(p + 4, little)
						: view.getInt32(p + 4, little);
				values.push(den ? num / den : 0);
			} else values.push(view.getUint8(p));
		}
		tags.set(tag, values.length === 1 ? values[0] : values);
	}
	return tags;
}

/** The EXIF block of a JPEG, as a TIFF structure, or null. */
function exifBlock(bytes: Uint8Array): DataView | null {
	if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
	let at = 2;
	while (at + 4 < bytes.length && bytes[at] === 0xff) {
		const marker = bytes[at + 1];
		const length = (bytes[at + 2] << 8) | bytes[at + 3];
		if (
			marker === 0xe1 &&
			bytes[at + 4] === 0x45 && // E
			bytes[at + 5] === 0x78 && // x
			bytes[at + 6] === 0x69 && // i
			bytes[at + 7] === 0x66 // f
		)
			return new DataView(
				bytes.buffer,
				bytes.byteOffset + at + 10,
				Math.min(length - 8, bytes.length - at - 10),
			);
		// The picture itself begins: no EXIF after this.
		if (marker === 0xda) return null;
		at += 2 + length;
	}
	return null;
}

const num = (v: Value | undefined) => (typeof v === "number" ? v : undefined);
const text = (v: Value | undefined) =>
	typeof v === "string" && v ? v : undefined;

function degrees(v: Value | undefined, ref: Value | undefined) {
	if (!Array.isArray(v) || v.length < 3) return undefined;
	const value = v[0] + v[1] / 60 + v[2] / 3600;
	return ref === "S" || ref === "W" ? -value : value;
}

/** What the camera says about a photo; empty for anything else. */
export function readExif(bytes: Uint8Array): PhotoFacts {
	const view = exifBlock(bytes);
	if (!view || view.byteLength < 8) return {};
	const little = view.getUint16(0) === 0x4949;
	const first = view.getUint32(4, little);
	const main = readIfd(view, 0, first, little);
	const sub = num(main.get(34665));
	const shot = sub ? readIfd(view, 0, sub, little) : new Map<number, Value>();
	const gpsAt = num(main.get(34853));
	const gps = gpsAt
		? readIfd(view, 0, gpsAt, little)
		: new Map<number, Value>();

	const make = text(main.get(271));
	const model = text(main.get(272));
	// "Canon" + "Canon EOS R6" reads as "Canon EOS R6".
	const camera =
		model && make && model.toLowerCase().startsWith(make.toLowerCase())
			? model
			: [make, model].filter(Boolean).join(" ") || undefined;

	const time = num(shot.get(33434));
	const f = num(shot.get(33437));
	const iso = num(shot.get(34855));
	const focal = num(shot.get(37386));
	const exposure =
		[
			time
				? time >= 1
					? `${Math.round(time * 10) / 10} s`
					: `1/${Math.round(1 / time)} s`
				: "",
			f ? `f/${Math.round(f * 10) / 10}` : "",
			iso ? `ISO ${iso}` : "",
			focal ? `${Math.round(focal)} mm` : "",
		]
			.filter(Boolean)
			.join(" · ") || undefined;

	const lat = degrees(gps.get(2), gps.get(1));
	const lon = degrees(gps.get(4), gps.get(3));
	return {
		camera,
		lens: text(shot.get(42036)),
		taken: text(shot.get(36867)) ?? text(main.get(306)),
		exposure,
		place: lat !== undefined && lon !== undefined ? [lat, lon] : undefined,
	};
}

/** "2024:05:01 14:03:22" as a date, or null. */
export function exifDate(raw: string | undefined): Date | null {
	const m = raw && /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(raw);
	if (!m) return null;
	const date = new Date(
		Number(m[1]),
		Number(m[2]) - 1,
		Number(m[3]),
		Number(m[4]),
		Number(m[5]),
	);
	return Number.isNaN(date.getTime()) ? null : date;
}
