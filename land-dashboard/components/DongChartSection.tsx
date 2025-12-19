"use client";

import { useEffect, useState, useRef, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { MapPin, ChevronDown } from 'lucide-react';
import { RealEstateLog } from '../utils/types';
import { COLORS, commonChartOptions } from '../utils/chartUtils';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartData,
  ChartOptions
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface Props {
  logs: RealEstateLog[];
  loading: boolean;
}

export default function DongChartSection({ logs, loading }: Props) {
  const [dongOptions, setDongOptions] = useState<string[]>([]);
  const [selectedDongs, setSelectedDongs] = useState<string[]>([]);
  const [chartData, setChartData] = useState<ChartData<"line"> | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const [hiddenDongs, setHiddenDongs] = useState<Set<string>>(new Set());

  // 1. 드롭다운 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsFilterOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 2. 로그 데이터에서 '동' 목록 추출
  useEffect(() => {
    if (logs && logs.length > 0) {
      const dongs = Array.from(new Set(logs.map((d) => d.dong || "알수없음"))).sort();
      setDongOptions(dongs);
      
      setSelectedDongs((prev) => {
        if (prev.length === 0) return dongs;
        return prev.filter(d => dongs.includes(d));
      });
    } else {
        setDongOptions([]);
        setSelectedDongs([]);
        setChartData(null);
    }
  }, [logs]);

  // 3. 차트 데이터 생성
  useEffect(() => {
    if (!logs || logs.length === 0) {
        setChartData(null);
        return;
    }

    const timeSet = new Set<string>();
    logs.forEach(log => {
        timeSet.add(`${log.crawl_date} ${log.crawl_time}`);
    });
    
    const labels = Array.from(timeSet).sort((a, b) => {
        return new Date(a).getTime() - new Date(b).getTime();
    });

    const datasets = selectedDongs.map((dong, index) => {
      const color = COLORS[(index + 5) % COLORS.length] || "#000000";

      const data = labels.map(label => {
         const [dDate, dTime] = label.split(" ");
         return logs.filter(l => l.crawl_date === dDate && l.crawl_time === dTime && l.dong === dong).length;
      });

      return {
        label: dong,
        data: data,
        borderColor: color,
        backgroundColor: color,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5,
        spanGaps: true,
        hidden: hiddenDongs.has(dong),
      };
    });

    setChartData({ labels, datasets });
  }, [selectedDongs, logs, hiddenDongs]);

  const toggleDong = (dong: string) => {
    if (selectedDongs.includes(dong)) setSelectedDongs(selectedDongs.filter(d => d !== dong));
    else setSelectedDongs([...selectedDongs, dong]);
  };
  
  const selectAll = () => setSelectedDongs(selectedDongs.length === dongOptions.length ? [] : [...dongOptions]);

  const toggleLegendVisibility = (dong: string) => {
    const newHidden = new Set(hiddenDongs);
    if (newHidden.has(dong)) newHidden.delete(dong);
    else newHidden.add(dong);
    setHiddenDongs(newHidden);
  };

  const updatedChartOptions = useMemo<ChartOptions<'line'>>(() => {
    const baseOptions = (commonChartOptions || {}) as any;
    return {
      ...baseOptions, 
      maintainAspectRatio: false,

      interaction: {
        mode: 'nearest',   
        intersect: false,   
      },

      plugins: {
        ...baseOptions.plugins,
        legend: { display: false },

        tooltip: {
            ...baseOptions.plugins?.tooltip,
            enabled: true,
            mode: 'nearest',   // 필수 설정
            intersect: false,
        }
      },
      scales: {
        ...baseOptions.scales,
        x: {
           ...baseOptions.scales?.x,
           ticks: { autoSkip: true, maxTicksLimit: 8 }
        }
      }
    };
  }, []); 

  return (
    <div className="mb-10">
        <div className="flex justify-between items-end mb-3 px-1">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-green-600"/> 동별 추이
            </h2>
            <div className="relative" ref={dropdownRef}>
                <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="text-xs font-medium bg-white border border-gray-300 px-3 py-1.5 rounded-md flex items-center gap-2 hover:bg-gray-50 text-gray-700">
                    {selectedDongs.length === dongOptions.length ? "전체 동 선택됨" : `${selectedDongs.length}개 선택됨`}
                    <ChevronDown className="w-3 h-3"/>
                </button>
                {isFilterOpen && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-xl z-20 flex flex-col max-h-[250px] animate-in fade-in zoom-in-95 duration-100">
                         <div className="p-2 border-b bg-gray-50 sticky top-0 bg-white z-10">
                            <label className="flex items-center gap-2 text-xs font-bold cursor-pointer hover:text-green-600">
                                <input type="checkbox" checked={selectedDongs.length === dongOptions.length && dongOptions.length > 0} onChange={selectAll} className="rounded text-green-600"/>
                                전체 선택
                            </label>
                        </div>
                        <div className="overflow-y-auto p-2 custom-scrollbar space-y-1">
                            {dongOptions.map(opt => (
                                <label key={opt} className="flex items-center gap-2 text-xs py-1.5 px-1 cursor-pointer hover:bg-green-50 rounded transition-colors">
                                    <input type="checkbox" checked={selectedDongs.includes(opt)} onChange={() => toggleDong(opt)} className="rounded text-green-600"/>
                                    <span className="truncate">{opt}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
        
        {/* ▼▼▼ 여기부터 수정됨: 반응형 레이아웃 적용 ▼▼▼ */}
        {/* 컨테이너: 모바일(flex-col/높이자동) -> PC(md:flex-row/높이350px) */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 h-auto md:h-[350px] flex flex-col md:flex-row gap-4">
            {loading ? (
                <div className="w-full h-[300px] flex items-center justify-center text-gray-400 gap-2">
                    데이터를 분석하고 있습니다...
                </div>
            ) : chartData && chartData.datasets.length > 0 ? (
                <>
                    {/* 차트 영역: 모바일(높이 250px) -> PC(높이 꽉 채움, flex-1) */}
                    <div className="w-full h-[250px] md:h-full md:flex-1 relative min-w-0">
                        <Line options={updatedChartOptions} data={chartData} />
                    </div>

                    {/* 범례 영역: */}
                    {/* 모바일: w-full, 높이 100px, 2열 그리드(grid-cols-2) */}
                    {/* PC(md): w-40, 높이 꽉 채움, 1열(flex-col) */}
                    <div className="w-full md:w-40 h-[100px] md:h-full pl-1 overflow-y-auto custom-scrollbar grid grid-cols-2 content-start gap-2 md:flex md:flex-col md:gap-1.5 pr-1 border-t md:border-t-0 pt-2 md:pt-0 border-gray-100">
                        {chartData.datasets.map((dataset) => {
                            const isHidden = hiddenDongs.has(dataset.label as string);
                            return (
                                <div 
                                    key={dataset.label} 
                                    onClick={() => toggleLegendVisibility(dataset.label as string)}
                                    className={`flex items-center gap-2 text-xs cursor-pointer px-2 py-1 rounded transition-colors hover:bg-gray-50 ${isHidden ? 'opacity-40' : 'opacity-100'}`}
                                >
                                    <span 
                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: dataset.borderColor as string }}
                                    ></span>
                                    <span className={`truncate ${isHidden ? 'line-through text-gray-500' : 'text-gray-700 font-medium'}`} title={dataset.label}>
                                        {dataset.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </>
            ) : (
                <div className="w-full h-[300px] flex items-center justify-center text-gray-300 flex-col gap-2">
                    <MapPin className="w-8 h-8 opacity-20"/>
                    <span>표시할 동 데이터가 없습니다.</span>
                </div>
            )}
        </div>
    </div>
  );
}