"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { Line } from "react-chartjs-2";
import { Building2, ChevronDown } from "lucide-react";
import { RealEstateLog } from "../utils/types";
import { COLORS, commonChartOptions } from "../utils/chartUtils";
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
  ChartOptions,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface Props {
  logs: RealEstateLog[];
  loading: boolean;
  startHour: string;
  endHour: string;
}

export default function AgentChartSection({
  logs,
  loading,
  startHour,
  endHour,
}: Props) {
  const [agentOptions, setAgentOptions] = useState<string[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [chartData, setChartData] = useState<ChartData<"line"> | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [hiddenAgents, setHiddenAgents] = useState<Set<string>>(new Set());

  // 1. 드롭다운 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 2. 로그 데이터에서 부동산 목록 추출
  useEffect(() => {
    if (logs && logs.length > 0) {
      const agents = Array.from(
        new Set(logs.map((d) => d.agent || "알수없음"))
      ).sort();
      setAgentOptions(agents);
      setSelectedAgents((prev) => {
        if (prev.length === 0) return agents;
        return prev.filter((a) => agents.includes(a));
      });
    } else {
      setAgentOptions([]);
      setSelectedAgents([]);
      setChartData(null);
    }
  }, [logs]);

  // 3. 차트 데이터 생성
  useEffect(() => {
    if (!logs || logs.length === 0) {
      setChartData(null);
      return;
    }

    const sHour = parseInt(startHour, 10);
    const eHour = parseInt(endHour, 10);

    const filteredLogs = logs.filter((log) => {
      let h = 0;
      if (log.crawl_time.includes(":")) {
        h = parseInt(log.crawl_time.split(":")[0], 10);
      } else {
        h = parseInt(log.crawl_time.replace(/[^0-9]/g, ""), 10);
      }
      return h >= sHour && h <= eHour;
    });

    if (filteredLogs.length === 0) {
      setChartData(null);
      return;
    }

    const timeSet = new Set<string>();
    filteredLogs.forEach((log) => {
      timeSet.add(`${log.crawl_date} ${log.crawl_time}`);
    });

    const sortedFullKeys = Array.from(timeSet).sort((a, b) => {
        return new Date(a).getTime() - new Date(b).getTime();
    });

    const uniqueDates = new Set(filteredLogs.map(l => l.crawl_date));
    const isSameDay = uniqueDates.size === 1;

    const labels = sortedFullKeys.map(fullKey => {
        if (isSameDay) {
            return fullKey.split(" ")[1]; 
        } else {
            return fullKey.slice(5);
        }
    });

    const datasets = selectedAgents.map((agent, index) => {
      const color = COLORS[index % COLORS.length] || "#000000";

      const data = sortedFullKeys.map((fullKey) => {
        const [dDate, dTime] = fullKey.split(" ");
        return filteredLogs.filter(
          (l) =>
            l.crawl_date === dDate &&
            l.crawl_time === dTime &&
            l.agent === agent
        ).length;
      });

      return {
        label: agent,
        data: data,
        borderColor: color,
        backgroundColor: color,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5,
        borderWidth: 1.5,
        spanGaps: true,
        hidden: hiddenAgents.has(agent),
      };
    });

    setChartData({ labels, datasets });
  }, [selectedAgents, logs, hiddenAgents, startHour, endHour]);

  const toggleAgent = (agent: string) => {
    if (selectedAgents.includes(agent))
      setSelectedAgents(selectedAgents.filter((a) => a !== agent));
    else setSelectedAgents([...selectedAgents, agent]);
  };

  const selectAll = () => {
    setSelectedAgents(
      selectedAgents.length === agentOptions.length ? [] : [...agentOptions]
    );
  };

  const toggleLegendVisibility = (agent: string) => {
    const newHidden = new Set(hiddenAgents);
    if (newHidden.has(agent)) newHidden.delete(agent);
    else newHidden.add(agent);
    setHiddenAgents(newHidden);
  };

  // --- [수정됨] 내가 찍은 그 점만 나오게 설정 ---
  const updatedChartOptions = useMemo<ChartOptions<"line">>(() => {
    const baseOptions = (commonChartOptions || {}) as any;
    return {
      ...baseOptions,
      maintainAspectRatio: false,
      
      // ★ 상호작용 설정 수정
      interaction: {
        mode: 'nearest',   // 가장 가까운 점 찾기
        intersect: false,  // 점 위에 정확히 없어도 됨 (근처면 인식)
        axis: 'xy',        // [핵심] X축(시간)과 Y축(높이) 거리를 모두 계산해서 가장 가까운 1개만 찾음
      },

      plugins: {
        ...baseOptions.plugins,
        legend: { display: false },

        // ★ 툴팁 설정 수정
        tooltip: {
            enabled: true,
            mode: 'nearest', 
            intersect: false,
            
            // [삭제됨] itemSort와 filter 삭제 -> 거리순 1등(내가 찍은 것)이 자연스럽게 나옴
            
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
          ticks: { autoSkip: true, maxTicksLimit: 6 },
        },
      },
    };
  }, []);

  return (
    <div className="mb-8">
      {/* 헤더 */}
      <div className="flex justify-between items-end mb-3 px-1">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-600" /> 부동산별 추이
        </h2>
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="text-xs font-medium bg-white border border-gray-300 px-3 py-1.5 rounded-md flex items-center gap-2 hover:bg-gray-50 text-gray-900"
          >
            {selectedAgents.length === agentOptions.length
              ? "전체 부동산 선택됨"
              : `${selectedAgents.length}개 선택됨`}
            <ChevronDown className="w-3 h-3" />
          </button>
          {isFilterOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-xl z-20 flex flex-col max-h-[250px] animate-in fade-in zoom-in-95 duration-100">
              <div className="p-2 border-b bg-gray-50 sticky top-0 bg-white z-10">
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer hover:text-blue-600 text-gray-900">
                  <input
                    type="checkbox"
                    checked={
                      selectedAgents.length === agentOptions.length &&
                      agentOptions.length > 0
                    }
                    onChange={selectAll}
                    className="rounded text-blue-600"
                  />
                  전체 선택
                </label>
              </div>
              <div className="overflow-y-auto p-2 custom-scrollbar space-y-1">
                {agentOptions.map((opt) => (
                  <label
                    key={opt}
                    className="flex items-center gap-2 text-xs py-1.5 px-1 cursor-pointer hover:bg-blue-50 rounded transition-colors text-gray-900"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAgents.includes(opt)}
                      onChange={() => toggleAgent(opt)}
                      className="rounded text-blue-600"
                    />
                    <span className="truncate">{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 차트 영역 */}
      <div className="bg-white p-2 md:p-5 rounded-xl shadow-sm border border-gray-200 h-auto md:h-[350px] flex flex-col md:flex-row gap-4">
        {loading ? (
          <div className="w-full h-[300px] flex items-center justify-center text-gray-400 gap-2">
            데이터를 분석하고 있습니다...
          </div>
        ) : chartData && chartData.datasets.length > 0 ? (
          <>
            <div className="w-full h-[250px] md:h-full md:flex-1 relative min-w-0">
              <Line options={updatedChartOptions} data={chartData} />
            </div>

            <div className="w-full md:w-56 h-[100px] md:h-full pl-1 overflow-y-auto custom-scrollbar grid grid-cols-2 content-start gap-2 md:flex md:flex-col md:gap-1.5 pr-1 border-t md:border-t-0 pt-2 md:pt-0 border-gray-100">
              {chartData.datasets.map((dataset) => {
                const isHidden = hiddenAgents.has(dataset.label as string);
                return (
                  <div
                    key={dataset.label}
                    onClick={() =>
                      toggleLegendVisibility(dataset.label as string)
                    }
                    className={`flex items-center gap-2 text-xs cursor-pointer px-2 py-1 rounded transition-colors hover:bg-gray-50 ${
                      isHidden ? "opacity-40" : "opacity-100"
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: dataset.borderColor as string }}
                    ></span>
                    <span
                      className={`truncate ${
                        isHidden
                          ? "line-through text-gray-500"
                          : "text-gray-700 font-medium"
                      }`}
                      title={dataset.label}
                    >
                      {dataset.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="w-full h-[300px] flex items-center justify-center text-gray-300 flex-col gap-2">
            <Building2 className="w-8 h-8 opacity-20" />
            <span>표시할 부동산 데이터가 없습니다.</span>
          </div>
        )}
      </div>
    </div>
  );
}