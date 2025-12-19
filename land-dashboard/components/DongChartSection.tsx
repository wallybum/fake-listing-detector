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

  // 3. 차트 데이터 생성 (데이터 매핑 로직 수정됨)
  useEffect(() => {
    if (!logs || logs.length === 0) {
        setChartData(null);
        return;
    }

    // (1) 데이터 계산을 위한 'Full Key' 생성
    const timeSet = new Set<string>();
    logs.forEach(log => {
        timeSet.add(`${log.crawl_date} ${log.crawl_time}`);
    });
    
    // 시간순 정렬된 전체 키값 (데이터 매핑용)
    const sortedFullKeys = Array.from(timeSet).sort((a, b) => {
        return new Date(a).getTime() - new Date(b).getTime();
    });

    // (2) 화면 표시용 라벨 생성 (같은 날이면 시간만, 아니면 날짜 포함)
    const uniqueDates = new Set(logs.map(l => l.crawl_date));
    const isSameDay = uniqueDates.size === 1;

    const labels = sortedFullKeys.map(fullKey => {
        if (isSameDay) {
            return fullKey.split(" ")[1]; // "13:20"
        } else {
            return fullKey.slice(5); // "12-19 13:20"
        }
    });

    // (3) 데이터셋 생성
    const datasets = selectedDongs.map((dong, index) => {
      const color = COLORS[(index + 5) % COLORS.length] || "#000000";

      // ★ 중요: labels가 아닌 sortedFullKeys를 기준으로 데이터 매핑 (0으로 나오는 문제 해결)
      const data = sortedFullKeys.map(fullKey => {
         const [dDate, dTime] = fullKey.split(" ");
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
        borderWidth: 1.5, // 모바일 가독성 위해 선 두께 조정
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

  // 4. 차트 옵션 (터치 개선 및 툴팁 설정)
  const updatedChartOptions = useMemo<ChartOptions<'line'>>(() => {
    const baseOptions = (commonChartOptions || {}) as any;
    return {
      ...baseOptions, 
      maintainAspectRatio: false,

      // ★ 상호작용: XY축 거리를 모두 계산하여 가장 가까운 점 1개 찾기
      interaction: {
        mode: 'nearest',   
        intersect: false,
        axis: 'xy', // [핵심] Touch interaction improvement
      },

      plugins: {
        ...baseOptions.plugins,
        legend: { display: false },

        tooltip: {
            enabled: true,
            mode: 'nearest',
            intersect: false,
            
            // 스타일링 (진한 검은색 배경)
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            padding: 10,
            titleFont: { size: 13 },
            bodyFont: { size: 13 },
            displayColors: true,
        }
      },
      scales: {
        ...baseOptions.scales,
        y: {
            beginAtZero: true,
            ticks: { precision: 0 }
        },
        x: {
           ...baseOptions.scales?.x,
           ticks: { autoSkip: true, maxTicksLimit: 6 } // 라벨 겹침 방지
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
                <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="text-xs font-medium bg-white border border-gray-300 px-3 py-1.5 rounded-md flex items-center gap-2 hover:bg-gray-50 text-gray-900">
                    {selectedDongs.length === dongOptions.length ? "전체 동 선택됨" : `${selectedDongs.length}개 선택됨`}
                    <ChevronDown className="w-3 h-3"/>
                </button>
                {isFilterOpen && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-xl z-20 flex flex-col max-h-[250px] animate-in fade-in zoom-in-95 duration-100">
                         <div className="p-2 border-b bg-gray-50 sticky top-0 bg-white z-10">
                            {/* text-gray-900 추가 */}
                            <label className="flex items-center gap-2 text-xs font-bold cursor-pointer hover:text-green-600 text-gray-900">
                                <input type="checkbox" checked={selectedDongs.length === dongOptions.length && dongOptions.length > 0} onChange={selectAll} className="rounded text-green-600"/>
                                전체 선택
                            </label>
                        </div>
                        <div className="overflow-y-auto p-2 custom-scrollbar space-y-1">
                            {dongOptions.map(opt => (
                                <label key={opt} className="flex items-center gap-2 text-xs py-1.5 px-1 cursor-pointer hover:bg-green-50 rounded transition-colors text-gray-900">
                                    <input type="checkbox" checked={selectedDongs.includes(opt)} onChange={() => toggleDong(opt)} className="rounded text-green-600"/>
                                    <span className="truncate">{opt}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
        
        {/* ▼▼▼ 레이아웃 수정: 모바일 패딩 축소 및 반응형 배치 ▼▼▼ */}
        <div className="bg-white p-2 md:p-5 rounded-xl shadow-sm border border-gray-200 h-auto md:h-[350px] flex flex-col md:flex-row gap-4">
            {loading ? (
                <div className="w-full h-[300px] flex items-center justify-center text-gray-400 gap-2">
                    데이터를 분석하고 있습니다...
                </div>
            ) : chartData && chartData.datasets.length > 0 ? (
                <>
                    {/* 차트 영역 */}
                    <div className="w-full h-[250px] md:h-full md:flex-1 relative min-w-0">
                        <Line options={updatedChartOptions} data={chartData} />
                    </div>

                    {/* 범례 영역 */}
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