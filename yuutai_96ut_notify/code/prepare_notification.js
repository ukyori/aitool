/**
 * prepare_notification.js
 * n8n Codeノード用 - Discord通知メッセージを生成
 *
 * 入力: Detect Changes ノードの出力（差分情報）
 * 出力: Discord Webhook用のJSONペイロード
 *
 * n8n設定: Mode = "Run Once for All Items"
 */

// Detect Changesノードからデータを取得
const changesData = $('Detect Changes').first().json;
const summary = changesData.summary;
const fetchedAt = changesData.fetched_at;

const newItems = changesData.to_add || [];
const updatedItems = changesData.to_update || [];

// 新規追加の銘柄リスト（最大10件表示）
let newList = '';
if (newItems.length > 0) {
  const displayItems = newItems.slice(0, 10);
  newList = displayItems.map(r => `・${r.code} ${r.name} (${r.rights_date})`).join('\n');
  if (newItems.length > 10) {
    newList += `\n...他${newItems.length - 10}件`;
  }
}

// 更新の銘柄リスト（最大5件表示）
let updateList = '';
if (updatedItems.length > 0) {
  const displayItems = updatedItems.slice(0, 5);
  updateList = displayItems.map(r => `・${r.code} ${r.name}`).join('\n');
  if (updatedItems.length > 5) {
    updateList += `\n...他${updatedItems.length - 5}件`;
  }
}

// Discord Embed形式でメッセージ構築
const embed = {
  title: '株主優待データ更新',
  color: 3066993, // 緑色
  fields: [
    {
      name: '新規追加',
      value: summary.new_count + '件',
      inline: true
    },
    {
      name: '更新',
      value: summary.updated_count + '件',
      inline: true
    },
    {
      name: '取得日時',
      value: fetchedAt,
      inline: true
    }
  ],
  footer: {
    text: '96ut.com 株主優待同期'
  },
  timestamp: new Date().toISOString()
};

// 新規追加銘柄の詳細（あれば）
if (newList) {
  embed.fields.push({
    name: '新規追加銘柄',
    value: '```\n' + newList + '\n```',
    inline: false
  });
}

// 更新銘柄の詳細（あれば）
if (updateList) {
  embed.fields.push({
    name: '更新銘柄',
    value: '```\n' + updateList + '\n```',
    inline: false
  });
}

// 削除候補があれば警告
if (summary.possibly_deleted_count > 0) {
  embed.fields.push({
    name: '削除候補',
    value: `${summary.possibly_deleted_count}件（今回取得されず）`,
    inline: false
  });
}

return [{
  json: {
    content: null,  // メンションなし
    embeds: [embed]
  }
}];
