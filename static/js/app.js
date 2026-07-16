// 全局状态
let currentDetailTodoId = null;
let allTasks = []; // 扁平化后的任务列表
let ganttConfig = {
    dayWidth: 30
};

document.addEventListener('DOMContentLoaded', () => {
    // 设置日期选择器默认值为今天
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('todo-start-date').value = today;
    document.getElementById('todo-end-date').value = today;
    
    loadTodos();
    bindEvents();
});

function bindEvents() {
    document.getElementById('btn-create').addEventListener('click', createTodo);
    
    document.getElementById('btn-import').addEventListener('click', () => {
        document.getElementById('import-panel').style.display = 'block';
        document.getElementById('import-result').innerHTML = '';
        document.getElementById('import-file').value = '';
    });
    document.getElementById('btn-cancel-import').addEventListener('click', () => {
        document.getElementById('import-panel').style.display = 'none';
    });
    document.getElementById('import-file').addEventListener('change', importTodos);
    
    document.getElementById('btn-export').addEventListener('click', () => {
        document.getElementById('export-panel').style.display = 'block';
    });
    document.getElementById('btn-confirm-export').addEventListener('click', exportTodos);
    document.getElementById('btn-cancel-export').addEventListener('click', () => {
        document.getElementById('export-panel').style.display = 'none';
    });
    
    document.getElementById('btn-save-detail').addEventListener('click', saveDetail);
    document.getElementById('btn-cancel-detail').addEventListener('click', closeDetailModal);
    document.getElementById('btn-delete-detail').addEventListener('click', deleteTodo);
    
    document.getElementById('btn-add-step').addEventListener('click', addStep);
    document.getElementById('step-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addStep();
    });
    
    document.getElementById('btn-add-child').addEventListener('click', addChild);
    document.getElementById('child-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addChild();
    });
    
    // 拖拽分隔条
    initResizer();
}

async function loadTodos() {
    try {
        const response = await fetch('/api/todos');
        const todos = await response.json();
        allTasks = flattenTasks(todos);
        renderGantt();
    } catch (error) {
        console.error('加载失败:', error);
    }
}

// 扁平化任务树，生成任务编码
function flattenTasks(todos, parentCode = '', level = 0) {
    let result = [];
    let index = 1;
    
    todos.forEach(todo => {
        const code = parentCode ? `${parentCode}.${index}` : `${index}`;
        
        result.push({
            ...todo,
            taskCode: code,
            level: level,
            duration: todo.start_date && todo.end_date ? 
                Math.ceil((new Date(todo.end_date) - new Date(todo.start_date)) / (1000 * 60 * 60 * 24)) + 1 : 0
        });
        
        if (todo.children && todo.children.length > 0) {
            result = result.concat(flattenTasks(todo.children, code, level + 1));
        }
        
        index++;
    });
    
    return result;
}

// 渲染甘特图
function renderGantt() {
    if (allTasks.length === 0) {
        document.getElementById('task-table-body').innerHTML = '<div class="empty-state">暂无任务</div>';
        document.getElementById('gantt-bars').innerHTML = '';
        document.getElementById('gantt-timeline').innerHTML = '';
        return;
    }
    
    // 计算日期范围
    let minDate = null;
    let maxDate = null;
    
    allTasks.forEach(task => {
        if (task.start_date) {
            const start = new Date(task.start_date);
            if (!minDate || start < minDate) minDate = start;
        }
        if (task.end_date) {
            const end = new Date(task.end_date);
            if (!maxDate || end > maxDate) maxDate = end;
        }
    });
    
    if (!minDate || !maxDate) {
        document.getElementById('task-table-body').innerHTML = '<div class="empty-state">请为任务设置日期</div>';
        return;
    }
    
    // 扩展范围
    minDate.setDate(minDate.getDate() - 2);
    maxDate.setDate(maxDate.getDate() + 5);
    
    renderTimeline(minDate, maxDate);
    renderTaskTable();
    renderGanttBars(minDate, maxDate);
}

// 渲染时间轴
function renderTimeline(startDate, endDate) {
    const timeline = document.getElementById('gantt-timeline');
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 按月分组
    let months = [];
    let currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
        const monthKey = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}`;
        if (!months.find(m => m.key === monthKey)) {
            months.push({
                key: monthKey,
                label: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`,
                days: []
            });
        }
        months[months.length - 1].days.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    let html = '';
    months.forEach(month => {
        html += `<div class="gantt-month">`;
        html += `<div class="month-label" style="width: ${month.days.length * ganttConfig.dayWidth}px">${month.label}</div>`;
        html += `<div class="gantt-days">`;
        month.days.forEach(date => {
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const isToday = date.getTime() === today.getTime();
            const dayNum = date.getDate();
            html += `<div class="gantt-day ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}" 
                          style="width: ${ganttConfig.dayWidth}px">${dayNum}</div>`;
        });
        html += `</div></div>`;
    });
    
    timeline.innerHTML = html;
}

// 渲染任务表格
function renderTaskTable() {
    const tbody = document.getElementById('task-table-body');
    
    let html = '';
    allTasks.forEach(task => {
        const hasChildren = task.children && task.children.length > 0;
        const indent = task.level * 20;
        
        // 优先级图标
        const priorityIcon = task.priority === '高' ? '🔴' : task.priority === '中' ? '🟡' : '🔵';
        
        html += `
            <div class="task-row level-${task.level}" onclick="showDetail(${task.id})">
                <div class="col-task-code">${task.taskCode}</div>
                <div class="col-task-name task-name-cell level-${task.level}" style="padding-left: ${8 + indent}px">
                    ${hasChildren ? '<span class="task-toggle">▼</span>' : ''}
                    ${escapeHtml(task.title)}
                </div>
                <div class="col-priority">${priorityIcon} ${task.priority}</div>
                <div class="col-date">${task.start_date || '-'}</div>
                <div class="col-date">${task.end_date || '-'}</div>
                <div class="col-duration">${task.duration || 0}</div>
                <div class="col-progress">${task.progress || 0}%</div>
            </div>
        `;
    });
    
    tbody.innerHTML = html;
}

// 渲染甘特图进度条
function renderGanttBars(startDate, endDate) {
    const container = document.getElementById('gantt-bars');
    
    let html = '';
    allTasks.forEach(task => {
        if (!task.start_date || !task.end_date) {
            html += `<div class="gantt-bar-row level-${task.level}"></div>`;
            return;
        }
        
        const taskStart = new Date(task.start_date);
        const taskEnd = new Date(task.end_date);
        
        // 修正日期计算：使用 Math.floor 而不是 Math.ceil
        const offsetDays = Math.floor((taskStart - startDate) / (1000 * 60 * 60 * 24));
        const duration = Math.floor((taskEnd - taskStart) / (1000 * 60 * 60 * 24)) + 1;
        
        const left = offsetDays * ganttConfig.dayWidth;
        const width = duration * ganttConfig.dayWidth;
        
        // 根据优先级确定进度条颜色
        let priorityClass = 'priority-medium';
        if (task.priority === '高') priorityClass = 'priority-high';
        else if (task.priority === '低') priorityClass = 'priority-low';
        
        html += `
            <div class="gantt-bar-row level-${task.level}">
                <div class="gantt-bar ${priorityClass}" 
                     style="left: ${left}px; width: ${width}px;"
                     onclick="showDetail(${task.id})">
                    <div class="gantt-bar-progress" style="width: ${task.progress || 0}%"></div>
                    <span class="gantt-bar-text">${task.progress || 0}%</span>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

async function createTodo() {
    const title = document.getElementById('todo-title').value.trim();
    const description = document.getElementById('todo-description').value.trim();
    const priority = document.getElementById('todo-priority').value;
    const startDate = document.getElementById('todo-start-date').value;
    const endDate = document.getElementById('todo-end-date').value;
    
    if (!title) { alert('请输入任务标题'); return; }
    
    try {
        const response = await fetch('/api/todos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description, priority, start_date: startDate, end_date: endDate })
        });
        if (!response.ok) throw new Error('创建失败');
        
        document.getElementById('todo-title').value = '';
        document.getElementById('todo-description').value = '';
        document.getElementById('todo-start-date').value = '';
        document.getElementById('todo-end-date').value = '';
        
        loadTodos();
    } catch (error) {
        console.error('创建失败:', error);
        alert('创建任务失败');
    }
}

async function showDetail(todoId) {
    currentDetailTodoId = todoId;
    
    try {
        const response = await fetch(`/api/todos/${todoId}`);
        const todo = await response.json();
        
        document.getElementById('detail-title').textContent = todo.title;
        document.getElementById('detail-edit-title').value = todo.title;
        document.getElementById('detail-edit-description').value = todo.description || '';
        document.getElementById('detail-edit-priority').value = todo.priority;
        document.getElementById('detail-edit-status').value = todo.status;
        document.getElementById('detail-edit-start').value = todo.start_date || '';
        document.getElementById('detail-edit-end').value = todo.end_date || '';
        
        // 显示自动计算的进度
        const progress = todo.progress || 0;
        document.getElementById('detail-progress-value').textContent = progress;
        document.getElementById('detail-progress-fill').style.width = progress + '%';
        
        renderSteps(todo.steps || []);
        renderChildren(todo.children || []);
        renderHistory(todo.status_history || []);
        
        document.getElementById('detail-modal').style.display = 'flex';
    } catch (error) {
        console.error('加载详情失败:', error);
    }
}

function renderSteps(steps) {
    const container = document.getElementById('detail-steps');
    if (steps.length === 0) {
        container.innerHTML = '<p style="color:#999;font-size:13px;">暂无步骤</p>';
        return;
    }
    container.innerHTML = steps.map(step => `
        <div class="step-item">
            <input type="checkbox" class="step-checkbox" ${step.completed ? 'checked' : ''} 
                   onchange="toggleStep(${step.id}, this.checked)">
            <span class="step-title ${step.completed ? 'completed' : ''}">${escapeHtml(step.title)}</span>
            <span class="step-delete" onclick="deleteStep(${step.id})">×</span>
        </div>
    `).join('');
}

async function addStep() {
    const input = document.getElementById('step-input');
    const title = input.value.trim();
    if (!title) return;
    
    try {
        await fetch(`/api/todos/${currentDetailTodoId}/steps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
        input.value = '';
        showDetail(currentDetailTodoId);
    } catch (error) {
        alert('添加步骤失败');
    }
}

async function toggleStep(stepId, completed) {
    try {
        await fetch(`/api/steps/${stepId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed })
        });
        showDetail(currentDetailTodoId);
        loadTodos();
    } catch (error) {
        console.error('更新步骤失败:', error);
    }
}

async function deleteStep(stepId) {
    if (!confirm('确定删除这个步骤？')) return;
    try {
        await fetch(`/api/steps/${stepId}`, { method: 'DELETE' });
        showDetail(currentDetailTodoId);
        loadTodos();
    } catch (error) {
        console.error('删除步骤失败:', error);
    }
}

function renderChildren(children) {
    const container = document.getElementById('detail-children');
    if (children.length === 0) {
        container.innerHTML = '<p style="color:#999;font-size:13px;">暂无子任务</p>';
        return;
    }
    container.innerHTML = children.map(child => `
        <div class="child-item" onclick="showDetail(${child.id})">
            <span>${escapeHtml(child.title)}</span>
            <span style="margin-left:auto;color:#999;font-size:12px;">${child.progress || 0}%</span>
        </div>
    `).join('');
}

async function addChild() {
    const input = document.getElementById('child-input');
    const title = input.value.trim();
    if (!title) return;
    
    try {
        await fetch('/api/todos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, parent_id: currentDetailTodoId })
        });
        input.value = '';
        showDetail(currentDetailTodoId);
        loadTodos();
    } catch (error) {
        alert('添加子任务失败');
    }
}

function renderHistory(history) {
    const container = document.getElementById('detail-history');
    if (history.length === 0) {
        container.innerHTML = '<p style="color:#999;font-size:13px;">暂无状态变更记录</p>';
        return;
    }
    container.innerHTML = history.map(h => `
        <div class="history-item">
            <div class="history-header">
                <span class="history-status">${h.old_status ? `${h.old_status} → ` : ''}${h.new_status}</span>
                <span class="history-time">${h.changed_at}</span>
            </div>
            ${h.remark ? `<div class="history-remark">备注: ${escapeHtml(h.remark)}</div>` : ''}
        </div>
    `).join('');
}

async function saveDetail() {
    const title = document.getElementById('detail-edit-title').value.trim();
    const description = document.getElementById('detail-edit-description').value.trim();
    const priority = document.getElementById('detail-edit-priority').value;
    const status = document.getElementById('detail-edit-status').value;
    const startDate = document.getElementById('detail-edit-start').value;
    const endDate = document.getElementById('detail-edit-end').value;
    // 进度由系统自动计算，不再手动设置
    
    if (!title) { alert('标题不能为空'); return; }
    
    try {
        await fetch(`/api/todos/${currentDetailTodoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description, priority, start_date: startDate, end_date: endDate })
        });
        
        const todoResponse = await fetch(`/api/todos/${currentDetailTodoId}`);
        const currentTodo = await todoResponse.json();
        
        if (currentTodo.status !== status) {
            await fetch(`/api/todos/${currentDetailTodoId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, remark: '手动更新状态' })
            });
        }
        
        closeDetailModal();
        loadTodos();
    } catch (error) {
        alert('保存失败');
    }
}

function closeDetailModal() {
    document.getElementById('detail-modal').style.display = 'none';
    currentDetailTodoId = null;
}

async function deleteTodo() {
    if (!currentDetailTodoId) return;
    if (!confirm('确定删除此任务及其所有子任务？\n此操作不可恢复！')) return;
    try {
        const response = await fetch(`/api/todos/${currentDetailTodoId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('删除失败');
        closeDetailModal();
        loadTodos();
    } catch (error) {
        console.error('删除失败:', error);
        alert('删除任务失败');
    }
}

async function exportTodos() {
    const startDate = document.getElementById('export-start-date').value;
    const endDate = document.getElementById('export-end-date').value;
    let url = '/api/todos/export?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    window.location.href = url;
    document.getElementById('export-panel').style.display = 'none';
}

async function importTodos(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const resultDiv = document.getElementById('import-result');
    resultDiv.innerHTML = '<span style="color:#666;">正在导入...</span>';
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/todos/import', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            let msg = `<span style="color:#4CAF50;">✅ 导入成功！成功 ${result.success_count} 条`;
            if (result.error_count > 0) {
                msg += `，失败 ${result.error_count} 条`;
            }
            msg += '</span>';
            
            if (result.errors && result.errors.length > 0) {
                msg += '<div style="margin-top:8px;color:#f44336;font-size:13px;">';
                result.errors.forEach(err => {
                    msg += `<div>${escapeHtml(err)}</div>`;
                });
                msg += '</div>';
            }
            
            resultDiv.innerHTML = msg;
            loadTodos();
        } else {
            resultDiv.innerHTML = `<span style="color:#f44336;">❌ ${escapeHtml(result.error || '导入失败')}</span>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<span style="color:#f44336;">❌ 导入失败: ${escapeHtml(error.message)}</span>`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 拖拽分隔条
function initResizer() {
    const resizer = document.getElementById('gantt-resizer');
    const table = document.querySelector('.gantt-table');
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = table.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = startWidth + (e.clientX - startX);
        if (newWidth >= 350 && newWidth <= 900) {
            table.style.width = newWidth + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}
