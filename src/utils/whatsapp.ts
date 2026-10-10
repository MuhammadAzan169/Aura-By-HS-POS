/**
 * WhatsApp without an API account: a wa.me link opens WhatsApp (phone or
 * desktop) with the message typed in, ready to send. Free, and it comes from
 * the salon's own number, which customers already recognise.
 */

/** Pakistani numbers in any common format → 923001234567. */
export function toWhatsAppNumber(phone: string): string | null {
  let digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `92${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('3')) digits = `92${digits}`;
  return digits.length >= 10 ? digits : null;
}

export function whatsappLink(phone: string | null | undefined, message: string): string {
  const number = phone ? toWhatsAppNumber(phone) : null;
  const text = encodeURIComponent(message);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function openWhatsApp(phone: string | null | undefined, message: string): void {
  window.open(whatsappLink(phone, message), '_blank', 'noopener');
}
