import type { UiLocaleCode } from './languages';

export type UiStringKey =
  | 'tabs.home'
  | 'tabs.surahs'
  | 'tabs.bookmarks'
  | 'tabs.settings'
  | 'bookmarks.empty'
  | 'bookmarks.entryPrefix'
  | 'bookmarks.loadFailed'
  | 'home.continue'
  | 'home.noHistory'
  | 'home.loadFailed'
  | 'reader.loadFailed'
  | 'reader.invalidSurah'
  | 'reader.bookmarkFailed'
  | 'reader.positionFailed'
  | 'reader.audioFailed'
  | 'reader.translation'
  | 'reader.bookmark'
  | 'reader.removeBookmark'
  | 'reader.play'
  | 'reader.pause'
  | 'surahList.ayahsSuffix'
  | 'surahList.loadFailed'
  | 'settings.language'
  | 'settings.theme'
  | 'settings.about'
  | 'settings.analyticsOn'
  | 'settings.analyticsOff'
  | 'settings.storageUnavailable'
  | 'settings.themeSystem'
  | 'settings.themeLight'
  | 'settings.themeDark'
  | 'about.title'
  | 'about.credits'
  | 'about.sourceApprovalIncomplete'
  | 'about.sourceArabic'
  | 'about.sourceEnglish'
  | 'about.sourceUzbek'
  | 'about.sourceRussian'
  | 'about.sourceHafs'
  | 'about.sourceAudio';

const strings: Record<UiLocaleCode, Record<UiStringKey, string>> = {
  en: {
    'tabs.home': 'Home',
    'tabs.surahs': 'Surahs',
    'tabs.bookmarks': 'Bookmarks',
    'tabs.settings': 'Settings',
    'bookmarks.empty': 'No bookmarks yet',
    'bookmarks.entryPrefix': 'Open',
    'bookmarks.loadFailed': 'Unable to load bookmarks',
    'home.continue': 'Continue reading',
    'home.noHistory': 'No reading history yet',
    'home.loadFailed': 'Unable to load reading history',
    'reader.loadFailed': 'Unable to load surah',
    'reader.invalidSurah': 'That surah does not exist',
    'reader.bookmarkFailed': 'Unable to update bookmark',
    'reader.positionFailed': 'Unable to save reading position',
    'reader.audioFailed': 'Unable to play audio',
    'reader.translation': 'Translation',
    'reader.bookmark': 'Bookmark',
    'reader.removeBookmark': 'Remove bookmark',
    'reader.play': 'Play',
    'reader.pause': 'Pause',
    'surahList.ayahsSuffix': 'ayahs',
    'surahList.loadFailed': 'Unable to load surahs',
    'settings.language': 'Language',
    'settings.theme': 'Theme',
    'settings.about': 'About and credits',
    'settings.analyticsOn': 'Analytics: On',
    'settings.analyticsOff': 'Analytics: Off',
    'settings.storageUnavailable': 'Settings cannot be saved right now. Changes may be lost when you close the app.',
    'settings.themeSystem': 'System',
    'settings.themeLight': 'Light',
    'settings.themeDark': 'Dark',
    'about.title': 'About Quran Corpus',
    'about.credits': 'Credits',
    'about.sourceApprovalIncomplete': 'Source approval incomplete',
    'about.sourceArabic': 'Arabic Quran text: Tanzil Uthmani XML via existing PWA importer. Source approval incomplete.',
    'about.sourceEnglish': 'English translation: Saheeh International. Source approval incomplete.',
    'about.sourceUzbek': 'Uzbek translation: Muhammad Sodik Muhammad Yusuf. Source approval incomplete.',
    'about.sourceRussian': 'Russian translation: Abu Adel. Source approval incomplete.',
    'about.sourceHafs': 'Hafs font: apps/mobile/assets/fonts/hafs.18.woff2. Source approval incomplete.',
    'about.sourceAudio': 'Abdul Rashid Sufi audio metadata: Source approval incomplete.',
  },
  uz: {
    'tabs.home': 'Bosh sahifa',
    'tabs.surahs': 'Suralar',
    'tabs.bookmarks': 'Xatcho‘plar',
    'tabs.settings': 'Sozlamalar',
    'bookmarks.empty': 'Hali xatcho‘p yo‘q',
    'bookmarks.entryPrefix': 'Ochish',
    'bookmarks.loadFailed': 'Xatcho‘plarni yuklab bo‘lmadi',
    'home.continue': 'O‘qishni davom ettirish',
    'home.noHistory': 'Hali o‘qish tarixi yo‘q',
    'home.loadFailed': 'O‘qish tarixini yuklab bo‘lmadi',
    'reader.loadFailed': 'Surani yuklab bo‘lmadi',
    'reader.invalidSurah': 'Bunday sura yo‘q',
    'reader.bookmarkFailed': 'Xatcho‘pni yangilab bo‘lmadi',
    'reader.positionFailed': 'O‘qish joyini saqlab bo‘lmadi',
    'reader.audioFailed': 'Audioni ijro etib bo‘lmadi',
    'reader.translation': 'Tarjima',
    'reader.bookmark': 'Xatcho‘p',
    'reader.removeBookmark': 'Xatcho‘pni olib tashlash',
    'reader.play': 'Ijro etish',
    'reader.pause': 'To‘xtatish',
    'surahList.ayahsSuffix': 'oyat',
    'surahList.loadFailed': 'Suralarni yuklab bo‘lmadi',
    'settings.language': 'Til',
    'settings.theme': 'Mavzu',
    'settings.about': 'Ilova va manbalar',
    'settings.analyticsOn': 'Tahlil: yoqilgan',
    'settings.analyticsOff': 'Tahlil: o‘chirilgan',
    'settings.storageUnavailable': 'Sozlamalarni hozir saqlab bo‘lmaydi. Ilovani yopganingizda o‘zgarishlar yo‘qolishi mumkin.',
    'settings.themeSystem': 'Tizim',
    'settings.themeLight': 'Yorug‘',
    'settings.themeDark': 'Qorong‘i',
    'about.title': 'Quran Corpus haqida',
    'about.credits': 'Manbalar',
    'about.sourceApprovalIncomplete': 'Manba tasdig‘i tugallanmagan',
    'about.sourceArabic': 'Arabcha Qur’on matni: mavjud PWA importeri orqali Tanzil Uthmani XML. Manba tasdig‘i tugallanmagan.',
    'about.sourceEnglish': 'Inglizcha tarjima: Saheeh International. Manba tasdig‘i tugallanmagan.',
    'about.sourceUzbek': 'O‘zbekcha tarjima: Muhammad Sodik Muhammad Yusuf. Manba tasdig‘i tugallanmagan.',
    'about.sourceRussian': 'Ruscha tarjima: Abu Adel. Manba tasdig‘i tugallanmagan.',
    'about.sourceHafs': 'Hafs shrifti: apps/mobile/assets/fonts/hafs.18.woff2. Manba tasdig‘i tugallanmagan.',
    'about.sourceAudio': 'Abdul Rashid Sufi audio metama’lumotlari: manba tasdig‘i tugallanmagan.',
  },
  ru: {
    'tabs.home': 'Главная',
    'tabs.surahs': 'Суры',
    'tabs.bookmarks': 'Закладки',
    'tabs.settings': 'Настройки',
    'bookmarks.empty': 'Закладок пока нет',
    'bookmarks.entryPrefix': 'Открыть',
    'bookmarks.loadFailed': 'Не удалось загрузить закладки',
    'home.continue': 'Продолжить чтение',
    'home.noHistory': 'Истории чтения пока нет',
    'home.loadFailed': 'Не удалось загрузить историю чтения',
    'reader.loadFailed': 'Не удалось загрузить суру',
    'reader.invalidSurah': 'Такой суры не существует',
    'reader.bookmarkFailed': 'Не удалось обновить закладку',
    'reader.positionFailed': 'Не удалось сохранить позицию чтения',
    'reader.audioFailed': 'Не удалось воспроизвести аудио',
    'reader.translation': 'Перевод',
    'reader.bookmark': 'Закладка',
    'reader.removeBookmark': 'Удалить закладку',
    'reader.play': 'Воспроизвести',
    'reader.pause': 'Пауза',
    'surahList.ayahsSuffix': 'аятов',
    'surahList.loadFailed': 'Не удалось загрузить суры',
    'settings.language': 'Язык',
    'settings.theme': 'Тема',
    'settings.about': 'О приложении и источниках',
    'settings.analyticsOn': 'Аналитика: включена',
    'settings.analyticsOff': 'Аналитика: выключена',
    'settings.storageUnavailable': 'Настройки сейчас не сохраняются. Изменения могут быть потеряны при закрытии приложения.',
    'settings.themeSystem': 'Система',
    'settings.themeLight': 'Светлая',
    'settings.themeDark': 'Темная',
    'about.title': 'О Quran Corpus',
    'about.credits': 'Источники',
    'about.sourceApprovalIncomplete': 'Подтверждение источников не завершено',
    'about.sourceArabic': 'Арабский текст Корана: Tanzil Uthmani XML через существующий PWA-импортер. Подтверждение источника не завершено.',
    'about.sourceEnglish': 'Английский перевод: Saheeh International. Подтверждение источника не завершено.',
    'about.sourceUzbek': 'Узбекский перевод: Muhammad Sodik Muhammad Yusuf. Подтверждение источника не завершено.',
    'about.sourceRussian': 'Русский перевод: Abu Adel. Подтверждение источника не завершено.',
    'about.sourceHafs': 'Шрифт Hafs: apps/mobile/assets/fonts/hafs.18.woff2. Подтверждение источника не завершено.',
    'about.sourceAudio': 'Аудиометаданные Abdul Rashid Sufi: подтверждение источника не завершено.',
  },
};

export function t(locale: UiLocaleCode, key: UiStringKey): string {
  return strings[locale][key];
}
