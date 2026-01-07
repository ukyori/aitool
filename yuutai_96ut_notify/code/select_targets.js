/**
 * select_targets.js
 * n8n Codeノード用 - 権利日が40日前±1日の銘柄を抽出
 *
 * 入力: 複数termページの結果を集約したitems (all_results配列)
 * 出力: 通知対象のみをまとめた1アイテム
 *
 * n8n設定: Mode = "Run Once for All Items"
 */

// 定数
const TARGET_DAYS_BEFORE = 40;  // 権利日の何日前を対象とするか
const WINDOW_DAYS = 1;          // ±何日の幅を許容するか

// 入力データを取得
const inputItem = $input.first();
if (!inputItem || !inputItem.json) {
  throw new Error('[select_targets] 入力データがありません。');
}

// collect_allからの出力形式に対応
const allResults = inputItem.json.all_results || [];

if (!Array.isArray(allResults)) {
  throw new Error('[select_targets] all_resultsが配列ではありません。型: ' + typeof allResults);
}

// 現在日時（JST）を取得
function getJstToday() {
  const now = new Date();
  // JSTはUTC+9
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);
  // YYYY-MM-DD形式
  return jstNow.toISOString().split('T')[0];
}

// 日付文字列から日数差を計算
function daysDiff(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1 + 'T00:00:00Z');
  const d2 = new Date(dateStr2 + 'T00:00:00Z');
  const diffMs = d1.getTime() - d2.getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

const todayJst = getJstToday();

// 対象となる権利日の範囲を計算
// 例: 今日が2025-01-07で、TARGET_DAYS_BEFORE=40, WINDOW_DAYS=1 なら
// 対象権利日は 2025-02-15 ～ 2025-02-17 (40日後 ±1日)
const minDays = TARGET_DAYS_BEFORE - WINDOW_DAYS;
const maxDays = TARGET_DAYS_BEFORE + WINDOW_DAYS;

// 対象日を計算してセットを作成
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

const targetDatesSet = new Set();
for (let d = minDays; d <= maxDays; d++) {
  targetDatesSet.add(addDays(todayJst, d));
}

// 結果を格納
const byDate = {};
const sourceUrls = new Set();

for (const result of allResults) {
  if (!result || !result.rights_date) {
    continue;
  }

  const rightsDate = result.rights_date;

  // 対象日かチェック
  if (!targetDatesSet.has(rightsDate)) {
    continue;
  }

  // 初期化
  if (!byDate[rightsDate]) {
    byDate[rightsDate] = {
      count: 0,
      rows: [],
      source_urls: []
    };
  }

  // 銘柄を追加
  if (result.rows && Array.isArray(result.rows)) {
    for (const row of result.rows) {
      byDate[rightsDate].rows.push(row);
      byDate[rightsDate].count++;
    }
  }

  // ソースURL
  if (result.source_url) {
    if (!byDate[rightsDate].source_urls.includes(result.source_url)) {
      byDate[rightsDate].source_urls.push(result.source_url);
    }
    sourceUrls.add(result.source_url);
  }
}

// 対象日リストと合計件数
const targetDates = Object.keys(byDate).sort();
let totalCount = 0;
for (const date of targetDates) {
  totalCount += byDate[date].count;
}

// 結果を返す
return [{
  json: {
    today_jst: todayJst,
    target_window: {
      days_before: TARGET_DAYS_BEFORE,
      window: WINDOW_DAYS,
      range: minDays + '〜' + maxDays + '日後'
    },
    target_dates: targetDates,
    total_count: totalCount,
    by_date: byDate,
    all_source_urls: Array.from(sourceUrls),
    has_targets: targetDates.length > 0 && totalCount > 0
  }
}];
