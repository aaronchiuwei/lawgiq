import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lawgiq · Case dashboard prototypes",
  description: "Three UI options for a visual case digest, read live from Clio Manage.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontVariables} antialiased`} suppressHydrationWarning>
      <head>
        {/* Restore the Front Page light/dark choice before first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("lawgiq.a2.theme");if(t==="light"||t==="dark")document.documentElement.dataset.a2Theme=t}catch(e){}` }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
