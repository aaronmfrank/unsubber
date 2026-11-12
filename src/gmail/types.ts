export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

export interface GmailMessageRef {
  id: string;
  threadId: string;
}

export interface GmailMessageList {
  messages?: GmailMessageRef[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailHistoryPage {
  history?: { id: string; messagesAdded?: { message: GmailMessageRef & { labelIds?: string[] } }[] }[];
  nextPageToken?: string;
  historyId: string;
}

export interface GmailLabel {
  id: string;
  name: string;
  type?: 'system' | 'user';
}

export interface GmailFilter {
  id: string;
  criteria?: { from?: string };
  action?: { addLabelIds?: string[]; removeLabelIds?: string[] };
}

export interface GmailMessagePart {
  mimeType?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  /** Milliseconds since the epoch, as a string. */
  internalDate: string;
  payload?: GmailMessagePart;
}
