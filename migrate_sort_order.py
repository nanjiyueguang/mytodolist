#!/usr/bin/env python3
"""数据库迁移脚本：为 todos 表添加 sort_order 列"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'todo.db')

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 检查是否已有 sort_order 列
    cursor.execute("PRAGMA table_info(todos)")
    columns = [row[1] for row in cursor.fetchall()]
    
    if 'sort_order' in columns:
        print("✅ sort_order 列已存在，无需迁移")
        conn.close()
        return
    
    print("📝 正在添加 sort_order 列...")
    cursor.execute("ALTER TABLE todos ADD COLUMN sort_order INTEGER DEFAULT 0")
    
    # 为现有任务设置初始排序值（按创建时间）
    cursor.execute("""
        UPDATE todos 
        SET sort_order = (
            SELECT COUNT(*) 
            FROM todos t2 
            WHERE t2.parent_id = todos.parent_id 
            AND t2.created_at < todos.created_at
        )
    """)
    
    conn.commit()
    conn.close()
    print("✅ 迁移完成！")

if __name__ == '__main__':
    migrate()
