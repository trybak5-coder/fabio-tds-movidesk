/**
 * Configurações Globais
 */
const CONFIG = {
    N8N_URL: 'https://chat-tdsoft.duckdns.org/webhook/chat-assistente',
    FEEDBACK_URL: 'https://chat-tdsoft.duckdns.org/webhook/feedback',
    MAX_IMAGE_WIDTH: 800,
    JPEG_QUALITY: 0.7,
    SILENCE_TIMEOUT: 5000 // 5 segundos de silêncio para parar
};

/**
 * Estado da Aplicação
 */
const State = {
    conversationHistory: [],
    currentContext: '',
    sessionId: null,
    selectedFile: null, // { data: base64, type: mimeType, name: fileName }
    isRecording: false,
    recognition: null,
    initialText: '',
    silenceTimer: null
};

/**
 * Utilitários
 */
const Utils = {
    // Redimensiona imagem para base64
    resizeImage: (base64, maxWidth) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', CONFIG.JPEG_QUALITY));
            };
            img.src = base64;
        });
    },

    // Copia texto para área de transferência
    copyToClipboard: (text, button) => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = text;
        const plainText = tempDiv.textContent || tempDiv.innerText;

        navigator.clipboard.writeText(plainText).then(() => {
            const originalIcon = button.innerHTML;
            button.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            button.classList.add('copied');
            setTimeout(() => {
                button.innerHTML = originalIcon; // Restaura ícone original
                button.classList.remove('copied');
            }, 2000);
        }).catch(err => console.error('Erro ao copiar:', err));
    },

    // Gera ID único (fallback)
    generateId: () => `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
};

/**
 * Interface de Usuário (UI)
 */
const UI = {
    elements: {
        chatScreen: document.getElementById('chat-screen'),
        chatBox: document.getElementById('chat-box'),
        chatInput: document.getElementById('chat-input'),
        sendBtn: document.getElementById('send-btn-visible'),
        chatForm: document.getElementById('chat-form'),
        imageInput: document.getElementById('image-input'),
        attachBtn: document.getElementById('attach-btn'),
        micBtn: document.getElementById('mic-btn'),
        imagePreview: document.getElementById('image-preview'),
        previewImg: document.getElementById('preview-img'),
        removeImageBtn: document.getElementById('remove-image-btn')
    },

    init: () => {
        // Event Listeners Básicos
        UI.elements.attachBtn.addEventListener('click', () => UI.elements.imageInput.click());
        UI.elements.imageInput.addEventListener('change', Handlers.handleFileSelect);
        UI.elements.removeImageBtn.addEventListener('click', Handlers.handleRemoveFile);
        UI.elements.chatForm.addEventListener('submit', Handlers.handleSubmit);

        // Inicializa Reconhecimento de Voz
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            State.recognition = new SpeechRecognition();
            State.recognition.lang = 'pt-BR';
            State.recognition.continuous = true; // Contínuo
            State.recognition.interimResults = true;

            const resetSilenceTimer = () => {
                clearTimeout(State.silenceTimer);
                State.silenceTimer = setTimeout(() => {
                    console.log('⏰ Tempo de silêncio esgotado.');
                    if (State.isRecording) State.recognition.stop();
                }, CONFIG.SILENCE_TIMEOUT);
            };

            State.recognition.onstart = () => {
                State.isRecording = true;
                State.initialText = UI.elements.chatInput.value;
                UI.elements.micBtn.classList.add('recording');
                UI.elements.chatInput.placeholder = "Ouvindo... (Fale agora)";
                resetSilenceTimer();
            };

            State.recognition.onend = () => {
                State.isRecording = false;
                clearTimeout(State.silenceTimer);
                UI.elements.micBtn.classList.remove('recording');
                UI.elements.chatInput.placeholder = "Digite sua mensagem...";
            };

            State.recognition.onresult = (event) => {
                resetSilenceTimer();

                // Concatena resultados da sessão atual
                const currentSessionTranscript = Array.from(event.results)
                    .map(result => result[0].transcript)
                    .join('');

                // Adiciona espaço se necessário
                const separator = (State.initialText && !State.initialText.endsWith(' ') && currentSessionTranscript) ? ' ' : '';

                UI.elements.chatInput.value = State.initialText + separator + currentSessionTranscript;
            };

            State.recognition.onerror = (event) => {
                console.error('Erro no reconhecimento de voz:', event.error);
                if (event.error !== 'no-speech') {
                    State.isRecording = false;
                    UI.elements.micBtn.classList.remove('recording');
                }
            };

            UI.elements.micBtn.addEventListener('click', Handlers.toggleRecording);
        } else {
            UI.elements.micBtn.style.display = 'none';
            console.warn('Navegador não suporta Web Speech API');
        }

        UI.elements.chatInput.focus();
        console.log('✅ UI Inicializada');
    },

    addMessage: (text, type, relatedQuestion = null) => {
        UI.elements.chatScreen.classList.remove('initial-state');
        UI.elements.chatScreen.classList.add('chat-active');

        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = `chat-bubble chat-bubble-${type}`;
        bubbleDiv.innerHTML = text;

        // Ações (Copiar, Feedback)
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';

        // Botão Copiar
        const copyBtn = document.createElement('button');
        copyBtn.className = 'action-btn';
        copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        copyBtn.title = 'Copiar';
        copyBtn.onclick = () => Utils.copyToClipboard(text, copyBtn);
        actionsDiv.appendChild(copyBtn);

        // Feedback (apenas para AI)
        if (type === 'ai') {
            const createFeedbackBtn = (icon, typeStr, title) => {
                const btn = document.createElement('button');
                btn.className = 'action-btn';
                btn.innerHTML = icon;
                btn.title = title;
                return btn;
            };

            const likeIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>';
            const dislikeIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path></svg>';

            const likeBtn = createFeedbackBtn(likeIcon, '👍', 'Gostei');
            const dislikeBtn = createFeedbackBtn(dislikeIcon, '👎', 'Não gostei');

            likeBtn.onclick = () => API.sendFeedback('👍', text, relatedQuestion, likeBtn, dislikeBtn);
            dislikeBtn.onclick = () => API.sendFeedback('👎', text, relatedQuestion, dislikeBtn, likeBtn);

            actionsDiv.appendChild(likeBtn);
            actionsDiv.appendChild(dislikeBtn);
        }

        bubbleDiv.appendChild(actionsDiv);
        UI.elements.chatBox.appendChild(bubbleDiv);
        UI.scrollToBottom();
    },

    addLoading: () => {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'chat-bubble chat-bubble-loading';
        loadingDiv.id = 'loading-indicator';
        loadingDiv.innerHTML = '<span></span> <span></span> <span></span>';
        UI.elements.chatBox.appendChild(loadingDiv);
        UI.scrollToBottom();
    },

    removeLoading: () => {
        const loading = document.getElementById('loading-indicator');
        if (loading) loading.remove();
    },

    scrollToBottom: () => {
        const screen = UI.elements.chatScreen;
        const isNearBottom = screen.scrollHeight - screen.scrollTop - screen.clientHeight < 500;
        if (isNearBottom) {
            screen.scrollTo({ top: screen.scrollHeight, behavior: 'smooth' });
        } else {
            screen.scrollTop = screen.scrollHeight;
        }
    },

    showPreview: (src, isPDF = false) => {
        UI.elements.previewImg.src = src;
        UI.elements.imagePreview.style.display = 'block';
        if (isPDF) {
            UI.elements.previewImg.title = "PDF Selecionado";
        }
    },

    clearPreview: () => {
        UI.elements.previewImg.src = '';
        UI.elements.imagePreview.style.display = 'none';
        UI.elements.imageInput.value = '';
    },

    toggleInput: (disabled) => {
        UI.elements.chatInput.disabled = disabled;
        UI.elements.sendBtn.disabled = disabled;
        if (!disabled) UI.elements.chatInput.focus();
    }
};

/**
 * Comunicação com API (Backend)
 */
const API = {
    sendMessage: async (payload) => {
        try {
            const response = await fetch(CONFIG.N8N_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Erro ${response.status}: ${errorText || 'Falha na requisição'}`);
            }

            const text = await response.text();
            try {
                return JSON.parse(text);
            } catch {
                return { resposta: text };
            }
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    sendFeedback: async (type, resposta, pergunta, btnClicked, btnOther) => {
        if (btnClicked.disabled) return;

        btnClicked.classList.add(type === '👍' ? 'liked' : 'disliked');
        btnOther.classList.remove(type === '👍' ? 'disliked' : 'liked');
        btnClicked.disabled = true;
        btnOther.disabled = true;

        try {
            const params = new URLSearchParams({
                sessionId: State.sessionId || '',
                pergunta: pergunta || '',
                resposta: resposta || '',
                feedback: type,
                dataHora: new Date().toISOString()
            });

            await fetch(`${CONFIG.FEEDBACK_URL}?${params.toString()}`, {
                method: 'GET',
                mode: 'no-cors'
            });
            console.log(`Feedback ${type} enviado`);
        } catch (error) {
            console.error('Erro feedback:', error);
        }
    }
};

/**
 * Manipuladores de Eventos
 */
const Handlers = {
    handleFileSelect: async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const isImage = file.type.startsWith('image/');
        const isPDF = file.type === 'application/pdf';

        if (!isImage && !isPDF) {
            alert('Apenas imagens e PDFs são permitidos.');
            UI.clearPreview();
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            let finalData = event.target.result;

            if (isImage) {
                finalData = await Utils.resizeImage(finalData, CONFIG.MAX_IMAGE_WIDTH);
                UI.showPreview(finalData, false);
            } else {
                const pdfIcon = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjI1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjI1MCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNDAlIiBmb250LXNpemU9IjQ4IiBmaWxsPSIjZWY0NDQ0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiPvCfk4Q8L3RleHQ+PHRleHQgeD0iNTAlIiB5PSI2MCUiIGZvbnQtc2l6ZT0iMTYiIGZpbGw9IiM2YjcyODAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCI+UERGIFNlbGVjaW9uYWRvPC90ZXh0Pjwvc3ZnPg==';
                UI.showPreview(pdfIcon, true);
            }

            State.selectedFile = {
                data: finalData,
                type: file.type,
                name: file.name
            };
        };
        reader.readAsDataURL(file);
    },

    handleRemoveFile: () => {
        State.selectedFile = null;
        UI.clearPreview();
    },

    toggleRecording: () => {
        if (!State.recognition) return;

        if (State.isRecording) {
            State.recognition.stop();
        } else {
            State.recognition.start();
        }
    },

    handleSubmit: async (e) => {
        e.preventDefault();

        // Se estiver gravando, para a gravação imediatamente
        if (State.isRecording && State.recognition) {
            State.recognition.stop();
        }

        const text = UI.elements.chatInput.value.trim();
        const file = State.selectedFile;

        if (!text && !file) return;

        // Limpa o input IMEDIATAMENTE
        UI.elements.chatInput.value = '';

        // Prepara mensagem do usuário
        let userDisplay = text;
        if (file) {
            const isPDF = file.type === 'application/pdf';
            const icon = isPDF
                ? 'https://cdn-icons-png.flaticon.com/512/337/337946.png' // Ícone PDF genérico
                : file.data; // A própria imagem

            // Cria thumbnail clicável
            const thumbnailHtml = `
                <div class="file-thumbnail" onclick="const w=window.open(); w.document.write('<iframe src=\\'${file.data}\\' frameborder=\\'0\\' style=\\'border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;\\' allowfullscreen></iframe>');">
                    <img src="${icon}" alt="Arquivo">
                    <span>${file.name}</span>
                </div>
            `;

            userDisplay = text ? `${text}<br>${thumbnailHtml}` : thumbnailHtml;
        }

        UI.addMessage(userDisplay, 'user');
        UI.toggleInput(true);
        UI.clearPreview();
        State.selectedFile = null;

        UI.addLoading();

        try {
            const payload = {
                pergunta: text,
                historico: State.conversationHistory,
                contexto: State.currentContext,
                sessionId: State.sessionId
            };

            if (file) {
                const matches = file.data.match(/^data:(.+);base64,(.+)$/);
                if (matches) {
                    payload.mimeType = matches[1];
                    payload.imagem = matches[2];
                } else {
                    payload.imagem = file.data;
                    payload.mimeType = file.type;
                }

                if (!payload.pergunta) {
                    payload.pergunta = payload.mimeType === 'application/pdf'
                        ? "Analise este PDF e extraia o conteúdo relevante."
                        : "Analise esta imagem.";
                }
            }

            const data = await API.sendMessage(payload);

            UI.removeLoading();

            const aiResponse = data.resposta || 'Desculpe, não entendi.';
            UI.addMessage(aiResponse, 'ai', text);

            if (data.sessionId) State.sessionId = data.sessionId;
            if (data.historico) State.conversationHistory = data.historico;
            if (data.contexto) State.currentContext = data.contexto;

        } catch (error) {
            UI.removeLoading();
            console.error(error);
            UI.addMessage(`❌ <strong>Erro:</strong> Não foi possível processar sua mensagem.<br><small>${error.message}</small>`, 'ai');
        } finally {
            UI.toggleInput(false);
        }
    }
};

// Inicializa a aplicação
document.addEventListener('DOMContentLoaded', UI.init);
