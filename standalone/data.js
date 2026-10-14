/**
 * data.js - ملف تخزين بيانات المذكرات وإعدادات الكتاب
 * 
 * يمكنك استبدال أو تعديل محتوى هذا الملف لاسترجاع بياناتك 
 * أو نقله لأي جهاز آخر دون الحاجة لأي قاعدة بيانات معقدة.
 */

const DEFAULT_BOOK_SETTINGS = {
  title: "رحلة اشتياق",
  subtitle: "أوراق كُتبت في غيابك، لتُقرأ في حضورك",
  dedication: "إلى من يسكن البال دون استئذان، وإلى ذلك الطيف الوفي الذي يرافقني في أدق تفاصيل أيامي.. أهدي إليك هذه الصفحات، شاهداً على أيامٍ كنتَ فيها الحاضر الأكبر رغم المسافات.",
  recipientName: "إلى العزيز الغائب الحاضر"
};

const INITIAL_DIARY_ENTRIES = [];

// تصدير للبيئة العامة في المتصفح ونظام Node إذا تطلب الأمر
if (typeof window !== "undefined") {
  window.DEFAULT_BOOK_SETTINGS = DEFAULT_BOOK_SETTINGS;
  window.INITIAL_DIARY_ENTRIES = INITIAL_DIARY_ENTRIES;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { DEFAULT_BOOK_SETTINGS, INITIAL_DIARY_ENTRIES };
}
