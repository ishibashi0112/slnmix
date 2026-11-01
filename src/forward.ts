/**
 * slnmix の引数を petari の引数に読み替える(slnmix は 0.23.0 から petari を呼ぶだけの互換パッケージ。
 * petari の設計書 docs/HANDOFF-slnmix-petari-2026-09.md §25)。
 *
 * - `slnmix [入力] [オプション]` → `petari pack [入力] [オプション]`(オプションは同じ名前)
 * - `slnmix init [...]` → `petari init [...]`
 * - `slnmix build [...]` → `petari build [...]`
 * - `-v` / `--version` は slnmix と petari の版を表示する(petari pack は受け付けないため)
 *
 * I/O を持たない純粋ロジック。
 */

export type ForwardPlan =
  | { kind: "version" }
  /** petari に渡す引数と、統合を知らせる 1 行(標準エラーへ) */
  | { kind: "forward"; args: string[]; notice: string };

export function planForward(argv: readonly string[]): ForwardPlan {
  const first = argv[0];
  if (first === "init" || first === "build") {
    return { kind: "forward", args: [...argv], notice: noticeFor(`petari ${first}`) };
  }
  if (argv.includes("-v") || argv.includes("--version")) {
    return { kind: "version" };
  }
  return { kind: "forward", args: ["pack", ...argv], notice: noticeFor("petari pack") };
}

function noticeFor(command: string): string {
  return `[slnmix] slnmix は petari に統合されました。同じ処理を npx ${command} で実行します(今後は npx ${command} を使ってください)。`;
}
