(function() {
    const vscode = acquireVsCodeApi();
    
    // State management
    let chatHistory = [];
    let lastLintUpdate = {}; // Track last lint update per file to prevent duplicates
    let thinkingIndicator = null;
    let isProcessing = false; // Track if RAG agent is processing
    let cacheStats = {
        size: 0,
        maxSize: 500,
        hits: 0,
        misses: 0,
        hitRate: 0.0,
        ttl: 300,
        layers: {
            response: { size: 0, hits: 0, misses: 0, hitRate: 0.0 },
            retrieval: { size: 0, hits: 0, misses: 0, hitRate: 0.0 },
            web: { size: 0, hits: 0, misses: 0, hitRate: 0.0 },
            embedding: { size: 0, hits: 0, misses: 0, hitRate: 0.0 }
        }
    };

    // DOM Elements
    const chatContainer = document.getElementById('chatContainer');
    const emptyState = document.getElementById('emptyState');
    const queryInput = document.getElementById('queryInput');
    const submitBtn = document.getElementById('submitBtn');
    const stopBtn = document.getElementById('stopBtn');
    const clearChatBtn = document.getElementById('clearChatBtn');
    
    // Verify critical elements exist
    if (!clearChatBtn) {
        console.error('Clear Chat button not found in DOM');
    }
    const questionBtns = document.querySelectorAll('.question-btn');
    const refreshCacheBtn = document.getElementById('refreshCacheBtn');
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    const sendEmailBtn = document.getElementById('sendEmailBtn');
    const emailSubject = document.getElementById('emailSubject');
    const emailBody = document.getElementById('emailBody');
    const emailStatus = document.getElementById('emailStatus');
    
    // Verify email elements exist
    if (!sendEmailBtn || !emailSubject || !emailBody || !emailStatus) {
        console.error('Email functionality elements not found in DOM');
    }
    const securityHeader = document.getElementById('securityHeader');
    const securityContent = document.getElementById('securityContent');
    const shareBtn = document.getElementById('shareBtn');
    const bookmarkBtn = document.getElementById('bookmarkBtn');
    const refreshBtn = document.getElementById('refreshBtn');

    // Initialize
    updateCacheStats();
    setupEventListeners();
    
    // Ensure Clear Chat button is always enabled (like Cursor IDE)
    if (clearChatBtn) {
        clearChatBtn.disabled = false;
        isProcessing = false;
    }

    function setupEventListeners() {
        // Submit query
        submitBtn.addEventListener('click', handleSubmit);
        queryInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
            }
        });

        // Stop query
        stopBtn.addEventListener('click', handleStop);

        // Clear chat - works like Cursor IDE: instant, no restrictions
        if (clearChatBtn) {
            clearChatBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Stop any ongoing processing first (like Cursor IDE)
                if (isProcessing) {
                    // Stop the current query
                    vscode.postMessage({ type: 'stop' });
                }
                
                // Remove thinking indicator if visible
                removeThinkingIndicator();
                
                // Clear chat history immediately (this clears both query and response)
                chatHistory = [];
                
                // Reset processing state
                isProcessing = false;
                
                // Reset input and button states
                queryInput.disabled = false;
                queryInput.value = '';  // Clear query input
                submitBtn.disabled = false;
                submitBtn.style.display = 'flex';
                stopBtn.style.display = 'none';
                stopBtn.disabled = true;
                
                // Enable clear chat button (should already be enabled, but ensure it)
                if (clearChatBtn) {
                    clearChatBtn.disabled = false;
                }
                
                // Render empty chat state immediately
                renderChat();
                
                // Notify backend to clear chat history
                vscode.postMessage({ type: 'clearChat' });
            });
        } else {
            console.error('Cannot attach event listener: Clear Chat button not found');
        }

        // Example questions
        questionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const query = btn.getAttribute('data-query');
                queryInput.value = query;
                handleSubmit();
            });
        });

        // Cache controls
        refreshCacheBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'refreshCacheStats' });
        });

        clearCacheBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear the cache?')) {
                vscode.postMessage({ type: 'clearCache' });
            }
        });

        // Email
        if (sendEmailBtn && emailSubject && emailBody && emailStatus) {
            sendEmailBtn.addEventListener('click', handleSendEmail);
        } else {
            console.error('Cannot attach email event listener: Email elements not found');
        }

        // Security accordion
        securityHeader.addEventListener('click', () => {
            securityContent.classList.toggle('expanded');
            const chevron = securityHeader.querySelector('.accordion-chevron');
            chevron.textContent = securityContent.classList.contains('expanded') ? '▲' : '▼';
        });

        // Header actions
        shareBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'share' });
        });

        bookmarkBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'bookmark' });
        });

        refreshBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'refresh' });
        });

        // Log Helper
        var logHelperSelectFilesBtn = document.getElementById('logHelperSelectFilesBtn');
        if (logHelperSelectFilesBtn) {
            logHelperSelectFilesBtn.addEventListener('click', () => {
                vscode.postMessage({ type: 'logHelperSelectFiles' });
            });
        }
        var logHelperRunBtn = document.getElementById('logHelperRunBtn');
        if (logHelperRunBtn) {
            logHelperRunBtn.addEventListener('click', () => {
                var paths = window._logHelperPaths || [];
                if (paths.length === 0) return;
                logHelperRunBtn.disabled = true;
                var logHelperOutput = document.getElementById('logHelperOutput');
                if (logHelperOutput) logHelperOutput.textContent = 'Running...';
                vscode.postMessage({ type: 'logHelperPatternAgent', logFiles: paths });
            });
        }
        var logHelperUserActionsBtn = document.getElementById('logHelperUserActionsBtn');
        if (logHelperUserActionsBtn) {
            logHelperUserActionsBtn.addEventListener('click', () => {
                var paths = window._logHelperPaths || [];
                if (paths.length === 0) return;
                logHelperUserActionsBtn.disabled = true;
                var logHelperOutput = document.getElementById('logHelperOutput');
                if (logHelperOutput) logHelperOutput.textContent = 'Running...';
                vscode.postMessage({ type: 'logHelperUserActions', logFiles: paths });
            });
        }
        var logHelperMmmBtn = document.getElementById('logHelperMmmBtn');
        if (logHelperMmmBtn) {
            logHelperMmmBtn.addEventListener('click', () => {
                var errorInput = document.getElementById('logHelperMmmErrorInput');
                var lastError = errorInput ? errorInput.value.trim() : '';
                if (!lastError) {
                    alert('Please enter an error message for MMM analysis');
                    return;
                }
                logHelperMmmBtn.disabled = true;
                var logHelperOutput = document.getElementById('logHelperOutput');
                if (logHelperOutput) logHelperOutput.textContent = 'Running...';
                vscode.postMessage({ type: 'logHelperMmm', lastError: lastError, persona: 'developer' });
            });
        }
    }

    function renderRepoAnalysis(summary, timestamp) {
        const { errorsContent } = ensureErrorsSection();
        if (!summary) return;
        const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString() : '';

        const recent = (summary.recentFiles || []).slice(0, 5).map(r => {
            const t = new Date(r.mtime).toLocaleTimeString();
            return `<li>${escapeHtml(r.file)} (${t})</li>`;
        }).join('');

        const diag = (summary.diagnostics || []).slice(0, 5).map(d => {
            const loc = d.line ? `Line ${d.line}${d.character ? ':' + d.character : ''}` : '';
            return `<li>${escapeHtml(d.file)} ${loc} — ${escapeHtml(d.message)}</li>`;
        }).join('');

        const deps = summary.deps;
        const depsLines = [];
        if (deps?.packageJson?.length) depsLines.push(`npm/yarn: ${deps.packageJson.slice(0,5).join(', ')}`);
        if (deps?.requirements?.length) depsLines.push(`pip: ${deps.requirements.slice(0,5).join(', ')}`);
        if (deps?.goMod?.length) depsLines.push(`go.mod: ${deps.goMod.slice(0,5).join(', ')}`);

        const card = document.createElement('div');
        card.innerHTML = `
            <div class="message-bubble assistant-bubble" style="max-width: 100%; background: var(--vscode-editor-background); border: 1px solid var(--border-color); padding: 10px;">
                <div class="message-label">📁 Repo Analysis ${timeStr ? '(' + timeStr + ')' : ''}</div>
                <div style="font-size: 12px; color: var(--vscode-foreground); line-height: 1.5; margin-top: 6px;">
                    <div>Files scanned: ${summary.fileCount} | Total size: ${(summary.totalBytes / 1024 / 1024).toFixed(1)} MB</div>
                    ${depsLines.length ? `<div style="margin-top:4px;">Dependencies: ${depsLines.join(' • ')}</div>` : ''}
                    ${recent ? `<div style="margin-top:8px;"><strong>Recent files</strong><ul style="margin:4px 0 0 16px; padding:0;">${recent}</ul></div>` : ''}
                    ${diag ? `<div style="margin-top:8px;"><strong>Diagnostics (sample)</strong><ul style="margin:4px 0 0 16px; padding:0;">${diag}</ul></div>` : '<div style="margin-top:8px;">Diagnostics: none</div>'}
                </div>
            </div>
        `;
        errorsContent.appendChild(card);
    }

    function handleSubmit() {
        const query = queryInput.value.trim();
        if (!query) {
            return;
        }

        if (query.length > 500) {
            alert('Query exceeds maximum length of 500 characters');
            return;
        }

        // Set processing state
        isProcessing = true;
        // Clear Chat button remains enabled (like Cursor IDE)

        // Add user message to chat
        addMessage('user', query);
        queryInput.value = '';
        queryInput.disabled = true;
        submitBtn.disabled = true;
        submitBtn.style.display = 'none';
        stopBtn.style.display = 'flex';
        stopBtn.disabled = false;

        // Show thinking indicator
        showThinkingIndicator();

        // Send query to extension
        vscode.postMessage({
            type: 'query',
            query: query
        });
    }

    function showThinkingIndicator() {
        // Remove existing thinking indicator if any
        removeThinkingIndicator();
        
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'message thinking-message';
        thinkingDiv.id = 'thinkingIndicator';
        
        thinkingDiv.innerHTML = `
            <div class="message-bubble thinking-bubble">
                <div class="thinking-indicator">
                    <span class="thinking-text">zeroui thinking</span>
                    <div class="thinking-dots">
                        <div class="thinking-dot"></div>
                        <div class="thinking-dot"></div>
                        <div class="thinking-dot"></div>
                    </div>
                </div>
            </div>
        `;
        
        chatContainer.appendChild(thinkingDiv);
        thinkingIndicator = thinkingDiv;
        
        // Auto-scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function removeThinkingIndicator() {
        if (thinkingIndicator) {
            thinkingIndicator.remove();
            thinkingIndicator = null;
        } else {
            // Fallback: try to find and remove by ID
            const existing = document.getElementById('thinkingIndicator');
            if (existing) {
                existing.remove();
            }
        }
    }

    function handleStop() {
        stopBtn.disabled = true;
        vscode.postMessage({
            type: 'stop'
        });
    }

    function handleSendEmail() {
        // Verify elements exist
        if (!emailSubject || !emailBody || !emailStatus || !sendEmailBtn) {
            console.error('Email elements not available');
            return;
        }
        
        const subject = emailSubject.value.trim();
        const body = emailBody.value.trim();

        if (!subject || !body) {
            emailStatus.textContent = 'Please provide both subject and body';
            emailStatus.className = 'email-status error';
            return;
        }

        // Disable button and show loading state
        sendEmailBtn.disabled = true;
        sendEmailBtn.innerHTML = '<span>✉️</span> Sending...';
        emailStatus.textContent = '';
        emailStatus.className = 'email-status';

        // Send email request to backend
        vscode.postMessage({
            type: 'sendEmail',
            subject: subject,
            body: body
        });
    }

    function addMessage(role, content, cached = false, sources = [], model = null) {
        // Prevent duplicate messages - check if the last message is the same
        if (chatHistory.length > 0) {
            const lastMessage = chatHistory[chatHistory.length - 1];
            if (lastMessage.role === role && lastMessage.content === content) {
                // Duplicate message detected, skip adding
                return;
            }
        }
        chatHistory.push({ role, content, cached, sources, model });
        renderChat();
    }

    function renderChat() {
        if (chatHistory.length === 0) {
            emptyState.style.display = 'block';
            chatContainer.innerHTML = '';
            return;
        }

        emptyState.style.display = 'none';
        chatContainer.innerHTML = '';

        chatHistory.forEach((msg, index) => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${msg.role}-message`;

            if (msg.role === 'user') {
                messageDiv.innerHTML = `
                    <div class="message-bubble user-bubble">
                        <div class="message-text">${escapeHtml(msg.content)}</div>
                    </div>
                `;
            } else {
                const cacheIndicator = msg.cached ? '<span class="cache-indicator">⚡ Cached</span>' : '';
                const modelIndicator = msg.model ? `<span class="model-indicator">Model: ${escapeHtml(msg.model)}</span>` : '';
                const sourcesHtml = renderSources(msg.sources);
                messageDiv.innerHTML = `
                    <div class="message-bubble assistant-bubble">
                        <div class="message-label">Inventory Assistant</div>
                        <div class="message-text">${formatResponse(msg.content)}</div>
                        ${cacheIndicator}
                        ${modelIndicator}
                        ${sourcesHtml}
                        <button class="copy-btn" onclick="copyToClipboard(${index})" title="Copy response">
                            📋
                        </button>
                    </div>
                `;
            }

            chatContainer.appendChild(messageDiv);
        });

        // Auto-scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function formatResponse(text) {
        // Convert line breaks to <br>
        let formatted = escapeHtml(text).replace(/\n/g, '<br>');
        
        // Format bullet points
        formatted = formatted.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');
        if (formatted.includes('<li>')) {
            formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        }

        // Format calculations (e.g., "20 units / 5.0 units/day = 4 days")
        formatted = formatted.replace(/(\d+(?:\.\d+)?)\s*(units?|days?)\s*\/\s*(\d+(?:\.\d+)?)\s*(units?\/day)/g, 
            '<span class="calculation">$1 $2 / $3 $4</span>');

        return formatted;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function copyToClipboard(index) {
        const message = chatHistory[index];
        if (message && message.role === 'assistant') {
            vscode.postMessage({
                type: 'copyResponse',
                text: message.content
            });
        }
    }

    function renderSources(sources) {
        // Always show sources section
        if (!sources || sources.length === 0) {
            return '<div class="sources"><div class="message-label">📚 Sources</div><div style="font-style: italic; color: var(--vscode-descriptionForeground); font-size: 11px; padding: 4px 0;">No sources available (web search may not be configured or returned no results)</div></div>';
        }
        
        // Separate internal and web sources for better display
        const internalSources = sources.filter(s => s.type === 'internal');
        const webSources = sources.filter(s => s.type === 'web');
        
        let html = '<div class="sources"><div class="message-label">📚 Sources</div>';
        
        if (internalSources.length > 0) {
            html += '<div style="margin-top: 6px;"><strong style="font-size: 11px;">Internal Sources:</strong><ul style="margin: 4px 0 0 16px; padding: 0;">';
            internalSources.forEach((s, i) => {
                const label = `Internal ${i + 1}`;
                if (s.link) {
                    html += `<li><a href="${s.link}" target="_blank" rel="noreferrer">${label}: ${escapeHtml(s.title || s.link)}</a></li>`;
                } else {
                    html += `<li>${label}: ${escapeHtml(s.title || '')}</li>`;
                }
            });
            html += '</ul></div>';
        }
        
        if (webSources.length > 0) {
            html += '<div style="margin-top: 8px;"><strong style="font-size: 11px;">Web Sources:</strong><ul style="margin: 4px 0 0 16px; padding: 0;">';
            webSources.forEach((s, i) => {
                const label = `Web ${i + 1}`;
                if (s.link) {
                    html += `<li><a href="${s.link}" target="_blank" rel="noreferrer">${label}: ${escapeHtml(s.title || s.link)}</a> 🔗</li>`;
                } else {
                    html += `<li>${label}: ${escapeHtml(s.title || '')}</li>`;
                }
            });
            html += '</ul></div>';
        }
        
        html += '</div>';
        return html;
    }

    function updateCacheStats() {
        document.getElementById('cacheSize').textContent = `${cacheStats.size}/${cacheStats.maxSize}`;
        document.getElementById('cacheHits').textContent = cacheStats.hits;
        document.getElementById('cacheMisses').textContent = cacheStats.misses;
        document.getElementById('hitRate').textContent = cacheStats.hitRate.toFixed(1);
        document.getElementById('cacheTTL').textContent = cacheStats.ttl;
        
        // Update per-layer statistics
        if (cacheStats.layers) {
            const layers = cacheStats.layers;
            if (layers.response) {
                document.getElementById('responseCacheSize').textContent = layers.response.size;
                document.getElementById('responseCacheHits').textContent = layers.response.hits;
                document.getElementById('responseCacheMisses').textContent = layers.response.misses;
                document.getElementById('responseCacheHitRate').textContent = layers.response.hitRate.toFixed(1);
            }
            if (layers.retrieval) {
                document.getElementById('retrievalCacheSize').textContent = layers.retrieval.size;
                document.getElementById('retrievalCacheHits').textContent = layers.retrieval.hits;
                document.getElementById('retrievalCacheMisses').textContent = layers.retrieval.misses;
                document.getElementById('retrievalCacheHitRate').textContent = layers.retrieval.hitRate.toFixed(1);
            }
            if (layers.web) {
                document.getElementById('webCacheSize').textContent = layers.web.size;
                document.getElementById('webCacheHits').textContent = layers.web.hits;
                document.getElementById('webCacheMisses').textContent = layers.web.misses;
                document.getElementById('webCacheHitRate').textContent = layers.web.hitRate.toFixed(1);
            }
            if (layers.embedding) {
                document.getElementById('embeddingCacheSize').textContent = layers.embedding.size;
                document.getElementById('embeddingCacheHits').textContent = layers.embedding.hits;
                document.getElementById('embeddingCacheMisses').textContent = layers.embedding.misses;
                document.getElementById('embeddingCacheHitRate').textContent = layers.embedding.hitRate.toFixed(1);
            }
        }
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.type) {
            case 'response':
                removeThinkingIndicator();
                addMessage('assistant', message.response, message.cached, message.sources || [], message.model || null);
                queryInput.disabled = false;
                submitBtn.disabled = false;
                submitBtn.style.display = 'flex';
                stopBtn.style.display = 'none';
                // Response complete
                isProcessing = false;
                break;

            case 'error':
                removeThinkingIndicator();
                addMessage('assistant', `Error: ${message.message}`);
                queryInput.disabled = false;
                submitBtn.disabled = false;
                submitBtn.style.display = 'flex';
                stopBtn.style.display = 'none';
                // Response complete (error)
                isProcessing = false;
                break;

            case 'stopped':
                removeThinkingIndicator();
                addMessage('assistant', message.message || 'Query processing stopped');
                queryInput.disabled = false;
                submitBtn.disabled = false;
                submitBtn.style.display = 'flex';
                stopBtn.style.display = 'none';
                // Response complete (stopped)
                isProcessing = false;
                break;

            case 'cacheStatsUpdate':
                cacheStats = message.stats;
                updateCacheStats();
                break;

            case 'lintUpdate':
                renderLintUpdatePanel(
                    message.file, 
                    message.issues || [], 
                    message.errors, 
                    message.warnings, 
                    message.timestamp
                );
                break;

            case 'autoRcaResponse':
                renderAutoRcaResponsePanel(message.file, message.rcaResponse, message.sources, message.timestamp);
                break;

            case 'autoRcaError':
                renderErrorBanner(`Auto-RCA failed for ${message.file}: ${message.error || 'RCA analysis failed'}`);
                break;

            case 'repoAnalysis':
                renderRepoAnalysis(message.summary, message.timestamp);
                break;

            case 'autoRcaResponse':
                renderAutoRcaResponse(message.file, message.rcaResponse, message.sources, message.timestamp);
                break;

            case 'autoRcaError':
                addMessage('assistant', `❌ Auto-RCA failed for ${message.file}: ${message.error}`, false, []);
                break;

            case 'cacheCleared':
                cacheStats = {
                    size: 0,
                    maxSize: cacheStats.maxSize,
                    hits: 0,
                    misses: 0,
                    hitRate: 0.0,
                    ttl: cacheStats.ttl,
                    layers: {
                        response: { size: 0, hits: 0, misses: 0, hitRate: 0.0 },
                        retrieval: { size: 0, hits: 0, misses: 0, hitRate: 0.0 },
                        web: { size: 0, hits: 0, misses: 0, hitRate: 0.0 },
                        embedding: { size: 0, hits: 0, misses: 0, hitRate: 0.0 }
                    }
                };
                updateCacheStats();
                break;

            case 'chatCleared':
                // Backend confirmed chat is cleared - frontend already cleared UI
                // This ensures synchronization between frontend and backend
                break;

            case 'emailStatus':
                if (sendEmailBtn && emailStatus) {
                    sendEmailBtn.disabled = false;
                    sendEmailBtn.innerHTML = '<span>✉️</span> Send Email';
                    emailStatus.textContent = message.message;
                    emailStatus.className = `email-status ${message.success ? 'success' : 'error'}`;
                    if (message.success && emailSubject && emailBody) {
                        emailSubject.value = '';
                        emailBody.value = '';
                    }
                }
                break;

            case 'logHelperFilesSelected':
                window._logHelperPaths = message.paths || [];
                var logHelperFilesLabel = document.getElementById('logHelperFilesLabel');
                if (logHelperFilesLabel) logHelperFilesLabel.textContent = (window._logHelperPaths.length) + ' file(s) selected';
                break;

            case 'logHelperResult':
                var logHelperOutput = document.getElementById('logHelperOutput');
                if (logHelperOutput) logHelperOutput.textContent = message.result || '';
                var logHelperRunBtn = document.getElementById('logHelperRunBtn');
                if (logHelperRunBtn) logHelperRunBtn.disabled = false;
                var logHelperUserActionsBtn = document.getElementById('logHelperUserActionsBtn');
                if (logHelperUserActionsBtn) logHelperUserActionsBtn.disabled = false;
                var logHelperMmmBtn = document.getElementById('logHelperMmmBtn');
                if (logHelperMmmBtn) logHelperMmmBtn.disabled = false;
                break;
        }
    });

    function ensureErrorsSection() {
        let errorsSection = document.getElementById('errorsSection');
        if (!errorsSection) {
            errorsSection = document.createElement('div');
            errorsSection.id = 'errorsSection';
            errorsSection.className = 'errors-section';
            document.body.appendChild(errorsSection);
        }
        let errorsContent = document.getElementById('errorsContent');
        if (!errorsContent) {
            errorsContent = document.createElement('div');
            errorsContent.id = 'errorsContent';
            errorsSection.appendChild(errorsContent);
        }
        return { errorsSection, errorsContent };
    }

    // Derive dynamic root-cause and solution from the diagnostic message
    function getLintGuidance(iss, lineInfo) {
        const rawMsg = iss?.message || '';
        const msg = rawMsg.toLowerCase();
        let rootDetail = `This diagnostic indicates an issue at ${lineInfo || 'the reported location'}: ${rawMsg || 'Unknown error'}.`;
        let solution = 'Review the code at the indicated line and fix the reported issue.';

        // Syntax-related cues
        if (msg.includes('unexpected token') || msg.includes('expected')) {
            rootDetail = `The parser encountered a syntax/parsing issue at ${lineInfo || 'the reported location'}: ${rawMsg}.`;
            solution = 'Check for missing or extra tokens (bracket, parenthesis, comma, semicolon) and ensure the statement is complete.';
        }
        // Missing semicolon
        if (msg.includes('";" expected') || msg.includes('expected ;') || msg.includes("';' expected")) {
            solution = 'Add a semicolon where indicated or at the end of the statement.';
        }
        // Undefined / cannot find / not defined
        if (msg.includes('not defined') || msg.includes('cannot find') || msg.includes('is not defined')) {
            solution = 'Verify the symbol/import exists, is spelled correctly, and is in scope; fix or add the import/path.';
        }

        return { rootDetail, solution };
    }

    function renderLintUpdatePanel(file, issues, errors, warnings, timestamp) {
        const { errorsContent } = ensureErrorsSection();
        const fileName = file.split(/[/\\]/).pop(); // Get just filename
        
        if (!issues || !issues.length) {
            // No errors - show simple clean message (but check for duplicates)
            const lastUpdate = lastLintUpdate[file];
            if (lastUpdate && lastUpdate.errors === 0 && lastUpdate.warnings === 0) {
                // Already showed "no issues" recently, skip
                return;
            }
            lastLintUpdate[file] = { errors: 0, warnings: 0, issueSignature: 'clean', timestamp: timestamp || Date.now() };
            const cleanCard = document.createElement('div');
            cleanCard.innerHTML = `
                <div style="margin: 8px 0; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--vscode-editor-background);">
                    ✅ ${escapeHtml(fileName)}: No issues detected.
                </div>
            `;
            errorsContent.appendChild(cleanCard);
            return;
        }

        // Errors detected - show prominent notification
        const errorCount = errors || issues.filter(iss => iss.severity === 0).length;
        const warningCount = warnings || issues.filter(iss => iss.severity === 1).length;
        
        // Create issue signature for deduplication
        const issueSignature = issues.map(iss => {
            const pos = iss.range && iss.range.start ? `${iss.range.start.line}:${iss.range.start.character}` : '';
            return `${iss.severity}:${pos}:${iss.message.substring(0, 50)}`;
        }).sort().join('|');
        
        // Check if this is a duplicate of the last update for this file
        const lastUpdate = lastLintUpdate[file];
        const now = timestamp || Date.now();
        const isDuplicate = lastUpdate && 
            lastUpdate.errors === errorCount &&
            lastUpdate.warnings === warningCount &&
            lastUpdate.issueSignature === issueSignature;
        
        if (isDuplicate) {
            // Skip duplicate notification
            return;
        }
        
        // Update last lint update record
        lastLintUpdate[file] = {
            errors: errorCount,
            warnings: warningCount,
            issueSignature: issueSignature,
            timestamp: now
        };
        
        const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString() : '';
        
        // Create simplified, clearer error notification HTML with file/line/policy/rootcause/solution
        const errorHtml = `
            <div style="
                background-color: var(--vscode-editor-background);
                border: 1px solid var(--border-color);
                padding: 10px;
                margin: 8px 0;
                border-radius: 6px;
            ">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <span style="font-size: 16px;">⚠️</span>
                    <div style="font-weight: 600; color: var(--vscode-errorForeground);">
                        ${escapeHtml(fileName)}
                    </div>
                    ${timeStr ? `<span style="margin-left: auto; font-size: 11px; color: var(--vscode-descriptionForeground);">${timeStr}</span>` : ''}
                </div>
                <div style="font-size: 12px; color: var(--vscode-foreground); margin-bottom: 6px;">
                    ${errorCount} error(s)${warningCount ? `, ${warningCount} warning(s)` : ''}
                </div>
                <div style="font-size: 12px; color: var(--vscode-foreground);">
                    ${issues.map((iss, idx) => {
                        const lineNum = iss.range && iss.range.start ? iss.range.start.line + 1 : null;
                        const colNum = iss.range && iss.range.start ? iss.range.start.character + 1 : null;
                        const lineInfo = lineNum ? `Line ${lineNum}${colNum ? `, Col ${colNum}` : ''}` : 'Line ?';
                        const rootcause = escapeHtml(iss.message);
                        const guidance = getLintGuidance(iss, lineInfo);
                        const detailedRoot = guidance.rootDetail ? escapeHtml(guidance.rootDetail) : rootcause;
                        const solution = guidance.solution ? escapeHtml(guidance.solution) : 'Review the code at the indicated line and fix the reported issue.';
                        const policy = 'n/a'; // no policy metadata available from lint
                        return `
                            <div style="margin: 6px 0; padding: 8px; background: var(--assistant-bubble-bg); border: 1px solid var(--border-color); border-radius: 4px;">
                                <div style="font-weight: 600; color: var(--vscode-errorForeground);">${lineInfo}</div>
                                <div style="margin-top: 4px;"><strong>Policy:</strong> ${policy}</div>
                                <div style="margin-top: 4px;"><strong>Root cause:</strong> ${detailedRoot}</div>
                                <div style="margin-top: 4px;"><strong>Solution:</strong> ${solution}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
        
        // Add to errors panel (not chat)
        const card = document.createElement('div');
        card.innerHTML = `
            <div class="message-bubble assistant-bubble" style="max-width: 100%;">
                <div class="message-label">🔴 RAG Error Monitor</div>
                ${errorHtml}
            </div>
        `;
        errorsContent.appendChild(card);
    }

    function renderAutoRcaResponsePanel(file, rcaResponse, sources, timestamp) {
        const { errorsContent } = ensureErrorsSection();
        const fileName = file.split(/[/\\]/).pop();
        const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString() : '';
        
        // Create RCA response HTML
        const rcaHtml = `
            <div style="
                background-color: var(--vscode-inputValidation-infoBackground);
                border-left: 4px solid var(--vscode-textLink-foreground);
                padding: 12px;
                margin: 8px 0;
                border-radius: 4px;
            ">
                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 18px; margin-right: 8px;">🔍</span>
                    <strong style="color: var(--vscode-textLink-foreground);">Root Cause Analysis for ${escapeHtml(fileName)}</strong>
                    ${timeStr ? `<span style="margin-left: auto; font-size: 11px; color: var(--vscode-descriptionForeground);">${timeStr}</span>` : ''}
                </div>
                <div style="font-size: 12px; color: var(--vscode-foreground); white-space: pre-wrap; word-wrap: break-word; margin-bottom: 8px;">
                    ${escapeHtml(rcaResponse).replace(/\\n/g, '<br>')}
                </div>
                ${sources && sources.length ? `<div style="margin-top: 8px;">${renderSources(sources)}</div>` : ''}
            </div>
        `;
        
        const card = document.createElement('div');
        card.innerHTML = `
            <div class="message-bubble assistant-bubble" style="max-width: 100%;">
                <div class="message-label">🔍 Auto Root Cause Analysis</div>
                ${rcaHtml}
            </div>
        `;
        errorsContent.appendChild(card);
    }

    // Expose copyToClipboard globally
    window.copyToClipboard = copyToClipboard;
})();

