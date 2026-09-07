import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAG Codebase Chat",
  description:
    "Faz perguntas em linguagem natural sobre qualquer repositório público do GitHub.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
