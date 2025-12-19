"use client";

import React from "react";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";

// 조회 조건 타입 정의
interface SearchConditions {
  startDate: string;
  endDate: string;
  tradeType: string;
  startHour: string;
  endHour: string;
  provider: string;
}

interface Props {
  data: any[];
  conditions: SearchConditions; // [추가] 조회 조건 객체
  fileName?: string;
}

export default function ExcelDownloadButton({ 
  data, 
  conditions, 
  fileName = "부동산_데이터_분석" 
}: Props) {
  
  const handleDownload = () => {
    if (!data || data.length === 0) {
      alert("다운로드할 데이터가 없습니다.");
      return;
    }

    // 1. 엑셀 상단에 적을 '조회 조건' 정보 구성 (행 단위 배열)
    // A열: 항목명, B열: 값
    const headerRows = [
      ["[ DMC 파크뷰자이 매물 분석 보고서 ]"], // 제목
      [""], // 빈 줄
      ["조회 기간", `${conditions.startDate} ~ ${conditions.endDate}`],
      ["거래 유형", conditions.tradeType === 'all' ? '전체' : conditions.tradeType],
      ["조회 시간대", `${conditions.startHour}시 ~ ${conditions.endHour}시`],
      ["제공처 필터", conditions.provider === 'all' ? '전체' : conditions.provider],
      ["다운로드 일시", new Date().toLocaleString()],
      [""], // 빈 줄 (데이터와 구분)
    ];

    // 2. 실제 데이터 포맷팅
    const formattedData = data.map((item) => ({
      "수집일시": item.last_seen,
      "매물번호": item.article_no,
      "동": item.dong,
      "거래유형": item.trade_type,
      "가격": item.current_price,
      "가격변동": item.price_direction === "same" ? "-" : item.price_direction,
      "최초가격": item.initial_price,
      "스펙": item.spec,
      "부동산": item.agent,
      "제공처": item.provider,
      "소유자": item.is_owner ? "집주인" : "중개사",
      "상태": item.status === "active" ? "진행중" : item.status === "deleted" ? "삭제됨" : "신규",
      "재등록여부": item.is_relisted ? "O" : "X",
      "네이버링크": `https://new.land.naver.com/complexes/108064?articleNo=${item.article_no}`
    }));

    // 3. 워크시트 생성 (데이터 없이 빈 시트 먼저 생성 가능하지만, 유틸리티 사용이 편함)
    const worksheet = XLSX.utils.book_new().Sheets["Sheet1"]; // 가상의 워크북

    // 4. (중요) 데이터를 먼저 시트로 변환하되, 'origin' 옵션으로 시작 위치를 지정합니다.
    // 헤더가 8줄 정도 되므로 A9 셀부터 데이터를 시작합니다.
    const finalWorksheet = XLSX.utils.json_to_sheet(formattedData, { origin: "A9" });

    // 5. 상단에 조회 조건(Header Rows) 추가 (A1부터 시작)
    XLSX.utils.sheet_add_aoa(finalWorksheet, headerRows, { origin: "A1" });

    // 6. 컬럼 너비 조정
    const wscols = [
      { wch: 20 }, // 수집일시
      { wch: 15 }, // 매물번호
      { wch: 10 }, // 동
      { wch: 10 }, // 거래유형
      { wch: 15 }, // 가격
      { wch: 10 }, // 가격변동
      { wch: 15 }, // 최초가격
      { wch: 30 }, // 스펙
      { wch: 20 }, // 부동산
      { wch: 10 }, // 제공처
      { wch: 10 }, // 소유자
      { wch: 10 }, // 상태
      { wch: 10 }, // 재등록
      { wch: 50 }, // 링크
    ];
    finalWorksheet["!cols"] = wscols;

    // 7. 워크북 생성 및 저장
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, finalWorksheet, "분석결과");

    const dateStr = new Date().toISOString().split("T")[0];
    XLSX.writeFile(workbook, `${fileName}_${dateStr}.xlsx`);
  };

  return (
    <button
      onClick={handleDownload}
      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm whitespace-nowrap"
    >
      <Download className="w-4 h-4" />
      엑셀 다운로드
    </button>
  );
}