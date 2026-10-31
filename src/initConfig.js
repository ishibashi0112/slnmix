"use strict";
/**
 * slnmix --init-config: VB.NET 以外のプロジェクト(TypeScript 等)で slnmix を使う
 * ための slnmix.config.json(kind: "generic")を作る(v0.17.0、設計書 §19)。
 *
 * - 既に slnmix.config.json があれば何もしない(冪等。中身は変えない)
 * - その場所に .sln / .vbproj があれば作らない(従来の solution 構成で動くため)
 * - ソースのディレクトリは「候補名のうち実在するもの」だけを採用する(src / app /
 *   lib / apps / packages → kind: "src"、tests / test / e2e / __tests__ →
 *   kind: "test")。1 つも無ければ推測で書かずエラーにし、例を示す
 *
 * ファイルシステムは deps 注入(単体テスト可能)。
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
exports.EXAMPLE_CONFIG = exports.TEST_DIR_CANDIDATES = exports.SOURCE_DIR_CANDIDATES = void 0;
exports.initConfig = initConfig;
const path = __importStar(require("path"));
const slnmixConfig_1 = require("./slnmixConfig");
/** ソースの候補ディレクトリ(この順で並ぶ) */
exports.SOURCE_DIR_CANDIDATES = ["src", "app", "lib", "apps", "packages"];
/** 自動テストの候補ディレクトリ */
exports.TEST_DIR_CANDIDATES = ["tests", "test", "e2e", "__tests__"];
/** 候補が 1 つも無いときに案内する設定例 */
exports.EXAMPLE_CONFIG = `{
  "kind": "generic",
  "extraRoots": [
    { "path": "src", "kind": "src" },
    { "path": "tests", "kind": "test" }
  ]
}`;
function renderConfig(roots) {
    const lines = roots.map((root, index) => `    { "path": "${root.path}", "kind": "${root.kind}" }${index === roots.length - 1 ? "" : ","}`);
    return ["{", '  "kind": "generic",', '  "extraRoots": [', ...lines, "  ]", "}", ""].join("\n");
}
/**
 * @param rootDir 設定を置くディレクトリ(プロジェクトルート)の絶対パス
 */
function initConfig(rootDir, deps) {
    const configPath = path.join(rootDir, slnmixConfig_1.CONFIG_FILE_NAME);
    if (deps.isFile(configPath)) {
        return { kind: "kept", path: configPath };
    }
    const names = deps.listFileNames(rootDir) ?? [];
    const solutionFiles = names.filter((name) => /\.(sln|vbproj)$/i.test(name)).sort();
    if (solutionFiles.length > 0) {
        return {
            kind: "error",
            message: [
                `${rootDir} には ${solutionFiles.join(", ")} があります。VB.NET のプロジェクトは設定なしで npx slnmix を実行できます(kind: "generic" は .sln / .vbproj の無いプロジェクト向け)。`,
            ].join("\n"),
        };
    }
    const roots = [];
    for (const name of exports.SOURCE_DIR_CANDIDATES) {
        if (deps.isDirectory(path.join(rootDir, name))) {
            roots.push({ path: name, kind: "src" });
        }
    }
    for (const name of exports.TEST_DIR_CANDIDATES) {
        if (deps.isDirectory(path.join(rootDir, name))) {
            roots.push({ path: name, kind: "test" });
        }
    }
    if (!roots.some((root) => root.kind === "src")) {
        return {
            kind: "error",
            message: [
                `${rootDir} にソースのディレクトリ(${exports.SOURCE_DIR_CANDIDATES.join(" / ")})が見つかりません。推測では作らないので、${slnmixConfig_1.CONFIG_FILE_NAME} を手で作ってください。例:`,
                exports.EXAMPLE_CONFIG,
            ].join("\n"),
        };
    }
    const content = renderConfig(roots);
    deps.writeTextFile(configPath, content);
    return { kind: "created", path: configPath, content, roots };
}
//# sourceMappingURL=initConfig.js.map