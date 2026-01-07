/**
 * detect_changes.js
 * n8n Codeノード用 - 新規・更新・削除を検出
 *
 * 入力:
 *   - Format for Sheets ノードの出力（新しいデータ）
 *   - Get Existing Data ノードの出力（既存データ）
 * 出力: 差分情報（追加/更新/削除候補）
 *
 * n8n設定: Mode = "Run Once for All Items"
 */

// 前ノードからデータを取得
// n8nではノード名でデータを参照できる
const newData = $('Format for Sheets').first().json;
const existingItems = $('Get Existing Data').all();

const newRows = newData.rows || [];
const existingMap = new Map();

// 既存データをMapに格納（primary_keyをキーとして）
for (const item of existingItems) {
  const key = item.json.primary_key;
  if (key) {
    existingMap.set(key, item.json);
  }
}

const toAdd = [];      // 新規追加
const toUpdate = [];   // 更新
const unchanged = [];  // 変更なし

const now = newData.fetched_at;

for (const row of newRows) {
  const existing = existingMap.get(row.primary_key);

  if (!existing) {
    // 新規追加（既存データに存在しない）
    toAdd.push({
      ...row,
      created_at: now,
      updated_at: now
    });
  } else if (existing.row_hash !== row.row_hash) {
    // 更新（ハッシュが異なる = 内容が変わった）
    toUpdate.push({
      ...row,
      created_at: existing.created_at || now,  // 既存のcreated_atを保持
      updated_at: now
    });
  } else {
    // 変更なし
    unchanged.push(row.primary_key);
  }

  // 処理済みとしてMapから削除
  existingMap.delete(row.primary_key);
}

// Mapに残っているのは削除候補（今回の取得で含まれなかったもの）
// 注意: 実際に削除するかは運用方針による
const possiblyDeleted = Array.from(existingMap.keys());

const hasChanges = toAdd.length > 0 || toUpdate.length > 0;

return [{
  json: {
    has_changes: hasChanges,
    summary: {
      new_count: toAdd.length,
      updated_count: toUpdate.length,
      unchanged_count: unchanged.length,
      possibly_deleted_count: possiblyDeleted.length
    },
    to_add: toAdd,
    to_update: toUpdate,
    possibly_deleted: possiblyDeleted,
    fetched_at: now
  }
}];
