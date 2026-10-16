import { attrOf, kid, kids } from "./xml";

export type Crop = [number, number, number, number];
export function pictureCrop(fill: Element | null): Crop | undefined {
	const rect = kid(fill, "srcRect");
	const crop = ["l", "t", "r", "b"].map(
		(n) => Number(attrOf(rect, n) ?? 0) / 100000,
	) as Crop;
	return crop.every(Number.isFinite) &&
		crop.some((v) => v !== 0) &&
		crop[0] + crop[2] < 1 &&
		crop[1] + crop[3] < 1
		? crop
		: undefined;
}
/** Image alpha is multiplied with the source pixels' alpha, never substituted. */
export function pictureEffects(fill: Element | null): {
	opacity?: number;
	imageFilter?: string;
} {
	let opacity = 1;
	const filters: string[] = [];
	for (const effect of kids(kid(fill, "blip"))) {
		if (effect.localName === "alphaModFix") {
			const amount = Number(attrOf(effect, "amt") ?? 100000) / 100000;
			if (Number.isFinite(amount)) opacity *= amount;
		} else if (effect.localName === "grayscl") filters.push("grayscale(1)");
	}
	return {
		opacity: opacity === 1 ? undefined : Math.max(0, Math.min(1, opacity)),
		imageFilter: filters.join(" ") || undefined,
	};
}
