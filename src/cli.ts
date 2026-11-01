#!/usr/bin/env node
/**
 * slnmix — petari を呼ぶだけの互換コマンド(0.23.0〜)。引数を planForward で読み替え、
 * 依存の petari の CLI を同じ node で起動する(シェルを通さない)。終了コードは petari のもの。
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { planForward } from "./forward";

export interface RunDeps {
  /** petari の CLI(dist/cli.js)の絶対パスと版 */
  locatePetari(): { cliPath: string; version: string };
  ownVersion(): string;
  /** 引数を配列で渡して子プロセスを起動し、終了コードを返す */
  spawn(command: string, args: string[]): number;
  stdout(line: string): void;
  stderr(line: string): void;
}

export function run(argv: readonly string[], deps: RunDeps): number {
  const plan = planForward(argv);
  let petari: { cliPath: string; version: string };
  try {
    petari = deps.locatePetari();
  } catch (error) {
    deps.stderr(`[slnmix] 依存の petari が見つかりません(${error instanceof Error ? error.message : String(error)})。npx petari を使ってください。`);
    return 1;
  }
  if (plan.kind === "version") {
    deps.stdout(`${deps.ownVersion()}(petari ${petari.version} を呼びます)`);
    return 0;
  }
  deps.stderr(plan.notice);
  return deps.spawn(process.execPath, [petari.cliPath, ...plan.args]);
}

function readPackageJson(file: string): { version?: unknown; bin?: unknown } {
  return JSON.parse(fs.readFileSync(file, "utf8")) as { version?: unknown; bin?: unknown };
}

const NODE_DEPS: RunDeps = {
  locatePetari: () => {
    const packageJsonPath = require.resolve("petari/package.json");
    const pkg = readPackageJson(packageJsonPath);
    const bin =
      typeof pkg.bin === "string"
        ? pkg.bin
        : typeof pkg.bin === "object" && pkg.bin !== null && typeof (pkg.bin as Record<string, unknown>)["petari"] === "string"
          ? ((pkg.bin as Record<string, unknown>)["petari"] as string)
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
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.error !== undefined) {
      process.stderr.write(`[slnmix] petari を起動できませんでした: ${result.error.message}\n`);
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
