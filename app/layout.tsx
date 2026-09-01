import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Đua Top Xây Kênh | TAKI ACADEMY",
  description: "Nền tảng thi đua xây kênh social cho học viên TAKI ACADEMY",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={montserrat.className}>{children}</body>
    </html>
  );
}
