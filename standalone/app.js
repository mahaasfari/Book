/**
 * app.js - منطق تشغيل كتاب اليوميات الواقعي
 * وضع القارئ حصري من الرابط بدون قراءة من localStorage وبدون أي بيانات تجريبية
 */

(function () {
  'use strict';

  const STORAGE_KEY_ENTRIES = 'digital_diary_entries_v1';
  const STORAGE_KEY_SETTINGS = 'digital_diary_settings_v1';
  const STORAGE_KEY_DRAFT = 'digital_diary_editor_draft_v1';

  // UTF-8 Base64 Encoding & Decoding
  function encodeUnicodeBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function decodeUnicodeBase64(base64) {
    if (!base64) return '';
    let clean = String(base64).trim().replace(/^[#?]/, '');
    if (clean.indexOf('data=') === 0) clean = clean.substring(5);
    if (clean.indexOf('content=') === 0) clean = clean.substring(8);
    try { clean = decodeURIComponent(clean); } catch (e) {}
    let b64 = clean.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) {
      b64 += '=';
    }
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  let state = {
    isReaderMode: false,
    readerType: null, // 'single' | 'all'
    readerSingle: null,
    readerAllSettings: null,
    readerAllEntries: [],

    // بيانات المالك (تُستخدم فقط عند فتح التطبيق كمالك)
    entries: [],
    settings: {
      title: "رحلة اشتياق",
      subtitle: "أوراق كُتبت في غيابك، لتُقرأ في حضورك",
      dedication: "إلى من يسكن البال دون استئذان.. أهدي إليك هذه الصفحات، شاهداً على أيامٍ كنتَ فيها الحاضر الأكبر رغم المسافات.",
      recipientName: "إلى العزيز الغائب الحاضر"
    },
    activeEntryId: null,
    editingEntryId: null,
    pageMode: 'read', // 'read' | 'edit' | 'welcome' | 'dedication'
    searchQuery: '',
    autosaveTimer: null
  };

  let elements = {};

  function setupElements() {
    elements = {
      bookCasing: document.getElementById('bookCasing'),
      bookTitle: document.getElementById('bookTitle'),
      bookSubtitle: document.getElementById('bookSubtitle'),
      searchInput: document.getElementById('searchInput'),
      indexEntriesList: document.getElementById('indexEntriesList'),
      bookIndexSidebar: document.getElementById('bookIndexSidebar'),
      bookSpineGutter: document.getElementById('bookSpineGutter'),
      newEntryBtn: document.getElementById('newEntryBtn'),
      indexFooter: document.getElementById('indexFooter'),

      // ترويسة القارئ والخطأ
      readerHeader: document.getElementById('readerHeader'),
      readerHeaderTitle: document.getElementById('readerHeaderTitle'),
      readerErrorBox: document.getElementById('readerErrorBox'),
      readerErrorMsg: document.getElementById('readerErrorMsg'),

      // مساحات الصفحة
      readerArea: document.getElementById('readerArea'),
      editorArea: document.getElementById('editorArea'),
      welcomeArea: document.getElementById('welcomeArea'),
      welcomeSubtext: document.getElementById('welcomeSubtext'),
      dedicationArea: document.getElementById('dedicationArea'),
      backToBookBtn: document.getElementById('backToBookBtn'),

      // عناصر القارئ
      readerDate: document.getElementById('readerDate'),
      readerTitle: document.getElementById('readerTitle'),
      readerContent: document.getElementById('readerContent'),
      readerWordCount: document.getElementById('readerWordCount'),
      readerActions: document.getElementById('readerActions'),
      readerNavBar: document.getElementById('readerNavBar'),
      prevEntryBtn: document.getElementById('prevEntryBtn'),
      nextEntryBtn: document.getElementById('nextEntryBtn'),

      // عناصر المحرر
      editorDateText: document.getElementById('editorDateText'),
      editorTitleInput: document.getElementById('editorTitleInput'),
      editorContentTextarea: document.getElementById('editorContentTextarea'),
      autosaveIndicator: document.getElementById('autosaveIndicator'),

      // نافذة المشاركة
      shareModal: document.getElementById('shareModal'),
      shareModalTitle: document.getElementById('shareModalTitle'),
      shareInfoBox: document.getElementById('shareInfoBox'),
      shareUrlInput: document.getElementById('shareUrlInput'),
      copyShareUrlBtn: document.getElementById('copyShareUrlBtn'),
      whatsappShareBtn: document.getElementById('whatsappShareBtn'),
      closeShareModalBtn: document.getElementById('closeShareModalBtn'),

      // نافذة رابط قراءة مها
      mahaReaderBtn: document.getElementById('mahaReaderBtn'),
      mahaModal: document.getElementById('mahaModal'),
      mahaChapterSelect: document.getElementById('mahaChapterSelect'),
      mahaShareUrlInput: document.getElementById('mahaShareUrlInput'),
      copyMahaShareUrlBtn: document.getElementById('copyMahaShareUrlBtn'),
      whatsappMahaBtn: document.getElementById('whatsappMahaBtn'),
      closeMahaModalBtn: document.getElementById('closeMahaModalBtn')
    };
  }

  function init() {
    setupElements();

    const url = new URL(window.location.href);
    let readParam = url.searchParams.get('read');
    let hash = window.location.hash.replace(/^#/, '').trim();

    // فحص الرابط: دعم الرابط سواء بالمعاملات أو في الهاش
    if (!readParam && hash.includes('read=')) {
      const hashParams = new URLSearchParams(hash);
      readParam = hashParams.get('read');
      hash = (hashParams.get('data') || hashParams.get('content') || '').trim();
    }

    // فحص الرابط فوراً: إذا كان وضع مشاركة
    if (readParam === 'single' || readParam === 'all') {
      state.isReaderMode = true;
      state.readerType = readParam;

      // ممنوع منعاً باتاً قراءة localStorage أو استخدام بيانات تجريبية
      state.entries = [];

      if (!hash) {
        showReaderError('هذا الرابط لا يحتوي على أي محتوى.');
        return;
      }

      try {
        const jsonStr = decodeUnicodeBase64(hash);
        const parsed = JSON.parse(jsonStr);

        if (!parsed || typeof parsed !== 'object') {
          showReaderError('هذا الرابط لا يحتوي على أي محتوى.');
          return;
        }

        if (readParam === 'single') {
          const title = (parsed.t || parsed.title || '').trim();
          const content = (parsed.c || parsed.content || '').trim();
          const date = (parsed.d || parsed.date || '').trim();
          const bookTitle = (parsed.b || parsed.bookTitle || 'رحلة اشتياق').trim();

          if (!title && !content) {
            showReaderError('هذا الرابط لا يحتوي على أي محتوى.');
            return;
          }

          state.readerSingle = { title: title || 'مذكرة خاصة', content, date, bookTitle };
          startSingleReaderMode();
          return;
        } else if (readParam === 'all') {
          const rawSettings = parsed.b || parsed.settings || {};
          state.readerAllSettings = {
            title: rawSettings.title || 'رحلة اشتياق',
            subtitle: rawSettings.subtitle || 'أوراق كُتبت في غيابك، لتُقرأ في حضورك',
            dedication: rawSettings.dedication || '',
            recipientName: rawSettings.recipientName || ''
          };

          const rawEntries = parsed.e || parsed.entries;
          if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
            showReaderError('هذا الرابط لا يحتوي على أي محتوى.');
            return;
          }

          state.readerAllEntries = rawEntries.map((item, idx) => ({
            id: String(item.i || item.id || `shared-${idx}`),
            title: String(item.t || item.title || `فصل ${idx + 1}`),
            date: String(item.d || item.date || ''),
            content: String(item.c || item.content || ''),
            createdAt: Number(item.ca || item.createdAt || Date.now() - idx * 1000)
          }));

          startAllReaderMode();
          return;
        }
      } catch (err) {
        showReaderError('هذا الرابط لا يحتوي على أي محتوى.');
        return;
      }
    }

    // إذا لم يكن هناك باراميتر read، فعّل وضع المالك الطبيعي
    startOwnerMode();
  }

  function showReaderError(msg) {
    if (elements.bookCasing) elements.bookCasing.style.display = 'none';
    if (elements.readerHeader) elements.readerHeader.style.display = 'none';
    if (elements.readerErrorBox) {
      elements.readerErrorBox.style.display = 'block';
      if (elements.readerErrorMsg) elements.readerErrorMsg.textContent = msg;
    }
  }

  // 1. تشغيل وضع القارئ (فصل واحد فقط)
  function startSingleReaderMode() {
    const single = state.readerSingle;
    document.title = `${single.title} - ${single.bookTitle}`;

    // إخفاء الفهرس وكعب الكتاب تماماً
    if (elements.bookIndexSidebar) elements.bookIndexSidebar.style.display = 'none';
    if (elements.bookSpineGutter) elements.bookSpineGutter.style.display = 'none';

    // إظهار ترويسة بسيطة باسم الكتاب بدون أي أزرار
    if (elements.readerHeader) {
      elements.readerHeader.style.display = 'flex';
      if (elements.readerHeaderTitle) elements.readerHeaderTitle.textContent = `من كتاب ${single.bookTitle || 'رحلة اشتياق'}`;
    }

    // إخفاء أزرار التعديل والحذف والتنقل وأي عدادات
    if (elements.readerActions) elements.readerActions.style.display = 'none';
    if (elements.readerNavBar) elements.readerNavBar.style.display = 'none';
    if (elements.readerWordCount) elements.readerWordCount.textContent = '';

    // عرض بيانات الفصل
    if (elements.readerDate) elements.readerDate.textContent = single.date;
    if (elements.readerTitle) elements.readerTitle.textContent = single.title;
    if (elements.readerContent) elements.readerContent.textContent = single.content;

    switchPageMode('read');
  }

  // 2. تشغيل وضع القارئ (كتاب كامل للقراءة فقط)
  function startAllReaderMode() {
    const settings = state.readerAllSettings;
    const entries = state.readerAllEntries;
    document.title = `${settings.title} - وضع القراءة`;

    // إظهار الفهرس وكعب الكتاب
    if (elements.bookIndexSidebar) elements.bookIndexSidebar.style.display = 'flex';
    if (elements.bookSpineGutter) elements.bookSpineGutter.style.display = 'block';

    // إخفاء أزرار الإضافة والتعديل والنسخ الاحتياطي في الفهرس
    if (elements.newEntryBtn) elements.newEntryBtn.style.display = 'none';
    if (elements.indexFooter) elements.indexFooter.style.display = 'none';

    // تحديث عناوين الكتاب
    if (elements.bookTitle) elements.bookTitle.textContent = settings.title;
    if (elements.bookSubtitle) elements.bookSubtitle.textContent = settings.subtitle;

    // إظهار ترويسة بسيطة
    if (elements.readerHeader) {
      elements.readerHeader.style.display = 'flex';
      if (elements.readerHeaderTitle) elements.readerHeaderTitle.textContent = `${settings.title} (للقراءة فقط)`;
    }

    // إخفاء أزرار التعديل والحذف في صفحة القراءة
    if (elements.readerActions) elements.readerActions.style.display = 'none';
    if (elements.welcomeSubtext) {
      elements.welcomeSubtext.textContent = 'تصفح الفصول المتاحة في القائمة الجانبية.';
    }

    bindSearch();
    bindNavButtons();
    renderIndexList(entries);

    if (entries.length > 0) {
      openReader(entries[0].id);
    } else {
      switchPageMode('welcome');
    }
  }

  // 3. تشغيل وضع المالك الطبيعي
  function startOwnerMode() {
    loadSettings();
    loadEntries();
    bindOwnerEvents();
    renderIndexList(state.entries);

    if (state.entries.length > 0) {
      openReader(state.entries[0].id);
    } else {
      switchPageMode('welcome');
    }
  }

  function loadSettings() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (stored) {
        state.settings = Object.assign({}, state.settings, JSON.parse(stored));
      } else if (window.DEFAULT_BOOK_SETTINGS) {
        state.settings = Object.assign({}, window.DEFAULT_BOOK_SETTINGS);
      }
    } catch (e) {}
    if (elements.bookTitle) elements.bookTitle.textContent = state.settings.title;
    if (elements.bookSubtitle) elements.bookSubtitle.textContent = state.settings.subtitle;
    document.title = `${state.settings.title} - كتاب اليوميات`;
  }

  function loadEntries() {
    try {
      const RESET_FLAG = 'subtle_romantic_entries_cleared_v1';
      if (!localStorage.getItem(RESET_FLAG)) {
        localStorage.removeItem(STORAGE_KEY_ENTRIES);
        localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify([]));
        localStorage.removeItem(STORAGE_KEY_DRAFT);
        localStorage.setItem(RESET_FLAG, 'done');
        state.entries = [];
        return;
      }
      const stored = localStorage.getItem(STORAGE_KEY_ENTRIES);
      if (stored) {
        state.entries = JSON.parse(stored);
      } else {
        state.entries = [];
        saveEntries();
      }
    } catch (e) {
      state.entries = [];
    }
  }

  function saveEntries() {
    if (state.isReaderMode) return;
    try {
      localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(state.entries));
    } catch (e) {}
  }

  function getActiveEntries() {
    if (state.isReaderMode && state.readerType === 'all') {
      return state.readerAllEntries;
    }
    return state.entries;
  }

  function bindSearch() {
    if (elements.searchInput) {
      elements.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim().toLowerCase();
        renderIndexList(getActiveEntries());
      });
    }
  }

  function bindNavButtons() {
    elements.prevEntryBtn?.addEventListener('click', navigatePrevious);
    elements.nextEntryBtn?.addEventListener('click', navigateNext);
  }

  function bindOwnerEvents() {
    bindSearch();
    bindNavButtons();

    elements.newEntryBtn?.addEventListener('click', openEditorForNew);
    document.getElementById('dedicationBtn')?.addEventListener('click', showDedication);
    elements.backToBookBtn?.addEventListener('click', () => switchPageMode('read'));
    document.getElementById('saveEntryBtn')?.addEventListener('click', saveCurrentEntry);
    document.getElementById('cancelEditBtn')?.addEventListener('click', cancelEdit);

    document.getElementById('shareAllBookBtn')?.addEventListener('click', () => openShareModal('all'));
    document.getElementById('shareSingleChapterBtn')?.addEventListener('click', () => {
      if (state.activeEntryId) {
        const entry = state.entries.find(e => e.id === state.activeEntryId);
        if (entry) openShareModal('single', entry);
      }
    });

    elements.closeShareModalBtn?.addEventListener('click', closeShareModal);
    elements.copyShareUrlBtn?.addEventListener('click', copyShareUrl);
    elements.whatsappShareBtn?.addEventListener('click', shareWhatsApp);

    elements.mahaReaderBtn?.addEventListener('click', openMahaModal);
    elements.closeMahaModalBtn?.addEventListener('click', closeMahaModal);
    elements.copyMahaShareUrlBtn?.addEventListener('click', copyMahaShareUrl);
    elements.whatsappMahaBtn?.addEventListener('click', shareMahaWhatsApp);
    elements.mahaChapterSelect?.addEventListener('change', updateMahaShareUrl);

    if (elements.editorContentTextarea && elements.editorTitleInput) {
      const triggerAutosave = () => {
        clearTimeout(state.autosaveTimer);
        state.autosaveTimer = setTimeout(saveDraft, 5000);
      };
      elements.editorTitleInput.addEventListener('input', triggerAutosave);
      elements.editorContentTextarea.addEventListener('input', triggerAutosave);
    }

    document.getElementById('editCurrentEntryBtn')?.addEventListener('click', () => {
      if (!state.isReaderMode && state.activeEntryId) {
        openEditorForEdit(state.activeEntryId);
      }
    });

    document.getElementById('deleteCurrentEntryBtn')?.addEventListener('click', () => {
      if (!state.isReaderMode && state.activeEntryId) {
        confirmDelete(state.activeEntryId);
      }
    });
  }

  function renderIndexList(entries) {
    if (!elements.indexEntriesList) return;

    let filtered = [...entries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (state.searchQuery) {
      filtered = filtered.filter(e => 
        e.title.toLowerCase().includes(state.searchQuery) ||
        e.content.toLowerCase().includes(state.searchQuery)
      );
    }

    if (filtered.length === 0) {
      elements.indexEntriesList.innerHTML = '<div style="text-align: center; color: var(--ink-muted); padding: 30px 10px; font-size: 0.8rem;">لا توجد فصول مطابقة</div>';
      return;
    }

    elements.indexEntriesList.innerHTML = filtered.map((entry) => {
      const isActive = state.activeEntryId === entry.id && state.pageMode === 'read';
      const shareBtn = !state.isReaderMode 
        ? `<button class="chapter-share-btn" data-share-id="${entry.id}" title="مشاركة هذا الفصل">🔗</button>` 
        : '';

      return `
        <div class="index-entry-item ${isActive ? 'active' : ''}" data-id="${entry.id}">
          <div class="index-item-top">
            <span class="index-item-date">${escapeHTML(entry.date)}</span>
            ${shareBtn}
          </div>
          <div class="index-item-title">${escapeHTML(entry.title)}</div>
        </div>
      `;
    }).join('');

    elements.indexEntriesList.querySelectorAll('.index-entry-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        openReader(id);
      });
    });

    if (!state.isReaderMode) {
      elements.indexEntriesList.querySelectorAll('.chapter-share-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-share-id');
          const entry = state.entries.find(x => x.id === id);
          if (entry) openShareModal('single', entry);
        });
      });
    }
  }

  function switchPageMode(mode) {
    state.pageMode = mode;
    if (elements.readerArea) elements.readerArea.style.display = mode === 'read' ? 'flex' : 'none';
    if (elements.editorArea) elements.editorArea.style.display = (mode === 'edit' || mode === 'new') ? 'flex' : 'none';
    if (elements.welcomeArea) elements.welcomeArea.style.display = mode === 'welcome' ? 'flex' : 'none';
    if (elements.dedicationArea) elements.dedicationArea.style.display = mode === 'dedication' ? 'flex' : 'none';
    renderIndexList(getActiveEntries());
  }

  function openReader(id) {
    const list = getActiveEntries();
    const entry = list.find(e => e.id === id);
    if (!entry) {
      switchPageMode('welcome');
      return;
    }

    state.activeEntryId = id;
    if (elements.readerDate) elements.readerDate.textContent = entry.date;
    if (elements.readerTitle) elements.readerTitle.textContent = entry.title;
    if (elements.readerContent) elements.readerContent.textContent = entry.content;

    const words = entry.content.trim().split(/\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.ceil(words / 140));
    if (elements.readerWordCount) elements.readerWordCount.textContent = `${words} كلمة · ${minutes} دقائق قراءة`;

    const sorted = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const currentIndex = sorted.findIndex(e => e.id === id);

    if (elements.prevEntryBtn) {
      elements.prevEntryBtn.disabled = currentIndex >= sorted.length - 1;
    }
    if (elements.nextEntryBtn) {
      elements.nextEntryBtn.disabled = currentIndex <= 0;
    }

    switchPageMode('read');
  }

  function navigatePrevious() {
    const list = getActiveEntries();
    const sorted = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const idx = sorted.findIndex(e => e.id === state.activeEntryId);
    if (idx < sorted.length - 1) openReader(sorted[idx + 1].id);
  }

  function navigateNext() {
    const list = getActiveEntries();
    const sorted = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const idx = sorted.findIndex(e => e.id === state.activeEntryId);
    if (idx > 0) openReader(sorted[idx - 1].id);
  }

  // دوال التعديل والحفظ للمالك فقط
  function openEditorForNew() {
    if (state.isReaderMode) return;
    state.editingEntryId = null;
    if (elements.editorDateText) elements.editorDateText.textContent = getArabicDate();
    if (elements.editorTitleInput) elements.editorTitleInput.value = '';
    if (elements.editorContentTextarea) elements.editorContentTextarea.value = '';
    switchPageMode('new');
    elements.editorTitleInput?.focus();
  }

  function openEditorForEdit(id) {
    if (state.isReaderMode) return;
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;
    state.editingEntryId = id;
    if (elements.editorDateText) elements.editorDateText.textContent = entry.date;
    if (elements.editorTitleInput) elements.editorTitleInput.value = entry.title;
    if (elements.editorContentTextarea) elements.editorContentTextarea.value = entry.content;
    switchPageMode('edit');
    elements.editorTitleInput?.focus();
  }

  function saveCurrentEntry() {
    if (state.isReaderMode) return;
    const title = elements.editorTitleInput?.value.trim();
    const content = elements.editorContentTextarea?.value.trim();

    if (!title || !content) {
      alert('الرجاء كتابة العنوان والمحتوى.');
      return;
    }

    if (state.editingEntryId) {
      const idx = state.entries.findIndex(e => e.id === state.editingEntryId);
      if (idx !== -1) {
        state.entries[idx].title = title;
        state.entries[idx].content = content;
        state.entries[idx].updatedAt = Date.now();
        saveEntries();
        openReader(state.editingEntryId);
      }
    } else {
      const newEntry = {
        id: 'entry-' + Date.now(),
        title: title,
        content: content,
        date: elements.editorDateText?.textContent || getArabicDate(),
        createdAt: Date.now()
      };
      state.entries.unshift(newEntry);
      saveEntries();
      openReader(newEntry.id);
    }
  }

  function cancelEdit() {
    if (state.editingEntryId) {
      openReader(state.editingEntryId);
    } else if (state.entries.length > 0) {
      openReader(state.entries[0].id);
    } else {
      switchPageMode('welcome');
    }
  }

  function saveDraft() {
    if (state.isReaderMode) return;
    if (state.pageMode !== 'new' && state.pageMode !== 'edit') return;
    try {
      localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify({
        title: elements.editorTitleInput?.value || '',
        content: elements.editorContentTextarea?.value || ''
      }));
      if (elements.autosaveIndicator) {
        elements.autosaveIndicator.textContent = '✓ تم حفظ المسودة تلقائياً';
        setTimeout(() => {
          if (elements.autosaveIndicator) elements.autosaveIndicator.textContent = 'يتم الحفظ تلقائياً كل 5 ثوانٍ';
        }, 2000);
      }
    } catch (e) {}
  }

  function confirmDelete(id) {
    if (state.isReaderMode) return;
    if (confirm('هل أنت متأكد من رغبتك في حذف هذا الفصل؟')) {
      state.entries = state.entries.filter(e => e.id !== id);
      saveEntries();
      if (state.entries.length > 0) {
        openReader(state.entries[0].id);
      } else {
        switchPageMode('welcome');
      }
    }
  }

  function showDedication() {
    const dContent = document.getElementById('dedicationContentText');
    const dRecip = document.getElementById('dedicationRecipientText');
    const currSettings = state.isReaderMode && state.readerAllSettings ? state.readerAllSettings : state.settings;
    if (dContent) dContent.textContent = currSettings.dedication;
    if (dRecip) dRecip.textContent = currSettings.recipientName;
    if (elements.backToBookBtn) elements.backToBookBtn.style.display = state.isReaderMode ? 'none' : 'inline-block';
    switchPageMode('dedication');
  }

  // المشاركة
  let currentShareUrl = '';
  let currentShareTitle = '';

  function openShareModal(type, targetEntry = null) {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;

    if (type === 'single' && targetEntry) {
      const payload = {
        t: targetEntry.title,
        d: targetEntry.date,
        c: targetEntry.content,
        b: state.settings.title
      };
      const hash = encodeUnicodeBase64(JSON.stringify(payload));
      currentShareUrl = `${baseUrl}?read=single#${hash}`;
      currentShareTitle = `مشاركة فصل: «${targetEntry.title}»`;

      if (elements.shareModalTitle) elements.shareModalTitle.textContent = currentShareTitle;
      if (elements.shareInfoBox) {
        elements.shareInfoBox.textContent = '💡 هذا الرابط يعرض هذا الفصل فقط. لن يتمكن الشخص من رؤية باقي الفصول أو تصفح باقي الكتاب.';
      }
    } else {
      const payload = {
        b: state.settings,
        e: state.entries.map(e => ({
          i: e.id,
          t: e.title,
          d: e.date,
          c: e.content,
          ca: e.createdAt
        }))
      };
      const hash = encodeUnicodeBase64(JSON.stringify(payload));
      currentShareUrl = `${baseUrl}?read=all#${hash}`;
      currentShareTitle = `مشاركة كتاب «${state.settings.title}» كاملاً`;

      if (elements.shareModalTitle) elements.shareModalTitle.textContent = currentShareTitle;
      if (elements.shareInfoBox) {
        elements.shareInfoBox.textContent = '💡 هذا الرابط يعرض الكتاب كاملاً للقراءة فقط، بدون إمكانية التعديل، وبخصوصية تامة بدون أي خوادم.';
      }
    }

    if (elements.shareUrlInput) elements.shareUrlInput.value = currentShareUrl;
    if (elements.copyShareUrlBtn) elements.copyShareUrlBtn.textContent = 'نسخ الرابط';
    if (elements.shareModal) elements.shareModal.style.display = 'flex';
  }

  function closeShareModal() {
    if (elements.shareModal) elements.shareModal.style.display = 'none';
  }

  function copyShareUrl() {
    if (!currentShareUrl) return;
    navigator.clipboard.writeText(currentShareUrl).then(() => {
      if (elements.copyShareUrlBtn) {
        elements.copyShareUrlBtn.textContent = '✓ تم نسخ الرابط!';
        setTimeout(() => {
          if (elements.copyShareUrlBtn) elements.copyShareUrlBtn.textContent = 'نسخ الرابط';
        }, 2000);
      }
    });
  }

  function shareWhatsApp() {
    if (!currentShareUrl) return;
    const text = `🌿 اقرأ معي: ${currentShareTitle}\n${currentShareUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  }

  let currentMahaUrl = '';

  function openMahaModal() {
    if (!elements.mahaChapterSelect) return;
    const sorted = [...state.entries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    elements.mahaChapterSelect.innerHTML = sorted.map(e => `
      <option value="${e.id}" ${e.id === state.activeEntryId ? 'selected' : ''}>
        ${escapeHTML(e.title)} (${escapeHTML(e.date)})
      </option>
    `).join('');

    updateMahaShareUrl();
    if (elements.mahaModal) elements.mahaModal.style.display = 'flex';
  }

  function closeMahaModal() {
    if (elements.mahaModal) elements.mahaModal.style.display = 'none';
  }

  function updateMahaShareUrl() {
    const selectedId = elements.mahaChapterSelect?.value;
    const entry = state.entries.find(e => e.id === selectedId) || state.entries[0];
    if (!entry) return;

    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const payload = {
      t: entry.title,
      d: entry.date,
      c: entry.content,
      b: state.settings.title
    };
    const hash = encodeUnicodeBase64(JSON.stringify(payload));
    currentMahaUrl = `${baseUrl}?read=single#${hash}`;

    if (elements.mahaShareUrlInput) elements.mahaShareUrlInput.value = currentMahaUrl;
    if (elements.copyMahaShareUrlBtn) elements.copyMahaShareUrlBtn.textContent = 'نسخ الرابط';
  }

  function copyMahaShareUrl() {
    if (!currentMahaUrl) return;
    navigator.clipboard.writeText(currentMahaUrl).then(() => {
      if (elements.copyMahaShareUrlBtn) {
        elements.copyMahaShareUrlBtn.textContent = '✓ تم نسخ الرابط!';
        setTimeout(() => {
          if (elements.copyMahaShareUrlBtn) elements.copyMahaShareUrlBtn.textContent = 'نسخ الرابط';
        }, 2000);
      }
    });
  }

  function shareMahaWhatsApp() {
    if (!currentMahaUrl) return;
    const selectedId = elements.mahaChapterSelect?.value;
    const entry = state.entries.find(e => e.id === selectedId) || state.entries[0];
    const text = `🌿 اقرأ معي: ${entry ? entry.title : ''}\n${currentMahaUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  }

  function getArabicDate(dateObj = new Date()) {
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    return `${days[dateObj.getDay()]}، ${dateObj.getDate()} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
