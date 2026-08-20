import { AYAH_AUDIO_ATTRIBUTION } from '@quran-corpus/data/mobile';
import type { UiLocaleCode } from './languages';

export type UiStringKey =
  | 'tabs.home'
  | 'tabs.surahs'
  | 'tabs.bookmarks'
  | 'tabs.morphology'
  | 'tabs.settings'
  | 'tabs.dictionary'
  | 'tabs.menu'
  | 'menu.bookmarks'
  | 'menu.settings'
  | 'menu.about'
  | 'wbw.title'
  | 'wbw.previous'
  | 'wbw.next'
  // Prefix for the pager's range, read as "Ayahs 11-20". The bare "11-20" on
  // screen announces as two numbers with nothing to say what they count.
  | 'wbw.rangeLabel'
  | 'morphology.noHistory'
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
  | 'reader.ayahLabel'
  | 'reader.chooseLanguage'
  | 'reader.bismillah'
  | 'word.fullAnalysis'
  | 'word.root'
  | 'word.noGloss'
  | 'word.close'
  | 'word.segments'
  | 'word.grammar'
  | 'word.notFound'
  | 'word.transliteration'
  // No 'root.title': the sheet's 'word.root' is already the word "Root" in all
  // three locales, and a second key for the same string is a second place for
  // a translation to drift.
  | 'root.forms'
  | 'root.definitions'
  | 'root.noDefinition'
  | 'root.notFound'
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
  | 'settings.arabicSize'
  | 'settings.arabicSizeSmall'
  | 'settings.arabicSizeMedium'
  | 'settings.arabicSizeLarge'
  | 'settings.arabicSizeXlarge'
  | 'settings.reduceMotionOn'
  | 'settings.reduceMotionOff'
  | 'about.title'
  | 'about.credits'
  | 'about.sourceApprovalIncomplete'
  | 'about.sourceArabic'
  | 'about.sourceEnglish'
  | 'about.sourceUzbek'
  | 'about.sourceRussian'
  | 'about.sourceHafs'
  | 'about.sourceAudio'
  | 'search.title'
  | 'search.placeholder'
  | 'search.jump'
  | 'search.verses'
  | 'search.roots'
  | 'search.empty'
  | 'search.noResults'
  | 'search.loadFailed'
  | 'dictionary.browse'
  | 'dictionary.frequent'
  | 'dictionary.noRoots'
  // Accessible name for the hijāʾī grid: 29 sibling buttons whose own labels
  // are bare letters.
  | 'dictionary.alphabet'
  // Caption above the letter screen's Arabic hero, read as "Letter — ب".
  | 'dictionary.letterCaption'
  | 'dictionary.loadFailed'
  // Frequent-pane chips. Not reusing 'dictionary.loadFailed' for the failure:
  // it reads "Unable to load roots", which is wrong on Lemmas and Verbs.
  | 'dictionary.kindRoots'
  | 'dictionary.kindLemmas'
  | 'dictionary.kindVerbs'
  | 'dictionary.frequentFailed'
  // Accessible name for the chip row: three sibling buttons with nothing to
  // say they filter the list below.
  | 'dictionary.kindFilter'
  // Trails the count in a frequency row's accessible name, read as
  // "1722 occurrences". t() has no interpolation, so it is a bare word.
  | 'dictionary.occurrences'
  | 'concordance.empty'
  // A failed page must not read as "no occurrences" -- same finding as m-5.
  | 'concordance.loadFailed';

const strings: Record<UiLocaleCode, Record<UiStringKey, string>> = {
  en: {
    'tabs.home': 'Home',
    'tabs.surahs': 'Surahs',
    'tabs.bookmarks': 'Bookmarks',
    'tabs.morphology': 'Morphology',
    'tabs.settings': 'Settings',
    'tabs.dictionary': 'Dictionary',
    'tabs.menu': 'Menu',
    'menu.bookmarks': 'Bookmarks',
    'menu.settings': 'Settings',
    'menu.about': 'About & credits',
    'wbw.title': 'Word by word',
    'wbw.previous': 'Previous ayahs',
    'wbw.next': 'Next ayahs',
    'wbw.rangeLabel': 'Ayahs',
    'morphology.noHistory': 'No reading history yet',
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
    'reader.ayahLabel': 'Ayah',
    'reader.chooseLanguage': 'Choose translation language',
    'reader.bismillah': 'In the name of Allah, the Entirely Merciful, the Especially Merciful',
    'word.fullAnalysis': 'Full analysis',
    'word.root': 'Root',
    'word.noGloss': 'No translation for this word',
    'word.close': 'Close',
    'word.segments': 'Segments',
    'word.grammar': 'Grammar',
    'word.notFound': 'That word is not in the corpus',
    'word.transliteration': 'Transliteration',
    'root.forms': 'Forms',
    'root.definitions': 'Definitions',
    'root.noDefinition': 'No definition for this root yet',
    'root.notFound': 'That root is not in the corpus',
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
    'settings.arabicSize': 'Arabic size',
    'settings.arabicSizeSmall': 'Small',
    'settings.arabicSizeMedium': 'Medium',
    'settings.arabicSizeLarge': 'Large',
    'settings.arabicSizeXlarge': 'Extra large',
    'settings.reduceMotionOn': 'Reduce animations: on',
    'settings.reduceMotionOff': 'Reduce animations: off',
    'about.title': 'About Quran Corpus',
    'about.credits': 'Credits',
    'about.sourceApprovalIncomplete': 'Source approval incomplete',
    'about.sourceArabic': 'Arabic Quran text: Tanzil Uthmani XML via existing PWA importer. Source approval incomplete.',
    'about.sourceEnglish': 'English translation: Saheeh International. Source approval incomplete.',
    'about.sourceUzbek': 'Uzbek translation: Muhammad Sodik Muhammad Yusuf. Source approval incomplete.',
    'about.sourceRussian': 'Russian translation: Abu Adel. Source approval incomplete.',
    'about.sourceHafs': 'Hafs font: apps/mobile/assets/fonts/hafs.18.woff2. Source approval incomplete.',
    'about.sourceAudio': `Recitation: ${AYAH_AUDIO_ATTRIBUTION}. Source approval incomplete.`,
    'search.title': 'Search',
    'search.placeholder': 'Verse, word or root',
    'search.jump': 'Go to',
    'search.verses': 'Verses',
    'search.roots': 'Roots',
    'search.empty': 'Type a verse reference, a word, or a root',
    'search.noResults': 'Nothing found',
    'search.loadFailed': 'Unable to search',
    'dictionary.browse': 'Browse',
    'dictionary.frequent': 'Frequent',
    'dictionary.noRoots': 'No roots under this letter',
    'dictionary.alphabet': 'Arabic alphabet',
    'dictionary.letterCaption': 'Letter',
    'dictionary.loadFailed': 'Unable to load roots',
    'dictionary.kindRoots': 'Roots',
    'dictionary.kindLemmas': 'Lemmas',
    'dictionary.kindVerbs': 'Verbs',
    'dictionary.frequentFailed': 'Unable to load the list',
    'dictionary.kindFilter': 'Filter by kind',
    'dictionary.occurrences': 'occurrences',
    'concordance.empty': 'No occurrences',
    'concordance.loadFailed': 'Unable to load occurrences',
  },
  uz: {
    'tabs.home': 'Bosh sahifa',
    'tabs.surahs': 'Suralar',
    'tabs.bookmarks': 'Xatcho‘plar',
    'tabs.morphology': 'Morfologiya',
    'tabs.settings': 'Sozlamalar',
    'tabs.dictionary': 'Lug‘at',
    'tabs.menu': 'Menyu',
    'menu.bookmarks': 'Xatcho‘plar',
    'menu.settings': 'Sozlamalar',
    'menu.about': 'Dastur haqida',
    'wbw.title': 'So‘zma-so‘z',
    'wbw.previous': 'Oldingi oyatlar',
    'wbw.next': 'Keyingi oyatlar',
    'wbw.rangeLabel': 'Oyatlar',
    'morphology.noHistory': 'Hali o‘qish tarixi yo‘q',
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
    'reader.ayahLabel': 'Oyat',
    'reader.chooseLanguage': 'Tarjima tilini tanlang',
    'reader.bismillah': 'Mehribon va rahmli Alloh nomi bilan',
    'word.fullAnalysis': 'To‘liq tahlil',
    'word.root': 'O‘zak',
    'word.noGloss': 'Bu so‘z uchun tarjima yo‘q',
    'word.close': 'Yopish',
    'word.segments': 'Bo‘laklar',
    'word.grammar': 'Grammatika',
    'word.notFound': 'Bu so‘z korpusda yo‘q',
    'word.transliteration': 'Transliteratsiya',
    'root.forms': 'Shakllar',
    'root.definitions': 'Ta‘riflar',
    'root.noDefinition': 'Bu o‘zak uchun hali ta‘rif yo‘q',
    'root.notFound': 'Bu o‘zak korpusda yo‘q',
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
    'settings.arabicSize': 'Arab yozuvi o‘lchami',
    'settings.arabicSizeSmall': 'Kichik',
    'settings.arabicSizeMedium': 'O‘rtacha',
    'settings.arabicSizeLarge': 'Katta',
    'settings.arabicSizeXlarge': 'Juda katta',
    'settings.reduceMotionOn': 'Animatsiyalarni kamaytirish: yoqilgan',
    'settings.reduceMotionOff': 'Animatsiyalarni kamaytirish: o‘chirilgan',
    'about.title': 'Quran Corpus haqida',
    'about.credits': 'Manbalar',
    'about.sourceApprovalIncomplete': 'Manba tasdig‘i tugallanmagan',
    'about.sourceArabic': 'Arabcha Qur’on matni: mavjud PWA importeri orqali Tanzil Uthmani XML. Manba tasdig‘i tugallanmagan.',
    'about.sourceEnglish': 'Inglizcha tarjima: Saheeh International. Manba tasdig‘i tugallanmagan.',
    'about.sourceUzbek': 'O‘zbekcha tarjima: Muhammad Sodik Muhammad Yusuf. Manba tasdig‘i tugallanmagan.',
    'about.sourceRussian': 'Ruscha tarjima: Abu Adel. Manba tasdig‘i tugallanmagan.',
    'about.sourceHafs': 'Hafs shrifti: apps/mobile/assets/fonts/hafs.18.woff2. Manba tasdig‘i tugallanmagan.',
    'about.sourceAudio': `Qiroat: ${AYAH_AUDIO_ATTRIBUTION}. Manba tasdig‘i tugallanmagan.`,
    'search.title': 'Qidiruv',
    'search.placeholder': 'Oyat, so‘z yoki o‘zak',
    'search.jump': 'O‘tish',
    'search.verses': 'Oyatlar',
    'search.roots': 'O‘zaklar',
    'search.empty': 'Oyat raqami, so‘z yoki o‘zak kiriting',
    'search.noResults': 'Hech narsa topilmadi',
    'search.loadFailed': 'Qidirib bo‘lmadi',
    'dictionary.browse': 'Ko‘rish',
    'dictionary.frequent': 'Ko‘p uchraydigan',
    'dictionary.noRoots': 'Bu harfda o‘zak yo‘q',
    'dictionary.alphabet': 'Arab alifbosi',
    'dictionary.letterCaption': 'Harf',
    'dictionary.loadFailed': 'O‘zaklarni yuklab bo‘lmadi',
    'dictionary.kindRoots': 'O‘zaklar',
    'dictionary.kindLemmas': 'Lemmalar',
    'dictionary.kindVerbs': 'Fe’llar',
    'dictionary.frequentFailed': 'Ro‘yxatni yuklab bo‘lmadi',
    'dictionary.kindFilter': 'Turi bo‘yicha filtr',
    'dictionary.occurrences': 'marta uchraydi',
    'concordance.empty': 'Uchrashlar yo‘q',
    'concordance.loadFailed': 'Uchrashlarni yuklab bo‘lmadi',
  },
  ru: {
    'tabs.home': 'Главная',
    'tabs.surahs': 'Суры',
    'tabs.bookmarks': 'Закладки',
    'tabs.morphology': 'Морфология',
    'tabs.settings': 'Настройки',
    'tabs.dictionary': 'Словарь',
    'tabs.menu': 'Меню',
    'menu.bookmarks': 'Закладки',
    'menu.settings': 'Настройки',
    'menu.about': 'О приложении',
    'wbw.title': 'Пословно',
    'wbw.previous': 'Предыдущие аяты',
    'wbw.next': 'Следующие аяты',
    'wbw.rangeLabel': 'Аяты',
    'morphology.noHistory': 'Истории чтения пока нет',
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
    'reader.ayahLabel': 'Аят',
    'reader.chooseLanguage': 'Выберите язык перевода',
    'reader.bismillah': 'Именем Аллаха, Милостивого, Милосердного',
    'word.fullAnalysis': 'Полный разбор',
    'word.root': 'Корень',
    'word.noGloss': 'Нет перевода для этого слова',
    'word.close': 'Закрыть',
    'word.segments': 'Сегменты',
    'word.grammar': 'Грамматика',
    'word.notFound': 'Этого слова нет в корпусе',
    'word.transliteration': 'Транслитерация',
    'root.forms': 'Формы',
    'root.definitions': 'Определения',
    'root.noDefinition': 'Для этого корня пока нет определения',
    'root.notFound': 'Этого корня нет в корпусе',
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
    'settings.arabicSize': 'Размер арабского текста',
    'settings.arabicSizeSmall': 'Мелкий',
    'settings.arabicSizeMedium': 'Средний',
    'settings.arabicSizeLarge': 'Крупный',
    'settings.arabicSizeXlarge': 'Очень крупный',
    'settings.reduceMotionOn': 'Меньше анимации: включено',
    'settings.reduceMotionOff': 'Меньше анимации: выключено',
    'about.title': 'О Quran Corpus',
    'about.credits': 'Источники',
    'about.sourceApprovalIncomplete': 'Подтверждение источников не завершено',
    'about.sourceArabic': 'Арабский текст Корана: Tanzil Uthmani XML через существующий PWA-импортер. Подтверждение источника не завершено.',
    'about.sourceEnglish': 'Английский перевод: Saheeh International. Подтверждение источника не завершено.',
    'about.sourceUzbek': 'Узбекский перевод: Muhammad Sodik Muhammad Yusuf. Подтверждение источника не завершено.',
    'about.sourceRussian': 'Русский перевод: Abu Adel. Подтверждение источника не завершено.',
    'about.sourceHafs': 'Шрифт Hafs: apps/mobile/assets/fonts/hafs.18.woff2. Подтверждение источника не завершено.',
    'about.sourceAudio': `Чтение: ${AYAH_AUDIO_ATTRIBUTION}. Подтверждение источника не завершено.`,
    'search.title': 'Поиск',
    'search.placeholder': 'Аят, слово или корень',
    'search.jump': 'Перейти',
    'search.verses': 'Аяты',
    'search.roots': 'Корни',
    'search.empty': 'Введите номер аята, слово или корень',
    'search.noResults': 'Ничего не найдено',
    'search.loadFailed': 'Не удалось выполнить поиск',
    'dictionary.browse': 'Обзор',
    'dictionary.frequent': 'Частотные',
    'dictionary.noRoots': 'Под этой буквой нет корней',
    'dictionary.alphabet': 'Арабский алфавит',
    'dictionary.letterCaption': 'Буква',
    'dictionary.loadFailed': 'Не удалось загрузить корни',
    'dictionary.kindRoots': 'Корни',
    'dictionary.kindLemmas': 'Леммы',
    'dictionary.kindVerbs': 'Глаголы',
    'dictionary.frequentFailed': 'Не удалось загрузить список',
    'dictionary.kindFilter': 'Фильтр по типу',
    'dictionary.occurrences': 'вхождений',
    'concordance.empty': 'Нет вхождений',
    'concordance.loadFailed': 'Не удалось загрузить вхождения',
  },
};

export function t(locale: UiLocaleCode, key: UiStringKey): string {
  return strings[locale][key];
}
