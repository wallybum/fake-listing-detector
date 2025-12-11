"use client";

import { useEffect, useState } from 'react';
import { LayoutDashboard } from 'lucide-react';

// 새로 분리한 파일들을 불러옵니다
import { supabase } from '../utils/supabaseClient';
import { RealEstateLog, StatData } from '../utils/types';
import FilterControls from '../components/FilterControls';
import AgentChartSection from '../components/AgentChartSection';
import DongChartSection from '../components/DongChartSection';
import RecentLogsList from '../components/RecentLogsList';

export default function Dashboard() {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [startHour, setStartHour] = useState<string>('00');
  const [endHour, setEndHour] = useState<string>('23');
  const [tradeType, setTradeType] = useState<string>('매매');

  const [logs, setLogs] = useState<RealEstateLog[]>([]);
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
  
  //  날짜가 세팅되면 데이터 조회 실행
  useEffect(() => {
    // 날짜가 비어있지 않을 때만 실행
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
      const { data: agentStats, error: agentError } = await supabase
        .rpc('get_agent_stats', { start_d: startDate, end_d: endDate, trade_t: tradeType });
      if (agentError) console.error("Agent RPC Error:", agentError);

      const { data: dongStats, error: dongError } = await supabase
        .rpc('get_dong_stats', { start_d: startDate, end_d: endDate, trade_t: tradeType });
      if (dongError) console.error("Dong RPC Error:", dongError);

      const listQuery = supabase
        .from('real_estate_logs')
        .select('*')
        .eq('trade_type', tradeType)
        .gte('crawl_date', startDate)
        .lte('crawl_date', endDate)
        .order('id', { ascending: false })
        .limit(2000000);
      
      const { data: listData } = await listQuery;

      if (agentStats) setRawAgentStats(agentStats);
      if (dongStats) setRawDongStats(dongStats);
      if (listData) setLogs(listData as RealEstateLog[]);

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

        {/* 1. 필터 컨트롤러 영역 */}
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

        {/* 4. 하단 리스트 */}
        <RecentLogsList logs={logs} />

      </div>
    </div>
  );
}