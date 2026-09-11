/**
 * 内蔵作業手順文(assets/procedure)の単体テスト。
 * 3 モードの出力は test-fixtures/procedure/<mode>.md のスナップショットで固定する。
 * 文面を意図的に変えたときは PROCEDURE_VERSION を上げ、スナップショットを更新する。
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
	isProcedureMode,
	MODE_SECTIONS,
	PROCEDURE_MODES,
	PROCEDURE_TEMPLATE,
	PROCEDURE_VERSION,
	renderBuiltinProcedure,
	renderProcedureTemplate,
} from "../assets/procedure";

const FIXTURES_ROOT = path.resolve(__dirname, "..", "..", "test-fixtures");

suite("procedure: スナップショット", () => {
	for (const mode of PROCEDURE_MODES) {
		test(`${mode} モードの内蔵既定文がスナップショットと一致する`, () => {
			const expected = fs.readFileSync(
				path.join(FIXTURES_ROOT, "procedure", `${mode}.md`),
				"utf8",
			);
			assert.strictEqual(renderBuiltinProcedure(mode), expected);
		});
	}
});

suite("procedure: 描画", () => {
	test("プレースホルダが残らず、先頭コメントにバージョンとモードが入る", () => {
		for (const mode of PROCEDURE_MODES) {
			const rendered = renderBuiltinProcedure(mode);
			assert.ok(!rendered.includes("{{"), `${mode}: プレースホルダが残っている`);
			assert.ok(
				rendered.startsWith(
					`<!-- slnmix procedure v${PROCEDURE_VERSION} (mode: ${mode}) -->\n`,
				),
			);
			assert.ok(rendered.endsWith("\n"));
		}
	});

	test("テンプレートには {{MODE}} と {{MODE_SECTIONS}} が 1 回ずつある", () => {
		assert.strictEqual(PROCEDURE_TEMPLATE.split("{{MODE}}").length, 2);
		assert.strictEqual(PROCEDURE_TEMPLATE.split("{{MODE_SECTIONS}}").length, 2);
	});

	test("full: 調査 / 方針 / 変更 / 自己検証の 4 節", () => {
		const headings = MODE_SECTIONS.full.match(/^### .+$/gm);
		assert.deepStrictEqual(headings, [
			"### 1. 調査",
			"### 2. 方針",
			"### 3. 変更",
			"### 4. 自己検証",
		]);
	});

	test("plan: 調査 / 方針 / 質問の 3 節で changes.md を出させない", () => {
		const headings = MODE_SECTIONS.plan.match(/^### .+$/gm);
		assert.deepStrictEqual(headings, ["### 1. 調査", "### 2. 方針", "### 3. 質問"]);
		assert.ok(MODE_SECTIONS.plan.includes("changes.md を出さないでください"));
		assert.ok(!MODE_SECTIONS.plan.includes("changes.md を出してください"));
	});

	test("implement: 方針の確認 / 変更 / 自己検証の 3 節で調査を省く", () => {
		const headings = MODE_SECTIONS.implement.match(/^### .+$/gm);
		assert.deepStrictEqual(headings, [
			"### 1. 方針の確認",
			"### 2. 変更",
			"### 3. 自己検証",
		]);
		assert.ok(MODE_SECTIONS.implement.includes("<plan>"));
		assert.ok(!MODE_SECTIONS.implement.includes("### 1. 調査"));
	});

	test("full と implement の自己検証は同じ文面", () => {
		const verify = (text: string) => text.slice(text.indexOf("自己検証"));
		assert.strictEqual(
			verify(MODE_SECTIONS.full),
			verify(MODE_SECTIONS.implement),
		);
	});

	test("renderProcedureTemplate: プレースホルダのないテンプレートはそのまま", () => {
		const custom = "# 独自の手順\n\n好きに書く\n";
		assert.strictEqual(renderProcedureTemplate(custom, "plan"), custom);
	});

	test("renderProcedureTemplate: 複数回のプレースホルダもすべて置換する", () => {
		const custom = "mode={{MODE}}\n{{MODE_SECTIONS}}\nagain {{MODE}}\n";
		const rendered = renderProcedureTemplate(custom, "implement");
		assert.strictEqual(
			rendered,
			`mode=implement\n${MODE_SECTIONS.implement}\nagain implement\n`,
		);
	});

	test("isProcedureMode", () => {
		assert.ok(isProcedureMode("full"));
		assert.ok(isProcedureMode("plan"));
		assert.ok(isProcedureMode("implement"));
		assert.ok(!isProcedureMode("Full"));
		assert.ok(!isProcedureMode(""));
	});
});
