import { Linking } from 'react-native';

import { appApiClient } from '../services/http';

// How riders and drivers reach human support outside the in-app tickets.
// The WhatsApp number and e-mail address are server configuration
// (SUPPORT_WHATSAPP_NUMBER / SUPPORT_EMAIL, read by GET /api/support/contacts)
// so they can be changed without an app release and are never guessed here:
// a contact the server does not provide is null and its button is hidden.
export interface SupportContacts {
  /** International format, digits only (e.g. 2507XXXXXXXX), or null. */
  whatsappNumber: string | null;
  email: string | null;
}

const client = appApiClient;

export async function getSupportContacts(): Promise<SupportContacts> {
  const json = await client().get<{ whatsappNumber?: string | null; email?: string | null }>('/support/contacts');
  return {
    whatsappNumber: json.whatsappNumber || null,
    email: json.email || null,
  };
}

/** Opens a WhatsApp chat with support, prefilled with a starter message. */
export function openWhatsAppSupport(number: string, message = 'Hi Kimu Transport, I need help with...'): Promise<void> {
  const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  return Linking.openURL(url);
}

/** Opens the device mail app addressed to support. */
export function openEmailSupport(email: string): Promise<void> {
  return Linking.openURL(`mailto:${email}`);
}
