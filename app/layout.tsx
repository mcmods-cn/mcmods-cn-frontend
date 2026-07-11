import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "./_components/theme-provider";
import { SiteShell } from "./_components/site-shell";
import { I18nProvider } from "./_lib/i18n-provider";
import { IconfontLoader } from "./_components/iconfont";

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
        <IconfontLoader symbolUrl={process.env.NEXT_PUBLIC_ICONFONT_SYMBOL_URL} />
        <ThemeProvider>
          <I18nProvider>
            <SiteShell>{children}</SiteShell>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
