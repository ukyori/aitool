"""
api.py - 株主優待データ取得 FastAPI アプリケーション
"""

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse

from scraper import fetch_all_yuutai, fetch_terms, create_session, get_jst_now

# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# キャッシュ（簡易インメモリ）
_cache = {
    "data": None,
    "cached_at": None,
    "ttl_seconds": 3600,  # 1時間
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """アプリケーション起動/終了時の処理"""
    logger.info("Starting Yuutai API server")
    yield
    logger.info("Shutting down Yuutai API server")


app = FastAPI(
    title="株主優待データAPI",
    description="96ut.com から株主優待情報を取得するAPI",
    version="1.0.0",
    lifespan=lifespan,
)


def is_cache_valid() -> bool:
    """キャッシュが有効かどうか"""
    if _cache["data"] is None or _cache["cached_at"] is None:
        return False

    elapsed = (datetime.now(timezone.utc) - _cache["cached_at"]).total_seconds()
    return elapsed < _cache["ttl_seconds"]


@app.get("/")
async def root():
    """ヘルスチェック"""
    return {
        "status": "ok",
        "service": "yuutai-api",
        "timestamp": get_jst_now(),
    }


@app.get("/health")
async def health():
    """ヘルスチェック"""
    return {"status": "healthy"}


@app.get("/yuutai/all")
async def get_all_yuutai(force_refresh: bool = False):
    """
    全権利日の株主優待データを取得

    Args:
        force_refresh: キャッシュを無視して再取得

    Returns:
        {
            "status": "success",
            "data": [...],
            "meta": {...}
        }
    """
    # キャッシュチェック
    if not force_refresh and is_cache_valid():
        logger.info("Returning cached data")
        cached_data = _cache["data"].copy()
        cached_data["meta"]["from_cache"] = True
        return JSONResponse(content=cached_data)

    logger.info("Fetching fresh data from 96ut.com")

    try:
        result = fetch_all_yuutai()

        # キャッシュ更新（成功時のみ）
        if result["status"] == "success":
            _cache["data"] = result
            _cache["cached_at"] = datetime.now(timezone.utc)
            result["meta"]["from_cache"] = False

        return JSONResponse(content=result)

    except Exception as e:
        logger.exception("Failed to fetch yuutai data")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error": {
                    "message": str(e),
                    "code": "INTERNAL_ERROR",
                },
                "meta": {
                    "fetched_at": get_jst_now(),
                }
            }
        )


@app.get("/yuutai/terms")
async def get_terms():
    """
    権利日term一覧を取得

    Returns:
        [{"term": "0120", "label": "1月20日"}, ...]
    """
    try:
        session = create_session()
        terms = fetch_terms(session)
        return {
            "status": "success",
            "data": terms,
            "meta": {
                "count": len(terms),
                "fetched_at": get_jst_now(),
            }
        }
    except Exception as e:
        logger.exception("Failed to fetch terms")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/yuutai/cache/clear")
async def clear_cache():
    """キャッシュをクリア"""
    _cache["data"] = None
    _cache["cached_at"] = None
    return {"status": "ok", "message": "Cache cleared"}


@app.get("/yuutai/cache/status")
async def cache_status():
    """キャッシュ状態を確認"""
    if _cache["cached_at"] is None:
        return {
            "has_cache": False,
            "valid": False,
        }

    elapsed = (datetime.now(timezone.utc) - _cache["cached_at"]).total_seconds()
    return {
        "has_cache": True,
        "valid": is_cache_valid(),
        "cached_at": _cache["cached_at"].isoformat(),
        "elapsed_seconds": int(elapsed),
        "ttl_seconds": _cache["ttl_seconds"],
        "data_count": len(_cache["data"]["data"]) if _cache["data"] else 0,
    }


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))

    uvicorn.run(
        "api:app",
        host=host,
        port=port,
        reload=False,
        log_level="info",
    )
