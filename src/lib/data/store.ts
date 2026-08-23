import documentsJson from "@/data/generated/documents.json";
import structuredJson from "@/data/generated/structured.json";
import type { Account, DocChunk, DocMeta, DocumentsFile, Order, StructuredFile, Ticket } from "./types";

const docs = documentsJson as unknown as DocumentsFile;
const data = structuredJson as unknown as StructuredFile;

/** Dataset snapshot — the single reference clock for all time-based logic. */
export const SNAPSHOT_TIME = new Date(data.snapshot_time);

export function docById(id: string): DocMeta | undefined {
  return docs.documents.find((d) => d.doc_id === id);
}

export function chunksByDoc(docId: string): DocChunk[] {
  return docs.chunks.filter((c) => c.doc_id === docId);
}

export function allChunks(): DocChunk[] {
  return docs.chunks;
}

export function allDocMetas(): DocMeta[] {
  return docs.documents;
}

export function accountById(id: string): Account | undefined {
  return data.accounts.find((a) => a.account_id === id.toUpperCase());
}

export function orderById(id: string): Order | undefined {
  return data.orders.find((o) => o.order_id.toUpperCase() === id.toUpperCase());
}

export function ticketById(id: string): Ticket | undefined {
  return data.tickets.find((t) => t.ticket_id.toUpperCase() === id.toUpperCase());
}

export function ordersForAccount(accountId: string): Order[] {
  return data.orders.filter((o) => o.account_id === accountId);
}

export function ticketsForAccount(accountId: string): Ticket[] {
  return data.tickets.filter((t) => t.account_id === accountId);
}

export function allOrders(): Order[] {
  return data.orders;
}

export function allTickets(): Ticket[] {
  return data.tickets;
}

export function allAccounts(): Account[] {
  return data.accounts;
}

/** Contract doc (if any) governing an account. */
export function contractForAccount(accountId: string): DocMeta | undefined {
  return docs.documents.find((d) => d.type === "CONTRACT" && d.applies_to.includes(accountId));
}
