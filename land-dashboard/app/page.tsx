"use client";

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { LayoutDashboard, Calendar as CalendarIcon, Clock, Building2, Search, ExternalLink, ChevronDown, Repeat, MapPin } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// --- [타입 정의] ---
interface RealEstateLog {
  id: number;
  agent: string;
  dong: string;
  spec: string;
  price: string;
  article_no: string;
  trade_type: string;
  crawl_time: string;
  crawl_date: string;
}

interface StatData {
  agent?: string;
  dong?: string;
  day_str: string;
  time_str: string;
  count: number;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", 
  "#0891b2", "#db2777", "#ca8a04", "#4b5563", "#0d9488",
  "#7c3aed", "#be185d", "#15803d", "#b45309", "#0369a1"
];

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));

export default function Dashboard() {
  // --- [필터 상태] ---
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [startHour, setStartHour] = useState<string>('00');
  const [endHour, setEndHour] = useState<string>('23');
  const [tradeType, setTradeType] = useState<string>('매매');

  // --- [데이터 상태] ---
  const [logs, setLogs] = useState<RealEstateLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // --- [Chart States] ---
  const [agentOptions, setAgentOptions] = useState<string[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [agentChartData, setAgentChartData] = useState<any>(null);
  const [isAgentFilterOpen, setIsAgentFilterOpen] = useState(false);
  const [rawAgentStats, setRawAgentStats] = useState<StatData[]>([]);

  const [dongOptions, setDongOptions] = useState<string[]>([]);
  const [selectedDongs, setSelectedDongs] = useState<string[]>([]);
  const [dongChartData, setDongChartData] = useState<any>(null);
  const [isDongFilterOpen, setIsDongFilterOpen] = useState(false);
  const [rawDongStats, setRawDongStats] = useState<StatData[]>([]);

  const agentDropdownRef = useRef<HTMLDivElement>(null);
  const dongDropdownRef = useRef<HTMLDivElement>(null);

  // 1. 초기화
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
    fetchLastCrawlTime();

    const handleClickOutside = (event: MouseEvent) => {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(event.target as Node)) setIsAgentFilterOpen(false);
      if (dongDropdownRef.current && !dongDropdownRef.current.contains(event.target as Node)) setIsDongFilterOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 2. 데이터 조회
  useEffect(() => {
    if (startDate && endDate) {
      fetchAllData();
    }
  }, [startDate, endDate, tradeType, startHour, endHour]);

  // 3. 차트 리렌더링
  useEffect(() => {
    if (rawAgentStats.length > 0) updateAgentChart(rawAgentStats);
  }, [selectedAgents, rawAgentStats, startHour, endHour]);

  useEffect(() => {
    if (rawDongStats.length > 0) updateDongChart(rawDongStats);
  }, [selectedDongs, rawDongStats, startHour, endHour]);


  // --- [Fetching Logic] ---
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
      // if (dongError) console.error("Dong RPC Error:", dongError);

      let listQuery = supabase
        .from('real_estate_logs')
        .select('*')
        .eq('trade_type', tradeType)
        .gte('crawl_date', startDate)
        .lte('crawl_date', endDate)
        .order('id', { ascending: false })
        .limit(200);
      
      const { data: listData } = await listQuery;

      if (agentStats) {
        setRawAgentStats(agentStats);
        const agents = Array.from(new Set(agentStats.map((d: any) => d.agent))).sort() as string[];
        if (JSON.stringify(agents) !== JSON.stringify(agentOptions)) {
           setAgentOptions(agents);
           setSelectedAgents(agents); 
        }
        updateAgentChart(agentStats);
      }

      if (dongStats) {
        setRawDongStats(dongStats);
        const dongs = Array.from(new Set(dongStats.map((d: any) => d.dong))).sort() as string[];
        if (JSON.stringify(dongs) !== JSON.stringify(dongOptions)) {
            setDongOptions(dongs);
            setSelectedDongs(dongs);
        }
        updateDongChart(dongStats);
      }

      if (listData) {
        setLogs(listData as RealEstateLog[]);
      }

    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- [차트 라벨 생성 로직 (Start & End Trimming)] ---

  // 1. 가장 빠른 시간 찾기 (Start용)
  const findEarliestHour = (stats: StatData[]) => {
    if (!stats || stats.length === 0) return parseInt(startHour, 10);
    const hours = stats.map(s => {
      let hStr = s.time_str;
      if (hStr.includes('시')) hStr = hStr.replace('시', '');
      return parseInt(hStr, 10);
    }).filter(n => !isNaN(n));
    if (hours.length === 0) return parseInt(startHour, 10);
    return Math.min(...hours);
  };

  // 2. 가장 늦은 시간 찾기 (End용) - [새로 추가됨]
  const findLatestHour = (stats: StatData[]) => {
    if (!stats || stats.length === 0) return parseInt(endHour, 10);
    const hours = stats.map(s => {
      let hStr = s.time_str;
      if (hStr.includes('시')) hStr = hStr.replace('시', '');
      return parseInt(hStr, 10);
    }).filter(n => !isNaN(n));
    if (hours.length === 0) return parseInt(endHour, 10);
    return Math.max(...hours); // 최대값 반환
  };

  const getMultiDayLabels = (stats: StatData[]) => {
     const set = new Set(stats.map(s => {
         let timeStr = s.time_str;
         if (timeStr.includes('시')) {
             const hour = parseInt(timeStr.replace('시', ''), 10);
             timeStr = `${String(hour).padStart(2, '0')}:00`;
         }
         return `${s.day_str.slice(5)} ${timeStr}`;
     }));
     return Array.from(set).sort();
  };

  // [핵심] 스마트 라벨 생성기 (양쪽 자르기 적용)
  const generateSmartLabels = (stats: StatData[]) => {
    const labels: string[] = [];
    const isSingleDay = startDate === endDate;
    
    // 기본: 사용자가 선택한 범위
    let start = parseInt(startHour, 10);
    let end = parseInt(endHour, 10);

    // 데이터가 있을 때만 조정
    if (stats.length > 0) {
        // 1. Start 조정 (00시 선택했는데 데이터가 늦게 시작하면 당김)
        if (start === 0) {
            const earliest = findEarliestHour(stats);
            if (earliest > start) start = earliest;
        }

        // 2. End 조정 (23시 선택했는데 데이터가 일찍 끝나면 자름) - [새로 추가됨]
        // (단, 사용자가 23시를 선택했을 때만 적용. 사용자가 일부러 15시까지만 보고 싶어하면 건드리지 않음)
        // 만약 사용자가 선택한 'end'보다 실제 데이터 'latest'가 더 작으면, 'latest'로 맞춤
        const latest = findLatestHour(stats);
        if (latest < end) {
            end = latest;
        }
    }

    if (isSingleDay) {
        for (let i = start; i <= end; i++) {
            labels.push(`${String(i).padStart(2, '0')}:00`);
        }
    } else {
        return getMultiDayLabels(stats); 
    }
    return labels;
  };

  // --- [차트 업데이트] ---

  const updateAgentChart = (stats: StatData[]) => {
    const isSingleDay = startDate === endDate;
    let labels = isSingleDay ? generateSmartLabels(stats) : getMultiDayLabels(stats);
    if (!isSingleDay && labels.length === 0) labels = [];

    const datasets = selectedAgents.map((agent, index) => {
      const color = COLORS[index % COLORS.length];
      const targetStats = stats.filter(s => s.agent === agent);
      
      const countMap: Record<string, number> = {};
      targetStats.forEach(s => {
        let timeKey = s.time_str;
        if (timeKey.includes('시')) {
            const hour = parseInt(timeKey.replace('시', ''), 10);
            timeKey = `${String(hour).padStart(2, '0')}:00`;
        }
        const key = isSingleDay ? timeKey : `${s.day_str.slice(5)} ${timeKey}`;
        countMap[key] = s.count;
      });

      const dataPoints = labels.map(label => {
        return countMap[label] || null;
      });

      return {
        label: agent,
        data: dataPoints,
        borderColor: color,
        backgroundColor: color,
        tension: 0.3,
        pointRadius: 3,
        spanGaps: true,
      };
    });
    setAgentChartData({ labels, datasets });
  };

  const updateDongChart = (stats: StatData[]) => {
    const isSingleDay = startDate === endDate;
    let labels = isSingleDay ? generateSmartLabels(stats) : getMultiDayLabels(stats);

    const datasets = selectedDongs.map((dong, index) => {
      const color = COLORS[(index + 5) % COLORS.length];
      const targetStats = stats.filter(s => s.dong === dong);
      
      const countMap: Record<string, number> = {};
      targetStats.forEach(s => {
        let timeKey = s.time_str;
        if (timeKey.includes('시')) {
            const hour = parseInt(timeKey.replace('시', ''), 10);
            timeKey = `${String(hour).padStart(2, '0')}:00`;
        }
        const key = isSingleDay ? timeKey : `${s.day_str.slice(5)} ${timeKey}`;
        countMap[key] = s.count;
      });

      const dataPoints = labels.map(label => {
        return countMap[label] || null;
      });

      return {
        label: dong,
        data: dataPoints,
        borderColor: color,
        backgroundColor: color,
        tension: 0.3,
        pointRadius: 3,
        spanGaps: true,
      };
    });
    setDongChartData({ labels, datasets });
  };

  // --- [이벤트 핸들러] ---
  const toggleAgent = (agent: string) => {
    if (selectedAgents.includes(agent)) setSelectedAgents(selectedAgents.filter(a => a !== agent));
    else setSelectedAgents([...selectedAgents, agent]);
  };
  const selectAllAgents = () => setSelectedAgents(selectedAgents.length === agentOptions.length ? [] : [...agentOptions]);

  const toggleDong = (dong: string) => {
    if (selectedDongs.includes(dong)) setSelectedDongs(selectedDongs.filter(d => d !== dong));
    else setSelectedDongs([...selectedDongs, dong]);
  };
  const selectAllDongs = () => setSelectedDongs(selectedDongs.length === dongOptions.length ? [] : [...dongOptions]);

  // const options = {
  //   responsive: true,
  //   maintainAspectRatio: false,
  //   interaction: {
  //     mode: 'nearest' as const,
  //     axis: 'x' as const,
  //     intersect: false 
  //   },
  //   plugins: {
  //     legend: { display: false },
  //     tooltip: {
  //       backgroundColor: 'rgba(255, 255, 255, 0.95)',
  //       titleColor: '#111',
  //       bodyColor: '#333',
  //       borderColor: '#ddd',
  //       borderWidth: 1,
  //       padding: 10,
  //       displayColors: true,
  //     }
  //   },
  //   scales: {
  //     y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
  //     x: { grid: { display: false } }
  //   }
  // };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'nearest' as const, // 마우스와 가장 가까운 점 하나만 찾음
      axis: 'x' as const,
      intersect: true           // [핵심] 마우스가 정확히 점 위에 올라갔을 때만 반응 (이게 false면 근처만 가도 뜸)
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#111',
        bodyColor: '#333',
        borderColor: '#ddd',
        borderWidth: 1,
        padding: 10,
        displayColors: true,
        // 툴팁에 "부동산 이름: 00건" 형태로 깔끔하게 나오도록 설정
        callbacks: {
          label: function(context: any) {
            return ` ${context.dataset.label}: ${context.raw}건`;
          }
        }
      }
    },
    scales: {
      y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
      x: { grid: { display: false } }
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

        {/* 컨트롤러 */}
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

           <button onClick={fetchAllData} className="ml-auto flex items-center gap-2 px-6 py-2.5 bg-gray-900 hover:bg-black text-white rounded-lg text-sm font-bold transition-all shadow-md active:scale-95">
             <Search className="w-4 h-4" /> 데이터 조회
           </button>
        </div>


        {/* 차트 영역 A: 부동산 */}
        <div className="mb-8">
            <div className="flex justify-between items-end mb-3 px-1">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-600"/> 부동산별 추이
                </h2>
                <div className="relative" ref={agentDropdownRef}>
                    <button onClick={() => setIsAgentFilterOpen(!isAgentFilterOpen)} className="text-xs font-medium bg-white border border-gray-300 px-3 py-1.5 rounded-md flex items-center gap-2 hover:bg-gray-50 text-gray-700">
                        {selectedAgents.length === agentOptions.length ? "전체 부동산 선택됨" : `${selectedAgents.length}개 선택됨`}
                        <ChevronDown className="w-3 h-3"/>
                    </button>
                    {isAgentFilterOpen && (
                        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-xl z-20 flex flex-col max-h-[250px]">
                            <div className="p-2 border-b bg-gray-50 sticky top-0"><label className="flex items-center gap-2 text-xs font-bold cursor-pointer"><input type="checkbox" checked={selectedAgents.length === agentOptions.length} onChange={selectAllAgents} className="rounded text-blue-600"/>전체 선택</label></div>
                            <div className="overflow-y-auto p-2 custom-scrollbar">
                                {agentOptions.map(opt => (
                                    <label key={opt} className="flex items-center gap-2 text-xs py-1 cursor-pointer hover:bg-blue-50 rounded px-1"><input type="checkbox" checked={selectedAgents.includes(opt)} onChange={() => toggleAgent(opt)} className="rounded text-blue-600"/><span className="truncate">{opt}</span></label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 h-[350px]">
                {loading ? <div className="h-full flex items-center justify-center text-gray-400">데이터를 불러오는 중...</div> :
                 agentChartData ? <Line options={options} data={agentChartData} /> : <div className="h-full flex items-center justify-center text-gray-300">데이터 없음</div>}
            </div>
        </div>

        {/* 차트 영역 B: 동 */}
        <div className="mb-10">
            <div className="flex justify-between items-end mb-3 px-1">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-green-600"/> 동(Dong)별 추이
                </h2>
                <div className="relative" ref={dongDropdownRef}>
                    <button onClick={() => setIsDongFilterOpen(!isDongFilterOpen)} className="text-xs font-medium bg-white border border-gray-300 px-3 py-1.5 rounded-md flex items-center gap-2 hover:bg-gray-50 text-gray-700">
                        {selectedDongs.length === dongOptions.length ? "전체 동 선택됨" : `${selectedDongs.length}개 선택됨`}
                        <ChevronDown className="w-3 h-3"/>
                    </button>
                    {isDongFilterOpen && (
                        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-xl z-20 flex flex-col max-h-[250px]">
                             <div className="p-2 border-b bg-gray-50 sticky top-0"><label className="flex items-center gap-2 text-xs font-bold cursor-pointer"><input type="checkbox" checked={selectedDongs.length === dongOptions.length} onChange={selectAllDongs} className="rounded text-green-600"/>전체 선택</label></div>
                            <div className="overflow-y-auto p-2 custom-scrollbar">
                                {dongOptions.map(opt => (
                                    <label key={opt} className="flex items-center gap-2 text-xs py-1 cursor-pointer hover:bg-green-50 rounded px-1"><input type="checkbox" checked={selectedDongs.includes(opt)} onChange={() => toggleDong(opt)} className="rounded text-green-600"/><span className="truncate">{opt}</span></label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 h-[350px]">
                {loading ? <div className="h-full flex items-center justify-center text-gray-400">데이터를 불러오는 중...</div> :
                 dongChartData ? <Line options={options} data={dongChartData} /> : <div className="h-full flex items-center justify-center text-gray-300">데이터 없음</div>}
            </div>
        </div>

        {/* 하단 리스트 (최신 200개만 표시) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h2 className="text-sm font-bold text-gray-700">최신 수집 로그 (Top 200)</h2>
            <span className="text-xs text-gray-500">리스트는 최신 200건만 표시됩니다</span>
          </div>
          <div className="overflow-x-auto max-h-[500px] custom-scrollbar">
            <table className="w-full text-sm text-left text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-100 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3">시간</th>
                  <th className="px-6 py-3">부동산</th>
                  <th className="px-6 py-3">동(Dong)</th>
                  <th className="px-6 py-3">스펙</th>
                  <th className="px-6 py-3">금액</th>
                  <th className="px-6 py-3">링크</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-blue-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-gray-900 w-[120px]">
                        <div className="text-[10px] text-gray-400">{log.crawl_date}</div>
                        <div>{log.crawl_time}</div>
                      </td>
                      <td className="px-6 py-3 font-bold text-blue-600">{log.agent}</td>
                      <td className="px-6 py-3 font-bold text-green-600">{log.dong}</td>
                      <td className="px-6 py-3 text-gray-600">{log.spec}</td>
                      <td className="px-6 py-3 font-bold text-gray-800">{log.price}</td>
                      <td className="px-6 py-3">
                        {log.article_no && log.article_no !== '-' ? (
                          <a href={`https://new.land.naver.com/complexes/108064?articleNo=${log.article_no}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-600"><ExternalLink className="w-4 h-4" /></a>
                        ) : "-"}
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}