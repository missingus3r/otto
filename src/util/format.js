// Currency formatting using Intl.NumberFormat. Falls back to "<amount> <ccy>"
// if the locale or currency is unsupported.

const LANG_LOCALE = {
  es: 'es-UY',
  pt: 'pt-BR',
  en: 'en-US',
  fr: 'fr-FR',
  it: 'it-IT',
};

export function formatPrice(amount, currency, lang) {
  const ccy = String(currency || 'UYU').toUpperCase();
  const locale = LANG_LOCALE[lang] || 'es-UY';
  const num = Number(amount);
  if (!Number.isFinite(num)) return `${amount || 0} ${ccy}`;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: ccy,
      maximumFractionDigits: 0,
    }).format(num);
  } catch (err) {
    return `${num} ${ccy}`;
  }
}

export function formatPriceRange(min, max, currency, lang) {
  const a = formatPrice(min, currency, lang);
  if (Number(min) === Number(max) || !max) return a;
  const b = formatPrice(max, currency, lang);
  return `${a} – ${b}`;
}

export default { formatPrice, formatPriceRange };
