import type { Metadata } from "next";
import "@/app/globals.css";
import LayoutProvider from "@/providers/LayoutProvider";

export const metadata: Metadata = {
  title: "ERP System",
  description: "Manufacturing Industry Capstone Project",
};

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-screen bg-background text-foreground font-sans">
          <LayoutProvider>{children}</LayoutProvider>
      </body>
    </html>
  );
};

export default RootLayout;
