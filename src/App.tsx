import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Edit3,
  Trash2,
  Download,
  Upload,
  ArrowRight,
  ArrowLeft,
  Check,
  Copy,
  Printer,
  FileCode,
  X,
  Calendar,
  Clock,
  Menu,
  Share2,
  Link2,
  ExternalLink,
  MessageCircle,
  AlertCircle
} from 'lucide-react';
import { DiaryEntry, BookSettings } from './types';
import { INITIAL_ENTRIES, DEFAULT_BOOK_SETTINGS, formatCurrentDateArabic } from './data';

const STORAGE_KEY_ENTRIES = 'digital_diary_entries_v1';
const STORAGE_KEY_SETTINGS = 'digital_diary_settings_v1';
const STORAGE_KEY_DRAFT = 'digital_diary_editor_draft_v1';

// UTF-8 safe Base64 encoding for Arabic text
function encodeUnicodeBase64(str: string): string {
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

// UTF-8 safe Base64 decoding for Arabic text
function decodeUnicodeBase64(base64: string): string {
  let b64 = base64.replace(/-/g, '+').replace(/_/g, '/');
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

interface SharedSingleEntry {
  title: string;
  date: string;
  content: string;
  bookTitle: string;
}

interface ReaderState {
  isReader: boolean;
  type: 'single' | 'all' | null;
  singleEntry: SharedSingleEntry | null;
  allSettings: BookSettings | null;
  allEntries: DiaryEntry[];
  error: string | null;
}

// Deterministic URL inspector: reads exclusively from URL without touching localStorage or demo data
function inspectUrlForReader(): ReaderState {
  if (typeof window === 'undefined') {
    return { isReader: false, type: null, singleEntry: null, allSettings: null, allEntries: [], error: null };
  }

  try {
    const href = window.location.href;
    const url = new URL(href);
    let readParam = url.searchParams.get('read') as 'single' | 'all' | null;
    let hash = window.location.hash.replace(/^#/, '').trim();

    // Support both search parameter and hash-based query
    if (!readParam) {
      if (href.includes('read=single') || href.includes('read%3Dsingle')) {
        readParam = 'single';
      } else if (href.includes('read=all') || href.includes('read%3Dall')) {
        readParam = 'all';
      }
    }

    if (!hash && url.searchParams.get('data')) {
      hash = url.searchParams.get('data')!.trim();
    } else if (hash.includes('data=')) {
      try {
        const hashParams = new URLSearchParams(hash);
        hash = (hashParams.get('data') || hashParams.get('content') || '').trim();
      } catch (e) {}
    }

    if (readParam === 'single' || readParam === 'all') {
      if (!hash) {
        return {
          isReader: true,
          type: readParam,
          singleEntry: null,
          allSettings: null,
          allEntries: [],
          error: 'هذا الرابط لا يحتوي على أي محتوى.',
        };
      }

      let parsed: any;
      try {
        const jsonStr = decodeUnicodeBase64(hash);
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        return {
          isReader: true,
          type: readParam,
          singleEntry: null,
          allSettings: null,
          allEntries: [],
          error: 'هذا الرابط لا يحتوي على أي محتوى.',
        };
      }

      if (!parsed || typeof parsed !== 'object') {
        return {
          isReader: true,
          type: readParam,
          singleEntry: null,
          allSettings: null,
          allEntries: [],
          error: 'هذا الرابط لا يحتوي على أي محتوى.',
        };
      }

      if (readParam === 'single') {
        const title = (parsed.t || parsed.title || '').trim();
        const content = (parsed.c || parsed.content || '').trim();
        const date = (parsed.d || parsed.date || '').trim();
        const bookTitle = (parsed.b || parsed.bookTitle || 'رحلة اشتياق').trim();

        if (!title && !content) {
          return {
            isReader: true,
            type: 'single',
            singleEntry: null,
            allSettings: null,
            allEntries: [],
            error: 'هذا الرابط لا يحتوي على أي محتوى.',
          };
        }

        return {
          isReader: true,
          type: 'single',
          singleEntry: {
            title: title || 'مذكرة خاصة',
            content: content || '',
            date,
            bookTitle,
          },
          allSettings: null,
          allEntries: [],
          error: null,
        };
      } else if (readParam === 'all') {
        const rawSettings = parsed.b || parsed.settings || {};
        const parsedSettings: BookSettings = {
          title: rawSettings.title || 'رحلة اشتياق',
          subtitle: rawSettings.subtitle || 'أوراق كُتبت في غيابك، لتُقرأ في حضورك',
          dedication: rawSettings.dedication || '',
          recipientName: rawSettings.recipientName || '',
        };

        const rawEntries = parsed.e || parsed.entries;
        if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
          return {
            isReader: true,
            type: 'all',
            singleEntry: null,
            allSettings: parsedSettings,
            allEntries: [],
            error: 'هذا الرابط لا يحتوي على أي محتوى.',
          };
        }

        const entries: DiaryEntry[] = rawEntries.map((item: any, idx: number) => ({
          id: String(item.i || item.id || `shared-entry-${idx}`),
          title: String(item.t || item.title || `فصل ${idx + 1}`),
          date: String(item.d || item.date || ''),
          content: String(item.c || item.content || ''),
          createdAt: Number(item.ca || item.createdAt || Date.now() - idx * 1000),
        }));

        return {
          isReader: true,
          type: 'all',
          singleEntry: null,
          allSettings: parsedSettings,
          allEntries: entries,
          error: null,
        };
      }
    }
  } catch (err) {
    console.error('Failed to parse share URL hash', err);
    return {
      isReader: true,
      type: null,
      singleEntry: null,
      allSettings: null,
      allEntries: [],
      error: 'هذا الرابط لا يحتوي على أي محتوى.',
    };
  }

  return { isReader: false, type: null, singleEntry: null, allSettings: null, allEntries: [], error: null };
}

export default function App() {
  // Synchronous reader state directly from URL
  const [readerState, setReaderState] = useState<ReaderState>(() => inspectUrlForReader());

  // Owner state (loaded strictly when isReader is false)
  const [entries, setEntries] = useState<DiaryEntry[]>(() => {
    // If in reader mode, do NOT touch or read localStorage
    if (readerState.isReader) return [];
    try {
      const RESET_FLAG = 'subtle_romantic_entries_cleared_v1';
      if (!localStorage.getItem(RESET_FLAG)) {
        localStorage.removeItem(STORAGE_KEY_ENTRIES);
        localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify([]));
        localStorage.removeItem(STORAGE_KEY_DRAFT);
        localStorage.setItem(RESET_FLAG, 'done');
        return [];
      }
      const saved = localStorage.getItem(STORAGE_KEY_ENTRIES);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Error reading entries from localStorage', e);
    }
    return [];
  });

  const [settings, setSettings] = useState<BookSettings>(() => {
    if (readerState.isReader) return DEFAULT_BOOK_SETTINGS;
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Error reading settings from localStorage', e);
    }
    return DEFAULT_BOOK_SETTINGS;
  });

  // Selected entry for reader
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(() => {
    if (readerState.isReader) {
      return readerState.allEntries.length > 0 ? readerState.allEntries[0].id : null;
    }
    return null;
  });

  // Page mode: 'read' | 'edit' | 'new' | 'dedication' | 'welcome'
  const [pageMode, setPageMode] = useState<'read' | 'edit' | 'new' | 'dedication' | 'welcome'>('welcome');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  // Search in table of contents
  const [searchQuery, setSearchQuery] = useState('');

  // Mobile sidebar toggle
  const [isMobileIndexOpen, setIsMobileIndexOpen] = useState(false);

  // Editor form state
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formDate, setFormDate] = useState('');
  const [autoSaveStatus, setAutoSaveStatus] = useState<string>('يتم الحفظ تلقائياً كل 5 ثوانٍ');

  // Modals
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [activeCodeTab, setActiveCodeTab] = useState<'index.html' | 'style.css' | 'data.js' | 'app.js'>('index.html');
  const [copySuccess, setCopySuccess] = useState(false);
  const [isEditingBookTitle, setIsEditingBookTitle] = useState(false);
  const [tempBookTitle, setTempBookTitle] = useState(settings.title);
  const [tempBookSubtitle, setTempBookSubtitle] = useState(settings.subtitle);

  // Share Modal state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareConfig, setShareConfig] = useState<{
    type: 'single' | 'all';
    entry?: DiaryEntry;
    title: string;
    url: string;
  } | null>(null);
  const [shareCopySuccess, setShareCopySuccess] = useState(false);

  // Maha Reader Link Modal state
  const [isMahaModalOpen, setIsMahaModalOpen] = useState(false);
  const [mahaSelectedChapterId, setMahaSelectedChapterId] = useState<string | null>(null);
  const [mahaCopySuccess, setMahaCopySuccess] = useState(false);

  // File input ref for backup import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle URL changes (popstate / hashchange)
  const syncWithUrl = useCallback(() => {
    const updated = inspectUrlForReader();
    setReaderState(updated);
    if (updated.isReader) {
      if (updated.type === 'single' && updated.singleEntry) {
        document.title = `${updated.singleEntry.title} - ${updated.singleEntry.bookTitle}`;
      } else if (updated.type === 'all' && updated.allSettings) {
        document.title = `${updated.allSettings.title} - وضع القراءة`;
        if (updated.allEntries.length > 0) {
          setSelectedEntryId(updated.allEntries[0].id);
        }
      }
    } else {
      document.title = `${settings.title} - كتاب اليوميات`;
    }
  }, [settings.title]);

  useEffect(() => {
    window.addEventListener('popstate', syncWithUrl);
    window.addEventListener('hashchange', syncWithUrl);
    return () => {
      window.removeEventListener('popstate', syncWithUrl);
      window.removeEventListener('hashchange', syncWithUrl);
    };
  }, [syncWithUrl]);

  // NEVER touch localStorage if reader mode is active
  useEffect(() => {
    if (readerState.isReader) return;
    try {
      localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(entries));
    } catch (e) {
      console.error('Failed to save entries to localStorage', e);
    }
  }, [entries, readerState.isReader]);

  useEffect(() => {
    if (readerState.isReader) return;
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
      document.title = `${settings.title} - كتاب اليوميات`;
    } catch (e) {
      console.error('Failed to save settings to localStorage', e);
    }
  }, [settings, readerState.isReader]);

  // Auto-save draft in editor (Owner only)
  useEffect(() => {
    if (readerState.isReader) return;
    if (pageMode !== 'edit' && pageMode !== 'new') return;

    const timer = setTimeout(() => {
      if (formTitle || formContent) {
        try {
          localStorage.setItem(
            STORAGE_KEY_DRAFT,
            JSON.stringify({ title: formTitle, content: formContent, date: formDate, time: Date.now() })
          );
          setAutoSaveStatus('✓ تم حفظ المسودة تلقائياً');
          setTimeout(() => setAutoSaveStatus('يتم الحفظ تلقائياً كل 5 ثوانٍ'), 2500);
        } catch (e) {
          console.warn('Draft auto-save error', e);
        }
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [formTitle, formContent, formDate, pageMode, readerState.isReader]);

  // Active entries and settings
  // CRITICAL: When readerState.isReader is true, activeEntries is EXCLUSIVELY readerState.allEntries.
  // No localStorage or demo data is ever leaked!
  const activeEntries = useMemo(() => {
    if (readerState.isReader) {
      return readerState.allEntries;
    }
    return entries;
  }, [readerState.isReader, readerState.allEntries, entries]);

  const activeSettings = useMemo(() => {
    if (readerState.isReader && readerState.allSettings) {
      return readerState.allSettings;
    }
    return settings;
  }, [readerState.isReader, readerState.allSettings, settings]);

  const sortedEntries = useMemo(() => {
    return [...activeEntries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [activeEntries]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return sortedEntries;
    const q = searchQuery.toLowerCase().trim();
    return sortedEntries.filter(
      (e) => e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q)
    );
  }, [sortedEntries, searchQuery]);

  const currentEntry = useMemo(() => {
    if (activeEntries.length === 0) return null;
    const found = activeEntries.find((e) => e.id === selectedEntryId);
    return found || activeEntries[0];
  }, [activeEntries, selectedEntryId]);

  const calculateReadingStats = (content: string) => {
    const words = content.trim().split(/\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.ceil(words / 140));
    return { words, minutesText: `${minutes} ${minutes === 1 ? 'دقيقة' : 'دقائق'} قراءة` };
  };

  // Generate share link
  const generateShareLink = (type: 'single' | 'all', targetEntry?: DiaryEntry): string => {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;

    if (type === 'single' && targetEntry) {
      const payload = {
        t: targetEntry.title,
        d: targetEntry.date,
        c: targetEntry.content,
        b: settings.title,
      };
      const hash = encodeUnicodeBase64(JSON.stringify(payload));
      return `${baseUrl}?read=single#${hash}`;
    } else {
      const payload = {
        b: {
          title: settings.title,
          subtitle: settings.subtitle,
          dedication: settings.dedication,
          recipientName: settings.recipientName,
        },
        e: entries.map((e) => ({
          i: e.id,
          t: e.title,
          d: e.date,
          c: e.content,
          ca: e.createdAt,
        })),
      };
      const hash = encodeUnicodeBase64(JSON.stringify(payload));
      return `${baseUrl}?read=all#${hash}`;
    }
  };

  const handleOpenShareSingle = (e: React.MouseEvent, entry: DiaryEntry) => {
    e.stopPropagation();
    const url = generateShareLink('single', entry);
    setShareConfig({
      type: 'single',
      entry,
      title: `مشاركة فصل: «${entry.title}»`,
      url,
    });
    setShareCopySuccess(false);
    setIsShareModalOpen(true);
  };

  const handleOpenShareAll = () => {
    const url = generateShareLink('all');
    setShareConfig({
      type: 'all',
      title: `مشاركة كتاب «${settings.title}» كاملاً`,
      url,
    });
    setShareCopySuccess(false);
    setIsShareModalOpen(true);
  };

  const handleOpenMahaReaderModal = (chapterId?: string) => {
    const idToUse = chapterId || selectedEntryId || (entries.length > 0 ? entries[0].id : null);
    setMahaSelectedChapterId(idToUse);
    setMahaCopySuccess(false);
    setIsMahaModalOpen(true);
  };

  const mahaTargetEntry = useMemo(() => {
    if (!mahaSelectedChapterId) return entries[0] || null;
    return entries.find((e) => e.id === mahaSelectedChapterId) || entries[0] || null;
  }, [entries, mahaSelectedChapterId]);

  const mahaShareUrl = useMemo(() => {
    if (!mahaTargetEntry) return '';
    return generateShareLink('single', mahaTargetEntry);
  }, [mahaTargetEntry, settings.title]);

  const handleCopyMahaLink = () => {
    if (!mahaShareUrl) return;
    navigator.clipboard.writeText(mahaShareUrl);
    setMahaCopySuccess(true);
    setTimeout(() => setMahaCopySuccess(false), 2500);
  };

  const handleShareMahaWhatsApp = () => {
    if (!mahaShareUrl || !mahaTargetEntry) return;
    const text = `🌿 اقرأ معي: ${mahaTargetEntry.title}\n${mahaShareUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleStartNewEntry = () => {
    if (readerState.isReader) return;
    setEditingEntryId(null);
    const currentDate = formatCurrentDateArabic(new Date());
    setFormDate(currentDate);

    try {
      const draft = localStorage.getItem(STORAGE_KEY_DRAFT);
      if (draft) {
        const parsed = JSON.parse(draft);
        if (parsed.title || parsed.content) {
          setFormTitle(parsed.title || '');
          setFormContent(parsed.content || '');
          setAutoSaveStatus('تم استرجاع آخر مسودة محفوظة');
          setPageMode('new');
          setIsMobileIndexOpen(false);
          return;
        }
      }
    } catch (e) {}

    setFormTitle('');
    setFormContent('');
    setAutoSaveStatus('يتم الحفظ تلقائياً كل 5 ثوانٍ');
    setPageMode('new');
    setIsMobileIndexOpen(false);
  };

  const handleStartEdit = (entry: DiaryEntry) => {
    if (readerState.isReader) return;
    setEditingEntryId(entry.id);
    setFormDate(entry.date);
    setFormTitle(entry.title);
    setFormContent(entry.content);
    setAutoSaveStatus('تعديل الفصل الحالي');
    setPageMode('edit');
    setIsMobileIndexOpen(false);
  };

  const handleSaveEntry = () => {
    if (readerState.isReader) return;
    if (!formTitle.trim()) {
      alert('الرجاء كتابة عنوان للفصل.');
      return;
    }
    if (!formContent.trim()) {
      alert('الرجاء كتابة نص الفصل.');
      return;
    }

    if (pageMode === 'edit' && editingEntryId) {
      setEntries((prev) =>
        prev.map((item) =>
          item.id === editingEntryId
            ? { ...item, title: formTitle.trim(), content: formContent.trim(), date: formDate, updatedAt: Date.now() }
            : item
        )
      );
      setSelectedEntryId(editingEntryId);
    } else {
      const newEntry: DiaryEntry = {
        id: `entry-${Date.now()}`,
        title: formTitle.trim(),
        content: formContent.trim(),
        date: formDate || formatCurrentDateArabic(new Date()),
        createdAt: Date.now(),
      };
      setEntries((prev) => [newEntry, ...prev]);
      setSelectedEntryId(newEntry.id);
    }

    try {
      localStorage.removeItem(STORAGE_KEY_DRAFT);
    } catch (e) {}

    setPageMode('read');
  };

  const handleCancelEdit = () => {
    if (editingEntryId) {
      setSelectedEntryId(editingEntryId);
      setPageMode('read');
    } else if (sortedEntries.length > 0) {
      setSelectedEntryId(sortedEntries[0].id);
      setPageMode('read');
    } else {
      setPageMode('read');
    }
  };

  const handleConfirmDelete = () => {
    if (readerState.isReader || !entryToDelete) return;
    const remaining = entries.filter((e) => e.id !== entryToDelete);
    setEntries(remaining);
    setIsDeleteModalOpen(false);
    setEntryToDelete(null);

    if (selectedEntryId === entryToDelete) {
      const nextAvailable = remaining.length > 0 ? remaining[0].id : null;
      setSelectedEntryId(nextAvailable);
      setPageMode('read');
    }
  };

  const handlePrevChapter = () => {
    if (!currentEntry) return;
    const currentIndex = sortedEntries.findIndex((e) => e.id === currentEntry.id);
    if (currentIndex < sortedEntries.length - 1) {
      setSelectedEntryId(sortedEntries[currentIndex + 1].id);
      setPageMode('read');
    }
  };

  const handleNextChapter = () => {
    if (!currentEntry) return;
    const currentIndex = sortedEntries.findIndex((e) => e.id === currentEntry.id);
    if (currentIndex > 0) {
      setSelectedEntryId(sortedEntries[currentIndex - 1].id);
      setPageMode('read');
    }
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const exportJSONBackup = () => {
    const payload = {
      bookSettings: settings,
      entries: entries,
      exportedAt: new Date().toISOString(),
    };
    downloadFile(JSON.stringify(payload, null, 2), 'data.json', 'application/json');
  };

  const exportDataJSBackup = () => {
    const jsContent = `/**
 * data.js - ملف بيانات كتاب اليوميات المسترجع
 * تاريخ التصدير: ${new Date().toLocaleString('ar-SA')}
 */

const DEFAULT_BOOK_SETTINGS = ${JSON.stringify(settings, null, 2)};

const INITIAL_DIARY_ENTRIES = ${JSON.stringify(entries, null, 2)};

if (typeof window !== "undefined") {
  window.DEFAULT_BOOK_SETTINGS = DEFAULT_BOOK_SETTINGS;
  window.INITIAL_DIARY_ENTRIES = INITIAL_DIARY_ENTRIES;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { DEFAULT_BOOK_SETTINGS, INITIAL_DIARY_ENTRIES };
}
`;
    downloadFile(jsContent, 'data.js', 'application/javascript');
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (parsed.entries && Array.isArray(parsed.entries)) {
          setEntries(parsed.entries);
          if (parsed.bookSettings) setSettings(parsed.bookSettings);
          if (parsed.entries.length > 0) setSelectedEntryId(parsed.entries[0].id);
          alert('✓ تم استيراد النسخة الاحتياطية بنجاح!');
        } else if (Array.isArray(parsed)) {
          setEntries(parsed);
          if (parsed.length > 0) setSelectedEntryId(parsed.length > 0 ? parsed[0].id : null);
          alert('✓ تم استيراد المذكرات بنجاح!');
        } else {
          alert('الملف المرفوع لا يحتوي على صيغة مذكرات صحيحة.');
        }
        setIsBackupModalOpen(false);
      } catch (err) {
        alert('حدث خطأ أثناء قراءة الملف. تأكد من أنه ملف JSON سليم.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleCopyShareLink = () => {
    if (!shareConfig?.url) return;
    navigator.clipboard.writeText(shareConfig.url);
    setShareCopySuccess(true);
    setTimeout(() => setShareCopySuccess(false), 2500);
  };

  const handleShareWhatsApp = () => {
    if (!shareConfig?.url) return;
    const text = `🌿 اقرأ معي: ${shareConfig.title}\n${shareConfig.url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  const standaloneCodes = useMemo(() => {
    const htmlCode = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${settings.title} - كتاب اليوميات الرقمي</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Cairo:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="book-viewport">
    <header id="readerHeader" class="reader-header" style="display: none;">
      <div class="reader-badge">
        <span>🌿</span>
        <span id="readerHeaderTitle">${settings.title}</span>
      </div>
      <button class="print-btn" onclick="window.print()" title="طباعة">🖨️</button>
    </header>

    <div id="readerErrorBox" class="reader-error-box" style="display: none;">
      <div class="error-icon">⚠️</div>
      <h3 class="font-literary error-title">تنبيه بخصوص الرابط</h3>
      <p id="readerErrorMsg" class="error-msg">هذا الرابط لا يحتوي على أي محتوى.</p>
    </div>

    <div class="realistic-book-casing" id="bookCasing">
      <aside class="book-index-sidebar" id="bookIndexSidebar">
        <div class="index-header">
          <div class="book-identity">
            <h1 class="book-cover-title" id="bookTitle">${settings.title}</h1>
            <p class="book-cover-sub" id="bookSubtitle">${settings.subtitle}</p>
          </div>
          <button class="ribbon-add-btn" id="newEntryBtn">
            <span>+ إضافة مذكرة جديدة</span>
          </button>
          <div class="index-search-box">
            <input type="text" id="searchInput" placeholder="بحث في الفهرس...">
          </div>
        </div>
        <div class="index-entries-list" id="indexEntriesList"></div>
        <div class="index-footer" id="indexFooter">
          <button class="index-util-btn" id="mahaReaderBtn" title="رابط قراءة مها">🌿 رابط قراءة مها</button>
          <button class="index-util-btn" id="shareAllBookBtn">🔗 مشاركة الكتاب</button>
          <button class="index-util-btn" id="dedicationBtn">🌿 الإهداء</button>
          <button class="index-util-btn" id="backupBtn">نسخ احتياطي</button>
        </div>
      </aside>

      <div class="book-spine-gutter" id="bookSpineGutter"></div>

      <main class="book-page-canvas">
        <div id="readerArea" class="page-content-wrapper" style="display: none;">
          <div>
            <div class="page-top-bar">
              <div class="page-date" id="readerDate"></div>
              <div class="page-actions" id="readerActions">
                <button class="action-link" id="shareSingleChapterBtn">🔗 مشاركة الفصل</button>
                <button class="action-link" id="editCurrentEntryBtn">تعديل</button>
                <button class="action-link text-danger" id="deleteCurrentEntryBtn">حذف</button>
              </div>
            </div>
            <h2 class="page-entry-title" id="readerTitle"></h2>
            <div class="page-divider"><span></span><small>🌿</small><span></span></div>
            <article class="page-entry-body" id="readerContent"></article>
          </div>
          <div class="page-nav-bar" id="readerNavBar">
            <button class="page-turn-btn" id="prevEntryBtn">← الفصل السابق</button>
            <span id="readerWordCount" style="font-size: 0.8rem; color: var(--ink-muted);"></span>
            <button class="page-turn-btn" id="nextEntryBtn">الفصل التالي →</button>
          </div>
        </div>

        <div id="editorArea" class="page-content-wrapper" style="display: none;">
          <div>
            <div class="page-top-bar">
              <span class="page-date" id="editorDateText"></span>
              <span class="autosave-tag" id="autosaveIndicator">يتم الحفظ تلقائياً كل 5 ثوانٍ</span>
            </div>
            <input type="text" id="editorTitleInput" class="paper-title-input" placeholder="عنوان اليوم...">
            <textarea id="editorContentTextarea" class="paper-body-textarea" placeholder="اكتب ما تشعر به هنا..."></textarea>
          </div>
          <div class="editor-buttons-row">
            <button class="btn-cancel" id="cancelEditBtn">إلغاء</button>
            <button class="btn-save-rose" id="saveEntryBtn">حفظ في الكتاب</button>
          </div>
        </div>

        <div id="welcomeArea" class="page-content-wrapper" style="text-align: center; justify-content: center; padding: 60px 20px;">
          <div style="font-size: 2.5rem; margin-bottom: 12px; color: var(--dusty-rose);">🌿</div>
          <h2 class="font-literary" style="font-size: 2.2rem; color: var(--ink-primary); margin-bottom: 8px;">اختر فصلاً من الفهرس لتبدأ القراءة</h2>
          <p id="welcomeSubtext" style="color: var(--ink-secondary); font-size: 0.95rem; max-width: 420px; margin: 0 auto 20px;">أو اضغط على زر "+ إضافة مذكرة جديدة" في الفهرس لتدوين خواطر هذا اليوم.</p>
        </div>

        <div id="dedicationArea" class="page-content-wrapper" style="display: none; text-align: center; justify-content: center; padding: 40px 20px;">
          <div style="font-size: 2rem; margin-bottom: 12px; color: var(--dusty-rose);">🌿</div>
          <h2 class="font-literary" id="dedicationRecipientText" style="font-size: 2.2rem; margin-bottom: 16px;">${settings.recipientName || 'إلى العزيز الغائب الحاضر'}</h2>
          <div class="page-divider"><span></span><small>🕊️</small><span></span></div>
          <p class="font-literary" id="dedicationContentText" style="font-size: 1.4rem; line-height: 2.3; max-width: 520px; margin: 24px auto; color: var(--ink-primary);">${settings.dedication}</p>
          <button id="backToBookBtn" class="btn-cancel" style="margin-top: 18px; display: none;">🌿 عودة إلى كتابي</button>
        </div>
      </main>
    </div>

    <footer style="text-align: center; margin-top: 16px; font-size: 0.85rem; color: var(--ink-muted);">
      <div class="font-literary" style="color: var(--dusty-rose); font-size: 1rem;">كُتب بصدق... 💭</div>
      <div>كتاب اليوميات الرقمية الورقي · خصوصية تامة بدون خوادم</div>
    </footer>
  </div>

  <div class="modal-overlay" id="shareModal" style="display: none;">
    <div class="modal-card">
      <div class="modal-header">
        <h3 class="modal-title" id="shareModalTitle">مشاركة الرابط</h3>
        <button class="modal-close-btn" id="closeShareModalBtn">✕</button>
      </div>
      <div class="share-info-box" id="shareInfoBox">هذا الرابط يعرض الكتاب للقراءة فقط بدون إمكانية التعديل.</div>
      <div class="share-input-group">
        <label class="share-label">رابط القراءة المشفر:</label>
        <input type="text" id="shareUrlInput" class="share-url-field" readonly>
      </div>
      <div class="share-actions-row">
        <button class="btn-copy-rose" id="copyShareUrlBtn"><span>نسخ الرابط</span></button>
        <button class="btn-whatsapp" id="whatsappShareBtn"><span>مشاركة عبر واتساب</span></button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="mahaModal" style="display: none;">
    <div class="modal-card">
      <div class="modal-header">
        <h3 class="modal-title">🌿 رابط قراءة مها</h3>
        <button class="modal-close-btn" id="closeMahaModalBtn">✕</button>
      </div>
      <div class="share-input-group">
        <label class="share-label">اختر الفصل المراد إهداؤه لمها:</label>
        <select id="mahaChapterSelect" class="share-url-field" style="direction: rtl; padding: 8px; font-family: inherit;"></select>
      </div>
      <div class="share-info-box">
        💡 <strong>هذا الرابط يعرض هذا الفصل فقط.</strong><br>
        ستفتح مها الرابط لترى هذه الصفحة وحدها، بدون فهرس وبدون أزرار وبدون معرفة وجود أي فصول أخرى.
      </div>
      <div class="share-input-group">
        <label class="share-label">رابط القراءة المشفر:</label>
        <input type="text" id="mahaShareUrlInput" class="share-url-field" readonly>
      </div>
      <div class="share-actions-row">
        <button class="btn-copy-rose" id="copyMahaShareUrlBtn"><span>نسخ الرابط</span></button>
        <button class="btn-whatsapp" id="whatsappMahaBtn"><span>مشاركة عبر واتساب</span></button>
      </div>
    </div>
  </div>

  <script src="data.js"></script>
  <script src="app.js"></script>
</body>
</html>`;

    const appJsCode = `(function () {
  'use strict';
  const STORAGE_KEY_ENTRIES = 'digital_diary_entries_v1';
  const STORAGE_KEY_SETTINGS = 'digital_diary_settings_v1';
  const STORAGE_KEY_DRAFT = 'digital_diary_editor_draft_v1';

  function encodeUnicodeBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  }

  function decodeUnicodeBase64(base64) {
    let clean = base64.trim();
    try { clean = decodeURIComponent(clean); } catch (e) {}
    let b64 = clean.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  let state = {
    isReaderMode: false,
    readerType: null,
    readerSingle: null,
    readerAllSettings: null,
    readerAllEntries: [],
    entries: [],
    settings: { title: "رحلة اشتياق", subtitle: "أوراق كُتبت في غيابك، لتُقرأ في حضورك", dedication: "", recipientName: "" },
    activeEntryId: null,
    editingEntryId: null,
    pageMode: 'read',
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
      readerHeader: document.getElementById('readerHeader'),
      readerHeaderTitle: document.getElementById('readerHeaderTitle'),
      readerErrorBox: document.getElementById('readerErrorBox'),
      readerErrorMsg: document.getElementById('readerErrorMsg'),
      readerArea: document.getElementById('readerArea'),
      editorArea: document.getElementById('editorArea'),
      welcomeArea: document.getElementById('welcomeArea'),
      welcomeSubtext: document.getElementById('welcomeSubtext'),
      dedicationArea: document.getElementById('dedicationArea'),
      backToBookBtn: document.getElementById('backToBookBtn'),
      readerDate: document.getElementById('readerDate'),
      readerTitle: document.getElementById('readerTitle'),
      readerContent: document.getElementById('readerContent'),
      readerWordCount: document.getElementById('readerWordCount'),
      readerActions: document.getElementById('readerActions'),
      readerNavBar: document.getElementById('readerNavBar'),
      prevEntryBtn: document.getElementById('prevEntryBtn'),
      nextEntryBtn: document.getElementById('nextEntryBtn'),
      editorDateText: document.getElementById('editorDateText'),
      editorTitleInput: document.getElementById('editorTitleInput'),
      editorContentTextarea: document.getElementById('editorContentTextarea'),
      autosaveIndicator: document.getElementById('autosaveIndicator'),
      shareModal: document.getElementById('shareModal'),
      shareModalTitle: document.getElementById('shareModalTitle'),
      shareInfoBox: document.getElementById('shareInfoBox'),
      shareUrlInput: document.getElementById('shareUrlInput'),
      copyShareUrlBtn: document.getElementById('copyShareUrlBtn'),
      whatsappShareBtn: document.getElementById('whatsappShareBtn'),
      closeShareModalBtn: document.getElementById('closeShareModalBtn')
    };
  }

  function init() {
    setupElements();
    const url = new URL(window.location.href);
    let readParam = url.searchParams.get('read');
    let hash = window.location.hash.replace(/^#/, '').trim();

    if (!readParam && hash.includes('read=')) {
      const hashParams = new URLSearchParams(hash);
      readParam = hashParams.get('read');
      hash = (hashParams.get('data') || hashParams.get('content') || '').trim();
    }

    if (readParam === 'single' || readParam === 'all') {
      state.isReaderMode = true;
      state.readerType = readParam;
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
            id: String(item.i || item.id || 'shared-' + idx),
            title: String(item.t || item.title || 'فصل ' + (idx + 1)),
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

  function startSingleReaderMode() {
    const single = state.readerSingle;
    document.title = single.title + ' - ' + single.bookTitle;
    if (elements.bookIndexSidebar) elements.bookIndexSidebar.style.display = 'none';
    if (elements.bookSpineGutter) elements.bookSpineGutter.style.display = 'none';
    if (elements.readerHeader) {
      elements.readerHeader.style.display = 'flex';
      if (elements.readerHeaderTitle) elements.readerHeaderTitle.textContent = single.bookTitle;
    }
    if (elements.readerActions) elements.readerActions.style.display = 'none';
    if (elements.readerNavBar) elements.readerNavBar.style.display = 'none';
    if (elements.readerDate) elements.readerDate.textContent = single.date;
    if (elements.readerTitle) elements.readerTitle.textContent = single.title;
    if (elements.readerContent) elements.readerContent.textContent = single.content;
    const words = single.content.trim().split(/\\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.ceil(words / 140));
    if (elements.readerWordCount) elements.readerWordCount.textContent = words + ' كلمة · ' + minutes + ' دقائق قراءة';
    switchPageMode('read');
  }

  function startAllReaderMode() {
    const settings = state.readerAllSettings;
    const entries = state.readerAllEntries;
    document.title = settings.title + ' - وضع القراءة';
    if (elements.bookIndexSidebar) elements.bookIndexSidebar.style.display = 'flex';
    if (elements.bookSpineGutter) elements.bookSpineGutter.style.display = 'block';
    if (elements.newEntryBtn) elements.newEntryBtn.style.display = 'none';
    if (elements.indexFooter) elements.indexFooter.style.display = 'none';
    if (elements.bookTitle) elements.bookTitle.textContent = settings.title;
    if (elements.bookSubtitle) elements.bookSubtitle.textContent = settings.subtitle;
    if (elements.readerHeader) {
      elements.readerHeader.style.display = 'flex';
      if (elements.readerHeaderTitle) elements.readerHeaderTitle.textContent = settings.title + ' (للقراءة فقط)';
    }
    if (elements.readerActions) elements.readerActions.style.display = 'none';
    if (elements.welcomeSubtext) elements.welcomeSubtext.textContent = 'تصفح الفصول المتاحة في القائمة الجانبية.';
    bindSearch();
    bindNavButtons();
    renderIndexList(entries);
    if (entries.length > 0) openReader(entries[0].id); else switchPageMode('welcome');
  }

  function startOwnerMode() {
    loadSettings();
    loadEntries();
    bindOwnerEvents();
    renderIndexList(state.entries);
    if (state.entries.length > 0) openReader(state.entries[0].id); else switchPageMode('welcome');
  }

  function loadSettings() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (stored) state.settings = Object.assign({}, state.settings, JSON.parse(stored));
      else if (window.DEFAULT_BOOK_SETTINGS) state.settings = Object.assign({}, window.DEFAULT_BOOK_SETTINGS);
    } catch (e) {}
    if (elements.bookTitle) elements.bookTitle.textContent = state.settings.title;
    if (elements.bookSubtitle) elements.bookSubtitle.textContent = state.settings.subtitle;
    document.title = state.settings.title + ' - كتاب اليوميات';
  }

  function loadEntries() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_ENTRIES);
      if (stored) state.entries = JSON.parse(stored);
      else if (window.INITIAL_DIARY_ENTRIES && Array.isArray(window.INITIAL_DIARY_ENTRIES)) {
        state.entries = [...window.INITIAL_DIARY_ENTRIES];
        saveEntries();
      }
    } catch (e) {
      state.entries = (window.INITIAL_DIARY_ENTRIES && [...window.INITIAL_DIARY_ENTRIES]) || [];
    }
  }

  function saveEntries() {
    if (state.isReaderMode) return;
    try { localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(state.entries)); } catch (e) {}
  }

  function getActiveEntries() {
    return (state.isReaderMode && state.readerType === 'all') ? state.readerAllEntries : state.entries;
  }

  function bindSearch() {
    elements.searchInput?.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim().toLowerCase();
      renderIndexList(getActiveEntries());
    });
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
    if (elements.editorContentTextarea && elements.editorTitleInput) {
      const triggerAutosave = () => {
        clearTimeout(state.autosaveTimer);
        state.autosaveTimer = setTimeout(saveDraft, 5000);
      };
      elements.editorTitleInput.addEventListener('input', triggerAutosave);
      elements.editorContentTextarea.addEventListener('input', triggerAutosave);
    }
    document.getElementById('editCurrentEntryBtn')?.addEventListener('click', () => {
      if (!state.isReaderMode && state.activeEntryId) openEditorForEdit(state.activeEntryId);
    });
    document.getElementById('deleteCurrentEntryBtn')?.addEventListener('click', () => {
      if (!state.isReaderMode && state.activeEntryId) confirmDelete(state.activeEntryId);
    });
  }

  function renderIndexList(entries) {
    if (!elements.indexEntriesList) return;
    let filtered = [...entries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (state.searchQuery) {
      filtered = filtered.filter(e => e.title.toLowerCase().includes(state.searchQuery) || e.content.toLowerCase().includes(state.searchQuery));
    }
    if (filtered.length === 0) {
      elements.indexEntriesList.innerHTML = '<div style="text-align: center; color: var(--ink-muted); padding: 30px 10px; font-size: 0.8rem;">لا توجد فصول مطابقة</div>';
      return;
    }
    elements.indexEntriesList.innerHTML = filtered.map((entry) => {
      const isActive = state.activeEntryId === entry.id && state.pageMode === 'read';
      const shareBtn = !state.isReaderMode ? '<button class="chapter-share-btn" data-share-id="' + entry.id + '" title="مشاركة هذا الفصل">🔗</button>' : '';
      return '<div class="index-entry-item ' + (isActive ? 'active' : '') + '" data-id="' + entry.id + '"><div class="index-item-top"><span class="index-item-date">' + escapeHTML(entry.date) + '</span>' + shareBtn + '</div><div class="index-item-title">' + escapeHTML(entry.title) + '</div></div>';
    }).join('');

    elements.indexEntriesList.querySelectorAll('.index-entry-item').forEach(item => {
      item.addEventListener('click', () => openReader(item.getAttribute('data-id')));
    });

    if (!state.isReaderMode) {
      elements.indexEntriesList.querySelectorAll('.chapter-share-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const entry = state.entries.find(x => x.id === btn.getAttribute('data-share-id'));
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
    if (!entry) { switchPageMode('welcome'); return; }
    state.activeEntryId = id;
    if (elements.readerDate) elements.readerDate.textContent = entry.date;
    if (elements.readerTitle) elements.readerTitle.textContent = entry.title;
    if (elements.readerContent) elements.readerContent.textContent = entry.content;
    const words = entry.content.trim().split(/\\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.ceil(words / 140));
    if (elements.readerWordCount) elements.readerWordCount.textContent = words + ' كلمة · ' + minutes + ' دقائق قراءة';
    const sorted = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const currentIndex = sorted.findIndex(e => e.id === id);
    if (elements.prevEntryBtn) elements.prevEntryBtn.disabled = currentIndex >= sorted.length - 1;
    if (elements.nextEntryBtn) elements.nextEntryBtn.disabled = currentIndex <= 0;
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
    if (!title || !content) { alert('الرجاء كتابة العنوان والمحتوى.'); return; }
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
    if (state.editingEntryId) openReader(state.editingEntryId);
    else if (state.entries.length > 0) openReader(state.entries[0].id);
    else switchPageMode('welcome');
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
      if (state.entries.length > 0) openReader(state.entries[0].id); else switchPageMode('welcome');
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

  let currentShareUrl = '';
  let currentShareTitle = '';

  function openShareModal(type, targetEntry) {
    const baseUrl = window.location.origin + window.location.pathname;
    if (type === 'single' && targetEntry) {
      const payload = { t: targetEntry.title, d: targetEntry.date, c: targetEntry.content, b: state.settings.title };
      const hash = encodeUnicodeBase64(JSON.stringify(payload));
      currentShareUrl = baseUrl + '?read=single#' + hash;
      currentShareTitle = 'مشاركة فصل: «' + targetEntry.title + '»';
      if (elements.shareModalTitle) elements.shareModalTitle.textContent = currentShareTitle;
      if (elements.shareInfoBox) elements.shareInfoBox.textContent = '💡 هذا الرابط يعرض هذا الفصل فقط للقراءة فقط وبدون إمكانية تعديل.';
    } else {
      const payload = {
        b: state.settings,
        e: state.entries.map(e => ({ i: e.id, t: e.title, d: e.date, c: e.content, ca: e.createdAt }))
      };
      const hash = encodeUnicodeBase64(JSON.stringify(payload));
      currentShareUrl = baseUrl + '?read=all#' + hash;
      currentShareTitle = 'مشاركة كتاب «' + state.settings.title + '» كاملاً';
      if (elements.shareModalTitle) elements.shareModalTitle.textContent = currentShareTitle;
      if (elements.shareInfoBox) elements.shareInfoBox.textContent = '💡 هذا الرابط يعرض الكتاب كاملاً للقراءة فقط وبدون إمكانية تعديل.';
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
        setTimeout(() => { if (elements.copyShareUrlBtn) elements.copyShareUrlBtn.textContent = 'نسخ الرابط'; }, 2000);
      }
    });
  }

  function shareWhatsApp() {
    if (!currentShareUrl) return;
    const text = '🌿 اقرأ معي: ' + currentShareTitle + '\\n' + currentShareUrl;
    window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank');
  }

  function getArabicDate(dateObj) {
    const d = dateObj || new Date();
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    return days[d.getDay()] + '، ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();`;

    return {
      'index.html': htmlCode,
      'style.css': `/* style.css - Realistic Book UI */
:root {
  --bg-desk: #F5EFEB;
  --bg-sidebar: #EFE8E1;
  --bg-page: #FDFBF7;
  --ink-primary: #2C2825;
  --ink-body: #3A3532;
  --ink-muted: #9C938B;
  --dusty-rose: #B76E79;
  --dusty-rose-light: #C9A9A6;
  --crease: #DDD5CA;
  --border-delicate: #E5DED4;
  --radius-casing: 16px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Cairo', sans-serif; background: var(--bg-desk); color: var(--ink-body); direction: rtl; min-height: 100vh; padding: 16px; display: flex; flex-direction: column; }
.font-literary { font-family: 'Amiri', serif; }
.book-viewport { max-width: 1240px; margin: 0 auto; width: 100%; flex: 1; display: flex; flex-direction: column; }
.realistic-book-casing { display: flex; flex: 1; min-height: 84vh; background: var(--bg-page); border-radius: var(--radius-casing); box-shadow: 0 15px 40px rgba(50,35,40,0.12); overflow: hidden; border: 1px solid var(--border-delicate); }
.book-index-sidebar { width: 32%; background: var(--bg-sidebar); border-left: 1px solid var(--crease); display: flex; flex-direction: column; padding: 20px 16px; }
.book-spine-gutter { width: 14px; background: linear-gradient(to right, rgba(0,0,0,0.06), transparent); }
.book-page-canvas { flex: 1; background: var(--bg-page); padding: 48px 56px; overflow-y: auto; display: flex; flex-direction: column; justify-content: space-between; }
.ribbon-add-btn { background: var(--dusty-rose); color: #FFF; padding: 10px; border-radius: 8px; border: none; font-weight: 600; cursor: pointer; width: 100%; margin: 14px 0; }
.page-entry-title { font-family: 'Amiri', serif; font-size: 2.2rem; text-align: center; margin: 18px 0; }
.page-entry-body { font-family: 'Amiri', serif; font-size: 1.35rem; line-height: 2.2; text-align: justify; white-space: pre-wrap; }
.page-divider { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 12px 0 24px; color: var(--dusty-rose); }
.page-divider span { width: 60px; height: 1px; background: #E8E1D5; }
.index-footer { padding-top: 14px; border-top: 1px solid var(--crease); display: flex; justify-content: space-between; gap: 4px; }
.index-util-btn { background: none; border: none; color: #706761; font-size: 0.75rem; cursor: pointer; padding: 4px 6px; border-radius: 6px; }
.index-entry-item { padding: 12px; border-radius: 8px; margin-bottom: 6px; cursor: pointer; background: #FAF6F0; border: 1px solid transparent; }
.index-entry-item.active { background: #FDFBF7; border-color: var(--crease); font-weight: bold; border-right: 3px solid var(--dusty-rose); }
.chapter-share-btn { background: none; border: none; cursor: pointer; opacity: 0.7; }
.reader-header { display: flex; justify-content: space-between; padding: 8px 12px; font-size: 0.85rem; color: #706761; }
.reader-error-box { background: #FFF; border: 1px solid var(--border-delicate); border-radius: 12px; padding: 40px; text-align: center; max-width: 450px; margin: 80px auto; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal-card { background: #FDFBF7; padding: 24px; border-radius: 16px; max-width: 480px; width: 90%; }
.btn-cancel { padding: 8px 16px; border-radius: 8px; border: 1px solid var(--crease); background: #FFF; cursor: pointer; }`,
      'data.js': `const DEFAULT_BOOK_SETTINGS = ${JSON.stringify(settings, null, 2)};\nconst INITIAL_DIARY_ENTRIES = ${JSON.stringify(entries, null, 2)};\nif (typeof window !== "undefined") { window.DEFAULT_BOOK_SETTINGS = DEFAULT_BOOK_SETTINGS; window.INITIAL_DIARY_ENTRIES = INITIAL_DIARY_ENTRIES; }`,
      'app.js': appJsCode
    };
  }, [settings, entries]);

  // ══════════════════════════════════════════════════════════════════
  // RENDER: 1. READER ERROR VIEW (Corrupted / Empty Shared Link)
  // ══════════════════════════════════════════════════════════════════
  if (readerState.isReader && readerState.error) {
    return (
      <div className="min-h-screen bg-[#F5EFEB] text-[#3A3532] flex flex-col justify-center items-center p-4 sm:p-8 antialiased selection:bg-[#EBDDD9] selection:text-[#5C3D42]">
        <div className="max-w-md w-full bg-[#FDFBF7] rounded-2xl border border-[#E5DED4] p-8 text-center shadow-xs">
          <p className="text-base text-[#706761] leading-relaxed font-medium">
            هذا الرابط لا يحتوي على أي محتوى.
          </p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // RENDER: 2. SINGLE CHAPTER READER MODE (?read=single#<data>)
  // STRICT: Only this chapter, no sidebar, NO "عودة إلى كتابي", no other chapters
  // ══════════════════════════════════════════════════════════════════
  if (readerState.isReader && readerState.type === 'single' && readerState.singleEntry) {
    const single = readerState.singleEntry;

    return (
      <div className="min-h-screen bg-[#F5EFEB] text-[#3A3532] flex flex-col justify-between p-4 sm:p-8 md:p-12 antialiased selection:bg-[#EBDDD9] selection:text-[#5C3D42]">
        {/* Minimal Emblem Header: Strictly text, NO buttons */}
        <header className="no-print max-w-2xl mx-auto w-full mb-6 flex items-center justify-center">
          <div className="inline-flex items-center gap-2 text-xs sm:text-sm text-[#706761] font-medium">
            <span className="text-[#B76E79]">🌿</span>
            <span>من كتاب {single.bookTitle || 'رحلة اشتياق'}</span>
          </div>
        </header>

        {/* Focused Single Book Page: strictly Title + Date + Content, zero buttons */}
        <main className="max-w-2xl mx-auto w-full flex-1 flex flex-col">
          <article className="flex-1 bg-[#FDFBF7] rounded-2xl border border-[#E5DED4] p-6 sm:p-12 md:p-16 flex flex-col justify-between shadow-xs relative overflow-y-auto min-h-[75vh]">
            <div>
              {/* Date in top right in small light grey */}
              <div className="flex items-center pb-4 mb-6 border-b border-[#F0EAE1] text-xs text-[#9C938B]">
                <span>{single.date}</span>
              </div>

              {/* Bold Large Chapter Title */}
              <div className="text-center my-6 sm:my-8 space-y-3">
                <h1 className="font-literary text-3xl sm:text-4xl md:text-[40px] font-bold text-[#2C2825] leading-tight">
                  {single.title}
                </h1>

                <div className="flex items-center justify-center gap-4 py-1 text-[#B76E79]/80">
                  <div className="h-[1px] w-12 sm:w-20 bg-[#E8E1D5]" />
                  <span className="text-xs">🌿</span>
                  <div className="h-[1px] w-12 sm:w-20 bg-[#E8E1D5]" />
                </div>
              </div>

              {/* Literary Content Body: line-height 2.2, Amiri font */}
              <div className="font-literary text-lg sm:text-xl md:text-[21px] leading-[2.2] text-[#3A3532] whitespace-pre-wrap text-justify my-8 select-text">
                {single.content}
              </div>
            </div>

            {/* Page Bottom: Literary signature only, NO buttons, NO counts */}
            <div className="pt-8 mt-12 border-t border-[#F0EAE1] flex items-center justify-center text-xs text-[#9C938B]">
              <span className="font-literary text-sm text-[#B76E79]">كُتب بصدق... 💭</span>
            </div>
          </article>
        </main>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // RENDER: 3. FULL BOOK READER MODE (?read=all#<data>) & OWNER MODE
  // ══════════════════════════════════════════════════════════════════
  const isReadOnlyBook = readerState.isReader && readerState.type === 'all';

  return (
    <div className="min-h-screen bg-[#F5EFEB] text-[#3A3532] flex flex-col justify-between p-2 sm:p-5 md:p-8 antialiased selection:bg-[#EBDDD9] selection:text-[#5C3D42]">
      {/* ── Top Ribbon ── */}
      <header className="no-print max-w-7xl mx-auto w-full mb-3 flex items-center justify-between px-2 text-xs text-[#706761]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-literary text-lg font-bold text-[#2C2825]">{activeSettings.title}</span>
            {/* Pencil edit only for Owner */}
            {!isReadOnlyBook && (
              <button
                onClick={() => {
                  setTempBookTitle(settings.title);
                  setTempBookSubtitle(settings.subtitle);
                  setIsEditingBookTitle(true);
                }}
                className="text-[#9C938B] hover:text-[#B76E79] transition-colors p-1"
                title="تعديل اسم الكتاب"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <span className="hidden sm:inline text-[#DDD5CA]">|</span>
          <span className="hidden sm:inline text-[#9C938B]">{activeSettings.subtitle}</span>

          {isReadOnlyBook && (
            <span className="inline-flex items-center gap-1 text-[11px] bg-[#FAF6F0] text-[#B76E79] border border-[#DDD5CA] px-2 py-0.5 rounded-md font-medium">
              🌿 نسخة للقراءة فقط
            </span>
          )}
        </div>

        {/* Top Controls */}
        <div className="flex items-center gap-2">
          {/* Owner controls: NEVER SHOWN in Reader mode */}
          {!isReadOnlyBook && (
            <>
              <button
                onClick={handleOpenShareAll}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#C9A9A6] bg-[#F4EBEA] text-[#B76E79] hover:bg-[#B76E79] hover:text-white transition-all shadow-xs"
                title="مشاركة الكتاب كاملاً عبر رابط للقراءة فقط"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>مشاركة الكتاب كامل</span>
              </button>

              <button
                onClick={() => handleOpenMahaReaderModal()}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#B76E79] bg-[#B76E79] text-white hover:bg-[#9E5762] transition-all shadow-xs"
                title="إنشاء رابط قراءة خاص بمها لفصل واحد مستقل"
              >
                <span>🌿 رابط قراءة مها</span>
              </button>

              <button
                onClick={() => setIsBackupModalOpen(true)}
                className="hidden sm:inline-flex items-center gap-1 text-xs text-[#706761] hover:text-[#B76E79] px-2.5 py-1 rounded-md hover:bg-white/60 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>نسخ احتياطي</span>
              </button>

              <button
                onClick={() => setIsCodeModalOpen(true)}
                className="hidden sm:inline-flex items-center gap-1 text-xs text-[#706761] hover:text-[#B76E79] px-2.5 py-1 rounded-md hover:bg-white/60 transition-colors"
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>أكواد النشر</span>
              </button>
            </>
          )}

          {/* Mobile Index Toggle Button */}
          <button
            onClick={() => setIsMobileIndexOpen(!isMobileIndexOpen)}
            className="md:hidden inline-flex items-center gap-1.5 bg-[#EFE8E1] hover:bg-white text-[#3A3532] border border-[#DDD5CA] px-3 py-1.5 rounded-lg font-medium text-xs shadow-sm transition-all"
          >
            <Menu className="w-3.5 h-3.5 text-[#B76E79]" />
            <span>فهرس الكتاب ({activeEntries.length})</span>
          </button>
        </div>
      </header>

      {/* ── The Realistic Open Book Folio ── */}
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col">
        <div className="realistic-book-casing flex-1 flex flex-col md:flex-row bg-[#FDFBF7] rounded-2xl book-cover-frame book-stacked-edges overflow-hidden border border-[#E5DED4] min-h-[82vh]">
          
          {/* ══════════════════════════════════════════════════════════════
              1. القسم الأيمن: فهرس الكتاب (Table of Contents - 30%)
             ══════════════════════════════════════════════════════════════ */}
          <aside
            className={`w-full md:w-[32%] lg:w-[30%] bg-[#EFE8E1] border-b md:border-b-0 md:border-l border-[#DDD5CA] flex flex-col shrink-0 book-gutter-crease transition-all ${
              isMobileIndexOpen ? 'block' : 'hidden md:flex'
            }`}
          >
            {/* Top of Index */}
            <div className="p-5 sm:p-6 pb-3 border-b border-[#E3DBD0] bg-[#EBE3DC]/60">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[#B76E79]" />
                  <span className="font-literary text-lg font-bold text-[#2C2825] tracking-wide">
                    فهرس المذكرات
                  </span>
                </div>
                <span className="text-xs text-[#9C938B] font-medium">
                  {activeEntries.length} فصول
                </span>
              </div>

              {/* "+ إضافة مذكرة جديدة" button: SHOWN FOR OWNER ONLY */}
              {!isReadOnlyBook && (
                <button
                  onClick={handleStartNewEntry}
                  className="w-full flex items-center justify-center gap-2 bg-[#B76E79] hover:bg-[#9E5762] text-white font-semibold text-sm py-2.5 px-4 rounded-xl shadow-sm hover:shadow transition-all transform active:scale-95 ribbon-tag"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ إضافة مذكرة جديدة</span>
                </button>
              )}

              {/* Search Box in Table of Contents */}
              <div className="relative mt-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث في الفهرس..."
                  className="w-full bg-[#FAF6F0] border border-[#DDD5CA] rounded-xl pr-9 pl-8 py-2 text-xs text-[#3A3532] placeholder-[#A09890] focus:border-[#C9A9A6] focus:bg-white outline-none transition-all"
                />
                <Search className="w-3.5 h-3.5 text-[#9C938B] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9C938B] hover:text-[#3A3532]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* List of Chapters: ONLY activeEntries (no fallback data) */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 max-h-[55vh] md:max-h-[unset]">
              {filteredEntries.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#9C938B] space-y-2">
                  <p>لا توجد فصول مطابقة.</p>
                </div>
              ) : (
                filteredEntries.map((entry, idx) => {
                  const isSelected = selectedEntryId === entry.id && pageMode !== 'new' && pageMode !== 'dedication';
                  return (
                    <div
                      key={entry.id}
                      onClick={() => {
                        setSelectedEntryId(entry.id);
                        setPageMode('read');
                        setIsMobileIndexOpen(false);
                      }}
                      className={`group relative p-3.5 rounded-xl cursor-pointer transition-all duration-150 border flex flex-col justify-between ${
                        isSelected
                          ? 'bg-[#FDFBF7] text-[#2C2825] border-[#DDD5CA] shadow-sm font-semibold'
                          : 'bg-[#FAF6F0]/60 hover:bg-[#FAF6F0] text-[#4A423D] border-transparent hover:border-[#E5DDD2]'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute right-0 top-3 bottom-3 w-1 bg-[#B76E79] rounded-l-full" />
                      )}

                      <div className="flex items-center justify-between text-[11px] text-[#9C938B] mb-1">
                        <span>{entry.date}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-[#A89F97] font-mono">
                            فصل {filteredEntries.length - idx}
                          </span>

                          {/* Share single chapter button (Owner only) */}
                          {!isReadOnlyBook && (
                            <button
                              onClick={(e) => handleOpenShareSingle(e, entry)}
                              className="text-[#9C938B] hover:text-[#B76E79] p-1 rounded-md hover:bg-stone-200/50 transition-colors"
                              title="مشاركة هذا الفصل فقط"
                            >
                              <Share2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      <h3
                        className={`font-literary text-base leading-snug line-clamp-2 ${
                          isSelected ? 'font-bold text-[#2C2825]' : 'font-medium group-hover:text-[#2C2825]'
                        }`}
                      >
                        {entry.title}
                      </h3>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Footer of Index */}
            <div className="p-3.5 border-t border-[#DDD5CA] bg-[#EBE3DC]/40 flex items-center justify-between text-xs text-[#706761]">
              <button
                onClick={() => {
                  setPageMode('dedication');
                  setIsMobileIndexOpen(false);
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors ${
                  pageMode === 'dedication'
                    ? 'bg-[#B76E79] text-white'
                    : 'hover:bg-white/80 hover:text-[#2C2825]'
                }`}
              >
                <span>🌿 صفحة الإهداء</span>
              </button>

              {!isReadOnlyBook ? (
                <>
                  <button
                    onClick={handleOpenShareAll}
                    className="hover:text-[#B76E79] px-1.5 py-1 transition-colors"
                    title="مشاركة الكتاب كامل"
                  >
                    مشاركة الكتاب
                  </button>
                  <button
                    onClick={() => setIsBackupModalOpen(true)}
                    className="hover:text-[#B76E79] px-1.5 py-1 transition-colors"
                    title="النسخ الاحتياطي"
                  >
                    نسخ احتياطي
                  </button>
                </>
              ) : (
                <span className="text-[11px] text-[#9C938B]">
                  {activeEntries.length} فصول للقراءة
                </span>
              )}
            </div>
          </aside>

          {/* ══════════════════════════════════════════════════════════════
              2. كعب الكتاب (The Book Spine Gutter)
             ══════════════════════════════════════════════════════════════ */}
          <div className="hidden md:block w-3.5 bg-gradient-to-l from-[#FDFBF7] to-[#EAE2D8] border-r border-[#E0D7CB] shrink-0" />

          {/* ══════════════════════════════════════════════════════════════
              3. القسم الأيسر: صفحات الكتاب (The Book Pages - 70%)
             ══════════════════════════════════════════════════════════════ */}
          <main className="flex-1 bg-[#FDFBF7] book-page-crease flex flex-col justify-between p-6 sm:p-10 md:p-14 lg:p-16 relative overflow-y-auto">
            
            {/* Mode 1: Empty / Welcome State */}
            {pageMode === 'read' && !currentEntry && (
              <div className="my-auto text-center space-y-4 max-w-md mx-auto py-16">
                <div className="text-4xl text-[#B76E79]">🌿</div>
                <h2 className="font-literary text-2xl sm:text-3xl font-bold text-[#2C2825]">
                  اختر فصلاً من الفهرس لتبدأ القراءة
                </h2>
                {!isReadOnlyBook ? (
                  <>
                    <p className="text-sm text-[#706761] leading-relaxed">
                      أو اضغط على زر <span className="font-semibold text-[#B76E79]">«إضافة مذكرة جديدة»</span> في الفهرس لتدوين خواطر هذا اليوم في رحلتك.
                    </p>
                    <button
                      onClick={handleStartNewEntry}
                      className="inline-flex items-center gap-2 bg-[#B76E79] hover:bg-[#9E5762] text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-sm transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>تدوين مذكرة جديدة</span>
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-[#706761]">
                    تصفح الفصول المتاحة في القائمة الجانبية.
                  </p>
                )}
              </div>
            )}

            {/* Mode 2: Reading Mode (Selected Chapter) */}
            {pageMode === 'read' && currentEntry && (
              <article className="flex-1 flex flex-col justify-between max-w-2xl mx-auto w-full">
                <div>
                  <div className="flex items-center justify-between pb-4 mb-6 border-b border-[#F0EAE1] text-xs text-[#9C938B]">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-[#B76E79]/80" />
                      <span>{currentEntry.date}</span>
                    </div>

                    <div className="no-print flex items-center gap-3">
                      <button
                        onClick={() => window.print()}
                        className="text-[#9C938B] hover:text-[#3A3532] transition-colors p-1"
                        title="طباعة هذه الصفحة ككتاب"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>

                      {/* Owner actions: Edit, Delete, Share Single (NEVER in Reader Mode) */}
                      {!isReadOnlyBook && (
                        <>
                          <button
                            onClick={(e) => handleOpenShareSingle(e, currentEntry)}
                            className="inline-flex items-center gap-1 text-[#706761] hover:text-[#B76E79] font-medium transition-colors"
                            title="مشاركة هذا الفصل فقط برابط خاص"
                          >
                            <Share2 className="w-3 h-3" />
                            <span>مشاركة الفصل</span>
                          </button>
                          <span className="text-[#DDD5CA]">·</span>
                          <button
                            onClick={() => handleStartEdit(currentEntry)}
                            className="hover:text-[#B76E79] font-medium transition-colors"
                          >
                            تعديل
                          </button>
                          <span className="text-[#DDD5CA]">·</span>
                          <button
                            onClick={() => {
                              setEntryToDelete(currentEntry.id);
                              setIsDeleteModalOpen(true);
                            }}
                            className="text-red-700/70 hover:text-red-700 font-medium transition-colors"
                          >
                            حذف
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Chapter Title */}
                  <div className="text-center my-6 space-y-3">
                    <h1 className="font-literary text-3xl sm:text-4xl md:text-[42px] font-bold text-[#2C2825] leading-tight">
                      {currentEntry.title}
                    </h1>

                    <div className="flex items-center justify-center gap-4 py-1 text-[#B76E79]/80">
                      <div className="h-[1px] w-12 sm:w-16 bg-[#E8E1D5]" />
                      <span className="text-xs">🌿</span>
                      <div className="h-[1px] w-12 sm:w-16 bg-[#E8E1D5]" />
                    </div>
                  </div>

                  {/* Chapter Body Prose */}
                  <div className="font-literary text-lg sm:text-xl md:text-[22px] leading-[2.2] text-[#3A3532] whitespace-pre-wrap text-justify my-8 select-text">
                    {currentEntry.content}
                  </div>
                </div>

                {/* Page Bottom: Turners navigate strictly within activeEntries */}
                <div className="no-print pt-8 mt-12 border-t border-[#F0EAE1] flex items-center justify-between text-xs text-[#9C938B]">
                  <button
                    onClick={handlePrevChapter}
                    disabled={(() => {
                      const idx = sortedEntries.findIndex((e) => e.id === currentEntry.id);
                      return idx >= sortedEntries.length - 1;
                    })()}
                    className="inline-flex items-center gap-1 hover:text-[#B76E79] disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>الفصل السابق</span>
                  </button>

                  <div className="text-center">
                    <span>{calculateReadingStats(currentEntry.content).words} كلمة</span>
                    <span className="mx-1.5">·</span>
                    <span>{calculateReadingStats(currentEntry.content).minutesText}</span>
                  </div>

                  <button
                    onClick={handleNextChapter}
                    disabled={(() => {
                      const idx = sortedEntries.findIndex((e) => e.id === currentEntry.id);
                      return idx <= 0;
                    })()}
                    className="inline-flex items-center gap-1 hover:text-[#B76E79] disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <span>الفصل التالي</span>
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            )}

            {/* Mode 3: Write / Edit Mode (Owner only) */}
            {!isReadOnlyBook && (pageMode === 'new' || pageMode === 'edit') && (
              <div className="flex-1 flex flex-col justify-between max-w-2xl mx-auto w-full space-y-6">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-[#F0EAE1] text-xs">
                    <div className="flex items-center gap-2 text-[#9C938B]">
                      <Calendar className="w-3.5 h-3.5 text-[#B76E79]" />
                      <input
                        type="text"
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        className="bg-transparent border-b border-transparent hover:border-[#C9A9A6] focus:border-[#B76E79] text-[#706761] outline-none py-0.5 text-xs font-medium"
                        title="تعديل التاريخ"
                      />
                    </div>

                    <div className="text-xs text-[#B76E79] flex items-center gap-1.5 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#B76E79] animate-pulse" />
                      <span>{autoSaveStatus}</span>
                    </div>
                  </div>

                  <div className="my-6">
                    <input
                      type="text"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="عنوان اليوم..."
                      className="w-full font-literary text-2xl sm:text-3xl md:text-4xl font-bold text-[#2C2825] placeholder-[#BDB4AC] bg-transparent border-b border-[#E8E1D5] focus:border-[#B76E79] py-2 outline-none transition-colors"
                      autoFocus
                    />
                  </div>

                  <div>
                    <textarea
                      value={formContent}
                      onChange={(e) => setFormContent(e.target.value)}
                      placeholder="اكتب ما تشعر به هنا..."
                      rows={14}
                      className="w-full font-literary text-lg sm:text-xl md:text-[21px] leading-[2.2] text-[#3A3532] placeholder-[#BDB4AC] bg-transparent outline-none resize-none border-none py-2"
                    />
                  </div>
                </div>

                <div className="pt-6 border-t border-[#F0EAE1] flex items-center justify-between">
                  <span className="text-xs text-[#9C938B]">
                    {formContent.trim().split(/\s+/).filter(Boolean).length} كلمة
                  </span>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleCancelEdit}
                      className="px-5 py-2 rounded-xl text-xs font-medium text-[#706761] hover:bg-[#F2ECE4] transition-colors"
                    >
                      إلغاء
                    </button>
                    <button
                      onClick={handleSaveEntry}
                      className="inline-flex items-center gap-1.5 bg-[#B76E79] hover:bg-[#9E5762] text-white text-xs font-semibold px-6 py-2.5 rounded-xl shadow-sm transition-all transform active:scale-95"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>حفظ في الكتاب</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Mode 4: Book Dedication */}
            {pageMode === 'dedication' && (
              <div className="my-auto max-w-xl mx-auto w-full text-center space-y-6 py-10">
                <div className="text-3xl text-[#B76E79]">🌿</div>

                <div>
                  {!isReadOnlyBook ? (
                    <input
                      type="text"
                      value={activeSettings.recipientName}
                      onChange={(e) => setSettings((s) => ({ ...s, recipientName: e.target.value }))}
                      className="font-literary text-2xl sm:text-3xl font-bold text-[#2C2825] text-center w-full bg-transparent border-b border-dashed border-transparent hover:border-[#C9A9A6] focus:border-[#B76E79] outline-none"
                      placeholder="اسم الشخص المهدى إليه..."
                    />
                  ) : (
                    <h2 className="font-literary text-2xl sm:text-3xl font-bold text-[#2C2825]">
                      {activeSettings.recipientName || 'إلى العزيز الغائب الحاضر'}
                    </h2>
                  )}
                </div>

                <div className="flex items-center justify-center gap-3 text-[#B76E79]">
                  <div className="h-[1px] w-16 bg-[#E8E1D5]" />
                  <span className="text-xs">🕊️</span>
                  <div className="h-[1px] w-16 bg-[#E8E1D5]" />
                </div>

                <div>
                  {!isReadOnlyBook ? (
                    <textarea
                      value={activeSettings.dedication}
                      onChange={(e) => setSettings((s) => ({ ...s, dedication: e.target.value }))}
                      rows={6}
                      className="font-literary text-lg sm:text-xl leading-[2.3] text-[#4A423D] text-center w-full bg-transparent border border-dashed border-transparent hover:border-[#C9A9A6] focus:border-[#B76E79] rounded-xl p-3 outline-none resize-none"
                      placeholder="اكتب إهداء الكتاب هنا..."
                    />
                  ) : (
                    <p className="font-literary text-lg sm:text-xl leading-[2.3] text-[#4A423D] text-center">
                      {activeSettings.dedication}
                    </p>
                  )}
                </div>

                <div className="pt-4 flex flex-col items-center gap-3">
                  <span className="text-xs text-[#9C938B]">
                    صفحة الإهداء الافتتاحية للكتاب
                  </span>
                  {!isReadOnlyBook && (
                    <button
                      onClick={() => setPageMode('read')}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl border border-[#DDD5CA] bg-white text-[#706761] hover:text-[#B76E79] hover:border-[#C9A9A6] shadow-2xs transition-all"
                    >
                      <span>🌿 عودة إلى كتابي</span>
                    </button>
                  )}
                </div>
              </div>
            )}

          </main>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="no-print max-w-7xl mx-auto w-full mt-4 text-center text-xs text-[#9C938B] space-y-1">
        <p className="font-literary text-sm text-[#B76E79]">كُتب بصدق... 💭</p>
        <p>كتاب اليوميات الرقمية الورقي · خصوصية تامة بدون خوادم</p>
      </footer>

      {/* ── Share Modal (Owner Only) ── */}
      {isShareModalOpen && shareConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm">
          <div className="bg-[#FDFBF7] border border-[#DDD5CA] rounded-2xl p-6 sm:p-7 max-w-lg w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E1D5]">
              <div className="flex items-center gap-2">
                <Share2 className="w-5 h-5 text-[#B76E79]" />
                <h3 className="font-literary text-xl font-bold text-[#2C2825]">
                  {shareConfig.title}
                </h3>
              </div>
              <button
                onClick={() => setIsShareModalOpen(false)}
                className="text-[#9C938B] hover:text-[#2C2825] p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#F5EFEB] border border-[#E5DED4] rounded-xl p-3 text-xs text-[#706761] leading-relaxed">
              {shareConfig.type === 'all' ? (
                <p>
                  💡 <strong>هذا الرابط يعرض الكتاب كاملاً للقراءة فقط</strong>، بدون إمكانية التعديل أو الحذف، وبدون حفظ أي بيانات في جهاز المتلقي.
                </p>
              ) : (
                <p>
                  💡 <strong>هذا الرابط يعرض هذا الفصل فقط</strong>. لن يتمكن الشخص من رؤية باقي الفصول أو تصفح باقي الكتاب.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#706761]">
                رابط القراءة المشفر (يعمل بدون إنترنت وبخصوصية تامة):
              </label>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={shareConfig.url}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="w-full bg-white border border-[#DDD5CA] rounded-xl pl-10 pr-3 py-2.5 text-xs text-[#5C5550] font-mono outline-none focus:border-[#C9A9A6] select-all"
                />
                <Link2 className="w-4 h-4 text-[#9C938B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
              <button
                onClick={handleCopyShareLink}
                className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 bg-[#B76E79] hover:bg-[#9E5762] text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-xs transition-all active:scale-98"
              >
                {shareCopySuccess ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{shareCopySuccess ? '✓ تم نسخ الرابط بنجاح!' : 'نسخ الرابط'}</span>
              </button>

              <button
                onClick={handleShareWhatsApp}
                className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20BE5B] text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-xs transition-all"
              >
                <MessageCircle className="w-4 h-4" />
                <span>مشاركة عبر واتساب</span>
              </button>
            </div>

            <div className="pt-2 text-center border-t border-[#F0EAE1]">
              <a
                href={shareConfig.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[#9C938B] hover:text-[#B76E79] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>تجربة فتح الرابط في نافذة جديدة كما ستراه مها</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── Maha Reader Link Modal (Owner Only) ── */}
      {isMahaModalOpen && mahaTargetEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm">
          <div className="bg-[#FDFBF7] border border-[#DDD5CA] rounded-2xl p-6 sm:p-7 max-w-lg w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E1D5]">
              <div className="flex items-center gap-2">
                <span className="text-lg">🌿</span>
                <h3 className="font-literary text-xl font-bold text-[#2C2825]">
                  رابط قراءة مها
                </h3>
              </div>
              <button
                onClick={() => setIsMahaModalOpen(false)}
                className="text-[#9C938B] hover:text-[#2C2825] p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#706761]">
                اختر الفصل المراد إهداؤه لمها:
              </label>
              <select
                value={mahaSelectedChapterId || mahaTargetEntry.id}
                onChange={(e) => {
                  setMahaSelectedChapterId(e.target.value);
                  setMahaCopySuccess(false);
                }}
                className="w-full bg-[#FAF6F0] border border-[#DDD5CA] rounded-xl px-3 py-2.5 text-xs text-[#2C2825] outline-none focus:border-[#C9A9A6] font-medium"
              >
                {sortedEntries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} — ({e.date})
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-[#F5EFEB] border border-[#E5DED4] rounded-xl p-3 text-xs text-[#706761] leading-relaxed">
              <p>
                💡 <strong>هذا الرابط يعرض هذا الفصل فقط.</strong>
                <br />
                ستفتح مها الرابط لترى صفحة واحدة فقط كأنها ورقة من كتاب، بدون فهرس وبدون أزرار وبدون معرفة وجود أي فصول أخرى.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#706761]">
                رابط القراءة المشفر:
              </label>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={mahaShareUrl}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="w-full bg-white border border-[#DDD5CA] rounded-xl pl-10 pr-3 py-2.5 text-xs text-[#5C5550] font-mono outline-none focus:border-[#C9A9A6] select-all"
                />
                <Link2 className="w-4 h-4 text-[#9C938B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
              <button
                onClick={handleCopyMahaLink}
                className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 bg-[#B76E79] hover:bg-[#9E5762] text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-xs transition-all active:scale-98"
              >
                {mahaCopySuccess ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{mahaCopySuccess ? '✓ تم نسخ الرابط بنجاح!' : 'نسخ الرابط'}</span>
              </button>

              <button
                onClick={handleShareMahaWhatsApp}
                className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20BE5B] text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-xs transition-all"
              >
                <MessageCircle className="w-4 h-4" />
                <span>مشاركة عبر واتساب</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-[#FDFBF7] border border-[#DDD5CA] rounded-2xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="font-literary text-xl font-bold text-[#2C2825]">
              تأكيد حذف المذكرة
            </h3>
            <p className="text-sm text-[#706761] leading-relaxed">
              هل أنت متأكد من رغبتك في حذف هذا الفصل؟ لا يمكن التراجع عن هذا الإجراء بعد الحذف.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setEntryToDelete(null);
                }}
                className="px-4 py-2 text-xs font-medium rounded-xl border border-[#DDD5CA] text-[#706761] hover:bg-stone-100 transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-medium rounded-xl bg-red-700 hover:bg-red-800 text-white transition-colors"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Book Title Edit Modal ── */}
      {isEditingBookTitle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-[#FDFBF7] border border-[#DDD5CA] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="font-literary text-xl font-bold text-[#2C2825]">
              تعديل عنوان ووصف الكتاب
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#706761] mb-1">اسم الكتاب</label>
                <input
                  type="text"
                  value={tempBookTitle}
                  onChange={(e) => setTempBookTitle(e.target.value)}
                  className="w-full bg-white border border-[#DDD5CA] rounded-xl px-3 py-2 text-sm text-[#2C2825] outline-none focus:border-[#C9A9A6]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#706761] mb-1">الوصف المصاحب</label>
                <input
                  type="text"
                  value={tempBookSubtitle}
                  onChange={(e) => setTempBookSubtitle(e.target.value)}
                  className="w-full bg-white border border-[#DDD5CA] rounded-xl px-3 py-2 text-sm text-[#2C2825] outline-none focus:border-[#C9A9A6]"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsEditingBookTitle(false)}
                className="px-4 py-2 text-xs rounded-xl border border-[#DDD5CA] text-[#706761]"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  if (tempBookTitle.trim()) {
                    setSettings((s) => ({ ...s, title: tempBookTitle.trim(), subtitle: tempBookSubtitle.trim() }));
                  }
                  setIsEditingBookTitle(false);
                }}
                className="px-4 py-2 text-xs rounded-xl bg-[#B76E79] text-white font-medium"
              >
                حفظ التغييرات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Backup & Restore Modal ── */}
      {isBackupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-[#FDFBF7] border border-[#DDD5CA] rounded-2xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E8E1D5]">
              <h3 className="font-literary text-xl font-bold text-[#2C2825] flex items-center gap-2">
                <Download className="w-4 h-4 text-[#B76E79]" />
                <span>النسخ الاحتياطي وتصدير البيانات</span>
              </h3>
              <button onClick={() => setIsBackupModalOpen(false)} className="text-[#9C938B]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#706761] leading-relaxed">
              جميع الفصول محفوظة في متصفحك. لتحميل نسخة أو نقلها لجهاز آخر:
            </p>

            <div className="space-y-2.5">
              <button
                onClick={exportDataJSBackup}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-[#DDD5CA] hover:border-[#C9A9A6] bg-white text-right text-xs font-semibold text-[#2C2825] hover:text-[#B76E79] transition-all"
              >
                <div>
                  <div>📄 تنزيل كملف data.js مهيأ</div>
                  <div className="text-[11px] text-[#9C938B] font-normal">جاهز لوضعه في مجلد المشروع للاسترجاع الفوري.</div>
                </div>
                <Download className="w-4 h-4 text-[#B76E79]" />
              </button>

              <button
                onClick={exportJSONBackup}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-[#DDD5CA] hover:border-[#C9A9A6] bg-white text-right text-xs font-semibold text-[#2C2825] hover:text-[#B76E79] transition-all"
              >
                <div>
                  <div>💾 تنزيل نسخة احتياطية (data.json)</div>
                  <div className="text-[11px] text-[#9C938B] font-normal">ملف JSON قياسي يمكنك استيراده في أي وقت.</div>
                </div>
                <Download className="w-4 h-4 text-[#B76E79]" />
              </button>

              <label className="w-full flex items-center justify-between p-3 rounded-xl border border-[#DDD5CA] hover:border-[#C9A9A6] bg-white text-right text-xs font-semibold text-[#2C2825] hover:text-[#B76E79] transition-all cursor-pointer">
                <div>
                  <div>📥 استيراد نسخة احتياطية (رفع ملف JSON)</div>
                  <div className="text-[11px] text-[#9C938B] font-normal">استرجاع كافة المذكرات والإعدادات فوراً.</div>
                </div>
                <Upload className="w-4 h-4 text-[#B76E79]" />
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  onChange={handleImportJSON}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ── Standalone 4 Files Modal ── */}
      {isCodeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white border border-[#DDD5CA] rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-[#DDD5CA] flex items-center justify-between bg-[#FAF6F0]">
              <div>
                <h3 className="font-literary text-xl font-bold text-[#2C2825]">
                  أكواد الملفات الأربعة المستقلة (GitHub Pages / Vercel)
                </h3>
                <p className="text-xs text-[#706761] mt-0.5">
                  الكود مقسم بدقة إلى 4 ملفات بدون أي تعقيد.
                </p>
              </div>
              <button onClick={() => setIsCodeModalOpen(false)} className="text-[#9C938B]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex border-b border-[#DDD5CA] bg-stone-50 px-4 overflow-x-auto text-xs font-mono">
              {(['index.html', 'style.css', 'data.js', 'app.js'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveCodeTab(tab)}
                  className={`py-2.5 px-4 border-b-2 font-medium transition-colors ${
                    activeCodeTab === tab
                      ? 'border-[#B76E79] text-[#B76E79] bg-white font-bold'
                      : 'border-transparent text-[#706761] hover:text-[#2C2825]'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="p-4 flex-1 overflow-y-auto bg-[#1E1E1E] text-stone-200 font-mono text-xs leading-relaxed" dir="ltr">
              <pre className="overflow-x-auto whitespace-pre">
                <code>{standaloneCodes[activeCodeTab]}</code>
              </pre>
            </div>

            <div className="p-3 sm:p-4 border-t border-[#DDD5CA] bg-[#FAF6F0] flex items-center justify-between gap-3">
              <span className="text-xs text-[#706761]">
                💡 ضع الملفات الأربعة في مستودع GitHub وفعّل Pages، أو ارفع المجلد على Vercel.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    downloadFile(
                      standaloneCodes[activeCodeTab],
                      activeCodeTab,
                      activeCodeTab.endsWith('.html') ? 'text/html' : activeCodeTab.endsWith('.css') ? 'text/css' : 'application/javascript'
                    )
                  }
                  className="px-3 py-1.5 rounded-lg border border-[#DDD5CA] bg-white text-xs text-[#3A3532]"
                >
                  تحميل {activeCodeTab}
                </button>
                <button
                  onClick={() => handleCopyCode(standaloneCodes[activeCodeTab])}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#B76E79] text-white text-xs font-semibold"
                >
                  {copySuccess ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copySuccess ? 'تم النسخ!' : `نسخ كود ${activeCodeTab}`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
