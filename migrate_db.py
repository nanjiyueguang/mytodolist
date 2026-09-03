#!/usr/bin/env python3
"""
数据库迁移脚本（统一版）

历史变更：
  v1: 添加归档字段（is_archived, archived_at）+ 附件表（attachments）
  v2: 添加排序字段（sort_order）
  v4: 存量 created_at 由 UTC 修正为本地时间（+8小时），与新建任务保持一致

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

    # 获取当前 todos 表列
    cursor.execute("PRAGMA table_info(todos)")
    columns = [row[1] for row in cursor.fetchall()]

    # === v1: 归档字段 ===
    if 'is_archived' not in columns:
        cursor.execute("ALTER TABLE todos ADD COLUMN is_archived BOOLEAN DEFAULT 0")
        changes.append("✅ 添加列: todos.is_archived")

    if 'archived_at' not in columns:
        cursor.execute("ALTER TABLE todos ADD COLUMN archived_at DATETIME")
        changes.append("✅ 添加列: todos.archived_at")

    # === v1: 附件表 ===
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

    # === v2: 排序字段 ===
    if 'sort_order' not in columns:
        cursor.execute("ALTER TABLE todos ADD COLUMN sort_order INTEGER DEFAULT 0")
        # 按创建时间设置初始排序值
        cursor.execute("""
            UPDATE todos
            SET sort_order = (
                SELECT COUNT(*)
                FROM todos t2
                WHERE t2.parent_id = todos.parent_id
                AND t2.created_at < todos.created_at
            )
        """)
        changes.append("✅ 添加列: todos.sort_order（含初始排序值）")

    # === v3: 聊天智能体表（由 SQLAlchemy create_all 自动创建，此处仅做检查提示） ===
    for table_name in ['chat_configs', 'report_templates', 'chat_messages']:
        cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'")
        if not cursor.fetchone():
            changes.append(f"⚠️  表 {table_name} 不存在，启动应用后会自动创建")

    # === v4: 存量 created_at 时区修正（UTC -> UTC+8）===
    # 应用现使用本地时间写入 created_at，历史数据为 UTC，统一 +8 小时
    cursor.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)")
    cursor.execute("SELECT 1 FROM schema_migrations WHERE version='v4_created_at_tz'")
    if not cursor.fetchone():
        cursor.execute("UPDATE todos SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL")
        cursor.execute("INSERT INTO schema_migrations (version) VALUES ('v4_created_at_tz')")
        changes.append(f"✅ 存量任务 created_at 时区修正（+8小时，共 {cursor.rowcount} 条）")

    # === v5: 任务笔记表（todo_notes）===
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='todo_notes'")
    if not cursor.fetchone():
        cursor.execute("""
            CREATE TABLE todo_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                todo_id INTEGER NOT NULL UNIQUE,
                content TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (todo_id) REFERENCES todos(id)
            )
        """)
        changes.append("✅ 创建表: todo_notes（任务 Markdown 笔记）")

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
