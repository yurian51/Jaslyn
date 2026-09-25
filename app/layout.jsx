import "./globals.css";
import "./landing.css";
import "./auth.css";

export const metadata = {
  title: "Jaslyn Net | Hybrid Network Operating Fabric",
  description: "Jaslyn Net unifies subscriber management, access control, billing, payments and network operations into one operational fabric.",
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}