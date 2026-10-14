export interface DiaryEntry {
  id: string;
  title: string;
  content: string;
  date: string; // Formatted date string, e.g. "الأحد، 7 أكتوبر 2026"
  createdAt: number; // Timestamp for sorting
  updatedAt?: number;
}

export interface BookSettings {
  title: string;
  subtitle: string;
  dedication: string;
  recipientName: string;
}
