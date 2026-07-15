from flask import Flask, render_template, request, jsonify, send_file
from models import db, Todo, TodoStep, StatusHistory
from config import Config
from datetime import datetime, timedelta
import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from io import BytesIO

app = Flask(__name__)
app.config.from_object(Config)

db.init_app(app)
with app.app_context():
    db.create_all()

# ============ 页面路由 ============

@app.route('/')
def index():
    return render_template('index.html')

# ============ Todo API ============

@app.route('/api/todos', methods=['GET'])
def get_todos():
    """获取顶层任务列表（树状）"""
    todos = Todo.query.filter_by(parent_id=None).order_by(Todo.created_at.desc()).all()
    return jsonify([t.to_dict() for t in todos])

@app.route('/api/todos', methods=['POST'])
def create_todo():
    """创建任务（可指定 parent_id 创建子任务）"""
    data = request.json
    if not data.get('title'):
        return jsonify({'error': '标题不能为空'}), 400
    
    todo = Todo(
        title=data['title'],
        description=data.get('description', ''),
        priority=data.get('priority', '中'),
        parent_id=data.get('parent_id'),
        start_date=datetime.strptime(data['start_date'], '%Y-%m-%d').date() if data.get('start_date') else None,
        end_date=datetime.strptime(data['end_date'], '%Y-%m-%d').date() if data.get('end_date') else None,
    )
    db.session.add(todo)
    db.session.flush()
    
    history = StatusHistory(todo_id=todo.id, old_status=None, new_status='待开始', remark='创建任务')
    db.session.add(history)
    db.session.commit()
    
    return jsonify(todo.to_dict()), 201

@app.route('/api/todos/<int:todo_id>', methods=['GET'])
def get_todo(todo_id):
    """获取单个任务详情"""
    todo = Todo.query.get_or_404(todo_id)
    return jsonify(todo.to_dict())

@app.route('/api/todos/<int:todo_id>', methods=['PUT'])
def update_todo(todo_id):
    """更新任务"""
    todo = Todo.query.get_or_404(todo_id)
    data = request.json
    
    todo.title = data.get('title', todo.title)
    todo.description = data.get('description', todo.description)
    todo.priority = data.get('priority', todo.priority)
    todo.progress = data.get('progress', todo.progress)
    
    if data.get('start_date'):
        todo.start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date()
    elif 'start_date' in data:
        todo.start_date = None
    
    if data.get('end_date'):
        todo.end_date = datetime.strptime(data['end_date'], '%Y-%m-%d').date()
    elif 'end_date' in data:
        todo.end_date = None
    
    todo.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(todo.to_dict())

@app.route('/api/todos/<int:todo_id>/status', methods=['PUT'])
def update_status(todo_id):
    """更新任务状态"""
    todo = Todo.query.get_or_404(todo_id)
    data = request.json
    new_status = data.get('status')
    remark = data.get('remark', '')
    
    if new_status not in Config.STATUS_OPTIONS:
        return jsonify({'error': '无效的状态'}), 400
    
    old_status = todo.status
    todo.status = new_status
    todo.updated_at = datetime.utcnow()
    
    # 完成时自动设置进度100%
    if new_status == '已完成':
        todo.progress = 100
    
    history = StatusHistory(todo_id=todo.id, old_status=old_status, new_status=new_status, remark=remark)
    db.session.add(history)
    db.session.commit()
    return jsonify(todo.to_dict())

@app.route('/api/todos/<int:todo_id>', methods=['DELETE'])
def delete_todo(todo_id):
    """删除任务（递归删除子任务）"""
    todo = Todo.query.get_or_404(todo_id)
    _delete_recursive(todo)
    db.session.commit()
    return jsonify({'message': '删除成功'})

def _delete_recursive(todo):
    """递归删除任务及子任务"""
    for child in todo.children.all():
        _delete_recursive(child)
    StatusHistory.query.filter_by(todo_id=todo.id).delete()
    TodoStep.query.filter_by(todo_id=todo.id).delete()
    db.session.delete(todo)

# ============ Step API ============

@app.route('/api/todos/<int:todo_id>/steps', methods=['POST'])
def add_step(todo_id):
    """添加步骤"""
    todo = Todo.query.get_or_404(todo_id)
    data = request.json
    
    if not data.get('title'):
        return jsonify({'error': '步骤标题不能为空'}), 400
    
    max_order = db.session.query(db.func.max(TodoStep.order)).filter_by(todo_id=todo_id).scalar() or 0
    
    step = TodoStep(
        todo_id=todo_id,
        title=data['title'],
        order=max_order + 1
    )
    db.session.add(step)
    db.session.commit()
    return jsonify(step.to_dict()), 201

@app.route('/api/steps/<int:step_id>', methods=['PUT'])
def update_step(step_id):
    """更新步骤（标题/完成状态）"""
    step = TodoStep.query.get_or_404(step_id)
    data = request.json
    
    if 'title' in data:
        step.title = data['title']
    if 'completed' in data:
        step.completed = data['completed']
        step.completed_at = datetime.utcnow() if data['completed'] else None
    if 'order' in data:
        step.order = data['order']
    
    db.session.commit()
    
    # 自动更新父任务的进度
    _auto_update_progress(step.todo_id)
    
    return jsonify(step.to_dict())

@app.route('/api/steps/<int:step_id>', methods=['DELETE'])
def delete_step(step_id):
    """删除步骤"""
    step = TodoStep.query.get_or_404(step_id)
    todo_id = step.todo_id
    db.session.delete(step)
    db.session.commit()
    _auto_update_progress(todo_id)
    return jsonify({'message': '删除成功'})

def _auto_update_progress(todo_id):
    """根据步骤完成情况自动更新任务进度"""
    todo = Todo.query.get(todo_id)
    if todo:
        stats = todo.get_step_stats()
        if stats['total'] > 0:
            todo.progress = stats['percent']
            db.session.commit()

# ============ 甘特图 API ============

@app.route('/api/gantt', methods=['GET'])
def get_gantt_data():
    """获取甘特图数据（扁平化所有任务）"""
    todos = Todo.query.filter(
        Todo.start_date.isnot(None),
        Todo.end_date.isnot(None)
    ).order_by(Todo.start_date).all()
    
    result = []
    for t in todos:
        result.append({
            'id': t.id,
            'parent_id': t.parent_id,
            'title': t.title,
            'status': t.status,
            'priority': t.priority,
            'progress': t.progress,
            'start_date': t.start_date.strftime('%Y-%m-%d'),
            'end_date': t.end_date.strftime('%Y-%m-%d'),
            'duration': (t.end_date - t.start_date).days + 1,
            'level': _get_level(t),
            'step_stats': t.get_step_stats(),
            'children_stats': t.get_children_stats()
        })
    return jsonify(result)

def _get_level(todo):
    """获取任务层级深度"""
    level = 0
    current = todo
    while current.parent_id:
        level += 1
        current = Todo.query.get(current.parent_id)
        if not current:
            break
    return level

# ============ 导出 API ============

@app.route('/api/todos/export', methods=['GET'])
def export_todos():
    """导出todo列表到Excel"""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    query = Todo.query
    if start_date:
        query = query.filter(Todo.created_at >= datetime.strptime(start_date, '%Y-%m-%d'))
    if end_date:
        query = query.filter(Todo.created_at <= datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1))
    
    todos = query.order_by(Todo.created_at.desc()).all()
    
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Todo列表"
    
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    
    headers = ['ID', '标题', '描述', '优先级', '当前状态', '进度(%)', '开始日期', '结束日期', '步骤(完成/总数)', '创建时间', '更新时间']
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center', vertical='center')
    
    for row, todo in enumerate(todos, 2):
        step_stats = todo.get_step_stats()
        ws.cell(row=row, column=1, value=todo.id)
        ws.cell(row=row, column=2, value=todo.title)
        ws.cell(row=row, column=3, value=todo.description or '')
        ws.cell(row=row, column=4, value=todo.priority)
        ws.cell(row=row, column=5, value=todo.status)
        ws.cell(row=row, column=6, value=todo.progress)
        ws.cell(row=row, column=7, value=todo.start_date.strftime('%Y-%m-%d') if todo.start_date else '')
        ws.cell(row=row, column=8, value=todo.end_date.strftime('%Y-%m-%d') if todo.end_date else '')
        ws.cell(row=row, column=9, value=f"{step_stats['completed']}/{step_stats['total']}")
        ws.cell(row=row, column=10, value=todo.created_at.strftime('%Y-%m-%d %H:%M:%S'))
        ws.cell(row=row, column=11, value=todo.updated_at.strftime('%Y-%m-%d %H:%M:%S'))
    
    for col_letter, width in [('A',8),('B',30),('C',40),('D',10),('E',12),('F',10),('G',12),('H',12),('I',14),('J',20),('K',20)]:
        ws.column_dimensions[col_letter].width = width
    
    # 状态历史工作表
    ws_history = wb.create_sheet("状态变更历史")
    history_headers = ['Todo ID', '标题', '原状态', '新状态', '变更时间', '备注']
    for col, header in enumerate(history_headers, 1):
        cell = ws_history.cell(row=1, column=col, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center', vertical='center')
    
    row = 2
    for todo in todos:
        for history in todo.status_history.all():
            ws_history.cell(row=row, column=1, value=todo.id)
            ws_history.cell(row=row, column=2, value=todo.title)
            ws_history.cell(row=row, column=3, value=history.old_status or '')
            ws_history.cell(row=row, column=4, value=history.new_status)
            ws_history.cell(row=row, column=5, value=history.changed_at.strftime('%Y-%m-%d %H:%M:%S'))
            ws_history.cell(row=row, column=6, value=history.remark or '')
            row += 1
    
    for col_letter, width in [('A',10),('B',30),('C',12),('D',12),('E',20),('F',30)]:
        ws_history.column_dimensions[col_letter].width = width
    
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    
    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=f'todo_export_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
    )

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5050, debug=True)
