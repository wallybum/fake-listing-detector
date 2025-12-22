"use client";

import { useEffect, useState } from "react";
import { LayoutDashboard, Users } from "lucide-react";

// supabase 및 타입 불러오기
import { supabase } from "../utils/supabaseClient";
import { StatData, RealEstateLog } from "../utils/types";

// 컴포넌트 불러오기
import FilterControls from "../components/FilterControls";
import AgentChartSection from "../components/AgentChartSection";
import DongChartSection from "../components/DongChartSection";
import ListingLifecycleAnalysis from "../components/ListingLifecycleAnalysis";

// [추가] 방문자 기록 저장용 컴포넌트 (파일 경로가 맞는지 꼭 확인하세요!)
import VisitorTracker from "../components/useVisitorTracker";

export default function Dashboard() {
  // --- 상태 관리 ---
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [startHour, setStartHour] = useState<string>("00");
  const [endHour, setEndHour] = useState<string>("23");
  const [tradeType, setTradeType] = useState<string>("매매");

  const [logs, setLogs] = useState<RealEstateLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // 최초/최근 수집 시간 및 방문자 수 State
  const [firstUpdated, setFirstUpdated] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [visitorCount, setVisitorCount] = useState<number>(0);

  // 1. 초기화 (오늘 날짜 세팅 및 메타데이터 조회)
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setStartDate(today);
    setEndDate(today);

    // 메타데이터(시간) 조회
    fetchCrawlMetadata();
    
    // [추가] 방문자 수(카운트) 조회 함수 호출
    fetchVisitorCount();
  }, []);

  // 2. 날짜 변경 시 데이터 조회
  useEffect(() => {
    if (startDate && endDate) {
      fetchAllData();
    }
  }, [startDate, endDate]);

  // [추가] 방문자 수 조회 함수 (SELECT count)
  const fetchVisitorCount = async () => {
    try {
      // 데이터 본문은 안 가져오고(head: true), 개수만 셉니다(count: exact)
      const { count, error } = await supabase
        .from("visit_logs")
        .select("*", { count: "exact", head: true });

      if (error) {
        console.error("Visitor Count Error:", error);
      } else if (count !== null) {
        setVisitorCount(count);
      }
    } catch (e) {
      console.error("Fetch Visitor Critical Error:", e);
    }
  };

  // 최초 시간과 마지막 시간을 함께 조회하는 함수
  const fetchCrawlMetadata = async () => {
    try {
      // 1. 마지막 수집 시간 조회
      const { data: lastData, error: lastError } = await supabase
        .from("real_estate_logs")
        .select("crawl_date, crawl_time")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastError) {
        console.error("Last Crawl Fetch Error:", lastError);
      } else if (lastData) {
        setLastUpdated(`${lastData.crawl_date} ${lastData.crawl_time}`);
      }

      // 2. 최초 수집 시간 조회
      const { data: firstData, error: firstError } = await supabase
        .from("real_estate_logs")
        .select("crawl_date, crawl_time")
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstError) {
        console.error("First Crawl Fetch Error:", firstError);
      } else if (firstData) {
        setFirstUpdated(`${firstData.crawl_date} ${firstData.crawl_time}`);
      }
    } catch (e) {
      console.error("Metadata Fetch Critical Error:", e);
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("real_estate_logs")
        .select("*")
        .gte("crawl_date", startDate)
        .lte("crawl_date", endDate)
        .order("id", { ascending: true });

      if (tradeType !== "all") {
        query = query.eq("trade_type", tradeType);
      }

      const { data: logData, error: logError } = await query;

      if (logError) throw logError;
      if (logData) setLogs(logData as RealEstateLog[]);

    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      
      {/* [추가] VisitorTracker 컴포넌트 삽입 
        - 화면에는 아무것도 표시하지 않지만(null), 내부적으로 방문 로직을 수행합니다.
      */}
      <VisitorTracker />

      <div className="max-w-7xl mx-auto">
        {/* 헤더 */}
        <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-3">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <LayoutDashboard className="w-8 h-8 text-blue-600" />
            DMC 파크뷰자이 매물 현황판
          </h1>

          <div className="flex flex-col md:flex-row gap-2 md:items-center">
            {/* 방문자 수 표시 */}
            <div className="px-3 py-1 bg-purple-50 rounded-full text-xs font-medium text-purple-600 border border-purple-100 flex items-center gap-1 self-start md:self-auto">
              <Users className="w-3 h-3" />
              {/* 숫자가 0일 때도 0명으로 표시하거나, 로딩 중이면 '-'로 표시 가능 */}
              <span>방문자: {visitorCount > 0 ? visitorCount.toLocaleString() : "-"}명</span>
            </div>

            {/* 최초 수집 시간 표시 */}
            <div className="px-3 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-500 border border-gray-200 self-start md:self-auto">
              최초 수집: {firstUpdated || "-"}
            </div>

            {/* 마지막 수집 시간 표시 */}
            <div className="px-3 py-1 bg-blue-50 rounded-full text-xs font-medium text-blue-600 border border-blue-100 self-start md:self-auto">
              최근 수집: {lastUpdated || "-"}
            </div>
          </div>
        </div>

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

        <AgentChartSection
          logs={logs}
          loading={loading}
          startHour={startHour}
          endHour={endHour}
        />

        <DongChartSection logs={logs} loading={loading} />

        <ListingLifecycleAnalysis />
      </div>
    </div>
  );
}