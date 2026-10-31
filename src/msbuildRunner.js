"use strict";
/**
 * `slnmix build` の MSBuild の場所の決定と起動(v0.20.0、設計書 §22)。
 *
 * 場所の優先順位: --msbuild > vswhere(VS 2017 以降・Build Tools)>
 * MSBuild 14.0 / 12.0(VS 2015 / 2013)> .NET Framework 4 の MSBuild。
 * 推測はせず、実在するファイルだけを使う。子プロセスは配列引数(シェル非経由)。
 * 場所の決定は deps 注入で単体テストし、起動は実機で確認する。
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
exports.locateMsbuild = locateMsbuild;
exports.runVswhere = runVswhere;
exports.msbuildArgs = msbuildArgs;
exports.runMsbuild = runMsbuild;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const VSWHERE_ARGS = [
    "-latest",
    "-products",
    "*",
    "-requires",
    "Microsoft.Component.MSBuild",
    "-find",
    "MSBuild\\**\\Bin\\MSBuild.exe",
    "-utf8",
];
function locateMsbuild(explicit, deps) {
    if (explicit !== undefined && explicit !== "") {
        return { kind: "found", path: explicit, source: "--msbuild" };
    }
    if (deps.platform !== "win32") {
        return {
            kind: "error",
            message: "MSBuild の自動検出は Windows だけです。--msbuild で実行するコマンドを指定してください。",
        };
    }
    const win = path.win32;
    const programFilesX86 = deps.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    const windir = deps.env["WINDIR"] ?? deps.env["windir"] ?? "C:\\Windows";
    const checked = [];
    const vswhere = win.join(programFilesX86, "Microsoft Visual Studio", "Installer", "vswhere.exe");
    checked.push(vswhere);
    if (deps.isFile(vswhere)) {
        const found = (deps.runVswhere(vswhere, VSWHERE_ARGS) ?? "")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find((line) => line !== "" && deps.isFile(line));
        if (found !== undefined) {
            return { kind: "found", path: found, source: "vswhere" };
        }
    }
    const fixed = [
        [win.join(programFilesX86, "MSBuild", "14.0", "Bin", "MSBuild.exe"), "MSBuild 14.0(VS 2015)"],
        [win.join(programFilesX86, "MSBuild", "12.0", "Bin", "MSBuild.exe"), "MSBuild 12.0(VS 2013)"],
        [win.join(windir, "Microsoft.NET", "Framework64", "v4.0.30319", "MSBuild.exe"), ".NET Framework 4"],
        [win.join(windir, "Microsoft.NET", "Framework", "v4.0.30319", "MSBuild.exe"), ".NET Framework 4"],
    ];
    for (const [candidate, source] of fixed) {
        checked.push(candidate);
        if (deps.isFile(candidate)) {
            return { kind: "found", path: candidate, source };
        }
    }
    return {
        kind: "error",
        message: [
            "MSBuild が見つかりませんでした。次の場所を確かめました:",
            ...checked.map((p) => `  ${p}`),
            "--msbuild で MSBuild.exe のパスを指定してください。",
        ].join("\n"),
    };
}
/** vswhere を起動する(既定の実装) */
function runVswhere(vswherePath, args) {
    const result = (0, child_process_1.spawnSync)(vswherePath, args, { encoding: "utf8", windowsHide: true, timeout: 30_000 });
    return result.status === 0 ? result.stdout : undefined;
}
function msbuildArgs(target, options) {
    return [
        target,
        "/nologo",
        "/m",
        "/v:minimal",
        ...(options.configuration !== undefined ? [`/p:Configuration=${options.configuration}`] : []),
        "/fl",
        `/flp:LogFile=${options.logFile};ErrorsOnly;Encoding=UTF-8`,
    ];
}
/** MSBuild を起動する。進行状況は利用者の端末にそのまま出す */
function runMsbuild(msbuild, target, options) {
    const result = (0, child_process_1.spawnSync)(msbuild, msbuildArgs(target, options), { stdio: "inherit", windowsHide: true });
    if (result.error !== undefined) {
        const code = result.error.code;
        return {
            kind: "error",
            message: code === "ENOENT" ? `${msbuild} が見つかりません` : result.error.message,
        };
    }
    return { kind: "exited", status: result.status ?? 1 };
}
//# sourceMappingURL=msbuildRunner.js.map