import { tn } from "@/lib/i18n";
import type { JsonNode } from "@/lib/jsonTree";
import s from "./Text.module.css";

/** Values this deep or deeper start folded. */
const OPEN_DEPTH = 2;

const COLOUR = {
	string: "hljs-string",
	number: "hljs-number",
	boolean: "hljs-literal",
	null: "hljs-literal",
} as const;

function Key({ name }: { name?: string }) {
	if (name === undefined) return null;
	return (
		<>
			<span className="hljs-attr" dir="auto">
				{JSON.stringify(name)}
			</span>
			<span className="hljs-punctuation">: </span>
		</>
	);
}

function Node({ node, depth }: { node: JsonNode; depth: number }) {
	if ("raw" in node)
		return (
			<div className={s.leaf}>
				<Key name={node.key} />
				<span className={COLOUR[node.kind]} dir="auto">
					{node.raw}
				</span>
			</div>
		);
	const [open, close] = node.kind === "object" ? ["{", "}"] : ["[", "]"];
	const n = node.children.length;
	if (!n)
		return (
			<div className={s.leaf}>
				<Key name={node.key} />
				{open}
				{close}
			</div>
		);
	return (
		<details className={s.branch} open={depth < OPEN_DEPTH}>
			<summary>
				<Key name={node.key} />
				{open}
				<span className={s.folded}>
					…{close}{" "}
					<span className={s.count}>
						{node.kind === "object"
							? tn(n, "{n} key", "{n} keys")
							: tn(n, "{n} item", "{n} items")}
					</span>
				</span>
			</summary>
			<div className={s.children}>
				{node.children.map((child, i) => (
					<Node key={i} node={child} depth={depth + 1} />
				))}
			</div>
			<div className={s.leaf}>{close}</div>
		</details>
	);
}

/** A JSON file as a tree: each object and list folds away under its
 * name, showing how many keys or items it holds. */
export function JsonTree({ root }: { root: JsonNode }) {
	return (
		<div className={`${s.plain} ${s.tree}`} data-testid="json-tree">
			<Node node={root} depth={0} />
		</div>
	);
}

/** Folds or unfolds every branch of the tree in `root`. */
export function foldAll(root: HTMLElement | null, open: boolean) {
	for (const branch of root?.querySelectorAll("details") ?? [])
		branch.open = open;
}
