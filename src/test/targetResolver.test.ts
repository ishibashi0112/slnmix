/**
 * targetResolver の単体テスト。ファイルシステムは fake を注入する。
 */

import * as assert from "assert";
import * as path from "path";
import {
	resolveTarget,
	type TargetResolverDeps,
} from "../targetResolver";

const CWD = path.resolve("/work/app");

/** files: 存在するファイルの絶対パス → true。dirs: ディレクトリと直下ファイル名 */
function fakeDeps(dirs: Record<string, string[]>): TargetResolverDeps {
	const allFiles = new Set(
		Object.entries(dirs).flatMap(([dir, names]) =>
			names.map((name) => path.join(path.resolve(dir), name)),
		),
	);
	return {
		isDirectory: (p) => Object.keys(dirs).some((d) => path.resolve(d) === p),
		isFile: (p) => allFiles.has(p),
		listFileNames: (p) => {
			const entry = Object.entries(dirs).find(([d]) => path.resolve(d) === p);
			return entry?.[1];
		},
	};
}

suite("targetResolver: ファイル指定", () => {
	const deps = fakeDeps({ "/work/app": ["App.sln", "readme.txt"] });

	test(".sln の明示指定はそのまま採用(autoDetected = false)", () => {
		const result = resolveTarget("App.sln", CWD, deps);
		assert.deepStrictEqual(result, {
			kind: "file",
			path: path.join(CWD, "App.sln"),
			autoDetected: false,
		});
	});

	test("対象外の拡張子はエラー", () => {
		const result = resolveTarget("readme.txt", CWD, deps);
		assert.strictEqual(result.kind, "error");
		assert.ok(result.kind === "error" && result.message.includes("対応していない"));
	});

	test("存在しないパスはエラー", () => {
		const result = resolveTarget("Missing.sln", CWD, deps);
		assert.strictEqual(result.kind, "error");
		assert.ok(result.kind === "error" && result.message.includes("見つかりません"));
	});
});

suite("targetResolver: 自動検出", () => {
	test("引数なし: カレントの .sln が 1 件なら採用", () => {
		const deps = fakeDeps({ "/work/app": ["NBOM040.sln", "NBOM040.suo", "一覧.xlsx"] });
		const result = resolveTarget(undefined, CWD, deps);
		assert.deepStrictEqual(result, {
			kind: "file",
			path: path.join(CWD, "NBOM040.sln"),
			autoDetected: true,
		});
	});

	test("大文字拡張子(.SLN)も検出する", () => {
		const deps = fakeDeps({ "/work/app": ["LEGACY.SLN"] });
		const result = resolveTarget(undefined, CWD, deps);
		assert.ok(result.kind === "file" && result.path.endsWith("LEGACY.SLN"));
	});

	test(".sln がなければ .vbproj にフォールバック", () => {
		const deps = fakeDeps({ "/work/app": ["App.vbproj", "Module1.vb"] });
		const result = resolveTarget(undefined, CWD, deps);
		assert.ok(result.kind === "file" && result.path.endsWith("App.vbproj"));
	});

	test(".sln が複数なら候補一覧付きのエラー(勝手に選ばない)", () => {
		const deps = fakeDeps({ "/work/app": ["A.sln", "B.sln", "C.vbproj"] });
		const result = resolveTarget(undefined, CWD, deps);
		assert.strictEqual(result.kind, "error");
		assert.ok(result.kind === "error" && result.message.includes("- A.sln"));
		assert.ok(result.kind === "error" && result.message.includes("- B.sln"));
	});

	test(".sln が複数でも .vbproj へはフォールバックしない", () => {
		const deps = fakeDeps({ "/work/app": ["A.sln", "B.sln", "Only.vbproj"] });
		const result = resolveTarget(undefined, CWD, deps);
		assert.strictEqual(result.kind, "error");
	});

	test("どちらもなければエラー", () => {
		const deps = fakeDeps({ "/work/app": ["readme.txt"] });
		const result = resolveTarget(undefined, CWD, deps);
		assert.strictEqual(result.kind, "error");
		assert.ok(result.kind === "error" && result.message.includes("見つかりません"));
	});

	test("ディレクトリ指定: その直下を探索する", () => {
		const deps = fakeDeps({
			"/work/app": ["App.sln"],
			"/work/other": ["Other.sln"],
		});
		const result = resolveTarget(path.resolve("/work/other"), CWD, deps);
		assert.ok(result.kind === "file" && result.path.endsWith("Other.sln"));
		assert.ok(result.kind === "file" && result.autoDetected);
	});

	test("読み取れないディレクトリはエラー", () => {
		const deps: TargetResolverDeps = {
			isDirectory: () => true,
			isFile: () => false,
			listFileNames: () => undefined,
		};
		const result = resolveTarget(undefined, CWD, deps);
		assert.strictEqual(result.kind, "error");
		assert.ok(result.kind === "error" && result.message.includes("読み取れません"));
	});
});

suite("targetResolver: slnmix.config.json の target", () => {
	const dirs = { "/work/app": ["slnmix.config.json", "package.json"], "/work/app/dotnet": ["App.sln"] };
	const withTarget = (target: string | undefined): TargetResolverDeps => ({
		...fakeDeps(dirs),
		readConfigTarget: (dir) => (dir === CWD ? target : undefined),
	});

	test("引数なし: 設定の target を使う(autoDetected、source: config)", () => {
		const result = resolveTarget(undefined, CWD, withTarget("dotnet/App.sln"));
		assert.deepStrictEqual(result, {
			kind: "file",
			path: path.join(CWD, "dotnet", "App.sln"),
			autoDetected: true,
			source: "config",
		});
	});

	test("ディレクトリ指定でも設定の target を使う", () => {
		const result = resolveTarget(".", CWD, withTarget("dotnet/App.sln"));
		assert.ok(result.kind === "file" && result.source === "config");
	});

	test("target のファイルが無ければエラー", () => {
		const result = resolveTarget(undefined, CWD, withTarget("dotnet/Missing.sln"));
		assert.ok(result.kind === "error" && result.message.includes("target が見つかりません"));
	});

	test("target が .sln / .vbproj でなければエラー", () => {
		const deps: TargetResolverDeps = {
			...fakeDeps({ "/work/app": ["slnmix.config.json", "package.json"] }),
			readConfigTarget: () => "package.json",
		};
		const result = resolveTarget(undefined, CWD, deps);
		assert.ok(result.kind === "error" && result.message.includes(".sln / .vbproj を指定"));
	});

	test("設定に target が無ければ従来どおり直下を探す", () => {
		const result = resolveTarget(undefined, CWD, withTarget(undefined));
		assert.ok(result.kind === "error" && result.message.includes("見つかりません"));
	});
});
