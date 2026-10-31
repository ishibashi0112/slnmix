"use strict";
/**
 * Windows パス前提のパス解決ユーティリティ。
 * vbprojParser と slnParser で共用する。
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
exports.resolveWindowsPath = resolveWindowsPath;
const path = __importStar(require("path"));
/** ドライブ絶対パス(C:\ など)または UNC(\\server\...) */
const WINDOWS_ABSOLUTE = /^(?:[a-zA-Z]:[\\/]|\\\\)/;
/**
 * .vbproj / .sln に書かれたパスを絶対パスへ解決する。
 * - ドライブ絶対パス・UNC は実行環境によらず Windows パスとして正規化のみ行う
 * - 相対パスは baseDir 基準。`\` 区切りは実行環境の区切りへ変換する
 *   (Mac での開発・テストと Windows での実利用の両方で動かすため)
 */
function resolveWindowsPath(value, baseDir) {
    if (WINDOWS_ABSOLUTE.test(value)) {
        return path.win32.normalize(value);
    }
    const platformRelative = value.split(/[\\/]/).join(path.sep);
    return path.resolve(baseDir, platformRelative);
}
//# sourceMappingURL=paths.js.map