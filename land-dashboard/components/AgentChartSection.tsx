"use client";

import { useEffect, useState, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import { Building2, ChevronDown } from 'lucide-react';
import { StatData } from '../utils/types';
import { COLORS, generateSmartLabels, commonChartOptions } from '../utils/chartUtils';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface Props {
  rawStats: StatData[];
  loading: boolean;
  startDate: string;
  endDate: string;
  startHour: string;
  endHour: string;
}

export default function AgentChartSection({ rawStats, loading, startDate, endDate, startHour, endHour }: Props) {
  const [agentOptions, setAgentOptions] = useState<string[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [chartData, setChartData] = useState<any>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsFilterOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (rawStats && rawStats.length > 0) {
      const agents = Array.from(new Set(rawStats.map((d) => d.agent!))).sort();
      setAgentOptions(agents);
      setSelectedAgents(agents);
    } else {
        setAgentOptions([]);
        setSelectedAgents([]);
        setChartData(null);
    }
  }, [rawStats]);

  useEffect(() => {
    if (!rawStats || rawStats.length === 0) return;
    
    const isSingleDay = startDate === endDate;
    let labels = generateSmartLabels(rawStats, startDate, endDate, startHour, endHour);
    if (!labels) labels = [];

    const datasets = selectedAgents.map((agent, index) => {
      const color = COLORS[index % COLORS.length];
      const targetStats = rawStats.filter(s => s.agent === agent);
      
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

      return {
        label: agent,
        data: labels.map(label => countMap[label] || null),
        borderColor: color,
        backgroundColor: color,
        tension: 0.3,
        pointRadius: 3,
        spanGaps: true,
      };
    });

    setChartData({ labels, datasets });
  }, [selectedAgents, rawStats, startDate, endDate, startHour, endHour]);

  const toggleAgent = (agent: string) => {
    if (selectedAgents.includes(agent)) setSelectedAgents(selectedAgents.filter(a => a !== agent));
    else setSelectedAgents([...selectedAgents, agent]);
  };
  const selectAll = () => setSelectedAgents(selectedAgents.length === agentOptions.length ? [] : [...agentOptions]);

  return (
    /* 차트 영역 A: 부동산 */
    <div className="mb-8">
        <div className="flex justify-between items-end mb-3 px-1">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600"/> 부동산별 추이(2025-12-11 17시 부터 수집)
            </h2>
            <div className="relative" ref={dropdownRef}>
                <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="text-xs font-medium bg-white border border-gray-300 px-3 py-1.5 rounded-md flex items-center gap-2 hover:bg-gray-50 text-gray-700">
                    {selectedAgents.length === agentOptions.length ? "전체 부동산 선택됨" : `${selectedAgents.length}개 선택됨`}
                    <ChevronDown className="w-3 h-3"/>
                </button>
                {isFilterOpen && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-xl z-20 flex flex-col max-h-[250px]">
                        <div className="p-2 border-b bg-gray-50 sticky top-0"><label className="flex items-center gap-2 text-xs font-bold cursor-pointer"><input type="checkbox" checked={selectedAgents.length === agentOptions.length} onChange={selectAll} className="rounded text-blue-600"/>전체 선택</label></div>
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
             chartData ? <Line options={commonChartOptions} data={chartData} /> : <div className="h-full flex items-center justify-center text-gray-300">데이터 없음</div>}
        </div>
    </div>
  );
}