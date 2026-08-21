// chat.js - 智能周报助手前端逻辑

(function() {
    'use strict';

    // ============ 状态 ============
    let currentSessionId = null;
    let currentConfigId = null;
    let sessions = {};  // sessionId -> {title, messages: []}
    let isStreaming = false;

    // ============ DOM 元素 ============
    const $messages = document.getElementById('chat-messages');
    const $input = document.getElementById('chat-input');
    const $send = document.getElementById('btn-send');
    const $sessionList = document.getElementById('session-list');
    const $templateSelector = document.getElementById('template-selector');
    const $inputHint = document.getElementById('input-hint');

    // ============ 初始化 ============
    async function init() {
        await loadSessions();
        await loadConfigs();
        await loadTemplates();
        await checkDefaultConfig();
        bindEvents();
    }

    // ============ API 调用 ============
    async function api(url, options = {}) {
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            ...options
        });
        return res.json();
    }

    // ============ 配置管理 ============
    let configs = [];

    async function loadConfigs() {
        configs = await api('/api/chat/configs');
        updateTemplateSelector();
    }

    async function checkDefaultConfig() {
        const hasDefault = configs.some(c => c.is_default);
        if (!hasDefault && configs.length === 0) {
            $inputHint.textContent = '⚠️ 请先配置模型API（点击左侧"模型配置"）';
            $inputHint.style.color = '#ff9800';
        } else {
            $inputHint.textContent = '';
            $inputHint.style.color = '';
            const def = configs.find(c => c.is_default) || configs[0];
            currentConfigId = def.id;
        }
    }

    function renderConfigList() {
        const $list = document.getElementById('config-list');
        if (configs.length === 0) {
            $list.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">暂无配置，请添加</p>';
            return;
        }
        $list.innerHTML = configs.map(c => `
            <div class="config-item" data-id="${c.id}">
                <div class="config-item-info">
                    <div class="name">${esc(c.name)} ${c.is_default ? '<span class="badge badge-default">默认</span>' : ''}</div>
                    <div class="url">${esc(c.api_url)} · ${esc(c.model_name || '未设置模型')}</div>
                </div>
                <div class="config-item-actions">
                    <button class="btn btn-sm btn-secondary" onclick="chatApp.editConfig(${c.id})">编辑</button>
                    <button class="btn btn-sm btn-danger" onclick="chatApp.deleteConfig(${c.id})">删除</button>
                </div>
            </div>
        `).join('');
    }

    // ============ 模板管理 ============
    let templates = [];

    async function loadTemplates() {
        templates = await api('/api/chat/templates');
        updateTemplateSelector();
    }

    function updateTemplateSelector() {
        $templateSelector.innerHTML = '<option value="">选择周报模板</option>' +
            templates.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
    }

    function renderTemplateList() {
        const $list = document.getElementById('template-list');
        if (templates.length === 0) {
            $list.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">暂无模板，请添加</p>';
            return;
        }
        $list.innerHTML = templates.map(t => `
            <div class="template-item" data-id="${t.id}">
                <div class="template-item-info">
                    <div class="name">${esc(t.name)} ${t.is_default ? '<span class="badge badge-default">默认</span>' : ''}</div>
                    <div class="desc">${esc(t.description || '无描述')}</div>
                </div>
                <div class="template-item-actions">
                    <button class="btn btn-sm btn-secondary" onclick="chatApp.editTemplate(${t.id})">编辑</button>
                    <button class="btn btn-sm btn-danger" onclick="chatApp.deleteTemplate(${t.id})">删除</button>
                </div>
            </div>
        `).join('');
    }

    // ============ 会话管理 ============
    async function loadSessions() {
        const data = await api('/api/chat/sessions');
        sessions = {};
        data.forEach(s => {
            sessions[s.session_id] = s;
        });
        renderSessionList();
    }

    function renderSessionList() {
        const sortedSessions = Object.values(sessions).sort((a, b) => 
            new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
        );
        
        if (sortedSessions.length === 0) {
            $sessionList.innerHTML = '<div style="color:#666;font-size:12px;padding:8px;">暂无对话</div>';
            return;
        }
        
        $sessionList.innerHTML = sortedSessions.map(s => `
            <div class="session-item ${s.session_id === currentSessionId ? 'active' : ''}" 
                 onclick="chatApp.switchSession('${s.session_id}')">
                <span class="session-title">${esc(s.title || '新对话')}</span>
                <span class="session-delete" onclick="event.stopPropagation();chatApp.deleteSession('${s.session_id}')" title="删除">×</span>
            </div>
        `).join('');
    }

    async function switchSession(sessionId) {
        currentSessionId = sessionId;
        renderSessionList();
        await loadMessages(sessionId);
    }

    async function loadMessages(sessionId) {
        const messages = await api(`/api/chat/messages/${sessionId}`);
        $messages.innerHTML = '';
        if (messages.length === 0) {
            showWelcome();
            return;
        }
        messages.forEach(m => appendMessage(m.role, m.content, false));
        scrollToBottom();
    }

    async function deleteSession(sessionId) {
        if (!confirm('确定删除此对话？')) return;
        await api(`/api/chat/sessions/${sessionId}`, { method: 'DELETE' });
        delete sessions[sessionId];
        if (currentSessionId === sessionId) {
            currentSessionId = null;
            showWelcome();
        }
        renderSessionList();
    }

    // ============ 消息渲染 ============
    function showWelcome() {
        $messages.innerHTML = `
            <div class="welcome-message">
                <h2>👋 欢迎使用智能周报助手</h2>
                <p>我可以帮你：</p>
                <ul>
                    <li>📊 根据任务记录生成周报</li>
                    <li>📈 统计任务完成情况</li>
                    <li>📋 按模板格式化输出</li>
                </ul>
                <p class="hint">💡 提示：先在左侧配置模型API，然后开始对话吧！</p>
            </div>
        `;
    }

    function appendMessage(role, content, animate = true) {
        // 清除欢迎消息
        const welcome = $messages.querySelector('.welcome-message');
        if (welcome) welcome.remove();

        const avatar = role === 'user' ? '👤' : role === 'assistant' ? '🤖' : '⚙️';
        const $msg = document.createElement('div');
        $msg.className = `message ${role}`;
        
        const $avatar = document.createElement('div');
        $avatar.className = 'message-avatar';
        $avatar.textContent = avatar;
        
        const $content = document.createElement('div');
        $content.className = 'message-content';
        
        if (role === 'assistant' || role === 'system') {
            $content.innerHTML = marked.parse(content);
        } else {
            $content.textContent = content;
        }
        
        $msg.appendChild($avatar);
        $msg.appendChild($content);
        $messages.appendChild($msg);
        
        if (animate) scrollToBottom();
        return $content;
    }

    function appendStreamingChunk($contentEl, fullText) {
        $contentEl.innerHTML = marked.parse(fullText);
        scrollToBottom();
    }

    function showTypingIndicator() {
        const $msg = document.createElement('div');
        $msg.className = 'message assistant';
        $msg.id = 'typing-msg';
        $msg.innerHTML = `
            <div class="message-avatar">🤖</div>
            <div class="message-content">
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
        $messages.appendChild($msg);
        scrollToBottom();
    }

    function removeTypingIndicator() {
        const el = document.getElementById('typing-msg');
        if (el) el.remove();
    }

    function scrollToBottom() {
        $messages.scrollTop = $messages.scrollHeight;
    }

    // ============ 聊天核心 ============
    async function sendMessage(text) {
        if (!text.trim() || isStreaming) return;
        
        // 检查配置
        if (!currentConfigId) {
            alert('请先配置模型API（点击左侧"模型配置"）');
            return;
        }

        // 创建新会话
        if (!currentSessionId) {
            const res = await api('/api/chat/sessions', {
                method: 'POST',
                body: JSON.stringify({ title: text.substring(0, 30) })
            });
            currentSessionId = res.session_id;
            sessions[currentSessionId] = res;
            renderSessionList();
        }

        // 显示用户消息
        appendMessage('user', text);
        $input.value = '';

        // 获取模板内容（如果选中了模板）
        let templateContent = '';
        const selectedTemplateId = $templateSelector.value;
        if (selectedTemplateId) {
            const tpl = templates.find(t => t.id == selectedTemplateId);
            if (tpl) templateContent = tpl.template_content;
        }

        // 流式请求
        isStreaming = true;
        $send.disabled = true;
        showTypingIndicator();

        try {
            const response = await fetch('/api/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: currentSessionId,
                    config_id: currentConfigId,
                    message: text,
                    template: templateContent
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || '请求失败');
            }

            // SSE 流式读取
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let $contentEl = null;

            removeTypingIndicator();
            $contentEl = appendMessage('assistant', '');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.content) {
                                fullText += parsed.content;
                                appendStreamingChunk($contentEl, fullText);
                            }
                            if (parsed.error) {
                                fullText += `\n\n⚠️ 错误: ${parsed.error}`;
                                appendStreamingChunk($contentEl, fullText);
                            }
                        } catch (e) {
                            // 忽略非JSON行
                        }
                    }
                }
            }

            // 如果没收到任何内容
            if (!fullText) {
                $contentEl.innerHTML = '<em style="color:#999">未收到回复</em>';
            }

            // 更新会话标题（用第一条消息）
            const msgs = sessions[currentSessionId];
            if (msgs && (!msgs.title || msgs.title === text.substring(0, 30))) {
                // 标题已经是首条消息截取
            }

        } catch (err) {
            removeTypingIndicator();
            appendMessage('system', `⚠️ 请求失败: ${err.message}`);
        } finally {
            isStreaming = false;
            $send.disabled = false;
        }
    }

    // ============ 周报数据 ============
    async function getWeeklyData() {
        const data = await api('/api/chat/weekly-data');
        return data;
    }

    async function insertWeeklyData() {
        const data = await getWeeklyData();
        const text = formatWeeklyDataForPrompt(data);
        $input.value = `请根据以下本周任务数据，帮我生成周报：\n\n${text}`;
        $input.focus();
    }

    function formatWeeklyDataForPrompt(data) {
        let text = `## 本周任务概况\n`;
        text += `- 统计周期: ${data.week_range}\n`;
        text += `- 总任务数: ${data.total_tasks}\n`;
        text += `- 已完成: ${data.completed}\n`;
        text += `- 进行中: ${data.in_progress}\n`;
        text += `- 待开始: ${data.pending}\n`;
        text += `- 暂挂: ${data.hold}\n`;
        text += `- 已取消: ${data.cancelled}\n\n`;

        // 本周相关统计
        text += `### 本周动态\n`;
        text += `- 本周创建: ${data.created_count} 个任务\n`;
        text += `- 本周开始: ${data.started_count} 个任务\n`;
        text += `- 本周完成: ${data.completed_count} 个任务\n`;
        text += `- 本周结束: ${data.ended_count} 个任务\n\n`;

        if (data.weekly_tasks && data.weekly_tasks.length > 0) {
            text += `### 本周相关任务\n`;
            data.weekly_tasks.forEach(t => {
                let tags = [];
                if (t.is_created_this_week) tags.push('🆕创建');
                if (t.is_started_this_week) tags.push('🚀开始');
                if (t.is_completed_this_week) tags.push('✅完成');
                if (t.is_ended_this_week) tags.push('🏁结束');
                const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
                text += `- ${t.title} (状态: ${t.status}, 优先级: ${t.priority})${tagStr}\n`;
                if (t.start_date) text += `  开始日期: ${t.start_date}\n`;
                if (t.end_date) text += `  结束日期: ${t.end_date}\n`;
                if (t.created_at) text += `  创建时间: ${t.created_at}\n`;
            });
            text += '\n';
        }

        if (data.status_changes.length > 0) {
            text += `### 本周状态变更记录\n`;
            data.status_changes.forEach(c => {
                text += `- ${c.todo_title}: ${c.old_status} → ${c.new_status} (${c.changed_at})\n`;
                if (c.remark) text += `  备注: ${c.remark}\n`;
            });
            text += '\n';
        }

        if (data.in_progress_tasks.length > 0) {
            text += `### 进行中的任务\n`;
            data.in_progress_tasks.forEach(t => {
                text += `- 🔄 ${t.title} (进度: ${t.progress}%, 优先级: ${t.priority})\n`;
            });
            text += '\n';
        }

        return text;
    }

    // ============ 事件绑定 ============
    function bindEvents() {
        // 发送消息
        $send.addEventListener('click', () => sendMessage($input.value));
        $input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage($input.value);
            }
        });

        // 新对话
        document.getElementById('btn-new-chat').addEventListener('click', () => {
            currentSessionId = null;
            showWelcome();
            renderSessionList();
        });

        // 清空对话
        document.getElementById('btn-clear-chat').addEventListener('click', async () => {
            if (!currentSessionId) return;
            if (!confirm('确定清空当前对话？')) return;
            await api(`/api/chat/sessions/${currentSessionId}/clear`, { method: 'POST' });
            showWelcome();
        });

        // 插入任务数据
        document.getElementById('btn-insert-weekly-data').addEventListener('click', insertWeeklyData);

        // 生成周报
        document.getElementById('btn-gen-weekly').addEventListener('click', async () => {
            const data = await getWeeklyData();
            const text = formatWeeklyDataForPrompt(data);
            const tplId = $templateSelector.value;
            let prompt = `请根据以下本周任务数据生成周报：\n\n${text}`;
            if (tplId) {
                const tpl = templates.find(t => t.id == tplId);
                if (tpl) prompt += `\n\n请按以下模板格式输出：\n${tpl.template_content}`;
            }
            sendMessage(prompt);
        });

        // 任务统计
        document.getElementById('btn-gen-summary').addEventListener('click', async () => {
            const data = await getWeeklyData();
            const text = formatWeeklyDataForPrompt(data);
            sendMessage(`请帮我做一个任务统计汇总：\n\n${text}`);
        });

        // 模型配置管理
        document.getElementById('btn-manage-config').addEventListener('click', () => {
            renderConfigList();
            showModal('config-modal');
        });

        document.getElementById('btn-add-config').addEventListener('click', () => {
            openConfigEdit(null);
        });

        document.getElementById('btn-save-config').addEventListener('click', saveConfig);

        // 模板管理
        document.getElementById('btn-manage-template').addEventListener('click', () => {
            renderTemplateList();
            showModal('template-modal');
        });

        document.getElementById('btn-add-template').addEventListener('click', () => {
            openTemplateEdit(null);
        });

        document.getElementById('btn-save-template').addEventListener('click', saveTemplate);

        // 弹窗关闭
        document.querySelectorAll('[data-modal]').forEach(el => {
            el.addEventListener('click', () => {
                hideModal(el.getAttribute('data-modal'));
            });
        });

        // 点击遮罩关闭
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) hideModal(modal.id);
            });
        });
    }

    // ============ 配置 CRUD ============
    function openConfigEdit(config) {
        document.getElementById('config-edit-title').textContent = config ? '编辑配置' : '添加配置';
        document.getElementById('config-edit-id').value = config ? config.id : '';
        document.getElementById('config-name').value = config ? config.name : '';
        document.getElementById('config-url').value = config ? config.api_url : '';
        document.getElementById('config-key').value = '';
        document.getElementById('config-model').value = config ? config.model_name : '';
        document.getElementById('config-prompt').value = config ? config.system_prompt : '';
        document.getElementById('config-default').checked = config ? config.is_default : false;
        showModal('config-edit-modal');
    }

    async function saveConfig() {
        const id = document.getElementById('config-edit-id').value;
        const data = {
            name: document.getElementById('config-name').value.trim(),
            api_url: document.getElementById('config-url').value.trim(),
            api_key: document.getElementById('config-key').value.trim(),
            model_name: document.getElementById('config-model').value.trim(),
            system_prompt: document.getElementById('config-prompt').value.trim(),
            is_default: document.getElementById('config-default').checked
        };

        if (!data.name || !data.api_url) {
            alert('请填写配置名称和API URL');
            return;
        }

        // 编辑时如果没填key，不传
        if (id && !data.api_key) delete data.api_key;

        const url = id ? `/api/chat/configs/${id}` : '/api/chat/configs';
        const method = id ? 'PUT' : 'POST';

        await api(url, { method, body: JSON.stringify(data) });
        await loadConfigs();
        await checkDefaultConfig();
        hideModal('config-edit-modal');
    }

    async function editConfig(id) {
        // 获取完整配置（包含标记，不含完整key）
        const config = configs.find(c => c.id === id);
        if (!config) return;
        openConfigEdit(config);
    }

    async function deleteConfig(id) {
        if (!confirm('确定删除此配置？')) return;
        await api(`/api/chat/configs/${id}`, { method: 'DELETE' });
        await loadConfigs();
        await checkDefaultConfig();
        renderConfigList();
    }

    // ============ 模板 CRUD ============
    function openTemplateEdit(template) {
        document.getElementById('template-edit-title').textContent = template ? '编辑模板' : '添加模板';
        document.getElementById('template-edit-id').value = template ? template.id : '';
        document.getElementById('template-name').value = template ? template.name : '';
        document.getElementById('template-desc').value = template ? template.description : '';
        document.getElementById('template-content').value = template ? template.template_content : '';
        document.getElementById('template-default').checked = template ? template.is_default : false;
        showModal('template-edit-modal');
    }

    async function saveTemplate() {
        const id = document.getElementById('template-edit-id').value;
        const data = {
            name: document.getElementById('template-name').value.trim(),
            description: document.getElementById('template-desc').value.trim(),
            template_content: document.getElementById('template-content').value.trim(),
            is_default: document.getElementById('template-default').checked
        };

        if (!data.name || !data.template_content) {
            alert('请填写模板名称和内容');
            return;
        }

        const url = id ? `/api/chat/templates/${id}` : '/api/chat/templates';
        const method = id ? 'PUT' : 'POST';

        await api(url, { method, body: JSON.stringify(data) });
        await loadTemplates();
        hideModal('template-edit-modal');
        renderTemplateList();
    }

    async function editTemplate(id) {
        const tpl = templates.find(t => t.id === id);
        if (!tpl) return;
        openTemplateEdit(tpl);
    }

    async function deleteTemplate(id) {
        if (!confirm('确定删除此模板？')) return;
        await api(`/api/chat/templates/${id}`, { method: 'DELETE' });
        await loadTemplates();
        renderTemplateList();
    }

    // ============ 弹窗工具 ============
    function showModal(id) {
        document.getElementById(id).style.display = 'flex';
    }

    function hideModal(id) {
        document.getElementById(id).style.display = 'none';
    }

    // ============ 工具函数 ============
    function esc(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    // ============ 暴露全局方法 ============
    window.chatApp = {
        switchSession,
        deleteSession,
        editConfig,
        deleteConfig,
        editTemplate,
        deleteTemplate
    };

    // ============ 启动 ============
    init();

})();
