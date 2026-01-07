/**
 * dedupe_staticdata.js
 * n8n Codeノード用 - Workflow Static Data を使った重複送信防止
 *
 * 入力: select_targets の出力（target_dates, by_date等）
 * 出力: 未送信の権利日のみを含む {should_send, new_dates, already_sent, ...}
 *
 * n8n設定: Mode = "Run Once for All Items"
 *
 * 【Static Data について】
 * - $getWorkflowStaticData('global') でワークフロー全体で共有されるデータを取得
 * - このデータはワークフロー実行間で永続化される
 * - sent_dates = { "2025-02-15": "2025-01-07T07:30:00.000Z", ... } の形式で記録
 *
 * 【重要】
 * - このノードでは Static Data の読み取りと判定のみ行う
 * - 書き込み（送信済み記録）は Gmail 送信後の別ノードで行う
 * - これにより、送信失敗時に誤って送信済みマークされることを防ぐ
 */

const inputItem = $input.first();
if (!inputItem || !inputItem.json) {
  throw new Error('[dedupe_staticdata] 入力データがありません。');
}

const data = inputItem.json;
const targetDates = data.target_dates || [];
const byDate = data.by_date || {};
const totalCount = data.total_count || 0;

// Workflow Static Data を取得
const staticData = $getWorkflowStaticData('global');

// sent_dates が未初期化なら空オブジェクトで初期化
if (!staticData.sent_dates) {
  staticData.sent_dates = {};
}

const sentDates = staticData.sent_dates;

// 送信済み・未送信を分類
const newDates = [];
const alreadySent = [];

for (const date of targetDates) {
  if (sentDates[date]) {
    alreadySent.push({
      date: date,
      sent_at: sentDates[date]
    });
  } else {
    newDates.push(date);
  }
}

// 未送信の権利日がある場合のみ送信対象
const shouldSend = newDates.length > 0;

// 未送信分のみのby_dateを構築
const newByDate = {};
let newTotalCount = 0;
for (const date of newDates) {
  if (byDate[date]) {
    newByDate[date] = byDate[date];
    newTotalCount += byDate[date].count || 0;
  }
}

// 結果を返す
// format_email.js はこの出力を受け取る
return [{
  json: {
    // 送信判定
    should_send: shouldSend,

    // 未送信の権利日
    new_dates: newDates,
    new_count: newTotalCount,

    // 送信済みの権利日
    already_sent: alreadySent,

    // 未送信分のみのデータ（format_emailで使用）
    target_dates: newDates,
    by_date: newByDate,
    total_count: newTotalCount,
    today_jst: data.today_jst,
    all_source_urls: data.all_source_urls,

    // デバッグ用
    debug: {
      original_target_dates: targetDates,
      original_total_count: totalCount,
      static_data_sent_dates: Object.keys(sentDates)
    }
  }
}];

/**
 * 【送信後の Static Data 更新方法】
 *
 * Gmail送信後のCodeノードに以下を貼り付け：
 *
 * ```javascript
 * const staticData = $getWorkflowStaticData('global');
 * if (!staticData.sent_dates) {
 *   staticData.sent_dates = {};
 * }
 *
 * const newDates = $json.new_dates || [];
 * const now = new Date().toISOString();
 *
 * for (const d of newDates) {
 *   staticData.sent_dates[d] = now;
 * }
 *
 * return [{ json: { updated: newDates, timestamp: now } }];
 * ```
 *
 * 【Static Data のリセット方法】
 *
 * テスト時などに送信済み記録をクリアしたい場合：
 *
 * ```javascript
 * const staticData = $getWorkflowStaticData('global');
 * staticData.sent_dates = {};
 * return [{ json: { message: 'Static data cleared' } }];
 * ```
 *
 * または n8n の Settings > Static Data からJSONを直接編集
 */
