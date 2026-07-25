import type { Metadata } from "next";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { CartProvider } from "@/context/CartContext";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-serif",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://wishlyn.com'),
  title: "Wishlyn | Made to Match You | Fine Jewellery",
  description: "Explore handcrafted premium sterling silver, gold, and fine diamond jewellery designed to match your unique style. Everyday luxury by Wishlyn.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${cormorant.variable} ${montserrat.variable}`}
    >
      <body>
        <CartProvider>
          {children}
        </CartProvider>
      </body>
    </html>
  );
}
