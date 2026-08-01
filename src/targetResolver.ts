/**
 * 入力(.sln / .vbproj / ディレクトリ / 省略)から対象ファイルを決める。
 *
 * - ファイル指定: 拡張子が .sln / .vbproj ならそのまま採用
 * - ディレクトリ指定・省略(カレント): 直下の *.sln を探し、1 件ならそれを
 *   採用。0 件なら *.vbproj で同じことを行う(.sln 優先)
 * - 複数見つかった場合は候補を並べてエラー(勝手に選ばない)
 *
 * ファイルシステムは deps 注入とし、単体テスト可能に保つ(CLI 固有機能の
 * ため共有コアには含めない)。
 */

import * as path from "path";

export interface TargetResolverDeps {
	isDirectory(absolutePath: string): boolean;
	isFile(absolutePath: string): boolean;
	/** ディレクトリ直下のファイル名一覧(取得できなければ undefined) */
	listFileNames(absolutePath: string): string[] | undefined;
}

export type TargetResolution =
	| { kind: "file"; path: string; autoDetected: boolean }
	| { kind: "error"; message: string };

const TARGET_EXTENSION = /\.(sln|vbproj)$/i;

/**
 * @param input CLI の位置引数(省略時 undefined)
 * @param cwd 実行時のカレントディレクトリ(省略時の探索基準)
 */
export function resolveTarget(
	input: string | undefined,
	cwd: string,
	deps: TargetResolverDeps,
): TargetResolution {
	if (input === undefined) {
		return detectInDirectory(cwd, "カレントディレクトリ", deps);
	}
	const absolutePath = path.resolve(cwd, input);
	if (deps.isDirectory(absolutePath)) {
		return detectInDirectory(absolutePath, absolutePath, deps);
	}
	if (deps.isFile(absolutePath)) {
		if (TARGET_EXTENSION.test(absolutePath)) {
			return { kind: "file", path: absolutePath, autoDetected: false };
		}
		return {
			kind: "error",
			message: `対応していない入力です(.sln / .vbproj のみ): ${absolutePath}`,
		};
	}
	return {
		kind: "error",
		message: `入力ファイルが見つかりません: ${absolutePath}`,
	};
}

function detectInDirectory(
	directory: string,
	displayName: string,
	deps: TargetResolverDeps,
): TargetResolution {
	const names = deps.listFileNames(directory);
	if (names === undefined) {
		return {
			kind: "error",
			message: `ディレクトリを読み取れません: ${directory}`,
		};
	}
	// .sln 優先、なければ .vbproj(ソリューションがあればそちらが全体を表すため)
	for (const extension of [".sln", ".vbproj"]) {
		const candidates = names
			.filter((name) => name.toLowerCase().endsWith(extension))
			.sort((a, b) => a.localeCompare(b));
		if (candidates.length === 1) {
			return {
				kind: "file",
				path: path.join(directory, candidates[0]),
				autoDetected: true,
			};
		}
		if (candidates.length > 1) {
			return {
				kind: "error",
				message: [
					`${displayName} に ${extension} が複数あります。対象を指定してください:`,
					...candidates.map((name) => `  - ${name}`),
				].join("\n"),
			};
		}
	}
	return {
		kind: "error",
		message: `${displayName} に .sln / .vbproj が見つかりません: ${directory}`,
	};
}
