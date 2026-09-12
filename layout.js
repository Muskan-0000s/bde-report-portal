import "./globals.css";

export const metadata = {
  title: "BDE Overall Report Portal",
  description: "Team-wide BDE work report tracking",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
