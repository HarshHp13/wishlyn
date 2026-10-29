import type { ShippingAddress } from "../commerce/types";
export interface AccountProfile {
  ownerId: string;
  email: string;
  firstName: string;
  lastName: string;
  version: number;
}
export interface SavedAddress extends ShippingAddress {
  id: string;
  version: number;
  label: string;
}
export interface SavedWishlist {
  ownerId: string;
  items: string[];
  version: number;
  browserImported: boolean;
}
export type SupportKind = "help" | "return" | "cancellation";
export type SupportStatus = "open" | "in_progress" | "resolved";
export interface SupportRequest {
  id: string;
  ownerId: string;
  orderId: string;
  kind: SupportKind;
  subject: string;
  status: SupportStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  events?: SupportEvent[];
}
export interface SupportEvent {
  id: string;
  actorRole: "customer" | "admin";
  message: string;
  status: SupportStatus;
  createdAt: string;
}
