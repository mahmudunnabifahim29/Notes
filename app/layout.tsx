import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "./auth-provider";

export const metadata: Metadata = {
  title: "NoteAtlas — A little space for big ideas",
  description: "Write, collect, and share your notes. Understand your audience through optional surveys and thoughtful research.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
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
      <body className="antialiased"><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
