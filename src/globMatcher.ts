/**
 * MSBuild のワイルドカード(`**` / `*` / `?`)の最小限の一致判定。
 *
 * SDK スタイル .vbproj の既定グロブ展開と、`<Compile Remove="...">` /
 * `<Compile Update="...">` / `DefaultItemExcludes` の解釈にだけ使う。
 * MSBuild 式 $()/@()/%() は扱わない(呼び出し側で未解決として扱う)。
 *
 * - パターン・対象パスとも `\` と `/` を同一視し、大文字小文字は区別しない
 *   (Windows のファイルシステム前提)
 * - `**` は 0 個以上のディレクトリ、`*` はセグメント内の任意の文字列、
 *   `?` はセグメント内の 1 文字
 * - 対象パスはプロジェクトディレクトリ基準の相対パス(先頭の `./` は無視)
 */

function escapeRegExp(value: string): string {
	return value.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

/** パス区切りを `/` に揃え、先頭の `./` を落とす */
export function normalizeGlobPath(value: string): string {
	return value
		.replace(/\\/g, "/")
		.replace(/^(?:\.\/)+/, "")
		.replace(/\/{2,}/g, "/");
}

export function globToRegExp(pattern: string): RegExp {
	const normalized = normalizeGlobPath(pattern.trim());
	let source = "";
	let i = 0;
	while (i < normalized.length) {
		const ch = normalized[i];
		if (ch === "*" && normalized[i + 1] === "*") {
			// `**/` は 0 個以上のディレクトリ、末尾や `/` が続かない `**` は何でも
			if (normalized[i + 2] === "/") {
				source += "(?:.*/)?";
				i += 3;
			} else {
				source += ".*";
				i += 2;
			}
			continue;
		}
		if (ch === "*") {
			source += "[^/]*";
		} else if (ch === "?") {
			source += "[^/]";
		} else {
			source += escapeRegExp(ch);
		}
		i += 1;
	}
	return new RegExp(`^${source}$`, "i");
}

/** relativePath がパターンに一致するか(`\` / `/` 混在可) */
export function globMatches(pattern: string, relativePath: string): boolean {
	return globToRegExp(pattern).test(normalizeGlobPath(relativePath));
}
