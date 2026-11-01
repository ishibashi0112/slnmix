/**
 * slnmix の引数を tazuna の引数に読み替える(slnmix は 0.23.0 から tazuna を呼ぶだけの互換パッケージ。
 * tazuna は旧 petari。設計書は tazuna のリポジトリの docs/HANDOFF-slnmix-petari-2026-09.md §25)。
 *
 * - `slnmix [入力] [オプション]` → `tazuna pack [入力] [オプション]`(オプションは同じ名前)
 * - `slnmix init [...]` → `tazuna init [...]`
 * - `slnmix build [...]` → `tazuna build [...]`
 * - `-v` / `--version` は slnmix と tazuna の版を表示する(tazuna pack は受け付けないため)
 *
 * I/O を持たない純粋ロジック。
 */

export type ForwardPlan =
  | { kind: "version" }
  /** tazuna に渡す引数と、統合を知らせる 1 行(標準エラーへ) */
  | { kind: "forward"; args: string[]; notice: string };

export function planForward(argv: readonly string[]): ForwardPlan {
  const first = argv[0];
  if (first === "init" || first === "build") {
    return { kind: "forward", args: [...argv], notice: noticeFor(`tazuna ${first}`) };
  }
  if (argv.includes("-v") || argv.includes("--version")) {
    return { kind: "version" };
  }
  return { kind: "forward", args: ["pack", ...argv], notice: noticeFor("tazuna pack") };
}

function noticeFor(command: string): string {
  return `[slnmix] slnmix は tazuna に統合されました。同じ処理を npx ${command} で実行します(今後は npx ${command} を使ってください)。`;
}
