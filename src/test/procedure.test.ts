/**
 * 内蔵作業手順文(assets/procedure)の単体テスト。
 * 4 モードの出力は test-fixtures/procedure/<mode>.md(docs 連携なし)と
 * <mode>.docs.md(docs 連携あり)のスナップショットで固定する。
 * 文面を意図的に変えたときは PROCEDURE_VERSION を上げ、スナップショットを更新する。
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
	DOCS_SECTIONS,
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
		test(`${mode} モード(docs 連携あり)がスナップショットと一致する`, () => {
			const expected = fs.readFileSync(
				path.join(FIXTURES_ROOT, "procedure", `${mode}.docs.md`),
				"utf8",
			);
			assert.strictEqual(renderBuiltinProcedure(mode, { docs: true }), expected);
		});
	}

	test("docs 連携なしの本文は docs あり本文の先頭部分と一致し、末尾に 2 節だけ足される", () => {
		for (const mode of PROCEDURE_MODES) {
			const plain = renderBuiltinProcedure(mode);
			const withDocs = renderBuiltinProcedure(mode, { docs: true });
			assert.strictEqual(withDocs, plain + DOCS_SECTIONS);
			assert.ok(!plain.includes("## 文書(docs/)の扱い"));
			assert.ok(withDocs.includes("## 文書(docs/)の扱い"));
			assert.ok(withDocs.includes("## チャットの継続と引継ぎ"));
		}
	});
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

	test("テンプレートには {{MODE}} / {{MODE_SECTIONS}} / {{DOCS_SECTIONS}} が 1 回ずつある", () => {
		assert.strictEqual(PROCEDURE_TEMPLATE.split("{{MODE}}").length, 2);
		assert.strictEqual(PROCEDURE_TEMPLATE.split("{{MODE_SECTIONS}}").length, 2);
		assert.strictEqual(PROCEDURE_TEMPLATE.split("{{DOCS_SECTIONS}}").length, 2);
	});

	test("docs: \"placeholder\" は {{DOCS_SECTIONS}} を残す(--print-procedure 用)", () => {
		const printed = renderBuiltinProcedure("full", { docs: "placeholder" });
		assert.ok(printed.endsWith("{{DOCS_SECTIONS}}"));
		assert.ok(!printed.includes("{{MODE"));
		assert.strictEqual(renderProcedureTemplate(printed, "full", { docs: true }), renderBuiltinProcedure("full", { docs: true }));
		assert.strictEqual(renderProcedureTemplate(printed, "full"), renderBuiltinProcedure("full"));
	});

	test("design: 調査 / 設計書 / 確認事項 / 継続判定の 4 節でコード変更を出させない", () => {
		const headings = MODE_SECTIONS.design.match(/^### .+$/gm);
		assert.deepStrictEqual(headings, [
			"### 1. 調査",
			"### 2. 設計書",
			"### 3. 確認事項",
			"### 4. 継続判定",
		]);
		assert.ok(MODE_SECTIONS.design.includes("コードの変更はこのモードでは出しません"));
		assert.ok(MODE_SECTIONS.design.includes("status=ready"));
		assert.ok(MODE_SECTIONS.design.includes("必須"));
		assert.ok(MODE_SECTIONS.design.includes("後回し"));
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
		assert.ok(isProcedureMode("design"));
		assert.ok(!isProcedureMode("Full"));
		assert.ok(!isProcedureMode(""));
	});
});
