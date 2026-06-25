const rtlLanguages = new Set(["ar", "ur", "fa", "he", "iw", "ps", "sd"]);

export function getTextDirection(languageCode: string): "rtl" | "ltr" {
  return rtlLanguages.has(languageCode.trim().toLowerCase()) ? "rtl" : "ltr";
}
