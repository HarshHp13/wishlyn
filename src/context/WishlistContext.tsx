"use client";
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { savedWishlistStore as wishlistStore } from "../lib/account/wishlist-store";
import { validId } from "../lib/shopping-state";

interface WishlistContextType {
  wishlistItems: string[];
  addToWishlist: (id: string) => void;
  removeFromWishlist: (id: string) => void;
  toggleWishlist: (id: string) => void;
  isInWishlist: (id: string) => boolean;
  wishlistCount: number;
  wishlistStatus: "loading" | "ready" | "error";
  wishlistNotice: string;
  retryWishlist: () => Promise<void>;
}
const WishlistContext = createContext<WishlistContextType | undefined>(
  undefined,
);
export function WishlistProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(
    wishlistStore.subscribe,
    wishlistStore.getSnapshot,
    wishlistStore.getServerSnapshot,
  );
  return (
    <WishlistContext.Provider
      value={{
        wishlistItems: state.items,
        wishlistCount: state.items.length,
        wishlistStatus: state.status,
        wishlistNotice: state.notice,
        addToWishlist: (id) => {
          if (validId(id)) wishlistStore.mutate("add", id);
        },
        removeFromWishlist: (id) => {
          wishlistStore.mutate("remove", id);
        },
        toggleWishlist: (id) => {
          if (validId(id)) wishlistStore.mutate("toggle", id);
        },
        isInWishlist: (id) => state.items.includes(id),
        retryWishlist: wishlistStore.retry,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
}
export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) throw new Error("useWishlist requires WishlistProvider");
  return context;
}
