import "./globals.css";
import "./documents.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";

export const metadata: Metadata = {
  title: "PowerManage | Electricity Operations",
  description: "Manage properties, meter readings, billing, and electricity collections.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <Script id="powermanage-theme" strategy="beforeInteractive">{`
          try {
            const savedTheme = localStorage.getItem("powermanage-theme");
            document.documentElement.dataset.theme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark";
          } catch {
            document.documentElement.dataset.theme = "dark";
          }
        `}</Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
