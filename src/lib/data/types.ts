export type AuthorityTier = 1 | 2 | 3 | 5;

export interface DocMeta {
  doc_id: string;
  file: string;
  title: string;
  type: "POLICY" | "SOP" | "GUIDE" | "CONTRACT";
  /** CURRENT | DEPRECATED | ACTIVE — drives trust badges */
  status: string;
  authority_tier: AuthorityTier;
  effective_date: string;
  end_date?: string;
  supersedes?: string;
  superseded_by?: string;
  applies_to: string[]; // ["*"] or account ids
}

export interface DocChunk {
  chunk_id: string; // e.g. DOC-003#2
  doc_id: string;
  seq: number;
  title: string;
  text: string;
}

export interface DocumentsFile {
  generated_at: string;
  documents: DocMeta[];
  chunks: DocChunk[];
}

export interface Account {
  account_id: string;
  account_name: string;
  plan: "Enterprise" | "Growth" | "Standard";
  status: string;
  csm: string | null;
  contract_file: string | null;
  premium_support: boolean;
  notes: string | null;
}

export type OrderStatus = "DRAFT" | "BOOKED" | "PICKED_UP" | "DELIVERED";

export interface Order {
  order_id: string;
  account_id: string;
  carrier: string;
  status: OrderStatus;
  booked_at: string; // "YYYY-MM-DD HH:mm"
  pickup_window_start: string | null;
  pickup_window_end: string | null;
  pickup_actual_at: string | null;
  shipment_fee_inr: number;
  carrier_fault: boolean;
  customer_fault: boolean;
  cancellation_requested_at: string | null;
  notes: string | null;
}

export interface Ticket {
  ticket_id: string;
  account_id: string;
  created_at: string;
  status: "open" | "closed";
  subject: string;
  description: string;
  channel: string;
  assigned_to: string | null;
  last_customer_message_at: string | null;
  historical_resolution: string | null;
}

export interface StructuredFile {
  snapshot_time: string; // ISO with offset — the single reference clock
  accounts: Account[];
  orders: Order[];
  tickets: Ticket[];
}
