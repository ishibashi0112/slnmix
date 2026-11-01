# slnmix

**slnmix は [petari](https://github.com/ishibashi0112/petari) に統合されました(petari 0.15.0)。**
パックを作る機能(旧 slnmix)と、AI の返答を当てる機能(petari)が 1 つのコマンドになりました。

| 以前 | 今 |
|---|---|
| `npx slnmix init` | `npx petari init` |
| `npx slnmix [入力] [オプション]` | `npx petari pack [入力] [オプション]`(オプションは同じ名前) |
| `npx slnmix build` | `npx petari build` |

このパッケージ(0.23.0〜)は、引数をそのまま petari に渡すだけの互換コマンドです。依存は petari だけで、
実行すると統合を知らせる 1 行を標準エラーに出してから、同じ処理を petari で実行します。しばらく残したあと
`npm deprecate` します。新しく導入する場合は petari だけを入れてください。

- `slnmix.config.json` は名前を変えなくても petari が読みます(新しく作るときは `petari.config.json`)
- `protocol.md` は手を加えていなければ消してかまいません(規約文は petari に内蔵になりました)
- `docs/`・`.petari/`・`.gitignore` の行・設計書の状態行(`<!-- slnmix design: ... -->`)はそのままです
- 出力はツール名の行だけが変わります。設定ファイルの無いプロジェクトで `.sln` がリポジトリ直下より下にあると、
  `<file path>` の基準がリポジトリ直下になります(変更を当てるときのパスと一致する方向の変更です)

## 移転先

| 内容 | 場所 |
|---|---|
| 使い方(パックの機能・オプション) | [petari の docs/PACK.md](https://github.com/ishibashi0112/petari/blob/main/docs/PACK.md) |
| 運用ガイド(場面別の手順) | [petari の docs/WORKFLOW.md](https://github.com/ishibashi0112/petari/blob/main/docs/WORKFLOW.md) |
| 導入審査向けの説明 | [petari の docs/SECURITY-REVIEW.md](https://github.com/ishibashi0112/petari/blob/main/docs/SECURITY-REVIEW.md) |
| 設計書 | [petari の docs/HANDOFF-slnmix-petari-2026-09.md](https://github.com/ishibashi0112/petari/blob/main/docs/HANDOFF-slnmix-petari-2026-09.md) |
| ソースコード | petari の `src/pack/`・`src/commands/pack.ts` / `build.ts` / `init.ts` |

0.22.2 までのソースは、このリポジトリの git の履歴(タグ・コミット)に残っています。

## License

MIT
