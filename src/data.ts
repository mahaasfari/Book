import { DiaryEntry, BookSettings } from './types';

export const DEFAULT_BOOK_SETTINGS: BookSettings = {
  title: 'رحلة اشتياق',
  subtitle: 'أوراق كُتبت في غيابك، لتُقرأ في حضورك',
  dedication: 'إلى من يسكن البال دون استئذان، وإلى ذلك الطيف الوفي الذي يرافقني في أدق تفاصيل أيامي.. أهدي إليك هذه الصفحات، شاهداً على أيامٍ كنتَ فيها الحاضر الأكبر رغم المسافات.',
  recipientName: 'إلى العزيز الغائب الحاضر',
};

export const INITIAL_ENTRIES: DiaryEntry[] = [];

// Helper to format date in Arabic naturally: e.g. "الأحد، 7 أكتوبر 2026"
export function formatCurrentDateArabic(dateObj: Date = new Date()): string {
  const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const months = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

  const dayName = days[dateObj.getDay()];
  const dayNum = dateObj.getDate();
  const monthName = months[dateObj.getMonth()];
  const year = dateObj.getFullYear();

  return `${dayName}، ${dayNum} ${monthName} ${year}`;
}
