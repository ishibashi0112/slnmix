/**
 * globMatcher の単体テスト(MSBuild ワイルドカードの最小限の解釈)。
 */

import * as assert from "assert";
import { globMatches, normalizeGlobPath } from "../globMatcher";

suite("globMatcher", () => {
	test("**/*.vb は任意の深さの .vb に一致し、他の拡張子には一致しない", () => {
		assert.ok(globMatches("**/*.vb", "Program.vb"));
		assert.ok(globMatches("**/*.vb", "Forms/MainForm.Designer.vb"));
		assert.ok(globMatches("**/*.vb", "a/b/c/d.vb"));
		assert.ok(!globMatches("**/*.vb", "Program.vbproj"));
		assert.ok(!globMatches("**/*.vb", "readme.md"));
	});

	test("bin/** は bin 直下と配下に一致し、bin 以外には一致しない", () => {
		assert.ok(globMatches("bin/**", "bin/Debug/x.vb"));
		assert.ok(globMatches("bin/**", "bin/x.vb"));
		assert.ok(!globMatches("bin/**", "src/bin/x.vb"));
		assert.ok(!globMatches("bin/**", "binary/x.vb"));
	});

	test("**/.*/** はドットで始まるフォルダ配下に一致する", () => {
		assert.ok(globMatches("**/.*/**", ".vs/x.vb"));
		assert.ok(globMatches("**/.*/**", "a/.git/b/x.vb"));
		assert.ok(!globMatches("**/.*/**", "a/b/x.vb"));
		assert.ok(!globMatches("**/.*/**", "a/.hidden.vb"));
	});

	test("* はセグメント内、? は 1 文字。`\\` と `/` は同一視、大文字小文字は区別しない", () => {
		assert.ok(globMatches("Forms\\*.vb", "forms/MainForm.vb"));
		assert.ok(!globMatches("Forms/*.vb", "Forms/Sub/MainForm.vb"));
		assert.ok(globMatches("Form?.vb", "Form1.vb"));
		assert.ok(!globMatches("Form?.vb", "Form10.vb"));
		assert.ok(globMatches("Excluded\\**", "Excluded\\Old.vb"));
	});

	test("正規表現のメタ文字はリテラルとして扱う", () => {
		assert.ok(globMatches("a.b/c+d.vb", "a.b/c+d.vb"));
		assert.ok(!globMatches("a.b/c+d.vb", "axb/cd.vb"));
	});

	test("normalizeGlobPath: 区切りを / に揃え、先頭の ./ を落とす", () => {
		assert.strictEqual(normalizeGlobPath(".\\Forms\\A.vb"), "Forms/A.vb");
		assert.strictEqual(normalizeGlobPath("./a//b"), "a/b");
	});
});
