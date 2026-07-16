from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Todo(db.Model):
    """Todo事项模型 - 支持树状结构"""
    __tablename__ = 'todos'
    
    id = db.Column(db.Integer, primary_key=True)
    parent_id = db.Column(db.Integer, db.ForeignKey('todos.id'), nullable=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    status = db.Column(db.String(20), nullable=False, default='待开始')
    priority = db.Column(db.String(10), default='中')  # 高/中/低
    progress = db.Column(db.Integer, default=0)  # 进度百分比 0-100
    
    # 甘特图字段
    start_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关联
    children = db.relationship('Todo', backref=db.backref('parent', remote_side=[id]), 
                               lazy='dynamic')
    status_history = db.relationship('StatusHistory', backref='todo', 
                                     lazy='dynamic', order_by='StatusHistory.changed_at.desc()')
    steps = db.relationship('TodoStep', backref='todo', lazy='dynamic',
                           order_by='TodoStep.order.asc()')
    
    def to_dict(self, include_children=True):
        # 计算是否逾期
        today = datetime.utcnow().date()
        is_overdue = (
            self.end_date is not None
            and self.end_date < today
            and self.status not in ('已完成', '已取消')
        )
        
        # 计算进度：优先使用步骤统计，如果有子任务则使用子任务平均进度
        calculated_progress = self.progress
        
        # 如果有子任务，根据子任务进度计算
        children_list = self.children.all()
        if children_list:
            total_children_progress = sum(child.progress for child in children_list)
            calculated_progress = int(total_children_progress / len(children_list))
        else:
            # 如果没有子任务，根据步骤计算
            step_stats = self.get_step_stats()
            if step_stats['total'] > 0:
                calculated_progress = step_stats['percent']
        
        data = {
            'id': self.id,
            'parent_id': self.parent_id,
            'title': self.title,
            'description': self.description,
            'status': self.status,
            'priority': self.priority,
            'progress': calculated_progress,
            'start_date': self.start_date.strftime('%Y-%m-%d') if self.start_date else None,
            'end_date': self.end_date.strftime('%Y-%m-%d') if self.end_date else None,
            'is_overdue': is_overdue,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S'),
            'steps': [s.to_dict() for s in self.steps.all()],
            'children': [c.to_dict(include_children=True) for c in children_list] if include_children else [],
            'step_stats': step_stats,
            'children_stats': self.get_children_stats()
        }
        return data
    
    def get_step_stats(self):
        """获取步骤统计"""
        total = self.steps.count()
        completed = self.steps.filter_by(completed=True).count()
        return {
            'total': total,
            'completed': completed,
            'percent': int(completed / total * 100) if total > 0 else 0
        }
    
    def get_children_stats(self):
        """获取子任务统计"""
        total = self.children.count()
        completed = self.children.filter_by(status='已完成').count()
        return {
            'total': total,
            'completed': completed
        }


class TodoStep(db.Model):
    """任务步骤模型"""
    __tablename__ = 'todo_steps'
    
    id = db.Column(db.Integer, primary_key=True)
    todo_id = db.Column(db.Integer, db.ForeignKey('todos.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    order = db.Column(db.Integer, default=0)
    completed = db.Column(db.Boolean, default=False)
    completed_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'todo_id': self.todo_id,
            'title': self.title,
            'order': self.order,
            'completed': self.completed,
            'completed_at': self.completed_at.strftime('%Y-%m-%d %H:%M:%S') if self.completed_at else None,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S')
        }


class StatusHistory(db.Model):
    """状态变更历史模型"""
    __tablename__ = 'status_history'
    
    id = db.Column(db.Integer, primary_key=True)
    todo_id = db.Column(db.Integer, db.ForeignKey('todos.id'), nullable=False)
    old_status = db.Column(db.String(20))
    new_status = db.Column(db.String(20), nullable=False)
    changed_at = db.Column(db.DateTime, default=datetime.utcnow)
    remark = db.Column(db.Text)
    
    def to_dict(self):
        return {
            'id': self.id,
            'todo_id': self.todo_id,
            'old_status': self.old_status,
            'new_status': self.new_status,
            'changed_at': self.changed_at.strftime('%Y-%m-%d %H:%M:%S'),
            'remark': self.remark
        }
