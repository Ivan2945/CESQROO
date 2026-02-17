import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import  AppHeader  from "@/app/_components/AppHeader";

export const dynamic = "force-dynamic";
export const revalidate = 0;


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CESQROO Portal",
  description: "Club Management System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} style={{ margin: 0 }}>
        {/* Shows only when logged in */}
        {/* @ts-expect-error Server Component */}
        <AppHeader />

        <main style={{ padding: 20 }}>{children}</main>
      </body>
    </html>
  );
}
