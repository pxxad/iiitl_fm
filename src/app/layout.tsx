import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "IIITL FM — Campus Radio",
    template: "%s | IIITL FM",
  },
  description:
    "IIITL FM is the campus-exclusive shared music listening platform for IIIT Lucknow students. Submit songs, vibe together, discover your campus's musical taste.",
  keywords: ["IIIT Lucknow", "campus radio", "shared music", "student platform", "IIITL FM"],
  authors: [{ name: "IIIT Lucknow" }],
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ),
  openGraph: {
    type: "website",
    siteName: "IIITL FM",
    title: "IIITL FM — Campus Radio",
    description:
      "The campus-exclusive shared music listening platform for IIIT Lucknow students.",
  },
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
