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
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-sm bg-transparent outline-none cursor-pointer text-gray-900 font-medium"/>
          <span className="text-gray-400">~</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-sm bg-transparent outline-none cursor-pointer text-gray-900 font-medium"/>
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