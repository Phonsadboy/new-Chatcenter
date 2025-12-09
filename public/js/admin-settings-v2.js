/**
 * Admin Settings V2 JavaScript
 * Handles all logic for the redesigned settings page.
 */

const INSTRUCTION_SOURCE = { V2: 'v2', LEGACY: 'legacy' };
let instructionLibraries = [];

// Legacy settings notice placeholder (legacy UI ถูกถอดออกแล้ว)
function showLegacySettingsNotice() {
    // no-op
}

document.addEventListener('DOMContentLoaded', function () {
    initNavigation();
    loadAllSettings();
    setupEventListeners();
    showLegacySettingsNotice();
    initSidebarScrollHint();
});

// Provide a global alert helper for modules that expect showAlert
function showAlert(message, type = 'info') {
    showToast(message, type);
}
window.showAlert = showAlert;

// --- Navigation ---
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item-v2');
    const sections = document.querySelectorAll('.settings-section');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = item.getAttribute('href').substring(1);

            // Update Nav
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Update Content
            sections.forEach(section => {
                if (section.id === targetId) {
                    section.classList.remove('d-none');
                } else {
                    section.classList.add('d-none');
                }
            });

            // If switching to specific tabs that need refresh
            if (targetId === 'bot-settings') {
                loadBotSettings();
            } else if (targetId === 'image-collections') {
                if (window.imageCollectionsManager?.refreshAll) {
                    window.imageCollectionsManager.refreshAll();
                }
            }
        });
    });
}

// --- Data Loading ---
async function loadAllSettings() {
    try {
        await loadInstructionLibraries();
        await Promise.all([
            loadBotSettings(),
            loadChatSettings(),
            loadSystemSettings(),
            loadSecuritySettings(),
            window.imageCollectionsManager?.refreshAll?.()
        ]);
    } catch (error) {
        console.error('Error loading settings:', error);
        showToast('เกิดข้อผิดพลาดในการโหลดการตั้งค่า', 'danger');
    }
}

// --- Bot Management ---
let facebookAppsCache = [];

async function loadBotSettings() {
    const lineContainer = document.getElementById('line-bots-list');
    const fbContainer = document.getElementById('facebook-apps-list');

    if (lineContainer) lineContainer.innerHTML = '<div class="text-center p-3 text-muted-v2">กำลังโหลด Line Bots...</div>';
    if (fbContainer) fbContainer.innerHTML = '<div class="text-center p-3 text-muted-v2">กำลังโหลด Facebook Apps & Pages...</div>';

    try {
        if (instructionLibraries.length === 0) {
            await loadInstructionLibraries();
        }

        const [lineRes, fbBotsRes, fbAppsRes] = await Promise.all([
            fetch('/api/line-bots'),
            fetch('/api/facebook-bots'),
            fetch('/api/facebook-apps')
        ]);

        const lineBots = await lineRes.json();
        const fbBots = await fbBotsRes.json();
        const fbApps = await fbAppsRes.json();

        facebookAppsCache = fbApps; // Cache for dropdowns

        renderLineBots(lineBots);
        renderFacebookAppsAndPages(fbApps, fbBots);
    } catch (error) {
        console.error('Error loading bots:', error);
        if (lineContainer) lineContainer.innerHTML = '<div class="text-danger p-3">โหลดข้อมูลไม่สำเร็จ</div>';
        if (fbContainer) fbContainer.innerHTML = '<div class="text-danger p-3">โหลดข้อมูลไม่สำเร็จ</div>';
    }
}

function renderLineBots(bots) {
    const container = document.getElementById('line-bots-list');
    if (!container) return;

    if (bots.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-muted-v2">ยังไม่มีการตั้งค่า Line Bot</div>';
        return;
    }

    container.innerHTML = bots.map(bot => `
        <div class="bot-item-compact">
            <div class="bot-channel line"><i class="fab fa-line"></i></div>
            <div class="bot-main">
                <div class="bot-header">
                    <div class="bot-title">
                        <span class="bot-name">${escapeHtml(bot.name)}</span>
                        ${bot.isDefault ? '<span class="badge badge-default">ค่าเริ่มต้น</span>' : ''}
                    </div>
                </div>
                <div class="bot-subtext">
                    Model: ${escapeHtml(bot.aiModel || 'gpt-5')}
                    • API: ${bot.aiConfig?.apiMode === 'chat' ? 'Chat' : 'Responses'}
                    • อัปเดต: ${formatBotUpdatedAt(bot.updatedAt)}
                </div>
                ${buildBotInlineControls(bot, 'line')}
            </div>
            <div class="bot-actions-compact">
                <label class="toggle-switch mb-0">
                    <input type="checkbox" ${bot.status === 'active' ? 'checked' : ''} onchange="toggleBotStatus('line', '${bot._id}', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
                <div class="actions-stack">
                    <button class="btn-ghost-sm" title="แก้ไข" onclick="openEditLineBotModal('${bot._id}')"><i class="fas fa-edit"></i></button>
                </div>
            </div>
        </div>
    `).join('');
}

// Render Facebook Apps with nested Pages
function renderFacebookAppsAndPages(apps, bots) {
    const container = document.getElementById('facebook-apps-list');
    if (!container) return;

    // Group bots by their facebookAppId
    const botsByApp = {};
    const unlinkedBots = [];

    bots.forEach(bot => {
        const appId = bot.facebookAppId?.toString() || bot.facebookApp?._id?.toString();
        if (appId) {
            if (!botsByApp[appId]) botsByApp[appId] = [];
            botsByApp[appId].push(bot);
        } else {
            unlinkedBots.push(bot);
        }
    });

    if (apps.length === 0 && unlinkedBots.length === 0) {
        container.innerHTML = `
            <div class="text-center p-4 text-muted-v2">
                <i class="fab fa-facebook fa-2x mb-2 opacity-50"></i>
                <p class="mb-2">ยังไม่มี Facebook App</p>
                <small>สร้าง App ก่อน แล้วเพิ่ม Pages ที่ต้องการเชื่อมต่อ</small>
            </div>
        `;
        return;
    }

    let html = '';

    // Render each app with its pages
    apps.forEach(app => {
        const appPages = botsByApp[app._id.toString()] || [];
        html += `
            <div class="fb-app-card mb-3">
                <div class="fb-app-header" onclick="toggleAppPages('${app._id}')">
                    <div class="fb-app-info">
                        <div class="fb-app-icon"><i class="fas fa-mobile-alt"></i></div>
                        <div class="fb-app-details">
                            <div class="fb-app-name">
                                ${escapeHtml(app.name)}
                                <span class="badge bg-secondary ms-2" style="font-size: 0.7em;">${appPages.length} Page${appPages.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div class="fb-app-meta text-muted small">
                                App ID: ${escapeHtml(app.appId || 'N/A')}
                            </div>
                        </div>
                    </div>
                    <div class="fb-app-actions">
                        <button class="btn-ghost-sm" title="คัดลอก Webhook URL" onclick="event.stopPropagation(); copyText('${escapeHtml(app.webhookUrl || '')}', 'Webhook URL')">
                            <i class="fas fa-link"></i>
                        </button>
                        <button class="btn-ghost-sm" title="แก้ไข App" onclick="event.stopPropagation(); openEditFacebookAppModal('${app._id}')">
                            <i class="fas fa-cog"></i>
                        </button>
                        <i class="fas fa-chevron-down fb-app-toggle" id="toggle-icon-${app._id}"></i>
                    </div>
                </div>
                <div class="fb-app-pages" id="pages-${app._id}" style="display: none;">
                    <div class="fb-pages-toolbar">
                        <small class="text-muted">Pages เชื่อมต่อกับ App นี้</small>
                        <button class="btn btn-sm btn-outline-primary" onclick="openAddFacebookBotModalForApp('${app._id}')">
                            <i class="fas fa-plus me-1"></i>เพิ่ม Page
                        </button>
                    </div>
                    ${appPages.length === 0 ?
                '<div class="text-center text-muted small py-3">ยังไม่มี Page เชื่อมต่อ</div>' :
                appPages.map(bot => renderFacebookBotItem(bot)).join('')
            }
                </div>
            </div>
        `;
    });

    // Render unlinked bots (legacy bots without app)
    if (unlinkedBots.length > 0) {
        html += `
            <div class="fb-app-card mb-3 border-warning">
                <div class="fb-app-header" onclick="toggleAppPages('unlinked')">
                    <div class="fb-app-info">
                        <div class="fb-app-icon text-warning"><i class="fas fa-exclamation-triangle"></i></div>
                        <div class="fb-app-details">
                            <div class="fb-app-name">Pages ที่ยังไม่เชื่อมกับ App</div>
                            <div class="fb-app-meta text-muted small">กรุณาเลือก App สำหรับ Pages เหล่านี้</div>
                        </div>
                    </div>
                    <div class="fb-app-actions">
                        <i class="fas fa-chevron-down fb-app-toggle" id="toggle-icon-unlinked"></i>
                    </div>
                </div>
                <div class="fb-app-pages" id="pages-unlinked" style="display: none;">
                    ${unlinkedBots.map(bot => renderFacebookBotItem(bot)).join('')}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

function renderFacebookBotItem(bot) {
    return `
        <div class="bot-item-compact">
            <div class="bot-channel facebook"><i class="fab fa-facebook-f"></i></div>
            <div class="bot-main">
                <div class="bot-header">
                    <div class="bot-title">
                        <span class="bot-name">${escapeHtml(bot.name)}</span>
                        ${bot.isDefault ? '<span class="badge badge-default">ค่าเริ่มต้น</span>' : ''}
                    </div>
                </div>
                <div class="bot-subtext">
                    Model: ${escapeHtml(bot.aiModel || 'gpt-5')}
                    • Page ID: ${escapeHtml(bot.pageId || 'N/A')}
                </div>
            </div>
            <div class="bot-actions-compact">
                <label class="toggle-switch mb-0">
                    <input type="checkbox" ${bot.status === 'active' ? 'checked' : ''} onchange="toggleBotStatus('facebook', '${bot._id}', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
                <div class="actions-stack">
                    <button class="btn-ghost-sm" title="แก้ไข" onclick="openEditFacebookBotModal('${bot._id}')"><i class="fas fa-edit"></i></button>
                </div>
            </div>
        </div>
    `;
}

function toggleAppPages(appId) {
    const pagesEl = document.getElementById(`pages-${appId}`);
    const toggleIcon = document.getElementById(`toggle-icon-${appId}`);
    if (pagesEl) {
        const isHidden = pagesEl.style.display === 'none';
        pagesEl.style.display = isHidden ? 'block' : 'none';
        if (toggleIcon) {
            toggleIcon.classList.toggle('fa-chevron-down', !isHidden);
            toggleIcon.classList.toggle('fa-chevron-up', isHidden);
        }
    }
}

function copyText(text, label) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(`คัดลอก ${label} แล้ว`, 'success');
    }).catch(() => {
        showToast(`ไม่สามารถคัดลอก ${label} ได้`, 'danger');
    });
}

// Keep legacy function for backward compatibility
function renderFacebookBots(bots) {
    renderFacebookAppsAndPages(facebookAppsCache || [], bots);
}

async function toggleBotStatus(type, id, isActive) {
    const endpoint = type === 'line' ? `/api/line-bots/${id}` : `/api/facebook-bots/${id}`;

    try {
        const getRes = await fetch(endpoint);
        const botData = await getRes.json();

        botData.status = isActive ? 'active' : 'inactive';
        delete botData._id;

        const updateRes = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(botData)
        });

        if (updateRes.ok) {
            showToast(`${type === 'line' ? 'Line' : 'Facebook'} Bot ${isActive ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว'}`, 'success');
            loadBotSettings();
        } else {
            throw new Error('Update failed');
        }
    } catch (error) {
        console.error('Error toggling bot status:', error);
        showToast('ไม่สามารถอัปเดตสถานะบอทได้', 'danger');
        loadBotSettings();
    }
}

// --- Modal Logic for Bots ---

// Helper to populate API key dropdowns in bot modals
async function populateApiKeyDropdowns(selectId, selectedValue = '') {
    const select = document.getElementById(selectId);
    if (!select) return;

    // Clear existing options except first (default)
    select.innerHTML = '<option value="">ใช้ Key หลัก (Default)</option>';

    try {
        // Use cached API keys if available, otherwise fetch
        let keys = apiKeysCache;
        if (!keys || keys.length === 0) {
            const response = await fetch('/api/openai-keys');
            if (response.ok) {
                const data = await response.json();
                keys = Array.isArray(data.keys) ? data.keys : [];
                apiKeysCache = keys;
            }
        }

        // Add active keys as options
        keys.filter(k => k.isActive).forEach(key => {
            const option = document.createElement('option');
            option.value = key.id;
            option.textContent = key.name + (key.isDefault ? ' (หลัก)' : '');
            if (selectedValue === key.id) option.selected = true;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('[API Keys] Error loading keys for dropdown:', error);
    }
}

// Line Bot
window.openAddLineBotModal = async function () {
    const form = document.getElementById('lineBotForm');
    if (form) form.reset();
    const idInput = document.getElementById('lineBotId');
    if (idInput) idInput.value = '';
    setAiConfigUI('line', defaultAiConfig);
    const collapseEl = document.getElementById('lineBotAiParams');
    if (collapseEl && collapseEl.classList.contains('show')) {
        const collapseInstance = bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false });
        collapseInstance.hide();
    }

    // Populate API key dropdown
    await populateApiKeyDropdowns('lineBotApiKeyId');

    // Hide delete button for new bot
    const deleteBtn = document.getElementById('deleteLineBotBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';

    // Update modal title
    const title = document.getElementById('addLineBotModalLabel');
    if (title) title.innerHTML = '<i class="fab fa-line me-2"></i>เพิ่ม Line Bot ใหม่';

    const modalEl = document.getElementById('addLineBotModal');
    if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    } else {
        console.error('Modal element #addLineBotModal not found');
    }
};

window.openEditLineBotModal = async function (id) {
    try {
        const res = await fetch(`/api/line-bots/${id}`);
        const bot = await res.json();

        document.getElementById('lineBotId').value = bot._id;
        document.getElementById('lineBotName').value = bot.name;
        document.getElementById('lineBotDescription').value = bot.description || '';
        document.getElementById('lineChannelAccessToken').value = bot.channelAccessToken; // Corrected ID
        document.getElementById('lineChannelSecret').value = bot.channelSecret; // Corrected ID
        document.getElementById('lineWebhookUrl').value = bot.webhookUrl || '';

        // Handle checkboxes/selects if they exist in the partial
        const statusSelect = document.getElementById('lineBotStatus');
        if (statusSelect) statusSelect.value = bot.status;

        const aiModelSelect = document.getElementById('lineBotAiModel'); // Corrected ID (case sensitive check)
        if (aiModelSelect) aiModelSelect.value = bot.aiModel;

        const defaultCheck = document.getElementById('lineBotDefault'); // Corrected ID
        if (defaultCheck) defaultCheck.checked = bot.isDefault;

        setAiConfigUI('line', bot.aiConfig || defaultAiConfig);

        // Populate API key dropdown and set selected value
        await populateApiKeyDropdowns('lineBotApiKeyId', bot.openaiApiKeyId || '');

        // Update modal title for edit mode
        const title = document.getElementById('addLineBotModalLabel');
        if (title) title.innerHTML = '<i class="fab fa-line me-2"></i>แก้ไข Line Bot';

        // Show delete button for existing bot
        const deleteBtn = document.getElementById('deleteLineBotBtn');
        if (deleteBtn) deleteBtn.style.display = 'inline-block';

        const modalEl = document.getElementById('addLineBotModal');
        if (modalEl) {
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }
    } catch (error) {
        console.error('Error fetching bot details:', error);
        showToast('ไม่สามารถโหลดข้อมูลบอทได้', 'danger');
    }
};

async function saveLineBot() {
    const form = document.getElementById('lineBotForm');
    const formData = new FormData(form); // Use FormData to get values if preferred, or manual getElementById
    const botId = document.getElementById('lineBotId').value;

    // Manual collection to match IDs in partial
    const botData = {
        name: document.getElementById('lineBotName').value,
        description: document.getElementById('lineBotDescription').value,
        channelAccessToken: document.getElementById('lineChannelAccessToken').value,
        channelSecret: document.getElementById('lineChannelSecret').value,
        webhookUrl: document.getElementById('lineWebhookUrl').value,
        status: document.getElementById('lineBotStatus').value,
        aiModel: document.getElementById('lineBotAiModel').value,
        isDefault: document.getElementById('lineBotDefault').checked,
        aiConfig: readAiConfigFromUI('line'),
        openaiApiKeyId: document.getElementById('lineBotApiKeyId')?.value || ''
    };

    const url = botId ? `/api/line-bots/${botId}` : '/api/line-bots';
    const method = botId ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(botData)
        });

        if (res.ok) {
            showToast('บันทึกข้อมูล Line Bot เรียบร้อยแล้ว', 'success');
            const modalEl = document.getElementById('addLineBotModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();
            loadBotSettings();
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        console.error('Error saving bot:', error);
        showToast('บันทึกข้อมูลไม่สำเร็จ', 'danger');
    }
}

// Facebook Bot (Page)
window.openAddFacebookBotModal = async function (preselectedAppId = null) {
    const form = document.getElementById('facebookBotForm');
    if (form) form.reset();

    const idInput = document.getElementById('facebookBotId');
    if (idInput) idInput.value = '';

    const deleteBtn = document.getElementById('deleteFacebookBotBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';

    const verifiedToggle = document.getElementById('fbVerifiedToggle');
    if (verifiedToggle) verifiedToggle.checked = false;
    setAiConfigUI('facebook', defaultAiConfig);
    const fbCollapseEl = document.getElementById('facebookBotAiParams');
    if (fbCollapseEl && fbCollapseEl.classList.contains('show')) {
        const collapseInstance = bootstrap.Collapse.getOrCreateInstance(fbCollapseEl, { toggle: false });
        collapseInstance.hide();
    }

    // Populate API key dropdown
    await populateApiKeyDropdowns('facebookBotApiKeyId');

    // Populate Facebook App dropdown
    await populateFacebookAppDropdown('facebookBotAppId', preselectedAppId || '');

    const title = document.getElementById('addFacebookBotModalLabel');
    if (title) title.innerHTML = '<i class="fab fa-facebook me-2"></i>เพิ่ม Facebook Page ใหม่';

    const modalEl = document.getElementById('addFacebookBotModal');
    if (!modalEl) return;
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
};

window.openEditFacebookBotModal = async function (id) {
    // Check if Facebook App modal is currently open and hide it first
    const appModalEl = document.getElementById('addFacebookAppModal');
    let wasAppModalOpen = false;
    let appIdToReturnTo = null;

    if (appModalEl && appModalEl.classList.contains('show')) {
        wasAppModalOpen = true;
        // Get the current app ID so we can return to it later
        appIdToReturnTo = document.getElementById('facebookAppId')?.value || null;

        const appModalInstance = bootstrap.Modal.getInstance(appModalEl);
        if (appModalInstance) {
            appModalInstance.hide();
        }
        // Wait for modal to fully close before opening the new one
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Populate API key dropdown first
    await populateApiKeyDropdowns('facebookBotApiKeyId');

    try {
        const res = await fetch(`/api/facebook-bots/${id}`);
        const bot = await res.json();

        document.getElementById('facebookBotId').value = bot._id;
        document.getElementById('facebookBotName').value = bot.name;
        document.getElementById('facebookBotDescription').value = bot.description || '';
        document.getElementById('facebookPageId').value = bot.pageId;
        document.getElementById('facebookAccessToken').value = bot.accessToken;

        // Populate and set Facebook App dropdown
        const appIdValue = bot.facebookAppId?.toString() || bot.facebookApp?._id?.toString() || '';
        await populateFacebookAppDropdown('facebookBotAppId', appIdValue);

        const aiModelSelect = document.getElementById('facebookBotAiModel');
        if (aiModelSelect) aiModelSelect.value = bot.aiModel;

        const defaultCheck = document.getElementById('facebookBotDefault');
        if (defaultCheck) defaultCheck.checked = bot.isDefault;

        setAiConfigUI('facebook', bot.aiConfig || defaultAiConfig);

        // Set API key dropdown value
        const apiKeySelect = document.getElementById('facebookBotApiKeyId');
        if (apiKeySelect) apiKeySelect.value = bot.openaiApiKeyId || '';

        // Set Dataset ID for Conversions API
        const datasetIdInput = document.getElementById('facebookDatasetId');
        if (datasetIdInput) datasetIdInput.value = bot.datasetId || '';

        const title = document.getElementById('addFacebookBotModalLabel');
        if (title) title.innerHTML = '<i class="fab fa-facebook me-2"></i>แก้ไข Facebook Page';

        const deleteBtn = document.getElementById('deleteFacebookBotBtn');
        if (deleteBtn) deleteBtn.style.display = 'inline-block';

        const modalEl = document.getElementById('addFacebookBotModal');
        if (!modalEl) return;

        // Set up event listener to restore App modal when Bot modal closes (if App modal was open)
        if (wasAppModalOpen && appIdToReturnTo) {
            const handleHidden = function () {
                modalEl.removeEventListener('hidden.bs.modal', handleHidden);
                // Small delay to ensure smooth transition
                setTimeout(() => {
                    if (appIdToReturnTo) {
                        window.openEditFacebookAppModal(appIdToReturnTo);
                    }
                }, 150);
            };
            modalEl.addEventListener('hidden.bs.modal', handleHidden, { once: true });
        }

        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    } catch (error) {
        console.error('Error fetching bot details:', error);
        showToast('ไม่สามารถโหลดข้อมูลบอทได้', 'danger');

        // If we hid the App Modal but failed to open Bot Modal, restore App Modal
        if (wasAppModalOpen && appIdToReturnTo) {
            setTimeout(() => {
                window.openEditFacebookAppModal(appIdToReturnTo);
            }, 150);
        }
    }
};

async function saveFacebookBot() {
    const form = document.getElementById('facebookBotForm');
    if (form && !form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const botId = document.getElementById('facebookBotId').value;
    const facebookAppId = document.getElementById('facebookBotAppId')?.value || '';

    if (!facebookAppId) {
        showToast('กรุณาเลือก Facebook App ก่อนบันทึก', 'danger');
        return;
    }

    const botData = {
        name: document.getElementById('facebookBotName').value,
        description: document.getElementById('facebookBotDescription').value,
        pageId: document.getElementById('facebookPageId').value,
        accessToken: document.getElementById('facebookAccessToken').value,
        facebookAppId,
        aiModel: document.getElementById('facebookBotAiModel').value,
        isDefault: document.getElementById('facebookBotDefault').checked,
        aiConfig: readAiConfigFromUI('facebook'),
        openaiApiKeyId: document.getElementById('facebookBotApiKeyId')?.value || '',
        datasetId: document.getElementById('facebookDatasetId')?.value.trim() || ''
    };

    const url = botId ? `/api/facebook-bots/${botId}` : '/api/facebook-bots';
    // Note: Facebook bots usually use POST for both create and update in some implementations, 
    // but standard REST suggests PUT for update. Let's assume standard behavior or check if needed.
    // Based on previous code, it might use specific logic. Let's try standard first.
    // Actually, let's check if the previous code used PUT. Yes, it did.
    const method = botId ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(botData)
        });

        if (res.ok) {
            showToast('บันทึกข้อมูล Facebook Bot เรียบร้อยแล้ว', 'success');
            const modalEl = document.getElementById('addFacebookBotModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();
            loadBotSettings();
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        console.error('Error saving bot:', error);
        showToast('บันทึกข้อมูลไม่สำเร็จ', 'danger');
    }
}

// Test Facebook Token before saving
window.testFacebookToken = async function () {
    const accessToken = document.getElementById('facebookAccessToken').value.trim();
    const pageId = document.getElementById('facebookPageId').value.trim();
    const resultDiv = document.getElementById('tokenTestResult');

    if (!accessToken) {
        showToast('กรุณากรอก Access Token ก่อน', 'warning');
        return;
    }

    // Show loading state
    if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<div class="alert alert-info py-2 mb-0"><i class="fas fa-spinner fa-spin me-2"></i>กำลังทดสอบการเชื่อมต่อ...</div>';
    }

    try {
        const response = await fetch('/api/facebook-bots/test-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken, pageId })
        });

        const data = await response.json();

        if (data.success) {
            if (resultDiv) {
                resultDiv.innerHTML = `
                    <div class="alert alert-success py-2 mb-0">
                        <i class="fas fa-check-circle me-2"></i>
                        <strong>เชื่อมต่อสำเร็จ!</strong> ชื่อเพจ: ${escapeHtml(data.pageName)}
                        ${data.pageId ? `<br><small class="text-muted">Page ID: ${data.pageId}</small>` : ''}
                    </div>
                `;
            }
            showToast(`✅ เชื่อมต่อสำเร็จ! ชื่อเพจ: ${data.pageName}`, 'success');

            // Auto-fill Page ID if empty and we got one from the API
            const pageIdInput = document.getElementById('facebookPageId');
            if (pageIdInput && !pageIdInput.value && data.pageId) {
                pageIdInput.value = data.pageId;
            }
        } else {
            if (resultDiv) {
                resultDiv.innerHTML = `
                    <div class="alert alert-danger py-2 mb-0">
                        <i class="fas fa-times-circle me-2"></i>
                        <strong>ไม่สามารถเชื่อมต่อได้</strong><br>
                        <small>${escapeHtml(data.error)}</small>
                    </div>
                `;
            }
            showToast(`❌ ${data.error}`, 'danger');
        }
    } catch (error) {
        console.error('[Token Test] Error:', error);
        if (resultDiv) {
            resultDiv.innerHTML = `
                <div class="alert alert-danger py-2 mb-0">
                    <i class="fas fa-times-circle me-2"></i>
                    <strong>เกิดข้อผิดพลาด</strong><br>
                    <small>ไม่สามารถทดสอบการเชื่อมต่อได้</small>
                </div>
            `;
        }
        showToast('❌ ไม่สามารถทดสอบการเชื่อมต่อได้', 'danger');
    }
};

// Delete Line Bot
async function deleteLineBot(botId) {
    if (!confirm('ต้องการลบ Line Bot นี้หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้')) {
        return;
    }

    try {
        const res = await fetch(`/api/line-bots/${botId}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            showToast('ลบ Line Bot เรียบร้อยแล้ว', 'success');
            const modalEl = document.getElementById('addLineBotModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            loadBotSettings();
        } else {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'ลบไม่สำเร็จ');
        }
    } catch (error) {
        console.error('Error deleting Line Bot:', error);
        showToast(error.message || 'ไม่สามารถลบ Line Bot ได้', 'danger');
    }
}

// Delete Facebook Bot
async function deleteFacebookBot(botId) {
    if (!confirm('ต้องการลบ Facebook Bot นี้หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้')) {
        return;
    }

    try {
        const res = await fetch(`/api/facebook-bots/${botId}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            showToast('ลบ Facebook Bot เรียบร้อยแล้ว', 'success');
            const modalEl = document.getElementById('addFacebookBotModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            loadBotSettings();
        } else {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'ลบไม่สำเร็จ');
        }
    } catch (error) {
        console.error('Error deleting Facebook Bot:', error);
        showToast(error.message || 'ไม่สามารถลบ Facebook Bot ได้', 'danger');
    }
}

// --- Chat Settings ---
async function loadChatSettings() {
    try {
        const res = await fetch('/api/settings');
        const settings = await res.json();

        setInputValue('chatDelaySeconds', settings.chatDelaySeconds || 0);
        setInputValue('maxQueueMessages', settings.maxQueueMessages || 10);
        setCheckboxValue('enableMessageMerging', settings.enableMessageMerging ?? true);
        setCheckboxValue('showTokenUsage', settings.showTokenUsage ?? false);
        setInputValue('audioAttachmentResponse', settings.audioAttachmentResponse || '');

    } catch (error) {
        console.error('Error loading chat settings:', error);
    }
}

async function saveChatSettings(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    setLoading(btn, true);

    const data = {
        chatDelaySeconds: parseInt(getInputValue('chatDelaySeconds')),
        maxQueueMessages: parseInt(getInputValue('maxQueueMessages')),
        enableMessageMerging: getCheckboxValue('enableMessageMerging'),
        showTokenUsage: getCheckboxValue('showTokenUsage'),
        audioAttachmentResponse: getInputValue('audioAttachmentResponse')
    };

    try {
        const res = await fetch('/api/settings/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            showToast('บันทึกการตั้งค่าแชทเรียบร้อยแล้ว', 'success');
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        showToast('บันทึกไม่สำเร็จ', 'danger');
    } finally {
        setLoading(btn, false);
    }
}

// --- System Settings ---
async function loadSystemSettings() {
    try {
        const res = await fetch('/api/settings');
        const settings = await res.json();

        setCheckboxValue('aiEnabled', settings.aiEnabled ?? true);
        setCheckboxValue('enableChatHistory', settings.enableChatHistory ?? true);
        setInputValue('aiHistoryLimit', settings.aiHistoryLimit ?? 20);
        setCheckboxValue('enableAdminNotifications', settings.enableAdminNotifications ?? true);
        setCheckboxValue('showDebugInfo', settings.showDebugInfo ?? false);
        setInputValue('systemMode', settings.systemMode || 'production');

    } catch (error) {
        console.error('Error loading system settings:', error);
    }
}

async function saveSystemSettings(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    setLoading(btn, true);

    const data = {
        aiEnabled: getCheckboxValue('aiEnabled'),
        enableChatHistory: getCheckboxValue('enableChatHistory'),
        aiHistoryLimit: parseInt(getInputValue('aiHistoryLimit'), 10),
        enableAdminNotifications: getCheckboxValue('enableAdminNotifications'),
        showDebugInfo: getCheckboxValue('showDebugInfo'),
        systemMode: getInputValue('systemMode')
    };

    if (Number.isNaN(data.aiHistoryLimit) || data.aiHistoryLimit < 1 || data.aiHistoryLimit > 100) {
        showToast('จำนวนประวัติแชทต้องอยู่ระหว่าง 1-100 ข้อความ', 'danger');
        setLoading(btn, false);
        return;
    }

    try {
        const res = await fetch('/api/settings/system', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            showToast('บันทึกการตั้งค่าระบบเรียบร้อยแล้ว', 'success');
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        showToast('บันทึกไม่สำเร็จ', 'danger');
    } finally {
        setLoading(btn, false);
    }
}

// --- Security Settings ---
async function loadSecuritySettings() {
    try {
        const res = await fetch('/api/settings');
        const settings = await res.json();

        setCheckboxValue('enableMessageFiltering', settings.enableMessageFiltering ?? false);
        setCheckboxValue('enableStrictFiltering', settings.enableStrictFiltering ?? false);
        setInputValue('hiddenWords', settings.hiddenWords || '');
        setInputValue('replacementText', settings.replacementText || '[Hidden]');

    } catch (error) {
        console.error('Error loading security settings:', error);
    }
}

async function saveSecuritySettings(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    setLoading(btn, true);

    const data = {
        enableMessageFiltering: getCheckboxValue('enableMessageFiltering'),
        enableStrictFiltering: getCheckboxValue('enableStrictFiltering'),
        hiddenWords: getInputValue('hiddenWords'),
        replacementText: getInputValue('replacementText')
    };

    try {
        const res = await fetch('/api/settings/filter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            showToast('บันทึกการตั้งค่าความปลอดภัยเรียบร้อยแล้ว', 'success');
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        showToast('บันทึกไม่สำเร็จ', 'danger');
    } finally {
        setLoading(btn, false);
    }
}

// --- Utilities ---
function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshSettingsBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadInstructionLibraries()
                .then(() => loadBotSettings());
            loadChatSettings();
            loadSystemSettings();
            loadSecuritySettings();
            if (window.imageCollectionsManager?.refreshAll) {
                window.imageCollectionsManager.refreshAll();
            }
        });
    }

    const chatForm = document.getElementById('chatSettingsForm');
    if (chatForm) chatForm.addEventListener('submit', saveChatSettings);

    const systemForm = document.getElementById('systemSettingsForm');
    if (systemForm) systemForm.addEventListener('submit', saveSystemSettings);

    const securityForm = document.getElementById('securitySettingsForm');
    if (securityForm) securityForm.addEventListener('submit', saveSecuritySettings);

    const lineBotForm = document.getElementById('lineBotForm');
    if (lineBotForm) {
        lineBotForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveLineBot();
        });
    }

    const facebookBotForm = document.getElementById('facebookBotForm');
    if (facebookBotForm) {
        facebookBotForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveFacebookBot();
        });
    }

    // Modal Save Buttons
    const saveLineBtn = document.getElementById('saveLineBotBtn');
    if (saveLineBtn) saveLineBtn.addEventListener('click', saveLineBot);

    const saveFbBtn = document.getElementById('saveFacebookBotBtn');
    if (saveFbBtn) saveFbBtn.addEventListener('click', saveFacebookBot);

    // Modal Delete Buttons
    const deleteLineBtn = document.getElementById('deleteLineBotBtn');
    if (deleteLineBtn) {
        deleteLineBtn.addEventListener('click', () => {
            const botId = document.getElementById('lineBotId').value;
            if (botId) deleteLineBot(botId);
        });
    }

    const deleteFbBtn = document.getElementById('deleteFacebookBotBtn');
    if (deleteFbBtn) {
        deleteFbBtn.addEventListener('click', () => {
            const botId = document.getElementById('facebookBotId').value;
            if (botId) deleteFacebookBot(botId);
        });
    }

    document.addEventListener('change', handleInstructionSelectChange, true);

    // Passcode Management
    initPasscodeManagement();

    // AI mode toggle in bot modals
    initAiModeListeners();
}

function getInputValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
}

function getCheckboxValue(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
}

function setCheckboxValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = value;
}

function setLoading(btn, isLoading) {
    if (!btn) return;
    if (isLoading) {
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> กำลังบันทึก...';
        btn.disabled = true;
    } else {
        btn.innerHTML = btn.dataset.originalText || 'บันทึก';
        btn.disabled = false;
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `alert alert-${type} position-fixed top-0 end-0 m-3 shadow-sm`;
    toast.style.zIndex = '9999';
    toast.innerHTML = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// --- AI Config Helpers ---
const defaultAiConfig = {
    apiMode: 'responses',
    reasoningEffort: '',
    temperature: '',
    topP: '',
    presencePenalty: '',
    frequencyPenalty: ''
};

function isReasoningModel(modelId) {
    if (!modelId || typeof modelId !== 'string') return false;
    const id = modelId.toLowerCase();
    // Models that support reasoning_effort:
    // - o1, o1-mini, o1-preview (OpenAI reasoning models)
    // - o3, o3-mini (OpenAI reasoning models)
    // - gpt-5 (future GPT-5 models)
    // GPT-4, GPT-4.1, GPT-4o do NOT support reasoning_effort
    return id.startsWith('o1') || id.startsWith('o3') || id.startsWith('gpt-5');
}

function parseNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function setRangeValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    const valToSet = value === null || value === undefined || value === '' ? el.defaultValue || '' : value;
    el.value = valToSet;
    const label = document.getElementById(`${id}Value`);
    if (label) label.innerText = valToSet === '' ? '—' : valToSet;
}

function attachRangeListener(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
        const label = document.getElementById(`${id}Value`);
        if (label) label.innerText = el.value;
    });
}

function applyAiModeVisibility(prefix, apiMode) {
    const mode = apiMode === 'chat' ? 'chat' : 'responses';
    const responsesSection = document.getElementById(`${prefix}BotResponsesParams`);
    const chatSection = document.getElementById(`${prefix}BotChatParams`);
    if (responsesSection) responsesSection.classList.toggle('d-none', mode !== 'responses');
    if (chatSection) chatSection.classList.toggle('d-none', mode !== 'chat');

    updateReasoningVisibility(prefix);
    updateChatSamplingVisibility(prefix);
}

function setAiConfigUI(prefix, config) {
    const cfg = { ...defaultAiConfig, ...(config || {}) };
    const apiMode = cfg.apiMode === 'chat' ? 'chat' : 'responses';

    setInputValue(`${prefix}BotApiMode`, apiMode);
    setInputValue(`${prefix}BotReasoningEffort`, cfg.reasoningEffort ?? '');
    setRangeValue(`${prefix}BotTemperature`, cfg.temperature);
    setRangeValue(`${prefix}BotTopP`, cfg.topP);
    setRangeValue(`${prefix}BotPresencePenalty`, cfg.presencePenalty);
    setRangeValue(`${prefix}BotFrequencyPenalty`, cfg.frequencyPenalty);

    applyAiModeVisibility(prefix, apiMode);
    updateReasoningVisibility(prefix);
}

function readAiConfigFromUI(prefix) {
    const apiModeSelect = document.getElementById(`${prefix}BotApiMode`);
    const apiMode = apiModeSelect && apiModeSelect.value === 'chat' ? 'chat' : 'responses';
    const modelId = getInputValue(`${prefix}BotAiModel`);
    const reasoningModel = isReasoningModel(modelId);

    const config = {
        apiMode
    };

    if (apiMode === 'responses') {
        config.reasoningEffort = getInputValue(`${prefix}BotReasoningEffort`) || '';
        config.temperature = null;
        config.topP = null;
        config.presencePenalty = null;
        config.frequencyPenalty = null;
    } else {
        config.reasoningEffort = '';
        if (reasoningModel) {
            config.temperature = null;
            config.topP = null;
            config.presencePenalty = null;
            config.frequencyPenalty = null;
        } else {
            config.temperature = parseNumberOrNull(getInputValue(`${prefix}BotTemperature`));
            config.topP = parseNumberOrNull(getInputValue(`${prefix}BotTopP`));
            config.presencePenalty = parseNumberOrNull(getInputValue(`${prefix}BotPresencePenalty`));
            config.frequencyPenalty = parseNumberOrNull(getInputValue(`${prefix}BotFrequencyPenalty`));
        }
    }

    return config;
}

function initAiModeListeners() {
    ['line', 'facebook'].forEach(prefix => {
        const select = document.getElementById(`${prefix}BotApiMode`);
        if (select) {
            select.addEventListener('change', (e) => {
                applyAiModeVisibility(prefix, e.target.value);
            });
        }
        ['Temperature', 'TopP', 'PresencePenalty', 'FrequencyPenalty'].forEach(suffix => {
            attachRangeListener(`${prefix}Bot${suffix}`);
        });
        const modelSelect = document.getElementById(`${prefix}BotAiModel`);
        if (modelSelect) {
            modelSelect.addEventListener('change', () => updateReasoningVisibility(prefix));
            modelSelect.addEventListener('change', () => updateChatSamplingVisibility(prefix));
        }
    });
}

function updateReasoningVisibility(prefix) {
    const modelSelect = document.getElementById(`${prefix}BotAiModel`);
    const modelId = modelSelect ? modelSelect.value : '';
    const supported = isReasoningModel(modelId);
    const group = document.getElementById(`${prefix}BotReasoningGroup`);
    const note = document.getElementById(`${prefix}BotReasoningNote`);
    if (group) group.classList.toggle('d-none', !supported);
    if (note) note.classList.toggle('d-none', supported);
    if (!supported) {
        setInputValue(`${prefix}BotReasoningEffort`, '');
    }
}

function updateChatSamplingVisibility(prefix) {
    const modelSelect = document.getElementById(`${prefix}BotAiModel`);
    const modelId = modelSelect ? modelSelect.value : '';
    const apiModeSelect = document.getElementById(`${prefix}BotApiMode`);
    const apiMode = apiModeSelect && apiModeSelect.value === 'chat' ? 'chat' : 'responses';
    const isReasoning = isReasoningModel(modelId);
    const controls = document.getElementById(`${prefix}BotChatControls`);
    const note = document.getElementById(`${prefix}BotChatNote`);

    const hideSampling = apiMode !== 'chat' || isReasoning;
    if (controls) controls.classList.toggle('d-none', hideSampling);
    if (note) note.classList.toggle('d-none', !isReasoning);

    if (hideSampling) {
        setRangeValue(`${prefix}BotTemperature`, '');
        setRangeValue(`${prefix}BotTopP`, '');
        setRangeValue(`${prefix}BotPresencePenalty`, '');
        setRangeValue(`${prefix}BotFrequencyPenalty`, '');
    }
}



function initSidebarScrollHint() {
    const sidebar = document.querySelector('.settings-sidebar');
    if (!sidebar) return;
    const navItems = sidebar.querySelectorAll('.nav-item-v2');
    const indicator = document.createElement('div');
    indicator.className = 'sidebar-scroll-hint';
    indicator.innerHTML = '<i class="fas fa-arrows-alt-h me-1"></i>ปัดเพื่อดูเมนู';

    const showHint = () => {
        if (sidebar.scrollWidth > sidebar.clientWidth) {
            sidebar.appendChild(indicator);
            requestAnimationFrame(() => indicator.classList.add('show'));
        }
    };

    const hideHint = () => indicator.classList.remove('show');

    sidebar.addEventListener('scroll', hideHint, { passive: true });
    navItems.forEach(item => item.addEventListener('click', hideHint));

    setTimeout(showHint, 500);
}

// --- Shared helpers ---
function formatBotUpdatedAt(value) {
    if (!value) return 'ไม่ระบุ';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'ไม่ระบุ';
    return date.toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// --- Instruction selection helpers ---
async function loadInstructionLibraries() {
    try {
        const response = await fetch('/api/instructions/library');
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result?.error || 'ไม่สามารถโหลดคลัง Instructions ได้');
        }
        instructionLibraries = Array.isArray(result.libraries) ? result.libraries : [];
    } catch (error) {
        console.error('Error loading instruction libraries:', error);
        showToast('โหลดรายชื่อ Instruction ไม่สำเร็จ', 'danger');
        instructionLibraries = [];
    }
}

function getInstructionLibraryKey(lib) {
    if (!lib) return '';
    if (lib.source === INSTRUCTION_SOURCE.V2 && lib.instructionId) {
        return `${INSTRUCTION_SOURCE.V2}:${lib.instructionId}`;
    }
    if (lib.date) {
        return `${INSTRUCTION_SOURCE.LEGACY}:${lib.date}`;
    }
    return `${lib.source || 'library'}:${lib.name || ''}`;
}

function getInstructionLibraryLabel(lib) {
    if (!lib) return '';
    const prefix = lib.source === INSTRUCTION_SOURCE.V2 ? '[Instruction Set]' : '[Legacy]';
    const label = lib.name || lib.displayDate || lib.date || lib.instructionId || 'ไม่ระบุ';
    return `${prefix} ${label}`;
}

function buildInstructionInlineRow(bot, botType) {
    const selectedKey = getSelectedInstructionKey(bot);
    const instructionLabel = getInstructionLabelByKey(selectedKey) || 'ไม่เลือก';
    const options = buildInstructionOptions(selectedKey);
    const collectionCount = Array.isArray(bot.selectedImageCollections) ? bot.selectedImageCollections.length : 0;
    const summary = collectionCount > 0 ? `${collectionCount} ชุด` : 'ทุกภาพ';

    return `
        <div class="bot-inline-row compact">
            <div class="inline-control instruction-control">
                <span class="inline-label"><i class="fas fa-book"></i> Inst.</span>
                <select class="form-select form-select-sm instruction-select"
                    data-bot-type="${botType}"
                    data-bot-id="${bot._id}"
                    data-previous-value="${selectedKey}"
                    aria-label="เลือก Instruction สำหรับบอท">
                    ${options}
                </select>
            </div>
            <div class="inline-control">
                <span class="inline-label"><i class="fas fa-images"></i> ภาพ</span>
                <span class="instruction-chip chip-muted slim">ใช้: ${escapeHtml(summary)}</span>
                <button class="btn-ghost-sm btn-ghost-xs" type="button" onclick="window.imageCollectionsManager && window.imageCollectionsManager.openBotImageCollectionsModal && window.imageCollectionsManager.openBotImageCollectionsModal('${botType}', '${bot._id}')">เปลี่ยน</button>
            </div>
            <span class="instruction-chip ${selectedKey ? '' : 'chip-muted'} slim">ใช้: ${escapeHtml(instructionLabel)}</span>
        </div>
    `;
}

// Alias for backwards compatibility usage in markup
const buildBotInlineControls = buildInstructionInlineRow;

function buildInstructionOptions(selectedKey) {
    const options = ['<option value="">— ไม่เลือก —</option>'];
    instructionLibraries.forEach((lib) => {
        const key = getInstructionLibraryKey(lib);
        if (!key) return;
        const label = getInstructionLibraryLabel(lib);
        const isSelected = selectedKey === key ? 'selected' : '';
        options.push(`<option value="${key}" ${isSelected}>${escapeHtml(label)}</option>`);
    });
    return options.join('');
}

function getSelectedInstructionKey(bot) {
    const selections = Array.isArray(bot?.selectedInstructions) ? bot.selectedInstructions : [];
    if (selections.length === 0) return '';
    const first = selections[0];
    if (first && typeof first === 'object' && !Array.isArray(first) && first.instructionId) {
        return `${INSTRUCTION_SOURCE.V2}:${first.instructionId}`;
    }
    if (typeof first === 'string') {
        return `${INSTRUCTION_SOURCE.LEGACY}:${first}`;
    }
    return '';
}

function getInstructionLabelByKey(key) {
    if (!key) return '';
    const lib = instructionLibraries.find((item) => getInstructionLibraryKey(item) === key);
    if (lib) {
        return lib.name || lib.displayDate || lib.instructionId || lib.date || '';
    }
    const value = key.split(':').slice(1).join(':');
    return value || '';
}

function handleInstructionSelectChange(event) {
    const select = event.target;
    if (!select.classList.contains('instruction-select')) return;
    const botType = select.dataset.botType;
    const botId = select.dataset.botId;
    const previousValue = select.dataset.previousValue || '';
    const key = select.value;
    saveInstructionSelection(botType, botId, key, select, previousValue);
}

function buildInstructionPayloadFromKey(key) {
    if (!key) return [];
    const [source, ...rest] = key.split(':');
    const value = rest.join(':');
    if (!value) return [];
    if (source === INSTRUCTION_SOURCE.V2) {
        return [{ instructionId: value }];
    }
    if (source === INSTRUCTION_SOURCE.LEGACY) {
        return [value];
    }
    return [];
}

async function saveInstructionSelection(botType, botId, key, select, previousValue) {
    const payload = buildInstructionPayloadFromKey(key);
    const url =
        botType === 'facebook'
            ? `/api/facebook-bots/${botId}/instructions`
            : `/api/line-bots/${botId}/instructions`;

    select.disabled = true;
    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selectedInstructions: payload })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data?.error || 'บันทึกไม่สำเร็จ');
        }
        select.dataset.previousValue = key;
        updateInstructionChip(select, key);
        showToast('อัปเดต Instruction ของบอทแล้ว', 'success');
    } catch (error) {
        console.error('Error saving instruction selection:', error);
        select.value = previousValue;
        updateInstructionChip(select, previousValue);
        showToast('ไม่สามารถบันทึก Instruction ได้', 'danger');
    } finally {
        select.disabled = false;
    }
}

function updateInstructionChip(select, key) {
    const chip = select.closest('.inline-control')?.querySelector('.instruction-chip');
    if (!chip) return;
    const label = getInstructionLabelByKey(key) || 'ไม่เลือก';
    chip.textContent = key ? `ใช้: ${label}` : 'ไม่เลือก';
    chip.classList.toggle('chip-muted', !key);
}


function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


// --- Passcode Management ---
let passcodeCache = [];

function isSuperadmin() {
    return Boolean(window.adminAuth?.user?.role === 'superadmin');
}

function isPasscodeFeatureEnabled() {
    return Boolean(window.adminAuth?.requirePasscode);
}

function initPasscodeManagement() {
    if (!isSuperadmin() || !isPasscodeFeatureEnabled()) {
        return;
    }

    const card = document.getElementById('passcodeManagementCard');
    if (card) card.style.display = 'block';

    setupPasscodeEventListeners();
    refreshPasscodeList();
}

function setupPasscodeEventListeners() {
    const toggleBtn = document.getElementById('togglePasscodeCreateBtn');
    const createContainer = document.getElementById('passcodeCreateContainer');
    const createForm = document.getElementById('createPasscodeForm');
    const generateBtn = document.getElementById('generatePasscodeBtn');
    const tableBody = document.getElementById('passcodeTableBody');

    if (toggleBtn && createContainer) {
        toggleBtn.addEventListener('click', () => {
            const isVisible = createContainer.style.display !== 'none';
            createContainer.style.display = isVisible ? 'none' : 'block';
            toggleBtn.innerHTML = isVisible
                ? '<i class="fas fa-plus-circle"></i> สร้างรหัสใหม่'
                : '<i class="fas fa-times-circle"></i> ยกเลิก';
        });
    }

    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            const input = document.getElementById('newPasscodeValue');
            if (input) {
                input.value = generateRandomPasscode();
                input.focus();
                input.select();
            }
        });
    }

    if (createForm) {
        createForm.addEventListener('submit', handleCreatePasscode);
    }

    if (tableBody) {
        tableBody.addEventListener('click', handlePasscodeTableClick);
    }
}

function generateRandomPasscode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const length = 8;
    let value = '';
    for (let i = 0; i < length; i++) {
        const index = Math.floor(Math.random() * alphabet.length);
        value += alphabet[index];
    }
    return value.replace(/(.{4})/g, '$1-').replace(/-$/, '');
}

async function refreshPasscodeList() {
    if (!isSuperadmin()) return;

    try {
        const response = await fetch('/api/admin-passcodes');
        if (!response.ok) {
            throw new Error('ไม่สามารถโหลดข้อมูลรหัสผ่านได้');
        }
        const payload = await response.json();
        passcodeCache = Array.isArray(payload.passcodes) ? payload.passcodes : [];
        renderPasscodeTable();
        setPasscodeMessage('', '');
    } catch (error) {
        console.error('[Passcode] load error:', error);
        setPasscodeMessage('danger', error.message || 'ไม่สามารถโหลดข้อมูลรหัสผ่านได้');
    }
}

function renderPasscodeTable() {
    const tbody = document.getElementById('passcodeTableBody');
    if (!tbody) return;

    if (passcodeCache.length === 0) {
        tbody.innerHTML = `
            <tr id="passcodeEmptyState">
                <td colspan="5" class="text-center text-muted py-4">
                    <i class="fas fa-key me-2"></i>ยังไม่มีรหัสสำหรับทีมงาน เริ่มสร้างรหัสชุดแรกได้เลย
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = passcodeCache.map(passcode => {
        const statusClass = passcode.isActive ? 'success' : 'secondary';
        const statusText = passcode.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน';
        const toggleIcon = passcode.isActive ? 'toggle-on' : 'toggle-off';
        const lastUsed = passcode.lastUsedAt ? new Date(passcode.lastUsedAt).toLocaleDateString('th-TH') : 'ไม่เคยใช้';

        return `
            <tr>
                <td>${escapeHtml(passcode.label)}</td>
                <td><span class="badge bg-${statusClass}">${statusText}</span></td>
                <td>${lastUsed}</td>
                <td>${passcode.usageCount || 0}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-${passcode.isActive ? 'warning' : 'success'}" 
                            data-action="toggle" data-id="${passcode.id}">
                        <i class="fas fa-${toggleIcon}"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" 
                            data-action="delete" data-id="${passcode.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function handlePasscodeTableClick(event) {
    const target = event.target.closest('button[data-action]');
    if (!target) return;

    const action = target.getAttribute('data-action');
    const id = target.getAttribute('data-id');
    if (!id) return;

    if (action === 'toggle') {
        togglePasscodeStatus(id, target);
    } else if (action === 'delete') {
        deletePasscode(id, target);
    }
}

async function togglePasscodeStatus(id, triggerBtn) {
    const passcode = passcodeCache.find(item => item.id === id);
    if (!passcode) return;

    const willActivate = !passcode.isActive;
    const confirmationMessage = willActivate
        ? 'ต้องการเปิดใช้งานรหัสนี้หรือไม่?'
        : 'การปิดรหัสจะทำให้ทีมงานที่ใช้รหัสนี้ไม่สามารถล็อกอินใหม่ได้ ต้องการดำเนินการต่อหรือไม่?';

    if (!confirm(confirmationMessage)) return;

    setLoading(triggerBtn, true);

    try {
        const response = await fetch(`/api/admin-passcodes/${id}/toggle`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: willActivate })
        });

        const payload = await response.json();
        if (!response.ok || !payload.success) {
            throw new Error(payload.error || 'ปรับสถานะรหัสไม่สำเร็จ');
        }

        passcodeCache = passcodeCache.map(item =>
            item.id === id ? payload.passcode : item
        );
        renderPasscodeTable();
        setPasscodeMessage('success', 'อัปเดตรหัสเรียบร้อยแล้ว');
    } catch (error) {
        console.error('[Passcode] toggle error:', error);
        setPasscodeMessage('danger', error.message || 'ปรับสถานะรหัสไม่สำเร็จ');
    } finally {
        setLoading(triggerBtn, false);
    }
}

async function deletePasscode(id, triggerBtn) {
    if (window.adminAuth?.user?.codeId === id) {
        setPasscodeMessage('danger', 'ไม่สามารถลบรหัสที่คุณกำลังใช้งานอยู่ได้');
        return;
    }

    if (!confirm('ต้องการลบรหัสนี้หรือไม่? เมื่อยืนยันแล้วจะไม่สามารถเรียกคืนได้')) {
        return;
    }

    setLoading(triggerBtn, true);

    try {
        const response = await fetch(`/api/admin-passcodes/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const payload = await response.json();
            throw new Error(payload.error || 'ลบรหัสไม่สำเร็จ');
        }

        passcodeCache = passcodeCache.filter(item => item.id !== id);
        renderPasscodeTable();
        setPasscodeMessage('success', 'ลบรหัสเรียบร้อยแล้ว');
    } catch (error) {
        console.error('[Passcode] delete error:', error);
        setPasscodeMessage('danger', error.message || 'ลบรหัสไม่สำเร็จ');
    } finally {
        setLoading(triggerBtn, false);
    }
}

async function handleCreatePasscode(event) {
    event.preventDefault();

    const labelInput = document.getElementById('newPasscodeLabel');
    const passcodeInput = document.getElementById('newPasscodeValue');
    const submitBtn = document.getElementById('createPasscodeSubmitBtn');

    if (!labelInput || !passcodeInput || !submitBtn) return;

    const label = (labelInput.value || '').trim();
    const passcode = (passcodeInput.value || '').trim();

    if (!label || label.length < 2) {
        setPasscodeMessage('warning', 'กรุณาระบุชื่อรหัสอย่างน้อย 2 ตัวอักษร');
        return;
    }

    if (!passcode || passcode.length < 4) {
        setPasscodeMessage('warning', 'กรุณาระบุรหัสอย่างน้อย 4 ตัวอักษร');
        return;
    }

    setLoading(submitBtn, true);

    try {
        const response = await fetch('/api/admin-passcodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label, passcode })
        });

        const payload = await response.json();
        if (!response.ok || !payload.success) {
            throw new Error(payload.error || 'ไม่สามารถสร้างรหัสได้');
        }

        labelInput.value = '';
        passcodeInput.value = '';

        const createContainer = document.getElementById('passcodeCreateContainer');
        const toggleBtn = document.getElementById('togglePasscodeCreateBtn');
        if (createContainer) createContainer.style.display = 'none';
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-plus-circle"></i> สร้างรหัสใหม่';

        await refreshPasscodeList();
        setPasscodeMessage('success', 'สร้างรหัสใหม่เรียบร้อยแล้ว');
    } catch (error) {
        console.error('[Passcode] create error:', error);
        setPasscodeMessage('danger', error.message || 'ไม่สามารถสร้างรหัสได้');
    } finally {
        setLoading(submitBtn, false);
    }
}

function setPasscodeMessage(type, message) {
    const messageBox = document.getElementById('passcodeMessageBox');
    if (!messageBox) return;

    if (!message) {
        messageBox.classList.add('d-none');
        messageBox.textContent = '';
        return;
    }

    messageBox.classList.remove('d-none', 'alert-info', 'alert-success', 'alert-warning', 'alert-danger');
    messageBox.classList.add(`alert-${type}`);
    messageBox.textContent = message;

    // Auto-hide after 5 seconds for success messages
    if (type === 'success') {
        setTimeout(() => {
            messageBox.classList.add('d-none');
        }, 5000);
    }
}

// --- API Keys Management ---
let apiKeysCache = [];

async function loadApiKeys() {
    const tbody = document.getElementById('apiKeysTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center text-muted py-4">
                <i class="fas fa-spinner fa-spin me-2"></i>กำลังโหลด...
            </td>
        </tr>
    `;

    try {
        const response = await fetch('/api/openai-keys');
        if (!response.ok) {
            throw new Error('ไม่สามารถโหลดข้อมูล API Keys ได้');
        }
        const data = await response.json();
        apiKeysCache = Array.isArray(data.keys) ? data.keys : [];
        renderApiKeys();
    } catch (error) {
        console.error('[API Keys] load error:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-danger py-4">
                    <i class="fas fa-exclamation-circle me-2"></i>${escapeHtml(error.message)}
                </td>
            </tr>
        `;
    }
}

function renderApiKeys() {
    const tbody = document.getElementById('apiKeysTableBody');
    if (!tbody) return;

    if (apiKeysCache.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted py-4">
                    <i class="fas fa-key me-2"></i>ยังไม่มี API Key ในระบบ กดปุ่ม "เพิ่ม API Key" เพื่อเริ่มใช้งาน
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = apiKeysCache.map(key => {
        const statusClass = key.isActive ? 'success' : 'secondary';
        const statusText = key.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน';
        const defaultBadge = key.isDefault ? '<span class="badge bg-primary ms-1">หลัก</span>' : '';
        const lastUsed = key.lastUsedAt ? formatBotUpdatedAt(key.lastUsedAt) : 'ยังไม่มี';
        const usage = key.usageCount || 0;

        return `
            <tr>
                <td>
                    <strong>${escapeHtml(key.name)}</strong>
                    ${defaultBadge}
                </td>
                <td>
                    <code class="text-muted">${escapeHtml(key.maskedKey)}</code>
                </td>
                <td class="text-center">
                    <span class="badge bg-${statusClass}">${statusText}</span>
                </td>
                <td class="text-center">
                    <small>${usage} ครั้ง</small>
                    <br>
                    <small class="text-muted">${lastUsed}</small>
                </td>
                <td class="text-end">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-info" title="ทดสอบ" onclick="testApiKey('${key.id}')">
                            <i class="fas fa-check-circle"></i>
                        </button>
                        <button class="btn btn-outline-primary" title="แก้ไข" onclick="openEditApiKeyModal('${key.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-outline-${key.isActive ? 'warning' : 'success'}" title="${key.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}" 
                                onclick="toggleApiKeyStatus('${key.id}', ${!key.isActive})">
                            <i class="fas fa-${key.isActive ? 'pause' : 'play'}"></i>
                        </button>
                        <button class="btn btn-outline-danger" title="ลบ" onclick="deleteApiKey('${key.id}', '${escapeHtml(key.name)}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function openAddApiKeyModal() {
    document.getElementById('apiKeyId').value = '';
    document.getElementById('apiKeyName').value = '';
    document.getElementById('apiKeyValue').value = '';
    document.getElementById('apiKeyIsDefault').checked = false;
    document.getElementById('apiKeyModalLabel').innerHTML = '<i class="fas fa-key me-2"></i>เพิ่ม API Key';
    document.getElementById('apiKeyTestResult').classList.add('d-none');

    const modal = new bootstrap.Modal(document.getElementById('apiKeyModal'));
    modal.show();
}

function openEditApiKeyModal(id) {
    const key = apiKeysCache.find(k => k.id === id);
    if (!key) {
        showToast('ไม่พบ API Key', 'danger');
        return;
    }

    document.getElementById('apiKeyId').value = key.id;
    document.getElementById('apiKeyName').value = key.name;
    document.getElementById('apiKeyValue').value = key.maskedKey; // Show masked key
    document.getElementById('apiKeyValue').placeholder = 'ใส่ใหม่เพื่อเปลี่ยน หรือปล่อยว่าง';
    document.getElementById('apiKeyIsDefault').checked = key.isDefault;
    document.getElementById('apiKeyModalLabel').innerHTML = '<i class="fas fa-edit me-2"></i>แก้ไข API Key';
    document.getElementById('apiKeyTestResult').classList.add('d-none');

    const modal = new bootstrap.Modal(document.getElementById('apiKeyModal'));
    modal.show();
}

async function saveApiKey() {
    const id = document.getElementById('apiKeyId').value;
    const name = document.getElementById('apiKeyName').value.trim();
    const apiKey = document.getElementById('apiKeyValue').value.trim();
    const isDefault = document.getElementById('apiKeyIsDefault').checked;
    const saveBtn = document.getElementById('saveApiKeyBtn');

    if (!name) {
        showToast('กรุณาระบุชื่อ API Key', 'warning');
        return;
    }

    const isEdit = Boolean(id);
    const existingKey = isEdit ? apiKeysCache.find(k => k.id === id) : null;
    const isNewKey = !isEdit || (apiKey && !apiKey.startsWith('sk-...'));

    if (!isEdit && (!apiKey || !apiKey.startsWith('sk-'))) {
        showToast('กรุณาระบุ API Key ที่ถูกต้อง (ขึ้นต้นด้วย sk-)', 'warning');
        return;
    }

    setLoading(saveBtn, true);

    try {
        const payload = { name, isDefault };
        // Only send apiKey if it's a new key or if it's been changed (not the masked value)
        if (isNewKey && apiKey && !apiKey.startsWith('sk-...')) {
            payload.apiKey = apiKey;
        }

        const url = isEdit ? `/api/openai-keys/${id}` : '/api/openai-keys';
        const method = isEdit ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'ไม่สามารถบันทึก API Key ได้');
        }

        const modal = bootstrap.Modal.getInstance(document.getElementById('apiKeyModal'));
        if (modal) modal.hide();

        showToast(isEdit ? 'อัปเดต API Key เรียบร้อย' : 'เพิ่ม API Key เรียบร้อย', 'success');
        await loadApiKeys();
    } catch (error) {
        console.error('[API Keys] save error:', error);
        showToast(error.message || 'บันทึกไม่สำเร็จ', 'danger');
    } finally {
        setLoading(saveBtn, false);
    }
}

async function deleteApiKey(id, name) {
    if (!confirm(`ยืนยันการลบ API Key "${name}"?\n\nหมายเหตุ: Bot ที่ใช้ key นี้จะสลับไปใช้ key หลักหรือ Environment Variable แทน`)) {
        return;
    }

    try {
        const response = await fetch(`/api/openai-keys/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'ลบ API Key ไม่สำเร็จ');
        }

        showToast('ลบ API Key เรียบร้อย', 'success');
        await loadApiKeys();
    } catch (error) {
        console.error('[API Keys] delete error:', error);
        showToast(error.message || 'ลบไม่สำเร็จ', 'danger');
    }
}

async function testApiKey(id) {
    const key = apiKeysCache.find(k => k.id === id);
    if (!key) return;

    showToast(`กำลังทดสอบ "${key.name}"...`, 'info');

    try {
        const response = await fetch(`/api/openai-keys/${id}/test`, {
            method: 'POST'
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'ทดสอบ API Key ไม่สำเร็จ');
        }

        showToast(`✅ ${result.message}`, 'success');
    } catch (error) {
        console.error('[API Keys] test error:', error);
        showToast(`❌ ${error.message || 'ทดสอบไม่สำเร็จ'}`, 'danger');
    }
}

async function testApiKeyFromModal() {
    const apiKey = document.getElementById('apiKeyValue').value.trim();
    const resultDiv = document.getElementById('apiKeyTestResult');
    const testBtn = document.getElementById('testApiKeyBtn');

    if (!apiKey || apiKey.startsWith('sk-...')) {
        resultDiv.classList.remove('d-none', 'alert-success', 'alert-danger');
        resultDiv.classList.add('alert-warning');
        resultDiv.textContent = 'กรุณาใส่ API Key ใหม่เพื่อทดสอบ';
        return;
    }

    const id = document.getElementById('apiKeyId').value;
    if (id) {
        // Existing key - test via API
        await testApiKey(id);
        return;
    }

    // New key - test directly (not implemented yet, just show message)
    resultDiv.classList.remove('d-none', 'alert-success', 'alert-danger');
    resultDiv.classList.add('alert-info');
    resultDiv.textContent = 'กรุณาบันทึก API Key ก่อน แล้วทดสอบจากตาราง';
}

async function toggleApiKeyStatus(id, isActive) {
    try {
        const response = await fetch(`/api/openai-keys/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive })
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'ไม่สามารถเปลี่ยนสถานะได้');
        }

        showToast(isActive ? 'เปิดใช้งาน API Key แล้ว' : 'ปิดใช้งาน API Key แล้ว', 'success');
        await loadApiKeys();
    } catch (error) {
        console.error('[API Keys] toggle error:', error);
        showToast(error.message || 'เปลี่ยนสถานะไม่สำเร็จ', 'danger');
    }
}

// Toggle API key visibility
document.addEventListener('DOMContentLoaded', function () {
    const toggleBtn = document.getElementById('toggleApiKeyVisibility');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function () {
            const input = document.getElementById('apiKeyValue');
            if (input.type === 'password') {
                input.type = 'text';
                toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
            } else {
                input.type = 'password';
                toggleBtn.innerHTML = '<i class="fas fa-eye"></i>';
            }
        });
    }
});

// Auto-load API keys when section becomes visible
const originalInitNavigation = initNavigation;
initNavigation = function () {
    originalInitNavigation();

    // Add observer for API keys section
    const observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const section = document.getElementById('api-keys-settings');
                if (section && !section.classList.contains('d-none')) {
                    loadApiKeys();
                }
            }
        });
    });

    const apiKeysSection = document.getElementById('api-keys-settings');
    if (apiKeysSection) {
        observer.observe(apiKeysSection, { attributes: true });
    }
};

// =============================================
// Facebook Apps Management Functions
// =============================================

// Helper to populate Facebook App dropdown in bot modal
async function populateFacebookAppDropdown(selectId, selectedValue = '') {
    const select = document.getElementById(selectId);
    if (!select) return;

    // Clear existing options except first (default)
    select.innerHTML = '<option value="">-- เลือก Facebook App --</option>';

    try {
        // Use cached apps if available, otherwise fetch
        let apps = facebookAppsCache;
        if (!apps || apps.length === 0) {
            const response = await fetch('/api/facebook-apps');
            if (response.ok) {
                apps = await response.json();
                facebookAppsCache = apps;
            }
        }

        // Add active apps as options
        apps.filter(app => app.status === 'active').forEach(app => {
            const option = document.createElement('option');
            option.value = app._id;
            option.textContent = `${app.name} (${app.appId})`;
            if (selectedValue === app._id.toString()) option.selected = true;
            select.appendChild(option);
        });

        // Update webhook info when app is selected
        select.addEventListener('change', function () {
            updateSelectedAppInfo(this.value);
        });

        // Initial update
        if (selectedValue) {
            updateSelectedAppInfo(selectedValue);
        }
    } catch (error) {
        console.error('[Facebook Apps] Error loading apps for dropdown:', error);
    }
}

function updateSelectedAppInfo(appId) {
    const infoEl = document.getElementById('selectedAppWebhookInfo');
    if (!infoEl) return;

    if (!appId) {
        infoEl.innerHTML = '';
        return;
    }

    const app = facebookAppsCache.find(a => a._id.toString() === appId);
    if (app) {
        infoEl.innerHTML = `<br><small>Webhook: <code>${app.webhookUrl || 'N/A'}</code></small>`;
    } else {
        infoEl.innerHTML = '';
    }
}

// Track which modal opened the App modal (for returning after close)
let _previousModalBeforeAppModal = null;

// Open Add Facebook App Modal
window.openAddFacebookAppModal = function () {
    // Check if Facebook Bot modal is currently open and hide it
    const botModalEl = document.getElementById('addFacebookBotModal');
    if (botModalEl) {
        const botModalInstance = bootstrap.Modal.getInstance(botModalEl);
        if (botModalInstance && botModalEl.classList.contains('show')) {
            // Store reference to return to this modal later
            _previousModalBeforeAppModal = 'addFacebookBotModal';
            botModalInstance.hide();
        }
    }

    const form = document.getElementById('facebookAppForm');
    if (form) form.reset();

    document.getElementById('facebookAppId').value = '';
    document.getElementById('facebookAppVerifyToken').value = '';
    document.getElementById('facebookAppWebhookUrl').value = '';

    document.getElementById('facebookAppModalTitle').textContent = 'สร้าง Facebook App ใหม่';
    document.getElementById('deleteFacebookAppBtn').style.display = 'none';
    document.getElementById('connectedPagesSection').style.display = 'none';
    document.getElementById('facebookAppSetupGuide').style.display = 'block';

    // Disable copy buttons for new app
    const copyVerifyBtn = document.getElementById('copyVerifyTokenBtn');
    const copyWebhookBtn = document.getElementById('copyWebhookUrlBtn');
    const regenerateBtn = document.getElementById('regenerateVerifyTokenBtn');
    if (copyVerifyBtn) copyVerifyBtn.disabled = true;
    if (copyWebhookBtn) copyWebhookBtn.disabled = true;
    if (regenerateBtn) regenerateBtn.disabled = true;

    const modalEl = document.getElementById('addFacebookAppModal');
    if (modalEl) {
        // Set up event listener to restore previous modal when this one closes
        const handleHidden = function () {
            modalEl.removeEventListener('hidden.bs.modal', handleHidden);
            if (_previousModalBeforeAppModal) {
                const prevModalId = _previousModalBeforeAppModal;
                _previousModalBeforeAppModal = null;
                // Small delay to ensure smooth transition
                setTimeout(() => {
                    const prevModalEl = document.getElementById(prevModalId);
                    if (prevModalEl) {
                        const prevModal = new bootstrap.Modal(prevModalEl);
                        prevModal.show();
                    }
                }, 150);
            }
        };
        modalEl.addEventListener('hidden.bs.modal', handleHidden);

        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
};

// Open Edit Facebook App Modal
window.openEditFacebookAppModal = async function (id) {
    try {
        const res = await fetch(`/api/facebook-apps/${id}`);
        if (!res.ok) throw new Error('Failed to fetch app');
        const app = await res.json();

        document.getElementById('facebookAppId').value = app._id;
        document.getElementById('facebookAppName').value = app.name;
        document.getElementById('facebookAppAppId').value = app.appId;
        document.getElementById('facebookAppAppSecret').value = app.appSecret || '';
        document.getElementById('facebookAppVerifyToken').value = app.verifyToken || '';
        document.getElementById('facebookAppWebhookUrl').value = app.webhookUrl || '';

        document.getElementById('facebookAppModalTitle').textContent = 'แก้ไข Facebook App';
        document.getElementById('deleteFacebookAppBtn').style.display = 'inline-block';
        document.getElementById('connectedPagesSection').style.display = 'block';
        document.getElementById('facebookAppSetupGuide').style.display = 'none';

        // Enable copy buttons
        const copyVerifyBtn = document.getElementById('copyVerifyTokenBtn');
        const copyWebhookBtn = document.getElementById('copyWebhookUrlBtn');
        const regenerateBtn = document.getElementById('regenerateVerifyTokenBtn');
        if (copyVerifyBtn) copyVerifyBtn.disabled = false;
        if (copyWebhookBtn) copyWebhookBtn.disabled = false;
        if (regenerateBtn) regenerateBtn.disabled = false;

        // Render connected pages
        renderConnectedPages(app.connectedPages || []);

        const modalEl = document.getElementById('addFacebookAppModal');
        if (modalEl) {
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }
    } catch (error) {
        console.error('Error loading Facebook App:', error);
        showToast('ไม่สามารถโหลดข้อมูล Facebook App ได้', 'danger');
    }
};

function renderConnectedPages(pages) {
    const container = document.getElementById('connectedPagesList');
    if (!container) return;

    if (pages.length === 0) {
        container.innerHTML = '<div class="text-center text-muted small py-3">ยังไม่มี Page เชื่อมต่อ</div>';
        return;
    }

    container.innerHTML = pages.map(page => `
        <div class="list-group-item d-flex justify-content-between align-items-center" style="background: var(--surface-2);">
            <div>
                <i class="fab fa-facebook-f text-primary me-2"></i>
                <strong>${escapeHtml(page.name)}</strong>
                <small class="text-muted ms-2">Page ID: ${escapeHtml(page.pageId || 'N/A')}</small>
            </div>
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="openEditFacebookBotModal('${page._id}')">
                <i class="fas fa-edit"></i>
            </button>
        </div>
    `).join('');
}

// Save Facebook App
window.saveFacebookApp = async function () {
    const appId = document.getElementById('facebookAppId').value;
    const isEdit = !!appId;

    const appData = {
        name: document.getElementById('facebookAppName').value,
        appId: document.getElementById('facebookAppAppId').value,
        appSecret: document.getElementById('facebookAppAppSecret').value,
        verifyToken: document.getElementById('facebookAppVerifyToken').value
    };

    if (!appData.name || !appData.appId) {
        showToast('กรุณากรอกชื่อ App และ App ID', 'danger');
        return;
    }

    const url = isEdit ? `/api/facebook-apps/${appId}` : '/api/facebook-apps';
    const method = isEdit ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appData)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');

        showToast(isEdit ? 'อัปเดต Facebook App เรียบร้อยแล้ว' : 'สร้าง Facebook App เรียบร้อยแล้ว', 'success');

        // Update form with generated values for new app
        if (!isEdit && data.webhookUrl) {
            document.getElementById('facebookAppId').value = data._id;
            document.getElementById('facebookAppWebhookUrl').value = data.webhookUrl;
            document.getElementById('facebookAppVerifyToken').value = data.verifyToken;

            // Enable copy buttons
            const copyVerifyBtn = document.getElementById('copyVerifyTokenBtn');
            const copyWebhookBtn = document.getElementById('copyWebhookUrlBtn');
            const regenerateBtn = document.getElementById('regenerateVerifyTokenBtn');
            if (copyVerifyBtn) copyVerifyBtn.disabled = false;
            if (copyWebhookBtn) copyWebhookBtn.disabled = false;
            if (regenerateBtn) regenerateBtn.disabled = false;

            document.getElementById('facebookAppModalTitle').textContent = 'แก้ไข Facebook App';
            document.getElementById('deleteFacebookAppBtn').style.display = 'inline-block';
            document.getElementById('facebookAppSetupGuide').style.display = 'none';
            document.getElementById('connectedPagesSection').style.display = 'block';

            showToast('กรุณาคัดลอก Webhook URL และ Verify Token ไปตั้งค่าใน Facebook App', 'info');
        } else {
            const modalEl = document.getElementById('addFacebookAppModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        }

        // Refresh apps cache and list
        facebookAppsCache = [];
        loadBotSettings();
    } catch (error) {
        console.error('Error saving Facebook App:', error);
        showToast(error.message || 'ไม่สามารถบันทึก Facebook App ได้', 'danger');
    }
};

// Delete Facebook App
window.deleteFacebookApp = async function () {
    const appId = document.getElementById('facebookAppId').value;
    if (!appId) return;

    if (!confirm('ต้องการลบ Facebook App นี้หรือไม่?\n\nหมายเหตุ: ไม่สามารถลบได้หากยังมี Pages เชื่อมต่ออยู่')) {
        return;
    }

    try {
        const res = await fetch(`/api/facebook-apps/${appId}`, {
            method: 'DELETE'
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'ลบไม่สำเร็จ');

        showToast('ลบ Facebook App เรียบร้อยแล้ว', 'success');

        const modalEl = document.getElementById('addFacebookAppModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        facebookAppsCache = [];
        loadBotSettings();
    } catch (error) {
        console.error('Error deleting Facebook App:', error);
        showToast(error.message || 'ไม่สามารถลบ Facebook App ได้', 'danger');
    }
};

// Regenerate Verify Token
window.regenerateVerifyToken = async function () {
    const appId = document.getElementById('facebookAppId').value;
    if (!appId) {
        showToast('กรุณาบันทึก App ก่อนเพื่อสร้าง Verify Token ใหม่', 'warning');
        return;
    }

    if (!confirm('ต้องการสร้าง Verify Token ใหม่หรือไม่?\n\nหมายเหตุ: หลังจากสร้างใหม่ คุณต้องอัปเดต Token ใน Facebook App ด้วย')) {
        return;
    }

    try {
        const res = await fetch(`/api/facebook-apps/${appId}/regenerate-token`, {
            method: 'POST'
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'สร้าง Token ใหม่ไม่สำเร็จ');

        document.getElementById('facebookAppVerifyToken').value = data.verifyToken;
        showToast('สร้าง Verify Token ใหม่แล้ว กรุณาอัปเดตใน Facebook App', 'success');
    } catch (error) {
        console.error('Error regenerating verify token:', error);
        showToast(error.message || 'ไม่สามารถสร้าง Verify Token ใหม่ได้', 'danger');
    }
};

// Copy to clipboard helper
window.copyToClipboard = function (inputId, label) {
    const input = document.getElementById(inputId);
    if (!input || !input.value) {
        showToast(`ไม่มี ${label} ให้คัดลอก`, 'warning');
        return;
    }

    navigator.clipboard.writeText(input.value).then(() => {
        showToast(`คัดลอก ${label} แล้ว`, 'success');
    }).catch(() => {
        showToast(`ไม่สามารถคัดลอก ${label} ได้`, 'danger');
    });
};

// Toggle password visibility helper
window.togglePasswordVisibility = function (inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;

    if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
        input.type = 'password';
        btn.innerHTML = '<i class="fas fa-eye"></i>';
    }
};

// Track which modal opened the Bot modal (for returning after close)
let _previousModalBeforeBotModal = null;

// Open add Facebook Bot modal with preselected App
window.openAddFacebookBotModalForApp = async function (appId) {
    // Store the app ID to return to after Bot modal closes
    _previousModalBeforeBotModal = {
        modalId: 'addFacebookAppModal',
        appId: appId
    };

    // Hide the current App modal first
    const appModalEl = document.getElementById('addFacebookAppModal');
    if (appModalEl) {
        const appModalInstance = bootstrap.Modal.getInstance(appModalEl);
        if (appModalInstance && appModalEl.classList.contains('show')) {
            appModalInstance.hide();
        }
    }

    // Wait for modal to fully close before opening the new one
    await new Promise(resolve => setTimeout(resolve, 300));

    // Open the bot modal with the preselected app ID
    await window.openAddFacebookBotModal(appId);

    // Set up event listener to restore previous modal when bot modal closes
    const botModalEl = document.getElementById('addFacebookBotModal');
    if (botModalEl && _previousModalBeforeBotModal) {
        const handleHidden = function () {
            botModalEl.removeEventListener('hidden.bs.modal', handleHidden);
            if (_previousModalBeforeBotModal) {
                const prevData = _previousModalBeforeBotModal;
                _previousModalBeforeBotModal = null;
                // Small delay to ensure smooth transition
                setTimeout(() => {
                    if (prevData.appId) {
                        // Restore the edit state of the App modal
                        window.openEditFacebookAppModal(prevData.appId);
                    }
                }, 150);
            }
        };
        botModalEl.addEventListener('hidden.bs.modal', handleHidden, { once: true });
    }
};

// Setup event listeners for Facebook App modal
document.addEventListener('DOMContentLoaded', function () {
    const saveFbAppBtn = document.getElementById('saveFacebookAppBtn');
    if (saveFbAppBtn) {
        saveFbAppBtn.addEventListener('click', saveFacebookApp);
    }

    const deleteFbAppBtn = document.getElementById('deleteFacebookAppBtn');
    if (deleteFbAppBtn) {
        deleteFbAppBtn.addEventListener('click', deleteFacebookApp);
    }
});
