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
  // Names the density chip for TalkBack. The two segment labels below name
  // layouts, not settings, so the group needs its own word.
  | 'wbw.density'
  | 'wbw.densityHybrid'
  | 'wbw.densityDense'
  | 'morphology.noHistory'
  | 'bookmarks.empty'
  | 'bookmarks.entryPrefix'
  | 'bookmarks.loadFailed'
  | 'home.continue'
  | 'home.noHistory'
  | 'home.loadFailed'
  | 'home.streak'
  | 'home.rootsStudied'
  | 'home.rootsThisWeek'
  | 'home.ayahOfTheDay'
  | 'home.countersFailed'
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
  | 'reader.previousAyah'
  | 'reader.nextAyah'
  // Names the repeat toggle. "Continuous" alone is an adjective with no noun;
  // the control turns play-through-the-surah on and off.
  | 'reader.continuous'
  // Names the tappable reciter label. The name itself is a proper noun, so
  // without this TalkBack announces only "Mahmoud Khalil Al-Husary" with
  // nothing to say it opens a picker.
  | 'reader.reciter'
  // Heads the reciter sheet, the way reader.chooseLanguage heads the
  // translation one.
  | 'reader.chooseReciter'
  | 'reader.ayahLabel'
  | 'reader.chooseLanguage'
  | 'reader.bismillah'
  | 'reader.back'
  | 'reader.mode'
  | 'reader.modeMushaf'
  | 'reader.modeTranslation'
  | 'reader.modeWbw'
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
  // Names the root screen in its slim header bar.
  | 'root.heading'
  | 'root.noDefinition'
  | 'root.notFound'
  | 'root.previous'
  | 'root.next'
  // Accessible name for the Previous/Next row: two sibling buttons with
  // nothing on their own to say they navigate the hijāʾī root list.
  | 'root.adjacent'
  // Accessible name for the derived-form filter toolbar above the
  // concordance heading. Same toolbar-not-radiogroup reasoning as the
  // Frequent pane's kind chips: the chips multi-select.
  | 'root.formsFilter'
  // Root screen's concordance heading, read as "Concordance (1722)". t() has
  // no interpolation, so the count is concatenated at the call site.
  | 'concordance.heading'
  // Names the lemma screen in its slim header bar.
  | 'lemma.heading'
  | 'lemma.notFound'
  // Caption above a lemma's top glosses: contextual word-by-word
  // translations, not a definition -- see LemmaScreen and text/gloss.ts.
  // No 'lemma.root': 'word.root' is already "Root" in all three locales.
  | 'lemma.translatedAs'
  // Accessible name + sheet heading for the info button beside
  // 'lemma.translatedAs'.
  | 'lemma.aboutTranslations'
  // The info sheet's one paragraph: glosses are word-by-word translations,
  // not dictionary definitions.
  | 'lemma.translationsNote'
  // Caption above the lemma's root-definition card: a lemma links to one root
  // and shows that root's own DefinitionCard.
  | 'lemma.rootDefinition'
  // The lemma screen's root link, relabelled from 'word.root' ("Root"): the
  // link now sits below a DefinitionCard/lemma-no-definition line, and a bare
  // "Root" there reads as a repeat of the caption above it.
  | 'lemma.viewRoot'
  | 'lemma.adjacent'
  // Accessible name for the info sheet's backdrop/dismiss control.
  | 'lemma.close'
  | 'lemma.previous'
  | 'lemma.next'
  | 'surahList.ayahsSuffix'
  | 'surahList.loadFailed'
  // Browse modes (M6c). `mode` names the segmented control itself; `juzLabel`
  // and `pageLabel` prefix a number in a row and in its spoken label, which is
  // why they are words rather than "Juz 2" templates.
  | 'browse.mode'
  | 'browse.surah'
  | 'browse.juz'
  | 'browse.page'
  | 'browse.revealed'
  | 'browse.meccan'
  | 'browse.medinan'
  | 'browse.juzLabel'
  | 'browse.pageLabel'
  | 'browse.opensAt'
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
  // Accessible name for the hijāʾī grid: 29 sibling buttons whose own labels
  // are bare letters.
  | 'dictionary.alphabet'
  | 'dictionary.loadFailed'
  // Browse's search box.
  | 'dictionary.searchPlaceholder'
  | 'dictionary.searchLabel'
  | 'dictionary.clearSearch'
  // Sort toggle: alphabetical vs. by frequency.
  | 'dictionary.sortAlpha'
  | 'dictionary.sortFreq'
  // Accessible name for the sort toggle's toolbar.
  | 'dictionary.sortFilter'
  | 'dictionary.noRootsFound'
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
  // Column labels above the Frequent list. Without them the trailing number is
  // a bare integer beside an Arabic word, which reads as anything from a verse
  // number to a page reference.
  | 'dictionary.columnRank'
  | 'dictionary.columnForm'
  | 'dictionary.columnCount'
  | 'concordance.empty'
  // A failed page must not read as "no occurrences" -- same finding as m-5.
  | 'concordance.loadFailed'
  | 'concordance.showFullVerse'
  | 'text.showMore'
  | 'text.showLess';

export const strings: Record<UiLocaleCode, Record<UiStringKey, string>> = {
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
    'wbw.density': 'Layout',
    'wbw.densityHybrid': 'Verse',
    'wbw.densityDense': 'Dense',
    'morphology.noHistory': 'No reading history yet',
    'bookmarks.empty': 'No bookmarks yet',
    'bookmarks.entryPrefix': 'Open',
    'bookmarks.loadFailed': 'Unable to load bookmarks',
    'home.continue': 'Continue reading',
    'home.noHistory': 'No reading history yet',
    'home.loadFailed': 'Unable to load reading history',
    'home.streak': 'Day streak',
    'home.rootsStudied': 'Roots studied',
    'home.rootsThisWeek': 'Roots this week',
    'home.ayahOfTheDay': 'Ayah of the day',
    'home.countersFailed': 'Unable to load your counters',
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
    'reader.previousAyah': 'Previous ayah',
    'reader.nextAyah': 'Next ayah',
    'reader.continuous': 'Continuous play',
    'reader.reciter': 'Reciter',
    'reader.chooseReciter': 'Choose reciter',
    'reader.ayahLabel': 'Ayah',
    'reader.chooseLanguage': 'Choose translation language',
    'reader.bismillah': 'In the name of Allah, the Entirely Merciful, the Especially Merciful',
    'reader.back': 'Back',
    'reader.mode': 'Reading mode',
    'reader.modeMushaf': 'Mushaf',
    'reader.modeTranslation': 'Translation',
    'reader.modeWbw': 'Words',
    'word.fullAnalysis': 'Full analysis',
    'word.root': 'Root',
    'word.noGloss': 'No translation for this word',
    'word.close': 'Close',
    'word.segments': 'Segments',
    'word.grammar': 'Grammar',
    'word.notFound': 'That word is not in the corpus',
    'word.transliteration': 'Transliteration',
    'root.heading': 'Root',
    'root.noDefinition': 'No definition for this root yet',
    'root.notFound': 'That root is not in the corpus',
    'root.previous': 'Previous',
    'root.next': 'Next',
    'root.adjacent': 'Adjacent roots',
    'root.formsFilter': 'Filter by form',
    'lemma.heading': 'Lemma',
    'lemma.notFound': 'This lemma is not in the corpus',
    'lemma.translatedAs': 'Translated as',
    'lemma.aboutTranslations': 'About these translations',
    'lemma.translationsNote': 'From word-by-word translations, ordered by frequency — not dictionary definitions.',
    'lemma.rootDefinition': 'Definition of root',
    'lemma.viewRoot': 'View root',
    'lemma.adjacent': 'Adjacent lemmas',
    'lemma.close': 'Close',
    'lemma.previous': 'Previous',
    'lemma.next': 'Next',
    'surahList.ayahsSuffix': 'ayahs',
    'surahList.loadFailed': 'Unable to load surahs',
    'browse.mode': 'Browse by',
    'browse.surah': 'Surah',
    'browse.juz': 'Juz',
    'browse.page': 'Page',
    'browse.revealed': 'Revealed',
    'browse.meccan': 'Meccan',
    'browse.medinan': 'Medinan',
    'browse.juzLabel': 'Juz',
    'browse.pageLabel': 'Page',
    'browse.opensAt': 'opens at',
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
    // Names the host, not a reciter: ten of them are selectable now, so a
    // single hard-coded name would be wrong for nine of the choices.
    'about.sourceAudio': 'Recitation: everyayah.com, reciter chosen in Settings. Source approval incomplete.',
    'search.title': 'Search',
    'search.placeholder': 'Verse, word or root',
    'search.jump': 'Go to',
    'search.verses': 'Verses',
    'search.roots': 'Roots',
    'search.empty': 'Type a verse reference, a word, or a root',
    'search.noResults': 'Nothing found',
    'search.loadFailed': 'Unable to search',
    'dictionary.browse': 'Browse',
    // The key predates the label. It stayed 'frequent' because the testID
    // and every call site are named after it; the *label* changed because
    // "Frequent" read as a sort order next to Browse's own "By frequency" chip.
    'dictionary.frequent': 'Most used',
    'dictionary.alphabet': 'Arabic alphabet',
    'dictionary.loadFailed': 'Unable to load roots',
    'dictionary.searchPlaceholder': 'Search roots or meaning…',
    'dictionary.searchLabel': 'Search roots or meaning',
    'dictionary.clearSearch': 'Clear search',
    'dictionary.sortAlpha': 'Alphabetical',
    'dictionary.sortFreq': 'By frequency',
    'dictionary.sortFilter': 'Sort order',
    'dictionary.noRootsFound': 'No roots found',
    'dictionary.kindRoots': 'Roots',
    'dictionary.kindLemmas': 'Lemmas',
    'dictionary.kindVerbs': 'Verbs',
    'dictionary.frequentFailed': 'Unable to load the list',
    'dictionary.kindFilter': 'Filter by kind',
    'dictionary.occurrences': 'occurrences',
    'dictionary.columnRank': '#',
    'dictionary.columnForm': 'Form',
    'dictionary.columnCount': 'Count',
    'concordance.heading': 'Concordance',
    'concordance.empty': 'No occurrences',
    'concordance.loadFailed': 'Unable to load occurrences',
    'concordance.showFullVerse': 'Show full verse',
    'text.showMore': 'Show more',
    'text.showLess': 'Show less',
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
    'wbw.density': 'Ko‘rinish',
    'wbw.densityHybrid': 'Oyat',
    'wbw.densityDense': 'Zich',
    'morphology.noHistory': 'Hali o‘qish tarixi yo‘q',
    'bookmarks.empty': 'Hali xatcho‘p yo‘q',
    'bookmarks.entryPrefix': 'Ochish',
    'bookmarks.loadFailed': 'Xatcho‘plarni yuklab bo‘lmadi',
    'home.continue': 'O‘qishni davom ettirish',
    'home.noHistory': 'Hali o‘qish tarixi yo‘q',
    'home.loadFailed': 'O‘qish tarixini yuklab bo‘lmadi',
    'home.streak': 'Kunlik seriya',
    'home.rootsStudied': 'O‘rganilgan o‘zaklar',
    'home.rootsThisWeek': 'Shu haftadagi o‘zaklar',
    'home.ayahOfTheDay': 'Kunlik oyat',
    'home.countersFailed': 'Hisoblagichlarni yuklab bo‘lmadi',
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
    'reader.previousAyah': 'Oldingi oyat',
    'reader.nextAyah': 'Keyingi oyat',
    'reader.continuous': 'Ketma-ket ijro',
    'reader.reciter': 'Qori',
    'reader.chooseReciter': 'Qorini tanlang',
    'reader.ayahLabel': 'Oyat',
    'reader.chooseLanguage': 'Tarjima tilini tanlang',
    'reader.bismillah': 'Mehribon va rahmli Alloh nomi bilan',
    'reader.back': 'Orqaga',
    'reader.mode': 'O‘qish rejimi',
    'reader.modeMushaf': 'Mushaf',
    'reader.modeTranslation': 'Tarjima',
    'reader.modeWbw': 'So‘zlar',
    'word.fullAnalysis': 'To‘liq tahlil',
    'word.root': 'O‘zak',
    'word.noGloss': 'Bu so‘z uchun tarjima yo‘q',
    'word.close': 'Yopish',
    'word.segments': 'Bo‘laklar',
    'word.grammar': 'Grammatika',
    'word.notFound': 'Bu so‘z korpusda yo‘q',
    'word.transliteration': 'Transliteratsiya',
    'root.heading': 'O‘zak',
    'root.noDefinition': 'Bu o‘zak uchun hali ta‘rif yo‘q',
    'root.notFound': 'Bu o‘zak korpusda yo‘q',
    'root.previous': 'Oldingi',
    'root.next': 'Keyingi',
    'root.adjacent': 'Qo‘shni o‘zaklar',
    'root.formsFilter': 'Shakl bo‘yicha filtr',
    'lemma.heading': 'Lemma',
    'lemma.notFound': 'Bu lemma korpusda yo‘q',
    'lemma.translatedAs': 'Tarjimasi',
    'lemma.aboutTranslations': 'Bu tarjimalar haqida',
    'lemma.translationsNote': 'So‘zma-so‘z tarjimalardan olingan, chastota bo‘yicha tartiblangan — lug‘at ta’riflari emas.',
    'lemma.rootDefinition': 'O‘zak ta’rifi',
    'lemma.viewRoot': 'O‘zakni ko‘rish',
    'lemma.adjacent': 'Qo‘shni lemmalar',
    'lemma.close': 'Yopish',
    'lemma.previous': 'Oldingi',
    'lemma.next': 'Keyingi',
    'surahList.ayahsSuffix': 'oyat',
    'surahList.loadFailed': 'Suralarni yuklab bo‘lmadi',
    'browse.mode': 'Saralash',
    'browse.surah': 'Sura',
    'browse.juz': 'Juz',
    'browse.page': 'Sahifa',
    'browse.revealed': 'Nozil tartibi',
    'browse.meccan': 'Makkiy',
    'browse.medinan': 'Madaniy',
    'browse.juzLabel': 'Juz',
    'browse.pageLabel': 'Sahifa',
    'browse.opensAt': 'boshlanishi',
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
    'about.sourceAudio': 'Qiroat: everyayah.com, qori Sozlamalarda tanlanadi. Manba tasdig‘i tugallanmagan.',
    'search.title': 'Qidiruv',
    'search.placeholder': 'Oyat, so‘z yoki o‘zak',
    'search.jump': 'O‘tish',
    'search.verses': 'Oyatlar',
    'search.roots': 'O‘zaklar',
    'search.empty': 'Oyat raqami, so‘z yoki o‘zak kiriting',
    'search.noResults': 'Hech narsa topilmadi',
    'search.loadFailed': 'Qidirib bo‘lmadi',
    'dictionary.browse': 'Ko‘rish',
    'dictionary.frequent': 'Eng ko‘p ishlatiladigan',
    'dictionary.alphabet': 'Arab alifbosi',
    'dictionary.loadFailed': 'O‘zaklarni yuklab bo‘lmadi',
    'dictionary.searchPlaceholder': 'O‘zak yoki ma’noni qidirish…',
    'dictionary.searchLabel': 'O‘zak yoki ma’noni qidirish',
    'dictionary.clearSearch': 'Qidiruvni tozalash',
    'dictionary.sortAlpha': 'Alifbo bo‘yicha',
    'dictionary.sortFreq': 'Chastota bo‘yicha',
    'dictionary.sortFilter': 'Tartiblash',
    'dictionary.noRootsFound': 'O‘zak topilmadi',
    'dictionary.kindRoots': 'O‘zaklar',
    'dictionary.kindLemmas': 'Lemmalar',
    'dictionary.kindVerbs': 'Fe’llar',
    'dictionary.frequentFailed': 'Ro‘yxatni yuklab bo‘lmadi',
    'dictionary.kindFilter': 'Turi bo‘yicha filtr',
    'dictionary.occurrences': 'marta uchraydi',
    'dictionary.columnRank': '#',
    'dictionary.columnForm': 'Shakl',
    'dictionary.columnCount': 'Soni',
    'concordance.heading': 'Uchrashuvlar',
    'concordance.empty': 'Uchrashlar yo‘q',
    'concordance.loadFailed': 'Uchrashlarni yuklab bo‘lmadi',
    'concordance.showFullVerse': 'To‘liq oyatni ko‘rsatish',
    'text.showMore': 'Ko‘proq ko‘rsatish',
    'text.showLess': 'Kamroq ko‘rsatish',
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
    'wbw.density': 'Вид',
    'wbw.densityHybrid': 'Аят',
    'wbw.densityDense': 'Плотно',
    'morphology.noHistory': 'Истории чтения пока нет',
    'bookmarks.empty': 'Закладок пока нет',
    'bookmarks.entryPrefix': 'Открыть',
    'bookmarks.loadFailed': 'Не удалось загрузить закладки',
    'home.continue': 'Продолжить чтение',
    'home.noHistory': 'Истории чтения пока нет',
    'home.loadFailed': 'Не удалось загрузить историю чтения',
    'home.streak': 'Серия дней',
    'home.rootsStudied': 'Изучено корней',
    'home.rootsThisWeek': 'Корни за неделю',
    'home.ayahOfTheDay': 'Аят дня',
    'home.countersFailed': 'Не удалось загрузить счётчики',
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
    'reader.previousAyah': 'Предыдущий аят',
    'reader.nextAyah': 'Следующий аят',
    'reader.continuous': 'Непрерывное воспроизведение',
    'reader.reciter': 'Чтец',
    'reader.chooseReciter': 'Выберите чтеца',
    'reader.ayahLabel': 'Аят',
    'reader.chooseLanguage': 'Выберите язык перевода',
    'reader.bismillah': 'Именем Аллаха, Милостивого, Милосердного',
    'reader.back': 'Назад',
    'reader.mode': 'Режим чтения',
    'reader.modeMushaf': 'Мусхаф',
    'reader.modeTranslation': 'Перевод',
    'reader.modeWbw': 'Слова',
    'word.fullAnalysis': 'Полный разбор',
    'word.root': 'Корень',
    'word.noGloss': 'Нет перевода для этого слова',
    'word.close': 'Закрыть',
    'word.segments': 'Сегменты',
    'word.grammar': 'Грамматика',
    'word.notFound': 'Этого слова нет в корпусе',
    'word.transliteration': 'Транслитерация',
    'root.heading': 'Корень',
    'root.noDefinition': 'Для этого корня пока нет определения',
    'root.notFound': 'Этого корня нет в корпусе',
    'root.previous': 'Предыдущий',
    'root.next': 'Следующий',
    'root.adjacent': 'Соседние корни',
    'root.formsFilter': 'Фильтр по форме',
    'lemma.heading': 'Лемма',
    'lemma.notFound': 'Этой леммы нет в корпусе',
    'lemma.translatedAs': 'Переводится как',
    'lemma.aboutTranslations': 'Об этих переводах',
    'lemma.translationsNote': 'Из пословных переводов, упорядочены по частоте — это не словарные определения.',
    'lemma.rootDefinition': 'Определение корня',
    'lemma.viewRoot': 'Открыть корень',
    'lemma.adjacent': 'Соседние леммы',
    'lemma.close': 'Закрыть',
    'lemma.previous': 'Предыдущая',
    'lemma.next': 'Следующая',
    'surahList.ayahsSuffix': 'аятов',
    'surahList.loadFailed': 'Не удалось загрузить суры',
    'browse.mode': 'Сортировка',
    'browse.surah': 'Сура',
    'browse.juz': 'Джуз',
    'browse.page': 'Страница',
    'browse.revealed': 'Ниспослание',
    'browse.meccan': 'Мекканские',
    'browse.medinan': 'Мединские',
    'browse.juzLabel': 'Джуз',
    'browse.pageLabel': 'Страница',
    'browse.opensAt': 'начало',
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
    'about.sourceAudio': 'Чтение: everyayah.com, чтец выбирается в настройках. Подтверждение источника не завершено.',
    'search.title': 'Поиск',
    'search.placeholder': 'Аят, слово или корень',
    'search.jump': 'Перейти',
    'search.verses': 'Аяты',
    'search.roots': 'Корни',
    'search.empty': 'Введите номер аята, слово или корень',
    'search.noResults': 'Ничего не найдено',
    'search.loadFailed': 'Не удалось выполнить поиск',
    'dictionary.browse': 'Обзор',
    'dictionary.frequent': 'Самые частые',
    'dictionary.alphabet': 'Арабский алфавит',
    'dictionary.loadFailed': 'Не удалось загрузить корни',
    'dictionary.searchPlaceholder': 'Поиск корня или значения…',
    'dictionary.searchLabel': 'Поиск корня или значения',
    'dictionary.clearSearch': 'Очистить поиск',
    'dictionary.sortAlpha': 'По алфавиту',
    'dictionary.sortFreq': 'По частоте',
    'dictionary.sortFilter': 'Сортировка',
    'dictionary.noRootsFound': 'Корни не найдены',
    'dictionary.kindRoots': 'Корни',
    'dictionary.kindLemmas': 'Леммы',
    'dictionary.kindVerbs': 'Глаголы',
    'dictionary.frequentFailed': 'Не удалось загрузить список',
    'dictionary.kindFilter': 'Фильтр по типу',
    'dictionary.occurrences': 'вхождений',
    'dictionary.columnRank': '№',
    'dictionary.columnForm': 'Форма',
    'dictionary.columnCount': 'Кол-во',
    'concordance.heading': 'Конкорданс',
    'concordance.empty': 'Нет вхождений',
    'concordance.loadFailed': 'Не удалось загрузить вхождения',
    'concordance.showFullVerse': 'Показать весь аят',
    'text.showMore': 'Показать больше',
    'text.showLess': 'Свернуть',
  },
};

export function t(locale: UiLocaleCode, key: UiStringKey): string {
  return strings[locale][key];
}
