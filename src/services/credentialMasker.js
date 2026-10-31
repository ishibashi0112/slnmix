"use strict";
/**
 * 認証情報の自動マスク(Repomix エクスポート用)。
 *
 * 実業務プロジェクトのソースにハードコードされた DB 認証情報が
 * エクスポートへそのまま含まれた事例を受けて導入。
 *
 * 方針:
 * - 「秘密の値そのもの(文字列リテラル)」だけを [MASKED] に置換する。
 *   値が変数・式の場合は秘密情報を含まないため触らない(コードを壊さない)
 * - マスクした箇所は行番号・種類付きで findings に記録し、
 *   出力側で明示する(黙って書き換えない)
 * - vscode 非依存の純粋ロジック(単体テスト対象)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MASK_TOKEN = void 0;
exports.maskCredentials = maskCredentials;
exports.hasMaskToken = hasMaskToken;
exports.maskLinesForDisplay = maskLinesForDisplay;
exports.maskedValuesForDisplay = maskedValuesForDisplay;
const MASK = "[MASKED]";
const KIND_PASSWORD = "パスワード";
const KIND_USER = "ユーザーID";
const KIND_TOKEN = "APIキー/トークン";
const KIND_PRIVATE_KEY = "秘密鍵";
const KIND_ENTROPY = "高エントロピー値";
/** パスワード・秘密系とみなす変数名/キー名のヒント(日本語識別子対応) */
const SECRET_NAME_HINT = /pass(?:word)?|passwd|pswd|pwd|secret|credential|api[_-]?key|apikey|access[_-]?key|accesskey|secret[_-]?key|secretkey|token|パスワード|ﾊﾟｽﾜｰﾄﾞ|暗証/i;
/** ユーザーID系とみなす変数名のヒント(VB の代入リテラル用) */
const USER_NAME_HINT = /user|uid|account|login|ユーザ|ﾕｰｻﾞ|アカウント/i;
/**
 * VB 識別子の文字クラス(日本語識別子対応)。
 * ひらがな・カタカナ・CJK 漢字・半角カナ・全角英数を含める。
 * `.` は Me.txtPassword.Text のようなメンバーアクセス用(先頭以外)
 */
const IDENT_HEAD = "A-Za-z_\\u3040-\\u30FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\uFF66-\\uFF9F\\uFF21-\\uFF3A\\uFF41-\\uFF5A";
const IDENT_BODY = `${IDENT_HEAD}0-9.\\uFF10-\\uFF19`;
/**
 * 接続文字列・設定のキー=値(パスワード系)。
 * 値は ; " & < > 改行 まで(接続文字列のセパレータで停止)。値の先頭が
 * 空白・引用符のもの(`KEY = "..."` のようなコードの代入)は対象外にし、
 * 引用符内は文字列リテラルとして別途(高エントロピー判定で)扱う
 */
const CONNSTR_SECRET = /\b(password|passwd|pswd|pwd|pass|secret|api[_-]?key|apikey|access[_-]?key|secret[_-]?key|token)(\s*=\s*)([^;"&<>\r\n:\s][^;"&<>\r\n]*)/gi;
/** 接続文字列のユーザー系キー(User ID / UID など明確なもののみ)。
 *  値の先頭 : は SQL バインド変数(UID = :UID 等)のため対象外 */
const CONNSTR_USER = /\b(user\s*id|userid|username|uid)(\s*=\s*)([^;"&<>\r\n:\s][^;"&<>\r\n]*)/gi;
/**
 * 日本語キー=値(設定ファイル・接続文字列・リテラル内)。
 * `\b` は非 ASCII に効かないため ASCII キーとは別パターンにする。
 * `=` のほか全角 `=` も対象。`:` は UI ラベル文言("パスワード: 8文字以上"等)
 * との誤爆が多いため対象外
 */
const JP_KEY_SECRET = /(パスワード|ﾊﾟｽﾜｰﾄﾞ|暗証番号)(\s*[==]\s*)([^;"&<>\r\n\s][^;"&<>\r\n]*)/g;
const JP_KEY_USER = /(ユーザー?(?:ID|ID|名)|ﾕｰｻﾞｰ?ID|アカウント(?:ID|ID|名)?)(\s*[==]\s*)([^;"&<>\r\n\s][^;"&<>\r\n]*)/g;
/** XML 属性形式: password="..." など(非 VB ファイル用) */
const ATTR_SECRET = /\b(password|passwd|pswd|pwd|pass|secret|api[_-]?key|apikey|access[_-]?key|secret[_-]?key|token|user\s*id|userid|username|uid)(\s*=\s*")([^"]+)(")/gi;
/** XML 属性形式の日本語キー: パスワード="..." など(非 VB ファイル用) */
const JP_ATTR_SECRET = /(パスワード|ﾊﾟｽﾜｰﾄﾞ|暗証番号|ユーザー?(?:ID|ID|名)|ﾕｰｻﾞｰ?ID)(\s*[==]\s*")([^"]+)(")/g;
/**
 * 直前のコードが「変数 = 」で終わっているか(行継続 `_` 対応)。
 * 文字列リテラルの直前コンテキスト判定に使う
 */
const ASSIGNMENT_TAIL = new RegExp(`([${IDENT_HEAD}][${IDENT_BODY}]*)\\s*(?:As\\s+String\\s*)?=\\s*(?:_\\s*)?$`);
/** 名前付き引数(Foo(password:="x"))の直前コンテキスト */
const NAMED_ARG_TAIL = new RegExp(`([${IDENT_HEAD}][${IDENT_BODY}]*)\\s*:=\\s*(?:_\\s*)?$`);
/** 開き括弧の直前のメソッド名(callArgKind 用) */
const CALLEE_TAIL = new RegExp(`([${IDENT_HEAD}][${IDENT_BODY}]*)\\s*$`);
/** コメント内のコメントアウトされた代入('wk_Pswd = "x" など) */
const COMMENT_ASSIGN = new RegExp(`([${IDENT_HEAD}][${IDENT_BODY}]*)(\\s*=\\s*")([^"\\r\\n]+)(")`, "g");
/** 汎用シークレット形式(ファイル種別によらず適用) */
const TOKEN_PATTERNS = [
    { kind: KIND_TOKEN, regex: /\bAKIA[0-9A-Z]{16}\b/g },
    { kind: KIND_TOKEN, regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
    { kind: KIND_TOKEN, regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
    {
        kind: KIND_TOKEN,
        regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    },
];
/** Bearer トークン(bearer という語は残しトークン部のみマスク) */
const BEARER_TOKEN = /\b(bearer\s+)([A-Za-z0-9._~+/-]{16,}=*)/gi;
/**
 * 一部だけ伏せたトークンの残り。厳格モードでは高エントロピー値の判定がトークンの形式より
 * 先に走るため、20 文字未満の部分(JWT の署名、Bearer トークンの「.」の後ろなど)が残る
 * ことがある。伏せ字を含み、伏せていない英数字も残っているものを丸ごと伏せる
 */
const PARTIAL_JWT = /(?:\beyJ[A-Za-z0-9_-]{8,}|\[MASKED\])\.(?:eyJ[A-Za-z0-9_-]{8,}|\[MASKED\])\.(?:[A-Za-z0-9_-]{8,}|\[MASKED\])/g;
const PARTIAL_BEARER = /\b(bearer\s+)((?:\[MASKED\]|[A-Za-z0-9._~+/-])+=*)/gi;
/** 伏せ字を含み、伏せていない英数字も残っているか */
function isPartlyMasked(token) {
    return token.includes(MASK) && /[A-Za-z0-9]/.test(token.split(MASK).join(""));
}
/** PRIVATE KEY ブロック(BEGIN/END 行は残し中身をマスク) */
const PRIVATE_KEY_BLOCK = /(-----BEGIN [A-Z ]*PRIVATE KEY-----)[\s\S]+?(-----END [A-Z ]*PRIVATE KEY-----)/g;
/**
 * 高エントロピー文字列の候補(英数と base64/URL-safe 記号の 20 文字以上)。
 * 判定は looksHighEntropy で絞る
 */
const HIGH_ENTROPY_CANDIDATE = /[A-Za-z0-9+/=_-]{20,}/g;
/** 正規形の GUID(COM 参照・プロジェクト GUID 等で頻出。秘密ではない) */
const GUID_FORM = /^\{?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}?$/;
function charClassOf(ch) {
    if (ch >= "0" && ch <= "9") {
        return 0;
    }
    if (ch >= "a" && ch <= "z") {
        return 1;
    }
    if (ch >= "A" && ch <= "Z") {
        return 2;
    }
    return 3;
}
/**
 * ランダムな秘密らしさの近似判定。
 * 数字と英字の両方を含み、文字種(数字/小文字/大文字/記号)の切り替わりが
 * 長さに対して多いものだけを対象にする。一様ランダムな英数字列は約 6 割の
 * 位置で切り替わるのに対し、"Windows10Update2026Info" のような普通の語は
 * 3 割程度に留まるため、45% を閾値にする。既知トークン形式
 * (ghp_... / AKIA...)の整った並びは対象外のまま各専用パターンに任せる
 */
function looksHighEntropy(token) {
    if (!/[0-9]/.test(token) || !/[A-Za-z]/.test(token)) {
        return false;
    }
    if (GUID_FORM.test(token)) {
        return false;
    }
    let transitions = 0;
    for (let i = 1; i < token.length; i++) {
        if (charClassOf(token[i]) !== charClassOf(token[i - 1])) {
            transitions += 1;
        }
    }
    return transitions >= Math.max(6, 0.45 * (token.length - 1));
}
/** 高エントロピー文字列のマスク(strict モード時のみ呼ばれる) */
function maskEntropyText(text, findings, toLine) {
    return text.replace(HIGH_ENTROPY_CANDIDATE, (token, offset) => {
        if (!looksHighEntropy(token)) {
            return token;
        }
        findings.push({ line: toLine(offset), kind: KIND_ENTROPY });
        return MASK;
    });
}
/** lineOf の改行位置の控え(同じ文字列への問い合わせが続くため。大きいファイルで遅くならないように) */
let lineIndexText;
let lineIndexBreaks = [];
function lineOf(text, index) {
    if (text !== lineIndexText) {
        lineIndexBreaks = [];
        for (let i = 0; i < text.length; i++) {
            if (text.charCodeAt(i) === 0x0a) {
                lineIndexBreaks.push(i);
            }
        }
    }
    // 内容が同じ別の文字列なら控えをそのまま使い、次からは同じ文字列として速く比べられるようにする
    lineIndexText = text;
    // index より前にある改行の数 + 1
    let lo = 0;
    let hi = lineIndexBreaks.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((lineIndexBreaks[mid] ?? 0) < index) {
            lo = mid + 1;
        }
        else {
            hi = mid;
        }
    }
    return lo + 1;
}
/** 接続文字列キー=値のマスク(テキスト断片に適用)。offsetBase は行番号計算用 */
function maskConnstrText(text, findings, toLine) {
    let result = text.replace(CONNSTR_SECRET, (whole, key, eq, _value, offset) => {
        findings.push({ line: toLine(offset), kind: KIND_PASSWORD });
        return `${key}${eq}${MASK}`;
    });
    result = result.replace(CONNSTR_USER, (whole, key, eq, _value, offset) => {
        findings.push({ line: toLine(offset), kind: KIND_USER });
        return `${key}${eq}${MASK}`;
    });
    result = result.replace(JP_KEY_SECRET, (whole, key, eq, _value, offset) => {
        findings.push({ line: toLine(offset), kind: KIND_PASSWORD });
        return `${key}${eq}${MASK}`;
    });
    result = result.replace(JP_KEY_USER, (whole, key, eq, _value, offset) => {
        findings.push({ line: toLine(offset), kind: KIND_USER });
        return `${key}${eq}${MASK}`;
    });
    return result;
}
/** 変数名のヒントからマスク種別を決める(該当なしは undefined) */
function kindForIdentifier(identifier) {
    if (SECRET_NAME_HINT.test(identifier)) {
        return KIND_PASSWORD;
    }
    if (USER_NAME_HINT.test(identifier)) {
        return KIND_USER;
    }
    return undefined;
}
/**
 * 文字列リテラルが「秘密系メソッドの引数」かどうかを直前コンテキストから
 * 判定する(Login("admin", "pass123") / SetPassword("x") 等)。
 * 直近の未対応の開き括弧を遡り、その直前のメソッド名にヒントがあれば
 * そのリテラルは引数とみなす。行(改行)を跨いだら打ち切る
 */
function callArgKind(tail) {
    let depth = 0;
    for (let i = tail.length - 1; i >= 0; i--) {
        const ch = tail[i];
        if (ch === ")") {
            depth += 1;
        }
        else if (ch === "(") {
            if (depth === 0) {
                const callee = CALLEE_TAIL.exec(tail.slice(0, i));
                return callee === null ? undefined : kindForIdentifier(callee[1]);
            }
            depth -= 1;
        }
        else if (ch === "\n") {
            return undefined;
        }
    }
    return undefined;
}
/** コメント内のマスク(コメントアウトされた認証情報コードも対象にする) */
function maskCommentText(comment, findings, line, strict) {
    let result = comment.replace(COMMENT_ASSIGN, (whole, identifier, assign, _value, close) => {
        const kind = kindForIdentifier(identifier);
        if (kind === undefined) {
            return whole;
        }
        findings.push({ line, kind });
        return `${identifier}${assign}${MASK}${close}`;
    });
    result = maskConnstrText(result, findings, () => line);
    if (strict) {
        result = maskEntropyText(result, findings, () => line);
    }
    return result;
}
/**
 * VB ソースのマスク。
 * 正規表現の一発置換だとリテラル連結("Password=" & 変数 など)をまたいで
 * 誤マスクするため、コード/文字列リテラル/コメントを区別して走査する。
 * - 「秘密系変数 = "リテラル"」→ リテラル全体をマスク
 * - 名前付き引数(password:="x")・秘密系メソッドの引数リテラルもマスク
 * - それ以外のリテラル → 内部の接続文字列キー(PWD=xxx 等)のみマスク。
 *   strict 時は高エントロピー文字列もマスク
 * - コメント → コメントアウトされた代入・接続文字列もマスク
 */
function maskVbSource(content, findings, strict) {
    let out = "";
    // 直前のコード(out の末尾)の控え。out を毎回切り出すと、大きいファイルで
    // 文字列全体の複製が文字列リテラルごとに起きて遅くなるため
    let recent = "";
    const emit = (piece) => {
        out += piece;
        recent += piece;
        if (recent.length > 400) {
            recent = recent.slice(-200);
        }
    };
    let i = 0;
    const n = content.length;
    while (i < n) {
        const ch = content[i];
        if (ch === '"') {
            // 文字列リテラルを読み取る("" は " のエスケープ。行内で閉じる前提)
            let j = i + 1;
            let inner = "";
            while (j < n) {
                if (content[j] === '"') {
                    if (content[j + 1] === '"') {
                        inner += '""';
                        j += 2;
                        continue;
                    }
                    break;
                }
                if (content[j] === "\n" || content[j] === "\r") {
                    break;
                }
                inner += content[j];
                j += 1;
            }
            const closed = j < n && content[j] === '"';
            // 直前のコードが「秘密系変数 = 」「秘密系の名前付き引数 :=」
            // 「秘密系メソッドの引数」ならリテラル全体をマスク
            const tail = recent.slice(-200);
            let kind;
            if (closed && inner.trim() !== "") {
                const assignMatch = ASSIGNMENT_TAIL.exec(tail);
                if (assignMatch !== null) {
                    kind = kindForIdentifier(assignMatch[1]);
                }
                if (kind === undefined) {
                    const namedArg = NAMED_ARG_TAIL.exec(tail);
                    kind =
                        namedArg !== null
                            ? kindForIdentifier(namedArg[1])
                            : callArgKind(tail);
                }
            }
            if (kind !== undefined) {
                findings.push({ line: lineOf(content, i), kind });
                emit(`"${MASK}"`);
                i = j + 1;
                continue;
            }
            // それ以外は接続文字列キー(strict 時は高エントロピー値も)のみマスク
            let maskedInner = maskConnstrText(inner, findings, () => lineOf(content, i));
            if (strict) {
                maskedInner = maskEntropyText(maskedInner, findings, () => lineOf(content, i));
            }
            emit(`"${maskedInner}${closed ? '"' : ""}`);
            i = closed ? j + 1 : j;
            continue;
        }
        if (ch === "'") {
            // コメント: 行末まで
            let j = i;
            while (j < n && content[j] !== "\n") {
                j += 1;
            }
            emit(maskCommentText(content.slice(i, j), findings, lineOf(content, i), strict));
            i = j;
            continue;
        }
        emit(ch);
        i += 1;
    }
    return out;
}
/** 非 VB ファイル(config / XML / テキスト等)のマスク */
function maskGenericText(content, findings, strict) {
    // XML 属性形式(値が引用符で囲まれるため接続文字列パターンでは拾えない)
    let result = content.replace(ATTR_SECRET, (whole, key, eq, _value, closeQuote, offset) => {
        const kind = /user|uid/i.test(key) ? KIND_USER : KIND_PASSWORD;
        findings.push({ line: lineOf(content, offset), kind });
        return `${key}${eq}${MASK}${closeQuote}`;
    });
    result = result.replace(JP_ATTR_SECRET, (whole, key, eq, _value, closeQuote, offset) => {
        const kind = /ユーザ|ﾕｰｻﾞ/.test(key) ? KIND_USER : KIND_PASSWORD;
        findings.push({ line: lineOf(result, offset), kind });
        return `${key}${eq}${MASK}${closeQuote}`;
    });
    result = maskConnstrText(result, findings, (index) => lineOf(result, index));
    if (strict) {
        result = maskEntropyText(result, findings, (index) => lineOf(result, index));
    }
    return result;
}
/**
 * 認証情報らしき値を [MASKED] に置換し、置換箇所の一覧を返す。
 */
function maskCredentials(content, options) {
    const findings = [];
    const strict = options.strict ?? true;
    let result = options.vbSource
        ? maskVbSource(content, findings, strict)
        : maskGenericText(content, findings, strict);
    // ファイル種別によらない汎用シークレット形式
    result = result.replace(PRIVATE_KEY_BLOCK, (whole, begin, end, offset) => {
        findings.push({ line: lineOf(result, offset), kind: KIND_PRIVATE_KEY });
        return `${begin}\n${MASK}\n${end}`;
    });
    for (const pattern of TOKEN_PATTERNS) {
        result = result.replace(pattern.regex, (whole, ...args) => {
            const offset = args[args.length - 2];
            findings.push({
                line: typeof offset === "number" ? lineOf(result, offset) : 1,
                kind: pattern.kind,
            });
            return MASK;
        });
    }
    result = result.replace(BEARER_TOKEN, (whole, prefix, _token, offset) => {
        findings.push({ line: lineOf(result, offset), kind: KIND_TOKEN });
        return `${prefix}${MASK}`;
    });
    result = result.replace(PARTIAL_JWT, (whole) => (isPartlyMasked(whole) ? MASK : whole));
    result = result.replace(PARTIAL_BEARER, (whole, prefix, token) => isPartlyMasked(token) ? `${prefix}${MASK}` : whole);
    // 大きい文字列を控えに残したままにしない
    lineIndexText = undefined;
    lineIndexBreaks = [];
    return { content: result, findings };
}
// ---------------------------------------------------------------------------
// 伏せた表示 (行の位置を保つ)。slnmix のビルドエラーの抜粋と同じ処理
// ---------------------------------------------------------------------------
/** slnmix が置き換える伏せ字 */
exports.MASK_TOKEN = MASK;
function hasMaskToken(line) {
    return line.includes(MASK);
}
/**
 * slnmix が使い得る伏せ方。.vb は VB として伏せるのが通常だが、generic 構成の追加ディレクトリでは
 * 汎用テキストとして伏せる。strict は --no-strict-mask で切られる
 */
function maskModes(path, stricts) {
    const vbs = /\.vb$/i.test(path) ? [true, false] : [false];
    return vbs.flatMap((vbSource) => stricts.map((strict) => ({ vbSource, strict })));
}
/** 秘密鍵ブロックの置換 (BEGIN と END の間を「改行 + 伏せ字 + 改行」にする) の跡 */
const COLLAPSED_PRIVATE_KEY = /(-----BEGIN [A-Z ]*PRIVATE KEY-----)\n\[MASKED\]\n(-----END [A-Z ]*PRIVATE KEY-----)/g;
/**
 * maskCredentials が伏せた範囲を、元の文字列の位置で返す。
 * 伏せる処理は「元の文字列の一部を [MASKED] に置き換える」だけ (秘密鍵ブロックの改行を除く) なので、
 * 伏せた結果を [MASKED] で区切った各部分を元の文字列から順に探して位置を決める。
 * 区切りの部分は通常長い (次の伏せ字までの全文) ため位置は一意に決まり、最後に組み立て直して確かめる。
 * 対応づけられなければ null (呼び出し側は安全側に倒す)
 */
function maskedSpans(text, mode) {
    const masked = maskCredentials(text, mode).content.replace(COLLAPSED_PRIVATE_KEY, (_whole, begin, end) => `${begin}${MASK}${end}`);
    const segments = masked.split(MASK);
    const head = segments[0] ?? "";
    if (!text.startsWith(head))
        return null;
    const spans = [];
    let pos = head.length;
    let tokens = 0;
    let spanStart = pos;
    for (let j = 1; j < segments.length; j++) {
        const seg = segments[j] ?? "";
        tokens += 1;
        if (seg === "" && j < segments.length - 1) {
            // 伏せ字が隣り合う: 境目は決められないので 1 つの範囲にまとめる
            continue;
        }
        const end = j === segments.length - 1 ? text.length - seg.length : text.indexOf(seg, pos + 1);
        if (end <= pos || (j === segments.length - 1 && !text.endsWith(seg)))
            return null;
        spans.push({ start: spanStart, end, tokens });
        pos = end + seg.length;
        spanStart = pos;
        tokens = 0;
    }
    if (pos !== text.length && segments.length > 1)
        return null;
    if (segments.length === 1 && masked !== text)
        return null;
    return spans;
}
/**
 * 伏せた範囲を行ごとに当てはめる (行の数と位置は元のまま)。
 * 複数行にまたがる範囲は各行の該当部分をそれぞれ伏せる (行頭・行末の空白は残す)
 */
function linesFromSpans(lines, text, spans) {
    const out = [];
    let lineStart = 0;
    let k = 0;
    for (const line of lines) {
        const lineEnd = lineStart + line.length;
        while (k < spans.length && (spans[k]?.end ?? 0) <= lineStart)
            k += 1;
        let shown = "";
        const values = [];
        let separable = true;
        let wrapped = false;
        let cursor = lineStart;
        for (let j = k; j < spans.length; j++) {
            const span = spans[j];
            if (span === undefined || span.start >= lineEnd)
                break;
            let from = Math.max(span.start, lineStart);
            let to = Math.min(span.end, lineEnd);
            if (span.start < lineStart || span.end > lineEnd) {
                wrapped = true;
                while (from < to && /\s/.test(text.charAt(from)))
                    from += 1;
                while (to > from && /\s/.test(text.charAt(to - 1)))
                    to -= 1;
            }
            if (to <= from)
                continue;
            shown += text.slice(cursor, from) + MASK.repeat(span.tokens);
            if (span.tokens === 1)
                values.push(text.slice(from, to));
            else
                separable = false;
            cursor = to;
        }
        shown += text.slice(cursor, lineEnd);
        out.push({ text: shown, values: separable && !wrapped ? values : null, wrapped });
        lineStart = lineEnd + 1;
    }
    return out;
}
/** 重なる・接する範囲をまとめる (表示用。値は使わない) */
function mergeSpans(spans) {
    const sorted = [...spans].sort((a, b) => a.start - b.start);
    const merged = [];
    for (const span of sorted) {
        const last = merged[merged.length - 1];
        if (last !== undefined && span.start <= last.end) {
            last.end = Math.max(last.end, span.end);
        }
        else {
            merged.push({ start: span.start, end: span.end, tokens: 1 });
        }
    }
    return merged;
}
/**
 * AI に渡す抜粋のための伏せた表示 (行の数と位置は元のまま)。
 * slnmix のパックが取り得るどの伏せ方 (.vb を VB として / 汎用テキストとして、strict の有無) でも伏せられる範囲を
 * すべて伏せる。伏せた範囲を元の位置に対応づけられない伏せ方があれば、空行以外をすべて伏せる (安全側)
 */
/** 抜粋で伏せる範囲 (どの伏せ方でも伏せる範囲を合わせたもの)。対応づけられない伏せ方があれば null */
function displaySpans(text, options) {
    const all = [];
    // 厳格モードの結果は厳格でない結果を含むとは限らない(トークンの形式の判定の順番など)ため、
    // strict のときは両方の範囲を伏せる
    for (const mode of maskModes(options.path, (options.strict ?? true) ? [true, false] : [false])) {
        const spans = maskedSpans(text, mode);
        if (spans === null)
            return null;
        // 伏せた範囲が多いファイル (大きな埋め込み画像など) で引数の上限を超えないよう 1 つずつ足す
        for (const span of spans)
            all.push(span);
    }
    return mergeSpans(all);
}
function maskLinesForDisplay(lines, options) {
    const text = lines.join("\n");
    const spans = displaySpans(text, options);
    if (spans === null) {
        return lines.map((l) => (l.trim() === "" ? l : `${/^\s*/.exec(l)?.[0] ?? ""}${MASK}`));
    }
    return linesFromSpans(lines, text, spans).map((l) => l.text);
}
/**
 * 抜粋 (maskLinesForDisplay) で伏せる元の値 (行ごとに分け、前後の空白を除き、重複なし)。抜粋の外の
 * 文面 (ビルドエラーの本文など) に同じ値が出たときに伏せるため。対応づけられない伏せ方があれば null
 */
function maskedValuesForDisplay(lines, options) {
    const text = lines.join("\n");
    const spans = displaySpans(text, options);
    if (spans === null)
        return null;
    const values = new Set();
    for (const span of spans) {
        for (const part of text.slice(span.start, span.end).split("\n")) {
            const value = part.trim();
            if (value !== "" && value !== MASK)
                values.add(value);
        }
    }
    return [...values];
}
//# sourceMappingURL=credentialMasker.js.map