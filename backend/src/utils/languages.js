// اللغات المدعومة.
// code: رمز الترجمة | locale: للمتصفح (التعرف/النطق) | whisper: اسم اللغة عند Whisper | iso3: رمز ElevenLabs Scribe
export const LANGUAGES = [
  { code: 'ar', name: 'العربية', native: 'العربية', locale: 'ar-SA', whisper: 'arabic', iso3: 'ara' },
  { code: 'en', name: 'الإنجليزية', native: 'English', locale: 'en-US', whisper: 'english', iso3: 'eng' },
  { code: 'ha', name: 'الهوسا', native: 'Hausa', locale: 'ha-NG', whisper: 'hausa', iso3: 'hau' },
  { code: 'fr', name: 'الفرنسية', native: 'Français', locale: 'fr-FR', whisper: 'french', iso3: 'fra' },
  { code: 'es', name: 'الإسبانية', native: 'Español', locale: 'es-ES', whisper: 'spanish', iso3: 'spa' },
  { code: 'de', name: 'الألمانية', native: 'Deutsch', locale: 'de-DE', whisper: 'german', iso3: 'deu' },
  { code: 'it', name: 'الإيطالية', native: 'Italiano', locale: 'it-IT', whisper: 'italian', iso3: 'ita' },
  { code: 'pt', name: 'البرتغالية', native: 'Português', locale: 'pt-BR', whisper: 'portuguese', iso3: 'por' },
  { code: 'ru', name: 'الروسية', native: 'Русский', locale: 'ru-RU', whisper: 'russian', iso3: 'rus' },
  { code: 'tr', name: 'التركية', native: 'Türkçe', locale: 'tr-TR', whisper: 'turkish', iso3: 'tur' },
  { code: 'fa', name: 'الفارسية', native: 'فارسی', locale: 'fa-IR', whisper: 'persian', iso3: 'fas' },
  { code: 'ur', name: 'الأردية', native: 'اردو', locale: 'ur-PK', whisper: 'urdu', iso3: 'urd' },
  { code: 'hi', name: 'الهندية', native: 'हिन्दी', locale: 'hi-IN', whisper: 'hindi', iso3: 'hin' },
  { code: 'bn', name: 'البنغالية', native: 'বাংলা', locale: 'bn-BD', whisper: 'bengali', iso3: 'ben' },
  { code: 'id', name: 'الإندونيسية', native: 'Bahasa Indonesia', locale: 'id-ID', whisper: 'indonesian', iso3: 'ind' },
  { code: 'ms', name: 'الماليزية', native: 'Bahasa Melayu', locale: 'ms-MY', whisper: 'malay', iso3: 'msa' },
  { code: 'zh', name: 'الصينية', native: '中文', locale: 'zh-CN', whisper: 'chinese', iso3: 'zho' },
  { code: 'ja', name: 'اليابانية', native: '日本語', locale: 'ja-JP', whisper: 'japanese', iso3: 'jpn' },
  { code: 'ko', name: 'الكورية', native: '한국어', locale: 'ko-KR', whisper: 'korean', iso3: 'kor' },
  { code: 'sw', name: 'السواحيلية', native: 'Kiswahili', locale: 'sw-KE', whisper: 'swahili', iso3: 'swa' },
  { code: 'nl', name: 'الهولندية', native: 'Nederlands', locale: 'nl-NL', whisper: 'dutch', iso3: 'nld' },
  { code: 'pl', name: 'البولندية', native: 'Polski', locale: 'pl-PL', whisper: 'polish', iso3: 'pol' },
  { code: 'uk', name: 'الأوكرانية', native: 'Українська', locale: 'uk-UA', whisper: 'ukrainian', iso3: 'ukr' },
  { code: 'he', name: 'العبرية', native: 'עברית', locale: 'he-IL', whisper: 'hebrew', iso3: 'heb' },
  { code: 'th', name: 'التايلندية', native: 'ไทย', locale: 'th-TH', whisper: 'thai', iso3: 'tha' },
  { code: 'vi', name: 'الفيتنامية', native: 'Tiếng Việt', locale: 'vi-VN', whisper: 'vietnamese', iso3: 'vie' },
];

// لغات يضعف فيها Whisper كثيراً → تُوجَّه إلى ElevenLabs Scribe إن وُجد المفتاح
export const WEAK_WHISPER = new Set(['ha']);

export const isSupportedLanguage = (code) => code === 'auto' || LANGUAGES.some((l) => l.code === code);
export const localeOf = (code) => LANGUAGES.find((l) => l.code === code)?.locale || 'en-US';
export const byCode = (code) => LANGUAGES.find((l) => l.code === code);
export const fromWhisperName = (name = '') => LANGUAGES.find((l) => l.whisper === String(name).toLowerCase())?.code || null;
export const fromIso3 = (iso3 = '') => LANGUAGES.find((l) => l.iso3 === String(iso3).toLowerCase())?.code || null;
