"use client";

import { Repeat, ChevronDown, Calendar as CalendarIcon, Clock, Search } from 'lucide-react';
import { HOURS } from '../utils/chartUtils';

interface FilterControlsProps {
  tradeType: string;
  setTradeType: (val: string) => void;
  startDate: string;
  setStartDate: (val: string) => void;
  endDate: string;
  setEndDate: (val: string) => void;
  startHour: string;
  setStartHour: (val: string) => void;
  endHour: string;
  setEndHour: (val: string) => void;
  onSearch: () => void;
}

export default function FilterControls({
  tradeType, setTradeType,
  startDate, setStartDate,
  endDate, setEndDate,
  startHour, setStartHour,
  endHour, setEndHour,
  onSearch
}: FilterControlsProps) {

  // -----------------------------------------------------------------------
  // [추가됨] 날짜 변경 핸들러 (최대 1개월 제한)
  // -----------------------------------------------------------------------
  const handleDateChange = (type: "start" | "end", newValue: string) => {
    // 변경하려는 값을 기준으로 새로운 시작일/종료일 객체 생성
    const newStart = type === "start" ? new Date(newValue) : new Date(startDate);
    const newEnd = type === "end" ? new Date(newValue) : new Date(endDate);

    // 유효성 검사 1: 종료일이 시작일보다 빠르면 안됨
    if (newStart > newEnd) {
       alert("종료일은 시작일보다 빠를 수 없습니다.");
       return;
    }

    // 유효성 검사 2: 1개월 초과 여부 확인
    const oneMonthLimit = new Date(newStart);
    oneMonthLimit.setMonth(oneMonthLimit.getMonth() + 1);

    if (newEnd > oneMonthLimit) {
      alert("최대 1개월 기간까지만 조회할 수 있습니다.\n기간을 좁혀주세요.");
      // 여기서 return하므로 setStartDate/setEndDate가 호출되지 않아 값은 변하지 않습니다.
      return; 
    }

    // 검사 통과 시 부모의 setter 함수 호출
    if (type === "start") setStartDate(newValue);
    else setEndDate(newValue);
  };

  return (
    /* 컨트롤러 */
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm mb-8 flex flex-wrap gap-6 items-end">
       {/* 거래 유형 */}
       <div className="flex flex-col gap-2">
         <label className="text-xs font-bold text-gray-500 flex items-center gap-1"><Repeat className="w-3 h-3"/> 거래 유형</label>
         <div className="relative">
            <select value={tradeType} onChange={(e) => setTradeType(e.target.value)} className="appearance-none w-28 bg-blue-50 text-blue-700 font-bold px-4 py-2.5 rounded-lg border border-blue-200 text-sm focus:ring-2 focus:ring-blue-500 cursor-pointer">
                <option value="매매">매매</option>
                <option value="전세">전세</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
        </div>
       </div>
       
        {/* 날짜 */}
       <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-gray-500 flex items-center gap-1"><CalendarIcon className="w-3 h-3"/> 조회 기간</label>
        <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
          <input 
            type="date" 
            value={startDate} 
            // [수정됨] 핸들러 연결
            onChange={(e) => handleDateChange("start", e.target.value)} 
            className="text-sm bg-transparent outline-none cursor-pointer text-gray-900 font-medium"
          />
          <span className="text-gray-400">~</span>
          <input 
            type="date" 
            value={endDate} 
            // [수정됨] 핸들러 연결
            onChange={(e) => handleDateChange("end", e.target.value)} 
            className="text-sm bg-transparent outline-none cursor-pointer text-gray-900 font-medium"
          />
        </div>
       </div>
       
        {/* 시간 */}
       <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3"/> 시간대</label>
        <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
          <select value={startHour} onChange={(e) => setStartHour(e.target.value)} className="text-sm bg-transparent outline-none cursor-pointer text-gray-900 font-medium">{HOURS.map(h => <option key={h} value={h}>{h}시</option>)}</select>
          <span className="text-gray-400">~</span>
          <select value={endHour} onChange={(e) => setEndHour(e.target.value)} className="text-sm bg-transparent outline-none cursor-pointer text-gray-900 font-medium">{HOURS.map(h => <option key={h} value={h}>{h}시</option>)}</select>
        </div>
       </div>

       <button onClick={onSearch} className="ml-auto flex items-center gap-2 px-6 py-2.5 bg-gray-900 hover:bg-black text-white rounded-lg text-sm font-bold transition-all shadow-md active:scale-95">
         <Search className="w-4 h-4" /> 데이터 조회
       </button>
    </div>
  );
}