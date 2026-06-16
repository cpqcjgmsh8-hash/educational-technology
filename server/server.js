const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const COZE_API_BASE = 'https://api.coze.cn';
const BOT_ID = process.env.BOT_ID;
const ASSISTANT_BOT_ID = process.env.ASSISTANT_BOT_ID;
const TEACHER_BOT_ID = process.env.TEACHER_BOT_ID;
const TOKEN = process.env.COZE_TOKEN;

// 阿里云 DashScope API 配置
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const DASHSCOPE_API_BASE = 'https://dashscope.aliyuncs.com/api/v1';

app.post('/api/chat', async (req, res) => {
    try {
        const { userId, message } = req.body;

        if (!message) {
            return res.status(400).json({ code: 400, msg: '消息内容不能为空' });
        }

        console.log('发送请求到 Coze API...');

        const response = await fetch(`${COZE_API_BASE}/v3/chat`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bot_id: BOT_ID,
                user_id: userId || 'student_001',
                stream: false,
                auto_save_history: true,
                additional_messages: [
                    {
                        role: 'user',
                        content: message,
                        content_type: 'text'
                    }
                ]
            })
        });

        const responseText = await response.text();

        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error('JSON 解析失败:', e.message);
            return res.status(500).json({ code: 500, msg: 'API响应格式错误' });
        }

        if (data.code === 0 && data.data) {
            const chatId = data.data.id;
            const conversationId = data.data.conversation_id;
            console.log('Chat ID:', chatId);
            console.log('Conversation ID:', conversationId);

            let retries = 0;
            const maxRetries = 20;

            const pollForResult = async () => {
                try {
                    const retrieveRes = await fetch(`${COZE_API_BASE}/v3/chat/retrieve?chat_id=${chatId}&conversation_id=${conversationId}`, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${TOKEN}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    const retrieveData = await retrieveRes.json();

                    if (retrieveData.code === 0 && retrieveData.data) {
                        const status = retrieveData.data.status;

                        if (status === 'completed') {
                            const messagesRes = await fetch(`${COZE_API_BASE}/v3/chat/message/list?chat_id=${chatId}&conversation_id=${conversationId}`, {
                                method: 'GET',
                                headers: {
                                    'Authorization': `Bearer ${TOKEN}`,
                                    'Content-Type': 'application/json'
                                }
                            });
                            const messagesData = await messagesRes.json();

                            if (messagesData.code === 0 && messagesData.data) {
                                const assistantMsg = messagesData.data.find(m => m.role === 'assistant' && m.type === 'answer');
                                if (assistantMsg) {
                                    return res.json({ code: 0, content: assistantMsg.content });
                                }

                                const verboseMsg = messagesData.data.find(m => m.role === 'assistant' && m.type === 'verbose');
                                if (verboseMsg) {
                                    return res.json({ code: 0, content: verboseMsg.content });
                                }
                            }
                            return res.json({ code: 0, content: '抱歉，暂时无法获取回复内容' });
                        } else if (status === 'failed') {
                            return res.status(500).json({ code: 500, msg: '智能体处理失败' });
                        }
                    }

                    retries++;
                    if (retries < maxRetries) {
                        console.log(`等待中... (${retries}/${maxRetries})`);
                        setTimeout(pollForResult, 2000);
                    } else {
                        return res.status(500).json({ code: 500, msg: '等待回复超时' });
                    }
                } catch (error) {
                    console.error('轮询错误:', error);
                    return res.status(500).json({ code: 500, msg: '获取回复失败' });
                }
            };

            pollForResult();
        } else {
            res.status(400).json({ code: data.code || 400, msg: data.msg || 'API请求失败' });
        }
    } catch (error) {
        console.error('服务器错误:', error);
        res.status(500).json({ code: 500, msg: '服务器内部错误', error: error.message });
    }
});

app.post('/api/chat/stream', async (req, res) => {
    try {
        const { userId, message } = req.body;

        if (!message) {
            return res.status(400).json({ code: 400, msg: '消息内容不能为空' });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        console.log('发送流式请求到 Coze API...');

        const response = await fetch(`${COZE_API_BASE}/v3/chat`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bot_id: BOT_ID,
                user_id: userId || 'student_001',
                stream: false,
                auto_save_history: true,
                additional_messages: [
                    {
                        role: 'user',
                        content: message,
                        content_type: 'text'
                    }
                ]
            })
        });

        console.log('Coze API 响应状态:', response.status);

        const responseText = await response.text();
        let data;

        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error('JSON 解析失败:', e.message);
            res.write(`data: ${JSON.stringify({ error: 'API响应格式错误' })}\n\n`);
            res.end();
            return;
        }

        if (data.code !== 0 || !data.data) {
            console.log('API 请求失败:', data.msg);
            res.write(`data: ${JSON.stringify({ error: data.msg || 'API请求失败' })}\n\n`);
            res.end();
            return;
        }

        const chatId = data.data.id;
        const conversationId = data.data.conversation_id;
        console.log('Chat ID:', chatId);
        console.log('Conversation ID:', conversationId);

        let retries = 0;
        const maxRetries = 30;
        let sentLoading = false;

        const pollAndStream = async () => {
            if (res.writableEnded) {
                console.log('响应已关闭，停止轮询');
                return;
            }

            try {
                const retrieveRes = await fetch(`${COZE_API_BASE}/v3/chat/retrieve?chat_id=${chatId}&conversation_id=${conversationId}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                });
                const retrieveData = await retrieveRes.json();

                if (retrieveData.code === 0 && retrieveData.data) {
                    const status = retrieveData.data.status;

                    if (status === 'completed') {
                        const messagesRes = await fetch(`${COZE_API_BASE}/v3/chat/message/list?chat_id=${chatId}&conversation_id=${conversationId}`, {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${TOKEN}`,
                                'Content-Type': 'application/json'
                            }
                        });
                        const messagesData = await messagesRes.json();

                        if (messagesData.code === 0 && messagesData.data) {
                            const assistantMsg = messagesData.data.find(m => m.role === 'assistant' && m.type === 'answer');
                            if (assistantMsg && assistantMsg.content) {
                                const fullContent = assistantMsg.content;
                                for (let i = 0; i < fullContent.length; i++) {
                                    if (res.writableEnded) break;
                                    res.write(`data: ${JSON.stringify({ content: fullContent[i] })}\n\n`);
                                    await new Promise(r => setTimeout(r, 20));
                                }
                                if (!res.writableEnded) {
                                    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                                    res.end();
                                }
                                return;
                            }
                        }
                        if (!res.writableEnded) {
                            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                            res.end();
                        }
                    } else if (status === 'failed') {
                        if (!res.writableEnded) {
                            res.write(`data: ${JSON.stringify({ error: '智能体处理失败' })}\n\n`);
                            res.end();
                        }
                    }
                }

                retries++;
                if (retries < maxRetries) {
                    console.log(`轮询中... (${retries}/${maxRetries})`);
                    if (!sentLoading && !res.writableEnded) {
                        res.write(`data: ${JSON.stringify({ content: '.' })}\n\n`);
                        sentLoading = true;
                    }
                    setTimeout(pollAndStream, 1500);
                } else {
                    if (!res.writableEnded) {
                        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                        res.end();
                    }
                }
            } catch (error) {
                console.error('轮询错误:', error);
                if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                    res.end();
                }
            }
        };

        pollAndStream();

    } catch (error) {
        console.error('流式服务器错误:', error);
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
            res.end();
        }
    }
});

app.post('/api/chat/assistant/stream', async (req, res) => {
    try {
        const { userId, message } = req.body;

        if (!message) {
            return res.status(400).json({ code: 400, msg: '消息内容不能为空' });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        console.log('发送助教请求到 Coze API...');

        const response = await fetch(`${COZE_API_BASE}/v3/chat`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bot_id: ASSISTANT_BOT_ID,
                user_id: userId || 'student_001',
                stream: false,
                auto_save_history: true,
                additional_messages: [
                    {
                        role: 'user',
                        content: message,
                        content_type: 'text'
                    }
                ]
            })
        });

        console.log('Coze API 响应状态:', response.status);

        const responseText = await response.text();
        let data;

        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error('JSON 解析失败:', e.message);
            res.write(`data: ${JSON.stringify({ error: 'API响应格式错误' })}\n\n`);
            res.end();
            return;
        }

        if (data.code !== 0 || !data.data) {
            console.log('API 请求失败:', data.msg);
            res.write(`data: ${JSON.stringify({ error: data.msg || 'API请求失败' })}\n\n`);
            res.end();
            return;
        }

        const chatId = data.data.id;
        const conversationId = data.data.conversation_id;
        console.log('助教 Chat ID:', chatId);
        console.log('助教 Conversation ID:', conversationId);

        let retries = 0;
        const maxRetries = 30;
        let sentLoading = false;

        const pollAndStream = async () => {
            if (res.writableEnded) {
                console.log('响应已关闭，停止轮询');
                return;
            }

            try {
                const retrieveRes = await fetch(`${COZE_API_BASE}/v3/chat/retrieve?chat_id=${chatId}&conversation_id=${conversationId}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                });
                const retrieveData = await retrieveRes.json();

                if (retrieveData.code === 0 && retrieveData.data) {
                    const status = retrieveData.data.status;

                    if (status === 'completed') {
                        const messagesRes = await fetch(`${COZE_API_BASE}/v3/chat/message/list?chat_id=${chatId}&conversation_id=${conversationId}`, {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${TOKEN}`,
                                'Content-Type': 'application/json'
                            }
                        });
                        const messagesData = await messagesRes.json();

                        if (messagesData.code === 0 && messagesData.data) {
                            const assistantMsg = messagesData.data.find(m => m.role === 'assistant' && m.type === 'answer');
                            if (assistantMsg && assistantMsg.content) {
                                const fullContent = assistantMsg.content;
                                for (let i = 0; i < fullContent.length; i++) {
                                    if (res.writableEnded) break;
                                    res.write(`data: ${JSON.stringify({ content: fullContent[i] })}\n\n`);
                                    await new Promise(r => setTimeout(r, 20));
                                }
                                if (!res.writableEnded) {
                                    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                                    res.end();
                                }
                                return;
                            }
                        }
                        if (!res.writableEnded) {
                            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                            res.end();
                        }
                    } else if (status === 'failed') {
                        if (!res.writableEnded) {
                            res.write(`data: ${JSON.stringify({ error: '智能体处理失败' })}\n\n`);
                            res.end();
                        }
                    }
                }

                retries++;
                if (retries < maxRetries) {
                    console.log(`助教轮询中... (${retries}/${maxRetries})`);
                    if (!sentLoading && !res.writableEnded) {
                        res.write(`data: ${JSON.stringify({ content: '.' })}\n\n`);
                        sentLoading = true;
                    }
                    setTimeout(pollAndStream, 1500);
                } else {
                    if (!res.writableEnded) {
                        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                        res.end();
                    }
                }
            } catch (error) {
                console.error('轮询错误:', error);
                if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                    res.end();
                }
            }
        };

        pollAndStream();

    } catch (error) {
        console.error('流式服务器错误:', error);
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
            res.end();
        }
    }
});

app.post('/api/chat/teacher/stream', async (req, res) => {
    try {
        const { userId, message } = req.body;

        if (!message) {
            return res.status(400).json({ code: 400, msg: '消息内容不能为空' });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        console.log('发送教师请求到 Coze API...');

        const response = await fetch(`${COZE_API_BASE}/v3/chat`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bot_id: TEACHER_BOT_ID,
                user_id: userId || 'student_001',
                stream: false,
                auto_save_history: true,
                additional_messages: [
                    {
                        role: 'user',
                        content: message,
                        content_type: 'text'
                    }
                ]
            })
        });

        console.log('Coze API 响应状态:', response.status);

        const responseText = await response.text();
        let data;

        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error('JSON 解析失败:', e.message);
            res.write(`data: ${JSON.stringify({ error: 'API响应格式错误' })}\n\n`);
            res.end();
            return;
        }

        if (data.code !== 0 || !data.data) {
            console.log('API 请求失败:', data.msg);
            res.write(`data: ${JSON.stringify({ error: data.msg || 'API请求失败' })}\n\n`);
            res.end();
            return;
        }

        const chatId = data.data.id;
        const conversationId = data.data.conversation_id;
        console.log('教师 Chat ID:', chatId);
        console.log('教师 Conversation ID:', conversationId);

        let retries = 0;
        const maxRetries = 30;
        let sentLoading = false;

        const pollAndStream = async () => {
            if (res.writableEnded) {
                console.log('响应已关闭，停止轮询');
                return;
            }

            try {
                const retrieveRes = await fetch(`${COZE_API_BASE}/v3/chat/retrieve?chat_id=${chatId}&conversation_id=${conversationId}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                });
                const retrieveData = await retrieveRes.json();

                console.log('教师Retrieve响应:', JSON.stringify(retrieveData).substring(0, 300));

                if (retrieveData.code === 0 && retrieveData.data) {
                    const status = retrieveData.data.status;
                    console.log(`教师状态: ${status}`);

                    if (status === 'completed') {
                        const messagesRes = await fetch(`${COZE_API_BASE}/v3/chat/message/list?chat_id=${chatId}&conversation_id=${conversationId}`, {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${TOKEN}`,
                                'Content-Type': 'application/json'
                            }
                        });
                        const messagesData = await messagesRes.json();

                        if (messagesData.code === 0 && messagesData.data) {
                            // 优先查找 answer 类型
                            let assistantMsg = messagesData.data.find(m => m.role === 'assistant' && m.type === 'answer');
                            // 如果没有 answer 类型，查找 verbose 类型
                            if (!assistantMsg) {
                                assistantMsg = messagesData.data.find(m => m.role === 'assistant' && m.type === 'verbose');
                            }
                            // 如果还是没有，查找任何 assistant 类型的消息
                            if (!assistantMsg) {
                                assistantMsg = messagesData.data.find(m => m.role === 'assistant');
                            }

                            if (assistantMsg && assistantMsg.content) {
                                const fullContent = assistantMsg.content;
                                for (let i = 0; i < fullContent.length; i++) {
                                    if (res.writableEnded) break;
                                    res.write(`data: ${JSON.stringify({ content: fullContent[i] })}\n\n`);
                                    await new Promise(r => setTimeout(r, 20));
                                }
                                if (!res.writableEnded) {
                                    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                                    res.end();
                                }
                                return;
                            }
                        }
                        if (!res.writableEnded) {
                            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                            res.end();
                        }
                    } else if (status === 'failed') {
                        if (!res.writableEnded) {
                            res.write(`data: ${JSON.stringify({ error: '智能体处理失败' })}\n\n`);
                            res.end();
                        }
                    } else {
                        // 处理其他状态（in_progress, pending等），继续轮询
                        console.log(`教师状态为 ${status}，继续等待...`);
                    }
                }

                retries++;
                if (retries < maxRetries) {
                    console.log(`教师轮询中... (${retries}/${maxRetries})`);
                    if (!sentLoading && !res.writableEnded) {
                        res.write(`data: ${JSON.stringify({ content: '.' })}\n\n`);
                        sentLoading = true;
                    }
                    setTimeout(pollAndStream, 2000); // 增加轮询间隔到2秒
                } else {
                    if (!res.writableEnded) {
                        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                        res.end();
                    }
                }
            } catch (error) {
                console.error('轮询错误:', error);
                if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                    res.end();
                }
            }
        };

        pollAndStream();

    } catch (error) {
        console.error('流式服务器错误:', error);
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
            res.end();
        }
    }
});

// 思维导图生成接口
app.post('/api/mindmap/generate', async (req, res) => {
    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({ error: '文本内容不能为空' });
        }

        console.log('生成思维导图，文本长度:', text.length);

        // 调用阿里云 DashScope API
        const response = await fetch(`${DASHSCOPE_API_BASE}/services/aigc/text-generation/generation`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'qwen-turbo',
                input: {
                    prompt: `请根据以下文本内容，生成一个思维导图的JSON结构。思维导图应该有一个中心主题和多个层级分支。

要求返回严格遵循以下JSON格式，不要包含任何其他内容：
{
    "root": "中心主题名称",
    "nodes": [
        {"id": "1", "name": "中心主题", "children": ["2", "3"]},
        {"id": "2", "name": "分支1", "children": []},
        {"id": "3", "name": "分支2", "children": []}
    ]
}

文本内容：
${text}

请直接返回JSON，不要有其他说明文字。`
                },
                parameters: {
                    result_format: 'message'
                }
            })
        });

        const data = await response.json();
        console.log('DashScope 响应:', JSON.stringify(data).substring(0, 200));

        if (data.output && data.output.text) {
            // 尝试解析返回的JSON
            let mindmapData;
            try {
                mindmapData = JSON.parse(data.output.text);
            } catch (e) {
                // 如果直接解析失败，尝试提取JSON部分
                const jsonMatch = data.output.text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    mindmapData = JSON.parse(jsonMatch[0]);
                } else {
                    // 如果还是失败，生成简单的树形结构
                    const lines = text.split('\n').filter(l => l.trim());
                    const rootName = lines[0] || '思维导图';
                    const nodes = [{ id: '1', name: rootName, children: [] }];

                    lines.slice(1, 6).forEach((line, i) => {
                        const nodeId = String(i + 2);
                        nodes.push({ id: nodeId, name: line.trim(), children: [] });
                        nodes[0].children.push(nodeId);
                    });

                    mindmapData = { root: '1', nodes: nodes };
                }
            }

            // 确保有root字段
            if (!mindmapData.root && mindmapData.nodes && mindmapData.nodes.length > 0) {
                mindmapData.root = mindmapData.nodes[0].id;
            }

            return res.json(mindmapData);
        } else if (data.error) {
            return res.status(400).json({ error: data.error.message || 'API调用失败' });
        } else {
            // Fallback: 生成简单的思维导图
            const lines = text.split('\n').filter(l => l.trim());
            const rootName = lines[0] || '思维导图';
            const nodes = [{ id: '1', name: rootName, children: [] }];

            lines.slice(1, 6).forEach((line, i) => {
                const nodeId = String(i + 2);
                nodes.push({ id: nodeId, name: line.trim(), children: [] });
                nodes[0].children.push(nodeId);
            });

            return res.json({ root: '1', nodes: nodes });
        }
    } catch (error) {
        console.error('思维导图生成错误:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>Coze Proxy Server</title></head>
            <body>
                <h1>Coze 智能体代理服务器</h1>
                <p>服务器运行正常</p>
                <p>API 端点：/api/chat（普通） | /api/chat/stream（学习伙伴流式） | /api/chat/assistant/stream（助教流式）</p>
            </body>
        </html>
    `);
});

// 启动检查：确保必要的环境变量存在
if (!TOKEN) {
    console.error('错误：缺少 COZE_TOKEN 环境变量');
    process.exit(1);
}

if (!BOT_ID || !ASSISTANT_BOT_ID || !TEACHER_BOT_ID) {
    console.error('错误：缺少 BOT_ID、ASSISTANT_BOT_ID 或 TEACHER_BOT_ID 环境变量');
    process.exit(1);
}

if (!DASHSCOPE_API_KEY) {
    console.error('警告：缺少 DASHSCOPE_API_KEY 环境变量，思维导图功能将不可用');
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Coze 代理服务器已启动`);
    console.log(`监听地址：0.0.0.0:${PORT}`);
    console.log(`API 端点：/api/chat`);
    console.log(`流式端点：/api/chat/stream`);
    console.log(`助教端点：/api/chat/assistant/stream`);
    console.log(`教师端点：/api/chat/teacher/stream`);
    console.log(`思维导图端点：/api/mindmap/generate`);
});