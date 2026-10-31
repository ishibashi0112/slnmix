"use strict";
/**
 * slnmix --init-docs: docs/ 連携の一回きりのセットアップ(フェーズ 6)。
 *
 * - docs/design/ と docs/spec/ を作る(空)
 * - docs/README.md(文書の役割と日常の流れ)を書く
 * - slnmix.config.json に "docs" 設定を追記する(既存キーは保持。docs が既に
 *   あれば変えない。壊れた JSON は上書きせずエラー)
 *
 * 引継ぎ書・設計書・仕様書のファイル自体は作らない(AI が changes.md の create で
 * 出し、petari が親ディレクトリごと作る。空の引継ぎ書を置くと「続きから」と
 * 誤判定するため)。設計書 §17 の「slnmix init は作らない」は必須セットアップを
 * petari init 一回に保つための決定で、任意機能の本コマンドはそれと矛盾しない。
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
exports.initDocs = initDocs;
const path = __importStar(require("path"));
const docTemplates_1 = require("./assets/docTemplates");
const slnmixConfig_1 = require("./slnmixConfig");
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
 * @param rootDir ルート(.sln / .vbproj のあるディレクトリ)の絶対パス
 */
function initDocs(rootDir, deps) {
    const result = { created: [], kept: [], errors: [] };
    const abs = (relative) => path.resolve(rootDir, ...relative.split("/"));
    // 1. slnmix.config.json(先に。ここで失敗したらディレクトリを作らない)
    const configPath = abs(slnmixConfig_1.CONFIG_FILE_NAME);
    const existing = deps.readTextFile(configPath);
    let parsed = {};
    if (existing !== undefined) {
        let value;
        try {
            value = JSON.parse(existing.replace(/^﻿/, ""));
        }
        catch (error) {
            result.errors.push(`${slnmixConfig_1.CONFIG_FILE_NAME} を JSON として読めません(上書きしません): ${error instanceof Error ? error.message : String(error)}`);
            return result;
        }
        if (!isRecord(value)) {
            result.errors.push(`${slnmixConfig_1.CONFIG_FILE_NAME} のトップレベルはオブジェクトである必要があります(上書きしません)`);
            return result;
        }
        parsed = value;
    }
    if (parsed["docs"] !== undefined && parsed["docs"] !== false && parsed["docs"] !== null) {
        result.kept.push(`${slnmixConfig_1.CONFIG_FILE_NAME} (docs 設定済み)`);
    }
    else {
        const next = { ...parsed, docs: { ...docTemplates_1.DEFAULT_DOCS_CONFIG } };
        deps.writeTextFile(configPath, `${JSON.stringify(next, null, 2)}\n`);
        result.created.push(existing === undefined ? slnmixConfig_1.CONFIG_FILE_NAME : `${slnmixConfig_1.CONFIG_FILE_NAME} (docs 設定を追記)`);
    }
    // 2. ディレクトリ(既存の設定があればその配置に従う)
    const docsConfig = isRecord(parsed["docs"])
        ? {
            design: typeof parsed["docs"]["design"] === "string" ? parsed["docs"]["design"] : docTemplates_1.DEFAULT_DOCS_CONFIG.design,
            spec: typeof parsed["docs"]["spec"] === "string" ? parsed["docs"]["spec"] : docTemplates_1.DEFAULT_DOCS_CONFIG.spec,
        }
        : { design: docTemplates_1.DEFAULT_DOCS_CONFIG.design, spec: docTemplates_1.DEFAULT_DOCS_CONFIG.spec };
    for (const dir of [docsConfig.design, docsConfig.spec]) {
        const normalized = dir.replace(/\\/g, "/").replace(/\/+$/, "");
        if (deps.exists(abs(normalized))) {
            result.kept.push(`${normalized}/`);
        }
        else {
            deps.makeDirectory(abs(normalized));
            result.created.push(`${normalized}/`);
        }
    }
    // 3. docs/README.md(設計書ディレクトリの親に置く)
    const docsRoot = path.posix.dirname(docsConfig.design.replace(/\\/g, "/"));
    const readmeRelative = docsRoot === "." ? "README.md" : `${docsRoot}/README.md`;
    if (deps.exists(abs(readmeRelative))) {
        result.kept.push(readmeRelative);
    }
    else {
        // 親ディレクトリは設計書ディレクトリの作成(再帰)で存在している
        deps.writeTextFile(abs(readmeRelative), docTemplates_1.DOCS_README);
        result.created.push(readmeRelative);
    }
    return result;
}
//# sourceMappingURL=initDocs.js.map