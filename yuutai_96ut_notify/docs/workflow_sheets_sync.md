# 株主優待 Google Sheets 同期ワークフロー

## 概要

96ut.com の株主優待データを定期取得し、Google Sheets に同期。差分があれば通知する。

## ノード構成

```
┌─────────────────────────────────────────────────────────────────────┐
│                         メインフロー                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [Schedule Trigger]                                                 │
│        │                                                            │
│        ▼                                                            │
│  [HTTP Request / Execute Command]  ← Python API/CLI 呼び出し        │
│        │                                                            │
│        ▼                                                            │
│  [IF: success?]                                                     │
│        │                                                            │
│   ┌────┴────┐                                                       │
│   ▼         ▼                                                       │
│ [成功]    [失敗] → [Error Notification]                             │
│   │                                                                 │
│   ▼                                                                 │
│  [Code: format_for_sheets]  ← データ整形・hash生成                   │
│        │                                                            │
│        ▼                                                            │
│  [Google Sheets: Get All]  ← 既存データ取得                          │
│        │                                                            │
│        ▼                                                            │
│  [Code: detect_changes]  ← 差分検出                                  │
│        │                                                            │
│        ▼                                                            │
│  [IF: has_changes?]                                                 │
│        │                                                            │
│   ┌────┴────┐                                                       │
│   ▼         ▼                                                       │
│ [変更あり] [変更なし] → [終了]                                       │
│   │                                                                 │
│   ▼                                                                 │
│  [Google Sheets: Update/Append]                                     │
│        │                                                            │
│        ▼                                                            │
│  [Discord/Email Notification]  ← 差分サマリー通知                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## ノード詳細

### 1. Schedule Trigger

| 設定 | 値 |
|------|-----|
| Trigger | Cron |
| Expression | `30 6 * * *` (毎日 06:30 JST) |

### 2. HTTP Request (Python API の場合)

| 設定 | 値 |
|------|-----|
| Method | GET |
| URL | `{{ $env.API_ENDPOINT }}/yuutai/all` |
| Timeout | 120000 (2分) |
| Retry on Fail | true |
| Max Retries | 3 |
| Retry Interval | 5000ms |

### 2'. Execute Command (CLI の場合)

| 設定 | 値 |
|------|-----|
| Command | `python3 {{ $env.SCRIPT_PATH }}` |
| Timeout | 120000 |

### 3. Code: format_for_sheets

データ整形とハッシュ生成を行う。

```javascript
// code/format_for_sheets.js を貼り付け
```

### 4. Google Sheets: Get All

| 設定 | 値 |
|------|-----|
| Operation | Read Rows |
| Document ID | `{{ $env.SHEET_ID }}` |
| Sheet Name | `優待一覧` |
| Return All | true |

### 5. Code: detect_changes

新規・更新・削除を検出する。

```javascript
// code/detect_changes.js を貼り付け
```

### 6. Google Sheets: Update (バッチ)

| 設定 | 値 |
|------|-----|
| Operation | Append or Update |
| Document ID | `{{ $env.SHEET_ID }}` |
| Sheet Name | `優待一覧` |
| Matching Column | `primary_key` |

### 7. Discord Webhook Notification

| 設定 | 値 |
|------|-----|
| Method | POST |
| URL | `{{ $env.DISCORD_WEBHOOK_URL }}` |
| Body | JSON (埋め込みメッセージ) |

### 8. Error Notification

エラー発生時に通知。同じく Discord/Email。

---

## 環境変数

n8n の Settings > Environment Variables で設定:

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `API_ENDPOINT` | Python API の URL | `http://localhost:8000` |
| `SCRIPT_PATH` | CLI スクリプトパス | `/home/ubuntu/projects/aitool/yuutai_96ut_notify/scripts/fetch_all.py` |
| `SHEET_ID` | Google Sheets ID | `1ABC...xyz` |
| `DISCORD_WEBHOOK_URL` | Discord Webhook URL | `https://discord.com/api/webhooks/...` |

---

## エラーハンドリング方針

### リトライ

| 段階 | リトライ | 間隔 |
|------|---------|------|
| HTTP Request | 3回 | 5秒 |
| Google Sheets | 2回 | 3秒 |

### タイムアウト

| 処理 | タイムアウト |
|------|-------------|
| Python API/CLI | 120秒 |
| Google Sheets API | 30秒 |

### エラー通知

- **即座に通知**: API失敗、認証エラー
- **通知内容**: エラーノード名、エラーメッセージ、実行ID、タイムスタンプ

### ログ

- n8n Executions で履歴確認可能
- 成功時も `execution_log` シートに記録（オプション）

---

## 運用

### 手動実行

n8n 画面で **Execute Workflow** ボタンをクリック。

### 一時停止

ワークフローを **Inactive** にする。

### 強制リフレッシュ

Google Sheets の全データをクリアして再取得する場合:
1. シートの A2 以降を削除
2. ワークフローを手動実行
