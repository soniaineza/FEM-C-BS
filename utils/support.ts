import { Linking } from 'react-native';

// PLACEHOLDER — replace with Kimu Transport' real WhatsApp Business number
// (international format, digits only, no leading +) before shipping. Left
// as an obvious placeholder rather than guessing a real contact number.
export const SUPPORT_WHATSAPP_NUMBER = '250700000000';
export const SUPPORT_EMAIL = 'support@femcabs.com';

/** Opens a WhatsApp chat with Kimu Transport support, prefilled with a starter message. */
export function openWhatsAppSupport(message = "Hi Kimu Transport, I need help with..."): void {
  const url = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  Linking.openURL(url);
}
