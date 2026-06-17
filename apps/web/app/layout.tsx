import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cognitio",
  description: "Evidence-first public claim verification."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
