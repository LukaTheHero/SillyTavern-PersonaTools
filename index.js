/**
 * PersonaTools - Combined Extension
 * Combines: QuickPersona + Persona Group Manager (Folders) + Persona Tags
 * Plus: Styled tooltip, vertical persona selector, fancy folder cards
 * 
 * Author: LukaTheHero
 * Version: 1.2.0
 */
(() => {
    'use strict';

    const EXT_NAME = 'PersonaTools';
    const VERSION = '1.2.0';
    const DEBUG = false;

    const STContext = SillyTavern.getContext();
    const { extensionSettings, saveSettingsDebounced, eventSource, event_types, getThumbnailUrl } = STContext;

    let power_user = null;
    let user_avatar = null;
    let getUserAvatars = null;
    let setUserAvatar = null;
    let getUserAvatar = null;
    let Popper = null;
    let animation_duration = 200;
    let importsReady = false;

    async function loadImports() {
        try {
            const powerUserModule = await import('/scripts/power-user.js');
            power_user = powerUserModule.power_user;
            const personasModule = await import('/scripts/personas.js');
            getUserAvatars = personasModule.getUserAvatars;
            setUserAvatar = personasModule.setUserAvatar;
            getUserAvatar = personasModule.getUserAvatar;
            PersonaTools._personasModule = personasModule;
            try {
                const scriptModule = await import('/script.js');
                if (scriptModule.animation_duration) animation_duration = scriptModule.animation_duration;
            } catch (e) { }
            try {
                const libModule = await import('/lib.js');
                Popper = libModule.Popper;
            } catch (e) {
                try { const libModule2 = await import('../../../../lib.js'); Popper = libModule2.Popper; } catch (e2) { }
            }
            importsReady = true;
            log('All imports loaded');
        } catch (e) { error('Failed to load imports:', e); }
    }

    function getCurrentUserAvatar() {
        if (PersonaTools._personasModule) return PersonaTools._personasModule.user_avatar;
        return user_avatar;
    }

    function log(...args) { if (DEBUG) console.log(`[${EXT_NAME}]`, ...args); }
    function error(...args) { console.error(`[${EXT_NAME}]`, ...args); }
    function createElement(tag, props = {}) { const el = document.createElement(tag); Object.assign(el, props); return el; }

    // ============================================
    // SETTINGS
    // ============================================

    const defaultSettings = Object.freeze({
        personaGroups: {},
        persona_tags: [],
        persona_tag_map: {},
        folderDescriptions: {}
    });

    let settings = {};

    function getSettings() {
        if (!extensionSettings[EXT_NAME]) extensionSettings[EXT_NAME] = structuredClone(defaultSettings);
        for (const key in defaultSettings) {
            if (!(key in extensionSettings[EXT_NAME])) extensionSettings[EXT_NAME][key] = structuredClone(defaultSettings[key]);
        }
        return extensionSettings[EXT_NAME];
    }

    async function saveSettings() {
        Object.assign(extensionSettings[EXT_NAME], settings);
        saveSettingsDebounced();
        log('Settings saved');
    }

    // ============================================
    // PERSONA DATA HELPERS
    // ============================================

    function getPersonaName(avatarId) {
        if (power_user && power_user.personas) return power_user.personas[avatarId] || avatarId;
        return avatarId;
    }

    function getPersonaTitle(avatarId) {
        if (power_user && power_user.persona_descriptions && power_user.persona_descriptions[avatarId])
            return power_user.persona_descriptions[avatarId].title || '';
        return '';
    }

    function getImageUrl(avatarId) {
        try {
            if (getThumbnailUrl) {
                const testUrl = getThumbnailUrl('persona', 'test.png', true);
                if (testUrl.includes('&t=')) return getThumbnailUrl('persona', avatarId, true);
            }
        } catch (e) { }
        try { if (getUserAvatar) return `${getUserAvatar(avatarId)}?t=${Date.now()}`; } catch (e) { }
        return `/user/avatars/${avatarId}?t=${Date.now()}`;
    }

    // ============================================
    // TOOLTIP
    // ============================================

    let tooltipElement = null;
    let tooltipTimeout = null;

    function createTooltipElement() {
        if (tooltipElement) return tooltipElement;
        tooltipElement = createElement('div', { className: 'pt-tooltip' });
        tooltipElement.appendChild(createElement('div', { className: 'pt-tooltip-name' }));
        tooltipElement.appendChild(createElement('div', { className: 'pt-tooltip-title' }));
        document.body.appendChild(tooltipElement);
        return tooltipElement;
    }

    function showTooltip(event, name, title) {
        const tt = createTooltipElement();
        tt.querySelector('.pt-tooltip-name').textContent = name;
        const titleDiv = tt.querySelector('.pt-tooltip-title');
        if (title) { titleDiv.textContent = title; titleDiv.style.display = ''; }
        else { titleDiv.textContent = ''; titleDiv.style.display = 'none'; }
        tt.style.left = (event.clientX + 12) + 'px';
        tt.style.top = (event.clientY + 12) + 'px';
        clearTimeout(tooltipTimeout);
        tooltipTimeout = setTimeout(() => {
            tt.classList.add('visible');
            const rect = tt.getBoundingClientRect();
            if (rect.right > window.innerWidth) tt.style.left = (event.clientX - rect.width - 12) + 'px';
            if (rect.bottom > window.innerHeight) tt.style.top = (event.clientY - rect.height - 12) + 'px';
        }, 100);
    }

    function moveTooltip(event) {
        if (!tooltipElement) return;
        tooltipElement.style.left = (event.clientX + 12) + 'px';
        tooltipElement.style.top = (event.clientY + 12) + 'px';
    }

    function hideTooltip() {
        clearTimeout(tooltipTimeout);
        if (tooltipElement) tooltipElement.classList.remove('visible');
    }

    // ============================================
    // QUICK PERSONA SELECTOR (Vertical List Style)
    // ============================================

    let quickPersonaPopper = null;
    let isQuickMenuOpen = false;

    function addQuickPersonaButton() {
        if (document.getElementById('quickPersona')) return;
        const html = `
        <div id="quickPersona" class="interactable" tabindex="0" style="position:relative;width:var(--bottomFormBlockSize);height:var(--bottomFormBlockSize);order:10;">
            <img id="quickPersonaImg" src="/img/ai4.png" style="border-radius:50%;width:100%;height:100%;object-fit:cover;object-position:center;cursor:pointer;border:1px solid transparent;box-shadow:0 0 5px var(--black50a);outline:2px solid transparent;" />
            <div id="quickPersonaCaret" class="fa-fw fa-solid fa-caret-up"></div>
        </div>`;
        $('#leftSendForm').append(html);
        $('#quickPersona').on('click', () => toggleQuickPersonaSelector());
    }


    async function toggleQuickPersonaSelector() {
        if (isQuickMenuOpen) { closeQuickPersonaSelector(); return; }
        await openQuickPersonaSelector();
    }

    async function openQuickPersonaSelector() {
        if (!importsReady) return;
        isQuickMenuOpen = true;

        const userAvatars = await getUserAvatars(false);
        const currentAvatar = getCurrentUserAvatar();
        const groups = getAllGroups();
        const usedPersonas = new Set();

        const menu = $('<div id="quickPersonaMenu" class="pt-persona-menu"></div>');
        const header = $('<div class="pt-menu-header">Personas</div>');
        menu.append(header);

        const list = $('<div class="pt-menu-list"></div>');

        // Folders first
        let hasFolders = false;
        groups.forEach(({ name }) => {
            const personasInGroup = getPersonasInGroup(name);
            if (personasInGroup.length === 0) return;
            const available = personasInGroup.filter(id => userAvatars.includes(id));
            if (available.length === 0) return;
            hasFolders = true;

            const firstPersona = available[0];
            const imgUrl = getImageUrl(firstPersona);
            const desc = settings.folderDescriptions[name] || '';

            const row = $(`
                <div class="pt-menu-row pt-menu-folder" data-folder="${name}">
                    <img class="pt-menu-avatar" src="${imgUrl}" />
                    <div class="pt-menu-info">
                        <div class="pt-menu-name"><i class="fa-solid fa-folder" style="margin-right:4px;font-size:11px;opacity:0.7;"></i>${name} (${available.length})</div>
                        ${desc ? `<div class="pt-menu-subtitle">${desc}</div>` : ''}
                    </div>
                </div>
            `);

            row.on('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openQuickMenuFolderSubmenu(name, available);
            });


            list.append(row);
            available.forEach(id => usedPersonas.add(id));
        });

        // Separator if there are folders and ungrouped personas
        const ungrouped = userAvatars.filter(a => !usedPersonas.has(a));
        if (hasFolders && ungrouped.length > 0) {
            list.append('<div class="pt-menu-separator"></div>');
        }

        // Ungrouped personas
        ungrouped.forEach(avatarId => {
            const row = createQuickMenuPersonaRow(avatarId, currentAvatar);
            list.append(row);
        });

        menu.append(list);
        menu.hide();
        $(document.body).append(menu);
        $('#quickPersonaCaret').toggleClass('fa-caret-up fa-caret-down');
        $('#quickPersonaMenu').fadeIn(animation_duration);

        if (Popper) {
            const btn = document.getElementById('quickPersona');
            const menuEl = document.getElementById('quickPersonaMenu');
            if (btn && menuEl) {
                if (quickPersonaPopper) quickPersonaPopper.destroy();
                quickPersonaPopper = Popper.createPopper(btn, menuEl, { placement: 'top-start' });
                quickPersonaPopper.update();
            }
        }
    }

    function createQuickMenuPersonaRow(avatarId, currentAvatar) {
        const personaName = getPersonaName(avatarId);
        const personaTitle = getPersonaTitle(avatarId);
        const imgUrl = getImageUrl(avatarId);
        const isSelected = avatarId === currentAvatar;

        const row = $(`
            <div class="pt-menu-row pt-menu-persona ${isSelected ? 'pt-selected' : ''}" data-avatar="${avatarId}">
                <img class="pt-menu-avatar" src="${imgUrl}" />
                <div class="pt-menu-info">
                    <div class="pt-menu-name">${personaName}</div>
                    ${personaTitle ? `<div class="pt-menu-subtitle">${personaTitle}</div>` : ''}
                </div>
                ${isSelected ? '<div class="pt-menu-check"><i class="fa-solid fa-check"></i></div>' : ''}
            </div>
        `);

        row.on('click', async () => {
            closeQuickPersonaSelector();
            await setUserAvatar(avatarId);
            updateQuickPersonaButton();
        });

        return row;
    }

    function openQuickMenuFolderSubmenu(folderName, personas) {
        const menu = document.getElementById('quickPersonaMenu');
        if (!menu) return;
        const currentAvatar = getCurrentUserAvatar();

        const list = menu.querySelector('.pt-menu-list');
        list.innerHTML = '';

        // Back button row
        const backRow = $(`
            <div class="pt-menu-row pt-menu-back">
                <div class="pt-menu-back-icon"><i class="fa-solid fa-arrow-left"></i></div>
                <div class="pt-menu-info">
                    <div class="pt-menu-name">Back</div>
                </div>
            </div>
        `);
        backRow.on('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeQuickPersonaSelector();
            setTimeout(() => openQuickPersonaSelector(), 100);
        });

        list.appendChild(backRow[0]);

        // Folder title
        const titleRow = $(`<div class="pt-menu-folder-title">${folderName}</div>`);
        list.appendChild(titleRow[0]);

        // Personas in folder
        personas.forEach(avatarId => {
            const row = createQuickMenuPersonaRow(avatarId, currentAvatar);
            list.appendChild(row[0]);
        });
    }

    function closeQuickPersonaSelector() {
        isQuickMenuOpen = false;
        $('#quickPersonaCaret').toggleClass('fa-caret-up fa-caret-down');
        $('#quickPersonaMenu').fadeOut(animation_duration, () => { $('#quickPersonaMenu').remove(); });
        if (quickPersonaPopper) { quickPersonaPopper.destroy(); quickPersonaPopper = null; }
        hideTooltip();
    }


    function updateQuickPersonaButton() {
        setTimeout(() => {
            if (!importsReady) return;
            const cur = getCurrentUserAvatar();
            if (!cur) return;
            const name = getPersonaName(cur);
            const title = getPersonaTitle(cur);
            const imgUrl = getImageUrl(cur);
            const imgTitle = title ? `${name} - ${title}` : name;
            $('#quickPersonaImg').attr('src', imgUrl).attr('title', imgTitle);
        }, 100);
    }

    // ============================================
    // PERSONA GROUP MANAGER (FOLDERS)
    // ============================================

    const SELECTORS = {
        personaManagement: '#persona-management-block',
        headerRow: '#persona-management-block .persona_management_left_column .flex-container.marginBot10.alignitemscenter',
        avatarBlock: '#user_avatar_block',
        avatarCard: '.avatar-container',
        nameBlock: '.character_name_block',
        nameSpan: '.ch_name'
    };

    const IDS = {
        folderHeader: 'pgm-folder-header',
        backButton: 'pgm-back-button',
        popover: 'pgm-popover',
        backdrop: 'pgm-backdrop'
    };

    const CLASSES = {
        groupBtn: 'pgm-group-btn',
        tagBtn: 'pgm-tag-btn',
        active: 'pgm-active',
        folderCard: 'pgm-folder-card',
        hidden: 'pgm-hidden',
        processed: 'pgm-processed'
    };

    let isPanelUICreated = false;
    let originalPersonaCards = new Map();
    let currentFolderView = null;
    let lastCardsCount = 0;
    let lastCardsHash = '';
    let checkInterval = null;

    function isPersonaManagerVisible() {
        const m = document.querySelector(SELECTORS.personaManagement);
        return !!m && m.offsetParent !== null;
    }

    function getHeaderRow() {
        return document.querySelector(SELECTORS.headerRow) ||
               document.querySelector('.persona_management_left_column .flex-container');
    }

    function getAvatarCards() {
        const block = document.querySelector(SELECTORS.avatarBlock);
        return block ? Array.from(block.querySelectorAll(SELECTORS.avatarCard)) : [];
    }

    function tryCreatePanelUI() {
        if (!isPersonaManagerVisible()) return false;
        if (isPanelUICreated) return true;
        const success = createPanelUI();
        if (success) {
            isPanelUICreated = true;
            startCardsMonitoring();
            setTimeout(() => { storeOriginalCards(); updatePanelView(); }, 100);
        }
        return success;
    }

    function createPanelUI() {
        const header = getHeaderRow();
        if (!header) return false;
        createFolderHeader();
        log('Panel UI created');
        return true;
    }

    function checkPersonaManager() {
        const vis = isPersonaManagerVisible();
        if (vis && !isPanelUICreated) { tryCreatePanelUI(); initPersonaTags(); }
        else if (!vis && isPanelUICreated) { stopCardsMonitoring(); isPanelUICreated = false; }
    }

    function startCardsMonitoring() {
        if (checkInterval) return;
        checkInterval = setInterval(() => {
            if (!isPersonaManagerVisible()) return;
            const cards = getAvatarCards();
            const count = cards.length;
            const hash = cards.map(c => c.dataset.avatarId || '').filter(id => id && !id.startsWith('folder-')).sort().join('|');
            if (count !== lastCardsCount || hash !== lastCardsHash) {
                lastCardsCount = count; lastCardsHash = hash;
                storeOriginalCards(); resetProcessedFlags(); updatePanelView();
            }
        }, 1000);
    }

    function stopCardsMonitoring() {
        if (checkInterval) { clearInterval(checkInterval); checkInterval = null; }
    }

    function storeOriginalCards() {
        const cards = getAvatarCards();
        cards.forEach(card => {
            const id = card.dataset.avatarId;
            if (id && !card.classList.contains(CLASSES.folderCard) && !originalPersonaCards.has(id)) {
                originalPersonaCards.set(id, { element: card.cloneNode(true) });
            }
        });
    }

    function resetProcessedFlags() {
        getAvatarCards().forEach(c => c.classList.remove(CLASSES.processed));
    }

    // --- Folder Header ---

    function createFolderHeader() {
        const block = document.querySelector(SELECTORS.avatarBlock);
        if (!block || document.getElementById(IDS.folderHeader)) return;
        const fh = createElement('div', { id: IDS.folderHeader, className: 'pgm-folder-header pgm-hidden' });
        const btn = createElement('button', { id: IDS.backButton, type: 'button', className: 'pgm-back-button menu_button', innerHTML: '<i class="fa-solid fa-arrow-left"></i>', title: 'Back to folders' });
        const title = createElement('div', { className: 'pgm-folder-title' });
        btn.addEventListener('click', () => { currentFolderView = null; updatePanelView(); });
        fh.append(btn, title);
        block.parentNode.insertBefore(fh, block);
    }

    // --- Panel View ---

    function isTagFilterActive() { return selectedPersonaFilterTags.length > 0; }

    function updatePanelView() {
        const fh = document.getElementById(IDS.folderHeader);
        if (isTagFilterActive()) {
            if (fh) fh.classList.add(CLASSES.hidden);
            showFilteredByTagsView();
            return;
        }
        if (currentFolderView) {
            showFolderContent(currentFolderView);
            if (fh) {
                fh.classList.remove(CLASSES.hidden);
                const t = fh.querySelector('.pgm-folder-title');
                if (t) t.textContent = `${currentFolderView} (${getPersonasInGroup(currentFolderView).length})`;
            }
        } else {
            showFolderView();
            if (fh) fh.classList.add(CLASSES.hidden);
        }
    }

    function showFilteredByTagsView() {
        const block = document.querySelector(SELECTORS.avatarBlock);
        if (!block) return;
        block.querySelectorAll(`.${CLASSES.folderCard}`).forEach(el => el.remove());
        block.querySelectorAll(SELECTORS.avatarCard).forEach(card => {
            if (card.classList.contains(CLASSES.folderCard)) return;
            const avatarId = card.dataset.avatarId;
            if (!avatarId) return;
            const pid1 = card.getAttribute('imgfile');
            const assigned = settings.persona_tag_map[pid1] || settings.persona_tag_map[avatarId] || [];
            const matches = selectedPersonaFilterTags.every(tag => assigned.includes(tag));
            if (matches) { card.style.display = ''; card.classList.remove(CLASSES.hidden); }
            else { card.style.display = 'none'; card.classList.add(CLASSES.hidden); }
        });
        updatePersonaCards();
    }

    function showFolderView() {
        const block = document.querySelector(SELECTORS.avatarBlock);
        if (!block) return;
        block.querySelectorAll(`.${CLASSES.folderCard}`).forEach(el => el.remove());

        const groups = getAllGroups();
        const usedPersonas = new Set();
        const folderCards = [];

        groups.forEach(({ name, count }) => {
            const personas = getPersonasInGroup(name);
            if (personas.length === 0) return;
            const firstId = personas[0];
            const orig = originalPersonaCards.get(firstId);
            if (!orig) return;
            const fc = createFolderCard(name, count, orig.element, personas);
            folderCards.push({ card: fc, name });
            personas.forEach(id => usedPersonas.add(id));
        });

        folderCards.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
        const first = block.firstChild;
        folderCards.forEach(({ card }) => { if (first) block.insertBefore(card, first); else block.appendChild(card); });

        block.querySelectorAll(SELECTORS.avatarCard).forEach(card => {
            if (card.classList.contains(CLASSES.folderCard)) return;
            const id = card.dataset.avatarId;
            if (!id) return;
            if (usedPersonas.has(id)) { card.style.display = 'none'; card.classList.add(CLASSES.hidden); }
            else { card.style.display = ''; card.classList.remove(CLASSES.hidden); }
        });
        updatePersonaCards();
    }

    function showFolderContent(folderName) {
        const block = document.querySelector(SELECTORS.avatarBlock);
        if (!block) return;
        const personas = getPersonasInGroup(folderName);
        block.querySelectorAll(`.${CLASSES.folderCard}`).forEach(el => el.remove());
        originalPersonaCards.forEach((data, avatarId) => {
            const card = block.querySelector(`[data-avatar-id="${avatarId}"]`);
            if (card) {
                if (personas.includes(avatarId)) { card.style.display = ''; card.classList.remove(CLASSES.hidden); }
                else { card.style.display = 'none'; card.classList.add(CLASSES.hidden); }
            }
        });
        updatePersonaCards();
    }

    // --- Folder Card Creation ---
    function createFolderCard(groupName, count, templateCard, personasInGroup) {
        const firstId = personasInGroup[0];
        const firstCard = originalPersonaCards.get(firstId);
        const source = firstCard ? firstCard.element : templateCard;

        const fc = source.cloneNode(true);
        fc.classList.add(CLASSES.folderCard, CLASSES.processed);
        fc.dataset.groupName = groupName;
        fc.dataset.avatarId = `folder-${groupName}`;

        // Remove ALL old buttons, tag labels, info rows
        fc.querySelectorAll(`.${CLASSES.groupBtn}, .${CLASSES.tagBtn}, .pgm-folder-manage, .persona-tag-labels, .pgm-folder-info-row`).forEach(b => b.remove());

        const nameBlock = fc.querySelector(SELECTORS.nameBlock);
        if (nameBlock) {
            // Hide everything inside name block
            Array.from(nameBlock.children).forEach(child => {
                child.style.display = 'none';
            });

            // Build fresh folder content
            // Row 1: Folder name + manage button
            const nameRow = createElement('div', { className: 'pgm-folder-name-row' });

            const folderName = createElement('span', { className: 'pgm-folder-card-name', textContent: `${groupName} (${count})` });
            nameRow.appendChild(folderName);

            const manageBtn = createElement('button', {
                type: 'button',
                className: `${CLASSES.groupBtn} pgm-folder-manage menu_button`,
                innerHTML: '<i class="fa-solid fa-folder-open"></i>',
                title: 'Manage folder'
            });
            manageBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); openFolderManager(manageBtn, groupName); });
            manageBtn.addEventListener('mousedown', (e) => e.stopPropagation());
            nameRow.appendChild(manageBtn);

            nameBlock.appendChild(nameRow);

            // Row 2: Folder description (if any)
            const desc = settings.folderDescriptions[groupName] || '';
            if (desc) {
                const descRow = createElement('div', { className: 'pgm-folder-desc', textContent: desc });
                nameBlock.appendChild(descRow);
            }
        }

        // Hide description text outside name block
        fc.querySelectorAll('.character_description, .persona_description, .mes_block, .persona_title, .character_version').forEach(el => {
            el.style.display = 'none';
        });

        const img = fc.querySelector('img');
        if (img) { img.style.display = 'block'; img.style.visibility = 'visible'; img.style.opacity = '1'; img.removeAttribute('loading'); }

        fc.style.display = ''; fc.style.visibility = 'visible'; fc.style.opacity = '1';

        fc.addEventListener('click', (e) => {
            if (e.target.closest('.pgm-folder-manage')) return;
            e.preventDefault(); e.stopPropagation();
            currentFolderView = groupName;
            updatePanelView();
        });
        fc.addEventListener('mousedown', (e) => { if (!e.target.closest('.pgm-folder-manage')) e.preventDefault(); });

        return fc;
    }



    // --- Persona Card Buttons ---

    function updatePersonaCards() {
        getAvatarCards().forEach(card => {
            if (card.classList.contains(CLASSES.folderCard)) return;
            if (card.classList.contains(CLASSES.processed)) return;
            const avatarId = card.dataset.avatarId;
            if (!avatarId) return;
            const nameBlock = card.querySelector(SELECTORS.nameBlock);
            if (!nameBlock) return;

            nameBlock.querySelectorAll(`.${CLASSES.groupBtn}, .${CLASSES.tagBtn}`).forEach(b => b.remove());

            const folderBtn = createElement('button', { type: 'button', className: `${CLASSES.groupBtn} menu_button`, innerHTML: '<i class="fa-solid fa-folder"></i>', title: 'Manage folders' });
            folderBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); openGroupManager(folderBtn, avatarId); });
            folderBtn.addEventListener('mousedown', (e) => e.stopPropagation());

            const tagBtn = createElement('button', { type: 'button', className: `${CLASSES.tagBtn} menu_button`, innerHTML: '<i class="fa-solid fa-tags"></i>', title: 'Manage tags' });
            tagBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); openTagManager(tagBtn, avatarId); });
            tagBtn.addEventListener('mousedown', (e) => e.stopPropagation());

            const nameSpan = nameBlock.querySelector(SELECTORS.nameSpan);
            if (nameSpan) { nameSpan.insertAdjacentElement('afterend', tagBtn); nameSpan.insertAdjacentElement('afterend', folderBtn); }
            else { nameBlock.appendChild(folderBtn); nameBlock.appendChild(tagBtn); }

            card.classList.add(CLASSES.processed);
        });
    }


    // --- Group Helpers ---

    function getAllGroups() {
        const counts = {};
        Object.values(settings.personaGroups).forEach(groups => groups.forEach(g => { counts[g] = (counts[g] || 0) + 1; }));
        return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
    }

    function getPersonasInGroup(groupName) {
        const personas = [];
        for (const [avatarId, groups] of Object.entries(settings.personaGroups)) {
            if (groups.includes(groupName)) personas.push(avatarId);
        }
        return personas;
    }

    async function addPersonaToGroup(avatarId, groupName) {
        if (!settings.personaGroups[avatarId]) settings.personaGroups[avatarId] = [];
        if (!settings.personaGroups[avatarId].includes(groupName)) {
            settings.personaGroups[avatarId].push(groupName);
            await saveSettings();
        }
    }

    async function removePersonaFromGroup(avatarId, groupName) {
        if (!settings.personaGroups[avatarId]) return;
        const idx = settings.personaGroups[avatarId].indexOf(groupName);
        if (idx > -1) {
            settings.personaGroups[avatarId].splice(idx, 1);
            if (settings.personaGroups[avatarId].length === 0) delete settings.personaGroups[avatarId];
            await saveSettings();
        }
    }

    // --- Popover Helpers ---

    function closePopup() {
        const popup = document.getElementById(IDS.popover);
        const backdrop = document.getElementById(IDS.backdrop);
        if (popup && popup._cleanup) popup._cleanup();
        backdrop?.remove();
        popup?.remove();
    }

    function positionPopup(popup, anchor) {
        requestAnimationFrame(() => {
            const rect = anchor.getBoundingClientRect();
            const pr = popup.getBoundingClientRect();
            let left = rect.left + (rect.width / 2) - (pr.width / 2);
            let top = rect.bottom + 10;
            if (left + pr.width > window.innerWidth) left = window.innerWidth - pr.width - 10;
            if (left < 10) left = 10;
            if (top + pr.height > window.innerHeight) top = rect.top - pr.height - 10;
            if (top < 10) top = 10;
            popup.style.left = left + 'px';
            popup.style.top = top + 'px';
        });
    }

    function setupPopupEvents(popup, backdrop) {
        function handleKeydown(e) {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePopup(); }
        }
        document.addEventListener('keydown', handleKeydown);
        const stop = (e) => { e.stopPropagation(); };
        popup.addEventListener('click', stop);
        popup.addEventListener('mousedown', stop);
        popup.addEventListener('mouseup', stop);
        backdrop.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); });
        backdrop.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); });
        popup._cleanup = () => { document.removeEventListener('keydown', handleKeydown); };
    }

    // --- Popover: Group Manager (from persona card) ---

    function openGroupManager(anchor, avatarId) {
        closePopup();
        const backdrop = createElement('div', { id: IDS.backdrop, className: 'pgm-backdrop' });
        const popup = createElement('div', { id: IDS.popover, className: 'pgm-popover' });
        const title = createElement('div', { className: 'pgm-popover-title', textContent: 'Manage Folders' });
        const groupsList = createElement('div', { className: 'pgm-groups-list' });

        const addSection = createElement('div', { className: 'pgm-add-section' });
        const addInput = createElement('input', { type: 'text', placeholder: 'New folder name', className: 'pgm-add-input' });
        const addDescInput = createElement('input', { type: 'text', placeholder: 'Folder description (optional)', className: 'pgm-add-input' });
        const addBtn = createElement('button', { type: 'button', textContent: 'Add', className: 'pgm-add-btn menu_button' });
        const closeBtn = createElement('button', { type: 'button', textContent: 'Done', className: 'pgm-close-btn menu_button' });

        function renderGroups() {
            const personaGroups = settings.personaGroups[avatarId] || [];
            const allGroups = getAllGroups();
            groupsList.innerHTML = '';
            if (allGroups.length === 0) { groupsList.innerHTML = '<div class="pgm-empty">No folders available</div>'; return; }
            allGroups.forEach(({ name, count }) => {
                const isChecked = personaGroups.includes(name);
                const row = createElement('label', { className: 'pgm-group-row' });
                const cb = createElement('input', { type: 'checkbox', checked: isChecked });
                const ns = createElement('span', { className: 'pgm-group-name', textContent: name });
                const cs = createElement('span', { className: 'pgm-group-count', textContent: `(${count})` });
                cb.addEventListener('change', (e) => {
                    e.stopPropagation();
                    if (cb.checked) addPersonaToGroup(avatarId, name); else removePersonaFromGroup(avatarId, name);
                    setTimeout(() => { renderGroups(); resetProcessedFlags(); updatePanelView(); }, 50);
                });
                row.append(cb, ns, cs);
                groupsList.appendChild(row);
            });
        }

        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const gn = addInput.value.trim();
            if (!gn) return;
            const desc = addDescInput.value.trim();
            if (desc) { settings.folderDescriptions[gn] = desc; }
            addPersonaToGroup(avatarId, gn);
            addInput.value = ''; addDescInput.value = '';
            renderGroups(); resetProcessedFlags(); updatePanelView();
        });
        addInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addBtn.click(); }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePopup(); }
        });
        closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closePopup(); });

        addSection.append(addInput, addDescInput, addBtn);
        popup.append(title, groupsList, addSection, closeBtn);
        document.body.append(backdrop, popup);
        setupPopupEvents(popup, backdrop);
        positionPopup(popup, anchor);
        renderGroups();
    }

    // --- Popover: Folder Manager (from folder card) ---

    function openFolderManager(anchor, groupName) {
        closePopup();
        const backdrop = createElement('div', { id: IDS.backdrop, className: 'pgm-backdrop' });
        const popup = createElement('div', { id: IDS.popover, className: 'pgm-popover' });
        const title = createElement('div', { className: 'pgm-popover-title', textContent: `Manage Folder: ${groupName}` });

        // Editable folder name
        const nameSection = createElement('div', { className: 'pgm-add-section' });
        const nameLabel = createElement('div', { className: 'pgm-popover-subtitle', textContent: 'Folder Name:' });
        const nameInput = createElement('input', { type: 'text', value: groupName, className: 'pgm-add-input' });
        nameSection.append(nameLabel, nameInput);

        // Editable folder description
        const descSection = createElement('div', { className: 'pgm-add-section' });
        const descLabel = createElement('div', { className: 'pgm-popover-subtitle', textContent: 'Folder Description:' });
        const descInput = createElement('input', { type: 'text', value: settings.folderDescriptions[groupName] || '', className: 'pgm-add-input', placeholder: 'Optional description' });
        descSection.append(descLabel, descInput);

        const personasList = createElement('div', { className: 'pgm-groups-list' });
        const deleteBtn = createElement('button', { type: 'button', textContent: 'Delete Folder', className: 'menu_button pgm-delete-folder-btn' });
        const saveBtn = createElement('button', { type: 'button', textContent: 'Save & Close', className: 'pgm-close-btn menu_button' });
        const buttonRow = createElement('div', { className: 'pgm-button-row' });

        function renderPersonas() {
            const pigs = getPersonasInGroup(groupName);
            personasList.innerHTML = '';
            if (pigs.length === 0) { personasList.innerHTML = '<div class="pgm-empty">No personas in this folder</div>'; return; }
            pigs.forEach(avatarId => {
                const orig = originalPersonaCards.get(avatarId);
                if (!orig) return;
                const ne = orig.element.querySelector(SELECTORS.nameSpan);
                const pn = ne ? ne.textContent : avatarId;
                const row = createElement('div', { className: 'pgm-group-row pgm-persona-row' });
                const ns = createElement('span', { textContent: pn, className: 'pgm-group-name' });
                const rb = createElement('button', { type: 'button', textContent: 'Remove', className: 'menu_button pgm-remove-persona-btn' });
                rb.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removePersonaFromGroup(avatarId, groupName);
                    renderPersonas();
                    const rem = getPersonasInGroup(groupName);
                    if (rem.length === 0) { closePopup(); currentFolderView = null; updatePanelView(); }
                    else { resetProcessedFlags(); updatePanelView(); }
                });
                row.append(ns, rb);
                personasList.appendChild(row);
            });
        }

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Delete folder "${groupName}"? All personas will be ungrouped.`)) {
                getPersonasInGroup(groupName).forEach(id => removePersonaFromGroup(id, groupName));
                delete settings.folderDescriptions[groupName];
                saveSettings();
                closePopup(); currentFolderView = null; updatePanelView();
            }
        });

        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newName = nameInput.value.trim();
            const newDesc = descInput.value.trim();

            // Save description
            if (newDesc) settings.folderDescriptions[newName || groupName] = newDesc;
            else delete settings.folderDescriptions[newName || groupName];

            // Rename folder if name changed
            if (newName && newName !== groupName) {
                const personas = getPersonasInGroup(groupName);
                personas.forEach(id => {
                    removePersonaFromGroup(id, groupName);
                    addPersonaToGroup(id, newName);
                });
                // Move description to new name
                if (settings.folderDescriptions[groupName]) {
                    settings.folderDescriptions[newName] = settings.folderDescriptions[groupName];
                    delete settings.folderDescriptions[groupName];
                }
                if (currentFolderView === groupName) currentFolderView = newName;
            }

            saveSettings();
            closePopup();
            resetProcessedFlags();
            updatePanelView();
        });

        const personasLabel = createElement('div', { className: 'pgm-popover-subtitle', textContent: 'Personas in folder:' });
        buttonRow.append(deleteBtn, saveBtn);
        popup.append(title, nameSection, descSection, personasLabel, personasList, buttonRow);
        document.body.append(backdrop, popup);
        setupPopupEvents(popup, backdrop);
        positionPopup(popup, anchor);
        renderPersonas();
    }

    // --- Popover: Tag Manager ---

    function openTagManager(anchor, avatarId) {
        closePopup();
        const personaId = avatarId;
        const backdrop = createElement('div', { id: IDS.backdrop, className: 'pgm-backdrop' });
        const popup = createElement('div', { id: IDS.popover, className: 'pgm-popover' });
        const title = createElement('div', { className: 'pgm-popover-title', textContent: 'Manage Tags' });

        const assignedHeader = createElement('div', { className: 'pgm-popover-subtitle', textContent: 'Assigned Tags:' });
        const assignedContainer = createElement('div', { className: 'pgm-tags-container' });
        const availableHeader = createElement('div', { className: 'pgm-popover-subtitle', textContent: 'Available Global Tags:' });
        const availableContainer = createElement('div', { className: 'pgm-tags-container' });

        const addSection = createElement('div', { className: 'pgm-add-section pgm-tag-add-section' });
        const addInput = createElement('input', { type: 'text', placeholder: 'New tag title', className: 'pgm-add-input' });
        const addColor = createElement('input', { type: 'color', className: 'pgm-add-color' });
        addColor.value = generateRandomColor();

        const toggleColorBtn = createElement('button', { type: 'button', textContent: useLightColors ? 'Light' : 'Dark', className: 'pgm-add-btn menu_button' });
        toggleColorBtn.addEventListener('click', (e) => { e.stopPropagation(); useLightColors = !useLightColors; toggleColorBtn.textContent = useLightColors ? 'Light' : 'Dark'; addColor.value = generateRandomColor(); });

        const addBtn = createElement('button', { type: 'button', textContent: 'Add Tag', className: 'pgm-add-btn menu_button' });
        const closeBtn = createElement('button', { type: 'button', textContent: 'Done', className: 'pgm-close-btn menu_button' });


        function renderTagManager() {
            assignedContainer.innerHTML = '';
            availableContainer.innerHTML = '';
            const assignedTags = settings.persona_tag_map[personaId] || [];
            if (assignedTags.length === 0) {
                assignedContainer.innerHTML = '<div class="pgm-empty" style="padding:5px 0;font-size:12px;">No tags assigned</div>';
            } else {
                assignedTags.forEach(tagId => {
                    const tagObj = settings.persona_tags.find(t => t.id === tagId);
                    if (!tagObj) return;
                    const span = createElement('span', { className: 'persona-tag-label', textContent: '× ' + tagObj.name });
                    span.style.backgroundColor = tagObj.color;
                    span.style.cursor = 'pointer';
                    span.title = 'Click to remove';
                    span.addEventListener('click', (e) => {
                        e.stopPropagation();
                        settings.persona_tag_map[personaId] = assignedTags.filter(t => t !== tagObj.id);
                        saveSettings();
                        renderTagManager();
                        renderPersonaTagCards();
                        renderTagFilterBar();
                    });
                    assignedContainer.appendChild(span);
                });
            }
            if (settings.persona_tags.length === 0) {
                availableContainer.innerHTML = '<div class="pgm-empty" style="padding:5px 0;font-size:12px;">No global tags yet</div>';
            } else {
                settings.persona_tags.forEach(tag => {
                    const isAssigned = (settings.persona_tag_map[personaId] || []).includes(tag.id);
                    const usage = getTagUsageCount(tag.id);
                    const btn = createElement('button', { className: 'global-tag-btn interactable' });
                    btn.textContent = `${tag.name} (${usage})`;
                    btn.style.backgroundColor = tag.color;
                    btn.dataset.tagId = tag.id;
                    if (isAssigned) { btn.classList.add('active'); btn.style.outline = '2px solid #fff'; }
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        let pt = settings.persona_tag_map[personaId] || [];
                        if (pt.includes(tag.id)) pt = pt.filter(t => t !== tag.id); else pt.push(tag.id);
                        settings.persona_tag_map[personaId] = pt;
                        saveSettings();
                        renderTagManager();
                        renderPersonaTagCards();
                        renderTagFilterBar();
                    });
                    availableContainer.appendChild(btn);
                });
            }
        }

        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const tagTitle = addInput.value.trim();
            const tagColor = addColor.value || generateRandomColor();
            if (!tagTitle) return;
            const newId = 'tag_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            settings.persona_tags.push({ id: newId, name: tagTitle, color: tagColor });
            if (!settings.persona_tag_map[personaId]) settings.persona_tag_map[personaId] = [];
            settings.persona_tag_map[personaId].push(newId);
            saveSettings();
            addInput.value = '';
            addColor.value = generateRandomColor();
            renderTagManager();
            renderPersonaTagCards();
            renderTagFilterBar();
        });

        addInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addBtn.click(); }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePopup(); }
        });
        closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closePopup(); });

        addSection.append(addInput, addColor, toggleColorBtn, addBtn);
        popup.append(title, assignedHeader, assignedContainer, availableHeader, availableContainer, addSection, closeBtn);
        document.body.append(backdrop, popup);
        setupPopupEvents(popup, backdrop);
        positionPopup(popup, anchor);
        renderTagManager();
    }

    // ============================================
    // PERSONA TAGS (Filter Bar)
    // ============================================

    let selectedPersonaFilterTags = [];
    let filterBarExpanded = false;
    let tagFilterValue = '';
    let useLightColors = true;

    function getPersonaId(card) { return card.getAttribute('imgfile') || card.getAttribute('data-avatar-id'); }

    function getBrightness(rgb) { return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000; }

    function generateRandomDarkColor() {
        let c, b; do { const r=Math.floor(Math.random()*150),g=Math.floor(Math.random()*150),bl=Math.floor(Math.random()*150); c='#'+[r,g,bl].map(x=>x.toString(16).padStart(2,'0')).join(''); b=getBrightness([r,g,bl]); } while(b>128); return c;
    }
    function generateRandomLightColor() {
        let c, b; do { const r=Math.floor(Math.random()*106)+150,g=Math.floor(Math.random()*106)+150,bl=Math.floor(Math.random()*106)+150; c='#'+[r,g,bl].map(x=>x.toString(16).padStart(2,'0')).join(''); b=getBrightness([r,g,bl]); } while(b<200); return c;
    }
    function generateRandomColor() { return useLightColors ? generateRandomLightColor() : generateRandomDarkColor(); }

    function getTagUsageCount(tagId) {
        let c = 0; for (const p in settings.persona_tag_map) { if (settings.persona_tag_map[p].includes(tagId)) c++; } return c;
    }

    function cleanupUnusedGlobalTags() {
        let u = false;
        settings.persona_tags = settings.persona_tags.filter(tag => { if (getTagUsageCount(tag.id) === 0) { u = true; return false; } return true; });
        if (u) saveSettings();
    }

    function renderTagFilterBar() {
        const target = document.querySelector('#persona-management-block .flex-container.marginBot10.alignitemscenter');
        if (!target) return;
        const existing = document.getElementById('persona-tag-filter-bar');
        if (existing) existing.remove();

        const bar = createElement('div', { id: 'persona-tag-filter-bar' });
        const headerRow = createElement('div', { id: 'tag-filter-header' });

        const toggleBtn = createElement('button', { id: 'toggle-tag-filter', textContent: filterBarExpanded ? 'Hide Tags' : 'Show Tags', className: 'menu_button interactable' });
        toggleBtn.onclick = () => { filterBarExpanded = !filterBarExpanded; renderTagFilterBar(); };
        headerRow.appendChild(toggleBtn);

        if (selectedPersonaFilterTags.length > 0) {
            const clearBtn = createElement('button', { textContent: 'Clear Filters', className: 'menu_button interactable pgm-clear-filters-btn' });
            clearBtn.onclick = () => { selectedPersonaFilterTags = []; currentFolderView = null; renderTagFilterBar(); updatePanelView(); };
            headerRow.appendChild(clearBtn);
        }

        let tagContainer;
        if (filterBarExpanded) {
            const filterInput = createElement('input', { type: 'text', placeholder: 'Filter tags...', className: 'pt-tag-filter-input' });
            filterInput.value = tagFilterValue;
            filterInput.addEventListener('input', function () {
                tagFilterValue = filterInput.value;
                const v = filterInput.value.toLowerCase();
                if (tagContainer) Array.from(tagContainer.children).forEach(btn => { btn.style.display = btn.textContent.split(' (')[0].toLowerCase().includes(v) ? '' : 'none'; });
            });
            headerRow.appendChild(filterInput);
        }


        bar.appendChild(headerRow);

        if (filterBarExpanded) {
            tagContainer = createElement('div', { id: 'tag-filter-container' });
            tagContainer.style.marginTop = '5px';
            cleanupUnusedGlobalTags();
            settings.persona_tags.forEach(tag => {
                const btn = createElement('button', { className: 'persona-tag-btn interactable' });
                const isSel = selectedPersonaFilterTags.includes(tag.id);
                if (isSel) { btn.classList.add('selected'); }
                btn.textContent = `${tag.name} (${getTagUsageCount(tag.id)})`;
                btn.style.backgroundColor = tag.color;
                btn.dataset.tagId = tag.id;
                btn.onclick = () => {
                    if (selectedPersonaFilterTags.includes(tag.id)) selectedPersonaFilterTags = selectedPersonaFilterTags.filter(t => t !== tag.id);
                    else selectedPersonaFilterTags.push(tag.id);
                    renderTagFilterBar();
                    updatePanelView();
                };
                tagContainer.appendChild(btn);
            });
            if (tagFilterValue) {
                const fv = tagFilterValue.toLowerCase();
                Array.from(tagContainer.children).forEach(btn => { btn.style.display = btn.textContent.split(' (')[0].toLowerCase().includes(fv) ? '' : 'none'; });
            }
            bar.appendChild(tagContainer);
        }

        target.parentNode.insertBefore(bar, target.nextSibling);
        if (tagFilterValue && filterBarExpanded) { const fi = bar.querySelector('.pt-tag-filter-input'); if (fi) fi.focus(); }
    }

    function renderPersonaTagCards() {
        cleanupUnusedGlobalTags();
        document.querySelectorAll('.avatar-container.interactable').forEach(card => {
            if (card.classList.contains(CLASSES.folderCard)) return;
            const pid = getPersonaId(card);
            const old = card.querySelector('.persona-tag-labels');
            if (old) old.remove();
            const lc = createElement('div', { className: 'persona-tag-labels' });
            const at = settings.persona_tag_map[pid] || [];
            at.forEach(tagId => {
                const tagObj = settings.persona_tags.find(t => t.id === tagId);
                if (tagObj) {
                    const span = createElement('span', { className: 'persona-tag-label', textContent: tagObj.name });
                    span.style.backgroundColor = tagObj.color;
                    span.style.cursor = 'pointer';
                    span.onclick = (e) => {
                        e.stopPropagation();
                        if (selectedPersonaFilterTags.includes(tagObj.id)) selectedPersonaFilterTags = selectedPersonaFilterTags.filter(t => t !== tagObj.id);
                        else selectedPersonaFilterTags.push(tagObj.id);
                        renderTagFilterBar();
                        updatePanelView();
                    };
                    lc.appendChild(span);
                }
            });
            const nb = card.querySelector('.character_name_block');
            if (nb) nb.appendChild(lc);
        });
    }

    function initPersonaTags() {
        if (!isPersonaManagerVisible()) return;
        renderTagFilterBar();
        renderPersonaTagCards();
    }

    // ============================================
    // DATA MIGRATION
    // ============================================

    function migrateFromOldExtensions() {
        let migrated = false;
        const pgm = extensionSettings['personas'];
        if (pgm && !settings._migratedPGM) {
            if (pgm.personaGroups && Object.keys(pgm.personaGroups).length > 0) { settings.personaGroups = structuredClone(pgm.personaGroups); migrated = true; }
            settings._migratedPGM = true;
        }
        const gs = SillyTavern.getContext().settings || {};
        if (gs.persona_tag_map && !settings._migratedTags) {
            if (Object.keys(gs.persona_tag_map).length > 0) { settings.persona_tag_map = structuredClone(gs.persona_tag_map); migrated = true; }
            if (gs.persona_tags && Array.isArray(gs.persona_tags) && gs.persona_tags.length > 0) settings.persona_tags = structuredClone(gs.persona_tags);
            settings._migratedTags = true;
        }
        if (migrated) { saveSettings(); log('Migration complete'); }
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    const PersonaTools = { _personasModule: null };

    async function init() {
        log('Initializing PersonaTools v' + VERSION);
        settings = getSettings();
        await loadImports();
        migrateFromOldExtensions();
        addQuickPersonaButton();

        eventSource.on(event_types.CHAT_CHANGED, updateQuickPersonaButton);
        eventSource.on(event_types.SETTINGS_UPDATED, () => { updateQuickPersonaButton(); setTimeout(tryCreatePanelUI, 100); });

        $(document.body).on('click', (e) => {
            if (isQuickMenuOpen && !e.target.closest('#quickPersonaMenu') && !e.target.closest('#quickPersona')) closeQuickPersonaSelector();
        });

        setInterval(checkPersonaManager, 2000);

        const db = document.getElementById('persona-management-button');
        if (db) {
            db.addEventListener('click', () => {
                setTimeout(() => { if (isPersonaManagerVisible()) { tryCreatePanelUI(); initPersonaTags(); } }, 50);
                setTimeout(() => { if (isPersonaManagerVisible()) { tryCreatePanelUI(); initPersonaTags(); } }, 200);
                setTimeout(() => { if (isPersonaManagerVisible()) { tryCreatePanelUI(); initPersonaTags(); } }, 500);
            });
        }

        updateQuickPersonaButton();
        setTimeout(() => { tryCreatePanelUI(); initPersonaTags(); }, 50);
        setTimeout(() => { tryCreatePanelUI(); initPersonaTags(); }, 200);
        setTimeout(() => { tryCreatePanelUI(); initPersonaTags(); }, 500);
        setTimeout(() => { tryCreatePanelUI(); initPersonaTags(); }, 1000);

        log('PersonaTools initialized');
    }

    jQuery(async () => { try { await init(); } catch (e) { error('Fatal:', e); } });
})();

