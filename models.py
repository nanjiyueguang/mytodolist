from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
import os

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
    
    # 归档字段
    is_archived = db.Column(db.Boolean, default=False)
    archived_at = db.Column(db.DateTime)
    
    # 排序字段
    sort_order = db.Column(db.Integer, default=0, index=True)
    
    created_at = db.Column(db.DateTime, default=datetime.now)  # 创建时间，自动赋值为创建当天（本地时间）
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关联
    children = db.relationship('Todo', backref=db.backref('parent', remote_side=[id]), 
                               lazy='dynamic', order_by='Todo.sort_order.asc()')
    status_history = db.relationship('StatusHistory', backref='todo', 
                                     lazy='dynamic', order_by='StatusHistory.changed_at.desc()')
    steps = db.relationship('TodoStep', backref='todo', lazy='dynamic',
                           order_by='TodoStep.order.asc()')
    attachments = db.relationship('Attachment', backref='todo', lazy='dynamic',
                                 order_by='Attachment.uploaded_at.desc()')
    
    def get_auto_dates(self):
        """根据子任务递归计算汇总日期
        返回 (auto_start, auto_end, is_auto)
        is_auto=True 表示日期由子任务决定
        """
        children_list = self.children.all()
        if not children_list:
            # 叶子任务：使用自身日期
            return self.start_date, self.end_date, False
        
        # 收集所有子任务的日期（递归）
        all_starts = []
        all_ends = []
        for child in children_list:
            cs, ce, _ = child.get_auto_dates()
            if cs:
                all_starts.append(cs)
            if ce:
                all_ends.append(ce)
        
        # 也考虑自身手动设置的日期
        if self.start_date:
            all_starts.append(self.start_date)
        if self.end_date:
            all_ends.append(self.end_date)
        
        auto_start = min(all_starts) if all_starts else None
        auto_end = max(all_ends) if all_ends else None
        
        return auto_start, auto_end, True

    def to_dict(self, include_children=True):
        # 计算是否逾期
        today = datetime.utcnow().date()
        
        # 先获取步骤统计（无论是否有子任务）
        step_stats = self.get_step_stats()
        
        # 计算进度：只根据子任务进度，步骤不影响任务进度
        calculated_progress = self.progress
        
        # 如果有子任务，根据子任务进度计算
        children_list = self.children.all()
        if children_list:
            total_children_progress = sum(child.progress for child in children_list)
            calculated_progress = int(total_children_progress / len(children_list))
        
        # 计算显示日期：有子任务时自动汇总
        display_start, display_end, is_auto_date = self.get_auto_dates()
        
        is_overdue = (
            display_end is not None
            and display_end < today
            and self.status not in ('已完成', '已取消')
        )
        
        data = {
            'id': self.id,
            'parent_id': self.parent_id,
            'title': self.title,
            'description': self.description,
            'status': self.status,
            'priority': self.priority,
            'progress': calculated_progress,
            'start_date': display_start.strftime('%Y-%m-%d') if display_start else None,
            'end_date': display_end.strftime('%Y-%m-%d') if display_end else None,
            'is_auto_date': is_auto_date,
            'is_overdue': is_overdue,
            'is_archived': self.is_archived,
            'archived_at': self.archived_at.strftime('%Y-%m-%d %H:%M:%S') if self.archived_at else None,
            'sort_order': self.sort_order,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S'),
            'steps': [s.to_dict() for s in self.steps.all()],
            'attachments': [a.to_dict() for a in self.attachments.all()],
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


class Attachment(db.Model):
    """附件模型"""
    __tablename__ = 'attachments'
    
    id = db.Column(db.Integer, primary_key=True)
    todo_id = db.Column(db.Integer, db.ForeignKey('todos.id'), nullable=False)
    filename = db.Column(db.String(255), nullable=False)  # 原始文件名
    stored_name = db.Column(db.String(255), nullable=False)  # 存储文件名
    file_size = db.Column(db.Integer)  # 文件大小(字节)
    mime_type = db.Column(db.String(100))  # MIME类型
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'todo_id': self.todo_id,
            'filename': self.filename,
            'file_size': self.file_size,
            'mime_type': self.mime_type,
            'uploaded_at': self.uploaded_at.strftime('%Y-%m-%d %H:%M:%S')
        }


class ChatConfig(db.Model):
    """聊天智能体模型配置"""
    __tablename__ = 'chat_configs'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, default='默认配置')
    api_url = db.Column(db.String(500), nullable=False)
    api_key = db.Column(db.String(500), nullable=False)
    model_name = db.Column(db.String(200), default='')
    system_prompt = db.Column(db.Text, default='')
    is_default = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'api_url': self.api_url,
            'api_key': self.api_key[:8] + '***' if self.api_key else '',
            'model_name': self.model_name,
            'system_prompt': self.system_prompt,
            'is_default': self.is_default,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S')
        }


class ReportTemplate(db.Model):
    """周报模板"""
    __tablename__ = 'report_templates'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, default='')
    template_content = db.Column(db.Text, nullable=False)  # 模板内容，支持变量占位符
    is_default = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'template_content': self.template_content,
            'is_default': self.is_default,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S')
        }


class ChatMessage(db.Model):
    """聊天消息"""
    __tablename__ = 'chat_messages'
    
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(36), nullable=False, index=True)  # UUID session
    role = db.Column(db.String(20), nullable=False)  # user / assistant / system
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'role': self.role,
            'content': self.content,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S')
        }
