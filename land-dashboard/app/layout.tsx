import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
// [수정] 이름은 편의상 VisitorTracker로 부르겠습니다 (파일 이름은 그대로 둬도 됨)
import VisitorTracker from "../components/useVisitorTracker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DMC 파크뷰자이 매물 현황판",
  description: "DMC 파크뷰자이 매물 현황판",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  
  // ❌ [삭제] 여기서 함수를 직접 호출하면 에러가 납니다!
  // useVisitorTracker(); 

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* ✅ [추가] 여기에 컴포넌트처럼 넣어주세요. */}
        {/* 이렇게 하면 Next.js가 "아, 이건 클라이언트에서 실행할 부분이구나" 하고 알아서 처리합니다. */}
        <VisitorTracker />
        
        {children}
      </body>
    </html>
  );
}