import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trail desk",
  description: "Live Adventure Projects API explorer.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
