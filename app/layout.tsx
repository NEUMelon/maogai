import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "MELON 题室｜把复杂，变成会做";
  const description = "毛概与工程流体力学双课程题室：章节练习、收藏批注与模拟考试。";
  const socialImage = `${origin}/og.png`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website", url: origin, images: [{ url: socialImage, width: 1733, height: 907, alt: "MELON 题室" }] },
    twitter: { card: "summary_large_image", title, description, images: [socialImage] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
