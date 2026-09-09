import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Jaslyn | Autonomous AI Agent",
  description: "Jaslyn is a JARVIS-class autonomous AI agent runtime."
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
