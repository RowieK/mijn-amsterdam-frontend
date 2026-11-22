// Een eenvoudige controle op de vorm: iets@domein.tld, zonder spaties. De echte controle is de verificatiecode.
export function isValidEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
