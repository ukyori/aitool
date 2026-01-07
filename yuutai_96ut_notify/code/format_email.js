/**
 * format_email.js
 * n8n Codeノード用 - メール本文（HTML + TSV）を生成
 *
 * 入力: select_targets / dedupe_staticdata の出力
 * 出力: Gmailノードに渡せる {subject, html} 形式
 *
 * n8n設定: Mode = "Run Once for All Items"
 */

const inputItem = $input.first();
if (!inputItem || !inputItem.json) {
  throw new Error('[format_email] 入力データがありません。');
}

const data = inputItem.json;
const targetDates = data.target_dates || data.new_dates || [];
const byDate = data.by_date || {};
const totalCount = data.total_count || 0;
const todayJst = data.today_jst || new Date().toISOString().split('T')[0];

if (targetDates.length === 0) {
  // 対象なしの場合（通常はここに来る前にIFで分岐される）
  return [{
    json: {
      subject: '[株主優待] 対象銘柄なし - ' + todayJst,
      html: '<p>本日の対象銘柄はありません。</p>',
      should_send: false
    }
  }];
}

// 現在時刻（JST）
const now = new Date();
const jstOffset = 9 * 60 * 60 * 1000;
const jstNow = new Date(now.getTime() + jstOffset);
const fetchedAtJst = jstNow.toISOString().replace('T', ' ').substring(0, 19) + ' JST';

// TSV用のエスケープ関数
function escapeTsv(str) {
  if (str === null || str === undefined) {
    return '';
  }
  str = String(str);
  // タブ、改行、ダブルクォートをエスケープ
  if (str.includes('\t') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// HTML用のエスケープ関数
function escapeHtml(str) {
  if (str === null || str === undefined) {
    return '';
  }
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 件名を生成
let subject;
if (targetDates.length === 1) {
  subject = '[株主優待] ' + targetDates[0] + ' 権利日 - ' + totalCount + '件';
} else {
  subject = '[株主優待] ' + targetDates[0] + '他 権利日 - ' + totalCount + '件';
}

// HTMLメール本文を構築
const htmlParts = [];

// ヘッダー情報
htmlParts.push('<div style="font-family: sans-serif; font-size: 14px;">');
htmlParts.push('<h2>株主優待 通知</h2>');
htmlParts.push('<p>');
htmlParts.push('<strong>対象権利日:</strong> ' + escapeHtml(targetDates.join(', ')) + '<br>');
htmlParts.push('<strong>取得日時:</strong> ' + escapeHtml(fetchedAtJst) + '<br>');
htmlParts.push('<strong>取得元:</strong> <a href="https://96ut.com/yuutai/list.php">96ut.com</a><br>');
htmlParts.push('<strong>合計件数:</strong> ' + totalCount + '件');
htmlParts.push('</p>');

// TSVコピペ説明
htmlParts.push('<h3>TSVデータ（コピペ用）</h3>');
htmlParts.push('<p style="color: #666; font-size: 12px;">');
htmlParts.push('下記のTSVデータをExcel等に貼り付けできます。<br>');
htmlParts.push('&lt;pre&gt;タグ内のテキストを選択してコピーしてください。');
htmlParts.push('</p>');

// TSVヘッダー
const tsvHeaders = ['権利日', '銘柄コード', '銘柄名', '貸借', '対策', '最逆'];
const tsvLines = [tsvHeaders.join('\t')];

// 権利日ごとにセクション分け
for (const date of targetDates.sort()) {
  const dateData = byDate[date];
  if (!dateData) {
    continue;
  }

  htmlParts.push('<h3>' + escapeHtml(date) + ' (' + dateData.count + '件)</h3>');

  // ソースURL
  if (dateData.source_urls && dateData.source_urls.length > 0) {
    htmlParts.push('<p style="font-size: 12px; color: #666;">');
    htmlParts.push('取得元: ');
    for (let i = 0; i < dateData.source_urls.length; i++) {
      if (i > 0) htmlParts.push(', ');
      htmlParts.push('<a href="' + escapeHtml(dateData.source_urls[i]) + '">URL' + (i + 1) + '</a>');
    }
    htmlParts.push('</p>');
  }

  // HTMLテーブル
  htmlParts.push('<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; font-size: 13px;">');
  htmlParts.push('<thead style="background-color: #f0f0f0;">');
  htmlParts.push('<tr>');
  htmlParts.push('<th>銘柄コード</th>');
  htmlParts.push('<th>銘柄名</th>');
  htmlParts.push('<th>貸借</th>');
  htmlParts.push('<th>対策</th>');
  htmlParts.push('<th>最逆</th>');
  htmlParts.push('</tr>');
  htmlParts.push('</thead>');
  htmlParts.push('<tbody>');

  const rows = dateData.rows || [];
  for (const row of rows) {
    htmlParts.push('<tr>');
    htmlParts.push('<td>' + escapeHtml(row.code) + '</td>');
    htmlParts.push('<td>' + escapeHtml(row.name) + '</td>');
    htmlParts.push('<td>' + escapeHtml(row.lend_type) + '</td>');
    htmlParts.push('<td>' + escapeHtml(row.measures) + '</td>');
    htmlParts.push('<td>' + escapeHtml(row.saiyaku) + '</td>');
    htmlParts.push('</tr>');

    // TSV行を追加
    tsvLines.push([
      escapeTsv(row.rights_date),
      escapeTsv(row.code),
      escapeTsv(row.name),
      escapeTsv(row.lend_type),
      escapeTsv(row.measures),
      escapeTsv(row.saiyaku)
    ].join('\t'));
  }

  htmlParts.push('</tbody>');
  htmlParts.push('</table>');
  htmlParts.push('<br>');
}

// TSVデータを<pre>で埋め込み
htmlParts.push('<h3>TSVデータ</h3>');
htmlParts.push('<pre style="background-color: #f5f5f5; padding: 10px; border: 1px solid #ddd; overflow-x: auto; font-size: 12px;">');
htmlParts.push(escapeHtml(tsvLines.join('\n')));
htmlParts.push('</pre>');

// フッター
htmlParts.push('<hr style="margin-top: 20px;">');
htmlParts.push('<p style="font-size: 11px; color: #999;">');
htmlParts.push('この通知は n8n による自動送信です。<br>');
htmlParts.push('データ取得元: <a href="https://96ut.com/yuutai/list.php">96ut.com</a>');
htmlParts.push('</p>');
htmlParts.push('</div>');

const html = htmlParts.join('\n');

return [{
  json: {
    subject: subject,
    html: html,
    target_dates: targetDates,
    total_count: totalCount,
    new_dates: data.new_dates || targetDates,
    should_send: true
  }
}];
