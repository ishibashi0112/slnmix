"use strict";
/**
 * クリップボードへの書き込み(v0.19.0。Copilot Chat への受け渡し用)。
 * 依存を増やさないため OS のコマンドを呼ぶ(petari の infra/clipboard.ts と同じ方式):
 *   Windows: PowerShell の Set-Clipboard(UTF-8 の一時ファイル経由。コンソールの
 *            コードページに依存しない)
 *   macOS:   pbcopy
 *   Linux:   xclip(入っている場合のみ)
 * 子プロセスは常に配列引数(シェル非経由)。自動テストはなく実機で確認する。
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeClipboard = writeClipboard;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
/** クリップボードのコマンドが固まっても slnmix 全体を止めない */
const TIMEOUT_MS = 15_000;
function describe(result, command) {
    if (result.error !== undefined) {
        const code = result.error.code;
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
function writeClipboard(text) {
    if (process.platform === "win32") {
        // パスは PowerShell の単一引用符で渡す(' は '' にエスケープ。展開・注入が起きない)
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slnmix-clip-"));
        const file = path.join(dir, "clip.txt");
        try {
            fs.writeFileSync(file, text, "utf8");
            const quoted = `'${file.split("'").join("''")}'`;
            return describe((0, child_process_1.spawnSync)("powershell", [
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                `Get-Content -Raw -Encoding UTF8 -LiteralPath ${quoted} | Set-Clipboard`,
            ], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true, timeout: TIMEOUT_MS }), "PowerShell");
        }
        finally {
            // コードを含むため一時ファイルを残さない
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }
    if (process.platform === "darwin") {
        return describe((0, child_process_1.spawnSync)("pbcopy", [], { input: text, stdio: ["pipe", "ignore", "ignore"], timeout: TIMEOUT_MS }), "pbcopy");
    }
    // xclip は選択を保持するため裏で常駐する。stdout / stderr をつなぐとその子が
    // 閉じるまで待ってしまうので、入力以外はつながない
    return describe((0, child_process_1.spawnSync)("xclip", ["-selection", "clipboard"], {
        input: text,
        stdio: ["pipe", "ignore", "ignore"],
        timeout: TIMEOUT_MS,
    }), "xclip");
}
//# sourceMappingURL=clipboard.js.map