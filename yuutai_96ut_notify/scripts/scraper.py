"""
scraper.py - 96ut.com 株主優待データ スクレイピングモジュール
"""

import logging
import re
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import urlencode

import requests
from bs4 import BeautifulSoup

# ログ設定
logger = logging.getLogger(__name__)

# 定数
BASE_URL = "https://96ut.com/yuutai/list.php"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
REQUEST_TIMEOUT = 30
WAIT_BETWEEN_REQUESTS = 1.5  # 秒
MAX_RETRIES = 3

# JST タイムゾーン
JST = timezone(timedelta(hours=9))


@dataclass
class YuutaiRow:
    """株主優待1銘柄のデータ"""
    code: str
    name: str
    rights_date: str
    yuutai_summary: str = ""
    lend_type: str = ""
    measures: str = ""
    saiyaku: str = ""
    source_url: str = ""


def get_jst_now() -> str:
    """現在時刻をJST文字列で返す"""
    return datetime.now(JST).strftime("%Y-%m-%d %H:%M:%S")


def create_session() -> requests.Session:
    """リクエスト用セッションを作成"""
    session = requests.Session()
    session.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
    })
    return session


def fetch_with_retry(session: requests.Session, url: str, max_retries: int = MAX_RETRIES) -> str:
    """リトライ付きでURLを取得"""
    last_error = None
    for attempt in range(max_retries):
        try:
            response = session.get(url, timeout=REQUEST_TIMEOUT)
            response.raise_for_status()
            response.encoding = response.apparent_encoding or 'utf-8'
            return response.text
        except requests.RequestException as e:
            last_error = e
            logger.warning(f"Attempt {attempt + 1}/{max_retries} failed for {url}: {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)  # Exponential backoff
    raise last_error


def fetch_terms(session: requests.Session) -> list[dict]:
    """
    list.php から権利日term一覧を取得

    Returns:
        [{"term": "0120", "label": "1月20日"}, ...]
    """
    logger.info("Fetching term list from %s", BASE_URL)
    html = fetch_with_retry(session, BASE_URL)
    soup = BeautifulSoup(html, 'lxml')

    terms = []
    seen = set()

    # ラジオボタンからterm値を取得
    radio_inputs = soup.find_all('input', {'type': 'radio'})

    for radio in radio_inputs:
        term = radio.get('value')
        if not term or term in seen:
            continue
        seen.add(term)

        # ラベルを探す（親要素やlabelタグから）
        label = term

        # label要素を探す
        label_for = soup.find('label', {'for': radio.get('id')})
        if label_for:
            label = label_for.get_text(strip=True)
        else:
            # 親要素からテキストを取得
            parent = radio.parent
            if parent:
                text = parent.get_text(strip=True)
                # 日付パターンを探す（例: "1月20日"）
                match = re.search(r'(\d{1,2}月\d{1,2}日?)', text)
                if match:
                    label = match.group(1)

        terms.append({
            "term": term,
            "label": label
        })

    if not terms:
        raise ValueError("No terms found in page. HTML structure may have changed.")

    logger.info("Found %d terms", len(terms))
    return terms


def parse_rights_date(soup: BeautifulSoup) -> Optional[str]:
    """ページから権利日を抽出（YYYY-MM-DD形式）"""
    # パターン: 「権利日：2025年1月20日」など
    text = soup.get_text()

    patterns = [
        r'権利日[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日',
        r'権利確定日[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日',
    ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            year, month, day = match.groups()
            return f"{year}-{int(month):02d}-{int(day):02d}"

    return None


def parse_stock_table(soup: BeautifulSoup, rights_date: str, source_url: str) -> list[YuutaiRow]:
    """銘柄テーブルをパース"""
    rows = []

    # テーブルを探す
    tables = soup.find_all('table')

    stock_table = None
    for table in tables:
        table_text = table.get_text()
        if 'コード' in table_text or '銘柄' in table_text:
            stock_table = table
            break

    if not stock_table:
        logger.warning("Stock table not found")
        return rows

    # ヘッダー行から列インデックスを特定
    header_row = stock_table.find('tr')
    if not header_row:
        return rows

    headers = []
    for cell in header_row.find_all(['th', 'td']):
        headers.append(cell.get_text(strip=True))

    # 列インデックスを特定
    col_map = {
        'code': -1,
        'name': -1,
        'yuutai_summary': -1,
        'lend_type': -1,
        'measures': -1,
        'saiyaku': -1,
    }

    for i, header in enumerate(headers):
        header_lower = header.lower()
        if 'コード' in header or 'code' in header_lower:
            col_map['code'] = i
        elif '銘柄名' in header or '銘柄' in header:
            col_map['name'] = i
        elif '優待' in header or '内容' in header:
            col_map['yuutai_summary'] = i
        elif '貸借' in header:
            col_map['lend_type'] = i
        elif '対策' in header or '規制' in header:
            col_map['measures'] = i
        elif '逆日歩' in header or '最逆' in header:
            col_map['saiyaku'] = i

    # フォールバック: 位置ベース
    if col_map['code'] == -1 and len(headers) >= 2:
        col_map['code'] = 0
        col_map['name'] = 1

    # データ行をパース
    data_rows = stock_table.find_all('tr')[1:]  # ヘッダー行をスキップ

    for tr in data_rows:
        cells = tr.find_all(['td', 'th'])
        if len(cells) < 2:
            continue

        def get_cell(idx):
            if 0 <= idx < len(cells):
                # リンクがあればそのテキストを取得
                link = cells[idx].find('a')
                if link:
                    return link.get_text(strip=True)
                return cells[idx].get_text(strip=True)
            return ""

        code = get_cell(col_map['code'])
        name = get_cell(col_map['name'])

        # コードが4桁数字でない場合はスキップ
        if not code or not re.match(r'^\d{4}$', code):
            continue

        row = YuutaiRow(
            code=code,
            name=name,
            rights_date=rights_date,
            yuutai_summary=get_cell(col_map['yuutai_summary']),
            lend_type=get_cell(col_map['lend_type']),
            measures=get_cell(col_map['measures']),
            saiyaku=get_cell(col_map['saiyaku']),
            source_url=source_url,
        )
        rows.append(row)

    return rows


def fetch_term_page(session: requests.Session, term: str) -> list[YuutaiRow]:
    """
    特定termのページを取得してパース

    Args:
        session: リクエストセッション
        term: term値（例: "0120"）

    Returns:
        YuutaiRowのリスト
    """
    params = {
        'term': term,
        'days': '0',
        'key_y': 'y',
    }
    url = f"{BASE_URL}?{urlencode(params)}"

    logger.info("Fetching term page: %s", term)
    html = fetch_with_retry(session, url)
    soup = BeautifulSoup(html, 'lxml')

    # 権利日を取得
    rights_date = parse_rights_date(soup)
    if not rights_date:
        logger.warning("Could not parse rights_date for term %s", term)
        return []

    # 銘柄テーブルをパース
    rows = parse_stock_table(soup, rights_date, url)
    logger.info("Found %d stocks for term %s (rights_date: %s)", len(rows), term, rights_date)

    return rows


def fetch_all_yuutai(progress_callback=None) -> dict:
    """
    全termの株主優待データを取得

    Args:
        progress_callback: 進捗コールバック関数 (current, total, term)

    Returns:
        {
            "status": "success",
            "data": [...],
            "meta": {...}
        }
    """
    session = create_session()
    all_rows = []
    processed_terms = []
    errors = []

    try:
        # term一覧を取得
        terms = fetch_terms(session)
        total = len(terms)

        # 各termを処理
        for i, term_info in enumerate(terms):
            term = term_info['term']

            if progress_callback:
                progress_callback(i + 1, total, term)

            # レート制限
            if i > 0:
                time.sleep(WAIT_BETWEEN_REQUESTS)

            try:
                rows = fetch_term_page(session, term)
                all_rows.extend(rows)
                processed_terms.append(term)
            except Exception as e:
                logger.error("Failed to fetch term %s: %s", term, e)
                errors.append({"term": term, "error": str(e)})
                continue

        # 重複除去（同一code + rights_date）
        seen = set()
        unique_rows = []
        for row in all_rows:
            key = f"{row.code}_{row.rights_date}"
            if key not in seen:
                seen.add(key)
                unique_rows.append(row)

        return {
            "status": "success",
            "data": [asdict(r) for r in unique_rows],
            "meta": {
                "total_count": len(unique_rows),
                "fetched_at": get_jst_now(),
                "terms_processed": processed_terms,
                "terms_total": total,
                "errors": errors if errors else None,
            }
        }

    except Exception as e:
        logger.exception("Failed to fetch yuutai data")
        return {
            "status": "error",
            "error": {
                "message": str(e),
                "code": "FETCH_ERROR",
            },
            "data": [asdict(r) for r in all_rows] if all_rows else [],
            "meta": {
                "fetched_at": get_jst_now(),
                "terms_processed": processed_terms,
            }
        }


if __name__ == "__main__":
    # CLIとして実行
    import json
    import sys

    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        stream=sys.stderr
    )

    def progress(current, total, term):
        print(f"Processing {current}/{total}: {term}", file=sys.stderr)

    result = fetch_all_yuutai(progress_callback=progress)
    print(json.dumps(result, ensure_ascii=False, indent=2))

    sys.exit(0 if result["status"] == "success" else 1)
