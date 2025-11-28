import * as vscode from 'vscode';

export function getChatbotWebviewContent(logoSrc: string): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🤖 CodeGenie Chatbot</title>
        <style>
            :root {
                --background-color: #1e1e1e;
                --text-color: #d4d4d4;
                --input-background: #3c3c3c;
                --input-border: #5a5a5a;
                --bot-message-bg: #2d2d2d;
                --user-message-bg: #04395e;
                --button-bg: #0e639c;
                --button-hover-bg: #1177bb;
                --button-secondary-bg: #3a3d41;
                --button-secondary-hover-bg: #4a4d51;
            }
            
            body {
                font-family: var(--vscode-font-family, 'Segoe UI', 'Roboto', sans-serif);
                background-color: var(--background-color);
                color: var(--text-color);
                margin: 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                height: 100vh;
            }
            .header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 20px;
                background-color: var(--bot-message-bg);
                border-bottom: 1px solid var(--input-border);
            }
            .header h1 {
                font-size: 20px;
                margin: 0;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .header img {
                width: 24px;
                height: 24px;
            }
            .header select {
                background-color: var(--input-background);
                color: var(--text-color);
                border: 1px solid var(--input-border);
                border-radius: 4px;
                padding: 4px 8px;
                font-family: inherit;
                
            }
            #chat-container {
                flex: 1;
                padding: 20px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 15px;
            }
            .message {
                max-width: 80%;
                padding: 10px 15px;
                border-radius: 12px;
                line-height: 1.5;
                word-wrap: break-word;
            }
            .bot {
                align-self: flex-start;
                background-color: var(--bot-message-bg);
                border-top-left-radius: 0;
            }
            .loader 
            {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #d4d4d4;
            border-top: 3px solid transparent;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-left: 10px;
            }
            @keyframes spin 
            {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
            }
            .user {
                align-self: flex-end;
                background-color: var(--user-message-bg);
                border-top-right-radius: 0;
            }
            .mcq-options {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin-top: 10px;
            }
            .mcq-btn {
                background-color: var(--button-secondary-bg);
                color: var(--text-color);
                border: 1px solid var(--input-border);
                border-radius: 20px;
                padding: 8px 15px;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            .mcq-btn:hover {
                background-color: var(--button-secondary-hover-bg);
            }
            .input-bar {
                display: flex;
                padding: 15px;
                background-color: var(--bot-message-bg);
                border-top: 1px solid var(--input-border);
            }
            textarea {
                flex: 1;
                resize: none;
                padding: 10px;
                border-radius: 6px;
                border: 1px solid var(--input-border);
                background-color: var(--input-background);
                color: var(--text-color);
                font-family: inherit;
                font-size: 14px;
                margin-right: 10px;
            }
            .send-btn {
                padding: 10px 18px;
                font-size: 16px;
                background-color: var(--button-bg);
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
            }
            .send-btn:hover {
                background-color: var(--button-hover-bg);
            }
            pre {
                background: #111;
                padding: 1em;
                border-radius: 4px;
                overflow-x: auto;
                white-space: pre-wrap;
            }
            .code-actions {
                display: flex;
                gap: 5px;
                margin-top: 10px;
            }
            .code-actions button {
                font-size: 12px;
                padding: 4px 8px;
            }
            details {
                border: 1px solid var(--input-border);
                border-radius: 5px;
                margin-top: 10px;
            }
            summary {
                cursor: pointer;
                padding: 10px;
                background-color: var(--button-secondary-bg);
            }
            .panel-content {
                padding: 10px;
            }
        </style>
    </head>
    <body>
    
        <div class="header">
            <h1>🤖 CodeGenie Chatbot</h1>
            <select id="mode-selector">
                <option value="General">General</option>
                <option value="Intelligent Snippet">Intelligent Snippet</option>
                <option value="Auto Completion">Auto Completion</option>
                <option value="Code Suggestion">Code Suggestion</option>
            </select>
        </div>

        <div id="chat-container">
            <div class="message bot">Hello! I'm CodeGenie. How can I assist you today? Select a mode and type your prompt below.</div>
        </div>

        <div class="input-bar">
            <textarea id="input" placeholder="Type your prompt here..."></textarea>
            <button class="send-btn" onclick="send()">➤</button>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            const chatContainer = document.getElementById('chat-container');
            const input = document.getElementById('input');
            const modeSelector = document.getElementById('mode-selector');

            let conversationState = {
                prompt: null,
                mode: null,
                awaiting: null // 'mode' or 'output'
            };

            function addMessage(text, sender, element) {
                const msg = document.createElement('div');
                msg.className = 'message ' + sender;
                if (text) msg.textContent = text;
                if (element) msg.appendChild(element);
                chatContainer.appendChild(msg);
                msg.scrollIntoView({ behavior: 'smooth' });
                return msg;
            }
            
            function send() {
                const text = input.value.trim();
                if (!text) return;
                addMessage(text, 'user');
                input.value = '';

                conversationState.prompt = text;
                const selectedMode = modeSelector.value;

                if (selectedMode === 'General') {
                    conversationState.awaiting = 'mode';
                    askForMode();
                } else {
                    conversationState.mode = selectedMode;
                    conversationState.awaiting = 'output';
                    askForOutputType();
                }
            }
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                }
            });

            function askForMode() {
                const optionsContainer = document.createElement('div');
                optionsContainer.className = 'mcq-options';
                const modes = ['Intelligent Snippet', 'Auto Completion', 'Code Suggestion'];
                modes.forEach(mode => {
                    const btn = document.createElement('button');
                    btn.className = 'mcq-btn';
                    btn.textContent = mode;
                    btn.onclick = () => {
                        conversationState.mode = mode;
                        addMessage('Selected mode: ' + mode, 'user');
                        optionsContainer.remove();
                        askForOutputType();
                    };
                    optionsContainer.appendChild(btn);
                });
                addMessage('Which mode would you like to proceed with?', 'bot', optionsContainer);
            }

            function askForOutputType() {
                const optionsContainer = document.createElement('div');
                optionsContainer.className = 'mcq-options';
                const outputTypes = ['Inline Output', 'Panel Output'];
                outputTypes.forEach(type => {
                    const btn = document.createElement('button');
                    btn.className = 'mcq-btn';
                    btn.textContent = type;
                    btn.onclick = () => {
                        addMessage('Output choice: ' + type, 'user');
                        optionsContainer.remove();
                        callBackend(type.split(' ')[0].toLowerCase());
                    };
                    optionsContainer.appendChild(btn);
                });
                addMessage('Where do you want the output?', 'bot', optionsContainer);
            }
            
            function callBackend(outputType) {
                 addMessage('Thinking...', 'bot');
                 vscode.postMessage({
                    command: 'callBackend',
                    prompt: conversationState.prompt,
                    mode: conversationState.mode,
                    outputType: outputType
                 });
            }
            
            function parseCodeSuggestions(responseText) {
                const solutions = [];
                // Regex to find "Solution X: <Header>" followed by code
                const parts = responseText.split(/(Solution\\s*\\d+\\s*:\\s*(?:Using\\s*(?:functions|recursion|iteration))?)/);
                
                for (let i = 1; i < parts.length; i += 2) {
                    const header = parts[i].trim();
                    const body = (parts[i + 1] || '').trim();
                    if (body) {
                        solutions.push({ header: header, code: body });
                    }
                }
                return solutions;
            }

            function createCodeBlock(data, mode) {
                
                const container = document.createElement('div');
                const blockId = 'block-' + Date.now();
                container.setAttribute('data-block-id', blockId);

                // Helper to create a collapsible details element
                function createCollapsibleSection(title, content, isOpen = false) {
                    const details = document.createElement('details');
                    details.style.marginBottom = '10px'; // Add some spacing between sections
                    if (isOpen) {
                        details.setAttribute('open', '');
                    }

                    const summary = document.createElement('summary');
                    summary.textContent = title;
                    details.appendChild(summary);

                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'panel-content'; // Reuse existing panel-content style
                    if (typeof content === 'string') {
                        const pre = document.createElement('pre');
                        pre.textContent = content;
                        contentDiv.appendChild(pre);
                    } else if (content instanceof HTMLElement) {
                        contentDiv.appendChild(content);
                    }
                    details.appendChild(contentDiv);
                    return details;
                }

                if (mode === 'Auto Completion' && typeof data === 'object') {
                    // Debug Analysis
                    const debugAnalysis = data.debug_explanation || 'No debug analysis was provided.';
                    container.appendChild(createCollapsibleSection('🔍 Debug Analysis', debugAnalysis));

                    // Autocompleted Code (open by default)
                    const completedCode = data.completed_code || JSON.stringify(data, null, 2);
                    const completedCodeContainer = document.createElement('div');
                    const preCompletedCode = document.createElement('pre');
                    preCompletedCode.textContent = completedCode;
                    completedCodeContainer.appendChild(preCompletedCode);

                    const actions = document.createElement('div');
                    actions.className = 'code-actions';
                    
                    const copyBtn = document.createElement('button');
                    copyBtn.textContent = 'Copy';
                    copyBtn.className = 'mcq-btn';
                    copyBtn.onclick = () => navigator.clipboard.writeText(completedCode);

                    const insertBtn = document.createElement('button');
                    insertBtn.textContent = 'Insert';
                    insertBtn.className = 'mcq-btn';
                    insertBtn.onclick = () => vscode.postMessage({ command: 'insertCode', code: completedCode, blockId });
                    
                    const deleteBtn = document.createElement('button');
                    deleteBtn.textContent = 'Delete';
                    deleteBtn.className = 'mcq-btn';
                    deleteBtn.onclick = () => vscode.postMessage({ command: 'deleteCode', blockId });

                    actions.append(copyBtn, insertBtn, deleteBtn);
                    completedCodeContainer.appendChild(actions);

                    container.appendChild(createCollapsibleSection('✅ Autocompleted Code', completedCodeContainer, true));

                    // Explanation
                    const explanation = data.explanation || 'No explanation was provided.';
                    container.appendChild(createCollapsibleSection('📖 Explanation', explanation));

                    // Example
                    const example = data.example || 'No example was provided.';
                    container.appendChild(createCollapsibleSection('💡 Example', example));

                } else if (mode === 'Intelligent Snippet' && typeof data === 'object') {
                    const displayCode = data.code || JSON.stringify(data, null, 2);
                    const pre = document.createElement('pre');
                    pre.textContent = displayCode;
                    container.appendChild(pre);

                    const actions = document.createElement('div');
                    actions.className = 'code-actions';
                    
                    const copyBtn = document.createElement('button');
                    copyBtn.textContent = 'Copy';
                    copyBtn.className = 'mcq-btn';
                    copyBtn.onclick = () => navigator.clipboard.writeText(displayCode);

                    const insertBtn = document.createElement('button');
                    insertBtn.textContent = 'Insert';
                    insertBtn.className = 'mcq-btn';
                    insertBtn.onclick = () => vscode.postMessage({ command: 'insertCode', code: displayCode, blockId });
                    
                    const deleteBtn = document.createElement('button');
                    deleteBtn.textContent = 'Delete';
                    deleteBtn.className = 'mcq-btn';
                    deleteBtn.onclick = () => vscode.postMessage({ command: 'deleteCode', blockId });

                    actions.append(copyBtn, insertBtn, deleteBtn);
                    pre.appendChild(actions);
                    container.appendChild(createCollapsibleSection('Snippet', pre, true));

                } 
                    else if (mode === 'Code Suggestion') {
                    const solutions = parseCodeSuggestions(data.response || '');
                    if (solutions.length === 0) {
                        const pre = document.createElement('pre');
                        pre.textContent = "No code suggestions found.";
                        container.appendChild(pre);
                        return container;
                    }

                    solutions.forEach((sol, idx) => {
                        const solutionBox = document.createElement('div');
                        solutionBox.className = 'solution-box';
                        
                        const header = document.createElement('h4');
                        header.textContent = sol.header;
                        solutionBox.appendChild(header);

                        const pre = document.createElement('pre');
                        pre.textContent = sol.code;
                        solutionBox.appendChild(pre);

                        const actions = document.createElement('div');
                        actions.className = 'code-actions';
                        
                        // Generate a unique ID for each code block
                        // Escaped backticks for the template literal
                        const blockId = 'block-' + Date.now() + '-' + idx;

                        const copyBtn = document.createElement('button');
                        copyBtn.textContent = 'Copy';
                        copyBtn.className = 'mcq-btn';
                        copyBtn.onclick = () => navigator.clipboard.writeText(sol.code);

                        const insertBtn = document.createElement('button');
                        insertBtn.textContent = 'Insert';
                        insertBtn.className = 'mcq-btn';
                        insertBtn.onclick = () => vscode.postMessage({ command: 'insertCode', code: sol.code, blockId: blockId });
                        
                        const deleteBtn = document.createElement('button');
                        deleteBtn.textContent = 'Delete';
                        deleteBtn.className = 'mcq-btn';
                        deleteBtn.onclick = () => {
                            vscode.postMessage({ command: 'deleteCode', blockId: blockId });
                            
                        };

                        actions.append(copyBtn, insertBtn, deleteBtn);
                        solutionBox.appendChild(actions);
                        container.appendChild(solutionBox);
                        container.appendChild(createCollapsibleSection('Solution', solutionBox, true));
                    });                    
                } 
                return container;
            }

            window.addEventListener('message', event => {
                const message = event.data;
                // Remove "Thinking..." message
                const thinkingMsg = Array.from(chatContainer.querySelectorAll('.message.bot')).pop();
                if (thinkingMsg && thinkingMsg.textContent=='Thinking...') {
                    thinkingMsg.remove();
                }

                switch(message.command) {
                    case 'backendResponse':
                        if (message.outputType === 'inline') {
                            // For inline, it will still display only the 'completed_code' if mode is Auto Completion
                            // The request was specifically for the *panel* output to be structured.
                            let codeToDisplay = '';
                            if (message.mode === 'Auto Completion' && typeof message.data === 'object' && message.data.completed_code) {
                                codeToDisplay = message.data.completed_code;
                            } else if (message.mode === 'Intelligent Snippet' && typeof message.data === 'object' && message.data.code) {
                                codeToDisplay = message.data.code;
                            } else if (message.mode === 'Code Suggestion' && typeof message.data === 'object' && message.data.response) {
                                codeToDisplay = message.data.response;
                            } else {
                                codeToDisplay = typeof message.data === 'object' ? JSON.stringify(message.data, null, 2) : String(message.data);
                            }
                            const pre = document.createElement('pre');
                            pre.textContent = codeToDisplay;
                            addMessage(null, 'bot', pre); // Add just the code block for inline
                        } else { // panel
                            // This is where the structured output for Auto Completion will appear.
                            // Pass the entire message.data to createCodeBlock for Auto Completion mode.
                            const details = document.createElement('details');
                            const summary = document.createElement('summary');
                            summary.textContent = 'CodeGenie Response';
                            details.appendChild(summary);

                           
                            const panelContent = document
                            .createElement('div');
                            panelContent.className = 'panel-content';
                            const codeBlock = createCodeBlock(message.data, message.mode);
                            panelContent.appendChild(codeBlock);
                            //const detailsWrapper = document.createElement('div'); // A wrapper for the details elements
                            details.appendChild(panelContent); // Append the container generated by createCodeBlock
                            addMessage(null, 'bot', panelContent);
                        }
                        break;
                    case 'showError':
                        addMessage('Error: ' + message.message, 'bot');
                        break;
                }
            });

        </script>
    </body>
    </html>
    `;
}

export function getWebviewContent(logoSrc: string): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            :root {
                --bg: #1e1e1e;
                --fg: #d4d4d4;
                --user-bg: #264f78;
                --bot-bg: #333333;
            }

            .light-theme {
                --bg: #ffffff;
                --fg: #000000;
                --user-bg: #007acc;
                --bot-bg: #e6e6e6;
            }

            .dark-theme {
                --bg: #1e1e1e;
                --fg: #d4d4d4;
                --user-bg: #264f78;
                --bot-bg: #333333;
            }

            body {
                font-family: 'Fira Sans','Segoe UI', sans-serif;
                font-size: 14px;
                margin: 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                height: 100vh;
                color: var(--fg);
                background-color: var(--bg);
                transition: background-color 0.3s ease, color 0.3s ease;
            }

            #themeToggle {
                position: absolute;
                top: 10px;
                left: 10px;
                font-size: 16px;
                padding: 6px 12px;
                border-radius: 5px;
                background-color: var(--bot-bg);
                color: var(--fg);
                border: none;
                cursor: pointer;
            }

            #welcome {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
                padding: 2rem;
            }

            #chat {
                flex: 1;
                padding: 20px;
                overflow-y: auto;
                display: none;
                flex-direction: column;
                gap: 10px;
                background: var(--bg);
            }

            .message {
                max-width: 70%;
                padding: 10px;
                border-radius: 10px;
                white-space: pre-wrap;
                word-wrap: break-word;
                color: var(--fg);
                position: relative;
            }

            .user {
                align-self: flex-end;
                background-color: var(--user-bg);
                border-top-right-radius: 0;
                color: white;
            }

            .bot {
                align-self: flex-start;
                background-color: var(--bot-bg);
                border-top-left-radius: 0;
            }

            #inputBar {
                display: flex;
                padding: 10px;
                background-color: var(--bg);
                border-top: 1px solid #555;
            }

            textarea {
                flex: 1;
                resize: none;
                height: 50px;
                padding: 10px;
                border-radius: 8px;
                font-size: 14px;
                border: 1px solid #999;
                margin-right: 10px;
                color: var(--fg);
                background-color: var(--bg);
            }

            button {
                padding: 10px 16px;
                font-size: 14px;
                background-color: #007acc;
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                transition: transform 0.2s ease;
            }

            button:hover {
                transform: scale(1.05);
            }

            .spinner {
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 3px solid #888;
                border-top: 3px solid #007acc;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
                margin-left: 10px;
            }

            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    </head>
    <body>
        <button id="themeToggle">🌙</button>
        <div id="welcome">
            <h1>👋 Welcome to CodeGenie</h1>
            <p>Start by entering a prompt below and pressing "Generate"</p>
        </div>

        <div id="chat"></div>

        <div id="inputBar">
            <textarea id="input" placeholder="Type your prompt..."></textarea>
            <button onclick="send()">➤</button>
        </div>

        <script>
            const vscode = acquireVsCodeApi();

            // Load stored theme or default to dark
            const storedState = vscode.getState();
            const preferredTheme = storedState?.theme || 'dark-theme';
            const body = document.body;
            const toggleBtn = document.getElementById('themeToggle');

            body.classList.add(preferredTheme);
            toggleBtn.textContent = preferredTheme === 'dark-theme' ? '🌙' : '☀️';

            toggleBtn.addEventListener('click', () => {
                const isDark = body.classList.contains('dark-theme');
                body.classList.toggle('light-theme', isDark);
                body.classList.toggle('dark-theme', !isDark);
                const newTheme = isDark ? 'light-theme' : 'dark-theme';
                toggleBtn.textContent = isDark ? '☀️' : '🌙';
                vscode.setState({ theme: newTheme });
            });

            function addMessage(text, sender) {
                const msg = document.createElement('div');
                msg.className = 'message ' + sender;
                msg.textContent = text;
                document.getElementById('chat').appendChild(msg);
                msg.scrollIntoView({ behavior: 'smooth' });
                return msg;
            }

            function send() {
                const input = document.getElementById('input');
                const text = input.value.trim();
                if (!text) return;

                document.getElementById('welcome').style.display = 'none';
                document.getElementById('chat').style.display = 'flex';

                addMessage(text, 'user');
                input.value = '';

                const loadingMsg = addMessage("Generating response", 'bot');
                const dots = document.createElement('span');
                dots.id = 'dots';
                dots.style.display = 'inline-block';
                dots.style.fontFamily = 'monospace';
                dots.style.minWidth = '3ch'; 
                dots.textContent = '    ';

                loadingMsg.appendChild(dots);
                loadingMsg.id = "loading";

                let dotCount = 0;
                const maxDots = 3;
                const totalSlots = 4;
                const dotInterval = setInterval(() => {
                    dotCount = (dotCount + 1) % (maxDots + 1);
                    dots.textContent = ' ' + ' .'.repeat(dotCount);
                    const visibleDots = '.'.repeat(dotCount);
                    const remaining = '\u00A0'.repeat(totalSlots - dotCount);
                    dots.textContent = visibleDots + remaining;
                }, 1000);

                loadingMsg.setAttribute('data-interval-id', dotInterval.toString());

                vscode.postMessage({ command: 'generate', text: text });
            }

            function createCopyButton(text) {
                const btn = document.createElement('button');
                btn.textContent = '📋';
                btn.title = 'Copy to clipboard';
                btn.style.alignSelf = 'flex-end';
                btn.style.marginTop = '6px';
                btn.style.padding = '4px 6px';
                btn.style.fontSize = '12px';
                btn.style.backgroundColor = '#f3f3f3';
                btn.style.border = '1px solid #ccc';
                btn.style.borderRadius = '4px';
                btn.style.cursor = 'pointer';
                btn.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.1)';

                btn.onclick = () => {
                    navigator.clipboard.writeText(text);
                    btn.textContent = '✅';
                    setTimeout(() => { btn.textContent = '📋'; }, 1500);
                };

                return btn;
            }

            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'result') {
                    const oldMsg = document.getElementById('loading');
                    if (oldMsg) {
                        const intervalId = parseInt(oldMsg.getAttribute('data-interval-id') || '', 10);
                        if (!isNaN(intervalId)) clearInterval(intervalId);
                        oldMsg.textContent = '';

                        const wrapper = document.createElement('div');
                        wrapper.style.display = 'flex';
                        wrapper.style.flexDirection = 'column';
                        wrapper.style.alignItems = 'flex-end';
                        wrapper.style.gap = '5px';

                        const codeBlock = document.createElement('pre');
                        codeBlock.textContent = message.code;
                        codeBlock.style.whiteSpace = 'pre-wrap';
                        codeBlock.style.margin = '0';
                        codeBlock.style.alignSelf = 'stretch';

                        const copyBtn = createCopyButton(message.code);

                        wrapper.appendChild(codeBlock);
                        const hr = document.createElement('hr');
                        hr.style.border = 'none';
                        hr.style.borderTop = '1px solid #ccc';
                        hr.style.width = '100%';
                        wrapper.appendChild(hr);
                        wrapper.appendChild(copyBtn);
                        oldMsg.appendChild(wrapper);
                        oldMsg.removeAttribute('id');
                    } else {
                        const msg = addMessage('', 'bot');

                        const wrapper = document.createElement('div');
                        wrapper.style.display = 'flex';
                        wrapper.style.flexDirection = 'column';
                        wrapper.style.alignItems = 'flex-end';
                        wrapper.style.gap = '5px';

                        const codeBlock = document.createElement('pre');
                        codeBlock.textContent = message.code;
                        codeBlock.style.whiteSpace = 'pre-wrap';
                        codeBlock.style.margin = '0';
                        codeBlock.style.alignSelf = 'stretch';

                        const copyBtn = createCopyButton(message.code);

                        wrapper.appendChild(codeBlock);
                        const hr = document.createElement('hr');
                        hr.style.border = 'none';
                        hr.style.borderTop = '1px solid #ccc';
                        hr.style.width = '100%';
                        wrapper.appendChild(hr);
                        wrapper.appendChild(copyBtn);
                        msg.appendChild(wrapper);
                    }
                }
            });
        </script>
    </body>
    </html>
    `;
}


export function getWebviewContentCodeSuggestion(prompt: string, solutions: string[]): string {
    let solutionHTML = "";

    solutions.forEach((solution, idx) => {
        
        const lines = solution.split('\n');
        const header = lines[0]; 
        const body = lines.slice(1).join('\n').trim(); 
        if (body) {
            const formattedBody = body
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");

            solutionHTML += `
                <details>
                    <summary><strong>${header}</strong></summary>
                    <pre><code id="code-${idx}">${formattedBody}</code></pre>
                    <button onclick="copyCode(${idx})">Copy</button>
                    <button onclick="insertCode(${idx})">Insert</button>
                    <button onclick="deleteCode()">Delete</button>
                    <br/><br/>
                </details>
            `;
        }
    });

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>CodeGenie Results</title>
            <style>
                body {
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    font-family: var(--vscode-font-family);
                    padding: 1em;
                }
                pre {
                    background: var(--vscode-editorGroupHeader-tabsBorder);
                    padding: 1em;
                    border-radius: 4px;
                    overflow-x: auto;
                    color: var(--vscode-editor-foreground);
                }
                button {
                    margin: 0.5em 0.5em 0 0;
                    padding: 4px 10px;
                    font-size: 0.9em;
                    cursor: pointer;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 3px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                h2, h3 {
                    color: var(--vscode-editor-foreground);
                }
                blockquote {
                    background: var(--vscode-editorGroupHeader-border);
                    border-left: 5px solid var(--vscode-charts-green);
                    margin: 1.5em 10px;
                    padding: 0.5em 10px;
                }
                details {
                    margin-bottom: 1em;
                    border: 1px solid var(--vscode-editorGroup-border);
                    border-radius: 4px;
                    padding: 0.5em;
                }
                summary {
                    cursor: pointer;
                    font-weight: bold;
                    padding: 0.2em 0;
                }
            </style>
        </head>
        <body>
            <h2>Generated Code Approaches</h2>
            <section>
                <h3>Prompt:</h3>
                <blockquote>${prompt}</blockquote>
                ${solutionHTML}
            </section>
            <script>
                const vscode = acquireVsCodeApi();

                function copyCode(solIdx) {
                    const codeBlock = document.getElementById('code-' + solIdx);
                    if (codeBlock) {
                        const textArea = document.createElement("textarea");
                        textArea.value = codeBlock.innerText;
                        document.body.appendChild(textArea);
                        textArea.select();
                        try {
                            document.execCommand('copy');
                            console.log('Code copied!');
                        } catch (err) {
                            console.error('Failed to copy code: ' + err);
                        }
                        document.body.removeChild(textArea);
                    }
                }

                function insertCode(solIdx) {
                    const codeBlock = document.getElementById('code-' + solIdx);
                    if (codeBlock) {
                        vscode.postMessage({
                            command: 'insertCode',
                            code: codeBlock.innerText
                        });
                    }
                }

                function deleteCode() {
                    vscode.postMessage({
                        command: 'deleteInsertedCode'
                    });
                }
            </script>
        </body>
        </html>
    `;
}

interface BackendResponse {
    completed_code?: string;
    explanation?: string;
    example?: string;
    error?: string;
    debug_explanation?: string;
}


export function getWebviewContentAutoCompletion(data: BackendResponse): string {
    const { completed_code, explanation, example, debug_explanation } = data;
    const nonce = new Date().getTime().toString();

    const sanitize = (text: string | undefined) => {
        if (!text) return '';
        return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };
    const isErrorPresent = debug_explanation && 
                           !debug_explanation.toLowerCase().includes('no errors found') && 
                           !debug_explanation.toLowerCase().includes('code is incomplete') &&
                           !debug_explanation.toLowerCase().includes('complete');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px
        }
        h1 {
            color: var(--vscode-textLink-foreground);
            margin-bottom: 10px
        }
        h2 {
            color: var(--vscode-textLink-foreground);
            margin-top: 24px;
            border-bottom: 1px solid var(--vscode-editorWidget-border);
            padding-bottom: 4px
        }
        pre {
            background-color: var(--vscode-editorWidget-background);
            padding: 12px;
            border-radius: 5px;
            border: 1px solid var(--vscode-editorWidget-border);
            white-space: pre-wrap;
            word-wrap: break-word
        }
        .key {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 3px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
            font-family: var(--vscode-font-family)
        }
        .debug-box {
            border-left-width: 5px;
            border-left-style: solid;
            padding: 15px;
            margin: 15px 0;
            border-radius: 5px
        }
        .debug-box.error {
            background-color: rgba(217, 83, 79, .1);
            border-left-color: #d9534f
        }
        .debug-box.no-error {
            background-color: rgba(92, 184, 92, .1);
            border-left-color: #5cb85c
        }
        .footer-message {
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            background-color: var(--vscode-statusBar-background);
            color: var(--vscode-statusBar-foreground);
            padding: 10px;
            text-align: center;
            font-weight: bold
        }
        .about-button {
            position: absolute;
            top: 20px;
            right: 25px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
            border-radius: 5px;
            padding: 5px 10px;
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            user-select: none;
            transition: background-color .2s ease
        }
        .about-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground)
        }
        .about-button .about-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            border: 1.5px solid var(--vscode-button-secondaryForeground);
            font-weight: bold;
            font-style: italic;
            font-size: 12px
        }
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, .6);
            display: none;
            justify-content: center;
            align-items: center;
            z-index: 1000
        }
        .modal-content {
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 25px;
            border-radius: 8px;
            width: 90%;
            max-width: 650px;
            border: 1px solid var(--vscode-editorWidget-border);
            box-shadow: 0 5px 15px rgba(0, 0, 0, .3);
            position: relative;
            max-height: 80vh;
            overflow-y: auto
        }
        .modal-close {
            position: absolute;
            top: 10px;
            right: 15px;
            font-size: 22px;
            font-weight: bold;
            cursor: pointer;
            color: var(--vscode-editor-foreground)
        }
    </style>
</head>
<body>
    <button class="about-button" id="aboutButton" title="About CodeGenie">
        <span>ℹ️</span><span> About</span>
    </button>
    <h1>🧞 CodeGenie Result</h1>
    <h2>🐞 Debug Analysis</h2>
    <div class="debug-box ${isErrorPresent ? 'error' : 'no-error'}">
        <p>${sanitize(debug_explanation) || 'No debug analysis was provided.'}</p>
    </div>
    <h2>✅ Autocompleted Code</h2>
    <pre><code>${sanitize(completed_code)}</code></pre>
    <h2>💡 Explanation</h2>
    <p>${sanitize(explanation)}</p>
    <h2>🚀 Example</h2>
    <pre><code>${sanitize(example)}</code></pre>
    <div id="aboutModal" class="modal-overlay">
        <div class="modal-content">
            <span id="closeModal" class="modal-close" title="Close">&times;</span>
            <h2>ℹ️ About CodeGenie Autocompletion</h2>
            <p><b>CodeGenie</b> is an intelligent coding assistant that leverages the power of AI to help you write, complete, debug, and understand code more efficiently.</p>
            <h3>🔮 Key Features:</h3>
            <ul>
                <li>⚡ <b>Inline Autocompletion:</b> Press Inline Autocomplete button or <span class="key">Alt+I</span> (or <span class="key">Cmd+I</span> on Mac) for quick, direct code generation. This command replaces your entire file with the completed code, perfect for fast-paced development.</li>
                <li>✨ <b>Debug & Autocompletion:</b> Press Debug & Autocomplete button or <span class="key">Alt+P</span> (or <span class="key">Cmd+P</span> on Mac) to trigger a comprehensive analysis of your file. Results are shown in this panel, including error analysis, completed code, explanations, and examples. If your code has issues, CodeGenie identifies the errors, explains why they are problems, and provides a corrected version. Understand the generated code with clear descriptions of its functionality and practical usage examples.</li>
            </ul>
            <h3>🧠 How It Works</h3>
            <p>CodeGenie sends your file’s content to its intelligent backend. Based on deep understanding, it returns a structured response containing:</p>
            <ul>
                <li>🐞 <b>Debug Analysis:</b> A check for any syntactical errors.</li>
                <li>✅ <b>Autocompleted Code:</b> A polished, ready-to-use version of your snippet.</li>
                <li>💡 <b>Explanation:</b> What the code does and why.</li>
                <li>🚀 <b>Example:</b> A mini-demo or sample run.</li>
            </ul>
            <h3>📌 Best Practices:</h3>
            <ul>
                <li>Write meaningful partial code or comments—the more context you provide, the better the results.</li>
                <li>Use Inline Autocomplete⚡or Debug & Autocomplete✨ buttons in the top-right of your editor to access Codegenie Autocompletion.</li>
                <li>Use <span class="key">Alt+I</span> for fast, in-place code generation.</li>
                <li>Use <span class="key">Alt+P</span> for a detailed review or when you suspect errors.</li>
                <li>Review and adapt the generated code—treat CodeGenie as a smart partner, not a replacement.</li>
            </ul>
            <h3>🔗 Source Code</h3>
            <p>CodeGenie is open source! You can find the repository on GitHub: <a href="https://github.com/kmecofficial/CodeGenie-G413-PS25">https://github.com/kmecofficial/CodeGenie-G413-PS25</a></p>
            <p>Let CodeGenie be your coding companion — always ready to turn your ideas into working code. 🧞</p>
        </div>
    </div>
    <div class="footer-message">Press <span class="key">Enter</span> to insert code, or <span class="key">Backspace</span> to cancel.</div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        window.addEventListener("keydown", e => {
            e.key === "Enter" && vscode.postMessage({
                command: "insert"
            }), e.key === "Backspace" && vscode.postMessage({
                command: "revert"
            })
        });
        const aboutModal = document.getElementById("aboutModal"),
            aboutButton = document.getElementById("aboutButton"),
            closeModal = document.getElementById("closeModal");
        aboutButton.addEventListener("click", () => {
            aboutModal.style.display = "flex"
        }), closeModal.addEventListener("click", () => {
            aboutModal.style.display = "none"
        }), aboutModal.addEventListener("click", e => {
            e.target === aboutModal && (aboutModal.style.display = "none")
        });
    </script>
</body>
</html>`;
}
export function getaboutviewContent(): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>About CodeGenie</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                font-size: 14px;
                margin: 0;
                padding: 20px;
                display: flex;
                flex-direction: column;
                height: 100vh;
                color: white; /* Changed text color to white */
                background-color: black; /* Changed background color to black */
            }

            .container {
                max-width: 800px;
                margin: auto;
                padding: 25px;
                background-color: #333; /* Darker background for content */
                border-radius: 8px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5); /* Adjusted shadow for dark background */
                text-align: center;
                overflow-y: auto; /* Enable scrolling for content */
            }

            .header {
                display: flex;
                flex-direction: column;
                align-items: center;
                margin-bottom: 25px;
            }

            h1 {
                font-size: 2em;
                color: #00BFFF; /* Kept highlight color, ensure it contrasts well */
                margin-bottom: 10px;
            }

            h2 {
                font-size: 1.5em;
                color: #00BFFF; /* Kept highlight color */
                margin-top: 25px;
                margin-bottom: 10px;
                text-align: left;
            }
            h3 {
                font-size: 1.2em;
                color: #00BFFF; /* Kept highlight color */
                margin-top: 20px;
                margin-bottom: 8px;
                text-align: left;
            }

            p {
                line-height: 1.6;
                margin-bottom: 15px;
                text-align: left;
                color: #E0E0E0; /* Slightly off-white for body text */
            }

            ul {
                list-style-type: disc;
                margin-left: 20px;
                margin-bottom: 15px;
                text-align: left;
            }

            li {
                margin-bottom: 8px;
                color: #E0E0E0; /* Slightly off-white for list items */
            }

            a {
                color: #61DAFB; /* A brighter blue for links for visibility on dark background */
                text-decoration: none;
            }

            a:hover {
                text-decoration: underline;
            }

            .footer-message {
                margin-top: 20px;
                font-size: 0.9em;
                color: #AAAAAA; /* Lighter grey for description */
                text-align: center;
            }
            .key {
                background-color: #555; /* Darker background for key highlights */
                padding: 2px 5px;
                border-radius: 3px;
                font-family: monospace;
                font-weight: bold;
                color: white; /* Ensure key text is white */
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>ℹ️ About CodeGenie</h1>
            </div>

            <p><strong>CodeGenie</strong> is an intelligent coding assistant that leverages the power of AI to help you write, complete, debug, and understand code more efficiently. Whether you're drafting new logic, improving existing snippets, or exploring creative implementations, CodeGenie is your reliable development partner.</p>

            <h2>🔮 Key Features</h2>
            <h3>💡 1. Intelligent Snippet Generation</h3>
            <p>Quickly generate context-aware code snippets tailored to your needs. Use this when you want the AI to generate a block of code based on your comments, function names, or logic hints.</p>
            <ul>
                <li><strong>⚡ Inline Snippet <span class="key">[Shift+I]</span>:</strong> Instantly inserts a relevant snippet at your cursor location without leaving your current view.</li>
                <li><strong>📋 Panel Snippet <span class="key">[Shift+P]</span>:</strong> Opens a full panel with structured AI-generated snippet, detailed explanation, and sample usage.</li>
            </ul>

            <h3>✨ 2. Autocompletion</h3>
            <p>Complete partial code or unfinished functions with intelligent context-based generation. Best used when you're in the middle of writing code and need a full working version of what you’ve started.</p>
            <ul>
                <li><strong>⚡ Inline Autocomplete <span class="key">[Alt+I]</span>:</strong> Instantly inserts the completed version of the input code. Ideal for fast-paced development or when working with short code files.</li>
                <li><strong>📋 Panel Autocomplete <span class="key">[Alt+P]</span>:</strong> Opens a detailed panel showing:🐞 Debug Analysis,✅ Completed Code,💡 Explanation, 🚀 Example.</li>
            </ul>
            <p>Use this when you want thorough insight or suspect bugs in your code.</p>

            <h3>💬 3. Code Suggestions</h3>
            <p>Get multiple intelligent suggestions and toggle between them for flexible experimentation. Great when you're unsure of the best approach or want to compare alternatives.</p>
            <ul>
                <li><strong>⚡ Inline Suggestions <span class="key">[Ctrl+I]</span>:</strong> Installs suggestions inline for rapid comparison and direct editing.</li>
                <li><strong>⏩ Quick Actions for Inline Suggestions:</strong>
                    <ul>
                        <li><span class="key">Press Key 1, 2, 3</span>: Insert suggestion 1, 2, or 3.</li>
                        <li><span class="key">Ctrl+1, Ctrl+2, Ctrl+3</span>: Delete the corresponding suggestion.</li>
                        <li><span class="key">Esc</span>: Invert prompt for better suggestions.</li>
                    </ul>
                </li>
                <li><strong>📋 Panel Suggestions <span class="key">[Ctrl+P]</span>:</strong> Opens a suggestion panel showing multiple code versions with explanations.</li>
            </ul>

            <h2>🧭 Usage Guide</h2>
            <ul>
                <li><strong>🪄 Top-right Editor Buttons:</strong> Intelligent Snippet 💡, Autocompletion ✨, Code Suggestion 🗎, CodeGenie Chatbot 🤖</li>
                <li><strong>🧠 Sub-feature Selection:</strong> When triggering features via buttons, a pop-up menu appears—use it to choose between inline or panel mode.</li>
                <li><strong>🤖 CodeGenie Chatbot</strong> allows you to interact conversationally with the bot, ask follow-up queries, or generate ideas. It features a collapsible chat interface designed for productive assistance.</li>
                <li><strong>✍ Provide Context:</strong> Comments, partial code, or logical hints to improve generation quality.</li>
                <li><strong>🎯 Edit and Review:</strong> Use generated code as a base and fine-tune it to match your style or requirements.</li>
            </ul>

            <h2>🔗 Source Code</h2>
            <p>CodeGenie is open source! You can find the repository on GitHub: <a href="https://github.com/kmecofficial/CodeGenie-G413-PS25" target="_blank">https://github.com/kmecofficial/CodeGenie-G413-PS25</a></p>

            <p>Let CodeGenie be your coding companion — always ready to turn your ideas into working code. 🧞</p>
        </div>
    </body>
    </html>
    `;
}
