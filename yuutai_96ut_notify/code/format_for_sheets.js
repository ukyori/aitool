/**
 * format_for_sheets.js
 * n8n Codeノード用 - Python APIの出力をGoogle Sheets用に整形
 *
 * 入力: Python APIからのJSONレスポンス
 * 出力: Google Sheets用に整形された行データ
 *
 * n8n設定: Mode = "Run Once for All Items"
 */

const crypto = require('crypto');

/**
 * 行データからMD5ハッシュを生成（変更検出用）
 */
function generateHash(obj) {
  const source = [
    obj.code || '',
    obj.name || '',
    obj.rights_date || '',
    obj.yuutai_summary || '',
    obj.lend_type || '',
    obj.measures || '',
    obj.saiyaku || ''
  ].join('|');
  return crypto.createHash('md5').update(source).digest('hex').substring(0, 16);
}

/**
 * 現在時刻をJST文字列で取得
 */
function getJstNow() {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);
  return jstNow.toISOString().replace('T', ' ').substring(0, 19);
}

// メイン処理
const inputData = $input.first().json;

// Python APIの出力形式に対応
// { status: "success", data: [...], meta: {...} }
// または直接配列
const rows = inputData.data || inputData.rows || inputData;

if (!Array.isArray(rows)) {
  throw new Error('[format_for_sheets] 入力データが配列ではありません。型: ' + typeof rows + '。データ: ' + JSON.stringify(inputData).substring(0, 200));
}

const now = getJstNow();
const formattedRows = [];

for (const row of rows) {
  if (!row.code || !row.rights_date) {
    // 必須フィールドがない場合はスキップ
    continue;
  }

  const primaryKey = `${row.code}_${row.rights_date}`;
  const rowHash = generateHash(row);

  formattedRows.push({
    primary_key: primaryKey,
    code: row.code || '',
    name: row.name || '',
    rights_date: row.rights_date || '',
    yuutai_summary: row.yuutai_summary || row.summary || '',
    lend_type: row.lend_type || '',
    measures: row.measures || '',
    saiyaku: row.saiyaku || '',
    row_hash: rowHash,
    source_url: row.source_url || '',
    fetched_at: now
  });
}

if (formattedRows.length === 0) {
  throw new Error('[format_for_sheets] 有効な行データがありません。入力件数: ' + rows.length);
}

return [{
  json: {
    rows: formattedRows,
    total_count: formattedRows.length,
    fetched_at: now
  }
}];
