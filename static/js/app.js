// 全局状态
let allTasks = []; // 扁平化后的任务列表
let collapsedTasks = new Set(); // 折叠的任务ID（隐藏子任务）
let archivedTasks = []; // 已归档任务列表
let currentAttachmentTaskId = null; // 当前附件弹窗对应的任务ID
let filters = {
    priority: '',
    status: [],  // 改为数组支持多选
    startDate: '',
    endDate: ''
};

document.addEventListener('DOMContentLoaded', () => {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('todo-start-date').value = today;
    document.getElementById('todo-end-date').value = today;
    
    loadTodos();
    loadArchivedTodos();
    bindEvents();
    bindFilters();
    bindAttachmentEvents();
});

// 默认折叠所有任务
function collapseAllTasks() {
    allTasks.forEach(task => {
        if (task.children && task.children.length > 0) {
            collapsedTasks.add(task.id);
        }
    });
}

function bindEvents() {
    // 创建按钮 → 打开弹窗
    document.getElementById('btn-create').addEventListener('click', openCreateModal);
    
    // 弹窗关闭/取消
    document.getElementById('btn-modal-close').addEventListener('click', closeCreateModal);
    document.getElementById('btn-modal-cancel').addEventListener('click', closeCreateModal);
    
    // 弹窗确认创建
    document.getElementById('btn-modal-confirm').addEventListener('click', () => {
        createTodo();
    });
    
    // 点击遮罩关闭
    document.getElementById('create-modal').addEventListener('click', (e) => {
        if (e.target.id === 'create-modal') closeCreateModal();
    });
    
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
    
    // 历史任务展开/折叠
    document.getElementById('btn-toggle-archived').addEventListener('click', toggleArchivedSection);
}

async function loadTodos() {
    try {
        const response = await fetch('/api/todos');
        const todos = await response.json();
        allTasks = flattenTasks(todos);
        // 首次加载默认折叠所有有子任务的任务
        if (!window._loadedOnce) {
            collapseAllTasks();
            window._loadedOnce = true;
        }
        renderTaskTable();
    } catch (error) {
        console.error('加载失败:', error);
    }
}

// 扁平化任务树，生成任务编码
// 拖拽排序功能
let draggedTaskId = null;
let draggedElement = null;

function initDragAndDrop() {
    const tbody = document.getElementById('task-table-body');
    const rows = tbody.querySelectorAll('.task-row');
    
    rows.forEach(row => {
        row.addEventListener('dragstart', handleDragStart);
        row.addEventListener('dragend', handleDragEnd);
        row.addEventListener('dragover', handleDragOver);
        row.addEventListener('drop', handleDrop);
    });
}

function handleDragStart(e) {
    draggedElement = this;
    draggedTaskId = parseInt(this.dataset.taskId);
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedTaskId);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.task-row').forEach(row => {
        row.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
    });
    draggedTaskId = null;
    draggedElement = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const row = this;
    if (row === draggedElement) return;
    
    // 检查是否是同级任务（parent_id 相同）
    const targetTaskId = parseInt(row.dataset.taskId);
    const targetTask = allTasks.find(t => t.id === targetTaskId);
    const draggedTask = allTasks.find(t => t.id === draggedTaskId);
    
    if (!targetTask || !draggedTask) return;
    
    // 只允许同级拖拽
    const draggedParentId = draggedTask.parent_id || null;
    const targetParentId = targetTask.parent_id || null;
    
    if (draggedParentId !== targetParentId) {
        row.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
        return;
    }
    
    // 判断插入位置
    const rect = row.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    
    row.classList.remove('drag-over-top', 'drag-over-bottom');
    if (e.clientY < midpoint) {
        row.classList.add('drag-over-top');
    } else {
        row.classList.add('drag-over-bottom');
    }
}

async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const targetRow = this;
    const targetTaskId = parseInt(targetRow.dataset.taskId);
    
    if (targetTaskId === draggedTaskId) return;
    
    const targetTask = allTasks.find(t => t.id === targetTaskId);
    const draggedTask = allTasks.find(t => t.id === draggedTaskId);
    
    if (!targetTask || !draggedTask) return;
    
    // 只允许同级拖拽
    const draggedParentId = draggedTask.parent_id || null;
    const targetParentId = targetTask.parent_id || null;
    
    if (draggedParentId !== targetParentId) return;
    
    // 判断插入位置
    const rect = targetRow.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const insertBefore = e.clientY < midpoint;
    
    // 获取同级任务列表
    const siblings = allTasks.filter(t => (t.parent_id || null) === draggedParentId);
    
    // 从列表中移除被拖拽的任务
    const draggedIndex = siblings.findIndex(t => t.id === draggedTaskId);
    if (draggedIndex === -1) return;
    
    const [draggedItem] = siblings.splice(draggedIndex, 1);
    
    // 找到目标位置并插入
    let targetIndex = siblings.findIndex(t => t.id === targetTaskId);
    if (targetIndex === -1) return;
    
    if (!insertBefore) {
        targetIndex += 1;
    }
    
    siblings.splice(targetIndex, 0, draggedItem);
    
    // 更新排序值
    const orders = siblings.map((task, index) => ({
        id: task.id,
        sort_order: index
    }));
    
    try {
        const response = await fetch('/api/todos/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orders })
        });
        
        if (response.ok) {
            await loadTodos();
        } else {
            alert('排序更新失败');
        }
    } catch (error) {
        console.error('排序更新错误:', error);
        alert('排序更新失败');
    }
}

function flattenTasks(todos, parentCode = '', level = 0, parentIds = []) {
    let result = [];
    let index = 1;
    
    todos.forEach(todo => {
        const code = parentCode ? `${parentCode}.${index}` : `${index}`;
        const currentParentIds = [...parentIds];
        
        result.push({
            ...todo,
            taskCode: code,
            level: level,
            _parentIds: currentParentIds,
            duration: todo.start_date && todo.end_date ? 
                Math.ceil((new Date(todo.end_date) - new Date(todo.start_date)) / (1000 * 60 * 60 * 24)) + 1 : 0
        });
        
        if (todo.children && todo.children.length > 0) {
            result = result.concat(flattenTasks(todo.children, code, level + 1, [...currentParentIds, todo.id]));
        }
        
        index++;
    });
    
    return result;
}

// 检查任务是否被折叠（某个祖先在 collapsedTasks 中）
function isTaskHidden(task) {
    return task._parentIds && task._parentIds.some(pid => collapsedTasks.has(pid));
}

// 渲染任务表格
function renderTaskTable() {
    const tbody = document.getElementById('task-table-body');
    
    if (allTasks.length === 0) {
        tbody.innerHTML = '<div class="empty-state">暂无任务</div>';
        return;
    }
    
    let html = '';
    allTasks.forEach(task => {
        if (isTaskHidden(task)) return;
        if (!matchesFilters(task)) return;

        const hasChildren = task.children && task.children.length > 0;
        const indent = task.level * 20;
        const overdueMark = task.is_overdue ? '<span class="overdue-badge">逾期</span>' : '';
        
        // 方案A：有子任务显示完成数/总数，叶子任务不显示进度条
        let progressDisplay = '';
        if (hasChildren) {
            const stats = task.children_stats || { total: 0, completed: 0 };
            const total = stats.total || 0;
            const completed = stats.completed || 0;
            const percent = total > 0 ? Math.round(completed / total * 100) : 0;
            progressDisplay = `
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: ${percent}%; background: ${getProgressColor(percent)};"></div>
                    <span class="progress-text">${completed}/${total}</span>
                </div>
            `;
        }
        
        const isCollapsed = collapsedTasks.has(task.id);
        const toggleIcon = hasChildren
            ? `<span class="task-toggle" data-task-id="${task.id}" data-action="toggle-children">${isCollapsed ? '▶' : '▼'}</span>`
            : '';
        const descText = task.description 
            ? `<div class="task-desc-inline" title="点击编辑描述" data-task-id="${task.id}" data-action="edit-desc-inline">${escapeHtml(task.description)}</div>`
            : `<div class="task-desc-inline task-desc-empty" title="点击添加描述" data-task-id="${task.id}" data-action="edit-desc-inline">+描述</div>`;

        html += `
            <div class="task-row level-${task.level} ${task.is_overdue ? 'overdue-task' : ''} ${isCollapsed ? 'collapsed' : ''} ${task.status === '已完成' ? 'task-completed' : ''}" data-task-id="${task.id}" draggable="true">
                <div class="col-drag-handle" title="拖拽排序">⠿</div>
                <div class="col-task-code">${task.taskCode}</div>
                <div class="col-task-name task-name-cell level-${task.level}" style="padding-left: ${8 + indent}px">
                    ${toggleIcon}
                    <div class="task-name-content">
                        <div class="task-name-row">
                            <span class="inline-editable-title" data-task-id="${task.id}" data-action="edit-title">${escapeHtml(task.title)}</span>
                            ${overdueMark}
                        </div>
                        ${descText}
                        ${renderTodos(task.steps || [])}
                    </div>
                    <div class="task-row-actions">
                        <button class="btn-add-todo-inline" data-task-id="${task.id}" data-action="add-todo-inline" title="添加待办">+todo</button>
                        <button class="btn-add-child-inline" data-task-id="${task.id}" data-action="add-child-inline" title="增加子任务">+子任务</button>
                        <button class="btn-attachment-inline" data-task-id="${task.id}" data-action="manage-attachment" title="附件管理">📎${task.attachments && task.attachments.length > 0 ? `<span class="attachment-count">${task.attachments.length}</span>` : ''}</button>
                        ${task.level === 0 ? `<button class="btn-archive-inline" data-task-id="${task.id}" data-action="archive-task" title="归档">📦归档</button>` : ''}
                        <button class="btn-delete-inline" data-task-id="${task.id}" data-action="delete-task-inline" title="删除任务">×</button>
                    </div>
                </div>
                <div class="col-priority">
                    <select class="row-select" data-task-id="${task.id}" data-field="priority" data-action="edit-priority">
                        <option value="高" ${task.priority==='高'?'selected':''}>🔴高</option>
                        <option value="中" ${task.priority==='中'?'selected':''}>🟡中</option>
                        <option value="低" ${task.priority==='低'?'selected':''}>🔵低</option>
                    </select>
                </div>
                <div class="col-status">
                    <select class="row-select" data-task-id="${task.id}" data-field="status" data-action="edit-status">
                        <option value="待开始" ${task.status==='待开始'?'selected':''}>待开始</option>
                        <option value="进行中" ${task.status==='进行中'?'selected':''}>进行中</option>
                        <option value="暂挂" ${task.status==='暂挂'?'selected':''}>暂挂</option>
                        <option value="已完成" ${task.status==='已完成'?'selected':''}>已完成</option>
                        <option value="已取消" ${task.status==='已取消'?'selected':''}>已取消</option>
                    </select>
                </div>
                <div class="col-date">
                    ${task.is_auto_date ? `<span class="auto-date-marker" title="自动根据子任务计算">🔄</span>` : ''}
                    <input type="date" class="row-date-input ${task.is_auto_date ? 'auto-date' : ''}" data-task-id="${task.id}" data-field="start_date" data-action="edit-date" value="${task.start_date || ''}" ${task.is_auto_date ? 'readonly' : ''}>
                </div>
                <div class="col-date">
                    <input type="date" class="row-date-input ${task.is_auto_date ? 'auto-date' : ''}" data-task-id="${task.id}" data-field="end_date" data-action="edit-date" value="${task.end_date || ''}" ${task.is_auto_date ? 'readonly' : ''}>
                </div>
                <div class="col-duration">${task.duration || 0}</div>
                <div class="col-progress">${progressDisplay}</div>
            </div>
        `;
    });
    
    tbody.innerHTML = html;
    
    // 拖拽排序功能
    initDragAndDrop();
    
    // 统一事件委托（只绑定一次）
    if (!tbody._clickBound) {
        tbody.addEventListener('click', (e) => {
            // 折叠/展开子任务
            const toggle = e.target.closest('[data-action="toggle-children"]');
            if (toggle) {
                e.stopPropagation();
                e.preventDefault();
                const taskId = parseInt(toggle.getAttribute('data-task-id'));
                toggleCollapse(taskId);
                return;
            }
            
            // 行内编辑：标题点击变输入框
            const titleSpan = e.target.closest('[data-action="edit-title"]');
            if (titleSpan) {
                e.stopPropagation();
                e.preventDefault();
                startTitleEdit(titleSpan);
                return;
            }
            
            // 行内编辑：描述点击变输入框
            const descSpan = e.target.closest('[data-action="edit-desc-inline"]');
            if (descSpan) {
                e.stopPropagation();
                e.preventDefault();
                startDescEdit(descSpan);
                return;
            }
            
            // 添加待办按钮
            const addTodoBtn = e.target.closest('[data-action="add-todo-inline"]');
            if (addTodoBtn) {
                e.stopPropagation();
                e.preventDefault();
                const taskId = parseInt(addTodoBtn.getAttribute('data-task-id'));
                promptAddTodo(taskId);
                return;
            }
            
            // 切换待办状态
            const todoCheckbox = e.target.closest('[data-action="toggle-todo"]');
            if (todoCheckbox) {
                e.stopPropagation();
                const todoId = parseInt(todoCheckbox.getAttribute('data-todo-id'));
                toggleTodo(todoId, todoCheckbox.checked);
                return;
            }
            
            // 删除待办
            const todoDelete = e.target.closest('[data-action="delete-todo"]');
            if (todoDelete) {
                e.stopPropagation();
                e.preventDefault();
                const todoId = parseInt(todoDelete.getAttribute('data-todo-id'));
                deleteTodo(todoId);
                return;
            }
            
            // 增加子任务按钮
            const addChildBtn = e.target.closest('[data-action="add-child-inline"]');
            if (addChildBtn) {
                e.stopPropagation();
                e.preventDefault();
                const taskId = parseInt(addChildBtn.getAttribute('data-task-id'));
                promptAddChild(taskId);
                return;
            }
            
            // 删除任务按钮
            const deleteBtn = e.target.closest('[data-action="delete-task-inline"]');
            if (deleteBtn) {
                e.stopPropagation();
                e.preventDefault();
                const taskId = parseInt(deleteBtn.getAttribute('data-task-id'));
                deleteTask(taskId);
                return;
            }
            
            // 归档按钮
            const archiveBtn = e.target.closest('[data-action="archive-task"]');
            if (archiveBtn) {
                e.stopPropagation();
                e.preventDefault();
                const taskId = parseInt(archiveBtn.getAttribute('data-task-id'));
                archiveTask(taskId);
                return;
            }
            
            // 附件管理按钮
            const attachmentBtn = e.target.closest('[data-action="manage-attachment"]');
            if (attachmentBtn) {
                e.stopPropagation();
                e.preventDefault();
                const taskId = parseInt(attachmentBtn.getAttribute('data-task-id'));
                openAttachmentModal(taskId);
                return;
            }
        });
        
        // 点击任务行高亮
        tbody.addEventListener('click', (e) => {
            // 排除交互元素
            if (e.target.closest('button, select, input, [data-action]')) return;
            
            const row = e.target.closest('.task-row');
            if (!row) return;
            
            // 移除其他行的高亮
            document.querySelectorAll('.task-row.selected').forEach(r => r.classList.remove('selected'));
            
            // 高亮当前行
            row.classList.add('selected');
        });
        
        // 行内 select 改变事件
        tbody.addEventListener('change', (e) => {
            const sel = e.target.closest('[data-action="edit-priority"]');
            if (sel) {
                e.stopPropagation();
                saveField(parseInt(sel.getAttribute('data-task-id')), 'priority', sel.value);
                return;
            }
            
            const statusSel = e.target.closest('[data-action="edit-status"]');
            if (statusSel) {
                e.stopPropagation();
                saveStatus(parseInt(statusSel.getAttribute('data-task-id')), statusSel.value);
                return;
            }
            
            const dateInput = e.target.closest('[data-action="edit-date"]');
            if (dateInput) {
                e.stopPropagation();
                saveField(parseInt(dateInput.getAttribute('data-task-id')), dateInput.getAttribute('data-field'), dateInput.value);
                return;
            }
        });
        
        tbody._clickBound = true;
    }
    
    // 初始化列宽拖拽
    initColumnResizer();
}

// Esc 键取消选中 / 关闭弹窗
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // 关闭创建弹窗
        if (document.getElementById('create-modal').style.display === 'flex') {
            closeCreateModal();
            return;
        }
        // 取消行选中
        document.querySelectorAll('.task-row.selected').forEach(r => r.classList.remove('selected'));
    }
});

// 绑定筛选器事件
function bindFilters() {
    // 优先级筛选
    const priorityFilter = document.getElementById('filter-priority');
    if (priorityFilter) {
        priorityFilter.addEventListener('change', (e) => {
            filters.priority = e.target.value;
            renderTaskTable();
        });
    }
    
    // 开始日期筛选
    const startDateFilter = document.getElementById('filter-start-date');
    if (startDateFilter) {
        startDateFilter.addEventListener('change', (e) => {
            filters.startDate = e.target.value;
            renderTaskTable();
        });
    }
    
    // 结束日期筛选
    const endDateFilter = document.getElementById('filter-end-date');
    if (endDateFilter) {
        endDateFilter.addEventListener('change', (e) => {
            filters.endDate = e.target.value;
            renderTaskTable();
        });
    }
    
    // 状态多选筛选
    const statusBtn = document.getElementById('filter-status-btn');
    const statusDropdown = document.getElementById('filter-status-dropdown');
    
    if (statusBtn && statusDropdown) {
        // 阻止原生下拉框打开
        statusBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });
        
        // 点击按钮显示/隐藏自定义下拉
        statusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (statusDropdown.style.display === 'none') {
                const rect = statusBtn.getBoundingClientRect();
                statusDropdown.style.top = (rect.bottom + 2) + 'px';
                statusDropdown.style.left = rect.left + 'px';
                statusDropdown.style.width = rect.width + 'px';
                statusDropdown.style.display = 'block';
            } else {
                statusDropdown.style.display = 'none';
            }
        });
        
        // checkbox 变化时重新渲染
        statusDropdown.addEventListener('change', () => {
            const checked = Array.from(statusDropdown.querySelectorAll('input:checked')).map(cb => cb.value);
            filters.status = checked;
            renderTaskTable();
            updateStatusBtnText();
            updateSelectedLabels();
        });
    }
    
    // 点击其他地方关闭状态下拉
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('filter-status-dropdown');
        if (dropdown && !e.target.closest('#filter-status')) {
            dropdown.style.display = 'none';
        }
    });
}

// 更新状态按钮文字
function updateStatusBtnText() {
    const btn = document.getElementById('filter-status-btn');
    const checked = filters.status;
    let text;
    if (checked.length === 0) {
        text = '状态';
        btn.style.color = '#333';
    } else if (checked.length <= 2) {
        text = checked.join('/');
        btn.style.color = '#4CAF50';
    } else {
        text = `已选${checked.length}项`;
        btn.style.color = '#4CAF50';
    }
    // 用 innerHTML 替换 option，强制刷新显示
    btn.innerHTML = `<option>${text}</option>`;
}

// 更新下拉菜单中标签的选中样式
function updateSelectedLabels() {
    const dropdown = document.getElementById('filter-status-dropdown');
    const labels = dropdown.querySelectorAll('label');
    labels.forEach(label => {
        const checkbox = label.querySelector('input[type="checkbox"]');
        if (checkbox.checked) {
            label.classList.add('selected');
        } else {
            label.classList.remove('selected');
        }
    });
}

// 检查任务是否符合筛选条件
function matchesFilters(task) {
    if (filters.priority && task.priority !== filters.priority) return false;
    
    // 状态多选：数组为空表示不过滤，否则任务状态必须在选中列表中
    if (filters.status.length > 0 && !filters.status.includes(task.status)) return false;
    
    if (filters.startDate) {
        const taskStart = task.start_date || '';
        if (!taskStart || taskStart < filters.startDate) return false;
    }
    
    if (filters.endDate) {
        const taskEnd = task.end_date || '';
        if (!taskEnd || taskEnd > filters.endDate) return false;
    }
    
    return true;
}

// 折叠/展开子任务
function toggleCollapse(taskId) {
    if (collapsedTasks.has(taskId)) {
        collapsedTasks.delete(taskId);
    } else {
        collapsedTasks.add(taskId);
    }
    renderTaskTable();
}

// 标题行内编辑
function startTitleEdit(span) {
    const taskId = parseInt(span.getAttribute('data-task-id'));
    const currentTitle = span.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'inline-title-input';
    input.style.cssText = 'width:100%;padding:4px 8px;border:1px solid #4CAF50;border-radius:4px;font-size:13px;';
    
    span.replaceWith(input);
    input.focus();
    input.select();
    
    const save = () => {
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== currentTitle) {
            saveField(taskId, 'title', newTitle);
        } else if (!newTitle) {
            alert('标题不能为空');
            loadTodos(); // 恢复原状
        }
    };
    
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = currentTitle; input.blur(); }
    });
}

// 描述行内编辑
function startDescEdit(span) {
    const taskId = parseInt(span.getAttribute('data-task-id'));
    const isEmpty = span.classList.contains('task-desc-empty');
    const currentDesc = isEmpty ? '' : span.textContent;
    const input = document.createElement('textarea');
    input.value = currentDesc;
    input.className = 'inline-desc-input';
    input.style.cssText = 'width:100%;padding:4px 8px;border:1px solid #4CAF50;border-radius:4px;font-size:12px;resize:vertical;min-height:40px;';
    
    span.replaceWith(input);
    input.focus();
    
    const save = () => {
        saveField(taskId, 'description', input.value.trim());
    };
    
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = currentDesc; input.blur(); }
    });
}

// 行内快速添加子任务
async function promptAddChild(taskId) {
    const title = prompt('输入子任务标题：');
    if (!title || !title.trim()) return;
    try {
        await fetch('/api/todos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title.trim(), parent_id: taskId })
        });
        loadTodos();
    } catch (error) {
        alert('添加子任务失败');
    }
}

// 渲染 todos 列表
function renderTodos(todos) {
    if (!todos || todos.length === 0) return '';
    return `<div class="todos-list">${todos.map(todo => `
        <div class="todo-item ${todo.completed ? 'completed' : ''}" data-todo-id="${todo.id}">
            <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''} data-todo-id="${todo.id}" data-action="toggle-todo">
            <span class="todo-text">${escapeHtml(todo.title)}</span>
            <span class="todo-delete" data-todo-id="${todo.id}" data-action="delete-todo">×</span>
        </div>
    `).join('')}</div>`;
}

// 添加 todo
async function promptAddTodo(taskId) {
    const title = prompt('输入待办内容：');
    if (!title || !title.trim()) return;
    
    try {
        const response = await fetch(`/api/todos/${taskId}/steps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title.trim() })
        });
        
        if (response.ok) {
            loadTodos();
        } else {
            alert('添加待办失败');
        }
    } catch (error) {
        console.error('添加待办失败:', error);
        alert('添加待办失败');
    }
}

// 切换 todo 状态
async function toggleTodo(todoId, completed) {
    try {
        const response = await fetch(`/api/steps/${todoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed })
        });
        
        if (response.ok) {
            loadTodos();
        } else {
            alert('更新待办状态失败');
        }
    } catch (error) {
        console.error('更新待办状态失败:', error);
        alert('更新待办状态失败');
    }
}

// 删除 todo
async function deleteTodo(todoId) {
    if (!confirm('确定删除这个待办？')) return;
    
    try {
        const response = await fetch(`/api/steps/${todoId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadTodos();
        } else {
            alert('删除待办失败');
        }
    } catch (error) {
        console.error('删除待办失败:', error);
        alert('删除待办失败');
    }
}

// 删除任务
async function deleteTask(taskId) {
    if (!confirm('确定删除此任务及其所有子任务？\n此操作不可恢复！')) return;
    try {
        await fetch(`/api/todos/${taskId}`, { method: 'DELETE' });
        loadTodos();
    } catch (error) {
        console.error('删除失败:', error);
        alert('删除任务失败');
    }
}

// 归档任务
async function archiveTask(taskId) {
    if (!confirm('确定归档此任务及其所有子任务？\n归档后仅可查看和修改描述。')) return;
    try {
        const response = await fetch(`/api/todos/${taskId}/archive`, { method: 'POST' });
        const result = await response.json();
        if (response.ok) {
            alert('归档成功');
            loadTodos();
            loadArchivedTodos();
        } else {
            alert(result.error || '归档失败');
        }
    } catch (error) {
        console.error('归档失败:', error);
        alert('归档失败');
    }
}

// 还原任务
async function restoreTask(taskId) {
    if (!confirm('确定还原此任务？\n还原后可继续编辑。')) return;
    try {
        const response = await fetch(`/api/todos/${taskId}/restore`, { method: 'POST' });
        const result = await response.json();
        if (response.ok) {
            alert('还原成功');
            loadTodos();
            loadArchivedTodos();
        } else {
            alert(result.error || '还原失败');
        }
    } catch (error) {
        console.error('还原失败:', error);
        alert('还原失败');
    }
}

// 加载已归档任务
async function loadArchivedTodos() {
    try {
        const response = await fetch('/api/todos/archived');
        archivedTasks = await response.json();
        renderArchivedTasks();
    } catch (error) {
        console.error('加载归档任务失败:', error);
    }
}

// 渲染已归档任务
function renderArchivedTasks() {
    const container = document.getElementById('archived-task-list');
    if (!container) return;
    
    if (archivedTasks.length === 0) {
        container.innerHTML = '<div class="empty-state" style="color:#999;padding:20px;text-align:center;">暂无已归档任务</div>';
        return;
    }
    
    let html = '';
    archivedTasks.forEach(task => {
        const childrenHtml = renderArchivedChildren(task.children || []);
        html += `
            <div class="archived-task-item" data-task-id="${task.id}">
                <div class="archived-task-info">
                    <div class="archived-task-title">${escapeHtml(task.title)}</div>
                    <div class="archived-task-meta">
                        归档时间：${task.archived_at || ''}
                        ${task.children && task.children.length > 0 ? ` | 子任务：${task.children.length}个` : ''}
                    </div>
                    ${childrenHtml ? `<div class="archived-children-list">${childrenHtml}</div>` : ''}
                </div>
                <div class="archived-task-actions">
                    <button class="btn btn-secondary" data-task-id="${task.id}" data-action="restore-task">🔄 还原</button>
                    <button class="btn btn-secondary" data-task-id="${task.id}" data-action="view-archived-desc">📝 查看描述</button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // 绑定事件
    container.querySelectorAll('[data-action="restore-task"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const taskId = parseInt(btn.getAttribute('data-task-id'));
            restoreTask(taskId);
        });
    });
    
    container.querySelectorAll('[data-action="view-archived-desc"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const taskId = parseInt(btn.getAttribute('data-task-id'));
            viewArchivedDescription(taskId);
        });
    });
}

// 渲染已归档子任务
function renderArchivedChildren(children) {
    if (!children || children.length === 0) return '';
    let html = '';
    children.forEach(child => {
        html += `<div>└ ${escapeHtml(child.title)} (${child.status})</div>`;
        if (child.children && child.children.length > 0) {
            html += renderArchivedChildren(child.children);
        }
    });
    return html;
}

// 查看已归档任务描述
function viewArchivedDescription(taskId) {
    const task = archivedTasks.find(t => t.id === taskId);
    if (!task) return;
    
    const newDesc = prompt('查看/修改描述（仅描述可编辑）：', task.description || '');
    if (newDesc !== null && newDesc !== task.description) {
        fetch(`/api/todos/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: newDesc })
        }).then(() => {
            alert('描述已更新');
            loadArchivedTodos();
        }).catch(err => {
            console.error('更新描述失败:', err);
            alert('更新描述失败');
        });
    }
}

// 切换历史任务区域
function toggleArchivedSection() {
    const list = document.getElementById('archived-task-list');
    const btn = document.getElementById('btn-toggle-archived');
    if (list.style.display === 'none') {
        list.style.display = 'block';
        btn.textContent = '收起';
    } else {
        list.style.display = 'none';
        btn.textContent = '展开';
    }
}

// ========== 附件管理 ==========

// 绑定附件弹窗事件
function bindAttachmentEvents() {
    const modal = document.getElementById('attachment-modal');
    const closeBtn = document.getElementById('btn-attachment-close');
    const uploadBtn = document.getElementById('btn-upload-attachment');
    const fileInput = document.getElementById('attachment-file-input');
    
    closeBtn.addEventListener('click', closeAttachmentModal);
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAttachmentModal();
    });
    
    uploadBtn.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file || !currentAttachmentTaskId) return;
        
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const response = await fetch(`/api/todos/${currentAttachmentTaskId}/attachments`, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            if (response.ok) {
                alert('上传成功');
                loadAttachments(currentAttachmentTaskId);
                loadTodos(); // 刷新主列表以更新附件数量
            } else {
                alert(result.error || '上传失败');
            }
        } catch (error) {
            console.error('上传失败:', error);
            alert('上传失败');
        }
        
        fileInput.value = '';
    });
}

// 打开附件弹窗
function openAttachmentModal(taskId) {
    currentAttachmentTaskId = taskId;
    const modal = document.getElementById('attachment-modal');
    modal.style.display = 'flex';
    loadAttachments(taskId);
}

// 关闭附件弹窗
function closeAttachmentModal() {
    document.getElementById('attachment-modal').style.display = 'none';
    currentAttachmentTaskId = null;
}

// 加载附件列表
async function loadAttachments(taskId) {
    try {
        const response = await fetch(`/api/todos/${taskId}/attachments`);
        const attachments = await response.json();
        renderAttachments(attachments);
    } catch (error) {
        console.error('加载附件失败:', error);
    }
}

// 渲染附件列表
function renderAttachments(attachments) {
    const container = document.getElementById('attachment-list');
    if (!container) return;
    
    if (attachments.length === 0) {
        container.innerHTML = '<div class="empty-state" style="color:#999;padding:20px;text-align:center;">暂无附件</div>';
        return;
    }
    
    let html = '';
    attachments.forEach(att => {
        const sizeStr = formatFileSize(att.file_size);
        html += `
            <div class="attachment-item" data-attachment-id="${att.id}">
                <div class="attachment-info">
                    <div class="attachment-name" title="${escapeHtml(att.filename)}">${escapeHtml(att.filename)}</div>
                    <div class="attachment-meta">${sizeStr} | ${att.uploaded_at || ''}</div>
                </div>
                <div class="attachment-actions">
                    <button class="btn btn-secondary" data-attachment-id="${att.id}" data-action="download-attachment">📥 下载</button>
                    <button class="btn btn-secondary" data-attachment-id="${att.id}" data-action="delete-attachment">🗑️ 删除</button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // 绑定事件
    container.querySelectorAll('[data-action="download-attachment"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const attId = parseInt(btn.getAttribute('data-attachment-id'));
            window.open(`/api/attachments/${attId}/download`, '_blank');
        });
    });
    
    container.querySelectorAll('[data-action="delete-attachment"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const attId = parseInt(btn.getAttribute('data-attachment-id'));
            if (!confirm('确定删除此附件？')) return;
            
            try {
                const response = await fetch(`/api/attachments/${attId}`, { method: 'DELETE' });
                if (response.ok) {
                    alert('删除成功');
                    loadAttachments(currentAttachmentTaskId);
                    loadTodos();
                } else {
                    alert('删除失败');
                }
            } catch (error) {
                console.error('删除失败:', error);
                alert('删除失败');
            }
        });
    });
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
    }
    return size.toFixed(2) + ' ' + units[i];
}

// 保存字段（标题、描述、优先级、日期）
async function saveField(taskId, field, value) {
    if (field === 'title' && !value) { alert('标题不能为空'); return; }
    try {
        await fetch(`/api/todos/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [field]: value })
        });
        loadTodos();
    } catch (error) {
        console.error('保存失败:', error);
    }
}

// 保存状态（走专门的 status 接口）
async function saveStatus(taskId, newStatus) {
    try {
        await fetch(`/api/todos/${taskId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus, remark: '手动更新状态' })
        });
        loadTodos();
    } catch (error) {
        console.error('更新状态失败:', error);
    }
}

// 根据进度返回颜色
function getProgressColor(progress) {
    if (progress === 100) return '#4CAF50';
    if (progress >= 50) return '#2196F3';
    if (progress > 0) return '#FF9800';
    return '#e0e0e0';
}


// 打开创建弹窗
function openCreateModal() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('todo-title').value = '';
    document.getElementById('todo-description').value = '';
    document.getElementById('todo-priority').value = '中';
    document.getElementById('todo-start-date').value = today;
    document.getElementById('todo-end-date').value = today;
    document.getElementById('create-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('todo-title').focus(), 100);
}

// 关闭创建弹窗
function closeCreateModal() {
    document.getElementById('create-modal').style.display = 'none';
}

// 创建任务
async function createTodo() {
    const title = document.getElementById('todo-title').value.trim();
    const description = document.getElementById('todo-description').value.trim();
    const priority = document.getElementById('todo-priority').value;
    const startDate = document.getElementById('todo-start-date').value;
    const endDate = document.getElementById('todo-end-date').value;
    if (!title) { alert('请输入任务标题'); return; }
    try {
        await fetch('/api/todos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description, priority, start_date: startDate, end_date: endDate })
        });
        closeCreateModal();
        loadTodos();
    } catch (error) {
        alert('创建任务失败');
    }
}

// 导出
async function exportTodos() {
    const startDate = document.getElementById('export-start-date').value;
    const endDate = document.getElementById('export-end-date').value;
    let url = '/api/todos/export?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    window.location.href = url;
    document.getElementById('export-panel').style.display = 'none';
}

// 导入
async function importTodos(event) {
    const file = event.target.files[0];
    if (!file) return;
    const resultDiv = document.getElementById('import-result');
    resultDiv.innerHTML = '<span style="color:#666;">正在导入...</span>';
    const formData = new FormData();
    formData.append('file', file);
    try {
        const response = await fetch('/api/todos/import', { method: 'POST', body: formData });
        const result = await response.json();
        if (response.ok && result.success) {
            let msg = `<span style="color:#4CAF50;">✅ 导入成功！成功 ${result.success_count} 条`;
            if (result.error_count > 0) msg += `，失败 ${result.error_count} 条`;
            msg += '</span>';
            if (result.errors && result.errors.length > 0) {
                msg += '<div style="margin-top:8px;color:#f44336;font-size:13px;">';
                result.errors.forEach(err => { msg += `<div>${escapeHtml(err)}</div>`; });
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


// 列宽拖拽
function initColumnResizer() {
    const header = document.querySelector('.table-header');
    if (!header) return;
    header.querySelectorAll('.col-resizer').forEach(r => r.remove());
    const cols = header.querySelectorAll(':scope > div');
    cols.forEach((col, index) => {
        if (index === cols.length - 1) return;
        const resizer = document.createElement('div');
        resizer.className = 'col-resizer';
        col.appendChild(resizer);
        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault(); e.stopPropagation();
            initResize(col, e);
        });
    });
}

function initResize(col, startEvent) {
    const startX = startEvent.clientX;
    const startWidth = col.offsetWidth;
    function doResize(e) {
        const newWidth = Math.max(50, startWidth + (e.clientX - startX));
        col.style.width = newWidth + 'px'; col.style.minWidth = newWidth + 'px'; col.style.flex = 'none';
        const colIndex = Array.from(col.parentElement.children).indexOf(col);
        document.querySelectorAll('.task-row').forEach(row => {
            const cell = row.children[colIndex];
            if (cell) { cell.style.width = newWidth+'px'; cell.style.minWidth = newWidth+'px'; cell.style.flex = 'none'; }
        });
    }
    function stopResize() {
        document.removeEventListener('mousemove', doResize);
        document.removeEventListener('mouseup', stopResize);
        document.body.style.cursor = ''; document.body.style.userSelect = '';
    }
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
}
