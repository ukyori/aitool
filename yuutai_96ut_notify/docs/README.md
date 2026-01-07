# 株主優待通知システム - n8n セットアップガイド

## ワークフロー概要

96ut.com から株主優待情報を取得し、権利日の約40日前にGmailで通知する。

## ノード構成（順番）

```
1. Schedule Trigger
2. HTTP Request (base_list)
3. Code (parse_terms)
4. Split In Batches
5. Wait
6. HTTP Request (term_page)
7. Code (parse_term_page)
8. Code (collect_all)
9. Code (select_targets)
10. Code (dedupe_staticdata)
11. IF (hasTargets)
12. Gmail (send)
13. Code (update_staticdata)
```

---

## 各ノードの設定

### 1. Schedule Trigger

| 設定項目 | 値 |
|---------|-----|
| Trigger Times | 毎日 |
| Hour | 7 |
| Minute | 30 |
| Timezone | Asia/Tokyo |

### 2. HTTP Request (base_list)

| 設定項目 | 値 |
|---------|-----|
| Method | GET |
| URL | `https://96ut.com/yuutai/list.php` |
| Response Format | **String** (※重要: JSONではなくString/Textを選択) |
| Options > Headers | `User-Agent`: `Mozilla/5.0 (compatible; n8n-yuutai-notify/1.0)` |
| Options > Timeout | 30000 |
| Settings > On Error | Continue (エラー時も次へ) |

### 3. Code (parse_terms)

- **コード**: `code/parse_terms.js` の内容をコピペ
- **Mode**: Run Once for All Items

### 4. Split In Batches

| 設定項目 | 値 |
|---------|-----|
| Batch Size | 1 |

※ termを1件ずつ処理するため

### 5. Wait

| 設定項目 | 値 |
|---------|-----|
| Wait Time | 1〜2 (秒) |
| Unit | Seconds |

※ 96ut.com への負荷軽減

### 6. HTTP Request (term_page)

| 設定項目 | 値 |
|---------|-----|
| Method | GET |
| URL | `https://96ut.com/yuutai/list.php?term={{ $json.term }}&days=0&gdate={{ $now.format('yyyy-MM-dd') }}&key_y=y` |
| Response Format | **String** |
| Options > Headers | `User-Agent`: `Mozilla/5.0 (compatible; n8n-yuutai-notify/1.0)` |
| Options > Timeout | 30000 |

※ `{{ $json.term }}` は前ノードから渡されるterm値

### 7. Code (parse_term_page)

- **コード**: `code/parse_term_page.js` の内容をコピペ
- **Mode**: Run Once for Each Item

### 8. Code (collect_all)

Split In Batches の出力を集約する。Loop処理が終わった後のブランチに接続。

```javascript
// 全termのパース結果を集約
const allItems = $input.all();
return [{
  json: {
    all_results: allItems.map(item => item.json)
  }
}];
```

### 9. Code (select_targets)

- **コード**: `code/select_targets.js` の内容をコピペ
- **Mode**: Run Once for All Items

### 10. Code (dedupe_staticdata)

- **コード**: `code/dedupe_staticdata.js` の内容をコピペ
- **Mode**: Run Once for All Items

### 11. IF (hasTargets)

| 設定項目 | 値 |
|---------|-----|
| Condition | `{{ $json.should_send }}` equals `true` |

### 12. Gmail (send) - TRUE分岐のみ

| 設定項目 | 値 |
|---------|-----|
| Resource | Message |
| Operation | Send |
| To | `your-email@example.com` (n8n画面で設定) |
| Subject | `{{ $json.subject }}` |
| Email Type | HTML |
| Message | `{{ $json.html }}` |
| Credential | Gmail OAuth2 (事前設定必須) |

※ **重要**: メールアドレスはCredentialまたはここで直接設定。コードには含めない。

### 13. Code (update_staticdata) - Gmail送信後

送信完了後に Static Data を更新:

```javascript
// 送信した権利日をStatic Dataに記録
const staticData = $getWorkflowStaticData('global');
if (!staticData.sent_dates) {
  staticData.sent_dates = {};
}

const newDates = $json.new_dates || [];
const now = new Date().toISOString();

for (const d of newDates) {
  staticData.sent_dates[d] = now;
}

return [{ json: { updated: newDates, timestamp: now } }];
```

---

## Split In Batches のループ接続

Split In Batches は2つの出力を持つ:
1. **Loop** (上): 各バッチを処理 → Wait → HTTP Request → parse_term_page → Split In Batches に戻す
2. **Done** (下): 全バッチ完了後 → collect_all へ

```
Split In Batches
    ├─[Loop]→ Wait → HTTP Request → parse_term_page ─┐
    │                                                 │
    │←────────────────────────────────────────────────┘
    │
    └─[Done]→ collect_all → select_targets → ...
```

---

## Gmail Credential 設定

1. n8n 画面で **Credentials** → **New** → **Gmail OAuth2**
2. Google Cloud Console で OAuth 2.0 クライアントIDを作成
3. Redirect URI: `https://<your-n8n-domain>/rest/oauth2-credential/callback`
4. n8n に Client ID / Secret を入力して認証

---

## トラブルシューティング

### 実行ログの確認

1. n8n 画面左メニュー → **Executions**
2. 該当ワークフローの実行履歴を選択
3. 各ノードをクリックして入出力データを確認

### よくあるエラー

| エラー | 原因 | 対処 |
|--------|------|------|
| `Failed to extract terms` | HTML構造変更 | `fixtures/` にHTMLを保存してパターン確認 |
| `Failed to extract rights_date` | 権利日表示形式変更 | parse_term_page.js の正規表現を修正 |
| `HTTP Request timeout` | サーバー応答遅延 | Timeout値を増やす |
| Gmail送信エラー | Credential期限切れ | OAuth再認証 |

### HTML構造変更時の対応

1. HTTP Request ノードの出力を確認
2. HTMLを `fixtures/sample_list.html` 等に保存
3. 正規表現パターンを修正してテスト
4. 修正後の `code/*.js` をCodeノードに再コピペ

---

## 運用

### ワークフローのエクスポート

1. n8n 画面でワークフロー編集画面を開く
2. 右上メニュー → **Download**
3. `n8n/workflow.json` としてリポジトリに保存

```bash
# エクスポートしたJSONをリポジトリに保存
cp ~/Downloads/yuutai_notify_workflow.json \
   /home/ubuntu/projects/aitool/yuutai_96ut_notify/n8n/workflow.json
```

### Codeノードの更新手順

1. `code/*.js` を修正
2. n8n 画面で該当 Code ノードを開く
3. コード全体を選択して貼り替え
4. **Save** でワークフロー保存
5. 必要に応じてワークフローをエクスポート

---

## ファイル構成

```
yuutai_96ut_notify/
├── docs/
│   ├── requirements.md   # 要件定義
│   └── README.md         # このファイル
├── code/
│   ├── parse_terms.js       # term一覧パース
│   ├── parse_term_page.js   # termページパース
│   ├── select_targets.js    # 40日前±1日の抽出
│   ├── format_email.js      # メール本文生成
│   └── dedupe_staticdata.js # 重複送信防止
├── n8n/
│   └── workflow.json     # n8nワークフローエクスポート
└── fixtures/
    └── README.md         # サンプルHTML保存用
```

---

## 代替案: HTML Extract ノードの利用

正規表現パースが困難な場合、n8n の **HTML Extract** ノードを併用可能:

1. HTTP Request の後に HTML Extract を追加
2. CSS Selector で要素を抽出
3. Codeノードで後処理

例:
```
HTTP Request → HTML Extract → Code
```

HTML Extract 設定例:
- **Extraction Values**:
  - Key: `radios`, CSS Selector: `input[type="radio"]`, Return: `HTML`
  - Key: `table`, CSS Selector: `table.stock-list`, Return: `HTML`

※ ただし細かい属性取得には限界があるため、基本は正規表現パースを推奨。
