"use strict";
/**
 * 内容を含めないバイナリ系拡張子(小文字)。
 * repomixExporter(プロジェクト項目)と extraRootsCollector(追加ルート)で共用する。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BINARY_EXTENSIONS = void 0;
exports.extensionOf = extensionOf;
exports.isBinaryExtension = isBinaryExtension;
exports.BINARY_EXTENSIONS = [
    ".dll",
    ".exe",
    ".pdb",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".bmp",
    ".ico",
    ".svg",
    ".webp",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".zip",
    ".pdf",
    ".xls",
    ".xlsx",
    ".doc",
    ".docx",
];
/** ファイル名の拡張子(小文字)。なければ空文字 */
function extensionOf(fileName) {
    const dot = fileName.lastIndexOf(".");
    return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}
function isBinaryExtension(fileName) {
    return exports.BINARY_EXTENSIONS.includes(extensionOf(fileName));
}
//# sourceMappingURL=binaryExtensions.js.map