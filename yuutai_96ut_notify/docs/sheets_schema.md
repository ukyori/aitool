# Google Sheets 列設計

## シート: `優待一覧`

### 列構成

| 列 | フィールド名 | 型 | 説明 | 例 |
|----|-------------|-----|------|-----|
| A | `primary_key` | STRING | 主キー (code_rightsDate) | `7201_2025-03-31` |
| B | `code` | STRING | 銘柄コード (4桁) | `7201` |
| C | `name` | STRING | 銘柄名 | `日産自動車` |
| D | `rights_date` | DATE | 権利確定日 | `2025-03-31` |
| E | `yuutai_summary` | STRING | 優待概要 | `クオカード1000円` |
| F | `lend_type` | STRING | 貸借区分 | `貸借` |
| G | `measures` | STRING | 対策区分 (規制等) | `注意` |
| H | `saiyaku` | STRING | 最大逆日歩 | `1.2円` |
| I | `row_hash` | STRING | 内容ハッシュ (変更検出用) | `a1b2c3d4...` |
| J | `source_url` | STRING | 取得元URL | `https://96ut.com/...` |
| K | `fetched_at` | DATETIME | 取得日時 (JST) | `2025-01-07 06:30:00` |
| L | `updated_at` | DATETIME | 更新日時 (JST) | `2025-01-07 06:30:00` |
| M | `created_at` | DATETIME | 作成日時 (JST) | `2025-01-07 06:30:00` |

### 主キー設計

```
primary_key = {銘柄コード}_{権利確定日}
例: 7201_2025-03-31
```

- 同一銘柄でも権利日が異なれば別レコード
- 同一銘柄・同一権利日は1行に統合

### ハッシュ設計

変更検出用のハッシュは以下のフィールドから生成:

```
hash_source = code + name + rights_date + yuutai_summary + lend_type + measures + saiyaku
row_hash = MD5(hash_source)  // または SHA256 の先頭16文字
```

ハッシュが変わった = 内容に変更があった

---

## シート: `実行ログ` (オプション)

| 列 | フィールド名 | 型 | 説明 |
|----|-------------|-----|------|
| A | `execution_id` | STRING | n8n 実行ID |
| B | `executed_at` | DATETIME | 実行日時 |
| C | `status` | STRING | success / error |
| D | `total_rows` | NUMBER | 取得件数 |
| E | `new_count` | NUMBER | 新規追加数 |
| F | `updated_count` | NUMBER | 更新数 |
| G | `deleted_count` | NUMBER | 削除数 |
| H | `error_message` | STRING | エラー時のメッセージ |

---

## 初期設定手順

### 1. Google Sheets 作成

1. Google Drive で新規スプレッドシートを作成
2. シート名を `優待一覧` に変更
3. 1行目にヘッダーを入力:

```
primary_key	code	name	rights_date	yuutai_summary	lend_type	measures	saiyaku	row_hash	source_url	fetched_at	updated_at	created_at
```

### 2. Sheet ID 取得

URL から取得:
```
https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit
```

### 3. n8n Credential 設定

1. n8n で **Credentials** > **New** > **Google Sheets OAuth2**
2. Google Cloud Console で OAuth クライアント作成
3. n8n に設定して認証

---

## データフロー

```
Python API → n8n Code (format) → Google Sheets
                  │
                  ├─ primary_key 生成
                  ├─ row_hash 生成
                  └─ タイムスタンプ付与
```

### 新規レコード

- `created_at` = 現在時刻
- `updated_at` = 現在時刻

### 更新レコード

- `created_at` = 変更なし (既存値を保持)
- `updated_at` = 現在時刻

### 削除レコード

削除は行わず、別シートに移動 or フラグ管理 (オプション)

---

## 注意事項

- **API 制限**: Google Sheets API は 1分間に100リクエスト程度が目安
- **大量更新**: 1000行以上の更新は batchUpdate を推奨
- **日付形式**: `YYYY-MM-DD` で統一
- **文字数制限**: 1セルあたり 50,000文字まで
