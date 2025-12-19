"use client";

import { useEffect, useState } from "react";
import { LayoutDashboard } from "lucide-react";

// supabase 및 타입 불러오기
import { supabase } from "../utils/supabaseClient";
import { StatData, RealEstateLog } from "../utils/types"; // [복구] RealEstateLog 타입 필요

// 컴포넌트 불러오기
import FilterControls from "../components/FilterControls";
import AgentChartSection from "../components/AgentChartSection";
import DongChartSection from "../components/DongChartSection";
import ListingLifecycleAnalysis from "../components/ListingLifecycleAnalysis";

export default function Dashboard() {
  // --- 상태 관리 ---
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [startHour, setStartHour] = useState<string>("00");
  const [endHour, setEndHour] = useState<string>("23");
  const [tradeType, setTradeType] = useState<string>("매매");

  // [복구됨] 차트(AgentChartSection)를 그리기 위해 원본 로그 데이터가 필요합니다.
  const [logs, setLogs] = useState<RealEstateLog[]>([]);

  // 동별 차트는 아직 통계 데이터(RPC)를 사용한다면 유지
  const [rawDongStats, setRawDongStats] = useState<StatData[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // 1. 초기화 (오늘 날짜 세팅)
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
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
      const { data } = await supabase
        .from("real_estate_logs")
        .select("crawl_date, crawl_time")
        .order("id", { ascending: false })
        .limit(1)
        .single();
      if (data) setLastUpdated(`${data.crawl_date} ${data.crawl_time}`);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // ----------------------------------------------------------------
      // [복구 및 수정] 차트용 원본 로그 조회
      // ----------------------------------------------------------------
      let query = supabase
        .from("real_estate_logs")
        .select("*")
        .gte("crawl_date", startDate)
        .lte("crawl_date", endDate)
        .order("id", { ascending: true }); // 차트 그리기 좋게 시간순 정렬 권장

      if (tradeType !== "all") {
        query = query.eq("trade_type", tradeType);
      }

      // 대량 데이터 조회 시 성능 고려 (필요시 limit 조절)
      // query = query.limit(10000);

      const { data: logData, error: logError } = await query;

      if (logError) throw logError;
      if (logData) setLogs(logData as RealEstateLog[]);

      // ----------------------------------------------------------------
      // 동별 통계 (아직 RPC를 사용한다면 유지, 이것도 로그 기반으로 바꿀거면 삭제 가능)
      // ----------------------------------------------------------------
      const { data: dongStats, error: dongError } = await supabase.rpc(
        "get_dong_stats",
        { start_d: startDate, end_d: endDate, trade_t: tradeType }
      );

      if (dongError) console.error("Dong RPC Error:", dongError);
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
       <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-3">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <LayoutDashboard className="w-8 h-8 text-blue-600" />
            DMC 파크뷰자이 매물 현황판
          </h1>
          
          {/* text-right div 제거하고 바로 배지 배치 */}
          <div className="px-3 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-500 border border-gray-200 self-start md:self-auto">
              Last Updated: {lastUpdated || "-"}
          </div>
        
        </div>

        {/* 1. 필터 컨트롤러 영역 */}
        <FilterControls
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          startHour={startHour}
          setStartHour={setStartHour}
          endHour={endHour}
          setEndHour={setEndHour}
          tradeType={tradeType}
          setTradeType={setTradeType}
          onSearch={fetchAllData}
        />

        {/* 2. 차트 영역 A: 부동산 (이제 logs를 받음) */}
        <AgentChartSection
          logs={logs}
          loading={loading}
          startHour={startHour}
          endHour={endHour}
        />

        {/* 3. 차트 영역 B: 동 (아직 RPC 통계 사용 중) */}
        {/* 만약 동 차트도 로그 기반으로 바꿨다면 logs={logs}로 넘겨줘야 함 */}
        <DongChartSection
          logs={logs} // [중요] rawStats 대신 logs 전달
          loading={loading}
        />

        {/* 4. 하단 리스트 (독립적 데이터 로딩) */}
        <ListingLifecycleAnalysis />
      </div>
    </div>
  );
}
