import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flusso",
  description: "Flusso creates evidence-backed, platform-native content campaigns."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
