"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Clock,
  Tag,
  Search,
  History,
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
} from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { RealEstateLog } from "../utils/types";

interface Props {}

interface TimelineItem {
  full_key: string;
  date: string;
  time: string;
  status: "collected" | "missing";
  price?: string;
  agent?: string;
  dong?: string;
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
  const [allTimeLogs, setAllTimeLogs] = useState<{crawl_date: string, crawl_time: string}[]>([]);
  
  const [loading, setLoading] = useState(false);

  const [mainTab, setMainTab] = useState<"active" | "analysis" | "deleted">(
    "active"
  );

  // ▼▼▼ [수정 1] 날짜 초기화 로직 변경 (기본값: 오늘 하루) ▼▼▼
  
  // 1. 시스템 수집 시작일 상수 (이 날짜 이전으로는 조회 불가하게 막음)
  const SYSTEM_LAUNCH_DATE = "2025-12-19";

  const todayObj = new Date();
  const today = todayObj.toISOString().split("T")[0];

  // 2. 시작일과 종료일을 모두 '오늘'로 설정 -> 로드 시 오늘 데이터만 표시
  const [localStartDate, setLocalStartDate] = useState(today);
  const [localEndDate, setLocalEndDate] = useState(today);
  
  // -----------------------------------------------------------

  const [localTradeType, setLocalTradeType] = useState<"all" | "매매" | "전세">("all");
  const [filterProvider, setFilterProvider] = useState<string>("all");

  const [filterIssue, setFilterIssue] = useState<"all" | "price" | "relist">("all");
  const [filterOwner, setFilterOwner] = useState<"all" | "landlord" | "agent">("all");

  const [searchTerm, setSearchTerm] = useState("");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLogs();
    }, 500);
    return () => clearTimeout(timer);
  }, [localStartDate, localEndDate, localTradeType, searchTerm]);

  const handleDateChange = (type: "start" | "end", newValue: string) => {
    const newStart = type === "start" ? new Date(newValue) : new Date(localStartDate);
    const newEnd = type === "end" ? new Date(newValue) : new Date(localEndDate);

    if (newStart > newEnd) {
       alert("종료일은 시작일보다 빠를 수 없습니다.");
       return;
    }

    // (선택사항) 오늘만 보기 모드이므로 1개월 제한은 풀어줘도 되지만, 
    // 데이터 양이 많아질 것을 대비해 제한을 유지하는 것도 좋습니다. 여기선 유지했습니다.
    const oneMonthLimit = new Date(newStart);
    oneMonthLimit.setMonth(oneMonthLimit.getMonth() + 1);

    if (newEnd > oneMonthLimit) {
      alert("최대 1개월 기간까지만 조회할 수 있습니다.\n기간을 좁혀주세요.");
      return;
    }

    if (type === "start") setLocalStartDate(newValue);
    else setLocalEndDate(newValue);
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const term = searchTerm ? searchTerm.trim() : "";

      let query = supabase
        .from("real_estate_logs")
        .select("*")
        .order("id", { ascending: false });

      let timeQuery = supabase
        .from("real_estate_logs")
        .select("crawl_date, crawl_time")
        .gte("crawl_date", localStartDate)
        .lte("crawl_date", localEndDate)
        .order("id", { ascending: false })
        .limit(5000);

      if (term.length > 0) {
        console.log("🔍 검색 모드 발동:", term);
        
        if (/^\d+$/.test(term)) {
          query = query.or(`article_no.eq.${term},dong.ilike.%${term}%`);
        } else {
          query = query.or(`dong.ilike.%${term}%,agent.ilike.%${term}%`);
        }
        query = query.limit(10000);

      } else {
        query = query
          .gte("crawl_date", localStartDate)
          .lte("crawl_date", localEndDate);

        if (localTradeType !== "all") {
          query = query.eq("trade_type", localTradeType);
        }
        query = query.limit(10000);
      }

      const [logsResult, timeResult] = await Promise.all([query, timeQuery]);

      if (logsResult.error) throw logsResult.error;
      
      if (logsResult.data) {
        setLogs(logsResult.data as RealEstateLog[]);
      }

      if (term.length > 0) {
        if (timeResult.data) setAllTimeLogs(timeResult.data);
      } else {
        if (logsResult.data) setAllTimeLogs(logsResult.data);
      }

    } catch (error) {
      console.error("Analysis Log Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedItems);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedItems(newSet);
  };

  const analyzedData = useMemo(() => {
    if (logs.length === 0) return [];

    const rawSnapshots = allTimeLogs.map((l) => `${l.crawl_date}|${l.crawl_time}`);
    const uniqueSnapshots = Array.from(new Set(rawSnapshots));

    uniqueSnapshots.sort((a, b) => {
      const [dateA, timeA] = a.split("|");
      const [dateB, timeB] = b.split("|");
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      
      const numA = parseInt(timeA.replace(/[^0-9]/g, ""), 10);
      const numB = parseInt(timeB.replace(/[^0-9]/g, ""), 10);
      return numB - numA;
    });

    const latestSnapshotKey = uniqueSnapshots[0];
    const groups: Record<string, RealEstateLog[]> = {};
    
    logs.forEach((log) => {
      if (!log.article_no || log.article_no === "-") return;
      if (!groups[log.article_no]) groups[log.article_no] = [];
      groups[log.article_no].push(log);
    });

    const analyzed: AnalyzedListing[] = Object.keys(groups).map((key) => {
      const items = groups[key];
      items.sort((a, b) => {
        if (a.crawl_date !== b.crawl_date) return a.crawl_date.localeCompare(b.crawl_date);
        const tA = parseInt(a.crawl_time.replace(/[^0-9]/g, ""), 10);
        const tB = parseInt(b.crawl_time.replace(/[^0-9]/g, ""), 10);
        return tA - tB;
      });

      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      
      const normalizePrice = (p: string) => p.replace(/\s+/g, "").replace(/,/g, "").trim();
      const has_history_change = new Set(items.map((i) => normalizePrice(i.price))).size > 1;
      
      const initialPriceVal = parseInt(firstItem.price.replace(/[^0-9]/g, ""));
      const currentPriceVal = parseInt(lastItem.price.replace(/[^0-9]/g, ""));
      
      let priceDir: "up" | "down" | "same" | "fluctuated" = "same";
      if (currentPriceVal > initialPriceVal) priceDir = "up";
      else if (currentPriceVal < initialPriceVal) priceDir = "down";
      else if (has_history_change) priceDir = "fluctuated";

      let status: "active" | "deleted" | "new" = "active";
      if (uniqueSnapshots.length > 0 && `${lastItem.crawl_date}|${lastItem.crawl_time}` !== latestSnapshotKey) {
        status = "deleted";
      } else if (items.length === 1 && uniqueSnapshots.length > 1) {
        status = "new";
      }

      const full_timeline: TimelineItem[] = uniqueSnapshots.map(
        (snapshotKey) => {
          const [sDate, sTime] = snapshotKey.split("|");
          const log = items.find(
            (i) => i.crawl_date === sDate && i.crawl_time === sTime
          );

          if (log) {
            return {
              full_key: snapshotKey,
              date: sDate,
              time: sTime,
              status: "collected",
              price: log.price,
              agent: log.agent,
              dong: log.dong,
            };
          } else {
            return {
              full_key: snapshotKey,
              date: sDate,
              time: sTime,
              status: "missing",
            };
          }
        }
      );

      let validTimeline: TimelineItem[] = [];
      let is_relisted = false;

      const chronological = [...full_timeline].reverse(); 
      
      const firstAppearanceIdx = chronological.findIndex(t => t.status === 'collected');

      if (firstAppearanceIdx !== -1) {
          const relevantHistory = chronological.slice(firstAppearanceIdx);
          
          validTimeline = relevantHistory.filter((curr, idx) => {
              if (idx === 0) return true;
              const prev = relevantHistory[idx - 1];
              if (curr.status !== prev.status) return true;
              if (curr.status === 'collected' && prev.status === 'collected') {
                  const p1 = normalizePrice(curr.price || "");
                  const p2 = normalizePrice(prev.price || "");
                  return p1 !== p2;
              }
              return false;
          });

          const hasGap = relevantHistory.some((t, idx) => {
             if (t.status === 'missing' && idx < relevantHistory.length - 1) {
                 const future = relevantHistory.slice(idx + 1);
                 return future.some(f => f.status === 'collected');
             }
             return false;
          });
          if (hasGap) is_relisted = true;
          
          validTimeline.reverse(); 
      }

      return {
        article_no: key,
        dong: lastItem.dong,
        spec: lastItem.spec,
        agent: lastItem.agent,
        trade_type: lastItem.trade_type || "매매",
        current_price: lastItem.price,
        initial_price: firstItem.price,
        is_owner: !!(lastItem as any).is_owner,
        verification_date: (lastItem as any).verification_date || null,
        has_history_change,
        is_relisted,
        price_direction: priceDir,
        first_seen: `${firstItem.crawl_date} ${firstItem.crawl_time}`,
        last_seen: `${lastItem.crawl_date} ${lastItem.crawl_time}`,
        status,
        display_timeline: validTimeline,
        provider: lastItem.provider || "알수없음",
      };
    });

    return analyzed.sort((a, b) => b.last_seen.localeCompare(a.last_seen));
  }, [logs, allTimeLogs, searchTerm]);

  const providerOptions = useMemo(() => {
    const providers = new Set(analyzedData.map(item => item.provider));
    return Array.from(providers).sort();
  }, [analyzedData]);


  const filteredData = useMemo(() => {
    const term = searchTerm.trim();

    return analyzedData.filter((item) => {
      const matchSearch =
        term === "" ||
        (item.article_no || "").includes(term) ||
        (item.dong || "").includes(term) ||
        (item.agent || "").includes(term);

      if (!matchSearch) return false;

      if (filterProvider !== "all" && item.provider !== filterProvider) {
          return false;
      }

      if (mainTab === "active") {
        const isActive = item.status === "active" || item.status === "new";
        if (!isActive) return false;
        
        if (filterOwner === "landlord" && !item.is_owner) return false;
        if (filterOwner === "agent" && item.is_owner) return false;

        return true;
      }

      if (mainTab === "deleted") {
        return item.status === "deleted";
      }

      if (mainTab === "analysis") {
        const hasIssue = item.has_history_change || item.is_relisted;
        if (!hasIssue) return false;

        if (filterIssue === "price" && !item.has_history_change) return false;
        if (filterIssue === "relist" && !item.is_relisted) return false;

        if (filterOwner === "landlord" && !item.is_owner) return false;
        if (filterOwner === "agent" && item.is_owner) return false;

        return true;
      }
      
      return false;
    });
  }, [analyzedData, mainTab, filterIssue, filterOwner, searchTerm, filterProvider]);

  const counts = useMemo(() => {
    const baseData = analyzedData;

    const activeBase = baseData.filter(
      (d) => d.status === "active" || d.status === "new"
    );
    const analysisBase = baseData.filter(
      (d) => d.has_history_change || d.is_relisted
    );
    const deletedBase = baseData.filter((d) => d.status === "deleted");

    return {
      activeTotal: activeBase.length,
      analysisTotal: analysisBase.length,
      deletedTotal: deletedBase.length,
      analysisPrice: analysisBase.filter((d) => d.has_history_change).length,
      analysisRelist: analysisBase.filter((d) => d.is_relisted).length,
      analysisOwner: analysisBase.filter((d) => d.is_owner).length,
      analysisAgent: analysisBase.filter((d) => !d.is_owner).length,
    };
  }, [analyzedData]);

  const ownerCounts = useMemo(() => {
    if (mainTab === "active") {
      const activeBase = analyzedData.filter(
        (d) => d.status === "active" || d.status === "new"
      );
      return {
        owner: activeBase.filter((d) => d.is_owner).length,
        agent: activeBase.filter((d) => !d.is_owner).length,
      };
    }
    return { owner: counts.analysisOwner, agent: counts.analysisAgent };
  }, [mainTab, analyzedData, counts]);


  let listContent;

  if (loading) {
    listContent = (
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin mb-2" />
        <p>데이터를 불러오는 중입니다...</p>
      </div>
    );
  } else if (filteredData.length === 0) {
    listContent = (
      <div className="flex items-center justify-center h-full text-gray-400">
        <p>해당 조건에 맞는 데이터가 없습니다.</p>
      </div>
    );
  } else {
    listContent = filteredData.map((item, index) => {
      const isExpanded = expandedItems.has(item.article_no);
      const isDead = item.status === "deleted";

      return (
        <div
          key={item.article_no}
          className={`bg-white rounded-lg border shadow-sm overflow-hidden group ${
            isDead ? "border-gray-200 opacity-90" : "border-gray-200"
          }`}
        >
          <div
            className="p-4 cursor-pointer hover:bg-gray-50 transition-colors relative"
            onClick={() => toggleExpand(item.article_no)}
          >
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-600 rounded border border-gray-200 flex items-center gap-1">
                <Layers className="w-3 h-3" /> {item.trade_type}
              </span>

              {item.is_owner && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded border border-indigo-200 flex items-center gap-1">
                  <Crown className="w-3 h-3" /> 집주인
                </span>
              )}
              {item.has_history_change && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-700 rounded border border-purple-200 flex items-center gap-1">
                  <Activity className="w-3 h-3" /> 가격변동
                </span>
              )}
              {item.is_relisted && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-700 rounded border border-orange-200 flex items-center gap-1">
                  <RefreshCcw className="w-3 h-3" /> 재등록
                </span>
              )}
              {!item.has_history_change &&
                !item.is_relisted &&
                !item.is_owner &&
                item.status === "new" && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-green-500 text-white rounded">
                    NEW
                  </span>
                )}
              {item.status === "deleted" && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-500 text-white rounded flex items-center gap-1">
                  <MinusCircle className="w-3 h-3" /> 삭제됨
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg font-black text-blue-600 mr-1">
                    {index + 1}.
                  </span>
                  <span
                    className={`text-lg font-bold ${
                      isDead
                        ? "text-gray-500 line-through decoration-2 decoration-gray-300"
                        : "text-gray-800"
                    }`}
                  >
                    {item.dong}
                  </span>
                  <span className="text-xs text-gray-400 bg-gray-100 px-1.5 rounded border border-gray-200">
                    No.{item.article_no}
                  </span>
                </div>
                <div className="text-sm text-gray-600 mb-2">{item.spec}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs text-blue-600 font-bold flex items-center gap-1">
                    <Tag className="w-3 h-3" /> {item.agent} | {item.provider} 제공
                  </div>
                  {item.verification_date && (
                    <div className="text-[10px] text-gray-500 flex items-center gap-1 bg-gray-100 px-1.5 rounded border border-gray-200">
                      <CheckCircle2 className="w-3 h-3 text-green-600" /> 확인:{" "}
                      {item.verification_date}
                    </div>
                  )}
                  <span className="text-gray-300 text-[10px] font-normal flex items-center gap-0.5 cursor-pointer hover:text-gray-500">
                    {isExpanded ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                    {isExpanded ? "접기" : "이력"}
                  </span>
                </div>
              </div>
              <div className="sm:text-right min-w-[120px]">
                <div className="text-xs text-gray-500 mb-1">
                  {isDead ? "마지막 호가" : "현재 호가"}
                </div>
                <div
                  className={`text-xl font-bold flex items-center sm:justify-end gap-1 ${
                    isDead ? "text-gray-500" : "text-gray-900"
                  }`}
                >
                  {item.current_price}
                  {!isDead && item.price_direction === "up" && (
                    <ArrowUpRight className="w-5 h-5 text-red-500" />
                  )}
                  {!isDead && item.price_direction === "down" && (
                    <ArrowDownRight className="w-5 h-5 text-blue-500" />
                  )}

                  {!isDead && item.price_direction === "fluctuated" && (
                    <span title="변동 후 복귀" className="cursor-help">
                      <Activity className="w-5 h-5 text-purple-500" />
                    </span>
                  )}
                </div>
                {item.has_history_change && (
                  <div className="text-xs text-purple-600 font-medium bg-purple-50 px-1 rounded inline-block mt-1">
                    최초: {item.initial_price}
                  </div>
                )}
              </div>
            </div>
          </div>

          {isExpanded && (
            <div className="bg-gray-50 border-t border-gray-100 p-4 animate-in slide-in-from-top-2 duration-200">
              <h4 className="text-xs font-bold text-gray-600 mb-3 flex items-center gap-1">
                <Clock className="w-3 h-3" /> 상세 수집 이력
              </h4>
              <div className="space-y-0 relative">
                <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-gray-200"></div>
                {item.display_timeline.map((log, idx) => {
                  const p1 = (log.price || "").replace(/\s+/g, "").replace(/,/g, "").trim();
                  const pStart = (item.initial_price || "").replace(/\s+/g, "").replace(/,/g, "").trim();
                  const isPriceChanged = p1 !== pStart;

                  return (
                    <div
                      key={idx}
                      className="relative pl-8 pb-3 last:pb-0 flex items-start gap-3 group/item"
                    >
                      <div
                        className={`absolute left-0 w-10 h-10 flex items-start justify-center z-10`}
                      >
                        {log.status === "collected" ? (
                          <div
                            className={`w-2.5 h-2.5 rounded-full mt-1.5 ring-4 ring-white ${
                              isPriceChanged ? "bg-purple-500" : "bg-blue-500"
                            }`}
                          ></div>
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-full bg-orange-400 mt-1.5 ring-4 ring-white"></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-gray-500 bg-white border px-1.5 py-0.5 rounded">
                            {log.date}
                          </span>
                          <span className="text-sm font-bold text-gray-800">
                            {log.time}
                          </span>
                          {log.status === "collected" ? (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${
                                isPriceChanged
                                  ? "bg-purple-100 text-purple-700 border-purple-200"
                                  : "bg-white text-gray-600 border-gray-200"
                              }`}
                            >
                              {isPriceChanged ? "⚡ 가격변경" : "수집됨"}
                            </span>
                          ) : (
                            <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold border border-orange-200 flex items-center gap-1">
                              <MinusCircle className="w-3 h-3" /> 수집 안됨
                            </span>
                          )}
                        </div>
                        {log.status === "collected" && (
                          <div
                            className={`text-xs border p-2 rounded shadow-sm flex justify-between items-center bg-white ${
                              isPriceChanged
                                ? "border-purple-300"
                                : "border-gray-200"
                            }`}
                          >
                            <span className="font-bold">{log.price}</span>
                            <span className="text-[10px] opacity-70">
                              {log.agent}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-3 border-t border-gray-200 flex justify-end">
                <a
                  href={`https://new.land.naver.com/complexes/108064?articleNo=${item?.article_no}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs flex items-center gap-1 text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded font-bold transition-colors"
                >
                  네이버 부동산 확인
                  <span className="ml-1">
                    <ExternalLink className="w-3 h-3" />
                  </span>
                </a>
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
               <select
                 value={filterProvider}
                 onChange={(e) => setFilterProvider(e.target.value)}
                 className="text-xs bg-transparent outline-none font-bold w-[120px] cursor-pointer text-gray-900"
               >
                 <option value="all">전체 CP</option>
                 {providerOptions.map(p => (
                    <option key={p} value={p}>{p}</option>
                 ))}
               </select>
            </div>

            <div className="flex bg-white rounded-lg p-0.5 border border-gray-300">
              {["all", "매매", "전세"].map((type) => (
                <button
                  key={type}
                  onClick={() => setLocalTradeType(type as any)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                    localTradeType === type
                      ? "bg-gray-800 text-white"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {type === "all" ? "전체" : type}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-300 p-1 px-2">
              <CalendarDays className="w-3.5 h-3.5 text-gray-500" />
              <input
                type="date"
                value={localStartDate}
                // ▼▼▼ [수정 2] min 속성 추가: 런칭일 이전은 선택 불가 처리
                min={SYSTEM_LAUNCH_DATE} 
                onChange={(e) => handleDateChange("start", e.target.value)}
                className="text-xs bg-transparent outline-none font-medium w-[95px] cursor-pointer text-gray-900"
              />
              <span className="text-gray-400">~</span>
              <input
                type="date"
                value={localEndDate}
                // ▼▼▼ [수정 2] min 속성 추가
                min={SYSTEM_LAUNCH_DATE}
                onChange={(e) => handleDateChange("end", e.target.value)}
                className="text-xs bg-transparent outline-none font-medium w-[95px] cursor-pointer text-gray-900"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 justify-between">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setMainTab("active")}
              className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                mainTab === "active"
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              🏠 현재 등록 ({counts.activeTotal})
            </button>
            <button
              onClick={() => setMainTab("analysis")}
              className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                mainTab === "analysis"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              📊 변동 분석 ({counts.analysisTotal})
            </button>
            <button
              onClick={() => setMainTab("deleted")}
              className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                mainTab === "deleted"
                  ? "border-gray-500 text-gray-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              🗑️ 삭제된 매물 ({counts.deletedTotal})
            </button>
          </div>

          <div className="relative w-full md:w-60">
            <input
              type="text"
              placeholder="동, 부동산, 번호 검색"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-gray-900"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              name="search_field_prevention"
              id="search_field_prevention"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>
      </div>

      {(mainTab === "active" || mainTab === "analysis") && (
        <div className="px-4 py-3 bg-blue-50/50 border-b border-blue-100 flex flex-wrap items-center gap-4">
          {mainTab === "analysis" && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wide">
                  변동유형
                </span>
                <div className="flex bg-white rounded-lg p-0.5 border border-blue-200">
                  <button
                    onClick={() => setFilterIssue("all")}
                    className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                      filterIssue === "all"
                        ? "bg-blue-100 text-blue-700 font-bold"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    전체
                  </button>
                  <button
                    onClick={() => setFilterIssue("price")}
                    className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                      filterIssue === "price"
                        ? "bg-blue-100 text-blue-700 font-bold"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    💰 가격변동 ({counts.analysisPrice})
                  </button>
                  <button
                    onClick={() => setFilterIssue("relist")}
                    className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                      filterIssue === "relist"
                        ? "bg-blue-100 text-blue-700 font-bold"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    ♻️ 재등록 ({counts.analysisRelist})
                  </button>
                </div>
              </div>
              <div className="w-px h-6 bg-blue-200 hidden sm:block"></div>
            </>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wide">
              소유자
            </span>
            <div className="flex bg-white rounded-lg p-0.5 border border-indigo-200">
              <button
                onClick={() => setFilterOwner("all")}
                className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                  filterOwner === "all"
                    ? "bg-indigo-100 text-indigo-700 font-bold"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                전체
              </button>
              <button
                onClick={() => setFilterOwner("landlord")}
                className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                  filterOwner === "landlord"
                    ? "bg-indigo-100 text-indigo-700 font-bold"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                👑 집주인 ({ownerCounts.owner})
              </button>
              <button
                onClick={() => setFilterOwner("agent")}
                className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                  filterOwner === "agent"
                    ? "bg-indigo-100 text-indigo-700 font-bold"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                🏢 일반 ({ownerCounts.agent})
              </button>
            </div>
          </div>

          {(filterIssue !== "all" || filterOwner !== "all") && (
            <button
              onClick={() => {
                setFilterIssue("all");
                setFilterOwner("all");
              }}
              className="ml-auto text-[10px] flex items-center gap-1 text-gray-500 hover:text-red-500 transition-colors"
            >
              <X className="w-3 h-3" /> 초기화
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-gray-50">
        {listContent}
      </div>
    </div>
  );
}