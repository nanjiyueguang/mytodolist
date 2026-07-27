#!/usr/bin/env python3
"""
数据库迁移脚本：旧版 todo.db → 新版（添加归档字段 + 附件表）

使用方法：
    cd /data/mytodolist
    python3 migrate_db.py

幂等设计：重复执行不会报错，已存在的列/表会跳过。
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'todo.db')

def migrate():
    print(f"📦 数据库路径: {DB_PATH}")
    
    if not os.path.exists(DB_PATH):
        print("❌ 数据库文件不存在，请先启动应用让 Flask 自动创建")
        return False
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    changes = []
    
    # === 1. 检查并添加 is_archived 列 ===
    cursor.execute("PRAGMA table_info(todos)")
    columns = [row[1] for row in cursor.fetchall()]
    
    if 'is_archived' not in columns:
        cursor.execute("ALTER TABLE todos ADD COLUMN is_archived BOOLEAN DEFAULT 0")
        changes.append("✅ 添加列: todos.is_archived")
    else:
        print("⏭️  列已存在: todos.is_archived")
    
    # === 2. 检查并添加 archived_at 列 ===
    if 'archived_at' not in columns:
        cursor.execute("ALTER TABLE todos ADD COLUMN archived_at DATETIME")
        changes.append("✅ 添加列: todos.archived_at")
    else:
        print("⏭️  列已存在: todos.archived_at")
    
    # === 3. 检查并创建 attachments 表 ===
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='attachments'")
    if not cursor.fetchone():
        cursor.execute("""
            CREATE TABLE attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                todo_id INTEGER NOT NULL,
                filename VARCHAR(255) NOT NULL,
                stored_name VARCHAR(255) NOT NULL,
                file_size INTEGER,
                mime_type VARCHAR(100),
                uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (todo_id) REFERENCES todos(id)
            )
        """)
        changes.append("✅ 创建表: attachments")
    else:
        print("⏭️  表已存在: attachments")
    
    conn.commit()
    conn.close()
    
    if changes:
        print(f"\n🎉 迁移完成！共 {len(changes)} 项变更：")
        for c in changes:
            print(f"   {c}")
    else:
        print("\n✅ 数据库已是最新版本，无需迁移")
    
    return True


if __name__ == '__main__':
    migrate()
