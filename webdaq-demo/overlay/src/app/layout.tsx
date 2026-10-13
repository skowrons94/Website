// WebDAQ demo overlay #4 (design §2.3): upstream frontend/src/app/layout.tsx with
// two differences — the root.cern JSRoot.core.js <Script> is gone (JSROOT is
// self-hosted and loaded on demand), and the demo is booted: the storage shim
// runs first in <head>, then <DemoBoot> installs the fetch shim and the worker.
// <DemoShell> is the demo frame: banner, notes, Run files, Scenario (shell/).
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "@/components/theme-provider"
import DemoBoot from "@/demo/shim/boot"
import DemoShell from "@/demo/shell/Shell"
import "@/demo/shim/tokens.css"
import { STORAGE_SHIM_JS } from "@/demo/generated"

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WebDAQ demo (simulated) — LUNADAQ",
  description: "The WebDAQ frontend running against a simulated DAQ in your browser. Simulated detectors; nothing here is real hardware.",
  // The site's companion page (/software/webdaq/) is the page to find.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: STORAGE_SHIM_JS }} />
      </head>
      <body className={inter.className}>
        <DemoBoot />
        <DemoShell />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
        {children}
          <Toaster />

        </ThemeProvider>
      </body>
    </html>
  );
}
