// Chat Redesign - Professional Chat Manager
// Focused on excellent UX and ease of use

class ChatManager {
    constructor() {
        // Core properties
        this.socket = null;
        this.currentUserId = null;
        this.users = [];
        this.allUsers = [];
        this.chatHistory = {};
        this.messageInputBaseHeight = 0;

        // Filter state
        this.currentFilters = {
            status: 'all',
            tags: [],
            search: ''
        };

        // Tags
        this.availableTags = [];

        // Follow-up config
        this.followUpConfig = {
            analysisEnabled: true,
            showInChat: true
        };

        // Orders
        this.currentOrders = [];
        this.isExtractingOrder = false;

        // Initialize
        this.init();
    }

    init() {
        this.initializeSocket();
        this.setupEventListeners();
        this.loadUsers();
        this.loadAvailableTags();
        this.setupAutoRefresh();
        this.hideTypingIndicator();
    }

    // ========================================
    // Socket.IO
    // ========================================

    initializeSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            this.showToast('เชื่อมต่อสำเร็จ', 'success');
        });

        this.socket.on('disconnect', () => {
            this.showToast('การเชื่อมต่อขาดหาย', 'warning');
        });

        this.socket.on('newMessage', (data) => {
            this.handleNewMessage(data);
        });

        this.socket.on('followUpTagged', (data) => {
            this.handleFollowUpTagged(data);
        });

        this.socket.on('chatCleared', (data) => {
            if (data.userId === this.currentUserId) {
                this.clearChatDisplay();
            }
            this.loadUsers();
        });

        this.socket.on('userTagsUpdated', (data) => {
            const user = this.allUsers.find(u => u.userId === data.userId);
            if (user) {
                user.tags = data.tags || [];
                this.applyFilters();
            }
        });

        this.socket.on('userPurchaseStatusUpdated', (data) => {
            const user = this.allUsers.find(u => u.userId === data.userId);
            if (user) {
                user.hasPurchased = data.hasPurchased;
                this.applyFilters();
            }
        });

        // Order events
        this.socket.on('orderExtracted', (data) => {
            if (data.userId === this.currentUserId) {
                this.loadOrders();
            }
            // Update user list to show order badge
            this.loadUsers();
        });

        this.socket.on('orderUpdated', (data) => {
            if (data.userId === this.currentUserId) {
                this.loadOrders();
            }
        });

        this.socket.on('orderDeleted', (data) => {
            if (data.userId === this.currentUserId) {
                this.loadOrders();
            }
            // Update user list
            this.loadUsers();
        });

        // Typing indicator
        this.socket.on('userTyping', (data) => {
            if (data && data.userId === this.currentUserId) {
                this.showTypingIndicator(data.platform || '');
            }
        });

        this.socket.on('messageStatusUpdated', (data) => {
            if (!data || data.userId !== this.currentUserId) return;
            // Update latest message state (e.g., delivered/read)
            this.updateMessageStatus(data.messageId, data.status);
        });
    }

    // ========================================
    // Event Listeners
    // ========================================

    setupEventListeners() {
        // Search
        const userSearch = document.getElementById('userSearch');
        if (userSearch) {
            userSearch.addEventListener('input', (e) => {
                this.currentFilters.search = e.target.value.trim();
                this.applyFilters();
            });
        }

        // Clear filters
        const clearFilters = document.getElementById('clearFilters');
        if (clearFilters) {
            clearFilters.addEventListener('click', () => {
                this.clearFilters();
            });
        }

        // Status filter buttons
        document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.currentTarget.dataset.filter;
                document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.currentFilters.status = filter;
                this.applyFilters();
            });
        });

        // Extract order button
        const btnExtractOrder = document.getElementById('btnExtractOrder');
        if (btnExtractOrder) {
            btnExtractOrder.addEventListener('click', () => {
                this.extractOrder();
            });
        }

        // Sidebar toggle (mobile)
        const toggleSidebar = document.getElementById('toggleSidebar');
        const closeSidebar = document.getElementById('closeSidebar');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        const chatSidebar = document.getElementById('chatSidebar');

        if (toggleSidebar) {
            toggleSidebar.addEventListener('click', () => {
                chatSidebar.classList.add('show');
                sidebarOverlay.classList.add('show');
            });
        }

        if (closeSidebar) {
            closeSidebar.addEventListener('click', () => {
                chatSidebar.classList.remove('show');
                sidebarOverlay.classList.remove('show');
            });
        }

        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', () => {
                chatSidebar.classList.remove('show');
                sidebarOverlay.classList.remove('show');
            });
        }

        // Message input
        const messageInput = document.getElementById('messageInput');
        const btnSend = document.getElementById('btnSend');
        const charCount = document.getElementById('charCount');

        if (messageInput) {
            const updateCharCount = (value = '') => {
                if (charCount) {
                    charCount.textContent = value.length;
                }
            };
            const fallbackBaseHeight = messageInput.offsetHeight || 48;
            const measuredBase = messageInput.scrollHeight || messageInput.clientHeight || 0;
            this.messageInputBaseHeight = measuredBase > 0 ? measuredBase : fallbackBaseHeight;
            const resizeMessageInput = () => {
                const baseHeight =
                    this.messageInputBaseHeight ||
                    messageInput.scrollHeight ||
                    messageInput.clientHeight ||
                    fallbackBaseHeight;
                messageInput.style.height = 'auto';
                const nextHeight = Math.max(baseHeight, messageInput.scrollHeight);
                messageInput.style.height = `${nextHeight}px`;
            };

            this.resizeMessageInput = resizeMessageInput;
            updateCharCount(messageInput.value);
            resizeMessageInput();

            messageInput.addEventListener('input', (e) => {
                updateCharCount(e.target.value);
                resizeMessageInput();
            });

            messageInput.addEventListener('keydown', (e) => {
                if (e.isComposing) return;
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        if (btnSend) {
            btnSend.addEventListener('click', () => {
                this.sendMessage();
            });
        }

        // Header actions
        const btnTogglePurchase = document.getElementById('btnTogglePurchase');
        const btnManageTags = document.getElementById('btnManageTags');
        const btnToggleAI = document.getElementById('btnToggleAI');
        const btnRefreshProfile = document.getElementById('btnRefreshProfile');
        const btnClearChat = document.getElementById('btnClearChat');
        const btnToggleOrders = document.getElementById('btnToggleOrders');
        const orderSidebarOverlay = document.getElementById('orderSidebarOverlay');

        if (btnTogglePurchase) {
            btnTogglePurchase.addEventListener('click', () => {
                this.togglePurchaseStatus();
            });
        }

        if (btnManageTags) {
            btnManageTags.addEventListener('click', () => {
                this.openTagModal();
            });
        }

        // User Notes button
        const btnUserNotes = document.getElementById('btnUserNotes');
        if (btnUserNotes) {
            btnUserNotes.addEventListener('click', () => {
                this.openUserNotesModal();
            });
        }

        // Save User Notes button
        const saveUserNotesBtn = document.getElementById('saveUserNotesBtn');
        if (saveUserNotesBtn) {
            saveUserNotesBtn.addEventListener('click', () => {
                this.saveUserNotes();
            });
        }

        if (btnToggleAI) {
            btnToggleAI.addEventListener('click', () => {
                this.toggleAI();
            });
        }

        if (btnRefreshProfile) {
            btnRefreshProfile.addEventListener('click', () => {
                this.refreshCurrentUserProfile();
            });
        }

        if (btnClearChat) {
            btnClearChat.addEventListener('click', () => {
                this.clearChat();
            });
        }

        if (btnToggleOrders) {
            btnToggleOrders.addEventListener('click', () => {
                this.toggleOrderSidebarMobile(true);
            });
        }

        if (orderSidebarOverlay) {
            orderSidebarOverlay.addEventListener('click', () => {
                this.toggleOrderSidebarMobile(false);
            });
        }

        // Order sidebar collapse button
        const btnCollapseOrderSidebar = document.getElementById('btnCollapseOrderSidebar');
        if (btnCollapseOrderSidebar) {
            btnCollapseOrderSidebar.addEventListener('click', () => {
                this.toggleOrderSidebarCollapse();
            });
            // Restore collapsed state from localStorage
            const isCollapsed = localStorage.getItem('orderSidebarCollapsed') === 'true';
            if (isCollapsed) {
                const orderSidebar = document.getElementById('orderSidebar');
                if (orderSidebar) {
                    orderSidebar.classList.add('collapsed');
                }
            }
        }

        // Template button
        const btnTemplate = document.getElementById('btnTemplate');
        if (btnTemplate) {
            btnTemplate.addEventListener('click', () => {
                this.openTemplateModal();
            });
        }

        // Toggle filter panel accessibility
        const filterToggleBtn = document.getElementById('filterToggle');
        const filterPanel = document.getElementById('filterPanel');
        if (filterToggleBtn && filterPanel) {
            filterToggleBtn.setAttribute('aria-expanded', 'false');
            filterPanel.setAttribute('tabindex', '-1');
            filterToggleBtn.addEventListener('click', () => {
                const isShown = filterPanel.classList.toggle('show');
                filterPanel.style.display = isShown ? 'block' : 'none';
                filterToggleBtn.setAttribute('aria-expanded', isShown ? 'true' : 'false');
                if (isShown) {
                    filterPanel.focus({ preventScroll: true });
                }
            });
            // Close filter panel when pressing Esc
            filterPanel.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    filterPanel.classList.remove('show');
                    filterPanel.style.display = 'none';
                    filterToggleBtn.setAttribute('aria-expanded', 'false');
                    filterToggleBtn.focus();
                }
            });
        }

        // Save order button
        const saveOrderBtn = document.getElementById('saveOrderBtn');
        if (saveOrderBtn) {
            saveOrderBtn.addEventListener('click', () => {
                this.saveOrder();
            });
        }

        // Image modal
        const downloadImage = document.getElementById('downloadImage');
        if (downloadImage) {
            downloadImage.addEventListener('click', () => {
                this.downloadImage();
            });
        }

        // Tag modal
        const addTagBtn = document.getElementById('addTagBtn');
        const newTagInput = document.getElementById('newTagInput');

        if (addTagBtn && newTagInput) {
            addTagBtn.addEventListener('click', () => {
                this.addTag(newTagInput.value.trim());
            });

            newTagInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addTag(newTagInput.value.trim());
                }
            });
        }
    }

    // ========================================
    // User Management
    // ========================================

    async loadUsers() {
        try {
            const response = await fetch('/admin/chat/users');
            const data = await response.json();

            if (data.success) {
                this.allUsers = (data.users || []).map(user => {
                    const normalizedUser = { ...user };
                    if (user.lastMessage) {
                        const previewText = this.extractDisplayText({
                            content: user.lastMessage,
                            displayContent: user.lastMessage,
                        });
                        normalizedUser.lastMessage = previewText || user.lastMessage;
                    }
                    return normalizedUser;
                });
                this.applyFilters();

                // Check for URL parameter to auto-select user (e.g., from Orders page)
                this.handleUrlUserParameter();
            } else {
                this.showToast('ไม่สามารถโหลดรายชื่อผู้ใช้ได้', 'error');
            }
        } catch (error) {
            console.error('Error loading users:', error);
            this.showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
        }
    }

    /**
     * Handle URL parameter for auto-selecting a user
     * Used when navigating from Orders page with ?user=xxx
     */
    handleUrlUserParameter() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const targetUserId = urlParams.get('user');

            if (targetUserId) {
                // Check if user exists in our list
                const userExists = this.allUsers.some(u => u.userId === targetUserId);

                if (userExists) {
                    // Auto-select the user
                    this.selectUser(targetUserId);

                    // Clean up URL by removing the parameter (optional, for cleaner URL)
                    const newUrl = window.location.pathname;
                    window.history.replaceState({}, document.title, newUrl);
                } else {
                    // User not found, show a message
                    this.showToast('ไม่พบผู้ใช้ที่ต้องการในรายการ', 'warning');
                }
            }
        } catch (error) {
            console.error('Error handling URL user parameter:', error);
        }
    }

    applyFilters() {
        let filtered = [...this.allUsers];

        // Status filter
        if (this.currentFilters.status !== 'all') {
            filtered = filtered.filter(user => {
                switch (this.currentFilters.status) {
                    case 'unread':
                        return user.unreadCount > 0;
                    case 'followup':
                        return user.followUp && user.followUp.isFollowUp;
                    case 'purchased':
                        return user.hasPurchased;
                    default:
                        return true;
                }
            });
        }

        // Tag filter
        if (this.currentFilters.tags.length > 0) {
            filtered = filtered.filter(user => {
                return user.tags && user.tags.some(tag =>
                    this.currentFilters.tags.includes(tag)
                );
            });
        }

        // Search filter
        if (this.currentFilters.search) {
            const search = this.currentFilters.search.toLowerCase();
            filtered = filtered.filter(user => {
                return (
                    (user.displayName && user.displayName.toLowerCase().includes(search)) ||
                    (user.userId && user.userId.toLowerCase().includes(search))
                );
            });
        }

        this.users = filtered;
        this.renderUserList();
        this.updateFilterBadge();
    }

    renderUserList() {
        const userList = document.getElementById('userList');
        const userCountBadge = document.getElementById('userCountBadge');
        const filteredCount = document.getElementById('filteredCount');

        if (!userList) return;

        // Update counts
        if (userCountBadge) {
            userCountBadge.textContent = this.users.length;
        }
        if (filteredCount) {
            filteredCount.textContent = this.users.length;
        }

        // Render users
        if (this.users.length === 0) {
            userList.innerHTML = `
                <div class="empty-state" style="padding: 2rem;">
                    <i class="fas fa-inbox" style="font-size: 3rem; color: var(--text-tertiary); margin-bottom: 1rem;"></i>
                    <p style="color: var(--text-secondary);">ไม่พบผู้ใช้</p>
                </div>
            `;
            return;
        }

        userList.innerHTML = this.users.map(user => this.renderUserItem(user)).join('');
    }

    renderUserItem(user) {
        const isActive = user.userId === this.currentUserId;
        const hasUnread = user.unreadCount > 0;
        const isPurchased = user.hasPurchased;
        const isFollowUp = user.followUp && user.followUp.isFollowUp;
        const aiEnabled = user.aiEnabled !== false;
        const hasOrders = user.hasOrders || false;

        const avatarLetter = user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U';
        const lastMessage = user.lastMessage ? this.truncateText(user.lastMessage, 50) : 'ไม่มีข้อความ';
        const time = user.lastMessageTime ? this.formatRelativeTime(user.lastMessageTime) : '';

        // Build status indicators
        const statusDots = [];
        statusDots.push(`
            <div class="status-dot ${aiEnabled ? 'ai-active' : 'ai-disabled'}" 
                 title="${aiEnabled ? 'AI เปิดใช้งาน' : 'AI ปิดใช้งาน'}">
                <span class="status-tooltip">${aiEnabled ? 'AI เปิด' : 'AI ปิด'}</span>
            </div>
        `);
        if (isFollowUp) {
            statusDots.push(`
                <div class="status-dot followup" title="ต้องติดตาม">
                    <span class="status-tooltip">ติดตาม</span>
                </div>
            `);
        }
        if (isPurchased) {
            statusDots.push(`
                <div class="status-dot purchased" title="ซื้อสินค้าแล้ว">
                    <span class="status-tooltip">ซื้อแล้ว</span>
                </div>
            `);
        }
        if (hasOrders) {
            statusDots.push(`
                <div class="status-dot has-orders" title="มีออเดอร์">
                    <span class="status-tooltip">มีออเดอร์</span>
                </div>
            `);
        }

        // Build avatar HTML with profile picture or fallback letter
        let avatarContent;
        if (user.pictureUrl) {
            avatarContent = `
                <img src="${this.escapeHtml(user.pictureUrl)}" 
                     alt="${this.escapeHtml(user.displayName || 'User')}"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <span class="avatar-fallback" style="display: none;">${avatarLetter}</span>
            `;
        } else {
            avatarContent = `<span class="avatar-fallback">${avatarLetter}</span>`;
        }

        const tags = user.tags && user.tags.length > 0
            ? user.tags.slice(0, 2).map(tag =>
                `<span class="tag-badge">${this.escapeHtml(tag)}</span>`
            ).join('')
            : '';

        return `
            <div class="user-item ${isActive ? 'active' : ''} ${hasUnread ? 'unread' : ''}" 
                 onclick="chatManager.selectUser('${user.userId}')">
                <div class="user-avatar">
                    ${avatarContent}
                    <div class="user-status-indicators">
                        ${statusDots.slice(0, 2).join('')}
                    </div>
                </div>
                <div class="user-item-content">
                    <div class="user-item-header">
                        <div class="user-name">${this.escapeHtml(user.displayName || user.userId)}</div>
                        <div class="user-time">${time}</div>
                    </div>
                    <div class="user-last-message">${this.escapeHtml(lastMessage)}</div>
                    ${tags ? `<div class="user-tags">${tags}</div>` : ''}
                </div>
                ${hasUnread ? `<div class="unread-count">${user.unreadCount}</div>` : ''}
            </div>
        `;
    }


    async selectUser(userId) {
        this.currentUserId = userId;

        // Close sidebar on mobile
        const chatSidebar = document.getElementById('chatSidebar');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        if (chatSidebar) chatSidebar.classList.remove('show');
        if (sidebarOverlay) sidebarOverlay.classList.remove('show');
        this.toggleOrderSidebarMobile(false);

        // Update UI
        this.renderUserList();
        this.updateChatHeader();
        this.showMessageInput();
        this.hideTypingIndicator();

        // Load chat history
        await this.loadChatHistory(userId);

        // Load orders
        await this.loadOrders();

        // Mark as read
        this.markAsRead(userId);
    }

    updateChatHeader() {
        const btnRefreshProfile = document.getElementById('btnRefreshProfile');
        const user = this.users.find(u => u.userId === this.currentUserId);
        if (!user) {
            if (btnRefreshProfile) {
                btnRefreshProfile.disabled = true;
                btnRefreshProfile.title = 'เลือกผู้ใช้เพื่ออัปเดตข้อมูล';
                btnRefreshProfile.classList.add('disabled');
            }
            return;
        }

        const chatAvatar = document.getElementById('chatAvatar');
        const chatUserName = document.getElementById('chatUserName');
        const chatUserMeta = document.getElementById('chatUserMeta');
        const chatHeaderActions = document.getElementById('chatHeaderActions');
        const messageCount = document.getElementById('messageCount');

        const avatarLetter = user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U';

        if (chatAvatar) {
            // Use profile picture if available, fallback to letter
            if (user.pictureUrl) {
                chatAvatar.innerHTML = `
                    <img src="${this.escapeHtml(user.pictureUrl)}" 
                         alt="${this.escapeHtml(user.displayName || 'User')}"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <span class="avatar-fallback" style="display: none;">${avatarLetter}</span>
                `;
            } else {
                chatAvatar.innerHTML = `<span class="avatar-fallback">${avatarLetter}</span>`;
            }
            chatAvatar.className = 'chat-avatar';
        }


        if (chatUserName) {
            chatUserName.textContent = user.displayName || user.userId;
        }

        if (chatUserMeta) {
            const messages = this.chatHistory[this.currentUserId] || [];
            if (messageCount) {
                messageCount.textContent = messages.length;
            }
        }

        if (chatHeaderActions) {
            chatHeaderActions.style.display = 'flex';
        }

        if (btnRefreshProfile) {
            const isFacebook = user.platform === 'facebook';
            btnRefreshProfile.disabled = !isFacebook;
            btnRefreshProfile.title = isFacebook
                ? 'อัปเดตข้อมูลผู้ใช้'
                : 'ใช้กับผู้ใช้ Facebook เท่านั้น';
            btnRefreshProfile.classList.toggle('disabled', !isFacebook);
        }
    }

    showMessageInput() {
        const messageInputArea = document.getElementById('messageInputArea');
        const emptyState = document.getElementById('emptyState');

        if (messageInputArea) {
            messageInputArea.style.display = 'block';
        }
        if (typeof this.resizeMessageInput === 'function') {
            this.resizeMessageInput();
        }

        if (emptyState) {
            emptyState.style.display = 'none';
        }
    }

    // ========================================
    // Chat History
    // ========================================

    async loadChatHistory(userId) {
        try {
            const response = await fetch(`/admin/chat/history/${userId}`);
            const data = await response.json();

            if (data.success) {
                this.chatHistory[userId] = (data.messages || []).map(msg => {
                    const normalized = { ...msg };
                    const sanitizedText = this.extractDisplayText(normalized);
                    if (sanitizedText) {
                        normalized.content = sanitizedText;
                        if (!normalized.displayContent || typeof normalized.displayContent !== 'string') {
                            normalized.displayContent = sanitizedText;
                        }
                    }
                    this.resolveMessageId(normalized);
                    return normalized;
                });
                this.renderMessages();
            } else {
                this.showToast('ไม่สามารถโหลดประวัติการสนทนาได้', 'error');
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
            this.showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
        }
    }

    renderMessages() {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;

        const messages = this.chatHistory[this.currentUserId] || [];

        // Clear typing indicator when rerendering actual messages
        this.hideTypingIndicator();

        if (messages.length === 0) {
            messagesContainer.innerHTML = `
                <div class="app-empty">
                    <div class="app-empty__icon">
                        <i class="fas fa-comments"></i>
                    </div>
                    <div class="app-empty__title">ยังไม่มีข้อความ</div>
                    <div class="app-empty__desc">เริ่มต้นการสนทนาด้วยการส่งข้อความแรก</div>
                </div>
            `;
            return;
        }

        let lastDateLabel = '';
        const blocks = [];
        messages.forEach(msg => {
            const dateLabel = msg.timestamp ? this.formatDateLabel(msg.timestamp) : '';
            if (dateLabel && dateLabel !== lastDateLabel) {
                blocks.push(`<div class="message-separator">${dateLabel}</div>`);
                lastDateLabel = dateLabel;
            }
            blocks.push(this.renderMessage(msg));
        });

        messagesContainer.innerHTML = blocks.join('');

        // Scroll to bottom
        this.scrollToBottom();
    }

    renderMessage(message) {
        const role = message.role || 'user';
        const displayText = this.extractDisplayText(message);
        const hasImages = Array.isArray(message.images) && message.images.length > 0;
        const textForRender = displayText || (hasImages ? '[ไฟล์แนบ]' : '');
        const content = this.escapeHtml(textForRender);
        const time = message.timestamp ? this.formatTime(message.timestamp) : '';
        const messageId = this.resolveMessageId(message);
        const isSending = message.sending;
        const deliveryStatus = message.deliveryStatus || '';

        const roleLabels = {
            user: 'ผู้ใช้',
            admin: 'แอดมิน',
            assistant: 'AI'
        };

        const roleLabel = roleLabels[role] || role;

        let imagesHtml = '';
        if (message.images && message.images.length > 0) {
            imagesHtml = `
                <div class="message-images">
                    ${message.images.map(img => `
                        <div class="message-image" onclick="chatManager.showImageModal('${img}')">
                            <img src="${img}" alt="รูปภาพ" loading="lazy">
                        </div>
                    `).join('')}
                </div>
            `;
        }


        // Determine if time should be on left or right
        // User messages: time on left, Admin/AI messages: time on right
        const isOutgoing = role === 'admin' || role === 'assistant';
        const roleIcon = role === 'user' ? 'user' : role === 'admin' ? 'user-shield' : 'robot';

        // Status indicator (sending, delivery status)
        let statusHtml = '';
        if (isSending) {
            statusHtml = '<span class="msg-status sending"><i class="fas fa-spinner fa-spin"></i></span>';
        } else if (deliveryStatus && isOutgoing) {
            statusHtml = `<span class="msg-status ${deliveryStatus}" title="${this.renderDeliveryStatus(deliveryStatus)}">
                <i class="fas fa-${deliveryStatus === 'read' ? 'check-double' : 'check'}"></i>
            </span>`;
        }

        return `
            <div class="message ${role}" data-msg-id="${messageId}">
                ${!isOutgoing ? `<span class="msg-time msg-time-left">${time}</span>` : ''}
                <div class="message-bubble">
                    <div class="msg-role-indicator" title="${roleLabel}">
                        <i class="fas fa-${roleIcon}"></i>
                    </div>
                    <div class="message-content">${content}</div>
                    ${imagesHtml}
                </div>
                ${isOutgoing ? `<span class="msg-time msg-time-right">${time}${statusHtml}</span>` : ''}
            </div>
        `;
    }

    renderDeliveryStatus(status) {
        const map = {
            sent: 'ส่งแล้ว',
            delivered: 'ส่งถึงผู้ใช้',
            read: 'ผู้ใช้เห็นข้อความแล้ว',
        };
        return map[status] || status;
    }

    showTypingIndicator(platformLabel = '') {
        const container = document.getElementById('messagesContainer');
        if (!container) return;

        let indicator = document.getElementById('typingIndicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'typingIndicator';
            indicator.className = 'message assistant';
            indicator.innerHTML = `
                <div class="message-bubble">
                    <div class="msg-role-indicator" title="AI กำลังพิมพ์">
                        <i class="fas fa-robot"></i>
                    </div>
                    <div class="message-content">
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                    </div>
                </div>
                <span class="msg-time msg-time-right">กำลังพิมพ์...</span>
            `;
            container.appendChild(indicator);
        }

        indicator.style.display = 'block';

        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            this.hideTypingIndicator();
        }, 3000);

        this.scrollToBottom();
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    updateMessageStatus(messageId, status) {
        if (!messageId || !status) return;
        const messages = this.chatHistory[this.currentUserId] || [];
        const target = messages.find(m => this.resolveMessageId(m) === messageId);
        if (target) {
            target.deliveryStatus = status;
            this.renderMessages();
        }
    }

    resolveMessageId(message) {
        if (!message || typeof message !== 'object') {
            return '';
        }
        if (typeof message.messageId === 'string' && message.messageId) {
            return message.messageId;
        }
        const rawId = message._id;
        let resolved = '';
        if (typeof rawId === 'string' && rawId) {
            resolved = rawId;
        } else if (rawId && typeof rawId.toHexString === 'function') {
            resolved = rawId.toHexString();
        } else if (rawId && typeof rawId.toString === 'function') {
            resolved = rawId.toString();
        } else if (rawId && rawId.$oid) {
            resolved = rawId.$oid;
        }
        if (resolved) {
            message.messageId = resolved;
        }
        return resolved || '';
    }

    findMessageById(messageId) {
        if (!messageId || !this.currentUserId) {
            return null;
        }
        const messages = this.chatHistory[this.currentUserId] || [];
        return messages.find(msg => this.resolveMessageId(msg) === messageId) || null;
    }



    scrollToBottom() {
        const messagesWrapper = document.getElementById('messagesWrapper');
        if (messagesWrapper) {
            setTimeout(() => {
                messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
            }, 100);
        }
    }

    toggleOrderSidebarMobile(show = true) {
        const orderSidebar = document.getElementById('orderSidebar');
        const orderSidebarOverlay = document.getElementById('orderSidebarOverlay');
        if (!orderSidebar) return;

        if (show) {
            orderSidebar.classList.add('show');
            if (orderSidebarOverlay) {
                orderSidebarOverlay.classList.add('show');
            }
        } else {
            orderSidebar.classList.remove('show');
            if (orderSidebarOverlay) {
                orderSidebarOverlay.classList.remove('show');
            }
        }
    }

    toggleOrderSidebarCollapse() {
        const orderSidebar = document.getElementById('orderSidebar');
        if (!orderSidebar) return;

        const isCollapsed = orderSidebar.classList.toggle('collapsed');
        localStorage.setItem('orderSidebarCollapsed', isCollapsed);
    }


    // ========================================
    // Send Message
    // ========================================

    async sendMessage() {
        const messageInput = document.getElementById('messageInput');
        if (!messageInput || !this.currentUserId) return;

        const rawMessage = messageInput.value;
        if (!rawMessage.trim()) return;
        const message = rawMessage.replace(/\r\n/g, '\n');

        // Optimistic UI: append temp message
        const tempMessage = {
            role: 'admin',
            content: message,
            timestamp: new Date().toISOString(),
            sending: true
        };
        if (!this.chatHistory[this.currentUserId]) {
            this.chatHistory[this.currentUserId] = [];
        }
        this.chatHistory[this.currentUserId].push(tempMessage);
        this.renderMessages();
        this.scrollToBottom();

        // Clear input immediately
        messageInput.value = '';
        if (typeof this.resizeMessageInput === 'function') {
            this.resizeMessageInput();
        } else {
            messageInput.style.height = 'auto';
        }
        const charCountEl = document.getElementById('charCount');
        if (charCountEl) {
            charCountEl.textContent = '0';
        }

        try {
            const response = await fetch('/admin/chat/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: this.currentUserId,
                    message: message
                })
            });

            const data = await response.json();

            if (data.success && data.message) {
                // Replace last temp message
                const history = this.chatHistory[this.currentUserId] || [];
                const idx = history.lastIndexOf(tempMessage);
                if (idx >= 0) {
                    history[idx] = data.message;
                } else {
                    history.push(data.message);
                }
                this.renderMessages();
                this.loadUsers();
            } else {
                throw new Error(data.error || 'ไม่สามารถส่งข้อความได้');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.showToast('เกิดข้อผิดพลาดในการส่งข้อความ', 'error');
            // rollback temp message
            const history = this.chatHistory[this.currentUserId] || [];
            const idx = history.indexOf(tempMessage);
            if (idx >= 0) {
                history.splice(idx, 1);
                this.renderMessages();
            }
        }
    }

    // ========================================
    // Actions
    // ========================================

    async togglePurchaseStatus() {
        if (!this.currentUserId) return;

        const user = this.users.find(u => u.userId === this.currentUserId);
        if (!user) return;

        const newStatus = !user.hasPurchased;

        try {
            const response = await fetch(`/admin/chat/purchase-status/${this.currentUserId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    hasPurchased: newStatus
                })
            });

            const data = await response.json();

            if (data.success) {
                user.hasPurchased = newStatus;
                this.renderUserList();
                this.updateChatHeader();
                this.showToast(newStatus ? 'ทำเครื่องหมายว่าซื้อแล้ว' : 'ยกเลิกเครื่องหมายซื้อแล้ว', 'success');
            } else {
                this.showToast('ไม่สามารถอัปเดตสถานะได้', 'error');
            }
        } catch (error) {
            console.error('Error toggling purchase status:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        }
    }

    async refreshCurrentUserProfile() {
        if (!this.currentUserId) {
            this.showToast('กรุณาเลือกผู้ใช้ก่อน', 'warning');
            return;
        }

        const user =
            this.users.find(u => u.userId === this.currentUserId) ||
            this.allUsers.find(u => u.userId === this.currentUserId);

        if (!user) {
            this.showToast('ไม่พบข้อมูลผู้ใช้ในรายการ', 'error');
            return;
        }

        if (user.platform !== 'facebook') {
            this.showToast('ปุ่มนี้ใช้ได้เฉพาะกับผู้ใช้ Facebook', 'info');
            return;
        }

        const btnRefreshProfile = document.getElementById('btnRefreshProfile');
        let originalHtml = null;
        if (btnRefreshProfile) {
            originalHtml = btnRefreshProfile.innerHTML;
            btnRefreshProfile.disabled = true;
            btnRefreshProfile.innerHTML =
                '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
        }

        try {
            const response = await fetch(
                `/admin/chat/users/${encodeURIComponent(this.currentUserId)}/refresh-profile`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        platform: user.platform,
                        botId: user.botId || null,
                    }),
                },
            );

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'ไม่สามารถอัปเดตข้อมูลได้');
            }

            const newDisplayName = data.displayName || '';
            if (newDisplayName) {
                this.updateUserDisplayName(this.currentUserId, newDisplayName);
                this.showToast('อัปเดตชื่อผู้ใช้เรียบร้อย', 'success');
            } else {
                this.showToast('ไม่มีข้อมูลใหม่จาก Facebook', 'info');
            }

            await this.loadUsers();
            this.updateChatHeader();
        } catch (error) {
            console.error('Error refreshing profile:', error);
            this.showToast(error.message || 'เกิดข้อผิดพลาดในการอัปเดต', 'error');
        } finally {
            if (btnRefreshProfile) {
                btnRefreshProfile.disabled = false;
                btnRefreshProfile.innerHTML =
                    originalHtml || '<i class="fas fa-sync"></i>';
            }
        }
    }

    updateUserDisplayName(userId, displayName) {
        if (!userId || !displayName) {
            return;
        }

        const applyUpdate = (list) => {
            if (!Array.isArray(list)) return;
            const target = list.find((u) => u.userId === userId);
            if (target) {
                target.displayName = displayName;
            }
        };

        applyUpdate(this.allUsers);
        applyUpdate(this.users);

        if (this.currentUserId === userId) {
            const chatUserName = document.getElementById('chatUserName');
            if (chatUserName) {
                chatUserName.textContent = displayName;
            }
        }
    }

    async toggleAI() {
        if (!this.currentUserId) return;

        const user = this.users.find(u => u.userId === this.currentUserId);
        if (!user) return;

        const currentStatus = user.aiEnabled !== false;
        const newStatus = !currentStatus;

        try {
            const response = await fetch('/admin/chat/user-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: this.currentUserId,
                    aiEnabled: newStatus
                })
            });

            const data = await response.json();

            if (data.success) {
                user.aiEnabled = newStatus;
                this.renderUserList();
                this.updateChatHeader();
                this.showToast(newStatus ? 'เปิด AI แล้ว' : 'ปิด AI แล้ว', 'success');
            } else {
                this.showToast('ไม่สามารถอัปเดตสถานะ AI ได้', 'error');
            }
        } catch (error) {
            console.error('Error toggling AI:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        }
    }

    async clearChat() {
        if (!this.currentUserId) return;

        if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการล้างประวัติการสนทนาทั้งหมด?')) {
            return;
        }

        try {
            const response = await fetch(`/admin/chat/clear/${this.currentUserId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                this.clearChatDisplay();
                this.showToast('ล้างประวัติการสนทนาแล้ว', 'success');
            } else {
                this.showToast('ไม่สามารถล้างประวัติได้', 'error');
            }
        } catch (error) {
            console.error('Error clearing chat:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        }
    }

    clearChatDisplay() {
        this.chatHistory[this.currentUserId] = [];
        this.renderMessages();
    }

    // ========================================
    // Tag Management
    // ========================================

    async loadAvailableTags() {
        try {
            const response = await fetch('/admin/chat/available-tags');
            const data = await response.json();

            if (data.success) {
                // API returns array of {tag, count} objects
                this.availableTags = data.tags ? data.tags.map(t => t.tag || t) : [];
                this.renderTagFilters();
            }
        } catch (error) {
            console.error('Error loading tags:', error);
        }
    }

    renderTagFilters() {
        const tagFilters = document.getElementById('tagFilters');
        if (!tagFilters) return;

        if (this.availableTags.length === 0) {
            tagFilters.innerHTML = '<span class="no-tags">ไม่มีแท็ก</span>';
            return;
        }

        tagFilters.innerHTML = this.availableTags.slice(0, 10).map(tag => `
            <button class="tag-filter-btn" onclick="chatManager.toggleTagFilter('${this.escapeHtml(tag)}')">
                ${this.escapeHtml(tag)}
            </button>
        `).join('');
    }

    toggleTagFilter(tag) {
        const index = this.currentFilters.tags.indexOf(tag);
        if (index > -1) {
            this.currentFilters.tags.splice(index, 1);
        } else {
            this.currentFilters.tags.push(tag);
        }

        this.applyFilters();
        this.renderTagFilters();

        // Update active state
        document.querySelectorAll('.tag-filter-btn').forEach(btn => {
            if (btn.textContent.trim() === tag) {
                btn.classList.toggle('active', this.currentFilters.tags.includes(tag));
            }
        });
    }

    openTagModal() {
        if (!this.currentUserId) return;

        const user = this.users.find(u => u.userId === this.currentUserId);
        if (!user) return;

        const modal = new bootstrap.Modal(document.getElementById('tagModal'));
        const tagModalUserName = document.getElementById('tagModalUserName');
        const currentTags = document.getElementById('currentTags');
        const popularTags = document.getElementById('popularTags');
        const newTagInput = document.getElementById('newTagInput');

        if (tagModalUserName) {
            tagModalUserName.textContent = user.displayName || user.userId;
        }

        if (currentTags) {
            if (user.tags && user.tags.length > 0) {
                currentTags.innerHTML = user.tags.map(tag => `
                    <span class="tag-item">
                        ${this.escapeHtml(tag)}
                        <button class="btn-remove-tag" onclick="chatManager.removeTag('${this.escapeHtml(tag)}')">
                            <i class="fas fa-times"></i>
                        </button>
                    </span>
                `).join('');
            } else {
                currentTags.innerHTML = '<span class="text-muted">ไม่มีแท็ก</span>';
            }
        }

        if (popularTags) {
            if (this.availableTags.length > 0) {
                popularTags.innerHTML = this.availableTags.slice(0, 10).map(tag => `
                    <span class="tag-item" style="cursor: pointer;" onclick="chatManager.addTag('${this.escapeHtml(tag)}')">
                        ${this.escapeHtml(tag)}
                    </span>
                `).join('');
            } else {
                popularTags.innerHTML = '<span class="text-muted">ไม่มีแท็ก</span>';
            }
        }

        if (newTagInput) {
            newTagInput.value = '';
        }

        modal.show();
    }

    async addTag(tag) {
        if (!tag || !this.currentUserId) return;

        const user = this.users.find(u => u.userId === this.currentUserId);
        if (!user) return;

        const tags = user.tags || [];
        if (tags.includes(tag)) {
            this.showToast('แท็กนี้มีอยู่แล้ว', 'warning');
            return;
        }

        tags.push(tag);

        try {
            const response = await fetch(`/admin/chat/tags/${this.currentUserId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    tags: tags
                })
            });

            const data = await response.json();

            if (data.success) {
                user.tags = tags;
                this.loadAvailableTags();
                this.openTagModal();
                this.showToast('เพิ่มแท็กแล้ว', 'success');
            } else {
                this.showToast('ไม่สามารถเพิ่มแท็กได้', 'error');
            }
        } catch (error) {
            console.error('Error adding tag:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        }
    }

    // ========================================
    // User Notes
    // ========================================

    async openUserNotesModal() {
        if (!this.currentUserId) {
            this.showToast('กรุณาเลือกผู้ใช้ก่อน', 'warning');
            return;
        }

        const user = this.users.find(u => u.userId === this.currentUserId);
        const notesModalUserName = document.getElementById('notesModalUserName');
        const userNotesTextarea = document.getElementById('userNotesTextarea');
        const notesLastUpdated = document.getElementById('notesLastUpdated');
        const notesUpdatedTime = document.getElementById('notesUpdatedTime');

        if (notesModalUserName) {
            notesModalUserName.textContent = user?.displayName || this.currentUserId;
        }

        if (userNotesTextarea) {
            userNotesTextarea.value = '';
        }

        if (notesLastUpdated) {
            notesLastUpdated.style.display = 'none';
        }

        // Load existing notes
        try {
            const response = await fetch(`/api/users/${this.currentUserId}/notes`);
            const data = await response.json();

            if (data.success && userNotesTextarea) {
                userNotesTextarea.value = data.notes || '';

                if (data.updatedAt && notesLastUpdated && notesUpdatedTime) {
                    notesUpdatedTime.textContent = this.formatRelativeTime(data.updatedAt);
                    notesLastUpdated.style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Error loading user notes:', error);
        }

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('userNotesModal'));
        modal.show();
    }

    async saveUserNotes() {
        if (!this.currentUserId) return;

        const userNotesTextarea = document.getElementById('userNotesTextarea');
        const notes = userNotesTextarea?.value || '';

        const saveBtn = document.getElementById('saveUserNotesBtn');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>กำลังบันทึก...';
        }

        try {
            const response = await fetch(`/api/users/${this.currentUserId}/notes`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ notes })
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('บันทึกโน้ตแล้ว', 'success');

                // Update last updated time
                const notesLastUpdated = document.getElementById('notesLastUpdated');
                const notesUpdatedTime = document.getElementById('notesUpdatedTime');
                if (notesLastUpdated && notesUpdatedTime) {
                    notesUpdatedTime.textContent = 'เมื่อสักครู่';
                    notesLastUpdated.style.display = 'block';
                }
            } else {
                this.showToast('ไม่สามารถบันทึกโน้ตได้', 'error');
            }
        } catch (error) {
            console.error('Error saving user notes:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>บันทึก';
            }
        }
    }

    async removeTag(tag) {
        if (!this.currentUserId) return;

        const user = this.users.find(u => u.userId === this.currentUserId);
        if (!user) return;

        const tags = (user.tags || []).filter(t => t !== tag);

        try {
            const response = await fetch(`/admin/chat/tags/${this.currentUserId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    tags: tags
                })
            });

            const data = await response.json();

            if (data.success) {
                user.tags = tags;
                this.loadAvailableTags();
                this.openTagModal();
                this.showToast('ลบแท็กแล้ว', 'success');
            } else {
                this.showToast('ไม่สามารถลบแท็กได้', 'error');
            }
        } catch (error) {
            console.error('Error removing tag:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        }
    }

    // ========================================
    // Template Modal
    // ========================================

    openTemplateModal() {
        this.showToast('ฟีเจอร์ Template กำลังพัฒนา', 'info');
    }

    // ========================================
    // Image Modal
    // ========================================

    showImageModal(imageUrl) {
        const modal = new bootstrap.Modal(document.getElementById('imageModal'));
        const modalImage = document.getElementById('modalImage');

        if (modalImage) {
            modalImage.src = imageUrl;
        }

        modal.show();
    }

    downloadImage() {
        const modalImage = document.getElementById('modalImage');
        if (!modalImage || !modalImage.src) return;

        const link = document.createElement('a');
        link.href = modalImage.src;
        link.download = 'image.jpg';
        link.click();
    }

    // ========================================
    // Socket.IO Handlers
    // ========================================

    handleNewMessage(data) {
        const { userId, message } = data;
        const normalizedMessage = {
            ...message,
        };
        const sanitizedText = this.extractDisplayText(normalizedMessage);
        if (sanitizedText) {
            normalizedMessage.content = sanitizedText;
            if (!normalizedMessage.displayContent || typeof normalizedMessage.displayContent !== 'string') {
                normalizedMessage.displayContent = sanitizedText;
            }
        }
        this.resolveMessageId(normalizedMessage);
        if (!Object.prototype.hasOwnProperty.call(normalizedMessage, 'feedback')) {
            normalizedMessage.feedback = null;
        }

        // Add to chat history
        if (!this.chatHistory[userId]) {
            this.chatHistory[userId] = [];
        }
        this.chatHistory[userId].push(normalizedMessage);

        // Update UI if this is the current chat
        if (userId === this.currentUserId) {
            this.renderMessages();
        }

        // Update user list
        this.loadUsers();
    }

    handleFollowUpTagged(data) {
        const user = this.allUsers.find(u => u.userId === data.userId);
        if (user) {
            user.followUp = data.followUp;
            this.applyFilters();
        }
    }

    async markAsRead(userId) {
        try {
            await fetch(`/admin/chat/mark-read/${userId}`, {
                method: 'POST'
            });
        } catch (error) {
            console.error('Error marking as read:', error);
        }
    }

    // ========================================
    // Filters
    // ========================================

    clearFilters() {
        this.currentFilters = {
            status: 'all',
            tags: [],
            search: ''
        };

        // Reset UI
        document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === 'all');
        });

        const userSearch = document.getElementById('userSearch');
        if (userSearch) {
            userSearch.value = '';
        }

        this.renderTagFilters();
        this.applyFilters();
    }

    updateFilterBadge() {
        const filterBadge = document.getElementById('filterBadge');
        if (!filterBadge) return;

        let count = 0;
        if (this.currentFilters.status !== 'all') count++;
        count += this.currentFilters.tags.length;
        if (this.currentFilters.search) count++;

        if (count > 0) {
            filterBadge.textContent = count;
            filterBadge.style.display = 'block';
        } else {
            filterBadge.style.display = 'none';
        }
    }

    // ========================================
    // Auto Refresh
    // ========================================

    setupAutoRefresh() {
        // Refresh user list every 30 seconds
        setInterval(() => {
            if (!document.hidden) {
                this.loadUsers();
            }
        }, 30000);
    }

    // ========================================
    // Utility Functions
    // ========================================

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    extractDisplayText(message) {
        if (!message) return '';

        if (typeof message.displayContent === 'string' && message.displayContent.trim()) {
            const textFromHtml = this.stripHtmlToText(message.displayContent);
            if (textFromHtml) {
                return textFromHtml;
            }
        }

        const rawContent = message?.content;
        if (typeof rawContent === 'string') {
            const trimmed = rawContent.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    const extracted = this.extractPlainTextFromStructured(parsed);
                    if (extracted) return extracted;
                } catch (_) {
                    // ignore parse errors and fall back to raw string
                }
            }
            return rawContent;
        }

        if (Array.isArray(rawContent) || (rawContent && typeof rawContent === 'object')) {
            const extracted = this.extractPlainTextFromStructured(rawContent);
            if (extracted) return extracted;
        }

        return '';
    }

    extractPlainTextFromStructured(content) {
        if (!content) return '';

        if (Array.isArray(content)) {
            return content
                .map(item => this.extractPlainTextFromStructured(item))
                .filter(text => typeof text === 'string' && text.trim().length > 0)
                .join('\n');
        }

        if (typeof content === 'object') {
            if (typeof content.text === 'string' && content.text.trim().length > 0) {
                return content.text;
            }
            if (
                typeof content.content === 'string' &&
                content.content.trim().length > 0 &&
                content.type === 'text'
            ) {
                return content.content;
            }
            if (content.data) {
                return this.extractPlainTextFromStructured(content.data);
            }
        }

        if (typeof content === 'string') {
            return content;
        }

        return '';
    }

    stripHtmlToText(html) {
        if (!html) return '';
        const temp = document.createElement('div');
        temp.innerHTML = String(html).replace(/<br\s*\/?>/gi, '\n');
        const text = temp.textContent || temp.innerText || '';
        return text.replace(/\u00a0/g, ' ');
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    formatRelativeTime(timestamp) {
        const now = new Date();
        const time = new Date(timestamp);
        const diff = now - time;

        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return 'เมื่อสักครู่';
        if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
        if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
        if (days < 7) return `${days} วันที่แล้ว`;

        return time.toLocaleDateString('th-TH', {
            day: 'numeric',
            month: 'short'
        });
    }

    formatTime(timestamp) {
        const time = new Date(timestamp);
        return time.toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatDateLabel(timestamp) {
        const time = new Date(timestamp);
        const now = new Date();
        const sameYear = time.getFullYear() === now.getFullYear();
        return time.toLocaleDateString('th-TH', {
            day: 'numeric',
            month: 'short',
            year: sameYear ? undefined : 'numeric'
        });
    }

    showToast(message, type = 'info') {
        const typeMap = {
            success: { icon: 'fa-check-circle', className: 'app-toast--success' },
            error: { icon: 'fa-times-circle', className: 'app-toast--danger' },
            warning: { icon: 'fa-exclamation-triangle', className: 'app-toast--warning' },
            info: { icon: 'fa-info-circle', className: 'app-toast--info' }
        };
        const toastType = typeMap[type] ? type : 'info';
        const { icon, className } = typeMap[toastType];

        let container = document.querySelector('.app-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'app-toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `app-toast ${className}`;
        toast.innerHTML = `
            <div class="app-toast__icon"><i class="fas ${icon}"></i></div>
            <div class="app-toast__body">
                <div class="app-toast__title">${this.escapeHtml(message || '')}</div>
            </div>
            <button class="app-toast__close" aria-label="ปิดการแจ้งเตือน">&times;</button>
        `;

        const removeToast = () => {
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 200);
        };

        toast.querySelector('.app-toast__close').addEventListener('click', removeToast);

        container.appendChild(toast);

        setTimeout(removeToast, 3200);
    }

    // ========================================
    // Order Management
    // ========================================

    async loadOrders() {
        if (!this.currentUserId) return;

        try {
            const response = await fetch(`/admin/chat/orders/${this.currentUserId}`);
            const data = await response.json();

            if (data.success) {
                this.currentOrders = data.orders || [];
                this.renderOrders();
            } else {
                console.error('Failed to load orders:', data.error);
                this.currentOrders = [];
                this.renderOrders();
            }
        } catch (error) {
            console.error('Error loading orders:', error);
            this.currentOrders = [];
            this.renderOrders();
        }
    }

    renderOrders() {
        const orderContent = document.getElementById('orderContent');
        const orderCountBadge = document.getElementById('orderCountBadge');

        if (!orderContent) return;

        // Update count badge
        if (orderCountBadge) {
            orderCountBadge.textContent = this.currentOrders.length;
        }

        // Render orders
        if (this.currentOrders.length === 0) {
            orderContent.innerHTML = `
                <div class="order-empty-state" id="orderEmptyState">
                    <div class="order-empty-icon">
                        <i class="fas fa-shopping-bag"></i>
                    </div>
                    <h6 class="order-empty-title">ไม่มีออเดอร์</h6>
                    <p class="order-empty-description">
                        เลือกผู้ใช้เพื่อดูออเดอร์ หรือใช้ปุ่มสกัดออเดอร์เพื่อวิเคราะห์บทสนทนา
                    </p>
                </div>
            `;
            return;
        }

        orderContent.innerHTML = this.currentOrders.map(order => this.renderOrderCard(order)).join('');
    }

    renderOrderCard(order) {
        const statusLabels = {
            pending: 'รอดำเนินการ',
            confirmed: 'ยืนยันแล้ว',
            shipped: 'จัดส่งแล้ว',
            completed: 'เสร็จสิ้น',
            cancelled: 'ยกเลิก'
        };

        const statusLabel = statusLabels[order.status] || order.status;
        const extractedDate = new Date(order.extractedAt).toLocaleDateString('th-TH', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });

        const orderData = order.orderData || {};
        const items = orderData.items || [];
        const totalAmount = orderData.totalAmount || 0;
        let shippingCost = 0;
        if (typeof orderData.shippingCost === 'number' && isFinite(orderData.shippingCost)) {
            shippingCost = Math.max(0, orderData.shippingCost);
        } else if (typeof orderData.shippingCost === 'string') {
            const parsed = parseFloat(orderData.shippingCost);
            if (!isNaN(parsed) && parsed >= 0) {
                shippingCost = parsed;
            }
        }
        const shippingLabel = shippingCost > 0 ? `฿${this.formatNumber(shippingCost)}` : 'ส่งฟรี';
        const shippingAmountClass = shippingCost > 0 ? '' : 'free';

        const itemsHtml = items.map(item => `
            <div class="order-item">
                <span class="order-item-name">${this.escapeHtml(item.product)}</span>
                <span class="order-item-quantity">x${item.quantity}</span>
                <span class="order-item-price">฿${this.formatNumber(item.price)}</span>
            </div>
        `).join('');

        let metaHtml = '';
        // Build full address from address parts
        const addressParts = [];
        if (orderData.shippingAddress) addressParts.push(orderData.shippingAddress);
        if (orderData.addressSubDistrict) addressParts.push(orderData.addressSubDistrict);
        if (orderData.addressDistrict) addressParts.push(orderData.addressDistrict);
        if (orderData.addressProvince) addressParts.push(orderData.addressProvince);
        if (orderData.addressPostalCode) addressParts.push(orderData.addressPostalCode);
        const fullAddress = addressParts.join(' ');

        if (orderData.customerName || fullAddress || orderData.phone || orderData.paymentMethod) {
            metaHtml = '<div class="order-meta">';

            if (orderData.customerName) {
                metaHtml += `
                    <div class="order-meta-item">
                        <i class="fas fa-user"></i>
                        <span class="order-meta-label">ชื่อลูกค้า:</span>
                        <span>${this.escapeHtml(orderData.customerName)}</span>
                    </div>
                `;
            }

            if (fullAddress) {
                metaHtml += `
                    <div class="order-meta-item">
                        <i class="fas fa-map-marker-alt"></i>
                        <span class="order-meta-label">ที่อยู่:</span>
                        <span>${this.escapeHtml(fullAddress)}</span>
                    </div>
                `;
            }

            if (orderData.phone) {
                metaHtml += `
                    <div class="order-meta-item">
                        <i class="fas fa-phone"></i>
                        <span class="order-meta-label">เบอร์:</span>
                        <span>${this.escapeHtml(orderData.phone)}</span>
                    </div>
                `;
            }

            if (orderData.paymentMethod) {
                metaHtml += `
                    <div class="order-meta-item">
                        <i class="fas fa-credit-card"></i>
                        <span class="order-meta-label">ชำระเงิน:</span>
                        <span>${this.escapeHtml(orderData.paymentMethod)}</span>
                    </div>
                `;
            }

            metaHtml += '</div>';
        }

        return `
            <div class="order-card" data-order-id="${order._id}">
                <div class="order-card-header">
                    <span class="order-status-badge ${order.status}">${statusLabel}</span>
                    <span class="order-date">${extractedDate}</span>
                </div>
                
                <div class="order-items">
                    ${itemsHtml}
                </div>

                <div class="order-total order-shipping">
                    <span class="order-total-label">ค่าส่ง:</span>
                    <span class="order-total-amount ${shippingAmountClass}">${shippingLabel}</span>
                </div>
                
                <div class="order-total">
                    <span class="order-total-label">ยอดรวม:</span>
                    <span class="order-total-amount">฿${this.formatNumber(totalAmount)}</span>
                </div>
                
                ${metaHtml}
                
                <div class="order-actions">
                    <button class="btn-order-action" onclick="chatManager.editOrder('${order._id}')">
                        <i class="fas fa-edit"></i> แก้ไข
                    </button>
                    <button class="btn-order-action btn-delete" onclick="chatManager.deleteOrder('${order._id}')">
                        <i class="fas fa-trash"></i> ลบ
                    </button>
                </div>
            </div>
        `;
    }

    async extractOrder() {
        if (!this.currentUserId) {
            this.showToast('กรุณาเลือกผู้ใช้ก่อน', 'warning');
            return;
        }

        if (this.isExtractingOrder) {
            this.showToast('กำลังสกัดออเดอร์อยู่...', 'info');
            return;
        }

        this.isExtractingOrder = true;
        this.showToast('กำลังวิเคราะห์บทสนทนา...', 'info');

        try {
            const response = await fetch('/admin/chat/orders/extract', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: this.currentUserId
                })
            });

            const data = await response.json();

            if (data.success) {
                if (data.hasOrder) {
                    this.showToast('สกัดออเดอร์สำเร็จ!', 'success');
                    await this.loadOrders();
                    await this.loadUsers(); // Update badge
                } else {
                    this.showToast(data.reason || 'ไม่พบออเดอร์ในบทสนทนา', 'warning');
                }
            } else {
                this.showToast('ไม่สามารถสกัดออเดอร์ได้: ' + (data.error || 'เกิดข้อผิดพลาด'), 'error');
            }
        } catch (error) {
            console.error('Error extracting order:', error);
            this.showToast('เกิดข้อผิดพลาดในการสกัดออเดอร์', 'error');
        } finally {
            this.isExtractingOrder = false;
        }
    }

    editOrder(orderId) {
        const order = this.currentOrders.find(o => o._id === orderId);
        if (!order) return;

        // Populate modal with order data
        document.getElementById('editOrderId').value = orderId;
        document.getElementById('editOrderStatus').value = order.status || 'pending';
        document.getElementById('editOrderNotes').value = order.notes || '';

        const orderData = order.orderData || {};
        document.getElementById('editShippingAddress').value = orderData.shippingAddress || '';
        document.getElementById('editPhone').value = orderData.phone || '';
        document.getElementById('editPaymentMethod').value = orderData.paymentMethod || 'เก็บเงินปลายทาง';

        // Populate address fields
        const addressSubDistrictInput = document.getElementById('editAddressSubDistrict');
        if (addressSubDistrictInput) {
            addressSubDistrictInput.value = orderData.addressSubDistrict || '';
        }
        const addressDistrictInput = document.getElementById('editAddressDistrict');
        if (addressDistrictInput) {
            addressDistrictInput.value = orderData.addressDistrict || '';
        }
        const addressProvinceInput = document.getElementById('editAddressProvince');
        if (addressProvinceInput) {
            addressProvinceInput.value = orderData.addressProvince || '';
        }
        const addressPostalCodeInput = document.getElementById('editAddressPostalCode');
        if (addressPostalCodeInput) {
            addressPostalCodeInput.value = orderData.addressPostalCode || '';
        }

        const customerNameInput = document.getElementById('editCustomerName');
        if (customerNameInput) {
            customerNameInput.value = orderData.customerName || '';
        }
        const shippingCostInput = document.getElementById('editShippingCost');
        if (shippingCostInput) {
            let shippingCost = 0;
            if (typeof orderData.shippingCost === 'number' && isFinite(orderData.shippingCost)) {
                shippingCost = Math.max(0, orderData.shippingCost);
            } else if (typeof orderData.shippingCost === 'string') {
                const parsed = parseFloat(orderData.shippingCost);
                if (!isNaN(parsed) && parsed >= 0) {
                    shippingCost = parsed;
                }
            }
            shippingCostInput.value = shippingCost;
        }

        // Render order items
        const editOrderItems = document.getElementById('editOrderItems');
        if (editOrderItems && orderData.items) {
            editOrderItems.innerHTML = orderData.items.map((item, index) => `
                <div class="order-item-edit" data-index="${index}">
                    <input type="text" placeholder="สินค้า" value="${this.escapeHtml(item.product)}" data-field="product">
                    <input type="number" placeholder="จำนวน" value="${item.quantity}" data-field="quantity" style="width: 80px;">
                    <input type="number" placeholder="ราคา" value="${item.price}" data-field="price" style="width: 100px;">
                    <button type="button" onclick="chatManager.removeOrderItem(${index})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('') + `
                <button type="button" class="btn-add-item" onclick="chatManager.addOrderItem()">
                    <i class="fas fa-plus"></i> เพิ่มสินค้า
                </button>
            `;
        }

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('orderEditModal'));
        modal.show();
    }

    async deleteOrder(orderId) {
        if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบออเดอร์นี้?')) {
            return;
        }

        try {
            const response = await fetch(`/admin/chat/orders/${orderId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('ลบออเดอร์สำเร็จ', 'success');
                await this.loadOrders();
                await this.loadUsers(); // Update badge
            } else {
                this.showToast('ไม่สามารถลบออเดอร์ได้: ' + (data.error || 'เกิดข้อผิดพลาด'), 'error');
            }
        } catch (error) {
            console.error('Error deleting order:', error);
            this.showToast('เกิดข้อผิดพลาดในการลบออเดอร์', 'error');
        }
    }

    removeOrderItem(index) {
        const editOrderItems = document.getElementById('editOrderItems');
        if (!editOrderItems) return;

        const itemElements = editOrderItems.querySelectorAll('.order-item-edit');
        if (itemElements[index]) {
            itemElements[index].remove();
        }
    }

    addOrderItem() {
        const editOrderItems = document.getElementById('editOrderItems');
        if (!editOrderItems) return;

        const addButton = editOrderItems.querySelector('.btn-add-item');
        const newIndex = editOrderItems.querySelectorAll('.order-item-edit').length;

        const newItem = document.createElement('div');
        newItem.className = 'order-item-edit';
        newItem.dataset.index = newIndex;
        newItem.innerHTML = `
            <input type="text" placeholder="สินค้า" value="" data-field="product">
            <input type="number" placeholder="จำนวน" value="1" data-field="quantity" style="width: 80px;">
            <input type="number" placeholder="ราคา" value="0" data-field="price" style="width: 100px;">
            <button type="button" onclick="chatManager.removeOrderItem(${newIndex})">
                <i class="fas fa-times"></i>
            </button>
        `;

        if (addButton) {
            addButton.before(newItem);
        } else {
            editOrderItems.appendChild(newItem);
        }
    }

    async saveOrder() {
        const orderId = document.getElementById('editOrderId').value;
        if (!orderId) return;

        // Collect order items
        const editOrderItems = document.getElementById('editOrderItems');
        const itemElements = editOrderItems.querySelectorAll('.order-item-edit');
        const items = [];

        itemElements.forEach((element) => {
            const product = element.querySelector('[data-field="product"]').value.trim();
            const quantity = parseInt(element.querySelector('[data-field="quantity"]').value) || 0;
            const price = parseFloat(element.querySelector('[data-field="price"]').value) || 0;

            if (product && quantity > 0) {
                items.push({ product, quantity, price });
            }
        });

        if (items.length === 0) {
            this.showToast('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ', 'warning');
            return;
        }

        const shippingCostInput = document.getElementById('editShippingCost');
        let shippingCost = 0;
        if (shippingCostInput) {
            const parsed = parseFloat(shippingCostInput.value);
            if (!isNaN(parsed) && parsed >= 0) {
                shippingCost = parsed;
            }
        }

        // Calculate total (รวมค่าส่ง)
        const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.price), 0) + shippingCost;

        // Collect other data
        const orderData = {
            items,
            totalAmount,
            shippingAddress: document.getElementById('editShippingAddress').value.trim() || null,
            addressSubDistrict: (() => {
                const input = document.getElementById('editAddressSubDistrict');
                if (!input) return null;
                const value = input.value.trim();
                return value || null;
            })(),
            addressDistrict: (() => {
                const input = document.getElementById('editAddressDistrict');
                if (!input) return null;
                const value = input.value.trim();
                return value || null;
            })(),
            addressProvince: (() => {
                const input = document.getElementById('editAddressProvince');
                if (!input) return null;
                const value = input.value.trim();
                return value || null;
            })(),
            addressPostalCode: (() => {
                const input = document.getElementById('editAddressPostalCode');
                if (!input) return null;
                const value = input.value.trim();
                return value || null;
            })(),
            phone: document.getElementById('editPhone').value.trim() || null,
            paymentMethod: document.getElementById('editPaymentMethod').value || null,
            shippingCost,
            customerName: (() => {
                const input = document.getElementById('editCustomerName');
                if (!input) return null;
                const value = input.value.trim();
                return value || null;
            })()
        };

        const status = document.getElementById('editOrderStatus').value;
        const notes = document.getElementById('editOrderNotes').value.trim();

        try {
            const response = await fetch(`/admin/chat/orders/${orderId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    orderData,
                    status,
                    notes
                })
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('บันทึกออเดอร์สำเร็จ', 'success');
                await this.loadOrders();

                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('orderEditModal'));
                if (modal) modal.hide();
                this.toggleOrderSidebarMobile(false);
            } else {
                this.showToast('ไม่สามารถบันทึกออเดอร์ได้: ' + (data.error || 'เกิดข้อผิดพลาด'), 'error');
            }
        } catch (error) {
            console.error('Error saving order:', error);
            this.showToast('เกิดข้อผิดพลาดในการบันทึกออเดอร์', 'error');
        }
    }

    formatNumber(num) {
        return new Intl.NumberFormat('th-TH', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(num);
    }
}
