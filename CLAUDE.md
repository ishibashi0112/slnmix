# CLAUDE.md

## プロジェクト概要

slnmix は 0.23.0 から **petari を呼ぶだけの互換パッケージ**。パックを作る機能(旧 slnmix の解析コア・
`slnmix build`・`slnmix init`)は 2026-11-01 に petari のリポジトリへ移した(petari 0.15.0。
設計正本は petari の `docs/HANDOFF-slnmix-petari-2026-09.md` §25)。機能の修正・追加はすべて petari で行う。

- `src/forward.ts` — 引数の読み替え(`slnmix [...]` → `petari pack [...]`、`init` / `build` はそのまま、
  `-v` / `--version` は自分で答える)。純粋関数
- `src/cli.ts` — 依存の petari の `package.json` から CLI のパスを求め、同じ node で起動する(配列引数・
  シェル非経由)。統合を知らせる 1 行を標準エラーに出す。終了コードは petari のもの
- 依存は petari だけ。petari の版数範囲を上げるときは、先に petari を publish してから `pnpm install` で
  lockfile を更新する(未公開の版は解決できない)
- `docs/` は移転先への案内だけ(利用者のリポジトリの `docs/README.md` や他の文書からのリンクを切らないため)
- 数か月後に `npm deprecate slnmix "petari に統合されました。npx petari pack を使ってください"` を行う(メンテナー)

## コマンド

```bash
pnpm run build        # dist/ へビルド(tsconfig.build.json)
pnpm test             # tsc → mocha(--ui tdd)
```

## リリース手順

1. petari を先に publish する(このパッケージは petari の版数範囲に依存する)
2. `pnpm install` で lockfile を更新してコミット
3. `package.json` の version を上げてコミットし、`git push origin main`
4. **`npm publish` はメンテナー本人が実行**(npm アカウントはパスキー認証のため、エージェントでは完結できない。
   `prepublishOnly` でビルドは自動)
