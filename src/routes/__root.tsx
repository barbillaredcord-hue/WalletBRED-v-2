import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-gradient">404</h1>
        <p className="mt-4 text-muted-foreground">This page slipped out of the wallet.</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-full gradient-primary px-5 py-2.5 text-sm font-medium text-primary-foreground glow"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something broke</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
        {import.meta.env.DEV && (
          <p className="mt-2 text-xs text-muted-foreground/70 break-all">{error.message}</p>
        )}
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-full gradient-primary px-5 py-2.5 text-sm font-medium text-primary-foreground glow"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      { title: "Lumen Wallet — Telegram Mini App" },
      {
        name: "description",
        content: "Digital wallet, QR payments, transfers and VIP content. Built for Telegram.",
      },
      { name: "theme-color", content: "#1a1530" },
      { property: "og:title", content: "Lumen Wallet — Telegram Mini App" },
      { name: "twitter:title", content: "Lumen Wallet — Telegram Mini App" },
      {
        property: "og:description",
        content: "Digital wallet, QR payments, transfers and VIP content. Built for Telegram.",
      },
      {
        name: "twitter:description",
        content: "Digital wallet, QR payments, transfers and VIP content. Built for Telegram.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/848fe8dc-90d8-464b-9960-a63f2842d8bb/id-preview-365e2261--bd2ad1cf-6588-4cf9-8a08-d8d825cd36d2.lovable.app-1778649618168.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/848fe8dc-90d8-464b-9960-a63f2842d8bb/id-preview-365e2261--bd2ad1cf-6588-4cf9-8a08-d8d825cd36d2.lovable.app-1778649618168.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
    scripts: [{ src: "https://telegram.org/js/telegram-web-app.js" }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
