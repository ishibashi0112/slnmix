/**
 * slnmix build のエラー整形(buildErrors.ts)と MSBuild の場所の決定(msbuildRunner.ts)の単体テスト。
 */

import * as assert from "assert";
import {
	buildErrorReport,
	displayPath,
	parseMsbuildErrors,
	resolveErrorFile,
	type BuildError,
} from "../buildErrors";
import { locateMsbuild, msbuildArgs, type MsbuildLocatorDeps } from "../msbuildRunner";

suite("parseMsbuildErrors", () => {
	test("vbc のエラー(行・列・プロジェクト付き)を取り出す", () => {
		const log = [
			"C:\\src\\App\\Forms\\OrderForm.vb(42,13): error BC30451: 'txtFoo' は宣言されていません。アクセスできない保護レベルになっている可能性があります。 [C:\\src\\App\\App.vbproj]",
		].join("\r\n");
		assert.deepStrictEqual(parseMsbuildErrors(log), [
			{
				origin: "C:\\src\\App\\Forms\\OrderForm.vb",
				line: 42,
				column: 13,
				code: "BC30451",
				message: "'txtFoo' は宣言されていません。アクセスできない保護レベルになっている可能性があります。",
				project: "C:\\src\\App\\App.vbproj",
			},
		]);
	});

	test("ノード番号の接頭辞・行だけの位置・ツール名のエラーも取り出し、警告と重複は除く", () => {
		const log = [
			"  1>C:\\src\\App\\Module1.vb(7) : error BC30205: ステートメントの終わりを指定してください。 [C:\\src\\App\\App.vbproj]",
			"C:\\src\\App\\Module1.vb(9,1): warning BC42024: 使用されていないローカル変数です。 [C:\\src\\App\\App.vbproj]",
			"MSBUILD : error MSB1009: プロジェクト ファイルが存在しません。",
			"vbc : Command line error BC2006: オプション 'r' には値が必要です。",
			"  1>C:\\src\\App\\Module1.vb(7) : error BC30205: ステートメントの終わりを指定してください。 [C:\\src\\App\\App.vbproj]",
			"ビルドに失敗しました。",
		].join("\n");
		const errors = parseMsbuildErrors(log);
		assert.deepStrictEqual(
			errors.map((e) => [e.origin, e.line, e.column, e.code]),
			[
				["C:\\src\\App\\Module1.vb", 7, undefined, "BC30205"],
				["MSBUILD", undefined, undefined, "MSB1009"],
				["vbc", undefined, undefined, "BC2006"],
			],
		);
	});

	test("位置の範囲指定(行-行 / 行,列-列 / 行,列,行,列)は先頭の行と列を使う", () => {
		const log = [
			"a.vb(3-5): error BC1: x",
			"b.vb(3,4-9): error BC2: y",
			"c.vb(3,4,5,6): error BC3: z",
		].join("\n");
		assert.deepStrictEqual(
			parseMsbuildErrors(log).map((e) => [e.line, e.column]),
			[
				[3, undefined],
				[3, 4],
				[3, 4],
			],
		);
	});
});

suite("resolveErrorFile / displayPath", () => {
	test("Windows の絶対パスはそのまま、ルート配下なら / 区切りのルート相対で表示する", () => {
		const error: BuildError = { origin: "C:\\src\\App\\Forms\\A.vb", line: 1, code: "BC1", message: "" };
		const file = resolveErrorFile(error);
		assert.strictEqual(file, "C:\\src\\App\\Forms\\A.vb");
		assert.strictEqual(displayPath(file ?? "", "C:\\src"), "App/Forms/A.vb");
		// ルートの外(Link の参照先など)は絶対パスのまま
		assert.strictEqual(displayPath("D:\\shared\\B.vb", "C:\\src"), "D:\\shared\\B.vb");
	});

	test("相対パスはプロジェクトの場所を基準に解決し、ツール名はファイル扱いしない", () => {
		assert.strictEqual(
			resolveErrorFile({ origin: "Forms\\A.vb", code: "BC1", message: "", project: "C:\\src\\App\\App.vbproj" }),
			"C:\\src\\App\\Forms\\A.vb",
		);
		assert.strictEqual(resolveErrorFile({ origin: "MSBUILD", code: "MSB1009", message: "" }), undefined);
		assert.strictEqual(resolveErrorFile({ origin: "Forms\\A.vb", code: "BC1", message: "" }), undefined);
	});
});

suite("buildErrorReport", () => {
	const lines = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`);
	const readLines = (p: string): string[] | undefined => (p === "C:\\src\\App\\A.vb" ? lines : undefined);

	test("各エラーに今のファイルの周辺行を「│」区切りの抜粋で付ける", () => {
		const report = buildErrorReport(
			[{ origin: "C:\\src\\App\\A.vb", line: 6, column: 1, code: "BC30451", message: "'x' は宣言されていません。" }],
			"",
			{ rootDir: "C:\\src", readLines, contextLines: 2 },
		);
		assert.ok(report.includes("エラーが 1 件出ました"));
		assert.ok(report.includes("### 1. App/A.vb:6 — BC30451\n'x' は宣言されていません。"));
		assert.ok(
			report.includes(
				["```vb", "  4 │line 4", "  5 │line 5", "> 6 │line 6", "  7 │line 7", "  8 │line 8", "```"].join("\n"),
			),
			report,
		);
	});

	test("読めないファイル・ツールのエラーは抜粋なし、上限を超えた分は件数だけ書く", () => {
		const errors: BuildError[] = [
			{ origin: "C:\\src\\App\\Missing.vb", line: 3, code: "BC1", message: "m1" },
			{ origin: "MSBUILD", code: "MSB4025", message: "m2" },
			{ origin: "C:\\src\\App\\A.vb", line: 1, code: "BC3", message: "m3" },
		];
		const report = buildErrorReport(errors, "", { rootDir: "C:\\src", readLines, maxErrors: 2 });
		assert.ok(report.includes("### 1. App/Missing.vb:3 — BC1\nm1\n\n(ファイルを読めなかったため抜粋はありません)"));
		assert.ok(report.includes("### 2. MSBUILD — MSB4025\nm2"));
		assert.ok(!report.includes("m3"));
		assert.ok(report.includes("(ほかに 1 件のエラーは省略しました)"));
	});

	test("エラーを取り出せなかったときはログの末尾を載せる", () => {
		const report = buildErrorReport([], "何かが失敗した\n", { rootDir: "C:\\src", readLines });
		assert.ok(report.includes("エラーの行を取り出せませんでした"));
		assert.ok(report.includes("```\n何かが失敗した\n```"));
	});

	test("mask 指定時は抜粋・本文・ログの末尾の認証情報を伏せる(行番号は変えない)", () => {
		const db = [
			"Module Db",
			"    Sub Connect()",
			'        Dim pwd As String = "Hunter2Secret"',
			'        Dim conn = "Server=db1;Password=p@ss;"',
			"        Opn(pwd)",
			"    End Sub",
			"End Module",
		];
		const read = (p: string): string[] | undefined => (p === "C:\\src\\Db.vb" ? db : undefined);
		const report = buildErrorReport(
			[{ origin: "C:\\src\\Db.vb", line: 5, code: "BC30451", message: "'Opn' は宣言されていません。Password=p@ss" }],
			"",
			{ rootDir: "C:\\src", readLines: read, contextLines: 2, mask: { strict: true } },
		);
		assert.ok(!report.includes("Hunter2Secret"), report);
		assert.ok(!report.includes("p@ss"), report);
		assert.ok(report.includes('  3 │        Dim pwd As String = "[MASKED]"'), report);
		assert.ok(report.includes(">5 │        Opn(pwd)") || report.includes("> 5 │        Opn(pwd)"), report);
		assert.ok(report.includes("[MASKED] はそのまま残し"));

		const tail = buildErrorReport([], "Password=p@ss の接続に失敗\n", {
			rootDir: "C:\\src",
			readLines: read,
			mask: { strict: true },
		});
		assert.ok(!tail.includes("p@ss"), tail);
	});

	test("ファイル名のないエラーの発生元も伏せる", () => {
		const report = buildErrorReport(
			[{ origin: "Data Source=db1;User ID=sa;Password=Hunter2", code: "DB0001", message: "接続に失敗しました" }],
			"",
			{ rootDir: "C:\\src", readLines, mask: { strict: true } },
		);
		assert.ok(!report.includes("Hunter2"), report);
	});

	test("パスに見える発生元でも、ファイルとして読めなければ伏せる", () => {
		const report = buildErrorReport(
			[
				{
					origin: "Data Source=.\\SQLEXPRESS;User ID=sa;Password=Hunter2",
					code: "DB0001",
					message: "x",
					project: "C:\\src\\App.vbproj",
				},
			],
			"",
			{ rootDir: "C:\\src", readLines: () => undefined, mask: { strict: true } },
		);
		assert.ok(!report.includes("Hunter2"), report);
	});

	test(".gitignore でパックから除外しているファイルの抜粋は載せない", () => {
		const secret = ['    Public Const DB_PW As String = "Hunter2Pw"', "    Opn()"];
		const report = buildErrorReport(
			[{ origin: "C:\\src\\DbConfig.vb", line: 2, code: "BC30451", message: "'Opn' は宣言されていません。" }],
			"",
			{
				rootDir: "C:\\src",
				readLines: () => secret,
				mask: { strict: true },
				excludedBy: (p) => (p.endsWith("DbConfig.vb") ? "C:\\src\\.gitignore" : undefined),
			},
		);
		assert.ok(!report.includes("Hunter2Pw"), report);
		assert.ok(report.includes("パックから除外しているファイルのため"), report);
	});

	test("同じファイルのエラーが続いても、ファイルは 1 回だけ読んで伏せる", () => {
		let reads = 0;
		const report = buildErrorReport(
			[1, 2, 3].map((line) => ({ origin: "C:\\src\\A.vb", line, code: "BC1", message: "x" })),
			"",
			{
				rootDir: "C:\\src",
				readLines: () => {
					reads += 1;
					return ["a", "b", "c"];
				},
				mask: { strict: true },
			},
		);
		assert.strictEqual(reads, 1);
		assert.ok(report.includes("### 3."));
	});

	test("mask 省略時(--no-mask)は伏せない", () => {
		const report = buildErrorReport(
			[{ origin: "C:\\src\\App\\A.vb", line: 6, code: "BC1", message: "Password=p@ss" }],
			"",
			{ rootDir: "C:\\src", readLines },
		);
		assert.ok(report.includes("Password=p@ss"));
		assert.ok(!report.includes("[MASKED] はそのまま残し"));
	});
});

suite("locateMsbuild", () => {
	function deps(files: string[], vswhereOutput?: string, platform: NodeJS.Platform = "win32"): MsbuildLocatorDeps {
		return {
			platform,
			env: { "ProgramFiles(x86)": "C:\\Program Files (x86)", WINDIR: "C:\\Windows" },
			isFile: (p) => files.includes(p),
			runVswhere: () => vswhereOutput,
		};
	}
	const VSWHERE = "C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe";
	const VS2022 = "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\MSBuild\\Current\\Bin\\MSBuild.exe";
	const MSBUILD12 = "C:\\Program Files (x86)\\MSBuild\\12.0\\Bin\\MSBuild.exe";
	const FRAMEWORK64 = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\MSBuild.exe";

	test("--msbuild の指定を最優先する(Windows 以外でも使える)", () => {
		assert.deepStrictEqual(locateMsbuild("/usr/bin/msbuild", deps([], undefined, "darwin")), {
			kind: "found",
			path: "/usr/bin/msbuild",
			source: "--msbuild",
		});
	});

	test("vswhere が返した実在する MSBuild を使う", () => {
		const found = locateMsbuild(undefined, deps([VSWHERE, VS2022, MSBUILD12], `${VS2022}\r\n`));
		assert.deepStrictEqual(found, { kind: "found", path: VS2022, source: "vswhere" });
	});

	test("vswhere が無ければ VS 2013 の MSBuild、それも無ければ .NET Framework 4 の MSBuild", () => {
		assert.deepStrictEqual(locateMsbuild(undefined, deps([MSBUILD12, FRAMEWORK64])), {
			kind: "found",
			path: MSBUILD12,
			source: "MSBuild 12.0(VS 2013)",
		});
		assert.deepStrictEqual(locateMsbuild(undefined, deps([FRAMEWORK64])), {
			kind: "found",
			path: FRAMEWORK64,
			source: ".NET Framework 4",
		});
	});

	test("見つからなければ確かめた場所と --msbuild を案内する。Windows 以外は自動検出しない", () => {
		const missing = locateMsbuild(undefined, deps([VSWHERE], ""));
		assert.strictEqual(missing.kind, "error");
		assert.ok(missing.kind === "error" && missing.message.includes(MSBUILD12) && missing.message.includes("--msbuild"));
		const mac = locateMsbuild(undefined, deps([], undefined, "darwin"));
		assert.ok(mac.kind === "error" && mac.message.includes("--msbuild"));
	});
});

suite("msbuildArgs", () => {
	test("エラーだけを UTF-8 のログへ書かせ、構成は指定したときだけ渡す", () => {
		assert.deepStrictEqual(msbuildArgs("C:\\src\\App.sln", { logFile: "C:\\tmp\\errors.log" }), [
			"C:\\src\\App.sln",
			"/nologo",
			"/m",
			"/v:minimal",
			"/fl",
			"/flp:LogFile=C:\\tmp\\errors.log;ErrorsOnly;Encoding=UTF-8",
		]);
		assert.ok(
			msbuildArgs("App.sln", { logFile: "e.log", configuration: "Release" }).includes("/p:Configuration=Release"),
		);
	});
});
