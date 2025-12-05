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
  title: "Archive",
  description: "An index of interesting things",
  openGraph: {
    title: "Archive",
    description: "An index of interesting things",
    url: "https://www.archivvve.com",
    siteName: "Archive",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Archive - An index of interesting things",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Archive",
    description: "An index of interesting things",
    images: ["/og-image.png"],
  },
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
