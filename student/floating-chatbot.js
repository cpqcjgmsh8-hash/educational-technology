const floatingAIHTML = `
    <div id="floatingAI" style="position: fixed; bottom: 20px; right: 20px; z-index: 9999;">
        <div id="floatingAIBtn" onclick="toggleFloatingAI()" style="width: 56px; height: 56px; background: linear-gradient(135deg, #1a365d, #2d4a6f); border-radius: 50%; box-shadow: 0 4px 16px rgba(26,54,93,0.4); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; transition: transform 0.3s, box-shadow 0.3s;" onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 6px 20px rgba(26,54,93,0.5)';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 16px rgba(26,54,93,0.4)';">🤖</div>
        <div id="floatingAIPanel" style="display: none; position: absolute; bottom: 70px; right: 0; width: 380px; height: 520px; background: white; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.15); overflow: hidden; flex-direction: column;">
            <div style="background: linear-gradient(135deg, #1a365d, #2d4a6f); color: white; padding: 1rem; display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <span style="font-size: 1.5rem;">🤖</span>
                    <div>
                        <div style="font-weight: bold;">学习伙伴</div>
                        <div style="font-size: 0.7rem; opacity: 0.8;">在线</div>
                    </div>
                </div>
                <button onclick="toggleFloatingAI()" style="background: none; border: none; color: white; font-size: 1.2rem; cursor: pointer; padding: 0.25rem;">✕</button>
            </div>
            <div id="floatingAIMessages" style="flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;">
                <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
                    <div style="width: 32px; height: 32px; background: #48bb78; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex-shrink: 0;">📚</div>
                    <div style="background: #f7fafc; padding: 0.75rem; border-radius: 8px; border-top-left-radius: 2px; max-width: 80%; font-size: 0.85rem; line-height: 1.5;">
                        你好！我是学习伙伴，有什么可以帮你的吗？
                    </div>
                </div>
            </div>
            <div style="padding: 0.75rem; border-top: 1px solid #eee; display: flex; gap: 0.5rem;">
                <input type="text" id="floatingAIInput" placeholder="输入问题..." style="flex: 1; padding: 0.75rem; border: 1px solid #ddd; border-radius: 8px; font-size: 0.85rem;" onkeypress="if(event.key==='Enter') sendFloatingAIMessage()">
                <button onclick="sendFloatingAIMessage()" style="background: #1a365d; color: white; border: none; border-radius: 8px; padding: 0.75rem 1rem; cursor: pointer; font-size: 0.85rem;">发送</button>
            </div>
        </div>
    </div>
`;

document.write(floatingAIHTML);

function toggleFloatingAI() {
    const panel = document.getElementById('floatingAIPanel');
    const btn = document.getElementById('floatingAIBtn');
    if (panel.style.display === 'none') {
        panel.style.display = 'flex';
        btn.textContent = '✕';
    } else {
        panel.style.display = 'none';
        btn.textContent = '🤖';
    }
}

let floatingAIFullContent = '';

function sendFloatingAIMessage() {
    const input = document.getElementById('floatingAIInput');
    const message = input.value.trim();
    if (!message) return;

    const chatMessages = document.getElementById('floatingAIMessages');

    const userMsg = document.createElement('div');
    userMsg.style.cssText = 'display: flex; gap: 0.75rem; align-items: flex-start; justify-content: flex-end;';
    userMsg.innerHTML = `
        <div style="background: #1a365d; color: white; padding: 0.75rem; border-radius: 8px; border-top-right-radius: 2px; max-width: 80%; font-size: 0.85rem;">
            ${message}
        </div>
        <div style="width: 32px; height: 32px; background: #1a365d; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; flex-shrink: 0;">👤</div>
    `;
    chatMessages.appendChild(userMsg);

    const botMsg = document.createElement('div');
    botMsg.style.cssText = 'display: flex; gap: 0.75rem; align-items: flex-start;';
    botMsg.innerHTML = `
        <div style="width: 32px; height: 32px; background: #48bb78; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex-shrink: 0;">📚</div>
        <div style="background: #f7fafc; padding: 0.75rem; border-radius: 8px; border-top-left-radius: 2px; max-width: 80%; font-size: 0.85rem;" id="floatingAIResponse">
            <span class="thinking-dots">正在思考<span>.</span></span>
        </div>
    `;
    chatMessages.appendChild(botMsg);

    chatMessages.scrollTop = chatMessages.scrollHeight;
    input.value = '';

    let thinkingInterval = setInterval(() => {
        const dots = botMsg.querySelector('.thinking-dots');
        if (dots) {
            const text = dots.textContent;
            if (text.endsWith('...')) {
                dots.innerHTML = '正在思考';
            } else {
                dots.innerHTML = text + '.';
            }
        }
    }, 500);

    const responseText = botMsg.querySelector('#floatingAIResponse');
    floatingAIFullContent = '';

    fetch('https://educational-technology-production-dc54.up.railway.app/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'student_001', message: message })
    })
    .then(response => {
        if (!response.ok) throw new Error('API请求失败');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        function read() {
            reader.read().then(({ done, value }) => {
                if (done) {
                    clearInterval(thinkingInterval);
                    return;
                }

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        try {
                            const data = JSON.parse(line.slice(5));
                            if (data.content) {
                                clearInterval(thinkingInterval);
                                floatingAIFullContent += data.content;
                                responseText.innerHTML = `<div style="white-space: pre-wrap;">${floatingAIFullContent}<span class="cursor">|</span></div>`;
                                chatMessages.scrollTop = chatMessages.scrollHeight;
                            }
                            if (data.done) {
                                responseText.innerHTML = `<div style="white-space: pre-wrap;">${floatingAIFullContent}</div>`;
                                chatMessages.scrollTop = chatMessages.scrollHeight;
                            }
                            if (data.error) {
                                clearInterval(thinkingInterval);
                                responseText.innerHTML = `抱歉出现问题: ${data.error}`;
                            }
                        } catch (e) {}
                    }
                }

                if (!done) read();
            });
        }
        read();
    })
    .catch(error => {
        clearInterval(thinkingInterval);
        responseText.innerHTML = `连接失败: ${error.message}`;
    });
}