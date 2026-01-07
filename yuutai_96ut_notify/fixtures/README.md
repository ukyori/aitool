# fixtures/ - サンプルHTML保存用

## 目的

96ut.com のHTML構造が変更された際のデバッグ用に、実際のHTMLレスポンスを保存する場所です。

## 保存すべきファイル

| ファイル名 | 内容 | 取得元 |
|-----------|------|--------|
| `sample_list.html` | term一覧ページ | `https://96ut.com/yuutai/list.php` |
| `sample_term_YYYYMMDD.html` | 特定権利日ページ | `list.php?term=...&days=0&key_y=y` |

## n8n からの保存方法

### 方法1: Executionsログから手動コピー

1. n8n 画面で **Executions** を開く
2. 該当の実行を選択
3. **HTTP Request** ノードをクリック
4. 出力の `data` フィールドからHTMLをコピー
5. ローカルでファイルに保存

### 方法2: 一時的なCodeノードを追加

デバッグ時に以下のCodeノードを HTTP Request の後に追加：

```javascript
// デバッグ用：HTMLをログ出力
const html = $json.data || '';
console.log('=== HTML START ===');
console.log(html.substring(0, 5000)); // 先頭5000文字
console.log('=== HTML END ===');
return $input.all();
```

### 方法3: curlで直接取得

```bash
# term一覧ページ
curl -A "Mozilla/5.0" "https://96ut.com/yuutai/list.php" \
  > fixtures/sample_list.html

# 特定権利日ページ（termは実際の値に置換）
curl -A "Mozilla/5.0" \
  "https://96ut.com/yuutai/list.php?term=0120&days=0&gdate=$(date +%Y-%m-%d)&key_y=y" \
  > fixtures/sample_term_0120.html
```

## 構造変更時の対応手順

1. **エラー発生**: n8n Executionsで失敗箇所を特定
2. **HTML保存**: 上記方法でHTMLを取得・保存
3. **差分確認**: 以前のHTMLと比較して変更点を特定
4. **コード修正**: `code/*.js` の正規表現等を修正
5. **テスト**: n8n で手動実行して動作確認
6. **コミット**: 修正をGitHubにpush

## ファイル命名規則

```
sample_list.html              # メインページ（最新）
sample_list_20250107.html     # メインページ（日付付きバックアップ）
sample_term_0120.html         # term=0120のページ
sample_term_0120_20250107.html # 日付付きバックアップ
```

## 注意事項

- HTMLファイルは **コミットしない** ことを推奨（サイズが大きい、更新頻度が高い）
- `.gitignore` に `fixtures/*.html` を追加済み（※必要に応じて）
- 必要な場合のみ、最小限のサンプルをコミット
