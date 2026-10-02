import { Geist, Hanken_Grotesk, Newsreader } from "next/font/google";

/**
 * Typefaces, exposed as CSS variables on <html>. Only Geist preloads; the
 * Front Page faces download when its CSS first uses them.
 * Variables live on <html> so portaled UI (drawers, popovers) inherits them.
 */

export const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

// Front Page: an editorial serif with optical sizes + a quiet grotesk.
export const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
  preload: false,
});
export const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken", display: "swap", preload: false });

export const fontVariables = [geist, newsreader, hanken].map((f) => f.variable).join(" ");
