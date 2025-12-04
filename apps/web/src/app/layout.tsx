import type { Metadata } from "next";
import { Fraunces, Work_Sans } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const workSans = Work_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-work-sans",
});

export const metadata: Metadata = {
  title: "Archive — Content Capture",
  description: "Save, organize, and explore content from across the web",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${workSans.variable}`}>
        {children}
      </body>
    </html>
  );
}
