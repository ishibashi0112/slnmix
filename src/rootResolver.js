"use strict";
/**
 * ルート(物理パス・設定ファイル・protocol.md / procedure.md・docs/・出力先の基準)を決める。
 *
 * 従来はルート = 入力(.sln / .vbproj)のあるディレクトリに固定していたが、
 * web + dotnet を分けた構成(例: webview2-bridge の雛形は `dotnet/MyApp.sln`)では
 * `web/` `contract/` `e2e/` がルート外になり、petari のルート(.git の場所)とも
 * ずれる。そこで次の順で決める(決定ログ 2026-09-22):
 *
 *   1. `--root <dir>` の明示指定(入力はその配下にあること)
 *   2. 入力のディレクトリから上に向かって `slnmix.config.json` を探し、最初に
 *      見つかったディレクトリ。`.git` のあるディレクトリ(リポジトリの境界)より
 *      上には行かない。入力のディレクトリ自身に設定があれば従来と同じ
 *   3. どちらもなければ入力のディレクトリ(従来どおり)
 *
 * `.git` を自動で辿る方式は採らない。.sln がリポジトリ直下にない既存プロジェクトの
 * 出力が黙って変わるため。設定ファイルを置いた人だけが変わる、という明示の形にする。
 *
 * 純粋関数(ファイルシステムは deps 注入)。
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
exports.isWithinDirectory = isWithinDirectory;
exports.resolveRoot = resolveRoot;
exports.describeRootReason = describeRootReason;
const path = __importStar(require("path"));
const slnmixConfig_1 = require("./slnmixConfig");
/** child が parent と同じか配下か(大文字小文字は区別しない: Windows のパス前提) */
function isWithinDirectory(parent, child) {
    const rel = path.relative(parent, child);
    if (rel === "") {
        return true;
    }
    return !rel.startsWith("..") && !path.isAbsolute(rel);
}
/**
 * @param targetPath 入力(.sln / .vbproj)の絶対パス
 * @param explicitRoot `--root` の値(未指定なら undefined)
 * @param cwd `--root` を相対指定したときの基準
 */
function resolveRoot(targetPath, explicitRoot, cwd, deps) {
    const targetDir = path.dirname(targetPath);
    if (explicitRoot !== undefined) {
        const rootDir = path.resolve(cwd, explicitRoot);
        if (!deps.isDirectory(rootDir)) {
            return { kind: "error", message: `--root のディレクトリがありません: ${rootDir}` };
        }
        if (!isWithinDirectory(rootDir, targetDir)) {
            return {
                kind: "error",
                message: `入力 ${targetPath} は --root ${rootDir} の配下にありません`,
            };
        }
        return { kind: "root", rootDir, reason: "explicit" };
    }
    let dir = targetDir;
    for (;;) {
        if (deps.isFile(path.join(dir, slnmixConfig_1.CONFIG_FILE_NAME))) {
            return { kind: "root", rootDir: dir, reason: dir === targetDir ? "target" : "config" };
        }
        if (deps.exists(path.join(dir, ".git"))) {
            break;
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
    return { kind: "root", rootDir: targetDir, reason: "target" };
}
/** CLI の 1 行表示用 */
function describeRootReason(reason) {
    switch (reason) {
        case "explicit":
            return "--root";
        case "config":
            return `上位の ${slnmixConfig_1.CONFIG_FILE_NAME} の場所`;
        case "target":
            return "入力と同じ場所";
    }
}
//# sourceMappingURL=rootResolver.js.map