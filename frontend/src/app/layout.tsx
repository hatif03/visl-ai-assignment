import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "@/components/sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Screening Platform | Visl AI Labs",
  description: "AI-powered candidate screening and recruitment pipeline",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex" suppressHydrationWarning>
        <Sidebar />
        <main className="flex-1 ml-64 min-h-screen bg-muted/30">
          <div className="p-8">{children}</div>
        </main>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
