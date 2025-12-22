"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Clock,
  Tag,
  Search,
  ChevronDown,
  ChevronUp,
  Activity,
  RefreshCcw,
  MinusCircle,
  Crown,
  CheckCircle2,
  X,
  ExternalLink,
  CalendarDays,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Loader2,
  Filter,
  AlertTriangle,
  MoreHorizontal,
  EyeOff,
} from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { RealEstateLog } from "../utils/types";
import ExcelDownloadButton from "./ExcelDownloadButton";

interface Props {}

interface CrawlHistoryLog {
  crawl_date: string;
  crawl_time: string;
  status: "SUCCESS" | "FAIL";
}

interface TimelineItem {
  full_key: string;
  date: string;
  time: string;
  status: "collected" | "missing" | "failed";
  price?: string;
  agent?: string;
  dong?: string;
  count: number;
  rangeStartDate?: string;
  rangeStartTime?: string;
}

interface AnalyzedListing {
  article_no: string;
  dong: string;
  spec: string;
  agent: string;
  trade_type: string;
  current_price: string;
  initial_price: string;
  is_owner: boolean;
  verification_date?: string;
  has_history_change: boolean;
  changes: {
    price: boolean;
    owner: boolean;
    date: boolean;
  };
  is_relisted: boolean;
  price_direction: "up" | "down" | "same" | "fluctuated";
  first_seen: string;
  last_seen: string;
  status: "active" | "deleted" | "new";
  display_timeline: TimelineItem[];
  provider: string;
}

export default function ListingLifecycleAnalysis({}: Props) {
  const [logs, setLogs] = useState<RealEstateLog[]>([]);
  const [crawlHistory, setCrawlHistory] = useState<CrawlHistoryLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [mainTab, setMainTab] = useState<"active" | "analysis" | "deleted">("active");

  const SYSTEM_LAUNCH_DATE = "2025-12-19";
  const todayObj = new Date();
  const today = todayObj.toISOString().split("T")[0];

  const defaultStartDateObj = new Date();
  defaultStartDateObj.setDate(defaultStartDateObj.getDate() - 3);
  const launchDateObj = new Date(SYSTEM_LAUNCH_DATE);
  const defaultStart = defaultStartDateObj < launchDateObj ? SYSTEM_LAUNCH_DATE : defaultStartDateObj.toISOString().split("T")[0];

  const [localStartDate, setLocalStartDate] = useState(defaultStart);
  const [localEndDate, setLocalEndDate] = useState(today);
  
  const [localTradeType, setLocalTradeType] = useState<"all" | "매매" | "전세">("all");
  const [filterProvider, setFilterProvider] = useState<string>("all");
  const [filterIssue, setFilterIssue] = useState<"all" | "price" | "relist">("all");
  const [filterOwner, setFilterOwner] = useState<"all" | "landlord" | "agent">("all");
  
  const [hideFailed, setHideFailed] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // [최적화] 탭(mainTab)이나 필터가 변경되어도 서버 재요청을 하지 않음 (오직 날짜/검색어 변경 시에만 실행)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLogs();
    }, 500);
    return () => clearTimeout(timer);
  }, [localStartDate, localEndDate, localTradeType, searchTerm]); 

  const handleDateChange = (type: "start" | "end", newValue: string) => {
    const newStart = type === "start" ? new Date(newValue) : new Date(localStartDate);
    const newEnd = type === "end" ? new Date(newValue) : new Date(localEndDate);
    if (newStart > newEnd) { alert("종료일은 시작일보다 빠를 수 없습니다."); return; }
    
    const oneMonthLimit = new Date(newStart);
    oneMonthLimit.setDate(oneMonthLimit.getDate() + 31);
    if (newEnd > oneMonthLimit) { alert("최대 31일 기간까지만 조회할 수 있습니다.\n기간을 좁혀주세요."); return; }
    
    if (type === "start") setLocalStartDate(newValue); else setLocalEndDate(newValue);
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const term = searchTerm ? searchTerm.trim() : "";
      
      // [최적화] 조건에 맞는 모든 데이터를 한 번에 가져와서 메모리에서 필터링함 (RPC 사용 안 함)
      let query = supabase.from("real_estate_logs").select("*").order("id", { ascending: false });
      
      // 1. 검색어가 있을 때 (날짜 무시하고 전체 DB 검색)
      if (term.length > 0) {
        if (/^\d+$/.test(term)) query = query.or(`article_no.eq.${term},dong.ilike.%${term}%`);
        else query = query.or(`dong.ilike.%${term}%,agent.ilike.%${term}%`);
      } 
      // 2. 검색어가 없을 때 (설정된 날짜 범위 적용)
      else {
        query = query.gte("crawl_date", localStartDate).lte("crawl_date", localEndDate);
        if (localTradeType !== "all") query = query.eq("trade_type", localTradeType);
      }

      query = query.limit(10000);

      const historyQuery = supabase
        .from("crawl_history")
        .select("crawl_date, crawl_time, status")
        .gte("crawl_date", localStartDate)
        .lte("crawl_date", localEndDate)
        .order("crawl_date", { ascending: false })
        .order("crawl_time", { ascending: false });

      const [logsResult, historyResult] = await Promise.all([query, historyQuery]);

      if (logsResult.error) throw logsResult.error;
      if (historyResult.error) throw historyResult.error;

      if (logsResult.data) setLogs(logsResult.data as RealEstateLog[]);
      if (historyResult.data) setCrawlHistory(historyResult.data as CrawlHistoryLog[]);
      
    } catch (error) { console.error("Analysis Log Fetch Error:", error); } 
    finally { setLoading(false); }
  };

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedItems);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setExpandedItems(newSet);
  };

  const analyzedData = useMemo(() => {
    if (logs.length === 0 || crawlHistory.length === 0) return [];

    // 1. 전체 크롤링 시간표 생성 (Snapshot 기준: 최신 -> 과거)
    const uniqueSnapshots = crawlHistory.map(h => `${h.crawl_date}|${h.crawl_time}`);
    uniqueSnapshots.sort((a, b) => {
      const [dateA, timeA] = a.split("|"); const [dateB, timeB] = b.split("|");
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return timeB.localeCompare(timeA);
    });

    const historyStatusMap = new Map<string, "SUCCESS" | "FAIL">();
    crawlHistory.forEach(h => {
        historyStatusMap.set(`${h.crawl_date}|${h.crawl_time}`, h.status);
    });

    const groups: Record<string, RealEstateLog[]> = {};
    logs.forEach((log) => {
      if (!log.article_no || log.article_no === "-") return;
      if (!groups[log.article_no]) groups[log.article_no] = [];
      groups[log.article_no].push(log);
    });

    const analyzed: AnalyzedListing[] = Object.keys(groups).map((key) => {
      const items = groups[key];
      // 매물 로그 날짜순 정렬 (과거 -> 최신)
      items.sort((a, b) => {
        if (a.crawl_date !== b.crawl_date) return a.crawl_date.localeCompare(b.crawl_date);
        return a.crawl_time.localeCompare(b.crawl_time);
      });

      const firstItem = items[0]; // DB에 기록된 최초 데이터
      const lastItem = items[items.length - 1]; // 최신 데이터
      
      const normalizePrice = (p: string) => p.replace(/\s+/g, "").replace(/,/g, "").trim();

      const prices = new Set(items.map((i) => normalizePrice(i.price)));
      const owners = new Set(items.map((i) => String(!!i.is_owner))); 
      const dates = new Set(items.map((i) => (i as any).confirm_date || ""));

      const has_price_change = prices.size > 1;
      const has_owner_change = owners.size > 1;
      const has_date_change = dates.size > 1;
      const has_history_change = has_price_change || has_owner_change || has_date_change;
      
      const initialPriceVal = parseInt(firstItem.price.replace(/[^0-9]/g, ""));
      const currentPriceVal = parseInt(lastItem.price.replace(/[^0-9]/g, ""));
      
      let priceDir: "up" | "down" | "same" | "fluctuated" = "same";
      if (currentPriceVal > initialPriceVal) priceDir = "up";
      else if (currentPriceVal < initialPriceVal) priceDir = "down";
      else if (has_price_change) priceDir = "fluctuated";

      // [1] Raw Timeline 생성: 전체 크롤링 시간표 기준 출석 체크 (순서: 최신 -> 과거)
      const rawTimeline: TimelineItem[] = uniqueSnapshots.map((snapshotKey) => {
          const [sDate, sTime] = snapshotKey.split("|");
          const log = items.find((i) => i.crawl_date === sDate && i.crawl_time === sTime);
          const serverStatus = historyStatusMap.get(snapshotKey);

          if (log) {
            return { full_key: snapshotKey, date: sDate, time: sTime, status: "collected", price: log.price, agent: log.agent, dong: log.dong, count: 1 };
          } else {
            if (serverStatus === "FAIL") {
                return { full_key: snapshotKey, date: sDate, time: sTime, status: "failed", count: 1 };
            } else {
                return { full_key: snapshotKey, date: sDate, time: sTime, status: "missing", count: 1 };
            }
          }
      });

      // =================================================================================
      // [수정] 타임라인 가지치기 (Trimming)
      // "최초 수집" 이전의 'missing'이나 'failed'는 '존재하지 않음'이므로 제거합니다.
      // rawTimeline은 [최신(index 0) ... -> 과거(index N)] 순서입니다.
      // =================================================================================
      let firstCollectedIndex = -1;
      // 가장 과거(배열의 끝)부터 최신(배열의 앞)으로 오면서 처음 만나는 'collected'를 찾습니다.
      for (let i = rawTimeline.length - 1; i >= 0; i--) {
          if (rawTimeline[i].status === 'collected') {
              firstCollectedIndex = i;
              break;
          }
      }

      let validTimeline: TimelineItem[] = [];
      if (firstCollectedIndex !== -1) {
          // 최초 수집 시점(firstCollectedIndex)까지만 자르고, 그 뒤(더 과거)는 버립니다.
          validTimeline = rawTimeline.slice(0, firstCollectedIndex + 1);
      } else {
          // 수집된 적이 한 번도 없는 경우 (이론상 없겠지만 안전장치)
           validTimeline = [];
      }
      // =================================================================================

      // [2] 재등록(Relisted) 판단 로직 (validTimeline 사용)
      // 조건: 최신(Collected) -> 과거(Missing=삭제됨) -> 더과거(Collected=있었음)
      let is_relisted = false;
      let stage = 0;

      for (const item of validTimeline) {
          if (item.status === 'failed') continue;

          if (stage === 0) {
              if (item.status === 'collected') stage = 1;
              else if (item.status === 'missing') break; 
          } 
          else if (stage === 1) {
              if (item.status === 'missing') stage = 2;
          } 
          else if (stage === 2) {
              if (item.status === 'collected') {
                  is_relisted = true;
                  break;
              }
          }
      }

      // [3] 그룹핑 (Grouping)
      const timelineToGroup = hideFailed 
        ? validTimeline.filter(t => t.status !== 'failed') 
        : validTimeline;

      const groupedTimeline: TimelineItem[] = [];
      if (timelineToGroup.length > 0) {
        let currentGroup = { ...timelineToGroup[0] };
        
        for (let i = 1; i < timelineToGroup.length; i++) {
            const nextItem = timelineToGroup[i];
            
            const isSameStatus = currentGroup.status === nextItem.status;
            const isSamePrice = normalizePrice(currentGroup.price || "") === normalizePrice(nextItem.price || "");
            
            if (isSameStatus && (currentGroup.status !== 'collected' || isSamePrice)) {
                currentGroup.count += 1;
                currentGroup.rangeStartDate = nextItem.date;
                currentGroup.rangeStartTime = nextItem.time;
            } else {
                groupedTimeline.push(currentGroup);
                currentGroup = { ...nextItem };
            }
        }
        groupedTimeline.push(currentGroup);
      }

      // 상태 결정
      let status: "active" | "deleted" | "new" = "active";
      if (validTimeline.length > 0) {
        const latestItem = validTimeline[0];
        if (latestItem.status === "missing") {
            status = "deleted";
        } else if (latestItem.status === "failed") {
            status = "active"; // 실패 시 일단 활성으로 가정
        } else if (items.length === 1 && uniqueSnapshots.length > 1) {
            status = "new";
        }
      }

      return {
        article_no: key, dong: lastItem.dong, spec: lastItem.spec, agent: lastItem.agent,
        trade_type: lastItem.trade_type || "매매", current_price: lastItem.price, initial_price: firstItem.price,
        is_owner: !!(lastItem as any).is_owner,
        verification_date: (lastItem as any).confirm_date || null,
        has_history_change,
        changes: { price: has_price_change, owner: has_owner_change, date: has_date_change },
        is_relisted, price_direction: priceDir,
        first_seen: `${firstItem.crawl_date} ${firstItem.crawl_time}`, last_seen: `${lastItem.crawl_date} ${lastItem.crawl_time}`,
        status, 
        display_timeline: groupedTimeline,
        provider: lastItem.provider || "알수없음",
      };
    });
    
    return analyzed.sort((a, b) => b.last_seen.localeCompare(a.last_seen));
  }, [logs, crawlHistory, searchTerm, hideFailed]);

  const providerOptions = useMemo(() => {
    const providers = new Set(analyzedData.map(item => item.provider));
    return Array.from(providers).sort();
  }, [analyzedData]);

  const filteredData = useMemo(() => {
    const term = searchTerm.trim();
    return analyzedData.filter((item) => {
      const matchSearch = term === "" || (item.article_no || "").includes(term) || (item.dong || "").includes(term) || (item.agent || "").includes(term);
      if (!matchSearch) return false;
      if (filterProvider !== "all" && item.provider !== filterProvider) return false;

      if (mainTab === "active") {
        const isActive = item.status === "active" || item.status === "new";
        if (!isActive) return false;
        if (filterOwner === "landlord" && !item.is_owner) return false;
        if (filterOwner === "agent" && item.is_owner) return false;
        return true;
      }
      if (mainTab === "deleted") return item.status === "deleted";
      if (mainTab === "analysis") {
        const hasIssue = item.has_history_change || item.is_relisted;
        if (!hasIssue) return false;
        if (filterIssue === "price" && !item.changes.price) return false;
        if (filterIssue === "relist" && !item.is_relisted) return false;
        if (filterOwner === "landlord" && !item.is_owner) return false;
        if (filterOwner === "agent" && item.is_owner) return false;
        return true;
      }
      return false;
    });
  }, [analyzedData, mainTab, filterIssue, filterOwner, searchTerm, filterProvider]);

  const counts = useMemo(() => {
    const providerFiltered = analyzedData.filter(d => 
        filterProvider === "all" ? true : d.provider === filterProvider
    );
    const activeBase = providerFiltered.filter(d => d.status === "active" || d.status === "new");
    const analysisBase = providerFiltered.filter(d => d.has_history_change || d.is_relisted);
    const deletedBase = providerFiltered.filter(d => d.status === "deleted");

    return {
      activeTotal: activeBase.length,
      analysisTotal: analysisBase.length,
      deletedTotal: deletedBase.length,
      analysisPrice: analysisBase.filter((d) => d.changes.price).length,
      analysisRelist: analysisBase.filter((d) => d.is_relisted).length,
      analysisOwner: analysisBase.filter((d) => d.is_owner).length,
      analysisAgent: analysisBase.filter((d) => !d.is_owner).length,
    };
  }, [analyzedData, filterProvider]);

  const ownerCounts = useMemo(() => {
    const providerFiltered = analyzedData.filter(d => 
        filterProvider === "all" ? true : d.provider === filterProvider
    );
    if (mainTab === "active") {
      const activeBase = providerFiltered.filter(d => d.status === "active" || d.status === "new");
      return {
        total: activeBase.length,
        owner: activeBase.filter((d) => d.is_owner).length,
        agent: activeBase.filter((d) => !d.is_owner).length,
      };
    }
    return { 
        total: counts.analysisTotal, 
        owner: counts.analysisOwner, 
        agent: counts.analysisAgent 
    };
  }, [mainTab, analyzedData, filterProvider, counts]);

  let listContent;
  if (loading) {
    listContent = <div className="flex flex-col items-center justify-center h-full text-gray-400"><Loader2 className="w-8 h-8 animate-spin mb-2" /><p>데이터를 분석 중입니다...</p></div>;
  } else if (filteredData.length === 0) {
    listContent = <div className="flex items-center justify-center h-full text-gray-400"><p>해당 조건에 맞는 데이터가 없습니다.</p></div>;
  } else {
    listContent = filteredData.map((item, index) => {
        const isExpanded = expandedItems.has(item.article_no);
        const isDead = item.status === "deleted";
        
        return (
            <div key={item.article_no} className={`bg-white rounded-lg border shadow-sm overflow-hidden group ${isDead ? "border-gray-200 opacity-90" : "border-gray-200"}`}>
                <div className="p-4 cursor-pointer hover:bg-gray-50 transition-colors relative" onClick={() => toggleExpand(item.article_no)}>
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-600 rounded border border-gray-200 flex items-center gap-1"><Layers className="w-3 h-3" /> {item.trade_type}</span>
                        {item.is_owner && <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded border border-indigo-200 flex items-center gap-1"><Crown className="w-3 h-3" /> 집주인</span>}
                        
                        {item.changes.price && <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-700 rounded border border-purple-200 flex items-center gap-1"><Activity className="w-3 h-3" /> 가격변동</span>}
                        {item.changes.owner && <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded border border-blue-200 flex items-center gap-1"><Crown className="w-3 h-3" /> 인증변경</span>}
                        {item.changes.date && <span className="px-2 py-0.5 text-[10px] font-bold bg-sky-100 text-sky-700 rounded border border-sky-200 flex items-center gap-1"><Clock className="w-3 h-3" /> 날짜갱신</span>}
                        
                        {item.is_relisted && <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-700 rounded border border-orange-200 flex items-center gap-1"><RefreshCcw className="w-3 h-3" /> 재등록</span>}
                        {!item.has_history_change && !item.is_relisted && !item.is_owner && item.status === "new" && <span className="px-2 py-0.5 text-[10px] font-bold bg-green-500 text-white rounded">NEW</span>}
                        {item.status === "deleted" && <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-500 text-white rounded flex items-center gap-1"><MinusCircle className="w-3 h-3" /> 삭제됨</span>}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-lg font-black text-blue-600 mr-1">{index + 1}.</span>
                                <span className={`text-lg font-bold ${isDead ? "text-gray-500 line-through decoration-2 decoration-gray-300" : "text-gray-800"}`}>{item.dong}</span>
                                <span className="text-xs text-gray-400 bg-gray-100 px-1.5 rounded border border-gray-200">No.{item.article_no}</span>
                            </div>
                            <div className="text-sm text-gray-600 mb-2">{item.spec}</div>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="text-xs text-blue-600 font-bold flex items-center gap-1"><Tag className="w-3 h-3" /> {item.agent} | {item.provider} 제공</div>
                                {item.verification_date && <div className="text-[10px] text-gray-500 flex items-center gap-1 bg-gray-100 px-1.5 rounded border border-gray-200"><CheckCircle2 className="w-3 h-3 text-green-600" /> 확인: {item.verification_date}</div>}
                                <span className="text-gray-300 text-[10px] font-normal flex items-center gap-0.5 cursor-pointer hover:text-gray-500">{isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}{isExpanded ? "접기" : "이력"}</span>
                            </div>
                        </div>
                        <div className="sm:text-right min-w-[120px]">
                            <div className="text-xs text-gray-500 mb-1">{isDead ? "마지막 호가" : "현재 호가"}</div>
                            <div className={`text-xl font-bold flex items-center sm:justify-end gap-1 ${isDead ? "text-gray-500" : "text-gray-900"}`}>
                                {item.current_price}
                                {!isDead && item.price_direction === "up" && <ArrowUpRight className="w-5 h-5 text-red-500" />}
                                {!isDead && item.price_direction === "down" && <ArrowDownRight className="w-5 h-5 text-blue-500" />}
                                {!isDead && item.price_direction === "fluctuated" && <span title="변동 후 복귀" className="cursor-help"><Activity className="w-5 h-5 text-purple-500" /></span>}
                            </div>
                            {item.has_history_change && <div className="text-xs text-purple-600 font-medium bg-purple-50 px-1 rounded inline-block mt-1">최초: {item.initial_price}</div>}
                        </div>
                    </div>
                </div>
                {/* 상세 타임라인 */}
                {isExpanded && (
                    <div className="bg-gray-50 border-t border-gray-100 p-4 animate-in slide-in-from-top-2 duration-200">
                        <h4 className="text-xs font-bold text-gray-600 mb-3 flex items-center gap-1"><Clock className="w-3 h-3" /> 상세 수집 이력</h4>
                        <div className="space-y-0 relative">
                            <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-gray-200"></div>
                            {item.display_timeline.map((log, idx) => {
                                const p1 = (log.price || "").replace(/\s+/g, "").replace(/,/g, "").trim();
                                const pStart = (item.initial_price || "").replace(/\s+/g, "").replace(/,/g, "").trim();
                                const isPriceChanged = p1 !== pStart;
                                const isGrouped = log.count > 1;
                                const isSameDateGroup = isGrouped && log.rangeStartDate === log.date;
                                
                                // [수정] 마지막 그룹(=과거 끝자락)인지 확인
                                const isLastGroup = idx === item.display_timeline.length - 1;

                                return (
                                    <div key={idx} className="relative pl-8 pb-3 last:pb-0 flex items-start gap-3 group/item">
                                        <div className={`absolute left-0 w-10 h-10 flex items-start justify-center z-10`}>
                                            {log.status === "collected" ? (
                                                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ring-4 ring-white ${isPriceChanged ? "bg-purple-500" : "bg-blue-500"}`}></div>
                                            ) : log.status === "failed" ? (
                                                <div className="w-2.5 h-2.5 rounded-full bg-gray-400 mt-1.5 ring-4 ring-white flex items-center justify-center"></div>
                                            ) : (
                                                <div className="w-2.5 h-2.5 rounded-full bg-orange-400 mt-1.5 ring-4 ring-white"></div>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <div className="flex items-center gap-1">
                                                  <span className="text-xs font-bold text-gray-600 bg-white border px-1.5 py-0.5 rounded">
                                                    {isGrouped && log.rangeStartTime ? (
                                                        isSameDateGroup
                                                            ? `${log.date} ${log.rangeStartTime} ~ ${log.time}`
                                                            : `${log.rangeStartDate} ${log.rangeStartTime} ~ ${log.date} ${log.time}`
                                                    ) : (
                                                        `${log.date} ${log.time}`
                                                    )}
                                                  </span>
                                                </div>

                                                {isGrouped && (
                                                  <span className="text-[9px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                                                    <MoreHorizontal className="w-3 h-3" /> {log.count}회 연속
                                                  </span>
                                                )}
                                                
                                                {/* [수정] 라벨 표기: 마지막 항목은 '최초 수집됨'으로 변경 */}
                                                {log.status === "collected" ? (
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${isPriceChanged ? "bg-purple-100 text-purple-700 border-purple-200" : "bg-white text-gray-600 border-gray-200"}`}>
                                                        {isLastGroup ? "🎉 최초 수집됨" : (isPriceChanged ? "⚡ 가격변경" : "수집됨")}
                                                    </span>
                                                ) : log.status === "failed" ? (
                                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold border border-gray-200 flex items-center gap-1">
                                                        <AlertTriangle className="w-3 h-3" /> 수집 실패
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold border border-orange-200 flex items-center gap-1"><MinusCircle className="w-3 h-3" /> 목록에서 사라짐</span>
                                                )}
                                            </div>
                                            {log.status === "collected" && (
                                                <div className={`text-xs border p-2 rounded shadow-sm flex justify-between items-center bg-white ${isPriceChanged ? "border-purple-300" : "border-gray-200"}`}><span className="font-bold">{log.price}</span><span className="text-[10px] opacity-70">{log.agent}</span></div>
                                            )}
                                            {log.status === "failed" && (
                                                 <div className="text-[10px] text-gray-400 mt-1 pl-1">※ 시스템 오류로 데이터 확인 불가</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-4 pt-3 border-t border-gray-200 flex justify-end">
                            <a href={`https://new.land.naver.com/complexes/108064?articleNo=${item?.article_no}`} target="_blank" rel="noopener noreferrer" className="text-xs flex items-center gap-1 text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded font-bold transition-colors">네이버 부동산 확인<span className="ml-1"><ExternalLink className="w-3 h-3" /></span></a>
                        </div>
                    </div>
                )}
            </div>
        );
    });
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[700px]">
      <div className="bg-gray-50 border-b border-gray-200 p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-300 p-1 px-2">
               <Filter className="w-3.5 h-3.5 text-gray-500" />
               <select value={filterProvider} onChange={(e) => setFilterProvider(e.target.value)} className="text-xs bg-transparent outline-none font-bold w-[120px] cursor-pointer text-gray-900">
                 <option value="all">전체 CP</option>
                 {providerOptions.map(p => (<option key={p} value={p}>{p}</option>))}
               </select>
            </div>
            <div className="flex bg-white rounded-lg p-0.5 border border-gray-300">
              {["all", "매매", "전세"].map((type) => (
                <button key={type} onClick={() => setLocalTradeType(type as any)} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${localTradeType === type ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-100"}`}>{type === "all" ? "전체" : type}</button>
              ))}
            </div>
            <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-300 p-1 px-2">
              <CalendarDays className="w-3.5 h-3.5 text-gray-500" />
              <input type="date" value={localStartDate} min={SYSTEM_LAUNCH_DATE} onChange={(e) => handleDateChange("start", e.target.value)} className="text-xs bg-transparent outline-none font-medium w-[95px] cursor-pointer text-gray-900" />
              <span className="text-gray-400">~</span>
              <input type="date" value={localEndDate} min={SYSTEM_LAUNCH_DATE} onChange={(e) => handleDateChange("end", e.target.value)} className="text-xs bg-transparent outline-none font-medium w-[95px] cursor-pointer text-gray-900" />
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs font-bold text-gray-600 bg-white px-2 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50">
                <input type="checkbox" checked={hideFailed} onChange={(e) => setHideFailed(e.target.checked)} className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <EyeOff className="w-3 h-3 text-gray-500" />
                <span>실패숨김</span>
            </label>
          </div>
          <div className="relative w-full md:w-60">
            <input type="text" placeholder="동, 부동산, 번호 검색" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-gray-900" autoComplete="off" autoCorrect="off" spellCheck="false" name="search_field_prevention" id="search_field_prevention" />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto no-scrollbar">
            <button onClick={() => setMainTab("active")} className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${mainTab === "active" ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>🏠 현재 등록 ({counts.activeTotal})</button>
            <button onClick={() => setMainTab("analysis")} className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${mainTab === "analysis" ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>📊 변동 분석 ({counts.analysisTotal})</button>
            <button onClick={() => setMainTab("deleted")} className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${mainTab === "deleted" ? "border-gray-500 text-gray-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>🗑️ 삭제된 매물 ({counts.deletedTotal})</button>
        </div>
      </div>

      {(mainTab === "active" || mainTab === "analysis") && (
        <div className="px-4 py-3 bg-blue-50/50 border-b border-blue-100 flex flex-wrap items-center gap-4">
          
          {mainTab === "analysis" && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wide">변동유형</span>
                <div className="flex bg-white rounded-lg p-0.5 border border-blue-200">
                  <button onClick={() => setFilterIssue("all")} className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${filterIssue === "all" ? "bg-blue-100 text-blue-700 font-bold" : "text-gray-500 hover:bg-gray-50"}`}>전체</button>
                  <button onClick={() => setFilterIssue("price")} className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${filterIssue === "price" ? "bg-blue-100 text-blue-700 font-bold" : "text-gray-500 hover:bg-gray-50"}`}>💰 가격변동 ({counts.analysisPrice})</button>
                  <button onClick={() => setFilterIssue("relist")} className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${filterIssue === "relist" ? "bg-blue-100 text-blue-700 font-bold" : "text-gray-500 hover:bg-gray-50"}`}>♻️ 재등록 ({counts.analysisRelist})</button>
                </div>
              </div>
              <div className="w-px h-6 bg-blue-200 hidden sm:block"></div>
            </>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wide">소유자</span>
            <div className="flex bg-white rounded-lg p-0.5 border border-indigo-200">
              <button onClick={() => setFilterOwner("all")} className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${filterOwner === "all" ? "bg-indigo-100 text-indigo-700 font-bold" : "text-gray-500 hover:bg-gray-50"}`}>전체 ({ownerCounts.total})</button>
              <button onClick={() => setFilterOwner("landlord")} className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${filterOwner === "landlord" ? "bg-indigo-100 text-indigo-700 font-bold" : "text-gray-500 hover:bg-gray-50"}`}>👑 집주인 ({ownerCounts.owner})</button>
              <button onClick={() => setFilterOwner("agent")} className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${filterOwner === "agent" ? "bg-indigo-100 text-indigo-700 font-bold" : "text-gray-500 hover:bg-gray-50"}`}>🏢 일반 ({ownerCounts.agent})</button>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {(filterIssue !== "all" || filterOwner !== "all" || filterProvider !== "all") && (
                <button onClick={() => { setFilterIssue("all"); setFilterOwner("all"); setFilterProvider("all"); }} className="text-[10px] flex items-center gap-1 text-gray-500 hover:text-red-500 transition-colors mr-2"><X className="w-3 h-3" /> 초기화</button>
            )}
            <ExcelDownloadButton data={filteredData} fileName="DMC파크뷰자이_매물분석" conditions={{ startDate: localStartDate, endDate: localEndDate, tradeType: localTradeType, startHour: "00", endHour: "23", provider: filterProvider }} />
          </div>
        </div>
      )}

      {mainTab === "deleted" && (
        <div className="px-4 py-3 bg-gray-100 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs text-gray-500 font-bold">삭제된 매물 목록입니다. (거래 완료 또는 만료)</span>
            <div className="flex items-center gap-2">
                {filterProvider !== "all" && (
                    <button onClick={() => setFilterProvider("all")} className="text-[10px] flex items-center gap-1 text-gray-500 hover:text-red-500 transition-colors mr-2"><X className="w-3 h-3" /> 초기화</button>
                )}
                <ExcelDownloadButton data={filteredData} fileName="DMC파크뷰자이_삭제매물" conditions={{ startDate: localStartDate, endDate: localEndDate, tradeType: localTradeType, startHour: "00", endHour: "23", provider: filterProvider }} />
            </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-gray-50">
        {listContent}
      </div>
    </div>
  );
}