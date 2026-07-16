import os

class Config:
    """应用配置"""
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    
    # 数据库配置
    SQLALCHEMY_DATABASE_URI = f'sqlite:///{os.path.join(BASE_DIR, "todo.db")}'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # 密钥
<<<<<<< HEAD
    SECRET_KEY = os.environ.get('SECRET_KEY', 'mytodolist-secret-key-2026')
=======
    SECRET_KEY = os.environ.get('SECRET_KEY', 'wsl-todo-secret-key-2026')
>>>>>>> 4cba1af28bc053658aaa6cb862ce14a84b8459c0
    
    # 状态定义
    STATUS_OPTIONS = ['待开始', '进行中', '暂挂', '已完成', '已取消']
