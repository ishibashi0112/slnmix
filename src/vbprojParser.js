"use strict";
/**
 * .vbproj の静的 XML 解析(旧スタイル / SDK スタイル)。
 *
 * MSBuild 評価は行わない。$()/@()/%()・Condition は展開せず、status として
 * 保持するだけに留める。旧スタイルの Include に書かれたワイルドカードも
 * 未解決(wildcard)のまま。
 *
 * 例外は SDK スタイル(`<Project Sdk="...">`)の既定 Compile グロブ
 * (`**\/*.vb`)で、これは Compile を書かない前提の形式のため展開しないと
 * 何も出せない。展開したことは診断(info)と結果の
 * defaultCompileGlobExpanded に明記し、出力側で「MSBuild の完全評価では
 * ない」と宣言する。`Remove` / `Update` / `DefaultItemExcludes` の
 * ワイルドカードは `**` / `*` / `?` だけ解釈する(globMatcher.ts)。
 *
 * ファイルシステムアクセスは deps 経由で注入し、純粋関数としてテスト可能にする。
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
exports.parseVbproj = parseVbproj;
const path = __importStar(require("path"));
const fast_xml_parser_1 = require("fast-xml-parser");
const globMatcher_1 = require("./globMatcher");
const paths_1 = require("./paths");
/** SDK スタイルの既定 Compile グロブ(Microsoft.NET.Sdk の既定) */
const DEFAULT_COMPILE_GLOB = "**/*.vb";
/**
 * SDK の既定除外(Microsoft.NET.Sdk.DefaultItems.props 相当のうち .vb に関係
 * するもの)。bin / obj は BaseOutputPath / BaseIntermediateOutputPath の
 * 既定値で、プロパティによる変更は読まない。`**\/.*\/**` はドットで始まる
 * フォルダ(.vs / .git 等)
 */
const DEFAULT_ITEM_EXCLUDES = ["bin/**", "obj/**", "**/*.user", "**/.*/**"];
/** 今回のプロトタイプで解析対象とするファイル項目種別 */
const FILE_ITEM_KINDS = [
    "Compile",
    "EmbeddedResource",
    "Content",
    "None",
];
/** MSBuild 式 $(...) / @(...) / %(...) の検出 */
const MSBUILD_EXPRESSION = /[$@%]\(/;
/** ワイルドカードの検出 */
const WILDCARD = /[*?]/;
/** 値が True のとき Designer 関連とみなすメタデータ */
const SENSITIVE_FLAG_METADATA = ["AutoGen", "DesignTime", "DesignTimeSharedInput"];
/** 存在するだけで Designer 関連とみなすメタデータ */
const SENSITIVE_PRESENCE_METADATA = ["Generator", "LastGenOutput"];
/** 拡張子による Designer 関連判定(小文字で比較) */
const SENSITIVE_SUFFIXES = [".designer.vb", ".resx", ".settings"];
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function asString(value) {
    return typeof value === "string" ? value : undefined;
}
/** fast-xml-parser は要素が 1 つだと配列にしないため、常に配列へ揃える */
function toArray(value) {
    if (value === undefined) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}
/** 表示用論理パスへ正規化(VS の Solution Explorer と同じ `\` 区切り) */
function toLogicalPath(value) {
    return value
        .split(/[\\/]/)
        .filter((segment) => segment !== "" && segment !== ".")
        .join("\\");
}
/** 要素名・プロパティ名は大文字小文字を区別しない(MSBuild の仕様に合わせる) */
function equalsIgnoreCase(a, b) {
    return a.toLowerCase() === b.toLowerCase();
}
/** メタデータ名は大文字小文字を区別しない(MSBuild の仕様に合わせる) */
function getMetadata(metadata, name) {
    const lower = name.toLowerCase();
    for (const [key, value] of Object.entries(metadata)) {
        if (key.toLowerCase() === lower) {
            return value;
        }
    }
    return undefined;
}
function combineConditions(groupCondition, itemCondition) {
    if (groupCondition !== undefined && itemCondition !== undefined) {
        return `(${groupCondition}) AND (${itemCondition})`;
    }
    return itemCondition ?? groupCondition;
}
function isDesignerRelated(logicalPath, metadata) {
    const fileName = (logicalPath.split("\\").pop() ?? "").toLowerCase();
    if (SENSITIVE_SUFFIXES.some((suffix) => fileName.endsWith(suffix))) {
        return true;
    }
    for (const name of SENSITIVE_FLAG_METADATA) {
        if (getMetadata(metadata, name)?.toLowerCase() === "true") {
            return true;
        }
    }
    for (const name of SENSITIVE_PRESENCE_METADATA) {
        if (getMetadata(metadata, name) !== undefined) {
            return true;
        }
    }
    return false;
}
/**
 * Item 要素の Include / Remove / Update / Condition 以外の子要素・属性を
 * メタデータとして全保持する(未知のものも捨てない)
 */
function collectMetadata(entry, itemInclude, diagnostics) {
    const metadata = {};
    for (const [key, value] of Object.entries(entry)) {
        if (key === "@_Include" ||
            key === "@_Remove" ||
            key === "@_Update" ||
            key === "@_Condition" ||
            key === "#text") {
            continue;
        }
        if (key.startsWith("@_")) {
            // Item の未知の属性もメタデータとして保持(@_ を外す)
            const attrValue = asString(value);
            if (attrValue !== undefined) {
                metadata[key.slice(2)] = attrValue;
            }
            continue;
        }
        const text = asString(value);
        if (text !== undefined) {
            metadata[key] = text;
            continue;
        }
        // <Link Condition="...">x</Link> のような属性付きメタデータ
        if (isRecord(value)) {
            const innerText = asString(value["#text"]);
            if (innerText !== undefined) {
                metadata[key] = innerText;
                diagnostics.push({
                    severity: "info",
                    message: `メタデータ <${key}> の属性は無視しました`,
                    itemInclude,
                });
                continue;
            }
        }
        diagnostics.push({
            severity: "warning",
            message: `メタデータ <${key}> を文字列として解釈できなかったため無視しました`,
            itemInclude,
        });
    }
    return metadata;
}
/** Item 要素 1 件を ProjectItem へ正規化する。Include 欠落などは undefined */
function buildProjectItem(kind, entry, groupCondition, projectDir, deps, diagnostics) {
    if (!isRecord(entry)) {
        diagnostics.push({
            severity: "warning",
            message: `内容が空の <${kind}> 要素をスキップしました`,
        });
        return undefined;
    }
    const include = asString(entry["@_Include"]);
    if (include === undefined || include === "") {
        diagnostics.push({
            severity: "warning",
            message: `Include 属性のない <${kind}> 要素をスキップしました`,
        });
        return undefined;
    }
    const metadata = collectMetadata(entry, include, diagnostics);
    const link = getMetadata(metadata, "Link");
    const dependentUpon = getMetadata(metadata, "DependentUpon");
    const subType = getMetadata(metadata, "SubType");
    const condition = combineConditions(groupCondition, asString(entry["@_Condition"]));
    const logicalPath = toLogicalPath(link ?? include);
    const isSensitive = isDesignerRelated(logicalPath, metadata);
    const base = {
        kind,
        include,
        logicalPath,
        link,
        dependentUpon,
        subType,
        condition,
        isSensitive,
        metadata,
    };
    // 状態判定の優先順位: unresolved-expression > wildcard > conditional > missing > resolved
    if (MSBUILD_EXPRESSION.test(include) || (link !== undefined && MSBUILD_EXPRESSION.test(link))) {
        return {
            ...base,
            exists: false,
            status: "unresolved-expression",
            unresolvedReason: "MSBuild 式 $()/@()/%() を含むため静的解析では解決できません",
        };
    }
    if (WILDCARD.test(include)) {
        return {
            ...base,
            exists: false,
            status: "wildcard",
            unresolvedReason: "ワイルドカードは初期段階では展開しません",
        };
    }
    const sourcePath = (0, paths_1.resolveWindowsPath)(include, projectDir);
    const exists = deps.fileExists(sourcePath);
    if (condition !== undefined) {
        return {
            ...base,
            sourcePath,
            exists,
            status: "conditional",
            unresolvedReason: "Condition 付きのため実際に含まれるかは評価していません",
        };
    }
    return {
        ...base,
        sourcePath,
        exists,
        status: exists ? "resolved" : "missing",
    };
}
/** ItemGroup 内の未対応項目種別を数え、診断として報告する */
function reportUnsupportedKinds(counts, diagnostics) {
    if (counts.size === 0) {
        return;
    }
    const summary = [...counts.entries()]
        .map(([tag, count]) => `${tag} ×${count}`)
        .join(", ");
    diagnostics.push({
        severity: "info",
        message: `未対応の項目種別のため解析対象外: ${summary}`,
    });
}
/** `<Project Sdk="...">` / `<Sdk Name="...">` / `<Import Sdk="...">` のいずれかがあれば SDK スタイル */
function detectProjectStyle(project) {
    const sdkAttr = asString(project["@_Sdk"]);
    if (sdkAttr !== undefined) {
        return { style: "sdk", sdkName: sdkAttr };
    }
    for (const sdkElement of toArray(project["Sdk"])) {
        if (isRecord(sdkElement)) {
            return { style: "sdk", sdkName: asString(sdkElement["@_Name"]) };
        }
    }
    for (const importElement of toArray(project["Import"])) {
        if (isRecord(importElement)) {
            const sdk = asString(importElement["@_Sdk"]);
            if (sdk !== undefined) {
                return { style: "sdk", sdkName: sdk };
            }
        }
    }
    return { style: "legacy" };
}
function readSdkProperties(project, diagnostics) {
    const result = {
        enableDefaultCompileItems: true,
        defaultItemExcludes: [],
    };
    for (const group of toArray(project["PropertyGroup"])) {
        if (!isRecord(group)) {
            continue;
        }
        const groupCondition = asString(group["@_Condition"]);
        for (const [tag, value] of Object.entries(group)) {
            if (tag.startsWith("@_") || tag === "#text") {
                continue;
            }
            const text = asString(value) ?? (isRecord(value) ? asString(value["#text"]) : undefined);
            if (text === undefined) {
                continue;
            }
            const relevant = equalsIgnoreCase(tag, "EnableDefaultCompileItems") ||
                equalsIgnoreCase(tag, "EnableDefaultItems") ||
                equalsIgnoreCase(tag, "DefaultItemExcludes");
            if (!relevant) {
                continue;
            }
            const condition = groupCondition ?? (isRecord(value) ? asString(value["@_Condition"]) : undefined);
            if (condition !== undefined) {
                diagnostics.push({
                    severity: "info",
                    message: `<${tag}> は Condition 付きですが評価せず値を採用しました: ${condition}`,
                });
            }
            if (equalsIgnoreCase(tag, "DefaultItemExcludes")) {
                const patterns = [];
                for (const raw of text.split(";")) {
                    const pattern = raw.trim();
                    if (pattern === "") {
                        continue;
                    }
                    if (MSBUILD_EXPRESSION.test(pattern)) {
                        // $(DefaultItemExcludes) 自身の参照は既定除外を引き継ぐ慣用句なので無視
                        if (!/^\$\(DefaultItemExcludes\)$/i.test(pattern)) {
                            diagnostics.push({
                                severity: "info",
                                message: `DefaultItemExcludes の MSBuild 式は解釈できないため無視しました: ${pattern}`,
                            });
                        }
                        continue;
                    }
                    patterns.push(pattern);
                }
                result.defaultItemExcludes = patterns;
            }
            else if (text.trim().toLowerCase() === "false") {
                result.enableDefaultCompileItems = false;
            }
            else if (text.trim().toLowerCase() === "true") {
                result.enableDefaultCompileItems = true;
            }
        }
    }
    return result;
}
/**
 * SDK スタイルの既定 Compile グロブ(`**\/*.vb`)を展開し、既存の項目と
 * 重複しないものを resolved の ProjectItem として返す。
 */
function expandDefaultCompileGlob(projectDir, existingItems, removePatterns, extraExcludes, deps, diagnostics) {
    if (deps.listFilesRecursive === undefined) {
        diagnostics.push({
            severity: "warning",
            message: "SDK スタイルですが、ファイル一覧の取得手段がないため既定の Compile グロブを展開できません",
        });
        return undefined;
    }
    const files = deps.listFilesRecursive(projectDir);
    if (files === undefined) {
        diagnostics.push({
            severity: "warning",
            message: `SDK スタイルですが、プロジェクトディレクトリを走査できないため既定の Compile グロブを展開できません: ${projectDir}`,
        });
        return undefined;
    }
    const includeRegExp = (0, globMatcher_1.globToRegExp)(DEFAULT_COMPILE_GLOB);
    const excludeRegExps = [
        ...DEFAULT_ITEM_EXCLUDES,
        ...extraExcludes,
        ...removePatterns,
    ].map(globMatcher_1.globToRegExp);
    const existingSourcePaths = new Set(existingItems
        .map((item) => item.sourcePath)
        .filter((p) => p !== undefined)
        .map((p) => path.normalize(p).toLowerCase()));
    const expanded = [];
    let excludedCount = 0;
    let duplicateCount = 0;
    for (const absolutePath of files) {
        const relative = (0, globMatcher_1.normalizeGlobPath)(path.relative(projectDir, absolutePath));
        if (relative === "" || relative.startsWith("../") || !includeRegExp.test(relative)) {
            continue;
        }
        if (excludeRegExps.some((re) => re.test(relative))) {
            excludedCount += 1;
            continue;
        }
        if (existingSourcePaths.has(path.normalize(absolutePath).toLowerCase())) {
            duplicateCount += 1; // 明示 Include 済み(MSBuild では重複エラーになるが、ここでは明示側を採る)
            continue;
        }
        const include = relative.split("/").join("\\");
        const logicalPath = toLogicalPath(include);
        expanded.push({
            kind: "Compile",
            include,
            sourcePath: absolutePath,
            logicalPath,
            exists: true,
            status: "resolved",
            isSensitive: isDesignerRelated(logicalPath, {}),
            metadata: {},
        });
    }
    expanded.sort((a, b) => a.include.toLowerCase().localeCompare(b.include.toLowerCase()));
    const details = [`除外 ${excludedCount} 件`];
    if (duplicateCount > 0) {
        details.push(`明示 Include と重複 ${duplicateCount} 件`);
    }
    diagnostics.push({
        severity: "info",
        message: `SDK スタイルのため既定の Compile グロブ(${DEFAULT_COMPILE_GLOB})を展開しました: ${expanded.length} 件(${details.join("、")})。MSBuild の完全評価ではありません`,
    });
    return expanded;
}
/** `<Compile Update="...">` のメタデータを、一致する項目へ付与する */
function applyUpdates(items, updates, diagnostics) {
    for (const update of updates) {
        const regExp = (0, globMatcher_1.globToRegExp)(update.pattern);
        let matched = 0;
        for (let i = 0; i < items.length; i += 1) {
            const item = items[i];
            if (item.kind !== update.kind || !regExp.test((0, globMatcher_1.normalizeGlobPath)(item.include))) {
                continue;
            }
            matched += 1;
            const metadata = { ...item.metadata, ...update.metadata };
            const link = getMetadata(metadata, "Link");
            const logicalPath = link !== undefined ? toLogicalPath(link) : item.logicalPath;
            items[i] = {
                ...item,
                metadata,
                link,
                logicalPath,
                dependentUpon: getMetadata(metadata, "DependentUpon"),
                subType: getMetadata(metadata, "SubType"),
                isSensitive: isDesignerRelated(logicalPath, metadata),
            };
        }
        if (matched === 0) {
            diagnostics.push({
                severity: "info",
                message: `<${update.kind} Update="${update.pattern}"> に一致する項目がありません`,
            });
        }
    }
}
/**
 * .vbproj の XML 文字列を解析し、正規化した ProjectItem 配列と診断を返す。
 *
 * @param xmlContent .vbproj の内容(BOM 付き可)
 * @param projectPath .vbproj の絶対パス(相対パス解決の基準に使用)
 * @param deps ファイルシステム依存の注入
 */
function parseVbproj(xmlContent, projectPath, deps) {
    const projectDir = path.dirname(projectPath);
    const diagnostics = [];
    const items = [];
    const result = {
        projectPath,
        projectDir,
        projectStyle: "legacy",
        defaultCompileGlobExpanded: false,
        items,
        diagnostics,
    };
    // BOM 除去(VS が保存する .vbproj は UTF-8 BOM 付きが多い)
    const xml = xmlContent.replace(/^\uFEFF/, "");
    const validation = fast_xml_parser_1.XMLValidator.validate(xml);
    if (validation !== true) {
        diagnostics.push({
            severity: "error",
            message: `XML として解析できません: ${validation.err.msg}(${validation.err.line}行目)`,
        });
        return result;
    }
    const parser = new fast_xml_parser_1.XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        removeNSPrefix: true,
        parseTagValue: false,
        parseAttributeValue: false,
        trimValues: true,
    });
    let parsed;
    try {
        parsed = parser.parse(xml);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        diagnostics.push({
            severity: "error",
            message: `XML の解析に失敗しました: ${message}`,
        });
        return result;
    }
    if (!isRecord(parsed)) {
        diagnostics.push({ severity: "error", message: "XML のルートを解釈できません" });
        return result;
    }
    const project = parsed["Project"];
    if (!isRecord(project)) {
        diagnostics.push({
            severity: "error",
            message: "<Project> 要素が見つかりません(.vbproj ではない可能性があります)",
        });
        return result;
    }
    const toolsVersion = asString(project["@_ToolsVersion"]);
    if (toolsVersion !== undefined) {
        diagnostics.push({ severity: "info", message: `ToolsVersion: ${toolsVersion}` });
    }
    const detected = detectProjectStyle(project);
    result.projectStyle = detected.style;
    if (detected.style === "sdk") {
        diagnostics.push({
            severity: "info",
            message: `SDK スタイルのプロジェクトです(Sdk: ${detected.sdkName ?? "不明"})`,
        });
    }
    // Project 直下の未対応要素(仕様書 §7 で対応不能・未解決扱いとしたもの)。
    // SDK スタイルの <Import Sdk="..."> は形式の判定に使うだけで、内容は同様に展開しない
    const importCount = toArray(project["Import"]).length;
    if (importCount > 0) {
        diagnostics.push({
            severity: "info",
            message: `<Import> ×${importCount} は未対応です(Import 先の項目は表示されません)`,
        });
    }
    if (project["Choose"] !== undefined) {
        diagnostics.push({
            severity: "warning",
            message: "<Choose>/<When>/<Otherwise> は静的解析では評価されません",
        });
    }
    const unsupportedKindCounts = new Map();
    const fileKindSet = new Set(FILE_ITEM_KINDS);
    const removePatterns = [];
    const updates = [];
    for (const groupValue of toArray(project["ItemGroup"])) {
        if (!isRecord(groupValue)) {
            continue; // <ItemGroup/> は空文字列になるため無視してよい
        }
        const groupCondition = asString(groupValue["@_Condition"]);
        for (const [tag, value] of Object.entries(groupValue)) {
            if (tag.startsWith("@_") || tag === "#text") {
                continue;
            }
            if (!fileKindSet.has(tag)) {
                const count = toArray(value).length;
                unsupportedKindCounts.set(tag, (unsupportedKindCounts.get(tag) ?? 0) + count);
                continue;
            }
            for (const entry of toArray(value)) {
                if (isRecord(entry) && asString(entry["@_Include"]) === undefined) {
                    // Remove / Update は列挙ではなく、既定グロブ展開後の項目への操作
                    const remove = asString(entry["@_Remove"]);
                    const update = asString(entry["@_Update"]);
                    if (remove !== undefined && remove !== "") {
                        if (tag === "Compile") {
                            removePatterns.push(remove);
                        }
                        else {
                            diagnostics.push({
                                severity: "info",
                                message: `<${tag} Remove="${remove}"> は未対応です(Remove は Compile の既定グロブ展開にのみ適用)`,
                            });
                        }
                        continue;
                    }
                    if (update !== undefined && update !== "") {
                        updates.push({
                            kind: tag,
                            pattern: update,
                            metadata: collectMetadata(entry, update, diagnostics),
                        });
                        continue;
                    }
                }
                const item = buildProjectItem(tag, entry, groupCondition, projectDir, deps, diagnostics);
                if (item !== undefined) {
                    items.push(item);
                }
            }
        }
    }
    reportUnsupportedKinds(unsupportedKindCounts, diagnostics);
    if (detected.style === "sdk") {
        const properties = readSdkProperties(project, diagnostics);
        if (!properties.enableDefaultCompileItems) {
            diagnostics.push({
                severity: "info",
                message: "EnableDefaultCompileItems=false のため既定の Compile グロブは展開しません(明示された項目のみ)",
            });
        }
        else {
            const expanded = expandDefaultCompileGlob(projectDir, items, removePatterns, properties.defaultItemExcludes, deps, diagnostics);
            if (expanded !== undefined) {
                items.push(...expanded);
                result.defaultCompileGlobExpanded = true;
            }
        }
    }
    else if (removePatterns.length > 0) {
        diagnostics.push({
            severity: "info",
            message: `<Compile Remove> ×${removePatterns.length} は旧スタイルでは適用対象がありません(既定グロブを展開しないため)`,
        });
    }
    applyUpdates(items, updates, diagnostics);
    return result;
}
//# sourceMappingURL=vbprojParser.js.map