import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "./_components/theme-provider";
import { SiteShell } from "./_components/site-shell";
import { I18nProvider } from "./_lib/i18n-provider";
import { IconfontLoader } from "./_components/iconfont";
import { SiteBrandProvider } from "./_components/site-brand-provider";
import { resolveIconfontConfig } from "./_lib/iconfont-url.mts";
import { loadMetadataSiteName } from "./_lib/site-brand-metadata.mts";
import { defaultUILocale, normalizeUILocale, uiLocaleCookieName } from "./_lib/ui-locale.mts";

export async function generateMetadata(): Promise<Metadata> {
  const siteName = await loadMetadataSiteName();
  return {
    title: { default: siteName, template: `%s | ${siteName}` },
    description: siteName,
  };
}

const iconfontConfig = resolveIconfontConfig(
  process.env.NEXT_PUBLIC_ICONFONT_SYMBOL_URL,
  process.env.NEXT_PUBLIC_ICONFONT_SYMBOL_INTEGRITY,
);

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialLocale = normalizeUILocale(cookieStore.get(uiLocaleCookieName)?.value) ?? defaultUILocale;
  return (
    <html lang={initialLocale} className="h-full" suppressHydrationWarning>
      <body className="min-h-full">
        <IconfontLoader symbolUrl={iconfontConfig?.symbolUrl} integrity={iconfontConfig?.integrity} />
        <ThemeProvider>
          <I18nProvider initialLocale={initialLocale}>
            <SiteBrandProvider><SiteShell>{children}</SiteShell></SiteBrandProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
