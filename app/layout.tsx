import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "./_components/theme-provider";
import { I18nProvider } from "./_lib/i18n-provider";

export const metadata: Metadata = {
  title: "Mcmods-cn 后台管理",
  description: "Mcmods-cn 管理后台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full" suppressHydrationWarning>
      <body className="min-h-full">
        <ThemeProvider>
          <I18nProvider>{children}</I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
