/**
 * parse_terms.js
 * n8n Codeノード用 - term（権利日）一覧の抽出
 *
 * 入力: HTTP Requestで取得した list.php のHTML ($input.first().json.data)
 * 出力: [{term, label}] の配列を items として返す
 *
 * n8n設定: Mode = "Run Once for All Items"
 */

// HTTP Requestの出力からHTMLを取得
const inputItem = $input.first();
if (!inputItem || !inputItem.json) {
  throw new Error('[parse_terms] 入力データがありません。HTTP Requestノードの出力を確認してください。');
}

// n8nのHTTP Request (Response Format: String) では .data にHTMLが入る
const html = inputItem.json.data || inputItem.json.body || inputItem.json;

if (typeof html !== 'string') {
  throw new Error('[parse_terms] HTMLが文字列ではありません。HTTP RequestのResponse FormatをStringに設定してください。型: ' + typeof html);
}

if (html.length < 100) {
  throw new Error('[parse_terms] HTMLが短すぎます（' + html.length + '文字）。取得に失敗した可能性があります。');
}

// ラジオボタンからterm値を抽出
// パターン: <input type="radio" ... value="..." ...>
const radioPattern = /<input[^>]*type\s*=\s*["']?radio["']?[^>]*>/gi;
const radioMatches = html.match(radioPattern);

if (!radioMatches || radioMatches.length === 0) {
  throw new Error('[parse_terms] ラジオボタン(input[type="radio"])が見つかりません。HTML構造が変更された可能性があります。HTMLの先頭200文字: ' + html.substring(0, 200));
}

const terms = [];
const seenTerms = new Set();

for (const radioTag of radioMatches) {
  // value属性を抽出
  const valueMatch = radioTag.match(/value\s*=\s*["']?([^"'\s>]+)["']?/i);
  if (!valueMatch) {
    continue; // valueがないラジオボタンはスキップ
  }

  const term = valueMatch[1];

  // 重複チェック
  if (seenTerms.has(term)) {
    continue;
  }
  seenTerms.add(term);

  // ラベルを抽出（近傍のテキストから）
  // ラジオボタンの周辺からラベルを探す
  let label = term; // デフォルトはterm値そのまま

  // ラジオボタンの位置を特定してその周辺を検索
  const radioIndex = html.indexOf(radioTag);
  if (radioIndex !== -1) {
    // ラジオボタンの前後100文字を検索範囲とする
    const contextStart = Math.max(0, radioIndex - 50);
    const contextEnd = Math.min(html.length, radioIndex + radioTag.length + 100);
    const context = html.substring(contextStart, contextEnd);

    // ラベルパターン: "1月20" や "12月末" など（M月D日 or M月末）
    const labelPattern = /(\d{1,2}月(?:\d{1,2}|末))/;
    const labelMatch = context.match(labelPattern);
    if (labelMatch) {
      label = labelMatch[1];
    }
  }

  terms.push({
    term: term,
    label: label
  });
}

if (terms.length === 0) {
  throw new Error('[parse_terms] term値を持つラジオボタンが見つかりません。ラジオボタン数: ' + radioMatches.length + '。最初のラジオボタン: ' + radioMatches[0]);
}

// 結果をn8n形式で返す（各termを個別のitemとして）
return terms.map(t => ({ json: t }));
