/**
 * instructionFile の単体テスト。ファイルシステムは fake を注入する。
 */

import * as assert from "assert";
import * as path from "path";
import {
	appendInstruction,
	type InstructionFileDeps,
	resolveInstructionFile,
} from "../instructionFile";

const CWD = path.resolve("/work/app");
const TARGET = path.join(path.resolve("/work/project"), "App.sln");

/** files: 絶対パス → 内容。それ以外は undefined(存在しない) */
function fakeDeps(files: Record<string, string>): InstructionFileDeps {
	const map = new Map(
		Object.entries(files).map(([p, content]) => [path.resolve(p), content]),
	);
	return { readTextFile: (p) => map.get(p) };
}

suite("instructionFile: protocol.md の自動検出", () => {
	test("入力と同じディレクトリの protocol.md を読む(cwd ではない)", () => {
		const deps = fakeDeps({
			"/work/project/protocol.md": "# petari protocol\n規約本文\n",
			"/work/app/protocol.md": "こちらは読まれない\n",
		});
		const result = resolveInstructionFile(undefined, TARGET, CWD, deps);
		assert.deepStrictEqual(result, {
			kind: "found",
			path: path.join(path.resolve("/work/project"), "protocol.md"),
			content: "# petari protocol\n規約本文\n",
		});
	});

	test("protocol.md がなければ none(エラーにしない)。探索先を返す", () => {
		const result = resolveInstructionFile(undefined, TARGET, CWD, fakeDeps({}));
		assert.deepStrictEqual(result, {
			kind: "none",
			searchedPath: path.join(path.resolve("/work/project"), "protocol.md"),
		});
	});
});

suite("instructionFile: --instruction-file 指定", () => {
	test("相対パスは cwd 基準で解決し、protocol.md より優先する", () => {
		const deps = fakeDeps({
			"/work/app/docs/rules.md": "明示指定の規約\n",
			"/work/project/protocol.md": "こちらは読まれない\n",
		});
		const result = resolveInstructionFile("docs/rules.md", TARGET, CWD, deps);
		assert.deepStrictEqual(result, {
			kind: "found",
			path: path.join(CWD, "docs", "rules.md"),
			content: "明示指定の規約\n",
		});
	});

	test("明示指定のファイルが読めなければエラー(黙って規約なしにしない)", () => {
		const result = resolveInstructionFile("missing.md", TARGET, CWD, fakeDeps({}));
		assert.strictEqual(result.kind, "error");
		assert.ok(result.kind === "error" && result.message.includes("missing.md"));
	});
});

suite("instructionFile: appendInstruction", () => {
	test("本文との間に空行を挟み、<instruction> ブロックとして連結する", () => {
		const result = appendInstruction("本文\n", "規約文\n");
		assert.strictEqual(result, "本文\n\n<instruction>\n規約文\n</instruction>\n");
	});

	test("規約文は一字一句そのまま(XML エスケープ・整形をしない)", () => {
		const instruction = '# 規約\n\n<changes file="a.vb"> & "そのまま"\n';
		const result = appendInstruction("本文\n", instruction);
		assert.ok(result.includes(instruction));
	});

	test("規約文末尾に改行がなければ補い、閉じタグを独立行にする", () => {
		const result = appendInstruction("本文\n", "改行なしで終わる規約");
		assert.ok(result.endsWith("改行なしで終わる規約\n</instruction>\n"));
	});

	test("本文末尾に改行がなくても空行 1 つで連結できる", () => {
		const result = appendInstruction("本文", "規約文\n");
		assert.strictEqual(result, "本文\n\n<instruction>\n規約文\n</instruction>\n");
	});
});
