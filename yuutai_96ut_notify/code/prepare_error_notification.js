/**
 * prepare_error_notification.js
 * n8n Codeノード用 - エラー通知メッセージを生成
 *
 * 入力: エラー発生ノードからの出力
 * 出力: Discord Webhook用のJSONペイロード（エラー通知）
 *
 * n8n設定: Mode = "Run Once for All Items"
 */

const errorData = $input.first().json;

// エラーメッセージを抽出
const errorMessage = errorData.error?.message
  || errorData.message
  || errorData.error
  || JSON.stringify(errorData);

// 現在時刻（JST）
const now = new Date();
const jstOffset = 9 * 60 * 60 * 1000;
const jstNow = new Date(now.getTime() + jstOffset);
const timestamp = jstNow.toISOString().replace('T', ' ').substring(0, 19);

// Discord Embed形式でエラーメッセージ構築
const embed = {
  title: '株主優待同期エラー',
  color: 15158332, // 赤色
  fields: [
    {
      name: 'エラー内容',
      value: '```\n' + errorMessage.substring(0, 500) + '\n```',
      inline: false
    },
    {
      name: '発生日時',
      value: timestamp,
      inline: true
    }
  ],
  footer: {
    text: '要確認: n8n Executions でログを確認してください'
  },
  timestamp: new Date().toISOString()
};

// エラーコードがあれば追加
if (errorData.error?.code) {
  embed.fields.push({
    name: 'エラーコード',
    value: errorData.error.code,
    inline: true
  });
}

return [{
  json: {
    content: '@here エラーが発生しました',  // メンションあり
    embeds: [embed]
  }
}];
