#!/usr/bin/env node
/**
 * slnmix CLI 入口。
 *
 * .sln / .vbproj を入力に、repomix 互換フォーマットの 1 ファイルを出力する。
 * ディレクトリ走査ではなくソリューションの論理構成(Link・DependentUpon
 * 解決済み)に基づくため、プロジェクト外・別ドライブの Link ファイルも拾い、
 * ビルド対象外のファイルは含めない。
 *
 * 解析・出力ロジックは src/ 直下と services/ のコアモジュールが担い、この入口は
 * ファイル I/O と引数処理のみを担当する。
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parseArgs } from "util";
import {
	DEFAULT_PROCEDURE_MODE,
	isProcedureMode,
	PROCEDURE_MODES,
	PROCEDURE_VERSION,
	renderBuiltinProcedure,
} from "./assets/procedure";
import { describeAutoTests, detectAutoTests } from "./autoTests";
import { buildErrorReport, parseMsbuildErrors } from "./buildErrors";
import { writeClipboard } from "./clipboard";
import { buildDesignerFileMatcher } from "./designerFileFilter";
import { describeDbSchema, resolveDbSchema } from "./dbChecks";
import { decideMode, describeDocs, resolveDocs, type DocsResolution } from "./docs";
import { initDocs } from "./initDocs";
import { initConfig } from "./initConfig";
import { planHandoff } from "./handoff";
import { initProject, type PetariInitOutcome } from "./initProject";
import { locateMsbuild, runMsbuild, runVswhere } from "./msbuildRunner";
import { resolveInstructionFile } from "./instructionFile";
import {
	assembleOutput,
	buildPromptText,
	type DocsTail,
	resolvePlan,
	resolveProcedure,
	resolveTask,
	type TaskResolution,
} from "./procedureFile";
import { maskCredentials } from "./services/credentialMasker";
import { GitignoreEvaluator } from "./services/gitignoreService";
import { CONFIG_FILE_NAME, loadSlnmixConfig } from "./slnmixConfig";
import {
	buildRepomixOutput,
	decodeSourceBuffer,
	type RepomixSource,
} from "./services/repomixExporter";
import { parseSln } from "./slnParser";
import { resolveTarget } from "./targetResolver";
import { describeRootReason, resolveRoot } from "./rootResolver";
import type { ParseDiagnostic } from "./types";
import { parseVbproj } from "./vbprojParser";

const USAGE = `slnmix — .sln / .vbproj の論理構成に基づく repomix 互換エクスポート

使い方:
  slnmix init [<ディレクトリ>]   初回セットアップ(一回だけ。リポジトリ直下で実行)
  slnmix [<solution.sln | project.vbproj | ディレクトリ>] [オプション]
  slnmix build [<solution.sln | project.vbproj | ディレクトリ>] [ビルドのオプション]

  slnmix build は対象(入力の決め方はパックと同じ)を MSBuild でビルドし、
  失敗したらエラーと今のファイルの周辺行を Copilot Chat に貼れる形で
  クリップボードに入れます(--no-clip なら標準出力へ)。成功なら何も入れません。
  MSBuild は vswhere(VS 2017 以降)> VS 2015 / 2013 > .NET Framework 4 の順に探します。
  build という名前のフォルダを入力にするときは ./build と書いてください。

  slnmix init は構成の判定(.sln / .vbproj、1 段下の .sln、VB.NET 以外の generic)、
  docs/ 連携、.gitignore への生成物の追記、petari init(protocol.md と .petari/)を
  まとめて行います。既存のファイルは変えないので何度実行しても同じです
  (protocol.md だけは最新の規約文に更新します)。init という名前のフォルダを
  入力にするときは ./init と書いてください。

  入力を省略するとカレントディレクトリ(ディレクトリ指定ならその直下)の
  *.sln を自動検出します(なければ *.vbproj。複数ある場合は候補を表示)。
  その場所の slnmix.config.json に "target": "dotnet/App.sln" があればそれを使います。
  同じ設定が "kind": "generic" なら .sln / .vbproj を探さず、extraRoots に宣言した
  ディレクトリだけでパックします(VB.NET 以外のプロジェクト。init で作成)。

  ルート(<file path> の基準。設定ファイル・protocol.md・docs/・出力先もここ)は
  --root > 入力のディレクトリから上に向かって最初に見つかる slnmix.config.json の
  場所(.git のあるディレクトリより上には行かない)> 入力と同じ場所、の順です。
  web と dotnet を分けた構成では、アプリのルートに slnmix.config.json を置けば
  .sln が dotnet/ にあってもアプリのルート基準になります。

オプション:
  -o, --output <file>   出力先(既定: ルートの repomix-output.xml)
      --root <dir>      ルートを明示する(入力はその配下にあること)
      --stdout          ファイルではなく標準出力へ書く(BOM なし)
      --include-designer  Designer 関連ファイル(*.Designer.vb 等)を原文のまま含める
      --include-designer-file <名前|パターン>
                        指定した Designer 関連ファイルだけ原文のまま含める
                        (複数指定可。* をワイルドカードに使える。ファイル名
                        または論理パスに全体一致。例: FormMain.Designer.vb、
                        "Form*"。それ以外の Designer は従来どおり除外・要約)
      --no-ui-summary   Designer.vb からの UI サマリー(<ui_summary>)生成を無効化
      --no-mask         認証情報の自動マスク([MASKED] 置換)を無効化
      --no-strict-mask  高エントロピー文字列(ランダム英数字列)の機械的マスクを
                        無効化(既定は厳格モード。変数名等から判定するマスクは残る)
      --no-gitignore    .gitignore / .repomixignore による除外を無効化
      --legacy-paths    <file path> を旧形式(プロジェクト名\論理パス)にする
                        (既定はルート相対の物理パス・/ 区切り。petari がそのまま
                        使える形。旧形式は将来のバージョンで廃止予定)
      --include-generated
                        生成コード(slnmix.config.json / webview2-bridge.gen.json の
                        generatedDirs)の原文を含める(既定は除外し <contract_summary>
                        で代替)
      --instruction-file <path>
                        出力末尾に <instruction> として連結する規約文ファイルを
                        明示指定(既定: ルートの protocol.md を自動検出。
                        petari init が生成する規約文を想定)
      --task <file|text>  依頼内容を出力末尾に <task> として同梱する。ファイルが
                        存在すれば読み込み、なければ文字列として扱う
                        (docs 連携時に省略すると文書の状態に応じた既定文になる)
      --mode <full|plan|implement|design>
                        作業手順(<procedure>)のモード(既定: full。docs 連携時は
                        文書の状態から自動選択)
                          full      調査 / 方針 / 変更(changes.md)/ 自己検証
                          plan      調査 / 方針 / 質問(changes.md は出させない)
                          implement 方針の確認 / 変更 / 自己検証(--plan が必須)
                          design    調査 / 設計書 / 確認事項 / 継続判定
                                    (設計書を質疑応答で仕上げる。docs 連携が必要)
      --design <名前|file>
                        design モードで対象の設計書を指定(既存なら継続、なければ
                        docs/design/<名前>.md を新規作成)
      --init-docs       docs/ 連携だけを設定する(docs/design/、docs/spec/、
                        docs/README.md を作り slnmix.config.json に docs 設定を追記。
                        init に含まれる)
      --init-config     VB.NET 以外のプロジェクト向けの slnmix.config.json
                        (kind: "generic")だけを作る(カレント、または --root の場所。
                        実在する src / tests 等のディレクトリだけを extraRoots に
                        書く。既にあれば変えない。init に含まれる)
      --plan <file>     implement モードで承認済みの方針を <plan> として同梱する
      --procedure-file <path>
                        作業手順文を明示指定(既定: ルートの procedure.md を
                        自動検出。なければ内蔵既定文)
      --no-procedure    <procedure> を出さない(従来出力)
      --print-procedure 内蔵の作業手順文を標準出力に書いて終了(--mode 併用可。
                        カスタマイズする人は procedure.md へリダイレクトして編集。
                        {{DOCS_SECTIONS}} は残しておくと docs 連携時に、
                        {{TEST_SECTIONS}} は自動テストがあるときに置換される)
      --prompt-output <file>
                        チャット本文に貼る指示テキスト(<task> / <plan> / <procedure> /
                        <instruction>)の出力先(既定: パックと同じ場所の
                        <出力名>.prompt.md。--stdout のときは指定時のみ書く)
      --no-prompt       本文用の指示テキストを書かない
      --print-prompt    本文用の指示テキストを標準出力に書いて終了(パックは作らない)
      --no-clip         Copilot Chat に貼るものをクリップボードに入れない(既定では
                        パックが貼付上限の目安以内ならパック全体を、超えるなら
                        本文用テキストを入れる)

ビルドのオプション(slnmix build):
      --msbuild <path>  MSBuild.exe のパス(既定: 自動検出。Windows 以外では必須)
      --configuration <name>
                        /p:Configuration に渡す構成(既定: ソリューションの既定)
      --no-clip         エラーの文面をクリップボードではなく標準出力へ出す
      --no-mask         エラーの文面(抜粋・エラーの本文・ログの末尾・ファイルでない
                        発生元)の認証情報の伏せ字([MASKED])を止める
      --no-strict-mask  高エントロピー文字列の伏せ字だけを止める(パックと同じ)
      --no-gitignore    .gitignore / .repomixignore で除外したファイルの抜粋も載せる
                        (既定では、パックに入れないファイルの抜粋は載せない)
  -v, --version         バージョン表示
  -h, --help            このヘルプ

例:
  npx slnmix init                   (初回だけ。リポジトリ直下で)
  npx slnmix                        (カレントの .sln を自動検出)
  npx slnmix C:\\path\\to\\Project    (指定フォルダ内を自動検出)
  npx slnmix MyApp.sln -o for-ai.xml --include-designer
  npx slnmix Sub\\Project.vbproj --stdout | pbcopy
  npx slnmix --task task.md --mode plan            (方針だけ先に出させる)
  npx slnmix --task task.md --mode implement --plan plan.md
  npx slnmix --print-procedure > procedure.md      (手順文をカスタマイズ)
  npx slnmix init && npx slnmix                   (VB.NET でも TypeScript 等でも同じ)
  npx slnmix                                       (以後は文書の状態からモード自動)
  npx slnmix build                                 (ビルドし、失敗ならエラーをコピー)

M365 Copilot Chat への渡し方:
  実行後、貼るものがクリップボードに入っています(--no-clip で無効)。
  パックが約 120K 文字以内ならパック全体が入るので、本文に貼って送信するだけ
  (全文がコンテキストに入り、埋め込みの手順文・規約文も効く。添付は不要)。
  超えるときは本文用テキスト(<出力名>.prompt.md と同じ)が入るので、パック
  (repomix-output.xml)を添付し、本文に貼って送信する。添付ファイル内の指示は
  Copilot が「埋め込み指示」として無視するため、手順文・規約文は本文側で渡す`;

/**
 * M365 Copilot Chat の入力欄に貼れる上限の目安(文字)。超えると送信ボタンが
 * 非活性になる(2026-09-12 実測: 約 120K 文字。設計書 §15.1)
 */
const PASTE_LIMIT_CHARS = 120_000;

/** パックの出力パスから本文用テキストの既定パスを作る(拡張子を .prompt.md に) */
function defaultPromptPath(outputPath: string): string {
	const ext = path.extname(outputPath);
	const base = ext === "" ? outputPath : outputPath.slice(0, -ext.length);
	return `${base}.prompt.md`;
}

interface FsDeps {
	fileExists(absolutePath: string): boolean;
	listFileNames(absolutePath: string): string[] | undefined;
	listFilesRecursive(absoluteDir: string): string[] | undefined;
}

const FS_DEPS: FsDeps = {
	fileExists: (absolutePath) => fs.existsSync(absolutePath),
	listFileNames: (absolutePath) => {
		try {
			return fs
				.readdirSync(absolutePath, { withFileTypes: true })
				.filter((entry) => entry.isFile())
				.map((entry) => entry.name);
		} catch {
			return undefined;
		}
	},
	// SDK スタイルの既定グロブ展開用。シンボリックリンクは辿らない(循環防止)。
	// bin / obj 等の除外はパーサー側で行う(ここは列挙のみ)
	listFilesRecursive: (absoluteDir) => {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
		} catch {
			return undefined;
		}
		const results: string[] = [];
		const walk = (dir: string, dirEntries: fs.Dirent[]): void => {
			for (const entry of dirEntries) {
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					try {
						walk(full, fs.readdirSync(full, { withFileTypes: true }));
					} catch {
						// 読めないディレクトリは飛ばす(取れた分だけ出す)
					}
				} else if (entry.isFile()) {
					results.push(full);
				}
			}
		};
		walk(absoluteDir, entries);
		return results;
	},
};

function listDirectoryNames(absolutePath: string): string[] | undefined {
	try {
		return fs
			.readdirSync(absolutePath, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** ログの末尾(エラーの行を取り出せなかったときに文面へ載せる分) */
const BUILD_LOG_TAIL_LINES = 40;

/** .gitignore / .repomixignore の判定(パックと slnmix build で同じものを使う) */
function createGitignoreEvaluator(rootDir: string): GitignoreEvaluator {
	return new GitignoreEvaluator(
		{
			readTextFileIfExists: (absolutePath) => {
				try {
					return fs.readFileSync(absolutePath, "utf8");
				} catch {
					return undefined;
				}
			},
			directoryExists: (absolutePath) => {
				try {
					return fs.statSync(absolutePath).isDirectory();
				} catch {
					return false;
				}
			},
		},
		rootDir,
	);
}

/**
 * slnmix build: MSBuild でビルドし、失敗したらエラーと今のファイルの周辺行を
 * Copilot Chat に貼れる文面にしてクリップボードへ入れる(設計書 §22)
 */
function runBuild(
	targetPath: string,
	rootDir: string,
	options: {
		msbuild: string | undefined;
		configuration: string | undefined;
		clip: boolean;
		mask: { strict: boolean } | undefined;
		/** .gitignore / .repomixignore を尊重するか(--no-gitignore で false) */
		respectGitignore: boolean;
	},
): number {
	const located = locateMsbuild(options.msbuild, {
		platform: process.platform,
		env: process.env,
		isFile: isFilePath,
		runVswhere,
	});
	if (located.kind === "error") {
		console.error(located.message);
		return 1;
	}
	console.error(`MSBuild: ${located.path}(${located.source})`);

	// エラーだけを UTF-8 のログに書かせる(コンソールのコードページに左右されない)
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slnmix-build-"));
	try {
		const logFile = path.join(tempDir, "errors.log");
		const run = runMsbuild(located.path, targetPath, {
			...(options.configuration !== undefined ? { configuration: options.configuration } : {}),
			logFile,
		});
		if (run.kind === "error") {
			console.error(`MSBuild を起動できませんでした: ${run.message}`);
			return 1;
		}
		if (run.status === 0) {
			console.error("ビルドに成功しました。");
			return 0;
		}
		const log = fs.existsSync(logFile) ? decodeSourceBuffer(fs.readFileSync(logFile)) : "";
		const errors = parseMsbuildErrors(log);
		if (errors.length === 0 && log.trim() === "") {
			console.error(
				`ビルドに失敗しました(終了コード ${run.status})。エラーの行を取り出せなかったので、上の MSBuild の出力を確認してください。`,
			);
			return 1;
		}
		const report = buildErrorReport(errors, log.split(/\r?\n/).slice(-BUILD_LOG_TAIL_LINES).join("\n"), {
			rootDir,
			...(options.mask !== undefined ? { mask: options.mask } : {}),
			...(options.respectGitignore
				? {
						excludedBy: (() => {
							const gitignore = createGitignoreEvaluator(rootDir);
							return (absolutePath: string) => gitignore.ignoreReasonFor(absolutePath);
						})(),
					}
				: {}),
			readLines: (absolutePath) => {
				try {
					// CRLF / LF で分ける(伏せる処理をパックと同じ区切りの文字列にかけるため)。単独の CR などは
					// buildErrorReport がコンパイラーと同じ数え方で分ける
					const lines = decodeSourceBuffer(fs.readFileSync(absolutePath)).split(/\r?\n/);
					// 末尾の改行の後ろは行ではない
					if (lines.length > 1 && lines[lines.length - 1] === "") {
						lines.pop();
					}
					return lines;
				} catch {
					return undefined;
				}
			},
		});
		const count = errors.length === 0 ? "エラーのログ" : `エラー ${errors.length} 件と周辺のコード`;
		if (options.clip) {
			const clipped = writeClipboard(report);
			if (clipped.ok) {
				console.error(
					`ビルドに失敗しました。${count}をクリップボードにコピーしました → Copilot Chat の本文に貼って送信してください`,
				);
				return 1;
			}
			console.error(`[warning] クリップボードにコピーできませんでした(${clipped.message})。文面を標準出力に出します`);
		}
		process.stdout.write(report);
		console.error(`ビルドに失敗しました。上の文面(${count})を Copilot Chat の本文に貼って送信してください`);
		return 1;
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

/**
 * 依存として入っている petari の init を実行する(slnmix init の手順 4)。
 * petari は ESM のため import せず、同じ node で CLI を起動する(シェル非経由)。
 * 出力は受け取って手順 4 の下に字下げして出す(--yes なので入力は求めない)
 */
function runPetariInit(rootDir: string): PetariInitOutcome {
	let packageJsonPath: string;
	try {
		packageJsonPath = require.resolve("petari/package.json");
	} catch {
		return {
			ok: false,
			message: "petari が見つかりません(slnmix の依存として入るはずです。npx slnmix@latest init を試してください)",
			output: "",
		};
	}
	let bin: string | undefined;
	try {
		const parsed: unknown = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
		const binField = isRecord(parsed) ? parsed["bin"] : undefined;
		const candidate = isRecord(binField) ? binField["petari"] : binField;
		bin = typeof candidate === "string" ? candidate : undefined;
	} catch {
		bin = undefined;
	}
	if (bin === undefined) {
		return { ok: false, message: `petari の実行ファイルが分かりません: ${packageJsonPath}`, output: "" };
	}
	const result = spawnSync(
		process.execPath,
		[path.resolve(path.dirname(packageJsonPath), bin), "init", "--yes", "--no-repomix", "--root", rootDir],
		{ encoding: "utf8" },
	);
	const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
	if (result.error !== undefined) {
		return { ok: false, message: result.error.message, output };
	}
	if (result.status !== 0) {
		return {
			ok: false,
			message: `終了コード ${result.status ?? `(シグナル ${result.signal ?? "不明"})`}`,
			output,
		};
	}
	return { ok: true, output };
}

function isDirectoryPath(absolutePath: string): boolean {
	try {
		return fs.statSync(absolutePath).isDirectory();
	} catch {
		return false;
	}
}

function isFilePath(absolutePath: string): boolean {
	try {
		return fs.statSync(absolutePath).isFile();
	} catch {
		return false;
	}
}

/** ソース/プロジェクトファイルを文字コード自動判定(BOM / UTF-8 / CP932)で読む */
function readSourceTextFile(absolutePath: string): string | undefined {
	try {
		return decodeSourceBuffer(fs.readFileSync(absolutePath));
	} catch {
		return undefined;
	}
}

function readPackageVersion(): string {
	try {
		const raw = fs.readFileSync(
			path.join(__dirname, "..", "package.json"),
			"utf8",
		);
		const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"version" in parsed &&
			typeof (parsed as { version: unknown }).version === "string"
		) {
			return (parsed as { version: string }).version;
		}
	} catch {
		// 下の既定値へ
	}
	return "unknown";
}

function printDiagnostics(label: string, diagnostics: ParseDiagnostic[]): void {
	for (const diagnostic of diagnostics) {
		if (diagnostic.severity === "info") {
			continue; // CLI では警告以上のみ表示(出力本文の skipped_files に詳細が載る)
		}
		console.error(`[${diagnostic.severity}] ${label}: ${diagnostic.message}`);
	}
}

/** 入力(.sln / .vbproj)から RepomixSource[] を組み立てる */
function collectSources(targetPath: string): RepomixSource[] {
	const content = readSourceTextFile(targetPath);
	if (content === undefined) {
		throw new Error(`ファイルを読み込めません: ${targetPath}`);
	}

	if (/\.sln$/i.test(targetPath)) {
		const slnResult = parseSln(content, targetPath, FS_DEPS);
		printDiagnostics(path.basename(targetPath), slnResult.diagnostics);
		const sources: RepomixSource[] = [];
		for (const project of slnResult.projects) {
			if (!project.exists) {
				console.error(
					`[warning] プロジェクトが見つかりません(スキップ): ${project.absolutePath}`,
				);
				continue;
			}
			const xml = readSourceTextFile(project.absolutePath);
			if (xml === undefined) {
				console.error(
					`[error] プロジェクトを読み込めません(スキップ): ${project.absolutePath}`,
				);
				continue;
			}
			const parseResult = parseVbproj(xml, project.absolutePath, FS_DEPS);
			printDiagnostics(project.name, parseResult.diagnostics);
			sources.push({ label: project.name, parseResult });
		}
		return sources;
	}

	const parseResult = parseVbproj(content, targetPath, FS_DEPS);
	const label = path.basename(targetPath).replace(/\.vbproj$/i, "");
	printDiagnostics(label, parseResult.diagnostics);
	return [{ label, parseResult }];
}

function main(): number {
	const { values, positionals } = parseArgs({
		options: {
			output: { type: "string", short: "o" },
			stdout: { type: "boolean", default: false },
			"include-designer": { type: "boolean", default: false },
			"include-designer-file": { type: "string", multiple: true },
			"no-ui-summary": { type: "boolean", default: false },
			"no-mask": { type: "boolean", default: false },
			"no-strict-mask": { type: "boolean", default: false },
			"no-gitignore": { type: "boolean", default: false },
			"legacy-paths": { type: "boolean", default: false },
			root: { type: "string" },
			"include-generated": { type: "boolean", default: false },
			"instruction-file": { type: "string" },
			task: { type: "string" },
			mode: { type: "string" },
			design: { type: "string" },
			"init-docs": { type: "boolean", default: false },
			"init-config": { type: "boolean", default: false },
			plan: { type: "string" },
			"procedure-file": { type: "string" },
			"no-procedure": { type: "boolean", default: false },
			"print-procedure": { type: "boolean", default: false },
			"prompt-output": { type: "string" },
			"no-prompt": { type: "boolean", default: false },
			"print-prompt": { type: "boolean", default: false },
			"no-clip": { type: "boolean", default: false },
			msbuild: { type: "string" },
			configuration: { type: "string" },
			version: { type: "boolean", short: "v", default: false },
			help: { type: "boolean", short: "h", default: false },
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(USAGE);
		return 0;
	}
	if (values.version) {
		console.log(readPackageVersion());
		return 0;
	}

	const explicitMode = values.mode;
	if (explicitMode !== undefined && !isProcedureMode(explicitMode)) {
		console.error(
			`--mode は ${PROCEDURE_MODES.join(" / ")} のいずれかを指定してください: ${explicitMode}`,
		);
		return 1;
	}
	if (values["print-procedure"]) {
		// カレント(または --root)の設定が kind: "generic" なら generic 向けの文面にする
		const printRoot = path.resolve(process.cwd(), values.root ?? ".");
		const printConfig = loadSlnmixConfig(printRoot, { readTextFile: readSourceTextFile });
		process.stdout.write(
			renderBuiltinProcedure(explicitMode ?? DEFAULT_PROCEDURE_MODE, {
				docs: "placeholder",
				tests: "placeholder",
				db: "placeholder",
				layout: printConfig.config.kind,
			}),
		);
		return 0;
	}
	if (explicitMode === "implement" && values.plan === undefined) {
		console.error(
			"--mode implement には --plan <file>(承認済みの方針)が必要です。先に --mode plan で方針を出し、確認したものを渡してください。",
		);
		return 1;
	}
	if (explicitMode !== "implement" && values.plan !== undefined) {
		console.error("--plan は --mode implement でのみ使えます。");
		return 1;
	}

	// 初回セットアップ(構成・docs/・.gitignore・petari を 1 コマンドで)
	if (positionals[0] === "init") {
		if (positionals.length > 2) {
			console.error("slnmix init に渡せるのはディレクトリ 1 つだけです。");
			return 1;
		}
		const initRoot = path.resolve(process.cwd(), values.root ?? positionals[1] ?? ".");
		return initProject(initRoot, {
			isDirectory: isDirectoryPath,
			isFile: isFilePath,
			exists: (p) => fs.existsSync(p),
			listFileNames: FS_DEPS.listFileNames,
			listDirectoryNames,
			readTextFile: readSourceTextFile,
			writeTextFile: (p, content) => fs.writeFileSync(p, content, "utf8"),
			appendTextFile: (p, content) => fs.appendFileSync(p, content, "utf8"),
			makeDirectory: (p) => fs.mkdirSync(p, { recursive: true }),
			runPetariInit,
			log: (line) => console.error(line),
		}).exitCode;
	}

	// VB.NET 以外のプロジェクト向けの設定ファイルを作る(入力の解決より前。.sln は無い前提)
	if (values["init-config"]) {
		const initRoot = path.resolve(process.cwd(), values.root ?? positionals[0] ?? ".");
		const result = initConfig(initRoot, {
			isDirectory: isDirectoryPath,
			isFile: isFilePath,
			listFileNames: FS_DEPS.listFileNames,
			writeTextFile: (p, content) => fs.writeFileSync(p, content, "utf8"),
		});
		if (result.kind === "error") {
			console.error(result.message);
			return 1;
		}
		if (result.kind === "kept") {
			console.error(`既存: ${result.path}(変更なし)`);
			return 0;
		}
		console.error(`作成: ${result.path}`);
		for (const root of result.roots) {
			console.error(`  extraRoots: ${root.path}/(kind: "${root.kind}")`);
		}
		console.error(
			"以後は同じ場所で npx slnmix を実行すると、extraRoots のディレクトリだけでパックと本文用テキストを作ります。対象を増やすときは extraRoots に path を追記してください。",
		);
		return 0;
	}

	// slnmix build [入力]: 入力の決め方とルートはパックと同じ
	const building = positionals[0] === "build";
	const inputArg = building ? positionals[1] : positionals[0];
	if (building && positionals.length > 2) {
		console.error("slnmix build に渡せる入力は 1 つだけです。");
		return 1;
	}
	if (!building && (values.msbuild !== undefined || values.configuration !== undefined)) {
		console.error("--msbuild / --configuration は slnmix build でのみ使えます。");
		return 1;
	}

	const resolution = resolveTarget(inputArg, process.cwd(), {
		isDirectory: isDirectoryPath,
		isFile: isFilePath,
		listFileNames: FS_DEPS.listFileNames,
		// 引数なし(またはディレクトリ指定)のとき、その場所の slnmix.config.json の target を使う
		readConfigTarget: (directory) =>
			loadSlnmixConfig(directory, { readTextFile: readSourceTextFile }).config.target,
		// 同じ場所の設定が kind: "generic" なら .sln / .vbproj を探さない
		isGenericConfig: (directory) =>
			loadSlnmixConfig(directory, { readTextFile: readSourceTextFile }).config.kind ===
			"generic",
	});
	if (resolution.kind === "error") {
		console.error(resolution.message);
		console.error("\n使い方は slnmix --help を参照してください。");
		return 1;
	}

	// ルート = 物理パス・設定ファイル・protocol.md / procedure.md・docs/・出力先の基準。
	// solution: --root > 上位の slnmix.config.json の場所 > 入力と同じ場所(rootResolver.ts)
	// generic: 設定ファイルの場所に固定(--root は使えない。基準が設定と食い違うため)
	let rootDir: string;
	let targetPath: string | undefined;
	if (resolution.kind === "generic") {
		if (values.root !== undefined && path.resolve(process.cwd(), values.root) !== resolution.rootDir) {
			console.error(
				`kind: "generic" の構成では --root は使えません(ルートは ${CONFIG_FILE_NAME} の場所: ${resolution.rootDir})。`,
			);
			return 1;
		}
		if (values["legacy-paths"]) {
			console.error('kind: "generic" の構成では --legacy-paths は使えません(論理パスがありません)。');
			return 1;
		}
		rootDir = resolution.rootDir;
		console.error(`対象: generic 構成(${CONFIG_FILE_NAME} の kind。.sln / .vbproj は使いません)`);
		console.error(`ルート: ${rootDir}`);
	} else {
		targetPath = resolution.path;
		if (resolution.autoDetected) {
			console.error(
				`対象: ${targetPath}(${resolution.source === "config" ? `${CONFIG_FILE_NAME} の target` : "自動検出"})`,
			);
		}
		const root = resolveRoot(targetPath, values.root, process.cwd(), {
			isDirectory: isDirectoryPath,
			isFile: isFilePath,
			exists: (p) => fs.existsSync(p),
		});
		if (root.kind === "error") {
			console.error(root.message);
			return 1;
		}
		rootDir = root.rootDir;
		if (root.reason !== "target") {
			console.error(`ルート: ${rootDir}(${describeRootReason(root.reason)})`);
		}
	}

	if (building) {
		if (targetPath === undefined) {
			console.error(
				'slnmix build は .sln / .vbproj の構成でのみ使えます(kind: "generic" のプロジェクトは、そのプロジェクトのビルド・テストのコマンドを使ってください)。',
			);
			return 1;
		}
		return runBuild(targetPath, rootDir, {
			msbuild: values.msbuild,
			configuration: values.configuration,
			clip: !values["no-clip"],
			mask: values["no-mask"] ? undefined : { strict: !values["no-strict-mask"] },
			respectGitignore: !values["no-gitignore"],
		});
	}

	// docs/ 連携の初回セットアップ(パックは作らない)
	if (values["init-docs"]) {
		const result = initDocs(rootDir, {
			exists: (p) => fs.existsSync(p),
			readTextFile: readSourceTextFile,
			writeTextFile: (p, content) => fs.writeFileSync(p, content, "utf8"),
			makeDirectory: (p) => fs.mkdirSync(p, { recursive: true }),
		});
		for (const item of result.created) {
			console.error(`作成: ${item}`);
		}
		for (const item of result.kept) {
			console.error(`既存: ${item}(変更なし)`);
		}
		for (const message of result.errors) {
			console.error(`[error] ${message}`);
		}
		if (result.errors.length === 0) {
			console.error(
				"docs/ 連携を有効にしました。以後は npx slnmix を実行するだけで、文書の状態に応じたモードでパックと本文用テキストを作ります。",
			);
		}
		return result.errors.length === 0 ? 0 : 1;
	}

	const sources = targetPath === undefined ? [] : collectSources(targetPath);
	if (targetPath !== undefined && sources.length === 0) {
		console.error("出力対象のプロジェクトがありません。");
		return 1;
	}

	// Designer の含め方: --include-designer-file(選択)> --include-designer(全件)
	// (generic 構成では Designer が無いので指定は無視する)
	const designerFilePatterns = values["include-designer-file"] ?? [];
	let includeSensitive: boolean | ((logicalPath: string) => boolean) =
		values["include-designer"];
	if (targetPath === undefined && (designerFilePatterns.length > 0 || values["include-designer"])) {
		console.error('[warning] kind: "generic" の構成では --include-designer / --include-designer-file は無視します');
	} else if (designerFilePatterns.length > 0) {
		if (values["include-designer"]) {
			console.error(
				"[warning] --include-designer-file の指定があるため --include-designer(全件)は無視します",
			);
		}
		includeSensitive = buildDesignerFileMatcher(designerFilePatterns);
		// パターンの打ち間違いに気づけるよう、どの Designer にも一致しなければ警告する
		const sensitivePaths = sources.flatMap((source) =>
			source.parseResult.items
				.filter((item) => item.isSensitive)
				.map((item) => item.logicalPath),
		);
		for (const pattern of designerFilePatterns) {
			if (!sensitivePaths.some(buildDesignerFileMatcher([pattern]))) {
				console.error(
					`[warning] --include-designer-file に一致する Designer 関連ファイルがありません: ${pattern}`,
				);
			}
		}
	}

	// 設定ファイルはルートから読む(物理パス・protocol.md / procedure.md・.gitignore・docs/ も同じ基準)
	const configResult = loadSlnmixConfig(rootDir, { readTextFile: readSourceTextFile });
	printDiagnostics("slnmix.config.json", configResult.diagnostics);
	const config = configResult.config;
	const layout = targetPath === undefined ? "generic" : "solution";
	if (layout === "generic" && config.extraRoots.length === 0) {
		console.error(
			`出力対象のディレクトリがありません。${CONFIG_FILE_NAME} の extraRoots に少なくとも 1 つ path を書いてください(例: { "path": "src", "kind": "src" })。`,
		);
		return 1;
	}
	if (layout === "solution" && config.kind === "generic") {
		console.error(
			`[warning] ${CONFIG_FILE_NAME} は kind: "generic" ですが、入力に .sln / .vbproj が指定されたため従来どおり論理構成で出力します`,
		);
	}
	if (config.sources.length > 0) {
		const parts = [`extraRoots ${config.extraRoots.length} 件`];
		if (config.contractSchema !== undefined) {
			parts.push(`契約スキーマ ${config.contractSchema}`);
		}
		if (config.generatedDirs.length > 0) {
			parts.push(`生成コード ${config.generatedDirs.length} ディレクトリ`);
		}
		console.error(`設定: ${config.sources.join(", ")}(${parts.join(" / ")})`);
	}

	// .gitignore / .repomixignore の尊重(本家 repomix と同じ既定挙動)
	const gitignore = createGitignoreEvaluator(rootDir);

	// パック本文を先に組み立てる。手順文の「自動テスト」の節は、実際に出力する
	// ファイル一覧(と extraRoots の kind)から有無を判定するため(autoTests.ts)
	const output = buildRepomixOutput(
		targetPath === undefined ? path.basename(rootDir) : path.basename(targetPath),
		sources,
		{
			readTextFile: readSourceTextFile,
			ignoreReasonFor: values["no-gitignore"]
				? undefined
				: (absolutePath) => gitignore.ignoreReasonFor(absolutePath),
			listFilesRecursive: FS_DEPS.listFilesRecursive,
		},
		{
			includeSensitive,
			maskCredentials: !values["no-mask"],
			strictMask: !values["no-strict-mask"],
			uiSummary: !values["no-ui-summary"],
			rootDir: values["legacy-paths"] ? undefined : rootDir,
			extraRoots: config.extraRoots,
			contractSchema: config.contractSchema,
			contractFile: config.contractFile,
			generatedDirs: config.generatedDirs,
			includeGenerated: values["include-generated"],
			layout,
		},
	);
	printDiagnostics("出力", output.diagnostics);
	if (layout === "generic" && output.fileCount === 0) {
		console.error(
			`出力対象のファイルがありません(extraRoots の include / exclude と .gitignore を確認してください。除外の理由は --stdout の <skipped_files> に出ます)。`,
		);
		return 1;
	}

	// docs/ 連携: 文書を読み、作業モードと既定タスクを決める
	let docs: DocsResolution | undefined;
	let docsTail: DocsTail | undefined;
	let mode = explicitMode ?? DEFAULT_PROCEDURE_MODE;
	let modeReason = explicitMode === undefined ? "既定" : "指定";
	let defaultTask: string | undefined;
	if (config.docs !== undefined) {
		docs = resolveDocs(rootDir, config.docs, {
			readTextFile: readSourceTextFile,
			listFileNames: FS_DEPS.listFileNames,
		});
		printDiagnostics("docs", docs.diagnostics);
		console.error(`文書: ${describeDocs(docs)}`);
		const decided = decideMode(docs, {
			...(explicitMode === undefined ? {} : { explicitMode }),
			...(values.design === undefined ? {} : { designArg: values.design }),
		});
		if (decided.kind === "error") {
			console.error(decided.message);
			return 1;
		}
		mode = decided.decision.mode;
		modeReason = decided.decision.reason;
		defaultTask = decided.decision.defaultTask;
		const strict = !values["no-strict-mask"];
		docsTail = {
			docs,
			decision: decided.decision,
			...(values["no-mask"]
				? {}
				: {
						transform: (text: string) =>
							maskCredentials(text, { vbSource: false, strict }).content,
					}),
		};
	} else if (explicitMode === "design" || values.design !== undefined) {
		console.error(
			"--mode design / --design には docs/ 連携が必要です。先に npx slnmix --init-docs を実行してください。",
		);
		return 1;
	}
	console.error(`モード: ${mode}(${modeReason})`);

	// 自動テストの有無(手順文 v6 の「自動テスト」の節を入れるか)。テストが無い
	// プロジェクトでは手順文は v5 と同一
	const autoTests = detectAutoTests(output.filePaths, config.extraRoots);
	console.error(`自動テスト: ${describeAutoTests(autoTests)}`);

	// DB の確認・動作検証(手順文 v8 / v9): ルートの docs/db/schema.md(ashiato schema の出力)が
	// あればパックに <db_schema> を入れ、手順文に「DB の確認」「動作検証」の節を足す。無ければ従来と同一
	const dbSchema = resolveDbSchema(rootDir, { readTextFile: readSourceTextFile });
	console.error(`DB の確認・動作検証: ${describeDbSchema(dbSchema)}`);

	// petari 等の規約文(protocol.md)を出力末尾へ連結する(なければ従来どおり)
	const instruction = resolveInstructionFile(
		values["instruction-file"],
		rootDir,
		process.cwd(),
		{ readTextFile: readSourceTextFile },
	);
	if (instruction.kind === "error") {
		console.error(instruction.message);
		return 1;
	}

	// 作業手順(<procedure>)・依頼内容(<task>)・承認済み方針(<plan>)
	const textDeps = { readTextFile: readSourceTextFile };
	let task: TaskResolution = resolveTask(values.task, process.cwd(), textDeps);
	if (task.kind === "none" && defaultTask !== undefined) {
		task = { kind: "default", content: defaultTask };
	}
	const plan = resolvePlan(values.plan, process.cwd(), textDeps);
	if (plan.kind === "error") {
		console.error(plan.message);
		return 1;
	}
	const procedure = resolveProcedure(
		{
			explicitPath: values["procedure-file"],
			disabled: values["no-procedure"],
			mode,
			docs: docs !== undefined,
			tests: autoTests.present,
			db: dbSchema !== undefined,
			layout,
		},
		rootDir,
		process.cwd(),
		textDeps,
	);
	if (procedure.kind === "error") {
		console.error(procedure.message);
		return 1;
	}

	// パックの出力先(--stdout のときはファイル名の表示用にのみ使う)
	const outputPath = path.resolve(
		values.output ?? path.join(rootDir, "repomix-output.xml"),
	);
	const promptTail = {
		task,
		plan,
		procedure,
		instruction,
		...(docsTail === undefined ? {} : { docs: docsTail }),
		...(dbSchema === undefined
			? {}
			: {
					dbSchema,
					...(values["no-mask"]
						? {}
						: {
								dbSchemaTransform: (text: string) =>
									maskCredentials(text, { vbSource: false, strict: !values["no-strict-mask"] })
										.content,
							}),
				}),
	};
	const promptText = buildPromptText(promptTail, path.basename(outputPath));
	if (values["print-prompt"]) {
		if (promptText === undefined) {
			console.error(
				"本文に貼る指示がありません(--no-procedure かつ --task なし、protocol.md なし)。",
			);
			return 1;
		}
		process.stdout.write(promptText);
		return 0;
	}

	// 末尾に <task> / <plan> / <procedure> / <instruction>、先頭にリマインダの
	// サンドイッチ配置(チャットの要約処理で末尾が落ちても冒頭が末尾へ誘導する)
	const content = assembleOutput(output.content, promptTail);
	if (instruction.kind === "none") {
		console.error(
			`protocol.md が見つかりません(規約文なしで出力): ${instruction.searchedPath}`,
		);
	}
	if (task.kind === "file") {
		console.error(`タスク: ${task.path}`);
	} else if (task.kind === "text") {
		console.error(`タスク: 引数の文字列(${task.content.length} 文字)`);
	} else if (task.kind === "default") {
		console.error(`タスク: 既定(${task.content})`);
	}
	if (plan.kind === "found") {
		console.error(`方針: ${plan.path}`);
	}
	if (procedure.kind === "builtin") {
		console.error(
			`手順文: 内蔵既定文 v${PROCEDURE_VERSION}(モード: ${procedure.mode})`,
		);
	} else if (procedure.kind === "file") {
		console.error(`手順文: ${procedure.path}(モード: ${procedure.mode})`);
	}

	if (values.stdout) {
		process.stdout.write(content);
	} else {
		// BOM 付き UTF-8 で保存(Windows 系ツールのエンコーディング誤判定を防ぐ)
		fs.writeFileSync(outputPath, "\uFEFF" + content, "utf8");
		console.error(`出力: ${outputPath}`);
	}

	// チャット本文に貼る指示テキスト。添付ファイル内の指示は Copilot が無視するため、
	// 手順文・規約文はこちらを本文に貼ってもらう(--stdout のときは明示指定時のみ)
	let promptPath: string | undefined;
	if (
		promptText !== undefined &&
		!values["no-prompt"] &&
		(!values.stdout || values["prompt-output"] !== undefined)
	) {
		promptPath = path.resolve(values["prompt-output"] ?? defaultPromptPath(outputPath));
		fs.writeFileSync(promptPath, "\uFEFF" + promptText, "utf8");
		console.error(`本文用: ${promptPath}`);
	}

	const maskNote = values["no-mask"]
		? "(マスク無効)"
		: ` / 認証情報マスク ${output.maskedCount} 件`;
	const uiSummaryNote =
		output.uiSummaryCount > 0 ? ` / UI サマリー ${output.uiSummaryCount} 件` : "";
	const extraNote =
		output.extraRootFileCount > 0
			? ` / 追加ルート ${output.extraRootFileCount} 件`
			: "";
	const contractNote = output.contractSummaryIncluded ? " / 契約サマリーあり" : "";
	console.error(
		`${output.fileCount} ファイル / 約 ${Math.max(
			1,
			Math.round(output.totalChars / 1000),
		)}K 文字(スキップ ${output.skipped.length} 件${maskNote}${uiSummaryNote}${extraNote}${contractNote})`,
	);

	// Copilot Chat への受け渡し。貼るものをクリップボードに入れておく(設計書 §21)
	const handoff = planHandoff(content, promptText, PASTE_LIMIT_CHARS);
	const clipped =
		!values.stdout && !values["no-clip"] && handoff.kind !== "none"
			? writeClipboard(handoff.text)
			: undefined;
	if (clipped !== undefined && !clipped.ok) {
		console.error(`[warning] クリップボードにコピーできませんでした(${clipped.message})`);
	}
	const limitNote = `貼付上限の目安(約 ${PASTE_LIMIT_CHARS / 1000}K 文字)`;
	if (clipped?.ok === true && handoff.kind === "paste-pack") {
		console.error(
			`パックが${limitNote}以内なので、パック全体をクリップボードにコピーしました → Copilot Chat の本文に貼って送信してください(添付は不要)`,
		);
	} else if (clipped?.ok === true && handoff.kind === "paste-prompt") {
		console.error(
			`パックは${limitNote}を超えています → ${path.basename(outputPath)} を添付し、クリップボードにコピーした本文用テキストを本文に貼って送信してください`,
		);
	} else {
		// クリップボードを使わない(--no-clip / --stdout / 失敗)ときは従来の案内
		const packChars = content.length;
		if (packChars > PASTE_LIMIT_CHARS) {
			console.error(`パックは${limitNote}を超えています → Copilot Chat には添付で渡してください`);
		} else {
			console.error(`パックは${limitNote}以内です → 本文に貼れば全文がコンテキストに入ります`);
		}
		if (promptPath !== undefined) {
			console.error(
				`添付で渡す場合は ${path.basename(promptPath)} の内容を本文に貼ってください(添付内の指示は Copilot が無視します)`,
			);
		}
	}
	if (promptText !== undefined && promptText.length > PASTE_LIMIT_CHARS) {
		console.error(
			`[warning] 本文用テキストが約 ${Math.round(promptText.length / 1000)}K 文字で貼付上限の目安を超えています。設計書・引継ぎ書を分割するか、--no-mask 以外の方法で短くしてください`,
		);
	}
	return 0;
}

try {
	process.exitCode = main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
