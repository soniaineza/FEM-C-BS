export interface SupportTicket {
  id: string;
  rideId?: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
}

export function isTicketResolved(t: SupportTicket): boolean {
  return t.status === 'resolved' || t.status === 'closed';
}

export function supportTicketFromBackendJson(json: any): SupportTicket {
  return {
    id: json.id,
    rideId: json.rideId ?? json.ride_id ?? undefined,
    category: json.category,
    subject: json.subject,
    message: json.message,
    status: json.status,
    createdAt: json.createdAt ?? json.created_at,
    updatedAt: json.updatedAt ?? json.updated_at ?? undefined,
  };
}

export interface SupportMessage {
  id: string;
  senderRole: string;
  message: string;
  createdAt: string;
}

export function supportMessageFromBackendJson(json: any): SupportMessage {
  return {
    id: json.id,
    senderRole: json.senderRole ?? json.sender_role,
    message: json.message ?? json.content,
    createdAt: json.createdAt ?? json.created_at,
  };
}

// Maps friendly UI topic labels to backend category ids (lib/services/support_service.dart).
// No type annotation here deliberately — it lets TS infer the literal key
// union (keyof typeof SUPPORT_CATEGORY_IDS) instead of widening to `string`,
// which is what help-support.tsx needs to pass a topic key straight into
// the strictly-typed useTranslation() t().
export const SUPPORT_CATEGORY_IDS = {
  rideIssue: 'general',
  paymentIssue: 'payment',
  driverIssue: 'report_driver',
  accountIssue: 'app_issue',
  safetyConcern: 'billing',
  otherTopic: 'general',
} as const;
