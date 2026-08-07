import os

class Config:
    """应用配置"""
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    
    # 数据库配置
    SQLALCHEMY_DATABASE_URI = f'sqlite:///{os.path.join(BASE_DIR, "todo.db")}'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # 密钥
    SECRET_KEY = os.environ.get('SECRET_KEY', 'mytodolist-secret-key-2026')
    
    # 状态定义
    STATUS_OPTIONS = ['待开始', '进行中', '暂挂', '已完成', '已取消']
    
    # 附件配置
    ATTACHMENT_DIR = os.path.join(BASE_DIR, 'attachments')
    MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024  # 50MB
    
    # 聊天智能体配置
    CHAT_DEFAULT_SYSTEM_PROMPT = '''你是一个工作周报助手。根据用户的任务记录和状态变更历史，帮助用户生成每周工作报告。

你可以：
1. 分析指定时间段内的任务完成情况
2. 统计任务状态变更（如从"进行中"变为"已完成"）
3. 按模板格式生成周报
4. 提供工作进度总结和建议

请用简洁专业的语言回复。'''
