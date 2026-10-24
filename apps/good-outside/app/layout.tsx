import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Good Outside",
  description: "Find nearby outdoor places with weather that fits today and the next few days.",
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
