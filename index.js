/**
 * PersonaTools — persona folders, tags and a quick switcher for SillyTavern.
 *
 * v2.0.0 architecture: instead of cloning and hiding SillyTavern's rendered
 * persona cards (which fought pagination, search and sorting), PersonaTools
 * injects a filter function into ST's own `personasFilter`. Folder and tag
 * views therefore filter the native list: cards stay fully native (locks,
 * default-persona star, selection), pagination paginates the filtered set,
 * and the built-in search box keeps working. PersonaTools only *adds* DOM:
 * folder cards at the top of the list, small per-card action buttons, tag
 * chips, a breadcrumb header and the quick-switcher menu.
 *
 * Author: LukaTheHero
 */
(() => {
    'use strict';

    const EXT_NAME = 'PersonaTools';
    const VERSION = '2.1.0';
    // PersonaTools' entry in personasFilter.filterFunctions. Namespaced to never
    // collide with ST's own FILTER_TYPES keys.
    const FILTER_KEY = 'personaTools__view';
    // ST's FILTER_TYPES.PERSONA_SEARCH — the key the native search box writes to.
    const ST_SEARCH_KEY = 'persona_search';

    const context = SillyTavern.getContext();
    const { extensionSettings, saveSettingsDebounced, eventSource, event_types, getThumbnailUrl } = context;

    let powerUser = context.powerUserSettings || null;
    let personasApi = null;   // module namespace of /scripts/personas.js (live bindings)

    function error(...args) { console.error(`[${EXT_NAME}]`, ...args); }

    // ============================================
    // DOM HELPERS (no HTML-string interpolation anywhere — persona names,
    // folder names, descriptions and tag names are all user-controlled)
    // ============================================

    /**
     * @param {string} tag
     * @param {{cls?: string, text?: string, title?: string, attrs?: Object.<string,string>, on?: Object.<string,Function>}} [opts]
     * @param {...(Node|string|null|undefined)} children
     */
    function el(tag, opts = {}, ...children) {
        const node = document.createElement(tag);
        if (opts.cls) node.className = opts.cls;
        if (opts.text !== undefined) node.textContent = opts.text;
        if (opts.title) node.title = opts.title;
        if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
        if (opts.on) for (const [k, v] of Object.entries(opts.on)) node.addEventListener(k, v);
        if (tag === 'button') {
            // ST's global keyboard handler (keyboard.js) synthesizes click() on
            // Enter for any .menu_button/.interactable ancestor without checking
            // defaultPrevented — on a native button that means double activation
            // (or activating the enclosing persona card). Stop the keydown from
            // bubbling; native button activation still fires exactly one click.
            node.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
            });
        }
        for (const child of children) {
            if (child === null || child === undefined) continue;
            node.append(child);
        }
        return node;
    }

    /** Font Awesome icon element. Class list is always a constant string. */
    function icon(faClasses) {
        return el('i', { cls: `fa-solid fa-fw ${faClasses}` });
    }

    function debounced(fn, ms) {
        let handle = null;
        return (...args) => {
            clearTimeout(handle);
            handle = setTimeout(() => fn(...args), ms);
        };
    }

    /** Thumbnail URL without cache busting — ST's server-side thumbnails are stable. */
    function thumbUrl(avatarId) {
        try { return getThumbnailUrl('persona', avatarId); }
        catch { return `/user/avatars/${encodeURIComponent(avatarId)}`; }
    }

    /**
     * Black or white text for a given hex background, so light tag colors stay
     * readable (v1 forced white text on pastel backgrounds).
     */
    function contrastColor(hex) {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
        if (!m) return '#fff';
        const n = parseInt(m[1], 16);
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? '#1a1a1a' : '#fff';
    }

    function styleTagChip(node, color) {
        node.style.backgroundColor = color;
        node.style.color = contrastColor(color);
    }

    // ============================================
    // SETTINGS
    // ============================================

    const defaultSettings = Object.freeze({
        personaGroups: {},        // avatarId -> [folderName]
        persona_tags: [],         // [{id, name, color}]
        persona_tag_map: {},      // avatarId -> [tagId]
        folderDescriptions: {},   // folderName -> description
        folderOrder: {},          // folderName -> [avatarId]
    });

    let settings = {};

    function getSettings() {
        if (!extensionSettings[EXT_NAME]) extensionSettings[EXT_NAME] = structuredClone(defaultSettings);
        for (const key of Object.keys(defaultSettings)) {
            if (!(key in extensionSettings[EXT_NAME])) extensionSettings[EXT_NAME][key] = structuredClone(defaultSettings[key]);
        }
        return extensionSettings[EXT_NAME];
    }

    function saveSettings() {
        saveSettingsDebounced();
    }

    async function migrateFromOldExtensions() {
        let migrated = false;
        const pgm = extensionSettings['personas'];
        if (pgm && !settings._migratedPGM) {
            if (pgm.personaGroups && Object.keys(pgm.personaGroups).length > 0 && Object.keys(settings.personaGroups).length === 0) {
                settings.personaGroups = structuredClone(pgm.personaGroups);
                migrated = true;
            }
            settings._migratedPGM = true;
        }
        // The old PersonaTags extension wrote into ST's global settings object,
        // which getContext() no longer exposes — read it from the module export.
        let gs = {};
        try { gs = (await import('/script.js')).settings || {}; } catch { /* older ST */ }
        if ((gs.persona_tag_map || gs.persona_tags) && !settings._migratedTags) {
            if (gs.persona_tag_map && Object.keys(gs.persona_tag_map).length > 0 && Object.keys(settings.persona_tag_map).length === 0) {
                settings.persona_tag_map = structuredClone(gs.persona_tag_map);
                migrated = true;
            }
            if (Array.isArray(gs.persona_tags) && gs.persona_tags.length > 0 && settings.persona_tags.length === 0) {
                settings.persona_tags = structuredClone(gs.persona_tags);
                migrated = true;
            }
            settings._migratedTags = true;
        }
        if (migrated) saveSettings();
    }

    /**
     * Drop descriptions and custom order lists of folders that no longer appear
     * in any persona's folder list, so an emptied folder's metadata can't
     * silently resurrect on a future folder with the same name.
     */
    function pruneOrphanDescriptions() {
        const live = new Set();
        for (const folders of Object.values(settings.personaGroups)) folders.forEach(f => live.add(f));
        let pruned = false;
        for (const name of Object.keys(settings.folderDescriptions)) {
            if (!live.has(name)) { delete settings.folderDescriptions[name]; pruned = true; }
        }
        for (const [name, order] of Object.entries(settings.folderOrder)) {
            if (!live.has(name) || !Array.isArray(order)) {
                delete settings.folderOrder[name];
                pruned = true;
            } else {
                const valid = order.filter(id => (settings.personaGroups[id] || []).includes(name));
                if (valid.length !== order.length) {
                    if (valid.length) settings.folderOrder[name] = valid;
                    else delete settings.folderOrder[name];
                    pruned = true;
                }
            }
        }
        if (pruned) saveSettings();
    }

    // ============================================
    // PERSONA DATA
    // ============================================

    function personaExists(avatarId) {
        return !!(powerUser && powerUser.personas && Object.hasOwn(powerUser.personas, avatarId));
    }

    function getPersonaName(avatarId) {
        return (powerUser && powerUser.personas && powerUser.personas[avatarId]) || avatarId;
    }

    function getPersonaTitle(avatarId) {
        return (powerUser && powerUser.persona_descriptions && powerUser.persona_descriptions[avatarId]?.title) || '';
    }

    function getCurrentAvatar() {
        return personasApi ? personasApi.user_avatar : null;
    }

    // ============================================
    // FOLDER DATA
    // ============================================

    function getFoldersOf(avatarId) {
        return settings.personaGroups[avatarId] || [];
    }

    function isGrouped(avatarId) {
        return getFoldersOf(avatarId).length > 0;
    }

    /**
     * Folder members in the user's custom order (falling back to ST's name sort
     * for members that haven't been explicitly ordered yet), ghosts excluded.
     */
    function getFolderMembers(folderName) {
        const memberSet = new Set();
        for (const [avatarId, folders] of Object.entries(settings.personaGroups)) {
            if (folders.includes(folderName) && personaExists(avatarId)) memberSet.add(avatarId);
        }
        if (!memberSet.size) return [];

        const savedOrder = Array.isArray(settings.folderOrder[folderName]) ? settings.folderOrder[folderName] : [];
        const ordered = [];
        const seen = new Set();
        for (const id of savedOrder) {
            if (memberSet.has(id) && !seen.has(id)) {
                ordered.push(id);
                seen.add(id);
            }
        }
        const remaining = [...memberSet].filter(id => !seen.has(id));
        if (remaining.length > 0) {
            const desc = powerUser && powerUser.persona_sort_order === 'desc';
            remaining.sort((a, b) => {
                const aName = String(getPersonaName(a));
                const bName = String(getPersonaName(b));
                return desc ? bName.localeCompare(aName) : aName.localeCompare(bName);
            });
            ordered.push(...remaining);
        }
        return ordered;
    }

    /**
     * Persist a new member order for `folderName`. If only a subset of the
     * folder is visible (e.g. pagination or tag filter active), the visible
     * subset is reordered into its existing slots while hidden members keep
     * their positions.
     */
    function setFolderMemberOrder(folderName, visibleOrderedIds) {
        if (!folderName || !Array.isArray(visibleOrderedIds) || visibleOrderedIds.length < 2) return;
        const full = getFolderMembers(folderName);
        const validVisible = visibleOrderedIds.filter(id => full.includes(id));
        const visibleSet = new Set(validVisible);
        if (visibleSet.size < 2) return;

        let cursor = 0;
        const nextOrder = full.map(id => visibleSet.has(id) ? validVisible[cursor++] : id);
        settings.folderOrder[folderName] = nextOrder;
        saveSettings();
    }

    function getAllFolders() {
        const names = new Set();
        for (const folders of Object.values(settings.personaGroups)) folders.forEach(f => names.add(f));
        return [...names]
            .map(name => ({ name, members: getFolderMembers(name) }))
            .filter(f => f.members.length > 0)
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }

    // Metadata of folders emptied this session, so an exploratory
    // uncheck/recheck in the folders popover doesn't lose the description
    // or custom ordering, while a truly abandoned folder can't resurrect
    // stale metadata on a future folder with the same name.
    const emptiedDescStash = new Map();
    const emptiedOrderStash = new Map();

    function addToFolder(avatarId, folderName) {
        if (!settings.personaGroups[avatarId]) settings.personaGroups[avatarId] = [];
        if (!settings.personaGroups[avatarId].includes(folderName)) {
            settings.personaGroups[avatarId].push(folderName);
            if (emptiedDescStash.has(folderName) && settings.folderDescriptions[folderName] === undefined) {
                settings.folderDescriptions[folderName] = emptiedDescStash.get(folderName);
                emptiedDescStash.delete(folderName);
            }
            if (emptiedOrderStash.has(folderName) && settings.folderOrder[folderName] === undefined) {
                settings.folderOrder[folderName] = emptiedOrderStash.get(folderName);
                emptiedOrderStash.delete(folderName);
            }
            if (Array.isArray(settings.folderOrder[folderName]) && !settings.folderOrder[folderName].includes(avatarId)) {
                settings.folderOrder[folderName].push(avatarId);
            }
            saveSettings();
        }
    }

    function folderStillReferenced(folderName) {
        return Object.values(settings.personaGroups).some(folders => folders.includes(folderName));
    }

    function removeFromFolder(avatarId, folderName) {
        const folders = settings.personaGroups[avatarId];
        if (!folders) return;
        const idx = folders.indexOf(folderName);
        if (idx > -1) {
            folders.splice(idx, 1);
            if (folders.length === 0) delete settings.personaGroups[avatarId];
            if (!folderStillReferenced(folderName)) {
                if (settings.folderDescriptions[folderName] !== undefined) {
                    emptiedDescStash.set(folderName, settings.folderDescriptions[folderName]);
                    delete settings.folderDescriptions[folderName];
                }
                if (settings.folderOrder[folderName] !== undefined) {
                    emptiedOrderStash.set(folderName, settings.folderOrder[folderName]);
                    delete settings.folderOrder[folderName];
                }
            } else if (Array.isArray(settings.folderOrder[folderName])) {
                settings.folderOrder[folderName] = settings.folderOrder[folderName].filter(id => id !== avatarId);
            }
            saveSettings();
        }
    }

    function renameFolder(oldName, newName) {
        if (!newName || newName === oldName) return;
        for (const folders of Object.values(settings.personaGroups)) {
            const idx = folders.indexOf(oldName);
            if (idx > -1) {
                if (folders.includes(newName)) folders.splice(idx, 1); // merging into an existing folder
                else folders[idx] = newName;
            }
        }
        if (settings.folderDescriptions[oldName] && !settings.folderDescriptions[newName]) {
            settings.folderDescriptions[newName] = settings.folderDescriptions[oldName];
        }
        delete settings.folderDescriptions[oldName];
        if (Array.isArray(settings.folderOrder[oldName])) {
            if (Array.isArray(settings.folderOrder[newName])) {
                for (const id of settings.folderOrder[oldName]) {
                    if (!settings.folderOrder[newName].includes(id)) settings.folderOrder[newName].push(id);
                }
            } else {
                settings.folderOrder[newName] = settings.folderOrder[oldName];
            }
        }
        delete settings.folderOrder[oldName];
        if (view.folder === oldName) view.folder = newName;
        saveSettings();
    }

    function deleteFolder(folderName) {
        for (const [avatarId, folders] of Object.entries(settings.personaGroups)) {
            const idx = folders.indexOf(folderName);
            if (idx > -1) {
                folders.splice(idx, 1);
                if (folders.length === 0) delete settings.personaGroups[avatarId];
            }
        }
        delete settings.folderDescriptions[folderName];
        delete settings.folderOrder[folderName];
        if (view.folder === folderName) view.folder = null;
        saveSettings();
    }

    // ============================================
    // TAG DATA
    // ============================================

    function getTag(tagId) {
        return settings.persona_tags.find(t => t.id === tagId);
    }

    function getTagsOf(avatarId) {
        return (settings.persona_tag_map[avatarId] || []).map(getTag).filter(Boolean);
    }

    function getTagUsage(tagId) {
        let count = 0;
        for (const [avatarId, tags] of Object.entries(settings.persona_tag_map)) {
            if (tags.includes(tagId) && personaExists(avatarId)) count++;
        }
        return count;
    }

    function createTag(name, color) {
        const tag = { id: `tag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name, color };
        settings.persona_tags.push(tag);
        saveSettings();
        return tag;
    }

    function deleteTag(tagId) {
        settings.persona_tags = settings.persona_tags.filter(t => t.id !== tagId);
        for (const [avatarId, tags] of Object.entries(settings.persona_tag_map)) {
            const next = tags.filter(t => t !== tagId);
            if (next.length) settings.persona_tag_map[avatarId] = next;
            else delete settings.persona_tag_map[avatarId];
        }
        view.tags = view.tags.filter(t => t !== tagId);
        view.excludeTags = view.excludeTags.filter(t => t !== tagId);
        saveSettings();
    }

    function toggleTagOn(avatarId, tagId) {
        const tags = settings.persona_tag_map[avatarId] || [];
        const next = tags.includes(tagId) ? tags.filter(t => t !== tagId) : [...tags, tagId];
        if (next.length) settings.persona_tag_map[avatarId] = next;
        else delete settings.persona_tag_map[avatarId];
        saveSettings();
    }

    function hasAllTags(avatarId, tagIds) {
        const assigned = settings.persona_tag_map[avatarId] || [];
        return tagIds.every(t => assigned.includes(t));
    }

    function hasAnyTag(avatarId, tagIds) {
        const assigned = settings.persona_tag_map[avatarId] || [];
        return tagIds.some(t => assigned.includes(t));
    }

    let lightColors = true;
    function randomTagColor() {
        const channel = () => lightColors ? 150 + Math.floor(Math.random() * 90) : 40 + Math.floor(Math.random() * 110);
        return '#' + [channel(), channel(), channel()].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    // ============================================
    // VIEW STATE + NATIVE FILTER INJECTION
    // ============================================

    const view = {
        folder: null,      // open folder name, or null for root
        tags: [],          // included tag-filter ids (AND semantics: must have all)
        excludeTags: [],   // excluded tag-filter ids (must have none)
    };

    function hasTagFilter() {
        return view.tags.length > 0 || view.excludeTags.length > 0;
    }

    /** True if the persona passes the current include/exclude tag filter. */
    function matchesTagFilter(avatarId) {
        return hasAllTags(avatarId, view.tags) && !hasAnyTag(avatarId, view.excludeTags);
    }

    /** @returns {'include'|'exclude'|null} */
    function getTagFilterState(tagId) {
        if (view.tags.includes(tagId)) return 'include';
        if (view.excludeTags.includes(tagId)) return 'exclude';
        return null;
    }

    function isSearchActive() {
        try {
            const term = personasApi.personasFilter.getFilterData(ST_SEARCH_KEY);
            return !!(term && String(term).trim().length);
        } catch { return false; }
    }

    /**
     * The filter ST runs while rendering the persona list. Receives the array
     * of avatar ids and returns the subset to display. Must never throw.
     */
    function personaToolsFilter(avatarIds) {
        try {
            if (!Array.isArray(avatarIds)) return avatarIds;
            let data = avatarIds;
            // Tag filters compose with the native search (AND)...
            if (hasTagFilter()) data = data.filter(matchesTagFilter);
            // ...but searching bypasses folder scoping, so it finds everything.
            if (isSearchActive()) return data;
            if (view.folder) {
                const allowed = new Set(data);
                const ordered = getFolderMembers(view.folder).filter(id => allowed.has(id));
                // ST's getUserAvatars() immediately runs sortPersonas(entities)
                // on the array returned by applyFilters(). Suppress that single
                // in-place .sort() call so the folder's custom order is preserved.
                Object.defineProperty(ordered, 'sort', {
                    value() {
                        delete this.sort;
                        return this;
                    },
                    configurable: true,
                });
                return ordered;
            }
            if (hasTagFilter()) return data;
            if (getAllFolders().length) return data.filter(id => !isGrouped(id));
            return data;
        } catch (e) {
            error('filter failed, passing through', e);
            return avatarIds;
        }
    }

    function installFilter() {
        personasApi.personasFilter.filterFunctions[FILTER_KEY] = personaToolsFilter;
    }

    function getPaginationPage() {
        try { return jQuery('#persona_pagination_container').pagination('getCurrentPageNum') || 1; }
        catch { return 1; }
    }

    function gotoPaginationPage(page) {
        try {
            const container = jQuery('#persona_pagination_container');
            const total = container.pagination('getTotalPage');
            const target = Math.max(1, Math.min(page, total || 1));
            if (container.pagination('getCurrentPageNum') !== target) container.pagination('go', target);
        } catch { /* pagination not initialized yet */ }
    }

    // The root list's page, remembered while a folder/tag view is open so
    // going back doesn't dump the user on a different page.
    let rootListPage = 1;

    /** Re-render ST's persona list through the filters, then re-decorate. */
    async function refreshList(page = 0) {
        try { await personasApi.getUserAvatars(true); }
        catch (e) { error('refreshList failed', e); }
        if (page > 0) gotoPaginationPage(page);
        scheduleDecorate();
    }
    const refreshListSoon = debounced(refreshList, 150);

    function isRootView() { return !view.folder && !hasTagFilter(); }

    /** Central view-state switch that keeps pagination positions sane. */
    function changeView(mutate) {
        const wasRoot = isRootView();
        if (wasRoot) rootListPage = getPaginationPage();
        mutate();
        const isRoot = isRootView();
        return refreshList(isRoot ? (wasRoot ? 0 : rootListPage) : 1);
    }

    // ============================================
    // DECORATION — folder cards, per-card buttons, tag chips, header
    // ============================================

    const SEL = {
        panel: '#persona-management-block',
        headerRow: '#persona-management-block .persona_management_left_column .flex-container.marginBot10.alignitemscenter',
        block: '#user_avatar_block',
        card: '.avatar-container',
        nameBlock: '.character_name_block',
    };

    let decorateQueued = false;
    let isDraggingPersona = false;
    let suppressClickUntil = 0;
    // Set when the user touches ST's change-image UI: ST refreshes the persona
    // thumbnail without emitting an event, so the quick button must force-reload
    // its (otherwise identical) image URL on the next re-render.
    let pendingAvatarRefresh = false;

    function scheduleDecorate() {
        if (decorateQueued || isDraggingPersona) return;
        decorateQueued = true;
        requestAnimationFrame(() => {
            decorateQueued = false;
            if (!isDraggingPersona) decorate();
        });
    }

    function decorate() {
        const block = document.querySelector(SEL.block);
        if (!block) return;
        block.classList.toggle('pt-folder-open', !!view.folder && !isSearchActive());
        renderFolderCards(block);
        decorateNativeCards(block);
        updateFolderHeader();
        renderTagBar();
        // With every persona foldered, the root list has zero native entries and
        // ST's pagination navigator renders a confusing "1-0 .. 0" — hide it.
        const panel = document.querySelector(SEL.panel);
        if (panel) {
            const hasNative = !!block.querySelector(`${SEL.card}:not(.pt-folder-card)`);
            const hasFolders = !!block.querySelector('.pt-folder-card');
            panel.classList.toggle('pt-root-empty', hasFolders && !hasNative);
        }
        if (pendingAvatarRefresh) {
            pendingAvatarRefresh = false;
            updateQuickButton(true);
        }
    }

    /**
     * True when a mutation batch needs a re-decorate. Our own decorate() pass
     * removes AND re-adds .pt-injected folder cards in one batch; a batch that
     * only REMOVES them is ST's empty() hitting a list with no native cards
     * (e.g. sort change while every persona is foldered) and must re-decorate,
     * or the panel would stay blank.
     */
    function hasForeignMutations(records) {
        if (isDraggingPersona) return false;
        let injectedAdded = false;
        let injectedRemoved = false;
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE || !node.classList.contains('pt-injected')) return true;
                injectedAdded = true;
            }
            for (const node of record.removedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE || !node.classList.contains('pt-injected')) return true;
                injectedRemoved = true;
            }
        }
        return injectedRemoved && !injectedAdded;
    }

    function startObserver() {
        const block = document.querySelector(SEL.block);
        if (!block) return;
        const observer = new MutationObserver((records) => {
            if (hasForeignMutations(records)) scheduleDecorate();
        });
        observer.observe(block, { childList: true });
    }

    // ============================================
    // DRAG-TO-REORDER (inside folders & folder editor)
    // ============================================

    /**
     * Enables click-and-hold / drag reordering on direct child items of `container`.
     * Translates the dragged item in place so all native ST styles and layouts
     * remain intact, while sibling items animate smoothly via FLIP.
     *
     * @param {HTMLElement} container
     * @param {{
     *   itemSelector: string,
     *   idAttr: string,
     *   canDrag: () => boolean,
     *   onReorder: (orderedIds: string[]) => void,
     * }} opts
     */
    function enableDragReorder(container, { itemSelector, idAttr, canDrag, onReorder }) {
        if (!container || container._ptDragReorderBound) return;
        container._ptDragReorderBound = true;

        const HOLD_DELAY_MS = 160;
        const MOUSE_DRAG_THRESHOLD_PX = 5;
        const TOUCH_CANCEL_THRESHOLD_PX = 8;
        const AUTO_SCROLL_EDGE_PX = 54;
        const AUTO_SCROLL_MAX_SPEED = 14;

        container.addEventListener('dragstart', (e) => {
            if (canDrag()) e.preventDefault();
        });

        function getLayoutRect(node, containerRect) {
            if (node.offsetParent === container) {
                return {
                    left: containerRect.left + container.clientLeft + node.offsetLeft - container.scrollLeft,
                    top: containerRect.top + container.clientTop + node.offsetTop - container.scrollTop,
                    width: node.offsetWidth,
                    height: node.offsetHeight,
                };
            }
            const r = node.getBoundingClientRect();
            return {
                left: r.left - (node._ptTx || 0),
                top: r.top - (node._ptTy || 0),
                width: r.width,
                height: r.height,
            };
        }

        container.addEventListener('pointerdown', (e) => {
            if (!canDrag() || e.button !== 0) return;
            if (e.target.closest('button, input, select, textarea, a, .pt-card-actions, .pt-tag-chip, .pt-folder-card')) return;
            const item = e.target.closest(itemSelector);
            if (!item || !container.contains(item)) return;

            const allItems = [...container.querySelectorAll(itemSelector)];
            if (allItems.length < 2) return;

            const pointerId = e.pointerId;
            const isMouse = e.pointerType === 'mouse';
            const startX = e.clientX;
            const startY = e.clientY;
            let curX = startX;
            let curY = startY;

            const initialRect = item.getBoundingClientRect();
            const grabOffsetX = startX - initialRect.left;
            const grabOffsetY = startY - initialRect.top;
            const initialNodes = allItems.slice();
            const initialIds = initialNodes.map(n => n.getAttribute(idAttr)).filter(Boolean);
            const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

            let dragging = false;
            let holdTimer = null;
            let scrollRaf = 0;

            function beginDrag() {
                if (dragging) return;
                dragging = true;
                isDraggingPersona = true;
                hideTooltip();
                try { window.getSelection()?.removeAllRanges(); } catch { /* ignore */ }

                item.classList.add('pt-dragging');
                container.classList.add('pt-is-reordering');
                document.body.classList.add('pt-grabbing');
                try { container.setPointerCapture(pointerId); } catch { /* ignore */ }

                updateDrag();
                scrollRaf = requestAnimationFrame(autoScrollTick);
            }

            function updateDrag() {
                if (!dragging) return;
                const isGrid = container.classList.contains('gridView');
                const containerRect = container.getBoundingClientRect();
                const desiredLeft = curX - grabOffsetX;
                const desiredTop = curY - grabOffsetY;
                const dragCenterX = desiredLeft + item.offsetWidth / 2;
                const dragCenterY = desiredTop + item.offsetHeight / 2;

                const siblings = [...container.querySelectorAll(itemSelector)].filter(n => n !== item);
                let refNode = null;
                for (const sib of siblings) {
                    const sr = getLayoutRect(sib, containerRect);
                    const sMidX = sr.left + sr.width / 2;
                    const sMidY = sr.top + sr.height / 2;
                    const sBottom = sr.top + sr.height;
                    if (!isGrid) {
                        if (dragCenterY < sMidY) { refNode = sib; break; }
                    } else {
                        if (dragCenterY < sr.top || (dragCenterY <= sBottom && dragCenterX < sMidX)) {
                            refNode = sib;
                            break;
                        }
                    }
                }

                if (refNode !== item.nextElementSibling && refNode !== item) {
                    const firstRects = reducedMotion
                        ? null
                        : new Map(siblings.map(s => [s, s.getBoundingClientRect()]));

                    container.insertBefore(item, refNode);

                    if (firstRects) {
                        for (const sib of siblings) {
                            const first = firstRects.get(sib);
                            const last = getLayoutRect(sib, containerRect);
                            const dx = first.left - last.left;
                            const dy = first.top - last.top;
                            if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
                                sib.style.transition = 'none';
                                sib.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
                                sib._ptTx = dx;
                                sib._ptTy = dy;
                                void sib.offsetHeight;
                                sib.style.transition = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)';
                                sib.style.transform = '';
                                sib._ptTx = 0;
                                sib._ptTy = 0;
                            }
                        }
                    }
                }

                const layout = getLayoutRect(item, containerRect);
                const tx = desiredLeft - layout.left;
                const ty = desiredTop - layout.top;
                item._ptTx = tx;
                item._ptTy = ty;
                item.style.transition = 'none';
                item.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
            }

            function autoScrollTick() {
                if (!dragging) return;
                const cr = container.getBoundingClientRect();
                let delta = 0;
                if (curY < cr.top + AUTO_SCROLL_EDGE_PX && container.scrollTop > 0) {
                    const ratio = Math.min(1, (cr.top + AUTO_SCROLL_EDGE_PX - curY) / AUTO_SCROLL_EDGE_PX);
                    delta = -Math.ceil(AUTO_SCROLL_MAX_SPEED * ratio * ratio);
                } else if (
                    curY > cr.bottom - AUTO_SCROLL_EDGE_PX &&
                    container.scrollTop < container.scrollHeight - container.clientHeight
                ) {
                    const ratio = Math.min(1, (curY - (cr.bottom - AUTO_SCROLL_EDGE_PX)) / AUTO_SCROLL_EDGE_PX);
                    delta = Math.ceil(AUTO_SCROLL_MAX_SPEED * ratio * ratio);
                }
                if (delta !== 0) {
                    const prev = container.scrollTop;
                    container.scrollTop += delta;
                    if (container.scrollTop !== prev) updateDrag();
                }
                scrollRaf = requestAnimationFrame(autoScrollTick);
            }

            function onPointerMove(ev) {
                if (ev.pointerId !== pointerId) return;
                curX = ev.clientX;
                curY = ev.clientY;
                if (!dragging) {
                    const dist = Math.hypot(curX - startX, curY - startY);
                    if (isMouse && dist >= MOUSE_DRAG_THRESHOLD_PX) {
                        clearTimeout(holdTimer);
                        holdTimer = null;
                        beginDrag();
                    } else if (!isMouse && dist >= TOUCH_CANCEL_THRESHOLD_PX) {
                        // Touch moved before hold threshold -> let native scroll proceed
                        cleanupListeners();
                    }
                    return;
                }
                ev.preventDefault();
                updateDrag();
            }

            function onPointerUp(ev) {
                if (ev.pointerId !== pointerId) return;
                finishDrag(false);
            }

            function onPointerCancel(ev) {
                if (ev.pointerId !== pointerId) return;
                finishDrag(true);
            }

            function onKeyDown(ev) {
                if (ev.key === 'Escape' && dragging) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    window.addEventListener('pointerup', () => { suppressClickUntil = Date.now() + 60; }, { once: true, capture: true });
                    finishDrag(true);
                }
            }

            function cleanupListeners() {
                clearTimeout(holdTimer);
                holdTimer = null;
                cancelAnimationFrame(scrollRaf);
                scrollRaf = 0;
                window.removeEventListener('pointermove', onPointerMove, true);
                window.removeEventListener('pointerup', onPointerUp, true);
                window.removeEventListener('pointercancel', onPointerCancel, true);
                window.removeEventListener('keydown', onKeyDown, true);
                try {
                    if (container.hasPointerCapture(pointerId)) container.releasePointerCapture(pointerId);
                } catch { /* ignore */ }
            }

            function finishDrag(cancelled) {
                const wasDragging = dragging;
                dragging = false;
                cleanupListeners();

                if (!wasDragging) return;

                // Suppress the synthetic click that follows pointerup so ST
                // doesn't switch the active persona when dropping a card.
                if (!cancelled) suppressClickUntil = Date.now() + 60;
                document.body.classList.remove('pt-grabbing');
                container.classList.remove('pt-is-reordering');

                if (cancelled) {
                    for (const node of initialNodes) container.append(node);
                } else {
                    const nextIds = [...container.querySelectorAll(itemSelector)]
                        .map(n => n.getAttribute(idAttr))
                        .filter(Boolean);
                    if (nextIds.some((id, i) => id !== initialIds[i])) {
                        onReorder(nextIds);
                    }
                }

                const clearStyles = () => {
                    item.classList.remove('pt-dragging');
                    for (const node of container.querySelectorAll(itemSelector)) {
                        node.style.transition = '';
                        node.style.transform = '';
                        node._ptTx = 0;
                        node._ptTy = 0;
                    }
                    isDraggingPersona = false;
                };

                if (reducedMotion || (!item._ptTx && !item._ptTy)) {
                    clearStyles();
                } else {
                    item.style.transition = 'transform 150ms cubic-bezier(0.2, 0, 0, 1), box-shadow 150ms ease';
                    item.style.transform = 'translate3d(0, 0, 0)';
                    item._ptTx = 0;
                    item._ptTy = 0;
                    setTimeout(clearStyles, 160);
                }
            }

            holdTimer = setTimeout(() => {
                holdTimer = null;
                beginDrag();
            }, HOLD_DELAY_MS);

            window.addEventListener('pointermove', onPointerMove, true);
            window.addEventListener('pointerup', onPointerUp, true);
            window.addEventListener('pointercancel', onPointerCancel, true);
            window.addEventListener('keydown', onKeyDown, true);
        });
    }

    function startCardReorder() {
        const block = document.querySelector(SEL.block);
        if (!block) return;
        enableDragReorder(block, {
            itemSelector: `${SEL.card}:not(.pt-folder-card)`,
            idAttr: 'data-avatar-id',
            canDrag: () => !!view.folder && !isSearchActive(),
            onReorder: (orderedIds) => {
                if (view.folder) setFolderMemberOrder(view.folder, orderedIds);
            },
        });
    }

    // --- Folder cards ---

    function renderFolderCards(block) {
        block.querySelectorAll('.pt-folder-card').forEach(n => n.remove());
        const showFolders = !view.folder && !hasTagFilter() && !isSearchActive();
        if (!showFolders) return;

        const fragment = document.createDocumentFragment();
        for (const { name, members } of getAllFolders()) {
            fragment.append(buildFolderCard(name, members));
        }
        block.prepend(fragment);
    }

    function buildFolderCard(name, members) {
        const stack = el('div', { cls: 'pt-folder-avatars' });
        for (const id of members.slice(0, 3)) {
            stack.append(el('img', { cls: 'pt-folder-thumb', attrs: { src: thumbUrl(id), alt: '', loading: 'lazy' } }));
        }
        stack.append(el('div', { cls: 'pt-folder-avatars-badge' }, icon('fa-folder')));

        const titleRow = el('div', { cls: 'pt-folder-title-row' },
            el('span', { cls: 'pt-folder-name', text: name }),
            el('span', { cls: 'pt-folder-count', text: String(members.length) }),
        );
        const body = el('div', { cls: 'pt-folder-body' }, titleRow);
        const desc = settings.folderDescriptions[name];
        if (desc) body.append(el('div', { cls: 'pt-folder-desc', text: desc }));

        const editBtn = el('button', {
            cls: 'pt-icon-btn pt-folder-edit', title: 'Edit folder',
            attrs: { type: 'button' },
            on: {
                click: (e) => { e.stopPropagation(); openFolderEditor(editBtn, name); },
                mousedown: (e) => e.stopPropagation(),
            },
        }, icon('fa-pen'));

        const open = () => changeView(() => { view.folder = name; });
        return el('div', {
            cls: 'pt-folder-card pt-injected',
            attrs: { role: 'button', tabindex: '0', 'data-folder': name },
            on: {
                click: open,
                keydown: (e) => {
                    if (e.target !== e.currentTarget) return; // let the edit button handle its own keys
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
                },
            },
        }, stack, body, editBtn);
    }

    // --- Native card buttons + tag chips ---

    function decorateNativeCards(block) {
        for (const card of block.querySelectorAll(`${SEL.card}:not(.pt-folder-card)`)) {
            const avatarId = card.getAttribute('data-avatar-id');
            if (!avatarId) continue;
            const nameBlock = card.querySelector(SEL.nameBlock);
            if (!nameBlock) continue;

            card.querySelectorAll('.pt-card-actions, .pt-card-tags').forEach(n => n.remove());

            const actions = el('span', { cls: 'pt-card-actions' },
                el('button', {
                    cls: 'pt-icon-btn', title: 'Folders', attrs: { type: 'button' },
                    on: {
                        click: (e) => { e.stopPropagation(); e.preventDefault(); openPersonaFolders(e.currentTarget, avatarId); },
                        mousedown: (e) => e.stopPropagation(),
                    },
                }, icon('fa-folder')),
                el('button', {
                    cls: 'pt-icon-btn', title: 'Tags', attrs: { type: 'button' },
                    on: {
                        click: (e) => { e.stopPropagation(); e.preventDefault(); openTagManager(e.currentTarget, avatarId); },
                        mousedown: (e) => e.stopPropagation(),
                    },
                }, icon('fa-tags')),
            );
            nameBlock.append(actions);

            const tags = getTagsOf(avatarId);
            if (tags.length) {
                const chips = el('div', { cls: 'pt-card-tags' });
                for (const tag of tags) {
                    const chip = el('span', {
                        cls: 'pt-tag-chip pt-tag-chip-small', text: tag.name,
                        title: 'Click: filter by this tag · Shift+click: hide personas with this tag',
                        on: {
                            click: (e) => { e.stopPropagation(); toggleTagFilter(tag.id, e.shiftKey ? 'exclude' : 'include'); },
                            mousedown: (e) => e.stopPropagation(),
                        },
                    });
                    styleTagChip(chip, tag.color);
                    chips.append(chip);
                }
                nameBlock.insertAdjacentElement('afterend', chips);
            }
        }
    }

    // --- Folder header (breadcrumb inside folder view) ---

    let folderHeader = null;

    function createFolderHeader() {
        const block = document.querySelector(SEL.block);
        if (!block || folderHeader) return;
        const backBtn = el('button', {
            cls: 'pt-back-btn menu_button', title: 'Back to all personas', attrs: { type: 'button' },
            on: { click: () => changeView(() => { view.folder = null; }) },
        }, icon('fa-arrow-left'));
        const title = el('div', { cls: 'pt-folder-header-title' });
        const editBtn = el('button', {
            cls: 'pt-icon-btn', title: 'Edit folder', attrs: { type: 'button' },
            on: { click: (e) => { if (view.folder) openFolderEditor(e.currentTarget, view.folder); } },
        }, icon('fa-pen'));
        folderHeader = el('div', { cls: 'pt-folder-header pt-hidden' }, backBtn, title, editBtn);
        block.parentNode.insertBefore(folderHeader, block);
    }

    function updateFolderHeader() {
        if (!folderHeader) return;
        const show = !!view.folder && !hasTagFilter() && !isSearchActive();
        folderHeader.classList.toggle('pt-hidden', !show);
        if (show) {
            const title = folderHeader.querySelector('.pt-folder-header-title');
            title.replaceChildren(
                icon('fa-folder-open'),
                el('span', { cls: 'pt-folder-header-name', text: view.folder }),
                el('span', { cls: 'pt-folder-count', text: String(getFolderMembers(view.folder).length) }),
            );
        }
    }

    // ============================================
    // TAG FILTER BAR
    // ============================================

    let tagBar = null;
    let tagToggleBtn = null;
    let tagBarExpanded = false;
    let tagSearchValue = '';

    /**
     * Set one tag's filter state; null clears it. A tag is never both
     * included and excluded.
     * @param {string} tagId
     * @param {'include'|'exclude'|null} state
     */
    function setTagFilter(tagId, state) {
        changeView(() => {
            view.tags = view.tags.filter(t => t !== tagId);
            view.excludeTags = view.excludeTags.filter(t => t !== tagId);
            if (state === 'include') view.tags.push(tagId);
            else if (state === 'exclude') view.excludeTags.push(tagId);
        });
        if (hasTagFilter()) tagBarExpanded = true;
        renderTagBar();
    }

    /** Filter-bar chips cycle like ST's own tag filter: off → include → exclude → off. */
    function cycleTagFilter(tagId) {
        const state = getTagFilterState(tagId);
        setTagFilter(tagId, state === null ? 'include' : state === 'include' ? 'exclude' : null);
    }

    /** Turn `mode` on for this tag, or off again if it is already in that mode. */
    function toggleTagFilter(tagId, mode = 'include') {
        setTagFilter(tagId, getTagFilterState(tagId) === mode ? null : mode);
    }

    const TAG_FILTER_TITLES = {
        none: 'Click to include · Shift+click to exclude',
        include: 'Included (personas must have this tag) · click to exclude instead',
        exclude: 'Excluded (personas with this tag are hidden) · click to clear',
    };

    function createTagBar() {
        const headerRow = document.querySelector(SEL.headerRow);
        if (!headerRow || tagBar) return;
        // The toggle lives inside ST's own header row (next to the search bar)
        // so the panel doesn't grow an extra control row; the chips expand below.
        tagToggleBtn = el('button', {
            cls: 'pt-tag-bar-toggle menu_button', title: 'Filter by tags',
            attrs: { type: 'button' },
            on: { click: () => { tagBarExpanded = !tagBarExpanded; renderTagBar(); } },
        });
        const searchBar = headerRow.querySelector('#persona_search_bar');
        if (searchBar) searchBar.insertAdjacentElement('afterend', tagToggleBtn);
        else headerRow.append(tagToggleBtn);
        tagBar = el('div', { cls: 'pt-tag-bar' });
        headerRow.insertAdjacentElement('afterend', tagBar);
        renderTagBar();
    }

    function renderTagBar() {
        if (!tagBar || !tagToggleBtn) return;

        const hasTags = settings.persona_tags.length > 0;
        const activeCount = view.tags.length + view.excludeTags.length;

        tagToggleBtn.classList.toggle('pt-hidden', !hasTags && !activeCount);
        tagToggleBtn.classList.toggle('pt-open', tagBarExpanded);
        const toggleKids = [icon('fa-tags'), el('span', { cls: 'pt-tag-toggle-label', text: 'Tags' })];
        if (activeCount) toggleKids.push(el('span', { cls: 'pt-tag-toggle-badge', text: String(activeCount) }));
        toggleKids.push(icon(`fa-chevron-${tagBarExpanded ? 'up' : 'down'} pt-chevron`));
        tagToggleBtn.replaceChildren(...toggleKids);

        tagBar.replaceChildren();
        if (!tagBarExpanded || (!hasTags && !activeCount)) { tagBar.classList.add('pt-hidden'); return; }
        tagBar.classList.remove('pt-hidden');

        const chips = el('div', { cls: 'pt-tag-bar-chips' });
        const renderChips = () => {
            chips.replaceChildren();
            const needle = tagSearchValue.trim().toLowerCase();
            for (const tag of [...settings.persona_tags].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))) {
                if (needle && !tag.name.toLowerCase().includes(needle)) continue;
                const state = getTagFilterState(tag.id);
                // Every chip carries a fixed-width state icon (○ off, ✓ include,
                // ⊘ exclude), so toggling never changes a chip's width and the
                // bar never reflows under the cursor.
                const stateIcon = state === 'include' ? 'fa-solid fa-check'
                    : state === 'exclude' ? 'fa-solid fa-ban'
                        : 'fa-regular fa-circle';
                const chip = el('button', {
                    cls: `pt-tag-chip${state === 'include' ? ' pt-selected' : ''}${state === 'exclude' ? ' pt-excluded' : ''}`,
                    title: TAG_FILTER_TITLES[state || 'none'],
                    attrs: { type: 'button', 'aria-pressed': state ? 'true' : 'false' },
                    on: { click: (e) => e.shiftKey ? toggleTagFilter(tag.id, 'exclude') : cycleTagFilter(tag.id) },
                },
                    el('i', { cls: `${stateIcon} fa-fw pt-tag-state`, attrs: { 'aria-hidden': 'true' } }),
                    el('span', { cls: 'pt-tag-chip-name', text: tag.name }),
                    el('span', { cls: 'pt-tag-chip-count', text: String(getTagUsage(tag.id)) }),
                );
                styleTagChip(chip, tag.color);
                chips.append(chip);
            }
            if (!chips.children.length) chips.append(el('div', { cls: 'pt-empty', text: needle ? 'No matching tags' : 'No tags yet' }));
        };

        const header = el('div', { cls: 'pt-tag-bar-header' });
        if (settings.persona_tags.length > 6) {
            header.append(el('input', {
                cls: 'pt-input pt-tag-bar-search',
                attrs: { type: 'search', placeholder: 'Filter tags…', value: tagSearchValue },
                on: { input: (e) => { tagSearchValue = e.target.value; renderChips(); } },
            }));
        }
        // The status line keeps the same layout with or without an active
        // filter (the Clear button is only made invisible), so the chips below
        // don't jump up or down when the first filter is set or cleared.
        const parts = [];
        if (view.tags.length) parts.push(`${view.tags.length} included`);
        if (view.excludeTags.length) parts.push(`${view.excludeTags.length} excluded`);
        header.append(activeCount
            ? el('span', { cls: 'pt-tag-bar-active', text: parts.join(' · ') })
            : el('span', { cls: 'pt-tag-bar-hint', text: 'Click a tag to include it, again to exclude it' }));
        const clearBtn = el('button', {
            cls: 'pt-clear-btn menu_button', attrs: { type: 'button' },
            on: { click: () => { changeView(() => { view.tags = []; view.excludeTags = []; }); renderTagBar(); } },
        }, icon('fa-xmark'), el('span', { text: 'Clear' }));
        if (!activeCount) {
            clearBtn.classList.add('pt-invisible');
            clearBtn.disabled = true;
            clearBtn.tabIndex = -1;
            clearBtn.setAttribute('aria-hidden', 'true');
        }
        header.append(clearBtn);
        if (header.children.length) tagBar.append(header);

        renderChips();
        tagBar.append(chips);
    }

    // ============================================
    // POPOVERS
    // ============================================

    let activePopover = null;

    function closePopover() {
        if (!activePopover) return;
        activePopover.cleanup();
        activePopover = null;
    }

    /**
     * Anchored popover with backdrop. Esc or backdrop click closes it.
     * Returns the body element for content.
     */
    function openPopover(anchor, titleText, titleIcon) {
        closePopover();
        // Swallow the backdrop's pointer events entirely: if the click bubbled
        // to document, ST would treat it as an outside click and close the
        // whole persona-management drawer along with the popover.
        const backdrop = el('div', {
            cls: 'pt-backdrop',
            on: {
                click: (e) => { e.stopPropagation(); e.preventDefault(); closePopover(); },
                mousedown: (e) => { e.stopPropagation(); e.preventDefault(); },
                mouseup: (e) => e.stopPropagation(),
            },
        });
        const header = el('div', { cls: 'pt-popover-header' },
            icon(titleIcon),
            el('span', { cls: 'pt-popover-title', text: titleText }),
            el('button', { cls: 'pt-icon-btn', title: 'Close', attrs: { type: 'button' }, on: { click: () => closePopover() } }, icon('fa-xmark')),
        );
        const body = el('div', { cls: 'pt-popover-body' });
        const popover = el('div', {
            cls: 'pt-popover',
            attrs: { role: 'dialog' },
            on: { click: (e) => e.stopPropagation(), mousedown: (e) => e.stopPropagation() },
        }, header, body);

        const onKeydown = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePopover(); }
        };
        document.addEventListener('keydown', onKeydown, true);
        document.body.append(backdrop, popover);

        requestAnimationFrame(() => {
            const rect = anchor.getBoundingClientRect();
            const pr = popover.getBoundingClientRect();
            let left = rect.left + rect.width / 2 - pr.width / 2;
            let top = rect.bottom + 8;
            left = Math.max(8, Math.min(left, window.innerWidth - pr.width - 8));
            if (top + pr.height > window.innerHeight - 8) top = Math.max(8, rect.top - pr.height - 8);
            popover.style.left = `${left}px`;
            popover.style.top = `${top}px`;
            popover.classList.add('pt-positioned');
        });

        activePopover = {
            cleanup: () => {
                document.removeEventListener('keydown', onKeydown, true);
                backdrop.remove();
                popover.remove();
            },
        };
        return body;
    }

    /** A button that requires a second click within 3s to confirm. */
    function confirmButton(labelText, confirmText, onConfirm) {
        let armed = false;
        let timer = null;
        const label = el('span', { text: labelText });
        const btn = el('button', {
            cls: 'pt-danger-btn menu_button', attrs: { type: 'button' },
            on: {
                click: () => {
                    if (!armed) {
                        armed = true;
                        btn.classList.add('pt-armed');
                        label.textContent = confirmText;
                        timer = setTimeout(() => { armed = false; btn.classList.remove('pt-armed'); label.textContent = labelText; }, 3000);
                    } else {
                        clearTimeout(timer);
                        onConfirm();
                    }
                },
            },
        }, icon('fa-trash-can'), label);
        return btn;
    }

    // --- Popover: folders of one persona ---

    function openPersonaFolders(anchor, avatarId) {
        const body = openPopover(anchor, `Folders — ${getPersonaName(avatarId)}`, 'fa-folder-tree');
        const list = el('div', { cls: 'pt-popover-list' });

        // Includes folders that exist only in settings (still assembling).
        function getAllFolderNames() {
            const names = new Set();
            for (const folders of Object.values(settings.personaGroups)) folders.forEach(f => names.add(f));
            return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        }

        function render() {
            list.replaceChildren();
            const memberOf = getFoldersOf(avatarId);
            const folders = getAllFolderNames();
            if (!folders.length) {
                list.append(el('div', { cls: 'pt-empty', text: 'No folders yet — create one below' }));
                return;
            }
            for (const name of folders) {
                const checkbox = el('input', { attrs: { type: 'checkbox' } });
                checkbox.checked = memberOf.includes(name);
                checkbox.addEventListener('change', () => {
                    if (checkbox.checked) addToFolder(avatarId, name);
                    else removeFromFolder(avatarId, name);
                    render();
                    refreshListSoon();
                });
                list.append(el('label', { cls: 'pt-check-row' },
                    checkbox,
                    el('span', { cls: 'pt-check-row-name', text: name }),
                    el('span', { cls: 'pt-check-row-count', text: String(getFolderMembers(name).length) }),
                ));
            }
        }

        const nameInput = el('input', { cls: 'pt-input', attrs: { type: 'text', placeholder: 'New folder name' } });
        const descInput = el('input', { cls: 'pt-input', attrs: { type: 'text', placeholder: 'Description (optional)' } });
        const addBtn = el('button', {
            cls: 'pt-primary-btn menu_button', attrs: { type: 'button' },
            on: {
                click: () => {
                    const name = nameInput.value.trim();
                    if (!name) { nameInput.focus(); return; }
                    const desc = descInput.value.trim();
                    if (desc) settings.folderDescriptions[name] = desc;
                    addToFolder(avatarId, name);
                    nameInput.value = ''; descInput.value = '';
                    render();
                    refreshListSoon();
                },
            },
        }, icon('fa-plus'), el('span', { text: 'Create' }));
        nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); } });

        body.append(
            list,
            el('div', { cls: 'pt-popover-section-title', text: 'New folder' }),
            el('div', { cls: 'pt-form-row' }, nameInput, addBtn),
            descInput,
        );
        render();
    }

    // --- Popover: edit one folder ---

    function openFolderEditor(anchor, folderName) {
        const body = openPopover(anchor, `Edit folder — ${folderName}`, 'fa-folder-open');

        const nameInput = el('input', { cls: 'pt-input', attrs: { type: 'text' } });
        nameInput.value = folderName;
        const descInput = el('input', { cls: 'pt-input', attrs: { type: 'text', placeholder: 'Description (optional)' } });
        descInput.value = settings.folderDescriptions[folderName] || '';

        const list = el('div', { cls: 'pt-popover-list pt-member-list' });
        function renderMembers() {
            list.replaceChildren();
            const members = getFolderMembers(folderName);
            if (!members.length) {
                list.append(el('div', { cls: 'pt-empty', text: 'No personas in this folder' }));
                return;
            }
            for (const avatarId of members) {
                const title = getPersonaTitle(avatarId);
                const info = el('div', { cls: 'pt-member-info' },
                    el('span', { cls: 'pt-member-name', text: getPersonaName(avatarId) }),
                    title ? el('span', { cls: 'pt-member-title', text: title }) : null,
                );
                list.append(el('div', { cls: 'pt-member-row', attrs: { 'data-avatar-id': avatarId } },
                    el('span', { cls: 'pt-member-grip', title: 'Drag to reorder' }, icon('fa-grip-vertical')),
                    el('img', { cls: 'pt-member-thumb', attrs: { src: thumbUrl(avatarId), alt: '', loading: 'lazy' } }),
                    info,
                    el('button', {
                        cls: 'pt-icon-btn', title: 'Remove from folder', attrs: { type: 'button' },
                        on: {
                            click: () => {
                                removeFromFolder(avatarId, folderName);
                                renderMembers();
                                refreshListSoon();
                                if (!getFolderMembers(folderName).length && view.folder === folderName) {
                                    view.folder = null;
                                    closePopover();
                                }
                            },
                        },
                    }, icon('fa-xmark')),
                ));
            }
        }

        enableDragReorder(list, {
            itemSelector: '.pt-member-row',
            idAttr: 'data-avatar-id',
            canDrag: () => true,
            onReorder: (orderedIds) => {
                setFolderMemberOrder(folderName, orderedIds);
                refreshListSoon();
            },
        });

        const initialDesc = settings.folderDescriptions[folderName] || '';
        const saveBtn = el('button', {
            cls: 'pt-primary-btn menu_button', attrs: { type: 'button' },
            on: {
                click: () => {
                    const newName = nameInput.value.trim() || folderName;
                    const typedDesc = descInput.value.trim();
                    // Rename first, then write the description under the FINAL name
                    // (v1 wrote the new description before renaming, then clobbered
                    // it with the old one while moving keys). Only write when the
                    // user actually edited the field, so merging into an existing
                    // folder doesn't overwrite that folder's description with
                    // this one's untouched prefill.
                    renameFolder(folderName, newName);
                    if (typedDesc !== initialDesc) {
                        if (typedDesc) settings.folderDescriptions[newName] = typedDesc;
                        else delete settings.folderDescriptions[newName];
                    }
                    saveSettings();
                    closePopover();
                    refreshList();
                },
            },
        }, icon('fa-check'), el('span', { text: 'Save' }));

        const deleteBtn = confirmButton('Delete folder', 'Really delete?', () => {
            closePopover();
            changeView(() => deleteFolder(folderName));
        });

        body.append(
            el('div', { cls: 'pt-popover-section-title', text: 'Name' }),
            nameInput,
            el('div', { cls: 'pt-popover-section-title', text: 'Description' }),
            descInput,
            el('div', { cls: 'pt-popover-section-title', text: 'Personas' }),
            list,
            el('div', { cls: 'pt-popover-footer' }, deleteBtn, saveBtn),
        );
        renderMembers();
    }

    // --- Popover: tags of one persona ---

    function openTagManager(anchor, avatarId) {
        const body = openPopover(anchor, `Tags — ${getPersonaName(avatarId)}`, 'fa-tags');

        const assigned = el('div', { cls: 'pt-chip-group' });
        const available = el('div', { cls: 'pt-chip-group' });

        function render() {
            assigned.replaceChildren();
            const tags = getTagsOf(avatarId);
            if (!tags.length) assigned.append(el('div', { cls: 'pt-empty', text: 'No tags assigned' }));
            for (const tag of tags) {
                const chip = el('button', {
                    cls: 'pt-tag-chip', title: 'Remove from persona', attrs: { type: 'button' },
                    on: { click: () => { toggleTagOn(avatarId, tag.id); render(); scheduleDecorate(); } },
                }, el('span', { text: tag.name }), icon('fa-xmark'));
                styleTagChip(chip, tag.color);
                assigned.append(chip);
            }

            available.replaceChildren();
            if (!settings.persona_tags.length) available.append(el('div', { cls: 'pt-empty', text: 'No tags yet — create one below' }));
            for (const tag of [...settings.persona_tags].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))) {
                const isAssigned = (settings.persona_tag_map[avatarId] || []).includes(tag.id);
                const chip = el('button', {
                    cls: `pt-tag-chip${isAssigned ? ' pt-selected' : ''}`, attrs: { type: 'button' },
                    on: { click: () => { toggleTagOn(avatarId, tag.id); render(); scheduleDecorate(); } },
                }, el('span', { text: tag.name }), el('span', { cls: 'pt-tag-chip-count', text: String(getTagUsage(tag.id)) }));
                styleTagChip(chip, tag.color);
                const del = el('button', {
                    cls: 'pt-chip-delete', title: 'Delete tag everywhere', attrs: { type: 'button' },
                    on: {
                        click: (e) => {
                            e.stopPropagation();
                            if (del.classList.contains('pt-armed')) {
                                const wasFiltering = getTagFilterState(tag.id) !== null;
                                deleteTag(tag.id);
                                render(); scheduleDecorate(); renderTagBar();
                                if (wasFiltering) refreshListSoon();
                            } else {
                                del.classList.add('pt-armed');
                                setTimeout(() => del.classList.remove('pt-armed'), 3000);
                            }
                        },
                    },
                }, icon('fa-trash-can'));
                del.style.color = contrastColor(tag.color);
                chip.append(del);
                available.append(chip);
            }
        }

        const nameInput = el('input', { cls: 'pt-input', attrs: { type: 'text', placeholder: 'New tag name' } });
        const colorInput = el('input', { cls: 'pt-color-input', attrs: { type: 'color' } });
        colorInput.value = randomTagColor();
        const shuffleBtn = el('button', {
            cls: 'pt-icon-btn', title: 'Random color', attrs: { type: 'button' },
            on: { click: () => { colorInput.value = randomTagColor(); } },
        }, icon('fa-shuffle'));
        const lightDarkBtn = el('button', {
            cls: 'pt-icon-btn', title: 'Toggle light/dark palette', attrs: { type: 'button' },
            on: {
                click: (e) => {
                    lightColors = !lightColors;
                    e.currentTarget.replaceChildren(icon(lightColors ? 'fa-sun' : 'fa-moon'));
                    colorInput.value = randomTagColor();
                },
            },
        }, icon(lightColors ? 'fa-sun' : 'fa-moon'));
        const addBtn = el('button', {
            cls: 'pt-primary-btn menu_button', attrs: { type: 'button' },
            on: {
                click: () => {
                    const name = nameInput.value.trim();
                    if (!name) { nameInput.focus(); return; }
                    const tag = createTag(name, colorInput.value);
                    toggleTagOn(avatarId, tag.id);
                    nameInput.value = '';
                    colorInput.value = randomTagColor();
                    render();
                    scheduleDecorate();
                    renderTagBar();
                },
            },
        }, icon('fa-plus'), el('span', { text: 'Add' }));
        nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); } });

        body.append(
            el('div', { cls: 'pt-popover-section-title', text: 'Assigned' }),
            assigned,
            el('div', { cls: 'pt-popover-section-title', text: 'All tags' }),
            available,
            el('div', { cls: 'pt-popover-section-title', text: 'New tag' }),
            el('div', { cls: 'pt-form-row' }, nameInput, colorInput, shuffleBtn, lightDarkBtn, addBtn),
        );
        render();
    }

    // ============================================
    // TOOLTIP
    // ============================================

    let tooltip = null;
    let tooltipTimer = null;

    function showTooltip(target, name, title) {
        if (!tooltip) {
            tooltip = el('div', { cls: 'pt-tooltip' }, el('div', { cls: 'pt-tooltip-name' }), el('div', { cls: 'pt-tooltip-title' }));
            document.body.append(tooltip);
        }
        tooltip.querySelector('.pt-tooltip-name').textContent = name;
        const titleNode = tooltip.querySelector('.pt-tooltip-title');
        titleNode.textContent = title || '';
        titleNode.classList.toggle('pt-hidden', !title);

        clearTimeout(tooltipTimer);
        tooltipTimer = setTimeout(() => {
            if (!target.isConnected) return;
            const rect = target.getBoundingClientRect();
            tooltip.classList.add('pt-visible');
            const tr = tooltip.getBoundingClientRect();
            let left = rect.right + 10;
            let top = rect.top + rect.height / 2 - tr.height / 2;
            if (left + tr.width > window.innerWidth - 8) left = rect.left - tr.width - 10;
            top = Math.max(8, Math.min(top, window.innerHeight - tr.height - 8));
            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
        }, 350);
    }

    function hideTooltip() {
        clearTimeout(tooltipTimer);
        if (tooltip) tooltip.classList.remove('pt-visible');
    }

    // ============================================
    // QUICK PERSONA SWITCHER
    // ============================================

    let quickMenu = null;
    let quickMenuKeyHandler = null;

    function addQuickButton() {
        if (document.getElementById('quickPersona')) return;
        const img = el('img', { cls: 'pt-quick-img', attrs: { id: 'quickPersonaImg', src: '/img/ai4.png', alt: 'Persona' } });
        const caret = el('div', { cls: 'pt-quick-caret fa-solid fa-caret-up fa-fw', attrs: { id: 'quickPersonaCaret' } });
        const btn = el('div', {
            cls: 'interactable pt-quick-btn',
            attrs: { id: 'quickPersona', tabindex: '0' },
            on: {
                click: () => toggleQuickMenu(),
                // stopPropagation: ST's global keyboard handler would synthesize a
                // second click on this .interactable div, toggling the menu twice.
                keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleQuickMenu(); } },
                mouseenter: () => {
                    const cur = getCurrentAvatar();
                    if (cur && !quickMenu) showTooltip(btn, getPersonaName(cur), getPersonaTitle(cur));
                },
                mouseleave: hideTooltip,
            },
        }, img, caret);
        const form = document.getElementById('leftSendForm');
        if (form) form.append(btn);
    }

    function updateQuickButton(force = false) {
        const img = document.getElementById('quickPersonaImg');
        if (!img) return;
        const cur = getCurrentAvatar();
        if (!cur) return;
        const src = thumbUrl(cur);
        if (force === true) {
            // Re-read the (server-refreshed) HTTP cache entry after an image change.
            img.removeAttribute('src');
            img.setAttribute('src', src);
        } else if (img.getAttribute('src') !== src) {
            img.setAttribute('src', src);
        }
        const title = getPersonaTitle(cur);
        img.title = title ? `${getPersonaName(cur)} — ${title}` : getPersonaName(cur);
    }

    async function toggleQuickMenu() {
        if (quickMenu) { closeQuickMenu(); return; }
        await openQuickMenu();
    }

    function closeQuickMenu() {
        if (!quickMenu) return;
        const menu = quickMenu;
        quickMenu = null;
        if (quickMenuKeyHandler) { document.removeEventListener('keydown', quickMenuKeyHandler, true); quickMenuKeyHandler = null; }
        menu.classList.remove('pt-open');
        document.getElementById('quickPersonaCaret')?.classList.replace('fa-caret-down', 'fa-caret-up');
        hideTooltip();
        setTimeout(() => menu.remove(), 180);
    }

    async function openQuickMenu() {
        if (!personasApi) return;
        hideTooltip(); // cancel the quick button's pending hover tooltip
        let avatars = [];
        try { avatars = await personasApi.getUserAvatars(false) || []; }
        catch (e) { error('failed to fetch avatars', e); return; }
        if (quickMenu) return; // double-toggle while awaiting

        const current = getCurrentAvatar();
        const menu = el('div', { cls: 'pt-quick-menu', attrs: { id: 'quickPersonaMenu', role: 'menu' } });
        const list = el('div', { cls: 'pt-quick-list' });
        const rows = []; // flat list of rows for keyboard nav
        let activeIdx = -1;

        function setActive(idx) {
            if (rows[activeIdx]) rows[activeIdx].classList.remove('pt-active');
            activeIdx = idx;
            if (rows[activeIdx]) {
                rows[activeIdx].classList.add('pt-active');
                rows[activeIdx].scrollIntoView({ block: 'nearest' });
            }
        }

        function personaRow(avatarId, indent = false) {
            const name = getPersonaName(avatarId);
            const title = getPersonaTitle(avatarId);
            const isCurrent = avatarId === current;
            const row = el('div', {
                cls: `pt-quick-row${isCurrent ? ' pt-current' : ''}${indent ? ' pt-indent' : ''}`,
                attrs: { role: 'menuitem', 'data-search': `${name} ${title}`.toLowerCase() },
                on: {
                    click: async () => {
                        closeQuickMenu();
                        try { await personasApi.setUserAvatar(avatarId); } catch (e) { error('setUserAvatar failed', e); }
                        updateQuickButton();
                    },
                    mouseenter: () => showTooltip(row, name, title),
                    mouseleave: hideTooltip,
                },
            },
                el('img', { cls: 'pt-quick-avatar', attrs: { src: thumbUrl(avatarId), alt: '', loading: 'lazy' } }),
                el('div', { cls: 'pt-quick-info' },
                    el('div', { cls: 'pt-quick-name', text: name }),
                    title ? el('div', { cls: 'pt-quick-sub', text: title }) : null,
                ),
                isCurrent ? el('div', { cls: 'pt-quick-check' }, icon('fa-check')) : null,
            );
            return row;
        }

        const availableSet = new Set(avatars);
        const folders = getAllFolders()
            .map(f => ({ ...f, members: f.members.filter(id => availableSet.has(id)) }))
            .filter(f => f.members.length > 0);
        const grouped = new Set(folders.flatMap(f => f.members));
        const ungrouped = avatars.filter(id => !grouped.has(id));

        for (const folder of folders) {
            const memberRows = [];
            const expandedByDefault = folder.members.includes(current);
            const folderRow = el('div', {
                cls: `pt-quick-row pt-quick-folder${expandedByDefault ? ' pt-expanded' : ''}`,
                attrs: { role: 'menuitem', 'data-search': `${folder.name} ${settings.folderDescriptions[folder.name] || ''}`.toLowerCase() },
                on: {
                    click: () => {
                        const expanded = folderRow.classList.toggle('pt-expanded');
                        memberRows.forEach(r => r.classList.toggle('pt-hidden', !expanded));
                    },
                },
            },
                el('div', { cls: 'pt-quick-folder-preview' },
                    el('img', { cls: 'pt-quick-avatar', attrs: { src: thumbUrl(folder.members[0]), alt: '', loading: 'lazy' } }),
                    el('div', { cls: 'pt-quick-folder-badge' }, icon('fa-folder')),
                ),
                el('div', { cls: 'pt-quick-info' },
                    el('div', { cls: 'pt-quick-name', text: folder.name }),
                    settings.folderDescriptions[folder.name] ? el('div', { cls: 'pt-quick-sub', text: settings.folderDescriptions[folder.name] }) : null,
                ),
                el('span', { cls: 'pt-quick-count', text: String(folder.members.length) }),
                icon('fa-chevron-right pt-chevron'),
            );
            list.append(folderRow);
            rows.push(folderRow);
            for (const id of folder.members) {
                const row = personaRow(id, true);
                if (!expandedByDefault) row.classList.add('pt-hidden');
                memberRows.push(row);
                list.append(row);
                rows.push(row);
            }
        }

        if (folders.length && ungrouped.length) list.append(el('div', { cls: 'pt-quick-separator' }));
        for (const id of ungrouped) {
            const row = personaRow(id);
            list.append(row);
            rows.push(row);
        }

        function isRowFolderExpanded(memberRow) {
            let node = memberRow.previousElementSibling;
            while (node) {
                if (node.classList.contains('pt-quick-folder')) return node.classList.contains('pt-expanded');
                node = node.previousElementSibling;
            }
            return false;
        }

        const searchInput = el('input', {
            cls: 'pt-input pt-quick-search',
            attrs: { type: 'search', placeholder: 'Search personas…' },
            on: {
                input: () => {
                    const needle = searchInput.value.trim().toLowerCase();
                    for (const row of rows) {
                        if (!needle) {
                            const isMember = row.classList.contains('pt-indent');
                            row.classList.toggle('pt-hidden', isMember && !isRowFolderExpanded(row));
                        } else {
                            const match = (row.getAttribute('data-search') || '').includes(needle);
                            row.classList.toggle('pt-hidden', !match || row.classList.contains('pt-quick-folder'));
                        }
                    }
                    setActive(-1);
                },
            },
        });

        const showSearch = avatars.length > 6;
        menu.append(
            el('div', { cls: 'pt-quick-header' },
                el('span', { cls: 'pt-quick-header-title', text: 'Personas' }),
                el('span', { cls: 'pt-quick-header-count', text: String(avatars.length) }),
            ),
            showSearch ? searchInput : null,
            list,
        );

        quickMenuKeyHandler = (e) => {
            if (!quickMenu) return;
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeQuickMenu(); return; }
            const visible = rows.filter(r => !r.classList.contains('pt-hidden'));
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!visible.length) return;
                const currentVisibleIdx = visible.indexOf(rows[activeIdx]);
                const nextVisibleIdx = e.key === 'ArrowDown'
                    ? (currentVisibleIdx + 1) % visible.length
                    : currentVisibleIdx <= 0 ? visible.length - 1 : currentVisibleIdx - 1;
                setActive(rows.indexOf(visible[nextVisibleIdx]));
            }
            if (e.key === 'Enter' && rows[activeIdx] && !rows[activeIdx].classList.contains('pt-hidden')) {
                e.preventDefault();
                rows[activeIdx].click();
            }
        };
        document.addEventListener('keydown', quickMenuKeyHandler, true);

        document.body.append(menu);
        positionQuickMenu(menu);
        quickMenu = menu;
        document.getElementById('quickPersonaCaret')?.classList.replace('fa-caret-up', 'fa-caret-down');
        requestAnimationFrame(() => menu.classList.add('pt-open'));
        if (showSearch) searchInput.focus();
    }

    function positionQuickMenu(menu) {
        const btn = document.getElementById('quickPersona');
        if (!btn) return;
        const rect = btn.getBoundingClientRect();
        const mr = menu.getBoundingClientRect();
        let left = rect.left;
        let top = rect.top - mr.height - 8;
        left = Math.max(8, Math.min(left, window.innerWidth - mr.width - 8));
        if (top < 8) top = Math.min(rect.bottom + 8, window.innerHeight - mr.height - 8);
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    }

    // ============================================
    // EVENTS + INIT
    // ============================================

    function onPersonaDeleted(payload) {
        const avatarId = payload && typeof payload === 'object' ? payload.avatarId : payload;
        if (avatarId) {
            delete settings.personaGroups[avatarId];
            delete settings.persona_tag_map[avatarId];
            for (const [folderName, order] of Object.entries(settings.folderOrder)) {
                if (Array.isArray(order)) {
                    settings.folderOrder[folderName] = order.filter(id => id !== avatarId);
                }
            }
            if (view.folder && !getFolderMembers(view.folder).length) view.folder = null;
            pruneOrphanDescriptions();
            saveSettings();
        }
        updateQuickButton();
        scheduleDecorate();
    }

    async function loadPersonasApi() {
        personasApi = await import('/scripts/personas.js');
        if (!powerUser) {
            try { powerUser = (await import('/scripts/power-user.js')).power_user; }
            catch (e) { error('power_user unavailable', e); }
        }
    }

    async function init() {
        settings = getSettings();
        await loadPersonasApi();
        await migrateFromOldExtensions();
        pruneOrphanDescriptions();
        installFilter();

        addQuickButton();
        createFolderHeader();
        createTagBar();
        startObserver();
        startCardReorder();

        eventSource.on(event_types.CHAT_CHANGED, updateQuickButton);
        eventSource.on(event_types.SETTINGS_UPDATED, updateQuickButton);
        if (event_types.PERSONA_CHANGED) eventSource.on(event_types.PERSONA_CHANGED, updateQuickButton);
        if (event_types.PERSONA_CREATED) eventSource.on(event_types.PERSONA_CREATED, (payload) => {
            const newId = payload && typeof payload === 'object' ? payload.avatarId : null;
            const srcId = payload && typeof payload === 'object' ? payload.duplicatedFromAvatarId : null;
            // Duplicates inherit the source persona's folders and tags, so
            // duplicating inside a folder keeps the copy in that folder right
            // next to the source persona.
            if (newId && srcId) {
                if (settings.personaGroups[srcId]?.length) {
                    settings.personaGroups[newId] = [...settings.personaGroups[srcId]];
                    for (const folderName of settings.personaGroups[srcId]) {
                        const order = settings.folderOrder[folderName];
                        if (Array.isArray(order)) {
                            const srcIdx = order.indexOf(srcId);
                            if (srcIdx > -1 && !order.includes(newId)) order.splice(srcIdx + 1, 0, newId);
                        }
                    }
                }
                if (settings.persona_tag_map[srcId]?.length) settings.persona_tag_map[newId] = [...settings.persona_tag_map[srcId]];
                saveSettings();
            }
            // A persona created OUTSIDE the current folder/tag scope would be
            // filtered out of ST's post-create render and look like the creation
            // failed — drop back to the root view unless it's visible here.
            // (The event fires before ST's re-render, so its own navigation to
            // the new card works natively either way.)
            const visibleHere = view.folder
                ? !!(newId && (settings.personaGroups[newId] || []).includes(view.folder))
                : hasTagFilter()
                    ? !!(newId && matchesTagFilter(newId))
                    : true;
            if (!visibleHere && personasApi.isPersonaPanelOpen?.()) {
                view.folder = null;
                view.tags = [];
                view.excludeTags = [];
                renderTagBar();
            }
            updateQuickButton();
            scheduleDecorate();
        });
        if (event_types.PERSONA_RENAMED) eventSource.on(event_types.PERSONA_RENAMED, () => { updateQuickButton(); scheduleDecorate(); });
        // PERSONA_UPDATED fires per keystroke while typing a persona description —
        // the quick-button refresh is cheap (src-compare, no fetch), so no decorate.
        if (event_types.PERSONA_UPDATED) eventSource.on(event_types.PERSONA_UPDATED, updateQuickButton);
        if (event_types.PERSONA_DELETED) eventSource.on(event_types.PERSONA_DELETED, onPersonaDeleted);

        // Capture-phase click blocker after finishing a drag-reorder so releasing
        // a card doesn't trigger ST's delegated click handler (setUserAvatar).
        document.addEventListener('click', (e) => {
            if (Date.now() < suppressClickUntil) {
                suppressClickUntil = 0;
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        }, true);

        document.addEventListener('click', (e) => {
            if (quickMenu && !e.target.closest('#quickPersonaMenu') && !e.target.closest('#quickPersona')) {
                closeQuickMenu();
            }
            if (e.target.closest('#persona_set_image_button')) pendingAvatarRefresh = true;
        });
        document.addEventListener('change', (e) => {
            if (e.target && e.target.id === 'avatar_upload_file') pendingAvatarRefresh = true;
        });

        // ST's own search re-renders the list and our observer re-decorates, but
        // clearing the box must also restore the folder/tag view scoping.
        const searchBar = document.getElementById('persona_search_bar');
        if (searchBar) {
            searchBar.addEventListener('input', () => {
                if (!searchBar.value.trim() && (view.folder || hasTagFilter() || getAllFolders().length)) refreshListSoon();
            });
        }

        updateQuickButton();
        // Re-render once so the injected filter applies to the initially rendered list.
        await refreshList();
        console.info(`[${EXT_NAME}] v${VERSION} ready`);
    }

    jQuery(async () => {
        try { await init(); }
        catch (e) { error('Fatal init error:', e); }
    });
})();
