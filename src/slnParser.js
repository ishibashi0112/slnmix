"use strict";
/**
 * .sln の最小解析(引き継ぎ仕様書 §18)。
 *
 * Project("{TYPE-GUID}") = "名前", "相対パス", "{GUID}" 行の抽出のみを行い、
 * 対象は .vbproj に限定する。Solution Folder・他言語プロジェクトは
 * スキップして診断に残す。Global セクション等は読まない。
 * vscode モジュールに依存しない純粋関数(単体テスト対象)。
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
exports.parseSln = parseSln;
const path = __importStar(require("path"));
const paths_1 = require("./paths");
/** Solution Folder のプロジェクト種別 GUID(大文字で比較) */
const SOLUTION_FOLDER_TYPE_GUID = "2150E333-8FDC-42A3-9474-1A3956D46DE8";
/**
 * Project("{型GUID}") = "名前", "パス", "{GUID}" の行にマッチする。
 * 行頭空白は事前に trim しておくこと。
 */
const PROJECT_LINE = /^Project\("\{([^}]+)\}"\)\s*=\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"\{([^}]+)\}"/;
function parseSln(content, solutionPath, deps) {
    const solutionDir = path.dirname(solutionPath);
    const projects = [];
    const diagnostics = [];
    // BOM 除去(VS が保存する .sln は UTF-8 BOM 付きが多い)
    const text = content.replace(/^\uFEFF/, "");
    if (!text.includes("Microsoft Visual Studio Solution File")) {
        diagnostics.push({
            severity: "warning",
            message: "Visual Studio ソリューションのヘッダーが見つかりません(.sln 以外のファイルの可能性があります)",
        });
    }
    for (const rawLine of text.split(/\r?\n/)) {
        const match = PROJECT_LINE.exec(rawLine.trim());
        if (match === null) {
            continue;
        }
        const [, projectTypeGuid, name, relativePath, projectGuid] = match;
        if (projectTypeGuid.toUpperCase() === SOLUTION_FOLDER_TYPE_GUID) {
            diagnostics.push({
                severity: "info",
                message: `Solution Folder "${name}" は未対応のためスキップしました`,
            });
            continue;
        }
        if (!/\.vbproj$/i.test(relativePath)) {
            diagnostics.push({
                severity: "info",
                message: `.vbproj 以外のプロジェクトはスキップしました: "${name}"(${relativePath})`,
            });
            continue;
        }
        const absolutePath = (0, paths_1.resolveWindowsPath)(relativePath, solutionDir);
        projects.push({
            name,
            relativePath,
            absolutePath,
            projectGuid,
            projectTypeGuid,
            exists: deps.fileExists(absolutePath),
        });
    }
    if (projects.length === 0) {
        diagnostics.push({
            severity: "warning",
            message: "この .sln に VB プロジェクト(.vbproj)の定義が見つかりませんでした",
        });
    }
    appendUnreferencedSiblingWarnings(solutionDir, projects, diagnostics, deps);
    return { solutionPath, solutionDir, projects, diagnostics };
}
/**
 * .sln と同じフォルダにあるのに .sln から参照されていない .vbproj を警告する。
 * プロジェクトの作り直しや VCS の部分コミットで .sln だけが古い場合、
 * その .vbproj が解析・エクスポート対象から漏れていることに気付けるようにする。
 */
function appendUnreferencedSiblingWarnings(solutionDir, projects, diagnostics, deps) {
    const names = deps.listFileNames?.(solutionDir);
    if (names === undefined) {
        return;
    }
    // Windows 前提のため大文字小文字は区別しない
    const referenced = new Set(projects.map((project) => project.absolutePath.toLowerCase()));
    const unreferenced = names
        .filter((name) => /\.vbproj$/i.test(name))
        .filter((name) => !referenced.has((0, paths_1.resolveWindowsPath)(name, solutionDir).toLowerCase()))
        .sort((a, b) => a.localeCompare(b));
    for (const name of unreferenced) {
        diagnostics.push({
            severity: "warning",
            message: `同じフォルダに .sln から参照されていない .vbproj があります: ${name}` +
                "(.sln が古いか別プロジェクトの可能性があります。こちらを対象にする場合は .vbproj を直接指定してください)",
        });
    }
}
//# sourceMappingURL=slnParser.js.map