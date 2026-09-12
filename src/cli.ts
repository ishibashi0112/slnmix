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

import * as fs from "fs";
import * as path from "path";
import { parseArgs } from "util";
import {
	DEFAULT_PROCEDURE_MODE,
	isProcedureMode,
	PROCEDURE_MODES,
	PROCEDURE_VERSION,
	renderBuiltinProcedure,
} from "./assets/procedure";
import { buildDesignerFileMatcher } from "./designerFileFilter";
import { resolveInstructionFile } from "./instructionFile";
import {
	assembleOutput,
	resolvePlan,
	resolveProcedure,
	resolveTask,
} from "./procedureFile";
import { GitignoreEvaluator } from "./services/gitignoreService";
import { loadSlnmixConfig } from "./slnmixConfig";
import {
	buildRepomixOutput,
	decodeSourceBuffer,
	type RepomixSource,
} from "./services/repomixExporter";
import { parseSln } from "./slnParser";
import { resolveTarget } from "./targetResolver";
import type { ParseDiagnostic } from "./types";
import { parseVbproj } from "./vbprojParser";

const USAGE = `slnmix — .sln / .vbproj の論理構成に基づく repomix 互換エクスポート

使い方:
  slnmix [<solution.sln | project.vbproj | ディレクトリ>] [オプション]

  入力を省略するとカレントディレクトリ(ディレクトリ指定ならその直下)の
  *.sln を自動検出します(なければ *.vbproj。複数ある場合は候補を表示)。

オプション:
  -o, --output <file>   出力先(既定: 入力と同じ場所の repomix-output.xml)
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
                        明示指定(既定: 入力と同じ場所の protocol.md を自動検出。
                        petari init が生成する規約文を想定)
      --task <file|text>  依頼内容を出力末尾に <task> として同梱する。ファイルが
                        存在すれば読み込み、なければ文字列として扱う
      --mode <full|plan|implement>
                        作業手順(<procedure>)のモード(既定: full)
                          full      調査 / 方針 / 変更(changes.md)/ 自己検証
                          plan      調査 / 方針 / 質問(changes.md は出させない)
                          implement 方針の確認 / 変更 / 自己検証(--plan が必須)
      --plan <file>     implement モードで承認済みの方針を <plan> として同梱する
      --procedure-file <path>
                        作業手順文を明示指定(既定: 入力と同じ場所の procedure.md を
                        自動検出。なければ内蔵既定文)
      --no-procedure    <procedure> を出さない(従来出力)
      --print-procedure 内蔵の作業手順文を標準出力に書いて終了(--mode 併用可。
                        カスタマイズする人は procedure.md へリダイレクトして編集)
  -v, --version         バージョン表示
  -h, --help            このヘルプ

例:
  npx slnmix                        (カレントの .sln を自動検出)
  npx slnmix C:\\path\\to\\Project    (指定フォルダ内を自動検出)
  npx slnmix MyApp.sln -o for-ai.xml --include-designer
  npx slnmix Sub\\Project.vbproj --stdout | pbcopy
  npx slnmix --task task.md --mode plan            (方針だけ先に出させる)
  npx slnmix --task task.md --mode implement --plan plan.md
  npx slnmix --print-procedure > procedure.md      (手順文をカスタマイズ)`;

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
			"include-generated": { type: "boolean", default: false },
			"instruction-file": { type: "string" },
			task: { type: "string" },
			mode: { type: "string", default: DEFAULT_PROCEDURE_MODE },
			plan: { type: "string" },
			"procedure-file": { type: "string" },
			"no-procedure": { type: "boolean", default: false },
			"print-procedure": { type: "boolean", default: false },
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

	const mode = values.mode;
	if (!isProcedureMode(mode)) {
		console.error(
			`--mode は ${PROCEDURE_MODES.join(" / ")} のいずれかを指定してください: ${mode}`,
		);
		return 1;
	}
	if (values["print-procedure"]) {
		process.stdout.write(renderBuiltinProcedure(mode));
		return 0;
	}
	if (mode === "implement" && values.plan === undefined) {
		console.error(
			"--mode implement には --plan <file>(承認済みの方針)が必要です。先に --mode plan で方針を出し、確認したものを渡してください。",
		);
		return 1;
	}
	if (mode !== "implement" && values.plan !== undefined) {
		console.error("--plan は --mode implement でのみ使えます。");
		return 1;
	}

	const resolution = resolveTarget(positionals[0], process.cwd(), {
		isDirectory: (absolutePath) => {
			try {
				return fs.statSync(absolutePath).isDirectory();
			} catch {
				return false;
			}
		},
		isFile: (absolutePath) => {
			try {
				return fs.statSync(absolutePath).isFile();
			} catch {
				return false;
			}
		},
		listFileNames: FS_DEPS.listFileNames,
	});
	if (resolution.kind === "error") {
		console.error(resolution.message);
		console.error("\n使い方は slnmix --help を参照してください。");
		return 1;
	}
	const targetPath = resolution.path;
	if (resolution.autoDetected) {
		console.error(`対象: ${targetPath}(自動検出)`);
	}

	const sources = collectSources(targetPath);
	if (sources.length === 0) {
		console.error("出力対象のプロジェクトがありません。");
		return 1;
	}

	// Designer の含め方: --include-designer-file(選択)> --include-designer(全件)
	const designerFilePatterns = values["include-designer-file"] ?? [];
	let includeSensitive: boolean | ((logicalPath: string) => boolean) =
		values["include-designer"];
	if (designerFilePatterns.length > 0) {
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

	// ルート = 入力(.sln / .vbproj)のあるディレクトリ。物理パス・設定ファイル・
	// protocol.md / procedure.md・.gitignore の基準をすべてここに揃える
	const rootDir = path.dirname(targetPath);
	const configResult = loadSlnmixConfig(rootDir, { readTextFile: readSourceTextFile });
	printDiagnostics("slnmix.config.json", configResult.diagnostics);
	const config = configResult.config;
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

	// petari 等の規約文(protocol.md)を出力末尾へ連結する(なければ従来どおり)
	const instruction = resolveInstructionFile(
		values["instruction-file"],
		targetPath,
		process.cwd(),
		{ readTextFile: readSourceTextFile },
	);
	if (instruction.kind === "error") {
		console.error(instruction.message);
		return 1;
	}

	// 作業手順(<procedure>)・依頼内容(<task>)・承認済み方針(<plan>)
	const textDeps = { readTextFile: readSourceTextFile };
	const task = resolveTask(values.task, process.cwd(), textDeps);
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
		},
		targetPath,
		process.cwd(),
		textDeps,
	);
	if (procedure.kind === "error") {
		console.error(procedure.message);
		return 1;
	}

	// .gitignore / .repomixignore の尊重(本家 repomix と同じ既定挙動)
	const gitignore = new GitignoreEvaluator(
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
		path.dirname(targetPath),
	);

	const output = buildRepomixOutput(
		path.basename(targetPath),
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
		},
	);
	printDiagnostics("出力", output.diagnostics);

	// 末尾に <task> / <plan> / <procedure> / <instruction>、先頭にリマインダの
	// サンドイッチ配置(チャットの要約処理で末尾が落ちても冒頭が末尾へ誘導する)
	const content = assembleOutput(output.content, {
		task,
		plan,
		procedure,
		instruction,
	});
	if (instruction.kind === "none") {
		console.error(
			`protocol.md が見つかりません(規約文なしで出力): ${instruction.searchedPath}`,
		);
	}
	if (task.kind === "file") {
		console.error(`タスク: ${task.path}`);
	} else if (task.kind === "text") {
		console.error(`タスク: 引数の文字列(${task.content.length} 文字)`);
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
		const outputPath = path.resolve(
			values.output ?? path.join(path.dirname(targetPath), "repomix-output.xml"),
		);
		// BOM 付き UTF-8 で保存(Windows 系ツールのエンコーディング誤判定を防ぐ)
		fs.writeFileSync(outputPath, "\uFEFF" + content, "utf8");
		console.error(`出力: ${outputPath}`);
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
	return 0;
}

try {
	process.exitCode = main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
