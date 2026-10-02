import { Bricolage_Grotesque, Geist, Hanken_Grotesk, IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";

/**
 * All option typefaces, exposed as CSS variables on <html>. Only the index
 * face preloads; each option's faces download when its CSS first uses them.
 * Variables live on <html> so portaled UI (drawers, popovers) inherits them.
 */

export const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

// Option A, Briefing: an editorial serif with optical sizes + a quiet grotesk.
export const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
  preload: false,
});
export const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken", display: "swap", preload: false });

// Option B, Story: a characterful display grotesk for chapter headlines.
export const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  axes: ["opsz", "wdth"],
  display: "swap",
  preload: false,
});

// Option C, Command: IBM Plex, with Mono reserved for figures and dates.
export const plexSans = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-plex", weight: ["400", "500", "600"], display: "swap", preload: false });
export const plexMono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-plex-mono", weight: ["400", "500"], display: "swap", preload: false });

export const fontVariables = [geist, newsreader, hanken, bricolage, plexSans, plexMono].map((f) => f.variable).join(" ");
