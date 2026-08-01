#!/usr/bin/env node
/**
 * slnmix CLI 入口。
 *
 * .sln / .vbproj を入力に、repomix 互換フォーマットの 1 ファイルを出力する。
 * ディレクトリ走査ではなくソリューションの論理構成(Link・DependentUpon
 * 解決済み)に基づくため、プロジェクト外・別ドライブの Link ファイルも拾い、
 * ビルド対象外のファイルは含めない。
 *
 * 解析・出力ロジックは Legacy VB.NET Workbench(VS Code 拡張)と同一の
 * コアモジュールを使う。この入口はファイル I/O と引数処理のみを担当する。
 */

import * as fs from "fs";
import * as path from "path";
import { parseArgs } from "util";
import { GitignoreEvaluator } from "./services/gitignoreService";
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
      --no-ui-summary   Designer.vb からの UI サマリー(<ui_summary>)生成を無効化
      --no-mask         認証情報の自動マスク([MASKED] 置換)を無効化
      --no-gitignore    .gitignore / .repomixignore による除外を無効化
  -v, --version         バージョン表示
  -h, --help            このヘルプ

例:
  npx slnmix                        (カレントの .sln を自動検出)
  npx slnmix C:\\path\\to\\Project    (指定フォルダ内を自動検出)
  npx slnmix MyApp.sln -o for-ai.xml --include-designer
  npx slnmix Sub\\Project.vbproj --stdout | pbcopy`;

interface FsDeps {
	fileExists(absolutePath: string): boolean;
}

const FS_DEPS: FsDeps = {
	fileExists: (absolutePath) => fs.existsSync(absolutePath),
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
			"no-ui-summary": { type: "boolean", default: false },
			"no-mask": { type: "boolean", default: false },
			"no-gitignore": { type: "boolean", default: false },
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
		},
		{
			includeSensitive: values["include-designer"],
			maskCredentials: !values["no-mask"],
			uiSummary: !values["no-ui-summary"],
		},
	);

	if (values.stdout) {
		process.stdout.write(output.content);
	} else {
		const outputPath = path.resolve(
			values.output ?? path.join(path.dirname(targetPath), "repomix-output.xml"),
		);
		// BOM 付き UTF-8 で保存(Windows 系ツールのエンコーディング誤判定を防ぐ)
		fs.writeFileSync(outputPath, "\uFEFF" + output.content, "utf8");
		console.error(`出力: ${outputPath}`);
	}

	const maskNote = values["no-mask"]
		? "(マスク無効)"
		: ` / 認証情報マスク ${output.maskedCount} 件`;
	const uiSummaryNote =
		output.uiSummaryCount > 0 ? ` / UI サマリー ${output.uiSummaryCount} 件` : "";
	console.error(
		`${output.fileCount} ファイル / 約 ${Math.max(
			1,
			Math.round(output.totalChars / 1000),
		)}K 文字(スキップ ${output.skipped.length} 件${maskNote}${uiSummaryNote})`,
	);
	return 0;
}

try {
	process.exitCode = main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
