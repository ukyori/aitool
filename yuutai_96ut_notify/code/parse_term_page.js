/**
 * parse_term_page.js
 * n8n Codeノード用 - termページから権利日と銘柄一覧を抽出
 *
 * 入力: HTTP Requestで取得したtermページHTML + 前ノードからのterm/label
 * 出力: {term, label, rights_date, rows[], source_url, fetched_at_jst}
 *
 * n8n設定: Mode = "Run Once for Each Item"
 */

const inputItem = $input.first();
if (!inputItem || !inputItem.json) {
  throw new Error('[parse_term_page] 入力データがありません。');
}

// 前ノードからのterm/labelを取得（Split In Batchesから渡される）
// HTTP Requestの結果は $json.data に、元のterm情報は別途保持されている想定
// n8nの構造によって調整が必要な場合あり
const json = inputItem.json;
const html = json.data || json.body || '';
const term = json.term || $('Code (parse_terms)').first().json.term || '';
const label = json.label || $('Code (parse_terms)').first().json.label || term;

if (typeof html !== 'string' || html.length < 100) {
  throw new Error('[parse_term_page] HTMLが取得できていません。term=' + term + ', HTML長=' + (html ? html.length : 0));
}

// 現在時刻（JST）
const now = new Date();
const jstOffset = 9 * 60 * 60 * 1000;
const jstNow = new Date(now.getTime() + jstOffset);
const fetchedAtJst = jstNow.toISOString().replace('T', ' ').substring(0, 19) + ' JST';

// ソースURL
const sourceUrl = 'https://96ut.com/yuutai/list.php?term=' + encodeURIComponent(term) + '&days=0&key_y=y';

// 権利日を抽出（「権利日：YYYY年MM月DD日」または「権利日:YYYY年MM月DD日」）
const rightsDatePattern = /権利日\s*[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/;
const rightsDateMatch = html.match(rightsDatePattern);

if (!rightsDateMatch) {
  throw new Error('[parse_term_page] 権利日が見つかりません。term=' + term + '。パターン「権利日：YYYY年MM月DD日」を探しましたが見つかりませんでした。HTML先頭500文字: ' + html.substring(0, 500));
}

const year = rightsDateMatch[1];
const month = rightsDateMatch[2].padStart(2, '0');
const day = rightsDateMatch[3].padStart(2, '0');
const rightsDate = year + '-' + month + '-' + day;

// 銘柄一覧テーブルを抽出
// テーブルを探す（<table>タグ）
const tablePattern = /<table[^>]*>([\s\S]*?)<\/table>/gi;
const tables = [];
let tableMatch;
while ((tableMatch = tablePattern.exec(html)) !== null) {
  tables.push(tableMatch[0]);
}

if (tables.length === 0) {
  throw new Error('[parse_term_page] テーブルが見つかりません。term=' + term);
}

// 銘柄テーブルを特定（「銘柄コード」または「コード」を含むテーブル）
let stockTable = null;
for (const table of tables) {
  if (table.includes('銘柄コード') || table.includes('コード') || table.includes('銘柄名')) {
    stockTable = table;
    break;
  }
}

if (!stockTable) {
  // 見つからない場合は最大のテーブルを使用
  stockTable = tables.reduce((a, b) => a.length > b.length ? a : b);
}

// テーブルの行を抽出
const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
const rows = [];
let rowMatch;
while ((rowMatch = rowPattern.exec(stockTable)) !== null) {
  rows.push(rowMatch[1]);
}

if (rows.length < 2) {
  throw new Error('[parse_term_page] テーブル行が少なすぎます（' + rows.length + '行）。term=' + term);
}

// ヘッダー行から列インデックスを特定
const headerRow = rows[0];
const headerCellPattern = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
const headers = [];
let headerMatch;
while ((headerMatch = headerCellPattern.exec(headerRow)) !== null) {
  // HTMLタグを除去してテキストのみ取得
  const text = headerMatch[1].replace(/<[^>]+>/g, '').trim();
  headers.push(text);
}

// 列インデックスを特定（柔軟なマッチング）
function findColumnIndex(headers, patterns) {
  for (let i = 0; i < headers.length; i++) {
    for (const pattern of patterns) {
      if (headers[i].includes(pattern)) {
        return i;
      }
    }
  }
  return -1;
}

const colIndexes = {
  code: findColumnIndex(headers, ['コード', '銘柄コード', 'code']),
  name: findColumnIndex(headers, ['銘柄名', '銘柄', '企業名', 'name']),
  lend_type: findColumnIndex(headers, ['貸借', '貸借区分']),
  measures: findColumnIndex(headers, ['対策', '規制', '信用規制']),
  saiyaku: findColumnIndex(headers, ['最逆', '逆日歩', '最大逆日歩'])
};

// 最低限、コードと銘柄名は必須
if (colIndexes.code === -1 && colIndexes.name === -1) {
  // 列名ベースで見つからない場合、位置ベースでフォールバック
  // 一般的な構成: コード(0), 銘柄名(1), ...
  colIndexes.code = 0;
  colIndexes.name = 1;
}

// データ行をパース
const stockRows = [];
for (let i = 1; i < rows.length; i++) {
  const cellPattern = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
  const cells = [];
  let cellMatch;
  while ((cellMatch = cellPattern.exec(rows[i])) !== null) {
    // HTMLタグを除去、ただしリンクのテキストは保持
    let text = cellMatch[1];
    // <a>タグ内のテキストを抽出
    const linkMatch = text.match(/<a[^>]*>([^<]*)<\/a>/i);
    if (linkMatch) {
      text = linkMatch[1];
    }
    text = text.replace(/<[^>]+>/g, '').trim();
    // HTML実体参照をデコード
    text = text.replace(/&nbsp;/g, ' ')
               .replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&quot;/g, '"');
    cells.push(text);
  }

  if (cells.length === 0) {
    continue; // 空行スキップ
  }

  // データを抽出
  const getValue = (idx) => (idx >= 0 && idx < cells.length) ? cells[idx] : '';

  const code = getValue(colIndexes.code);
  const name = getValue(colIndexes.name);

  // コードが空または数字でない場合はスキップ（ヘッダー行の残りなど）
  if (!code || !/^\d{4}$/.test(code)) {
    continue;
  }

  stockRows.push({
    rights_date: rightsDate,
    code: code,
    name: name,
    lend_type: getValue(colIndexes.lend_type),
    measures: getValue(colIndexes.measures),
    saiyaku: getValue(colIndexes.saiyaku)
  });
}

if (stockRows.length === 0) {
  // 銘柄が0件でもエラーにはしない（その権利日に対象銘柄がない可能性）
  // ただしログ用に情報は残す
}

return [{
  json: {
    term: term,
    label: label,
    rights_date: rightsDate,
    rows: stockRows,
    row_count: stockRows.length,
    source_url: sourceUrl,
    fetched_at_jst: fetchedAtJst,
    headers_found: headers
  }
}];
