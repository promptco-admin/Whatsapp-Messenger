import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "Prompt WhatsApp Messenger",
  description: "WhatsApp Business messaging for Prompt Group",
  manifest: "/manifest.json",
  applicationName: "Prompt WA",
  appleWebApp: {
    capable: true,
    title: "Prompt WA",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/prompt-logo.png"],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#075e54",
  // Keep the WhatsApp-style fixed UI from getting nudged when the keyboard opens.
  // viewport-fit=cover lets us paint behind iPhone notches; the safe-area
  // insets in globals.css handle the padding so nothing hides behind them.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
