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
  Filter,
  X,
  ExternalLink,
  CalendarDays,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Loader2,
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
  is_landlord: boolean;
  verification_date?: string;
  has_history_change: boolean;
  is_relisted: boolean;
  price_direction: "up" | "down" | "same" | "fluctuated";
  first_seen: string;
  last_seen: string;
  status: "active" | "deleted" | "new";
  display_timeline: TimelineItem[];
}

export default function ListingLifecycleAnalysis({}: Props) {
  const [logs, setLogs] = useState<RealEstateLog[]>([]);
  const [loading, setLoading] = useState(false);

  const [mainTab, setMainTab] = useState<"active" | "analysis" | "deleted">(
    "active"
  );

  // 날짜 필터 (기본값: 최근 1개월)
  const todayObj = new Date();
  const today = todayObj.toISOString().split("T")[0];

  const oneMonthAgoObj = new Date();
  oneMonthAgoObj.setMonth(todayObj.getMonth() - 1);
  const oneMonthAgo = oneMonthAgoObj.toISOString().split("T")[0];

  const [localTradeType, setLocalTradeType] = useState<"all" | "매매" | "전세">(
    "all"
  );
  const [localStartDate, setLocalStartDate] = useState(oneMonthAgo);
  const [localEndDate, setLocalEndDate] = useState(today);

  const [filterIssue, setFilterIssue] = useState<"all" | "price" | "relist">(
    "all"
  );
  const [filterOwner, setFilterOwner] = useState<"all" | "landlord" | "agent">(
    "all"
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    // 검색어 입력 시 0.5초 딜레이 후 재검색 (디바운싱 권장)
    const timer = setTimeout(() => {
      fetchLogs();
    }, 500);
    return () => clearTimeout(timer);

    // ↓ 여기에 searchTerm이 없으면 검색어를 입력해도 fetchLogs가 실행되지 않습니다.
  }, [localStartDate, localEndDate, localTradeType, searchTerm]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // 1. 검색어 앞뒤 공백 제거 (실수 방지)
      const term = searchTerm ? searchTerm.trim() : "";

      let query = supabase
        .from("real_estate_logs")
        .select("*")
        .order("id", { ascending: false }); // 최신순

      // ---------------------------------------------------------
      // [핵심] 검색어가 있으면 다른 필터(날짜, 거래종류) 다 무시하고
      // 오직 "그 놈"만 전곡 찌르기로 찾아냅니다.
      // ---------------------------------------------------------
      if (term.length > 0) {
        console.log("🔍 검색 모드 발동:", term);

        // 검색어가 숫자(매물번호) 처럼 보일 때
        if (/^\d+$/.test(term)) {
          // 방법 A: 매물번호와 정확히 일치하거나 (eq)
          // 방법 B: 매물번호 컬럼을 문자로 바꿔서 포함되는지 확인 (ilike -> 더 강력함)
          // 방법 C: 동 이름에 숫자가 들어간 경우 (예: 125동)

          // "article_no"를 텍스트로 캐스팅(::text)해서 비교하므로
          // DB가 숫자형이든 문자형이든 상관없이 찾아냅니다.
          query = query.or(`article_no.eq.${term},dong.ilike.%${term}%`);

          // [중요] 검색 시에는 날짜 제한을 풉니다.
          // 왜냐? 11일 데이터가 날짜 필터에 걸려 안나오는걸 방지하기 위함
          // (필요하다면 아래 주석 풀어서 날짜 제한 다시 거셔도 됩니다)
          // query = query.gte("crawl_date", localStartDate).lte("crawl_date", localEndDate);
        } else {
          // 문자가 섞인 검색어 (예: DMC, 자이)
          query = query.or(`dong.ilike.%${term}%,agent.ilike.%${term}%`);
          query = query
            .gte("crawl_date", localStartDate)
            .lte("crawl_date", localEndDate);
        }

        // 검색 시 Limit 해제 (모든 이력 추적)
        query = query.limit(5000000000000);
      } else {
        // ---------------------------------------------------------
        // 검색어가 없을 때 (기존 로직: 날짜+타입 필터 적용)
        // ---------------------------------------------------------
        query = query
          .gte("crawl_date", localStartDate)
          .lte("crawl_date", localEndDate);

        if (localTradeType !== "all") {
          query = query.eq("trade_type", localTradeType);
        }
        // 전체 조회 시 데이터 제한
        query = query.limit(5000000000000);
      }

      const { data, error } = await query;

      if (error) {
        console.error("🚨 쿼리 에러:", error.message);
        throw error;
      }

      if (data) {
        console.log(`✅ 데이터 로드 성공: ${data.length}건`);
        if (term && data.length === 0) {
          console.warn(
            "⚠️ 검색 결과가 0건입니다. DB의 article_no 값에 공백이 있는지 확인해보세요."
          );
        }
        setLogs(data as RealEstateLog[]);
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

//   const analyzedData = useMemo(() => {
//     if (logs.length === 0) return [];

//     const uniqueSnapshots = Array.from(
//       new Set(logs.map((l) => `${l.crawl_date}|${l.crawl_time}`))
//     );
//     uniqueSnapshots.sort((a, b) => {
//       const [dateA, timeA] = a.split("|");
//       const [dateB, timeB] = b.split("|");
//       if (dateA !== dateB) return dateB.localeCompare(dateA);
//       const numA = parseInt(timeA.replace(/[^0-9]/g, ""), 10);
//       const numB = parseInt(timeB.replace(/[^0-9]/g, ""), 10);
//       return numB - numA;
//     });

//     const latestSnapshotKey = uniqueSnapshots[0];
//     const groups: Record<string, RealEstateLog[]> = {};
//     logs.forEach((log) => {
//       if (!log.article_no || log.article_no === "-") return;
//       if (!groups[log.article_no]) groups[log.article_no] = [];
//       groups[log.article_no].push(log);
//     });

//     const analyzed: AnalyzedListing[] = Object.keys(groups).map((key) => {
//       const items = groups[key];
//       items.sort((a, b) => {
//         if (a.crawl_date !== b.crawl_date)
//           return a.crawl_date.localeCompare(b.crawl_date);
//         const tA = parseInt(a.crawl_time.replace(/[^0-9]/g, ""), 10);
//         const tB = parseInt(b.crawl_time.replace(/[^0-9]/g, ""), 10);
//         return tA - tB;
//       });

//       const firstItem = items[0];
//       const lastItem = items[items.length - 1];

//       const normalizePrice = (p: string) =>
//         p.replace(/\s+/g, "").replace(/,/g, "").trim();
//       const has_history_change =
//         new Set(items.map((i) => normalizePrice(i.price))).size > 1;

//       const initialPriceVal = parseInt(firstItem.price.replace(/[^0-9]/g, ""));
//       const currentPriceVal = parseInt(lastItem.price.replace(/[^0-9]/g, ""));

//       let priceDir: "up" | "down" | "same" | "fluctuated" = "same";
//       if (currentPriceVal > initialPriceVal) priceDir = "up";
//       else if (currentPriceVal < initialPriceVal) priceDir = "down";
//       else if (has_history_change) priceDir = "fluctuated";

//       let status: "active" | "deleted" | "new" = "active";
//       if (
//         uniqueSnapshots.length > 0 &&
//         `${lastItem.crawl_date}|${lastItem.crawl_time}` !== latestSnapshotKey
//       ) {
//         status = "deleted";
//       } else if (items.length === 1 && uniqueSnapshots.length > 1) {
//         status = "new";
//       }

//       const full_timeline: TimelineItem[] = uniqueSnapshots.map(
//         (snapshotKey) => {
//           const [sDate, sTime] = snapshotKey.split("|");
//           const log = items.find(
//             (i) => i.crawl_date === sDate && i.crawl_time === sTime
//           );
//           if (log) {
//             return {
//               full_key: snapshotKey,
//               date: sDate,
//               time: sTime,
//               status: "collected",
//               price: log.price,
//               agent: log.agent,
//               dong: log.dong,
//             };
//           } else {
//             return {
//               full_key: snapshotKey,
//               date: sDate,
//               time: sTime,
//               status: "missing",
//             };
//           }
//         }
//       );

//       let validTimeline = full_timeline;
//       let is_relisted = false;
//       const reversed = [...full_timeline].reverse();
//       const firstCollectedIdx = reversed.findIndex(
//         (t) => t.status === "collected"
//       );

//       if (firstCollectedIdx !== -1) {
//         const validRaw = reversed.slice(firstCollectedIdx);
//         const hasGap = validRaw.some((t, idx) => {
//           if (t.status === "missing" && idx < validRaw.length - 1) {
//             const future = validRaw.slice(idx + 1);
//             return future.some((f) => f.status === "collected");
//           }
//           return false;
//         });
//         if (hasGap) is_relisted = true;

//         if (searchTerm && searchTerm.trim().length > 0) {
//           // 검색 시에는 모든 기록을 최신순으로 뒤집어서 그대로 보여줌
//           validTimeline = [...validRaw].reverse();
//         } else {
//           const changesOnly = validRaw.filter((item, idx) => {
//             if (idx === 0) return true;
//             const prevItem = validRaw[idx - 1];
//             if (item.status !== prevItem.status) return true;
//             if (
//               item.status === "collected" &&
//               prevItem.status === "collected"
//             ) {
//               const p1 = normalizePrice(item.price || "");
//               const p2 = normalizePrice(prevItem.price || "");
//               return p1 !== p2;
//             }
//             return false;
//           });
//           validTimeline = changesOnly.reverse();
//         }
//       } else {
//         validTimeline = [];
//       }

//       return {
//         article_no: key,
//         dong: lastItem.dong,
//         spec: lastItem.spec,
//         agent: lastItem.agent,
//         trade_type: lastItem.trade_type || "매매",
//         current_price: lastItem.price,
//         initial_price: firstItem.price,
//         is_landlord: (lastItem as any).is_landlord || false,
//         verification_date: (lastItem as any).verification_date || null,
//         has_history_change,
//         is_relisted,
//         price_direction: priceDir,
//         first_seen: `${firstItem.crawl_date} ${firstItem.crawl_time}`,
//         last_seen: `${lastItem.crawl_date} ${lastItem.crawl_time}`,
//         status,
//         display_timeline: validTimeline,
//       };
//     });

//     return analyzed.sort((a, b) => b.last_seen.localeCompare(a.last_seen));
//   }, [logs]);

  //   const filteredData = useMemo(() => {
  //     return analyzedData.filter((item) => {
  //       const matchSearch =
  //         item.dong.includes(searchTerm) ||
  //         item.agent.includes(searchTerm) ||
  //         item.article_no.includes(searchTerm);
  //       if (!matchSearch) return false;

  //       if (mainTab === "active") {
  //         const isActive = item.status === "active" || item.status === "new";
  //         if (!isActive) return false;
  //         if (filterOwner === "landlord" && !item.is_landlord) return false;
  //         if (filterOwner === "agent" && item.is_landlord) return false;
  //         return true;
  //       }

  //       if (mainTab === "deleted") return item.status === "deleted";

  //       if (mainTab === "analysis") {
  //         const hasIssue = item.has_history_change || item.is_relisted;
  //         if (!hasIssue) return false;
  //         if (filterIssue === "price" && !item.has_history_change) return false;
  //         if (filterIssue === "relist" && !item.is_relisted) return false;
  //         if (filterOwner === "landlord" && !item.is_landlord) return false;
  //         if (filterOwner === "agent" && item.is_landlord) return false;
  //         return true;
  //       }
  //       return true;
  //     });
  //   }, [analyzedData, mainTab, filterIssue, filterOwner, searchTerm]);


  const analyzedData = useMemo(() => {
    if (logs.length === 0) return [];

    // 1. 존재하는 로그들로 스냅샷 키 생성
    let rawSnapshots = logs.map((l) => `${l.crawl_date}|${l.crawl_time}`);
    
    // [핵심 해결책] 검색 시, 중간에 빈 시간(이빨 빠진 시간)을 강제로 채워넣습니다.
    // 그래야 로직이 "어? 11시에는 데이터가 없네?" 하고 'Missing' 판정을 내릴 수 있습니다.
    if (searchTerm && logs.length > 0) {
       rawSnapshots = fillTimeGaps(rawSnapshots);
    }

    const uniqueSnapshots = Array.from(new Set(rawSnapshots));

    // 최신순 정렬 (날짜 -> 시간)
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
      // 아이템 정렬
      items.sort((a, b) => {
        if (a.crawl_date !== b.crawl_date) return a.crawl_date.localeCompare(b.crawl_date);
        const tA = parseInt(a.crawl_time.replace(/[^0-9]/g, ""), 10);
        const tB = parseInt(b.crawl_time.replace(/[^0-9]/g, ""), 10);
        return tA - tB;
      });

      const firstItem = items[0];
      const lastItem = items[items.length - 1];

      // ... (가격 변동 로직 등 기존 동일) ...
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

      // 2. 전체 타임라인 생성 (여기서 Missing이 판별됨)
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
              status: "missing", // <- fillTimeGaps 덕분에 이제 여기가 발동됩니다!
            };
          }
        }
      );

      let validTimeline = full_timeline;
      let is_relisted = false;
      const reversed = [...full_timeline].reverse(); // 과거 -> 미래
      const firstCollectedIdx = reversed.findIndex((t) => t.status === "collected");
      
      if (firstCollectedIdx !== -1) {
        const validRaw = reversed.slice(firstCollectedIdx);
        
        // 재등록 감지
        const hasGap = validRaw.some((t, idx) => {
          if (t.status === "missing" && idx < validRaw.length - 1) {
            const future = validRaw.slice(idx + 1);
            return future.some((f) => f.status === "collected");
          }
          return false;
        });
        if (hasGap) is_relisted = true;

        // [복구됨] 변동사항만 남기기 (압축 로직)
        // 10시(수집) -> 11시(누락-Change!) -> 12시(누락-Skip) -> 13시(누락-Skip) -> 14시(수집-Change!)
        const changesOnly = validRaw.filter((item, idx) => {
          if (idx === 0) return true; // 최초 발견 시점은 무조건 표시
          
          const prevItem = validRaw[idx - 1];
          
          // 상태가 바뀌면 표시 (수집됨 <-> 안됨)
          if (item.status !== prevItem.status) return true;
          
          // 수집된 상태에서 가격이 바뀌면 표시
          if (item.status === "collected" && prevItem.status === "collected") {
            const p1 = normalizePrice(item.price || "");
            const p2 = normalizePrice(prevItem.price || "");
            return p1 !== p2;
          }
          
          return false; // 상태도 같고 가격도 같으면 숨김 (압축)
        });
        
        validTimeline = changesOnly.reverse(); // 최신순 정렬
      } else {
        validTimeline = [];
      }

      return {
        article_no: key,
        dong: lastItem.dong,
        spec: lastItem.spec,
        agent: lastItem.agent,
        trade_type: lastItem.trade_type || "매매",
        current_price: lastItem.price,
        initial_price: firstItem.price,
        is_landlord: (lastItem as any).is_landlord || false,
        verification_date: (lastItem as any).verification_date || null,
        has_history_change,
        is_relisted,
        price_direction: priceDir,
        first_seen: `${firstItem.crawl_date} ${firstItem.crawl_time}`,
        last_seen: `${lastItem.crawl_date} ${lastItem.crawl_time}`,
        status,
        display_timeline: validTimeline,
      };
    });

    return analyzed.sort((a, b) => b.last_seen.localeCompare(a.last_seen));
  }, [logs, searchTerm]); // 의존성 확인

  // ------------------------------------------------------------------
  // [Helper] 빈 시간 채우기 함수 (컴포넌트 내부나 외부에 선언)
  // ------------------------------------------------------------------
  function fillTimeGaps(snapshots: string[]) {
    if (snapshots.length === 0) return [];
    
    // 1. 날짜 객체로 변환하여 정렬
    const times = snapshots.map(s => {
        const [d, t] = s.split("|");
        const hour = parseInt(t.replace(/[^0-9]/g, ""), 10);
        const dateObj = new Date(d);
        dateObj.setHours(hour);
        return dateObj.getTime();
    }).sort((a, b) => a - b); // 오름차순 (과거 -> 미래)

    const minTime = times[0];
    const maxTime = times[times.length - 1];
    const result = new Set<string>();

    // 2. 1시간 단위로 루프 돌며 빈틈 채우기
    let current = minTime;
    while (current <= maxTime) {
        const d = new Date(current);
        
        // YYYY-MM-DD 포맷 만들기
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const dateStr = `${yyyy}-${mm}-${dd}`;
        
        // "13시" 포맷 만들기
        const hourStr = `${String(d.getHours()).padStart(2, "0")}시`; 
        
        result.add(`${dateStr}|${hourStr}`);
        
        current += 3600 * 1000; // 1시간 추가
    }

    return Array.from(result);
  }

  const filteredData = useMemo(() => {
    // 검색어 공백 제거 (여기서도 해줘야 안전함)
    const term = searchTerm.trim();

    return analyzedData.filter((item) => {
      // ----------------------------------------------------------------
      // 1. 검색어 매칭 (Search Matching)
      // ----------------------------------------------------------------
      // 데이터가 없을 수도 있으니 안전하게 빈 문자열("") 처리 후 비교
      const matchSearch =
        term === "" ||
        (item.article_no || "").includes(term) ||
        (item.dong || "").includes(term) ||
        (item.agent || "").includes(term);

      if (!matchSearch) return false;

      // ----------------------------------------------------------------
      // 2. 탭 필터링 (Tab Filtering) - [여기가 수정됨]
      // ----------------------------------------------------------------

      // [핵심] 검색어가 있으면 탭 필터를 무시하고 무조건 보여줍니다.
      // "내가 콕 집어서 검색했는데, 탭이 다르다고 안 보여주면 안 되니까"
      if (term.length > 0) {
        return true;
      }

      // 검색어가 없을 때만 아래 탭 규칙을 따름
      if (mainTab === "active") {
        const isActive = item.status === "active" || item.status === "new";
        if (!isActive) return false;

        // 소유자 필터
        if (filterOwner === "landlord" && !item.is_landlord) return false;
        if (filterOwner === "agent" && item.is_landlord) return false;

        return true;
      }

      if (mainTab === "deleted") {
        return item.status === "deleted";
      }

      if (mainTab === "analysis") {
        // [범인] 변동 내역이 없으면 false를 리턴하던 곳
        const hasIssue = item.has_history_change || item.is_relisted;
        if (!hasIssue) return false; // <- 검색 시에는 이 줄을 건너뛰게 됨

        if (filterIssue === "price" && !item.has_history_change) return false;
        if (filterIssue === "relist" && !item.is_relisted) return false;

        // 소유자 필터
        if (filterOwner === "landlord" && !item.is_landlord) return false;
        if (filterOwner === "agent" && item.is_landlord) return false;

        return true;
      }
      return true;
    });
  }, [analyzedData, mainTab, filterIssue, filterOwner, searchTerm]);

  const counts = useMemo(() => {
    const activeBase = analyzedData.filter(
      (d) => d.status === "active" || d.status === "new"
    );
    const analysisBase = analyzedData.filter(
      (d) => d.has_history_change || d.is_relisted
    );
    const deletedBase = analyzedData.filter((d) => d.status === "deleted");

    return {
      activeTotal: activeBase.length,
      analysisTotal: analysisBase.length,
      deletedTotal: deletedBase.length,
      analysisPrice: analysisBase.filter((d) => d.has_history_change).length,
      analysisRelist: analysisBase.filter((d) => d.is_relisted).length,
      analysisLandlord: analysisBase.filter((d) => d.is_landlord).length,
      analysisAgent: analysisBase.filter((d) => !d.is_landlord).length,
    };
  }, [analyzedData]);

  const ownerCounts = getCurrentOwnerCounts();

  function getCurrentOwnerCounts() {
    if (mainTab === "active") {
      const activeBase = analyzedData.filter(
        (d) => d.status === "active" || d.status === "new"
      );
      return {
        landlord: activeBase.filter((d) => d.is_landlord).length,
        agent: activeBase.filter((d) => !d.is_landlord).length,
      };
    }
    return { landlord: counts.analysisLandlord, agent: counts.analysisAgent };
  }

  // --- [중요] 렌더링 컨텐츠를 변수로 분리하여 문법 오류 원천 차단 ---
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
        <p>해당 기간에 조회된 데이터가 없습니다.</p>
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

              {item.is_landlord && (
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
                !item.is_landlord &&
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
                    <Tag className="w-3 h-3" /> {item.agent}
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
                  const p1 = (log.price || "")
                    .replace(/\s+/g, "")
                    .replace(/,/g, "")
                    .trim();
                  const pStart = (item.initial_price || "")
                    .replace(/\s+/g, "")
                    .replace(/,/g, "")
                    .trim();
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
          <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <History className="w-5 h-5 text-gray-600" />
            매물 생애주기 분석
            {loading && (
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
            )}
          </h2>

          <div className="flex flex-wrap items-center gap-2">
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
                onChange={(e) => setLocalStartDate(e.target.value)}
                className="text-xs bg-transparent outline-none font-medium w-[95px] cursor-pointer"
              />
              <span className="text-gray-400">~</span>
              <input
                type="date"
                value={localEndDate}
                onChange={(e) => setLocalEndDate(e.target.value)}
                className="text-xs bg-transparent outline-none font-medium w-[95px] cursor-pointer"
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
              className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-gray-300 rounded-lg outline-none focus:border-blue-500"
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
                👑 집주인 ({ownerCounts.landlord})
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
