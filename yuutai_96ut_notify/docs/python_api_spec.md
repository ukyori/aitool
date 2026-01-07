# Python API 仕様

## 概要

n8n から呼び出される Python API/CLI の仕様。96ut.com から株主優待データを取得し、JSON形式で返す。

## 方式選択

### A. Web API 方式（推奨）

FastAPI / Flask 等で HTTP サーバーを立てる。

**メリット**:
- n8n の HTTP Request ノードで簡単に呼び出し可能
- リトライ設定が n8n 側で完結
- 複数ワークフローから共用可能

**デメリット**:
- 常時起動が必要（systemd / Docker）

### B. CLI 方式

Python スクリプトを直接実行し、stdout に JSON を出力。

**メリット**:
- シンプル、サーバー不要
- n8n の Execute Command ノードで実行

**デメリット**:
- エラーハンドリングがやや複雑
- 実行環境の依存関係管理

---

## API エンドポイント（Web API 方式）

### GET /yuutai/all

全権利日の株主優待データを取得。

#### リクエスト

```
GET /yuutai/all
```

#### レスポンス（成功）

```json
{
  "status": "success",
  "data": [
    {
      "code": "7201",
      "name": "日産自動車",
      "rights_date": "2025-03-31",
      "yuutai_summary": "クオカード1000円",
      "lend_type": "貸借",
      "measures": "",
      "saiyaku": "1.2円",
      "source_url": "https://96ut.com/yuutai/list.php?term=0331..."
    },
    ...
  ],
  "meta": {
    "total_count": 150,
    "fetched_at": "2025-01-07 06:30:00",
    "terms_processed": ["0120", "0131", "0228", ...]
  }
}
```

#### レスポンス（エラー）

```json
{
  "status": "error",
  "error": {
    "message": "Failed to fetch term page: 0331",
    "code": "FETCH_ERROR",
    "details": "Connection timeout"
  }
}
```

### GET /yuutai/term/{term}

特定の権利日のデータのみ取得（オプション）。

---

## CLI 方式

### 実行

```bash
python3 /path/to/fetch_yuutai.py
```

### 出力（stdout）

```json
{
  "status": "success",
  "data": [...],
  "meta": {...}
}
```

### 終了コード

| コード | 意味 |
|--------|------|
| 0 | 成功 |
| 1 | 一般エラー |
| 2 | ネットワークエラー |
| 3 | パースエラー |

---

## データフィールド

### 必須フィールド

| フィールド | 型 | 説明 | 例 |
|-----------|-----|------|-----|
| `code` | string | 銘柄コード (4桁) | `"7201"` |
| `name` | string | 銘柄名 | `"日産自動車"` |
| `rights_date` | string | 権利日 (YYYY-MM-DD) | `"2025-03-31"` |

### オプションフィールド

| フィールド | 型 | 説明 | 例 |
|-----------|-----|------|-----|
| `yuutai_summary` | string | 優待概要 | `"クオカード1000円"` |
| `lend_type` | string | 貸借区分 | `"貸借"` / `"非貸借"` |
| `measures` | string | 対策区分 | `"注意"` / `""` |
| `saiyaku` | string | 最大逆日歩 | `"1.2円"` |
| `source_url` | string | 取得元URL | URL文字列 |

---

## 実装ガイドライン

### 取得フロー

```
1. list.php から term 一覧を取得
2. 各 term について:
   a. 1-2秒 wait
   b. term ページを GET
   c. 権利日と銘柄一覧をパース
3. 全 term の結果を統合
4. JSON で返却
```

### エラーハンドリング

```python
try:
    # 取得処理
except requests.Timeout:
    return {"status": "error", "error": {"code": "TIMEOUT", "message": "..."}}
except ParseError as e:
    return {"status": "error", "error": {"code": "PARSE_ERROR", "message": str(e)}}
```

### 負荷対策

- **リクエスト間隔**: 各 term 取得の間に 1-2秒の待機
- **タイムアウト**: 1リクエストあたり 30秒
- **リトライ**: 3回まで、exponential backoff

### ログ

- stderr にログ出力（JSON出力を汚さない）
- ログレベル: INFO / WARNING / ERROR

---

## サンプル実装（雛形）

```python
#!/usr/bin/env python3
"""
fetch_yuutai.py - 株主優待データ取得スクリプト
"""

import json
import sys
import time
import re
from datetime import datetime
from typing import Any

import requests

BASE_URL = "https://96ut.com/yuutai/list.php"
USER_AGENT = "Mozilla/5.0 (compatible; yuutai-fetcher/1.0)"
REQUEST_TIMEOUT = 30
WAIT_BETWEEN_REQUESTS = 1.5


def get_jst_now() -> str:
    """現在時刻をJST文字列で返す"""
    from datetime import timezone, timedelta
    jst = timezone(timedelta(hours=9))
    return datetime.now(jst).strftime("%Y-%m-%d %H:%M:%S")


def fetch_terms(session: requests.Session) -> list[dict]:
    """term一覧を取得"""
    resp = session.get(BASE_URL, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    html = resp.text

    # ラジオボタンからterm抽出
    pattern = r'<input[^>]*type=["\']?radio["\']?[^>]*value=["\']?([^"\'>\s]+)["\']?'
    terms = re.findall(pattern, html, re.IGNORECASE)

    if not terms:
        raise ValueError("No terms found in page")

    return [{"term": t} for t in set(terms)]


def fetch_term_page(session: requests.Session, term: str) -> list[dict]:
    """特定termのページを取得してパース"""
    url = f"{BASE_URL}?term={term}&days=0&key_y=y"
    resp = session.get(url, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    html = resp.text

    # 権利日抽出
    date_match = re.search(r'権利日[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日', html)
    if not date_match:
        return []

    rights_date = f"{date_match[1]}-{date_match[2]:>02}-{date_match[3]:>02}"

    # 銘柄テーブルパース（簡易版）
    rows = []
    # TODO: 実際のHTML構造に合わせてパース実装

    return rows


def main() -> int:
    try:
        session = requests.Session()
        session.headers["User-Agent"] = USER_AGENT

        # term一覧取得
        terms = fetch_terms(session)

        all_rows = []
        processed_terms = []

        for term_info in terms:
            term = term_info["term"]
            time.sleep(WAIT_BETWEEN_REQUESTS)

            try:
                rows = fetch_term_page(session, term)
                all_rows.extend(rows)
                processed_terms.append(term)
            except Exception as e:
                print(f"Warning: Failed to fetch term {term}: {e}", file=sys.stderr)
                continue

        result = {
            "status": "success",
            "data": all_rows,
            "meta": {
                "total_count": len(all_rows),
                "fetched_at": get_jst_now(),
                "terms_processed": processed_terms
            }
        }

        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    except Exception as e:
        result = {
            "status": "error",
            "error": {
                "message": str(e),
                "code": "GENERAL_ERROR"
            }
        }
        print(json.dumps(result, ensure_ascii=False), file=sys.stdout)
        return 1


if __name__ == "__main__":
    sys.exit(main())
```

---

## n8n との連携

### HTTP Request ノード設定

```
Method: GET
URL: {{ $env.API_ENDPOINT }}/yuutai/all
Timeout: 120000
Response Format: JSON
```

### Execute Command ノード設定

```
Command: python3 {{ $env.SCRIPT_PATH }}
Timeout: 120000
```

出力は stdout から JSON として取得される。
