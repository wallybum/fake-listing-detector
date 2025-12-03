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
import { LayoutDashboard, Calendar as CalendarIcon, Clock, Building2, Search, ExternalLink, ChevronDown } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface AgentStat {
  id: number;
  agent: string;
  count: number;
  crawl_time: string;
  crawl_date: string;
}

interface RealEstateLog {
  id: number;
  agent: string;
  dong: string;
  spec: string;
  price: string;
  article_no: string;
  crawl_time: string;
  crawl_date: string;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", 
  "#0891b2", "#db2777", "#ca8a04", "#4b5563", "#0d9488"
];

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));

export default function Dashboard() {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  const [startHour, setStartHour] = useState<string>('00');
  const [endHour, setEndHour] = useState<string>('23');

  const [selectedAgents, setSelectedAgents] = useState<string[]>([]); 
  const [agentOptions, setAgentOptions] = useState<string[]>([]);
  const [isAgentFilterOpen, setIsAgentFilterOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [chartData, setChartData] = useState<any>(null);
  const [logs, setLogs] = useState<RealEstateLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // 1. 초기화: 날짜 설정 및 부동산 목록 가져오기
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
    fetchAgentList();

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsAgentFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 2. 데이터 조회 트리거 수정 (핵심 수정!)
  // [수정] selectedAgents가 채워지면(변경되면) 자동으로 fetchData 실행되도록 추가
  useEffect(() => {
    if (startDate && endDate && selectedAgents.length > 0) {
      fetchData();
    }
  }, [startDate, endDate, selectedAgents]); 

  const fetchAgentList = async () => {
    const { data } = await supabase
      .from('agent_stats')
      .select('agent')
      .order('agent', { ascending: true });

    if (data) {
      const uniqueAgents = Array.from(new Set(data.map(item => item.agent))).sort();
      setAgentOptions(uniqueAgents);
      setSelectedAgents(uniqueAgents); // 초기값: 전체 선택 (이게 실행되면 위 useEffect가 감지해서 데이터 조회함)
    }
  };

  const fetchData = async () => {
    // 부동산 목록이 아직 로딩 안 됐으면 조회 스킵 (불필요한 에러 방지)
    if (selectedAgents.length === 0) return;

    setLoading(true);

    let statsQuery = supabase
      .from('agent_stats')
      .select('*')
      .order('crawl_date', { ascending: true })
      .order('crawl_time', { ascending: true });

    let logsQuery = supabase
      .from('real_estate_logs')
      .select('*')
      .order('id', { ascending: false });

    // A. 날짜
    if (startDate === endDate) {
      statsQuery = statsQuery.eq('crawl_date', startDate);
      logsQuery = logsQuery.eq('crawl_date', startDate);
    } else {
      statsQuery = statsQuery.gte('crawl_date', startDate).lte('crawl_date', endDate);
      logsQuery = logsQuery.gte('crawl_date', startDate).lte('crawl_date', endDate);
    }

    // B. 시간
    const startTimeFull = `${startHour}:00`;
    const endTimeFull = `${endHour}:59`;

    statsQuery = statsQuery.gte('crawl_time', startTimeFull).lte('crawl_time', endTimeFull);
    logsQuery = logsQuery.gte('crawl_time', startTimeFull).lte('crawl_time', endTimeFull);

    // C. 부동산 (전체 선택이 아닐 때만 필터링)
    if (selectedAgents.length < agentOptions.length) {
      statsQuery = statsQuery.in('agent', selectedAgents);
      logsQuery = logsQuery.in('agent', selectedAgents);
    }

    const { data: statsData } = await statsQuery;
    const { data: logsData } = await logsQuery;

    processData((statsData as AgentStat[]) || []);
    setLogs((logsData as RealEstateLog[]) || []);
    setLastUpdated(new Date().toLocaleString());
    setLoading(false);
  };

  const processData = (data: AgentStat[]) => {
    const isSingleDay = startDate === endDate;
    const uniqueTimePoints = Array.from(new Set(data.map(d => {
      const timeStr = d.crawl_time.substring(0, 5); 
      return isSingleDay ? timeStr : `${d.crawl_date.slice(5)} ${timeStr}`;
    }))).sort();

    // 선택된 부동산 목록 기준으로 데이터셋 생성
    // (selectedAgents 순서나 필터링을 따르는 게 좋으므로 여기서는 데이터에 있는 것만 추림)
    const activeAgents = Array.from(new Set(data.map(d => d.agent))).sort();

    const datasets = activeAgents.map((agent, index) => {
      const color = COLORS[index % COLORS.length];
      const agentData = data.filter(d => d.agent === agent);
      
      const dataPoints = uniqueTimePoints.map(label => {
        const found = agentData.find(d => {
          const timeStr = d.crawl_time.substring(0, 5);
          const currentLabel = isSingleDay ? timeStr : `${d.crawl_date.slice(5)} ${timeStr}`;
          return currentLabel === label;
        });
        return found ? found.count : null;
      });

      return {
        label: agent,
        data: dataPoints,
        borderColor: color,
        backgroundColor: color,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 9,
        spanGaps: true,
      };
    });

    setChartData({
      labels: uniqueTimePoints,
      datasets
    });
  };

  const handleAgentToggle = (agent: string) => {
    if (selectedAgents.includes(agent)) {
      setSelectedAgents(selectedAgents.filter(a => a !== agent));
    } else {
      setSelectedAgents([...selectedAgents, agent]);
    }
  };

  const handleSelectAll = () => {
    if (selectedAgents.length === agentOptions.length) {
      setSelectedAgents([]);
    } else {
      setSelectedAgents([...agentOptions]);
    }
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: true 
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#111',
        bodyColor: '#333',
        borderColor: '#ddd',
        borderWidth: 1,
        padding: 10,
        displayColors: true,
        callbacks: {
          label: function(context: any) {
            return ` ${context.dataset.label}: ${context.raw}건`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        ticks: { stepSize: 1, precision: 0 }
      },
      x: { grid: { display: false } }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        
        <div className="flex items-center gap-2 mb-4">
          <LayoutDashboard className="text-blue-600 w-7 h-7" />
          <h1 className="text-2xl font-bold text-gray-800">DMC 파크뷰자이 매물 현황 분석</h1>
        </div>

        {/* 컨트롤러 */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 flex flex-wrap gap-4 items-end z-10 relative">
          
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 flex items-center gap-1">
              <CalendarIcon className="w-3 h-3" /> 조회 기간
            </label>
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-md border border-gray-200">
              <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)}
                className="text-sm bg-transparent outline-none cursor-pointer"
              />
              <span className="text-gray-400">~</span>
              <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)}
                className="text-sm bg-transparent outline-none cursor-pointer"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" /> 시간대 (시)
            </label>
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-md border border-gray-200">
              <select 
                value={startHour} 
                onChange={(e) => setStartHour(e.target.value)}
                className="text-sm bg-transparent outline-none cursor-pointer"
              >
                {HOURS.map(h => <option key={`start-${h}`} value={h}>{h}시</option>)}
              </select>
              <span className="text-gray-400">~</span>
              <select 
                value={endHour} 
                onChange={(e) => setEndHour(e.target.value)}
                className="text-sm bg-transparent outline-none cursor-pointer"
              >
                {HOURS.map(h => <option key={`end-${h}`} value={h}>{h}시</option>)}
              </select>
            </div>
          </div>

          {/* 부동산 다중 선택 */}
          <div className="flex flex-col gap-1 min-w-[220px] relative" ref={dropdownRef}>
            <label className="text-xs font-semibold text-gray-500 flex items-center gap-1">
              <Building2 className="w-3 h-3" /> 부동산 선택 (다중)
            </label>
            
            <button 
              onClick={() => setIsAgentFilterOpen(!isAgentFilterOpen)}
              className="w-full text-sm bg-gray-50 px-3 py-2 rounded-md border border-gray-200 flex justify-between items-center hover:border-blue-500 transition-colors"
            >
              <span className="truncate">
                {/* [수정] 로딩 중일 땐 텍스트 다르게 표시 */}
                {agentOptions.length === 0 
                  ? "목록 불러오는 중..." 
                  : selectedAgents.length === agentOptions.length 
                    ? "전체 부동산 선택됨" 
                    : `${selectedAgents.length}개 부동산 선택됨`}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {isAgentFilterOpen && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden flex flex-col max-h-[300px]">
                <div className="p-2 border-b border-gray-100 bg-gray-50 sticky top-0">
                  <label className="flex items-center gap-2 text-sm cursor-pointer font-bold text-gray-700 hover:text-blue-600">
                    <input 
                      type="checkbox" 
                      checked={agentOptions.length > 0 && selectedAgents.length === agentOptions.length}
                      onChange={handleSelectAll}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    전체 선택 ({agentOptions.length})
                  </label>
                </div>
                
                <div className="overflow-y-auto p-2 space-y-1 custom-scrollbar">
                  {agentOptions.map((agent) => (
                    <label key={agent} className="flex items-center gap-2 text-sm text-gray-900 cursor-pointer hover:bg-blue-50 p-1 rounded transition-colors">
                      <input 
                        type="checkbox" 
                        checked={selectedAgents.includes(agent)}
                        onChange={() => handleAgentToggle(agent)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="truncate">{agent}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button 
            onClick={fetchData} 
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-bold transition-colors shadow-sm h-[38px] mb-[1px]"
          >
            <Search className="w-4 h-4" /> 조회하기
          </button>

          <div className="flex-1 text-right self-end mb-2">
            <span className="text-xs text-gray-400">Updated: {lastUpdated}</span>
          </div>
        </div>

        {/* 차트 영역 */}
        {/* 차트 영역 */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 mb-6 z-0 relative">
          <div className="w-full h-auto lg:h-[500px] flex flex-col lg:flex-row gap-6 lg:gap-4">
            
            {/* 1. 차트 및 상태 메시지 표시 영역 */}
            <div className="flex-1 h-[300px] lg:h-full min-h-[300px] flex items-center justify-center">
              
              {/* Case 1: 선택된 부동산이 0개일 때 */}
              {selectedAgents.length === 0 ? (
                <div className="flex flex-col items-center gap-3 text-gray-400">
                  <div className="p-4 bg-gray-50 rounded-full">
                    <Building2 className="w-8 h-8 opacity-40" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium">선택된 부동산 정보가 없습니다.</p>
                    <p className="text-xs mt-1 text-gray-300">상단의 드롭다운에서 부동산을 선택해주세요.</p>
                  </div>
                </div>

              /* Case 2: 데이터 로딩 중일 때 */
              ) : loading ? (
                <div className="flex flex-col items-center gap-3 text-gray-400">
                  <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin"></div>
                  <p className="text-sm">데이터 불러오는 중...</p>
                </div>

              /* Case 3: 데이터가 존재할 때 (차트 렌더링) */
              ) : chartData && chartData.labels && chartData.labels.length > 0 ? (
                <div className="w-full h-full">
                  <Line options={options} data={chartData} />
                </div>

              /* Case 4: 선택은 했으나 DB에 데이터가 없을 때 */
              ) : (
                <div className="flex flex-col items-center gap-3 text-gray-400">
                  <div className="p-4 bg-gray-50 rounded-full">
                    <Search className="w-8 h-8 opacity-40" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium">수집된 정보가 없습니다.</p>
                    <p className="text-xs mt-1 text-gray-300">조회 기간을 변경하거나 크롤링 상태를 확인해주세요.</p>
                  </div>
                </div>
              )}
            </div>

            {/* 2. 범례(목록) 영역 - 데이터가 있을 때만 표시 */}
            {!loading && selectedAgents.length > 0 && chartData && chartData.labels.length > 0 && (
              <div className="w-full lg:w-[280px] h-[250px] lg:h-full border-t lg:border-t-0 lg:border-l border-gray-100 pt-4 lg:pt-0 lg:pl-4 flex flex-col">
                <h3 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider flex justify-between items-center">
                  <span>부동산 목록 ({chartData.datasets.length})</span>
                  <span className="text-[10px] font-normal text-gray-400">스크롤 가능</span>
                </h3>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                  <ul className="space-y-1">
                    {chartData.datasets.map((dataset: any) => (
                      <li key={dataset.label} className="flex items-center gap-2 text-xs text-gray-600 hover:bg-gray-50 p-2 rounded cursor-default border border-transparent hover:border-gray-100 transition-colors">
                        <span 
                          className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm" 
                          style={{ backgroundColor: dataset.borderColor }}
                        />
                        <span className="truncate" title={dataset.label}>
                          {dataset.label}
                        </span>
                        <span className="ml-auto font-mono text-gray-400 text-[10px]">
                           {dataset.data[dataset.data.length - 1] ?? '-'}건
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* 하단 리스트 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-800">상세 수집 내역</h2>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">총 {logs.length}건</span>
          </div>
          <div className="overflow-x-auto max-h-[500px] custom-scrollbar">
            <table className="w-full text-sm text-left text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3">날짜/시간</th>
                  <th className="px-6 py-3">중개사</th>
                  <th className="px-6 py-3">위치</th>
                  <th className="px-6 py-3">스펙</th>
                  <th className="px-6 py-3">금액</th>
                  <th className="px-6 py-3">매물번호</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.length > 0 ? (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-gray-900">
                        <div className="text-xs text-gray-400">{log.crawl_date}</div>
                        <div>{log.crawl_time}</div>
                      </td>
                      <td className="px-6 py-3 font-bold text-blue-600">{log.agent}</td>
                      <td className="px-6 py-3">{log.dong}</td>
                      <td className="px-6 py-3 text-gray-600">{log.spec}</td>
                      <td className="px-6 py-3 font-bold text-gray-800">{log.price}</td>
                      <td className="px-6 py-3">
                        {log.article_no && log.article_no !== '-' ? (
                          <a 
                            href={`https://new.land.naver.com/complexes/108064?articleNo=${log.article_no}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-500 hover:text-blue-700 hover:underline font-medium"
                            title="네이버 부동산 상세 보기"
                          >
                            {log.article_no}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-gray-400">조회된 데이터가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}