"use client";

import React from "react";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";

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
  conditions: SearchConditions;
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

    // 1. 엑셀 상단에 적을 '조회 조건' (A1부터 시작될 내용)
    const headerRows = [
      ["[ DMC 파크뷰자이 매물 분석 보고서 ]"], 
      [""], 
      ["조회 기간", `${conditions.startDate} ~ ${conditions.endDate}`],
      ["거래 유형", conditions.tradeType === 'all' ? '전체' : conditions.tradeType],
      ["조회 시간대", `${conditions.startHour}시 ~ ${conditions.endHour}시`],
      ["제공처 필터", conditions.provider === 'all' ? '전체' : conditions.provider],
      ["다운로드 일시", new Date().toLocaleString()],
      [""], 
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

    // [수정된 핵심 로직]
    // 3. 먼저 '조회 조건(headerRows)'으로 시트를 생성합니다. (A1부터 자동 작성됨)
    // aoa_to_sheet는 배열의 배열을 시트로 만들어줍니다.
    const finalWorksheet = XLSX.utils.aoa_to_sheet(headerRows);

    // 4. 생성된 시트에 '실제 데이터(formattedData)'를 추가합니다.
    // sheet_add_json은 'origin' 옵션을 타입 에러 없이 지원합니다. (A9부터 시작)
    XLSX.utils.sheet_add_json(finalWorksheet, formattedData, { 
      origin: "A9", 
      skipHeader: false // 데이터의 헤더(수집일시, 매물번호 등)도 포함
    });

    // 5. 컬럼 너비 조정
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

    // 6. 워크북 생성 및 저장
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