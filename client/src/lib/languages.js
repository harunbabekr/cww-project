// تُولَّد من backend/src/utils/languages.js — حافظ على تطابق الرموز
export const LANGUAGES = [
  {
    "code": "ar",
    "name": "العربية",
    "native": "العربية",
    "locale": "ar-SA"
  },
  {
    "code": "en",
    "name": "الإنجليزية",
    "native": "English",
    "locale": "en-US"
  },
  {
    "code": "ha",
    "name": "الهوسا",
    "native": "Hausa",
    "locale": "ha-NG"
  },
  {
    "code": "fr",
    "name": "الفرنسية",
    "native": "Français",
    "locale": "fr-FR"
  },
  {
    "code": "es",
    "name": "الإسبانية",
    "native": "Español",
    "locale": "es-ES"
  },
  {
    "code": "de",
    "name": "الألمانية",
    "native": "Deutsch",
    "locale": "de-DE"
  },
  {
    "code": "it",
    "name": "الإيطالية",
    "native": "Italiano",
    "locale": "it-IT"
  },
  {
    "code": "pt",
    "name": "البرتغالية",
    "native": "Português",
    "locale": "pt-BR"
  },
  {
    "code": "ru",
    "name": "الروسية",
    "native": "Русский",
    "locale": "ru-RU"
  },
  {
    "code": "tr",
    "name": "التركية",
    "native": "Türkçe",
    "locale": "tr-TR"
  },
  {
    "code": "fa",
    "name": "الفارسية",
    "native": "فارسی",
    "locale": "fa-IR"
  },
  {
    "code": "ur",
    "name": "الأردية",
    "native": "اردو",
    "locale": "ur-PK"
  },
  {
    "code": "hi",
    "name": "الهندية",
    "native": "हिन्दी",
    "locale": "hi-IN"
  },
  {
    "code": "bn",
    "name": "البنغالية",
    "native": "বাংলা",
    "locale": "bn-BD"
  },
  {
    "code": "id",
    "name": "الإندونيسية",
    "native": "Bahasa Indonesia",
    "locale": "id-ID"
  },
  {
    "code": "ms",
    "name": "الماليزية",
    "native": "Bahasa Melayu",
    "locale": "ms-MY"
  },
  {
    "code": "zh",
    "name": "الصينية",
    "native": "中文",
    "locale": "zh-CN"
  },
  {
    "code": "ja",
    "name": "اليابانية",
    "native": "日本語",
    "locale": "ja-JP"
  },
  {
    "code": "ko",
    "name": "الكورية",
    "native": "한국어",
    "locale": "ko-KR"
  },
  {
    "code": "sw",
    "name": "السواحيلية",
    "native": "Kiswahili",
    "locale": "sw-KE"
  },
  {
    "code": "nl",
    "name": "الهولندية",
    "native": "Nederlands",
    "locale": "nl-NL"
  },
  {
    "code": "pl",
    "name": "البولندية",
    "native": "Polski",
    "locale": "pl-PL"
  },
  {
    "code": "uk",
    "name": "الأوكرانية",
    "native": "Українська",
    "locale": "uk-UA"
  },
  {
    "code": "he",
    "name": "العبرية",
    "native": "עברית",
    "locale": "he-IL"
  },
  {
    "code": "th",
    "name": "التايلندية",
    "native": "ไทย",
    "locale": "th-TH"
  },
  {
    "code": "vi",
    "name": "الفيتنامية",
    "native": "Tiếng Việt",
    "locale": "vi-VN"
  }
];

export const langName = (code) => LANGUAGES.find((l) => l.code === code)?.native || code;
export const langLocale = (code) => LANGUAGES.find((l) => l.code === code)?.locale || 'en-US';
