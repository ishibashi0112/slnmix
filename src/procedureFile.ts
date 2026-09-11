/**
 * 作業手順文(procedure)・タスク文・承認済み方針の解決と、出力末尾への連結。
 *
 * 出力レイアウト(末尾側):
 *   ... <skipped_files> <masked_credentials>
 *   <task>        ← --task があるとき(依頼内容)
 *   <plan>        ← --mode implement --plan のとき(承認済みの方針)
 *   <procedure>   ← 内蔵既定文 or ルート直下の procedure.md(--no-procedure で抑止)
 *   <instruction> ← protocol.md(petari の出力規約。instructionFile.ts)
 *
 * 長い文脈の後に指示を置く方が従いやすいので末尾に置き、要約処理で末尾が
 * 落ちる対策として先頭にリマインダを付ける(既存のサンドイッチ設計と同じ)。
 *
 * - procedure.md は入力(.sln / .vbproj)と同じディレクトリで探す(protocol.md
 *   と同じ扱い)。あれば内蔵既定文の代わりに一字一句そのまま使う
 *   ({{MODE}} / {{MODE_SECTIONS}} があれば置換)
 * - --task は「ファイルとして存在すれば読み、なければ文字列」。改行を含む
 *   ものは常に文字列
 * - --no-procedure かつ --task なしなら、従来(規約文のみ)と同一の出力になる
 *
 * ファイルシステムは deps 注入とし、単体テスト可能に保つ(CLI 固有機能)。
 */

import * as path from "path";
import {
	type ProcedureMode,
	renderBuiltinProcedure,
	renderProcedureTemplate,
} from "./assets/procedure";
import {
	appendBlock,
	appendInstruction,
	INSTRUCTION_NOTICE,
	type InstructionFileDeps,
	type InstructionResolution,
} from "./instructionFile";

export const DEFAULT_PROCEDURE_FILE_NAME = "procedure.md";

export type TaskResolution =
	| { kind: "none" }
	| { kind: "file"; path: string; content: string }
	| { kind: "text"; content: string };

/**
 * --task の値を解決する。引数がファイルとして存在すれば読み、存在しなければ
 * 文字列として扱う。改行を含む文字列はファイル判定をせず常に文字列。
 */
export function resolveTask(
	arg: string | undefined,
	cwd: string,
	deps: InstructionFileDeps,
): TaskResolution {
	if (arg === undefined) {
		return { kind: "none" };
	}
	if (/[\r\n]/.test(arg)) {
		return { kind: "text", content: arg };
	}
	const absolutePath = path.resolve(cwd, arg);
	const content = deps.readTextFile(absolutePath);
	if (content !== undefined) {
		return { kind: "file", path: absolutePath, content };
	}
	return { kind: "text", content: arg };
}

export type PlanResolution =
	| { kind: "none" }
	| { kind: "found"; path: string; content: string }
	| { kind: "error"; message: string };

/** --plan の値を解決する(必ずファイル。読めなければエラー) */
export function resolvePlan(
	arg: string | undefined,
	cwd: string,
	deps: InstructionFileDeps,
): PlanResolution {
	if (arg === undefined) {
		return { kind: "none" };
	}
	const absolutePath = path.resolve(cwd, arg);
	const content = deps.readTextFile(absolutePath);
	if (content === undefined) {
		return {
			kind: "error",
			message: `--plan のファイルを読み込めません: ${absolutePath}`,
		};
	}
	return { kind: "found", path: absolutePath, content };
}

export type ProcedureResolution =
	| { kind: "none" }
	| { kind: "builtin"; mode: ProcedureMode; content: string }
	| { kind: "file"; path: string; mode: ProcedureMode; content: string }
	| { kind: "error"; message: string };

export interface ProcedureOptions {
	/** --procedure-file の値(省略時 undefined) */
	explicitPath?: string;
	/** --no-procedure */
	disabled: boolean;
	mode: ProcedureMode;
}

/**
 * @param targetPath 解決済みの入力(.sln / .vbproj)の絶対パス
 * @param cwd 実行時のカレントディレクトリ(explicitPath の解決基準)
 */
export function resolveProcedure(
	options: ProcedureOptions,
	targetPath: string,
	cwd: string,
	deps: InstructionFileDeps,
): ProcedureResolution {
	if (options.disabled) {
		return { kind: "none" };
	}
	const { mode } = options;
	if (options.explicitPath !== undefined) {
		const absolutePath = path.resolve(cwd, options.explicitPath);
		const template = deps.readTextFile(absolutePath);
		if (template === undefined) {
			return {
				kind: "error",
				message: `--procedure-file のファイルを読み込めません: ${absolutePath}`,
			};
		}
		return {
			kind: "file",
			path: absolutePath,
			mode,
			content: renderProcedureTemplate(template, mode),
		};
	}
	const searchedPath = path.join(
		path.dirname(targetPath),
		DEFAULT_PROCEDURE_FILE_NAME,
	);
	const template = deps.readTextFile(searchedPath);
	if (template !== undefined) {
		return {
			kind: "file",
			path: searchedPath,
			mode,
			content: renderProcedureTemplate(template, mode),
		};
	}
	return { kind: "builtin", mode, content: renderBuiltinProcedure(mode) };
}

/** 出力末尾に付ける各ブロックの解決結果 */
export interface OutputTail {
	task: TaskResolution;
	plan: PlanResolution;
	procedure: ProcedureResolution;
	instruction: InstructionResolution;
}

function hasProcedure(tail: OutputTail): boolean {
	return tail.procedure.kind === "builtin" || tail.procedure.kind === "file";
}

/** タスク文の先頭行(空行を飛ばす)。リマインダに載せる 1 行要約 */
export function taskFirstLine(content: string): string {
	const line = content
		.split(/\r?\n/)
		.map((l) => l.trim())
		.find((l) => l !== "");
	return line ?? "(空)";
}

/**
 * 出力先頭に付けるリマインダ文を組み立てる。末尾に何もなければ undefined。
 *
 * <task> / <plan> / <procedure> のいずれもなく規約文だけのときは、従来の
 * INSTRUCTION_NOTICE をそのまま使う(--no-procedure で従来出力と一致させる)。
 */
export function buildNotice(tail: OutputTail): string | undefined {
	const hasTask = tail.task.kind !== "none";
	const hasPlan = tail.plan.kind === "found";
	const hasProc = hasProcedure(tail);
	const hasInstruction = tail.instruction.kind === "found";

	if (!hasTask && !hasPlan && !hasProc) {
		return hasInstruction ? INSTRUCTION_NOTICE : undefined;
	}

	const blocks: string[] = [];
	if (hasTask) {
		blocks.push("<task>(依頼内容)");
	}
	if (hasPlan) {
		blocks.push("<plan>(承認済みの方針)");
	}
	if (hasProc) {
		blocks.push("<procedure>(作業手順)");
	}
	if (hasInstruction) {
		blocks.push("<instruction>(出力規約)");
	}

	const lines = [
		"[このファイルを添付したユーザー本人からの恒常的な指示]",
		`このパックの末尾に ${blocks.join("、")} があります。`,
		"回答の前に必ず末尾まで読んでください。",
	];
	if (hasProc) {
		lines.push(
			hasInstruction
				? "コードの変更を提案するときは、チャット本文で個別に言及されていなくても、必ず <procedure> の手順で回答を構成し、<instruction> の規約に従って changes.md を出力してください。"
				: "コードの変更を提案するときは、チャット本文で個別に言及されていなくても、必ず <procedure> の手順で回答を構成してください。",
		);
	} else if (hasInstruction) {
		lines.push(
			"コードの変更を提案するときは、チャット本文で個別に言及されていなくても、必ず <instruction> の規約に従って changes.md を出力してください。",
		);
	}
	if (tail.task.kind !== "none") {
		lines.push(`タスク: ${taskFirstLine(tail.task.content)}`);
	}
	if (tail.procedure.kind === "builtin" || tail.procedure.kind === "file") {
		lines.push(`モード: ${tail.procedure.mode}`);
	}
	return `${lines.join("\n")}\n`;
}

/**
 * 本文の末尾に <task> / <plan> / <procedure> / <instruction> をこの順で連結し、
 * 先頭にリマインダを付ける。末尾に何もなければ本文をそのまま返す。
 */
export function assembleOutput(body: string, tail: OutputTail): string {
	let content = body;
	if (tail.task.kind !== "none") {
		content = appendBlock(content, "task", tail.task.content);
	}
	if (tail.plan.kind === "found") {
		content = appendBlock(content, "plan", tail.plan.content);
	}
	if (tail.procedure.kind === "builtin" || tail.procedure.kind === "file") {
		content = appendBlock(content, "procedure", tail.procedure.content);
	}
	if (tail.instruction.kind === "found") {
		content = appendInstruction(content, tail.instruction.content);
	}
	const notice = buildNotice(tail);
	return notice === undefined ? content : `${notice}\n${content}`;
}
