import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Crowned Studio Booking",
  description: "Book your spa experience at Crowned Studio",
  openGraph: {
    title: "Crowned Studio Booking",
    description: "Book your spa experience at Crowned Studio",
    url: "https://book.crownedstudio.co.za",
    siteName: "Crowned Studio",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Crowned Studio Booking",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Crowned Studio Booking",
    description: "Book your spa experience at Crowned Studio",
    images: ["/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
