# 数据库迁移指南

## 版本历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v1.0 | 2026-07-17 | 初始版本：todos, todo_steps, status_history 表 |
| v1.1 | 2026-07-27 | 新增归档功能：todos.is_archived, todos.archived_at 列；新增 attachments 表 |

## 线上部署迁移

### 方式一：使用部署脚本（推荐）

```bash
# 在服务器上执行
cd /data/mytodolist
./deploy.sh
```

脚本会自动：
1. 备份当前数据库
2. 拉取最新代码
3. 执行数据库迁移
4. 重启服务

### 方式二：手动迁移

```bash
cd /data/mytodolist

# 1. 备份数据库
cp todo.db todo.db.bak.$(date +%Y%m%d_%H%M%S)

# 2. 拉取最新代码
git pull origin main

# 3. 执行迁移
python3 migrate_db.py

# 4. 重启服务
systemctl --user restart mytodolist.service
```

### 方式三：Docker 部署

如果使用 Docker，迁移会在容器启动时自动执行：

```dockerfile
CMD ["sh", "-c", "python3 migrate_db.py && python3 app.py"]
```

## 迁移脚本说明

`migrate_db.py` 是幂等的，可以安全重复执行：
- 已存在的列/表会跳过
- 不会删除已有数据结构
- v4（2026-08-21）例外：会将存量 todos.created_at 一次性 +8 小时（UTC→本地时间），由 schema_migrations 表记录，仅执行一次
- 自动检测当前数据库版本

## 回滚方案

如果迁移后出现问题，可以回滚：

```bash
# 1. 停止服务
systemctl --user stop mytodolist.service

# 2. 恢复备份
cp todo.db.bak.YYYYMMDD_HHMMSS todo.db

# 3. 回退代码（可选）
git checkout <previous_commit>

# 4. 重启服务
systemctl --user start mytodolist.service
```

## 注意事项

1. **部署前务必备份数据库**
2. 迁移脚本只添加新列/表，不会修改已有数据结构
3. 如果数据库很大，迁移可能需要几分钟
4. 迁移期间服务会短暂不可用
