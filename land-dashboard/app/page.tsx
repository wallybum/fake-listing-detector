"use client";

import { useEffect, useState } from 'react';
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
// [추가됨] 링크 아이콘을 위해 ExternalLink 추가
import { LayoutDashboard, RefreshCw, Calendar as CalendarIcon, Clock, Building2, Search, ExternalLink } from 'lucide-react';

// 1. Chart.js 등록
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// 2. 타입 정의
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
  article_no: string; // 매물번호 필드
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
  // --- [상태 관리] ---
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  const [startHour, setStartHour] = useState<string>('00');
  const [endHour, setEndHour] = useState<string>('23');

  const [selectedAgent, setSelectedAgent] = useState<string>('ALL');
  const [agentOptions, setAgentOptions] = useState<string[]>([]);

  const [chartData, setChartData] = useState<any>(null);
  const [logs, setLogs] = useState<RealEstateLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
    fetchAgentList();
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      fetchData();
    }
  }, [startDate, endDate]);

  const fetchAgentList = async () => {
    const { data } = await supabase
      .from('agent_stats')
      .select('agent')
      .order('agent', { ascending: true });

    if (data) {
      const uniqueAgents = Array.from(new Set(data.map(item => item.agent)));
      setAgentOptions(uniqueAgents);
    }
  };

  const fetchData = async () => {
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

    // A. 날짜 필터링
    if (startDate === endDate) {
      statsQuery = statsQuery.eq('crawl_date', startDate);
      logsQuery = logsQuery.eq('crawl_date', startDate);
    } else {
      statsQuery = statsQuery.gte('crawl_date', startDate).lte('crawl_date', endDate);
      logsQuery = logsQuery.gte('crawl_date', startDate).lte('crawl_date', endDate);
    }

    // B. 시간 필터링
    const startTimeFull = `${startHour}:00`;
    const endTimeFull = `${endHour}:59`;

    statsQuery = statsQuery.gte('crawl_time', startTimeFull).lte('crawl_time', endTimeFull);
    logsQuery = logsQuery.gte('crawl_time', startTimeFull).lte('crawl_time', endTimeFull);

    // C. 부동산 필터링
    if (selectedAgent !== 'ALL') {
      statsQuery = statsQuery.eq('agent', selectedAgent);
      logsQuery = logsQuery.eq('agent', selectedAgent);
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

    const agents = Array.from(new Set(data.map(d => d.agent))).sort();

    const datasets = agents.map((agent, index) => {
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
        position: 'right' as const,
        labels: { usePointStyle: true, boxWidth: 8 }
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
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 flex flex-wrap gap-4 items-end">
          
          {/* 1. 날짜 선택 */}
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

          {/* 2. 시간 선택 */}
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

          {/* 3. 부동산 선택 */}
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs font-semibold text-gray-500 flex items-center gap-1">
              <Building2 className="w-3 h-3" /> 부동산 선택
            </label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="w-full text-sm bg-gray-50 px-3 py-2 rounded-md border border-gray-200 outline-none cursor-pointer focus:border-blue-500 transition-colors"
            >
              <option value="ALL">전체 보기</option>
              {agentOptions.map((agent) => (
                <option key={agent} value={agent}>{agent}</option>
              ))}
            </select>
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
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 mb-6">
          <div className="w-full h-[500px]">
            {loading ? (
              <div className="h-full flex items-center justify-center text-gray-400">데이터 불러오는 중...</div>
            ) : chartData ? (
              <Line options={options} data={chartData} />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">데이터 없음</div>
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
                  {/* [추가] 매물번호 헤더 */}
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
                      
                      {/* [추가] 매물번호 및 링크 */}
                      <td className="px-6 py-3">
                        <a 
                          href={`https://fin.land.naver.com/articles/${log.article_no}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-500 hover:text-blue-700 hover:underline font-medium"
                          title="네이버 부동산에서 보기"
                        >
                          {log.article_no}
                          <ExternalLink className="w-3 h-3" />
                        </a>
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
