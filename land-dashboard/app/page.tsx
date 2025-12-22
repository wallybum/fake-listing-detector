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

// 방문자 기록 저장용 컴포넌트
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

  /**
   * [추가] 한국 시간(KST) 기준으로 'YYYY-MM-DD'를 가져오는 함수
   * ISOString을 사용하면 오전 9시 전까지 어제 날짜로 나오는 문제를 해결합니다.
   */
  const getKSTToday = () => {
    const now = new Date();
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Seoul",
    })
      .format(now)
      .replace(/\. /g, "-")
      .replace(/\./g, "");
  };

  // 1. 초기화 (오늘 날짜 세팅 및 메타데이터 조회)
  useEffect(() => {
    // 한국 시간 기준으로 오늘 날짜 설정
    const today = getKSTToday();
    setStartDate(today);
    setEndDate(today);

    // 메타데이터(수집 시간) 조회
    fetchCrawlMetadata();
    
    // 오늘의 방문자 수 조회 (오늘 날짜 인자 전달)
    fetchVisitorCount(today);
  }, []);

  // 2. 날짜 변경 시 데이터 조회
  useEffect(() => {
    if (startDate && endDate) {
      fetchAllData();
    }
  }, [startDate, endDate]);

  /**
   * [수정] 오늘의 방문자 수 조회 함수
   * DB의 UTC 시간을 한국 시간 범위(00:00~23:59)로 필터링하여 정확한 '오늘'의 숫자를 가져옵니다.
   */
  const fetchVisitorCount = async (targetDate?: string) => {
    try {
      const date = targetDate || startDate || getKSTToday();
      
      const { count, error } = await supabase
        .from("visit_logs")
        .select("*", { count: "exact", head: true })
        // 한국 시간대(+09:00)를 명시하여 DB의 UTC 시간과 정확히 비교합니다.
        .gte("visited_at", `${date}T00:00:00+09:00`)
        .lte("visited_at", `${date}T23:59:59+09:00`);

      if (error) {
        console.error("Visitor Count Error:", error);
      } else {
        // null 방지를 위해 기본값 0 설정
        setVisitorCount(count || 0);
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
      
      {/* 방문 기록 저장 컴포넌트 */}
      <VisitorTracker />

      <div className="max-w-7xl mx-auto">
        {/* 헤더 */}
        <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-3">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <LayoutDashboard className="w-8 h-8 text-blue-600" />
            DMC 파크뷰자이 매물 현황판
          </h1>

          <div className="flex flex-col md:flex-row gap-2 md:items-center">
            {/* 방문자 수 표시 (한국 자정 기준 초기화됨) */}
            <div className="px-3 py-1 bg-purple-50 rounded-full text-xs font-medium text-purple-600 border border-purple-100 flex items-center gap-1 self-start md:self-auto">
              <Users className="w-3 h-3" />
              <span>오늘의 방문자: {visitorCount.toLocaleString()}명</span>
            </div>

            <div className="px-3 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-500 border border-gray-200 self-start md:self-auto">
              최초 수집: {firstUpdated || "-"}
            </div>

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