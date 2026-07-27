#!/bin/bash
#
# TodoList 部署脚本
# 包含数据库迁移步骤
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 开始部署 TodoList..."

# 1. 备份当前数据库
if [ -f todo.db ]; then
    BACKUP_FILE="todo.db.bak.$(date +%Y%m%d_%H%M%S)"
    echo "📦 备份数据库 → $BACKUP_FILE"
    cp todo.db "$BACKUP_FILE"
fi

# 2. 拉取最新代码
echo "📥 拉取最新代码..."
git pull origin main

# 3. 安装依赖（如果有变化）
if [ -f requirements.txt ]; then
    echo "📦 检查依赖..."
    venv/bin/pip install -r requirements.txt -q
fi

# 4. 执行数据库迁移
echo "🔄 执行数据库迁移..."
venv/bin/python3 migrate_db.py

# 5. 重启服务
echo "🔄 重启服务..."
systemctl --user restart mytodolist.service

echo "✅ 部署完成！"
