import "./globals.css";
import AppRuntimeInit from "@/shared/components/AppRuntimeInit";
import { ThemeProvider } from "@/shared/components/ThemeProvider";
import { RuntimeI18nProvider } from "@/i18n/RuntimeI18nProvider";
import { APP_DESCRIPTION, APP_NAME } from "@/shared/constants/app";

export const metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
};

export const viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <RuntimeI18nProvider>
            <AppRuntimeInit />
            {children}
          </RuntimeI18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
