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
import { LayoutDashboard, Calendar as CalendarIcon, Clock, Building2, Search, ExternalLink, ChevronDown, Repeat } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// [수정] Log 인터페이스에 trade_type 추가 (DB 컬럼과 일치)
interface RealEstateLog {
  id: number;
  agent: string;
  dong: string;
  spec: string;
  price: string;
  article_no: string;
  trade_type: string; // 매매/전세
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

  // [신규] 거래 유형 상태 (기본값: 매매)
  const [tradeType, setTradeType] = useState<string>('매매');

  const [selectedAgents, setSelectedAgents] = useState<string[]>([]); 
  const [agentOptions, setAgentOptions] = useState<string[]>([]);
  const [isAgentFilterOpen, setIsAgentFilterOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [chartData, setChartData] = useState<any>(null);
  const [logs, setLogs] = useState<RealEstateLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // 1. 초기화
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
    
    // 초기 로딩 시 '매매' 기준으로 부동산 목록 가져오기
    fetchAgentList(today, '매매');

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsAgentFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // [수정] 거래 유형(tradeType)이 바뀌면 -> 해당 유형의 부동산 목록을 다시 불러와야 함
  useEffect(() => {
    if (startDate) {
      fetchAgentList(startDate, tradeType);
    }
    // tradeType이 바뀌면 fetchData는 아래 의존성 배열에 의해 자동 호출됨
  }, [tradeType]);

  // 2. 데이터 조회 트리거
  useEffect(() => {
    if (startDate && endDate && selectedAgents.length > 0) {
      fetchData();
    }
  }, [startDate, endDate, selectedAgents, tradeType, startHour, endHour]); 

  // [수정] 부동산 목록을 Logs 테이블에서 직접 가져옴 (agent_stats 사용 안 함)
  const fetchAgentList = async (date: string, type: string) => {
    // 해당 날짜/타입에 매물을 올린 부동산만 가져오기
    const { data } = await supabase
      .from('real_estate_logs')
      .select('agent')
      .eq('trade_type', type) // 매매면 매매 부동산, 전세면 전세 부동산
      .gte('crawl_date', date) // 오늘 이후 (혹은 전체 기간으로 하고 싶으면 이 조건 제거)
      .limit(2000); // 넉넉하게

    if (data) {
      // 중복 제거 및 정렬
      const uniqueAgents = Array.from(new Set(data.map(item => item.agent))).sort();
      setAgentOptions(uniqueAgents);
      setSelectedAgents(uniqueAgents); // 기본값: 전체 선택
    }
  };

  const fetchData = async () => {
    if (selectedAgents.length === 0) return;

    setLoading(true);

    // [핵심 변경] agent_stats 대신 real_estate_logs 원본을 조회
    let query = supabase
      .from('real_estate_logs')
      .select('*')
      .eq('trade_type', tradeType) // 1. 거래 유형 필터 (매매/전세)
      .order('crawl_date', { ascending: true })
      .order('crawl_time', { ascending: true })
      .limit(10000); // [중요] 1,000개 제한 돌파 (하루치 데이터를 다 가져오기 위함)

    // A. 날짜 필터
    if (startDate === endDate) {
      query = query.eq('crawl_date', startDate);
    } else {
      query = query.gte('crawl_date', startDate).lte('crawl_date', endDate);
    }

    // B. 시간 필터 (DB 포맷 '11시'에 맞춤)
    // startHour가 '09'라면 -> '09시'로 변환
    const startTimeFull = `${startHour}시`;
    const endTimeFull = `${endHour}시`;
    
    query = query.gte('crawl_time', startTimeFull).lte('crawl_time', endTimeFull);

    // C. 부동산 필터
    if (selectedAgents.length < agentOptions.length) {
      query = query.in('agent', selectedAgents);
    }

    const { data } = await query;
    const resultData = (data as RealEstateLog[]) || [];

    // 받아온 로그 데이터를 가공하여 차트 데이터 생성
    processDataFromLogs(resultData);
    
    // 리스트 표시는 최신순(역순)
    setLogs([...resultData].sort((a, b) => b.id - a.id));
    
    setLastUpdated(new Date().toLocaleString());
    setLoading(false);
  };

  // [신규 로직] 로그 데이터를 직접 카운팅하여 차트 그리기
  const processDataFromLogs = (logs: RealEstateLog[]) => {
    const isSingleDay = startDate === endDate;
    
    // 1. X축 라벨(시간) 추출 (중복 제거)
    const uniqueTimePoints = Array.from(new Set(logs.map(d => {
      const timeStr = d.crawl_time.substring(0, 5); // "11시" -> "11시" (그대로 씀)
      return isSingleDay ? timeStr : `${d.crawl_date.slice(5)} ${timeStr}`;
    }))).sort();

    // 2. 선택된 부동산별 데이터셋 생성
    const datasets = selectedAgents.map((agent, index) => {
      const color = COLORS[index % COLORS.length];
      
      // 현재 부동산의 로그만 필터링
      const agentLogs = logs.filter(d => d.agent === agent);
      
      const dataPoints = uniqueTimePoints.map(label => {
        // 해당 시간대(label)에 이 부동산 매물이 몇 개였는지 카운트
        const count = agentLogs.filter(d => {
          const timeStr = d.crawl_time.substring(0, 5);
          const currentLabel = isSingleDay ? timeStr : `${d.crawl_date.slice(5)} ${timeStr}`;
          return currentLabel === label;
        }).length;
        
        // 데이터가 있으면 개수 반환, 없으면 null (그래프 연결을 원하면 0으로 변경 가능)
        return count > 0 ? count : null; 
      });

      return {
        label: agent,
        data: dataPoints,
        borderColor: color,
        backgroundColor: color,
        tension: 0.3,       // 곡선
        pointRadius: 4,     // 점 크기
        pointHoverRadius: 9,
        spanGaps: true,     // null 값이 있어도 선 연결
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
      legend: { display: false },
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
        beginAtZero: true, // 0부터 시작
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

       {/* 컨트롤러 패널 */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 flex flex-wrap gap-4 items-end z-10 relative">
          
          {/* [1] 거래 유형 선택 (매매/전세) */}
          <div className="flex flex-col gap-1">
             <label className="text-xs font-semibold text-gray-500 flex items-center gap-1">
              <Repeat className="w-3 h-3" /> 거래 유형
            </label>
            <div className="relative">
                <select
                    value={tradeType}
                    onChange={(e) => setTradeType(e.target.value)}
                    className="appearance-none w-24 bg-blue-50 text-blue-700 font-bold px-3 py-2 rounded-md border border-blue-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                    <option value="매매">매매</option>
                    <option value="전세">전세</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
            </div>
          </div>

          {/* [2] 날짜 선택 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 flex items-center gap-1">
              <CalendarIcon className="w-3 h-3" /> 조회 기간
            </label>
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-md border border-gray-200">
              <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)}
                className="text-sm bg-transparent outline-none cursor-pointer text-gray-900"
              />
              <span className="text-gray-400">~</span>
              <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)}
                className="text-sm bg-transparent outline-none cursor-pointer text-gray-900"
              />
            </div>
          </div>

          {/* [3] 시간 선택 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" /> 시간대 (시)
            </label>
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-md border border-gray-200">
              <select 
                value={startHour} 
                onChange={(e) => setStartHour(e.target.value)}
                className="text-sm bg-transparent outline-none cursor-pointer text-gray-900"
              >
                {HOURS.map(h => <option key={`start-${h}`} value={h}>{h}시</option>)}
              </select>
              <span className="text-gray-400">~</span>
              <select 
                value={endHour} 
                onChange={(e) => setEndHour(e.target.value)}
                className="text-sm bg-transparent outline-none cursor-pointer text-gray-900"
              >
                {HOURS.map(h => <option key={`end-${h}`} value={h}>{h}시</option>)}
              </select>
            </div>
          </div>

          {/* [4] 부동산 선택 (다중) */}
          <div className="flex flex-col gap-1 min-w-[220px] relative" ref={dropdownRef}>
            <label className="text-xs font-semibold text-gray-500 flex items-center gap-1">
              <Building2 className="w-3 h-3" /> 부동산 선택 (다중)
            </label>
            
            <button 
              onClick={() => setIsAgentFilterOpen(!isAgentFilterOpen)}
              className="w-full text-sm bg-gray-50 px-3 py-2 rounded-md border border-gray-200 flex justify-between items-center hover:border-blue-500 transition-colors text-gray-900"
            >
              <span className="truncate">
                {agentOptions.length === 0 
                  ? "데이터 없음" 
                  : selectedAgents.length === agentOptions.length 
                    ? "전체 부동산 선택됨" 
                    : `${selectedAgents.length}개 부동산 선택됨`}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {/* 드롭다운 메뉴 */}
            {isAgentFilterOpen && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden flex flex-col max-h-[300px]">
                <div className="p-2 border-b border-gray-100 bg-gray-50 sticky top-0">
                  <label className="flex items-center gap-2 text-sm cursor-pointer font-bold text-gray-900 hover:text-blue-600">
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
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 mb-6 z-0 relative">
          <div className="w-full h-auto lg:h-[500px] flex flex-col lg:flex-row gap-6 lg:gap-4">
            
            <div className="flex-1 h-[300px] lg:h-full min-h-[300px] flex items-center justify-center">
              
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

              ) : loading ? (
                <div className="flex flex-col items-center gap-3 text-gray-400">
                  <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin"></div>
                  <p className="text-sm">데이터 불러오는 중...</p>
                </div>

              ) : chartData && chartData.labels && chartData.labels.length > 0 ? (
                <div className="w-full h-full">
                  <Line options={options} data={chartData} />
                </div>

              ) : (
                <div className="flex flex-col items-center gap-3 text-gray-400">
                  <div className="p-4 bg-gray-50 rounded-full">
                    <Search className="w-8 h-8 opacity-40" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium">수집된 정보가 없습니다.</p>
                    <p className="text-xs mt-1 text-gray-300">해당 조건의 매물 데이터가 없습니다.</p>
                  </div>
                </div>
              )}
            </div>

            {/* 범례 */}
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
                           {dataset.data.filter((v:any) => v !== null).slice(-1)[0] ?? '-'}건
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* 하단 상세 리스트 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-800">
                상세 수집 내역 <span className="text-blue-600">({tradeType})</span>
            </h2>
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