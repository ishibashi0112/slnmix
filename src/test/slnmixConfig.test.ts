/**
 * slnmixConfig の単体テスト。ファイルシステムは fake を注入する。
 */

import * as assert from "assert";
import * as path from "path";
import {
	defaultIncludeFor,
	loadSlnmixConfig,
	normalizeRootRelative,
	type SlnmixConfigDeps,
} from "../slnmixConfig";

const ROOT = path.resolve("/work/repo");

function fakeDeps(files: Record<string, string>): SlnmixConfigDeps {
	const map = new Map(
		Object.entries(files).map(([p, content]) => [path.resolve(ROOT, p), content]),
	);
	return { readTextFile: (p) => map.get(path.resolve(p)) };
}

suite("slnmixConfig: 設定なし", () => {
	test("ファイルがなければ空の設定(エラーにしない)", () => {
		const result = loadSlnmixConfig(ROOT, fakeDeps({}));
		assert.deepStrictEqual(result.config, {
			extraRoots: [],
			generatedDirs: [],
			sources: [],
			contractSchema: undefined,
			contractFile: undefined,
		});
		assert.deepStrictEqual(result.diagnostics, []);
	});
});

suite("slnmixConfig: slnmix.config.json", () => {
	test("extraRoots を読み、include 省略時は kind ごとの既定を使う", () => {
		const result = loadSlnmixConfig(
			ROOT,
			fakeDeps({
				"slnmix.config.json": JSON.stringify({
					extraRoots: [
						{ path: "apps/web/", kind: "web" },
						{ path: "./contract", kind: "contract", include: ["contract.ts"], exclude: ["x/**"] },
						{ path: "docs", kind: "docs" },
					],
					contractSchema: "contract/contract.schema.json",
					generatedDirs: ["dotnet/Gen/", "apps/web/src/generated"],
				}),
			}),
		);
		assert.deepStrictEqual(result.diagnostics, []);
		assert.deepStrictEqual(result.config.sources, ["slnmix.config.json"]);
		assert.deepStrictEqual(result.config.extraRoots, [
			{ path: "apps/web", kind: "web", include: defaultIncludeFor("web"), exclude: [] },
			{ path: "contract", kind: "contract", include: ["contract.ts"], exclude: ["x/**"] },
			{ path: "docs", kind: "docs", include: ["**/*"], exclude: [] },
		]);
		assert.strictEqual(result.config.contractSchema, "contract/contract.schema.json");
		assert.deepStrictEqual(result.config.generatedDirs, [
			"dotnet/Gen",
			"apps/web/src/generated",
		]);
	});

	test("壊れた JSON は警告して設定なしとして続行する", () => {
		const result = loadSlnmixConfig(
			ROOT,
			fakeDeps({ "slnmix.config.json": "{ extraRoots: [" }),
		);
		assert.deepStrictEqual(result.config.extraRoots, []);
		assert.ok(result.diagnostics.some((d) => d.severity === "warning"));
	});

	test("不正な要素は個別に警告して飛ばす(残りは使う)", () => {
		const result = loadSlnmixConfig(
			ROOT,
			fakeDeps({
				"slnmix.config.json": JSON.stringify({
					extraRoots: [
						{ kind: "web" },
						{ path: "../outside", kind: "web" },
						{ path: "/abs", kind: "web" },
						"文字列",
						{ path: "ok", kind: "web", include: "not-array" },
					],
					generatedDirs: "not-array",
				}),
			}),
		);
		assert.deepStrictEqual(
			result.config.extraRoots.map((r) => r.path),
			["ok"],
		);
		assert.strictEqual(result.diagnostics.length, 6);
	});
});

suite("slnmixConfig: webview2-bridge.gen.json の自動検出", () => {
	const gen = JSON.stringify({
		contract: "contract/contract.ts",
		schemaOut: "contract/contract.schema.json",
		ts: { outDir: "apps/web/src/generated" },
		vb: { outDir: "dotnet/App.Contract/Generated" },
	});

	test("gen.json だけでも contractSchema / contractFile / generatedDirs が埋まる", () => {
		const result = loadSlnmixConfig(ROOT, fakeDeps({ "webview2-bridge.gen.json": gen }));
		assert.deepStrictEqual(result.config.sources, ["webview2-bridge.gen.json"]);
		assert.strictEqual(result.config.contractSchema, "contract/contract.schema.json");
		assert.strictEqual(result.config.contractFile, "contract/contract.ts");
		assert.deepStrictEqual(result.config.generatedDirs, [
			"dotnet/App.Contract/Generated",
			"apps/web/src/generated",
		]);
	});

	test("slnmix.config.json の明示指定が gen.json より優先する", () => {
		const result = loadSlnmixConfig(
			ROOT,
			fakeDeps({
				"webview2-bridge.gen.json": gen,
				"slnmix.config.json": JSON.stringify({
					contractSchema: "other/schema.json",
					generatedDirs: ["only/this"],
				}),
			}),
		);
		assert.deepStrictEqual(result.config.sources, [
			"slnmix.config.json",
			"webview2-bridge.gen.json",
		]);
		assert.strictEqual(result.config.contractSchema, "other/schema.json");
		assert.strictEqual(result.config.contractFile, "contract/contract.ts");
		assert.deepStrictEqual(result.config.generatedDirs, ["only/this"]);
	});

	test("壊れた gen.json は警告して無視する", () => {
		const result = loadSlnmixConfig(ROOT, fakeDeps({ "webview2-bridge.gen.json": "{" }));
		assert.strictEqual(result.config.contractSchema, undefined);
		assert.ok(result.diagnostics.some((d) => d.message.includes("webview2-bridge.gen.json")));
	});

	test("normalizeRootRelative: 区切りを / にし、先頭 ./ と末尾 / を落とす", () => {
		assert.strictEqual(normalizeRootRelative(".\\apps\\web\\"), "apps/web");
	});
});
