import "./globals.css";

export const metadata = {
  title: "WorkTeams",
  description: "Simple workforce and operations management for small businesses.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
