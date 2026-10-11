/**
 * クリップボードへの書き込み(v0.19.0。Copilot Chat への受け渡し用)。
 * 依存を増やさないため OS のコマンドを呼ぶ(petari の infra/clipboard.ts と同じ方式):
 *   Windows: PowerShell の Set-Clipboard(UTF-8 の一時ファイル経由。コンソールの
 *            コードページに依存しない)
 *   macOS:   pbcopy
 *   Linux:   xclip(入っている場合のみ)
 * 子プロセスは常に配列引数(シェル非経由)。自動テストはなく実機で確認する。
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export type ClipboardResult = { ok: true } | { ok: false; message: string };

/** クリップボードのコマンドが固まっても slnmix 全体を止めない */
const TIMEOUT_MS = 15_000;

function describe(result: ReturnType<typeof spawnSync>, command: string): ClipboardResult {
	if (result.error !== undefined) {
		const code = (result.error as NodeJS.ErrnoException).code;
		return {
			ok: false,
			message: code === "ENOENT" ? `${command} が見つかりません` : result.error.message,
		};
	}
	if (result.status !== 0) {
		return { ok: false, message: `${command} が終了コード ${result.status ?? "不明"} で終了しました` };
	}
	return { ok: true };
}

export function writeClipboard(text: string): ClipboardResult {
	if (process.platform === "win32") {
		// パスは PowerShell の単一引用符で渡す(' は '' にエスケープ。展開・注入が起きない)
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slnmix-clip-"));
		const file = path.join(dir, "clip.txt");
		try {
			fs.writeFileSync(file, text, "utf8");
			const quoted = `'${file.split("'").join("''")}'`;
			return describe(
				spawnSync(
					"powershell",
					[
						"-NoProfile",
						"-NonInteractive",
						"-Command",
						`Get-Content -Raw -Encoding UTF8 -LiteralPath ${quoted} | Set-Clipboard`,
					],
					{ stdio: ["ignore", "ignore", "pipe"], windowsHide: true, timeout: TIMEOUT_MS },
				),
				"PowerShell",
			);
		} finally {
			// コードを含むため一時ファイルを残さない
			fs.rmSync(dir, { recursive: true, force: true });
		}
	}
	if (process.platform === "darwin") {
		return describe(
			spawnSync("pbcopy", [], { input: text, stdio: ["pipe", "ignore", "ignore"], timeout: TIMEOUT_MS }),
			"pbcopy",
		);
	}
	// xclip は選択を保持するため裏で常駐する。stdout / stderr をつなぐとその子が
	// 閉じるまで待ってしまうので、入力以外はつながない
	return describe(
		spawnSync("xclip", ["-selection", "clipboard"], {
			input: text,
			stdio: ["pipe", "ignore", "ignore"],
			timeout: TIMEOUT_MS,
		}),
		"xclip",
	);
}
