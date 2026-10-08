import { apiClient } from './api-client';
import { SupportTicket, SupportMessage, supportTicketFromBackendJson, supportMessageFromBackendJson, SUPPORT_CATEGORY_IDS } from '@kimu/shared/types/support';

// Response envelopes verified against server/src/routes/support.routes.js.
export async function submitRequest(params: {
  topicKey: keyof typeof SUPPORT_CATEGORY_IDS;
  subject: string;
  message: string;
  rideId?: string;
}): Promise<SupportTicket> {
  const category = SUPPORT_CATEGORY_IDS[params.topicKey] ?? 'general';
  const json = await apiClient.post<{ ticket: any }>('/support', {
    category,
    subject: params.subject,
    message: params.message,
    rideId: params.rideId,
  });
  return supportTicketFromBackendJson(json.ticket);
}

export async function getTickets(): Promise<SupportTicket[]> {
  const json = await apiClient.get<{ tickets: any[] }>('/support');
  return json.tickets.map(supportTicketFromBackendJson);
}

export async function getTicketWithMessages(
  ticketId: string
): Promise<{ ticket: SupportTicket; messages: SupportMessage[] }> {
  const json = await apiClient.get<{ ticket: any; messages: any[] }>(`/support/${ticketId}`);
  return {
    ticket: supportTicketFromBackendJson(json.ticket),
    messages: json.messages.map(supportMessageFromBackendJson),
  };
}

export async function replyToTicket(ticketId: string, message: string): Promise<SupportMessage> {
  const json = await apiClient.post<{ message: any }>(`/support/${ticketId}/messages`, { message });
  return supportMessageFromBackendJson(json.message);
}

export async function closeTicket(ticketId: string): Promise<SupportTicket> {
  const json = await apiClient.post<{ ticket: any }>(`/support/${ticketId}/close`);
  return supportTicketFromBackendJson(json.ticket);
}
