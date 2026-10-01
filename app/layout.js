import "./globals.css";
import ServiceWorkerRegister from "../components/ServiceWorkerRegister";

export const metadata = {
  title: "WorkTeams",
  description: "Simple workforce and operations management for small businesses.",
  manifest: "/manifest.json",
  themeColor: "#2563eb",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "WorkTeams" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
