#!/usr/bin/env node
/**
 * slnmix — tazuna を呼ぶだけの互換コマンド(0.23.0〜)。引数を planForward で読み替え、
 * 依存の tazuna の CLI を同じ node で起動する(シェルを通さない)。終了コードは tazuna のもの。
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { planForward } from "./forward";

export interface RunDeps {
  /** tazuna の CLI(dist/cli.js)の絶対パスと版 */
  locateTazuna(): { cliPath: string; version: string };
  ownVersion(): string;
  /** 引数を配列で渡して子プロセスを起動し、終了コードを返す */
  spawn(command: string, args: string[]): number;
  stdout(line: string): void;
  stderr(line: string): void;
}

export function run(argv: readonly string[], deps: RunDeps): number {
  const plan = planForward(argv);
  let tazuna: { cliPath: string; version: string };
  try {
    tazuna = deps.locateTazuna();
  } catch (error) {
    deps.stderr(`[slnmix] 依存の tazuna が見つかりません(${error instanceof Error ? error.message : String(error)})。npx tazuna を使ってください。`);
    return 1;
  }
  if (plan.kind === "version") {
    deps.stdout(`${deps.ownVersion()}(tazuna ${tazuna.version} を呼びます)`);
    return 0;
  }
  deps.stderr(plan.notice);
  return deps.spawn(process.execPath, [tazuna.cliPath, ...plan.args]);
}

function readPackageJson(file: string): { version?: unknown; bin?: unknown } {
  return JSON.parse(fs.readFileSync(file, "utf8")) as { version?: unknown; bin?: unknown };
}

const NODE_DEPS: RunDeps = {
  locateTazuna: () => {
    const packageJsonPath = require.resolve("tazuna/package.json");
    const pkg = readPackageJson(packageJsonPath);
    const bin =
      typeof pkg.bin === "string"
        ? pkg.bin
        : typeof pkg.bin === "object" && pkg.bin !== null && typeof (pkg.bin as Record<string, unknown>)["tazuna"] === "string"
          ? ((pkg.bin as Record<string, unknown>)["tazuna"] as string)
          : "dist/cli.js";
    return {
      cliPath: path.resolve(path.dirname(packageJsonPath), bin),
      version: typeof pkg.version === "string" ? pkg.version : "不明",
    };
  },
  ownVersion: () => {
    const pkg = readPackageJson(path.join(__dirname, "..", "package.json"));
    return typeof pkg.version === "string" ? pkg.version : "不明";
  },
  spawn: (command, args) => {
    // Ctrl+C は子(tazuna)にも届く。子が後始末を終えるまで待ってから抜ける(既定の動作のままだと先に終了する)
    process.on("SIGINT", () => {});
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.error !== undefined) {
      process.stderr.write(`[slnmix] tazuna を起動できませんでした: ${result.error.message}\n`);
      return 1;
    }
    return result.status ?? 1;
  },
  stdout: (line) => process.stdout.write(line + "\n"),
  stderr: (line) => process.stderr.write(line + "\n"),
};

if (require.main === module) {
  process.exitCode = run(process.argv.slice(2), NODE_DEPS);
}
