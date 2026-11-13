import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--mono" });

export const metadata: Metadata = {
  title: "Font engine",
  description: "Shape one letter and find the closest real free font.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
            <body>{children}</body>
    </html>
  );
}
