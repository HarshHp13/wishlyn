export type ProductStatus = 'draft' | 'published' | 'archived';
export interface MerchantVariant {
  id: string; productId: string; metalType: string; purity: string; size: string;
  price: number; stock: number; reservedStock: number; active: boolean;
}
export interface StockEvent {
  id: string; variantId: string; actorId: string; adjustment: number;
  stockBefore: number; stockAfter: number; reason: string; createdAt: string;
}
export interface MerchantProduct {
  id: string; title: string; description: string; categoryId: string; images: string[];
  stone: string; dimensions: string; careInstructions: string; status: ProductStatus;
  revision: number; factsConfirmed: boolean; updatedAt: string;
  variants: MerchantVariant[]; history: StockEvent[];
}
export interface MerchantSummary {
  id: string; title: string; status: ProductStatus; revision: number; image: string | null;
  availableStock: number; lowStock: boolean; updatedAt: string;
}
