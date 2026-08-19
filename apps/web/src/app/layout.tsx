import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle/theme-toggle";

import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "ai-eng-training",
  description: "AI Engineering Training",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The inline script below rewrites this element's class list before React hydrates, which
    // React would otherwise report as a mismatch. The attribute covers this element alone.
    <html lang="en" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
      <head>
        {/* Runs synchronously while the browser parses the document, so the first paint is
            already in the recruiter's theme instead of flashing light and correcting later. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeToggle className="fixed top-4 right-4 z-50" />
        {children}
      </body>
    </html>
  );
}
