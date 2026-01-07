#!/bin/bash
# setup.sh - Python環境セットアップスクリプト
#
# 使い方:
#   cd /home/ubuntu/projects/aitool/yuutai_96ut_notify/scripts
#   chmod +x setup.sh
#   ./setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VENV_DIR="$PROJECT_DIR/venv"

echo "=== 株主優待API セットアップ ==="
echo "Project: $PROJECT_DIR"
echo "Venv: $VENV_DIR"
echo ""

# Python3 確認
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 not found"
    exit 1
fi

PYTHON_VERSION=$(python3 --version)
echo "Python: $PYTHON_VERSION"

# venv作成
if [ ! -d "$VENV_DIR" ]; then
    echo ""
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

# 依存関係インストール
echo ""
echo "Installing dependencies..."
"$VENV_DIR/bin/pip" install --upgrade pip
"$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements.txt"

echo ""
echo "=== セットアップ完了 ==="
echo ""
echo "次のステップ:"
echo ""
echo "1. APIをテスト起動:"
echo "   cd $SCRIPT_DIR"
echo "   $VENV_DIR/bin/python api.py"
echo ""
echo "2. CLIでテスト:"
echo "   $VENV_DIR/bin/python scraper.py"
echo ""
echo "3. systemd サービスとして登録:"
echo "   sudo cp $SCRIPT_DIR/yuutai-api.service /etc/systemd/system/"
echo "   sudo systemctl daemon-reload"
echo "   sudo systemctl enable yuutai-api"
echo "   sudo systemctl start yuutai-api"
echo ""
echo "4. 動作確認:"
echo "   curl http://127.0.0.1:8000/"
echo "   curl http://127.0.0.1:8000/yuutai/all"
echo ""
