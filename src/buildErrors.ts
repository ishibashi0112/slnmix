/**
 * `slnmix build` のエラー整形(v0.20.0、設計書 §22)。純粋関数のみ
 * (MSBuild の起動は msbuildRunner.ts、ファイル読み取りは deps)。
 *
 * MSBuild のログ(標準のエラー形式)からエラーを取り出し、Copilot Chat に貼って
 * 修正を頼める文面にする。各エラーには今の実ファイルの周辺行を付ける
 * (パックを作った後に petari で書き換わっていることが多く、AI が古い内容で
 * SEARCH を書くと petari の適用に失敗するため)。
 * 抜粋・エラーの本文・ログの末尾・ファイルとして読めないエラーの発生元は、パックと同じ規則で
 * 認証情報らしき値を [MASKED] に伏せる (この文面も AI に貼るため。v0.22.2)。抜粋はファイル全体を
 * 伏せてから切り出し (行の位置は元のまま)、パックが .gitignore で除外するファイルの抜粋は載せない。
 */

import * as path from "path";
import { MASK_TOKEN, maskCredentials, maskLinesForDisplay, maskedValuesForDisplay } from "./services/credentialMasker";

export interface BuildError {
	/** ファイルのパス(MSBuild が出したまま)、またはツール名(vbc / MSBUILD 等) */
	origin: string;
	line?: number;
	column?: number;
	code: string;
	message: string;
	/** 末尾の [プロジェクトのパス](相対パスの解決に使う) */
	project?: string;
}

/**
 * MSBuild の標準のエラー形式:
 *   origin[(location)] : [subcategory] error|warning code : text [project]
 * 先頭の "12>"(並列ビルドのノード番号)と字下げは無視する。
 * error / warning の語はローカライズされない(本文は日本語になる)
 */
const CANONICAL =
	/^\s*(?:\d+>)?\s*(.+?)(?:\(([\d,-]+)\))?\s*:\s*(?:[^:]*?\s)?error\s+([A-Za-z]+\d+)\s*:\s*(.*?)\s*(?:\[([^\]]+)\])?\s*$/;

export function parseMsbuildErrors(log: string): BuildError[] {
	const errors: BuildError[] = [];
	const seen = new Set<string>();
	for (const raw of log.split(/\r?\n/)) {
		const m = CANONICAL.exec(raw);
		if (m === null) {
			continue;
		}
		const [, origin = "", location, code = "", message = "", project] = m;
		// location は (行) / (行-行) / (行,列) / (行,列-列) / (行,列,行,列)
		const [lineText, columnText] = (location ?? "").split(",");
		const toNumber = (text: string | undefined): number | undefined => {
			const n = Number.parseInt((text ?? "").split("-")[0] ?? "", 10);
			return Number.isFinite(n) ? n : undefined;
		};
		const line = toNumber(lineText);
		const column = toNumber(columnText);
		// MSBuild は同じエラーを本文と末尾の一覧で 2 回出すことがある
		const key = [origin, line, column, code, message].join("\u0000");
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		errors.push({
			origin: origin.trim(),
			...(line !== undefined ? { line } : {}),
			...(column !== undefined ? { column } : {}),
			code,
			message,
			...(project !== undefined ? { project } : {}),
		});
	}
	return errors;
}

/** ファイルを指すエラーか(ツール名の origin は含まない) */
function looksLikePath(origin: string): boolean {
	return /[\\/]/.test(origin) || /\.[A-Za-z0-9]+$/.test(origin);
}

/** Windows の絶対パス(C:\ / \\server)か */
function isWindowsAbsolute(p: string): boolean {
	return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("\\\\");
}

/** エラーのファイルの絶対パス(相対ならプロジェクトの場所を基準にする) */
export function resolveErrorFile(error: BuildError): string | undefined {
	if (!looksLikePath(error.origin)) {
		return undefined;
	}
	const p = error.origin;
	if (isWindowsAbsolute(p)) {
		return path.win32.normalize(p);
	}
	if (path.isAbsolute(p)) {
		return path.normalize(p);
	}
	if (error.project === undefined) {
		return undefined;
	}
	const pathApi = isWindowsAbsolute(error.project) ? path.win32 : path;
	return pathApi.resolve(pathApi.dirname(error.project), p);
}

/** ルート相対の / 区切り(パックの <file path> と同じ形)。ルートの外なら絶対パスのまま */
export function displayPath(absolute: string, rootDir: string): string {
	const pathApi = isWindowsAbsolute(absolute) || isWindowsAbsolute(rootDir) ? path.win32 : path;
	const rel = pathApi.relative(rootDir, absolute);
	if (rel === "" || rel.startsWith("..") || pathApi.isAbsolute(rel)) {
		return absolute;
	}
	return rel.split(pathApi.sep).join("/");
}

export interface BuildErrorReportOptions {
	rootDir: string;
	/** ファイルの行(CRLF / LF で分けたもの。読めなければ undefined)。デコードは呼び出し側 */
	readLines(absolutePath: string): string[] | undefined;
	/** 載せるエラーの上限(先頭のエラーの連鎖で後続が増えることが多い) */
	maxErrors?: number;
	/** エラー行の前後に付ける行数 */
	contextLines?: number;
	/**
	 * 認証情報らしき値を [MASKED] に伏せる(パックと同じ規則。strict は高エントロピー値も)。
	 * 省略時は伏せない(--no-mask)
	 */
	mask?: { strict: boolean };
	/**
	 * パックでこのファイルを汎用テキストとして伏せることがあるか(generic の追加ディレクトリの .vb)。
	 * 省略時はあるものとして、.vb は VB / 汎用テキストの両方の伏せ方で伏せる。false の .vb は VB としてだけ
	 * 伏せる(パックと同じ。汎用テキストの伏せ方は代入の右辺などのコードまで伏せるため)
	 */
	genericTextFor?(absolutePath: string): boolean;
	/**
	 * パックが除外するファイル (.gitignore / .repomixignore) なら、根拠の ignore ファイルを返す。
	 * そのファイルの抜粋は載せない (認証情報を置くファイルを除外していることが多いため)
	 */
	excludedBy?(absolutePath: string): string | undefined;
}

const DEFAULT_MAX_ERRORS = 20;
const DEFAULT_CONTEXT_LINES = 4;

/** 拡張子 → コードフェンスの言語名(読みやすさのためだけ) */
function fenceLanguage(file: string): string {
	const ext = path.extname(file).toLowerCase();
	return ext === ".vb" ? "vb" : ext === ".cs" ? "csharp" : "";
}

function renderExcerpt(lines: string[], target: number, context: number): string[] {
	const start = Math.max(1, target - context);
	const end = Math.min(lines.length, target + context);
	const width = String(end).length;
	const out: string[] = [];
	for (let n = start; n <= end; n++) {
		const mark = n === target ? ">" : " ";
		out.push(`${mark} ${String(n).padStart(width)} │${lines[n - 1] ?? ""}`);
	}
	return out;
}

/** 語: ASCII の英数字の並び、または ASCII 以外の文字・数字の並び(日本語の文中の英数字の識別子も切り出す) */
const WORD = /[A-Za-z0-9_]+|[^\x00-\x7F\s\p{P}\p{S}]+/gu;
/** 語の種類(境界の判定用)。同じ種類の文字が隣にあれば、その位置は語の途中 */
function charClass(ch: string | undefined): "ascii" | "other" | undefined {
	if (ch === undefined) return undefined;
	if (/[A-Za-z0-9_]/.test(ch)) return "ascii";
	return /[^\x00-\x7F\s\p{P}\p{S}]/u.test(ch) ? "other" : undefined;
}

/** エラーの本文から伏せる値の最短の長さ(1〜2 文字の値で本文の記号や語を伏せないように) */
const MIN_MESSAGE_VALUE_LENGTH = 3;

/**
 * 文面の中の values を [MASKED] に伏せる。一致はすべて元の文面で探してから置き換える(伏せ字の
 * 中を伏せ直さない)。値の端の文字と同じ種類の文字(ASCII の英数字 / それ以外の文字)が隣にある位置は
 * 別の語の一部なので伏せない
 */
export function maskValues(text: string, values: string[]): string {
	const ranges: Array<[number, number]> = [];
	for (const value of values) {
		if (value === "") continue;
		const first = charClass(value[0]);
		const last = charClass(value[value.length - 1]);
		for (let at = text.indexOf(value); at >= 0; at = text.indexOf(value, at + 1)) {
			const end = at + value.length;
			const bounded =
				(first === undefined || charClass(text[at - 1]) !== first) &&
				(last === undefined || charClass(text[end]) !== last);
			if (bounded) ranges.push([at, end]);
		}
	}
	if (ranges.length === 0) return text;
	ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
	let out = "";
	let pos = 0;
	let open: [number, number] | undefined;
	for (const range of ranges) {
		if (open !== undefined && range[0] < open[1]) {
			open[1] = Math.max(open[1], range[1]);
			continue;
		}
		if (open !== undefined) {
			out += text.slice(pos, open[0]) + MASK_TOKEN;
			pos = open[1];
		}
		open = [range[0], range[1]];
	}
	if (open !== undefined) {
		out += text.slice(pos, open[0]) + MASK_TOKEN;
		pos = open[1];
	}
	return out + text.slice(pos);
}

/**
 * エラーの本文から伏せる値の候補: 抜粋で伏せた値(3 文字以上)と、その中の語(3 文字以上。値の一部が
 * 識別子として引用されることがあるため)。見えている値・語を除くのは、載せるエラーのファイルが
 * そろってから(filterVisible)
 */
interface MessageCandidates {
	values: Set<string>;
	words: Set<string>;
}

function addCandidates(into: MessageCandidates, maskedValues: string[]): void {
	for (const value of maskedValues) {
		for (const word of value.match(WORD) ?? []) {
			if (word.length >= MIN_MESSAGE_VALUE_LENGTH) into.words.add(word);
		}
		// 値は語ごとに見えていても、値そのものは伏せる(語がすべて別の場所に見えていても値は秘密)
		if (value.length >= MIN_MESSAGE_VALUE_LENGTH) into.values.add(value);
	}
}

/**
 * パックに入るファイルの伏せた表示に見えている値・語を除く(パックでも見えているため。伏せすぎで
 * 本文が読めなくならないように)
 */
function filterVisible(candidates: MessageCandidates, visibleTexts: string[]): string[] {
	const visibleWords = new Set<string>();
	for (const text of visibleTexts) for (const word of text.match(WORD) ?? []) visibleWords.add(word);
	const out = [...candidates.words].filter((w) => !visibleWords.has(w));
	for (const value of candidates.values) {
		// 見えていない語を含む値は、値そのものもまず見えていない(端の語が隣の文字と続いて別の語に見えて
		// いるときだけは違うが、伏せる側に倒れるだけ)。文字列で探すのは、語がすべて見えている値と語を
		// 含まない値だけにする(値の数 × 文面の長さの照合を減らす)
		const words = value.match(WORD) ?? [];
		if (words.some((w) => !visibleWords.has(w)) || !visibleTexts.some((t) => t.includes(value))) {
			out.push(value);
		}
	}
	return out;
}

/** VB / C# のコンパイラーが改行として数える文字(CRLF / LF で分けた後に残るもの)。XML などは CR だけ */
const CODE_LINE_BREAKS = /\r|\u0085|\u2028|\u2029/;
const XML_LINE_BREAKS = /\r/;

/**
 * 伏せた行(CRLF / LF で分けた行。伏せる処理はパックと同じ区切りの文字列にかける)を、コンパイラーが
 * 数える行に分ける。伏せた範囲が改行の文字を含んで分け方が変わる行は、その行を丸ごと伏せる
 */
function compilerLines(file: string, lines: string[], shown: string[]): string[] {
	const breaks = /\.(vb|cs)$/i.test(file) ? CODE_LINE_BREAKS : XML_LINE_BREAKS;
	const out: string[] = [];
	lines.forEach((line, i) => {
		const shownLine = shown[i] ?? "";
		const parts = line.split(breaks);
		if (parts.length === 1) {
			out.push(shownLine);
			return;
		}
		const shownParts = shownLine.split(breaks);
		for (let k = 0; k < parts.length; k++) {
			const part = parts[k] ?? "";
			out.push(
				shownParts.length === parts.length
					? (shownParts[k] ?? "")
					: part.trim() === ""
						? part
						: `${/^\s*/.exec(part)?.[0] ?? ""}${MASK_TOKEN}`,
			);
		}
	});
	return out;
}

/**
 * Copilot Chat に貼る文面。エラーが 1 件も取り出せなかったときは
 * ログの末尾をそのまま載せる(MSBuild 自体が動かなかった等)
 */
export function buildErrorReport(
	errors: BuildError[],
	logTail: string,
	options: BuildErrorReportOptions,
): string {
	const maxErrors = options.maxErrors ?? DEFAULT_MAX_ERRORS;
	const context = options.contextLines ?? DEFAULT_CONTEXT_LINES;
	const mask = options.mask;
	const maskText = (text: string): string =>
		mask === undefined ? text : maskCredentials(text, { vbSource: false, strict: mask.strict }).content;
	const parts: string[] = [
		"## ビルドエラー",
		"",
		`slnmix build でビルドしたところ、エラーが ${errors.length} 件出ました。` +
			"修正を、これまでと同じ規約の changes.md で出してください。",
		"",
		"- 抜粋は今の実ファイルの内容です。パックの内容と食い違うときは、抜粋が正です",
		"- SEARCH には抜粋の「│」より右側をそのままコピーしてください(行頭の > と行番号は含めません)",
		"- 先頭のエラーが原因で後続のエラーが出ていることがあります。先頭から確かめてください",
		...(mask === undefined
			? []
			: ["- 認証情報らしき値は [MASKED] に伏せています。[MASKED] はそのまま残し、値を推測しないでください"]),
	];
	if (errors.length === 0) {
		parts.push("", "エラーの行を取り出せませんでした。ビルドのログの末尾を載せます。", "", "```", maskText(logTail.trimEnd()), "```");
		return parts.join("\n") + "\n";
	}
	// 同じファイルのエラーが続くことが多いので、伏せた行はファイルごとに 1 回だけ作る
	const maskedFiles = new Map<string, string[] | undefined>();
	// 抜粋で伏せた値。エラーの本文がその値を引用することがある(引用符を忘れた値が識別子として
	// 報告されるなど)ため、本文からも伏せる。unknown = 対応づけられないファイルがあった
	const candidates: MessageCandidates = { values: new Set(), words: new Set() };
	let unknown = false;
	const visibleTexts: string[] = [];
	const linesOf = (file: string): string[] | undefined => {
		if (!maskedFiles.has(file)) {
			const lines = options.readLines(file);
			const vbSource =
				/\.vb$/i.test(file) && options.genericTextFor !== undefined && !options.genericTextFor(file)
					? true
					: undefined;
			const maskOptions =
				mask === undefined
					? undefined
					: { path: file, strict: mask.strict, ...(vbSource !== undefined ? { vbSource } : {}) };
			const shown =
				lines === undefined || maskOptions === undefined ? lines : maskLinesForDisplay(lines, maskOptions);
			if (lines !== undefined && maskOptions !== undefined) {
				const values = maskedValuesForDisplay(lines, maskOptions);
				if (values === null) unknown = true;
				else addCandidates(candidates, values);
				// パックから除外するファイルは AI に見えていないので、見えている語に数えない
				if (shown !== undefined && options.excludedBy?.(file) === undefined) visibleTexts.push(shown.join("\n"));
			}
			maskedFiles.set(file, lines === undefined || shown === undefined ? undefined : compilerLines(file, lines, shown));
		}
		return maskedFiles.get(file);
	};
	const shown = errors.slice(0, maxErrors);
	// 本文を伏せる前に、載せるエラーのファイルをすべて読んでおく
	for (const error of shown) {
		const file = resolveErrorFile(error);
		if (file !== undefined) linesOf(file);
	}
	const messageMasks = filterVisible(candidates, visibleTexts);
	const maskMessage = (text: string): string => {
		if (mask === undefined) return text;
		if (unknown) {
			// どの値を伏せたか分からないファイルがあるときは、VB のソースとしての伏せ方も重ねる
			return maskCredentials(maskText(maskValues(text, messageMasks)), { vbSource: true, strict: mask.strict }).content;
		}
		return maskText(maskValues(text, messageMasks));
	};
	shown.forEach((error, index) => {
		const file = resolveErrorFile(error);
		const lines = file === undefined ? undefined : linesOf(file);
		const located =
			file === undefined
				? error.origin
				: `${displayPath(file, options.rootDir)}${error.line !== undefined ? `:${error.line}` : ""}`;
		// 読めるファイルのパスはそのまま。ファイルでない発生元(パスに見える接続文字列など)は伏せる
		const where = lines === undefined ? maskText(located) : located;
		parts.push("", `### ${index + 1}. ${where} — ${error.code}`, maskMessage(error.message));
		if (file === undefined || error.line === undefined) {
			return;
		}
		if (options.excludedBy?.(file) !== undefined) {
			parts.push("", "(.gitignore / .repomixignore でパックから除外しているファイルのため、抜粋は載せません)");
			return;
		}
		if (lines === undefined || error.line > lines.length) {
			parts.push("", "(ファイルを読めなかったため抜粋はありません)");
			return;
		}
		parts.push("", "```" + fenceLanguage(file), ...renderExcerpt(lines, error.line, context), "```");
	});
	if (errors.length > shown.length) {
		parts.push("", `(ほかに ${errors.length - shown.length} 件のエラーは省略しました)`);
	}
	return parts.join("\n") + "\n";
}
