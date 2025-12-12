"use client";

import { useEffect, useState } from 'react';
import { LayoutDashboard } from 'lucide-react';

// supabase 및 타입 불러오기
import { supabase } from '../utils/supabaseClient';
import { StatData } from '../utils/types'; // RealEstateLog 타입은 여기서 안 쓰므로 제거해도 됨

// 컴포넌트 불러오기
import FilterControls from '../components/FilterControls';
import AgentChartSection from '../components/AgentChartSection';
import DongChartSection from '../components/DongChartSection';
import ListingLifecycleAnalysis from '../components/ListingLifecycleAnalysis'; // [변경] 리스트 컴포넌트 교체

export default function Dashboard() {
  // --- 상태 관리 ---
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [startHour, setStartHour] = useState<string>('00');
  const [endHour, setEndHour] = useState<string>('23');
  const [tradeType, setTradeType] = useState<string>('매매');

  // [삭제됨] logs 상태는 이제 필요 없음!
  // const [logs, setLogs] = useState<RealEstateLog[]>([]); 

  // 차트용 통계 데이터 상태
  const [rawAgentStats, setRawAgentStats] = useState<StatData[]>([]);
  const [rawDongStats, setRawDongStats] = useState<StatData[]>([]);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  
  // 1. 초기화 (오늘 날짜 세팅)
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
    fetchLastCrawlTime();
  }, []);
  
  // 2. 날짜 변경 시 데이터 조회
  useEffect(() => {
    if (startDate && endDate) {
      fetchAllData();
    }
  }, [startDate, endDate]);

  const fetchLastCrawlTime = async () => {
    try {
      const { data } = await supabase.from('real_estate_logs').select('crawl_date, crawl_time').order('id', { ascending: false }).limit(1).single();
      if (data) setLastUpdated(`${data.crawl_date} ${data.crawl_time}`);
    } catch (e) { console.error(e); }
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // 1. 차트용 통계 데이터 조회 (RPC)
      const { data: agentStats, error: agentError } = await supabase
        .rpc('get_agent_stats', { start_d: startDate, end_d: endDate, trade_t: tradeType });
      if (agentError) console.error("Agent RPC Error:", agentError);

      const { data: dongStats, error: dongError } = await supabase
        .rpc('get_dong_stats', { start_d: startDate, end_d: endDate, trade_t: tradeType });
      if (dongError) console.error("Dong RPC Error:", dongError);

      // [삭제됨] 여기서 하던 리스트(logs) 조회 로직은 이제 ListingLifecycleAnalysis 컴포넌트가 알아서 함!
      /* const listQuery = supabase...
      const { data: listData } = await listQuery;
      if (listData) setLogs(listData); 
      */

      if (agentStats) setRawAgentStats(agentStats);
      if (dongStats) setRawDongStats(dongStats);

    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="text-blue-600 w-8 h-8" />
            <h1 className="text-2xl font-bold text-gray-800">DMC 파크뷰자이 매물 현황판</h1>
          </div>
          <div className="text-right">
             <div className="text-xs text-gray-500 font-medium bg-gray-100 px-3 py-1 rounded-full">
               Last Updated: {lastUpdated || "-"}
             </div>
          </div>
        </div>

        {/* 1. 필터 컨트롤러 영역 (차트용) */}
        <FilterControls 
            startDate={startDate} setStartDate={setStartDate}
            endDate={endDate} setEndDate={setEndDate}
            startHour={startHour} setStartHour={setStartHour}
            endHour={endHour} setEndHour={setEndHour}
            tradeType={tradeType} setTradeType={setTradeType}
            onSearch={fetchAllData}
        />

        {/* 2. 차트 영역 A: 부동산 */}
        <AgentChartSection 
            rawStats={rawAgentStats} 
            loading={loading}
            startDate={startDate}
            endDate={endDate}
            startHour={startHour}
            endHour={endHour}
        />

        {/* 3. 차트 영역 B: 동 */}
        <DongChartSection 
            rawStats={rawDongStats} 
            loading={loading}
            startDate={startDate}
            endDate={endDate}
            startHour={startHour}
            endHour={endHour}
        />

        {/* 4. [변경] 하단 리스트 (독립형 컴포넌트 사용) */}
        {/* props로 logs를 넘기지 않습니다. */}
        <ListingLifecycleAnalysis />

      </div>
    </div>
  );
}