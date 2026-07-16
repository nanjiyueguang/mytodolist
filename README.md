# Todo 任务管理系统

基于 Flask + SQLite 的 Web 端 Todo 任务管理工具，支持状态追踪和 Excel 导出。

## 功能特性

- ✅ 创建、编辑、删除任务
- 🔄 状态管理：待开始 → 进行中 → 暂挂 → 已完成/已取消
- 📊 完整记录状态变更历史（时间、原状态、新状态、备注）
- 🎯 优先级管理：高/中/低
- 🔍 按状态筛选任务
- 📥 按时间范围导出 Excel（包含任务列表和状态变更历史）
- 📤 支持从 Excel 模板批量导入任务
- 🌐 Web 界面，支持浏览器访问

## 技术栈

- **后端**: Python 3 + Flask
- **数据库**: SQLite
- **前端**: HTML5 + CSS3 + JavaScript
- **导出**: openpyxl (Excel)

## 安装部署

### 1. 安装 Python 3.10

```bash
cd /tmp
wget https://www.python.org/ftp/python/3.10.14/Python-3.10.14.tgz
tar -xzf Python-3.10.14.tgz
cd Python-3.10.14

# 安装编译依赖
sudo apt update
sudo apt install -y zlib1g-dev libncurses5-dev libgdbm-dev libnss3-dev libssl-dev libreadline-dev libffi-dev libsqlite3-dev libbz2-dev

# 编译安装（altinstall 不覆盖系统 python3）
./configure --enable-optimizations --prefix=/usr/local
make -j$(nproc)
sudo make altinstall

# 验证
python3.10 --version
```

### 2. 安装依赖

```bash
cd /data/mytodolist
python3.10 -m venv venv
source venv/bin/activate

# 离线安装（推荐）
pip install --no-index --find-links=offline-packages -r requirements.txt

# 或在线安装
pip install -r requirements.txt
```

### 3. 启动服务

```bash
python app.py
```

服务默认运行在 `http://0.0.0.0:5050`

### 4. 访问应用

在浏览器中打开：
- 本机访问：`http://localhost:5050`
- 局域网访问：`http://<服务器IP>:5050`

## 使用说明

### 创建任务
1. 在"新建任务"区域输入标题（必填）
2. 选择优先级（高/中/低）
3. 输入描述（可选）
4. 点击"创建任务"

### 变更状态
1. 点击任务卡片上的"变更状态"按钮
2. 选择新状态
3. 输入变更备注（可选）
4. 点击"确认"

### 查看历史
- 点击"历史"按钮查看该任务的所有状态变更记录
- 每条记录包含：原状态、新状态、变更时间、备注

### 筛选任务
- 点击顶部状态按钮筛选对应状态的任务
- "全部"显示所有任务

### 导出 Excel
1. 点击"导出Excel"按钮
2. 选择时间范围（可选）
3. 点击"确认导出"
4. 下载包含两个工作表的 Excel 文件：
   - Todo列表：任务基本信息
   - 状态变更历史：所有状态变更记录

### 导入任务
1. 点击"导入"按钮
2. 下载导入模板
3. 按模板格式填写任务数据
4. 选择文件并导入

## 文件结构

```
mytodolist/
├── app.py              # Flask 应用主程序
├── config.py           # 配置文件
├── models.py           # 数据库模型
├── requirements.txt    # Python 依赖
├── mytodolist.service  # systemd 服务配置
├── offline-packages/   # 离线安装包
├── todo.db            # SQLite 数据库（自动生成）
├── templates/
│   └── index.html     # HTML 模板
└── static/
    ├── css/
    │   └── style.css  # 样式文件
    └── js/
        └── app.js     # 前端脚本
```

## API 接口

### 获取任务列表
```
GET /api/todos
```

### 创建任务
```
POST /api/todos
Body: {
  "title": "任务标题",
  "description": "任务描述",
  "priority": "高|中|低"
}
```

### 更新任务
```
PUT /api/todos/<id>
Body: {
  "title": "新标题",
  "description": "新描述",
  "priority": "高|中|低"
}
```

### 变更状态
```
PUT /api/todos/<id>/status
Body: {
  "status": "进行中",
  "remark": "变更原因"
}
```

### 删除任务
```
DELETE /api/todos/<id>
```

### 导出 Excel
```
GET /api/todos/export?start_date=2026-01-01&end_date=2026-07-15
```

### 下载导入模板
```
GET /api/todos/template
```

### 导入任务
```
POST /api/todos/import
Body: multipart/form-data, file=<Excel文件>
```

## 生产环境部署

### 使用 Gunicorn（推荐）

```bash
pip3 install gunicorn
gunicorn -w 4 -b 0.0.0.0:5050 app:app
```

### 后台运行

```bash
nohup python3 app.py > todo.log 2>&1 &
```

或使用 systemd 服务管理。

### systemd 服务

```bash
# 复制服务文件
sudo cp mytodolist.service /etc/systemd/system/

# 启动服务
sudo systemctl daemon-reload
sudo systemctl enable mytodolist
sudo systemctl start mytodolist

# 查看状态
sudo systemctl status mytodolist
```

## 数据备份

数据库文件为 `todo.db`，定期备份此文件即可。

## 注意事项

- 首次运行会自动创建 `todo.db` 数据库文件
- 状态变更历史不可删除（随任务一起删除）
- 导出功能需要安装 openpyxl 依赖
- 离线安装包位于 `offline-packages/` 目录，适用于无网络环境
