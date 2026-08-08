/**
 * 規約文(protocol.md)の解決と出力末尾への連結。
 *
 * petari(AI チャットの返答をローカルへ適用する CLI)は、AI に changes.md
 * 規約を守らせるための規約文の正本を持ち、`petari init` がプロジェクト直下へ
 * protocol.md として書き出す。slnmix はこれを出力末尾に <instruction> として
 * 連結し、AI へ渡すコンテキストに規約を含める(本家 repomix の
 * instructionFilePath 相当)。
 *
 * - 既定: 入力(.sln / .vbproj)と同じディレクトリの protocol.md を探す
 *   (.gitignore の探索や出力先の既定と同じく、ここをプロジェクトルートと
 *   みなす)。なければ規約文なしで通常の出力をする
 * - --instruction-file 指定時: そのファイルを使う(読めなければエラー)
 * - 規約文は slnmix に同梱しない(petari 側の更新へ再ビルドなしで追従する)
 *
 * ファイルシステムは deps 注入とし、単体テスト可能に保つ(CLI 固有機能の
 * ため共有コアには含めない)。
 */

import * as path from "path";

export interface InstructionFileDeps {
	/** ファイルを読み UTF-8 文字列で返す(存在しない・読めないときは undefined) */
	readTextFile(absolutePath: string): string | undefined;
}

export type InstructionResolution =
	| { kind: "found"; path: string; content: string }
	| { kind: "none"; searchedPath: string }
	| { kind: "error"; message: string };

export const DEFAULT_INSTRUCTION_FILE_NAME = "protocol.md";

/**
 * @param explicitPath --instruction-file の値(省略時 undefined)
 * @param targetPath 解決済みの入力(.sln / .vbproj)の絶対パス
 * @param cwd 実行時のカレントディレクトリ(explicitPath の解決基準)
 */
export function resolveInstructionFile(
	explicitPath: string | undefined,
	targetPath: string,
	cwd: string,
	deps: InstructionFileDeps,
): InstructionResolution {
	if (explicitPath !== undefined) {
		const absolutePath = path.resolve(cwd, explicitPath);
		const content = deps.readTextFile(absolutePath);
		if (content === undefined) {
			return {
				kind: "error",
				message: `--instruction-file のファイルを読み込めません: ${absolutePath}`,
			};
		}
		return { kind: "found", path: absolutePath, content };
	}
	const searchedPath = path.join(
		path.dirname(targetPath),
		DEFAULT_INSTRUCTION_FILE_NAME,
	);
	const content = deps.readTextFile(searchedPath);
	if (content === undefined) {
		return { kind: "none", searchedPath };
	}
	return { kind: "found", path: searchedPath, content };
}

/**
 * 出力本文の末尾に規約文を <instruction> ブロックとして連結する。
 * 規約文は一字一句そのまま(整形・エスケープなし)。本文との間には空行を
 * 挟み、閉じタグが独立行になるよう末尾の改行だけ補う。
 */
export function appendInstruction(
	content: string,
	instructionText: string,
): string {
	const body = instructionText.endsWith("\n")
		? instructionText
		: `${instructionText}\n`;
	const separator = content.endsWith("\n") ? "\n" : "\n\n";
	return `${content}${separator}<instruction>\n${body}</instruction>\n`;
}
