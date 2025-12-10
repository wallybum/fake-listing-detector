import { StatData } from "./types";

export const COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", 
  "#0891b2", "#db2777", "#ca8a04", "#4b5563", "#0d9488",
  "#7c3aed", "#be185d", "#15803d", "#b45309", "#0369a1"
];

export const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));

export const commonChartOptions = {
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
    y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
    x: { grid: { display: false } }
  }
};

const findEarliestHour = (stats: StatData[], startHour: string) => {
  if (!stats || stats.length === 0) return parseInt(startHour, 10);
  const hours = stats.map(s => {
    let hStr = s.time_str;
    if (hStr.includes('시')) hStr = hStr.replace('시', '');
    return parseInt(hStr, 10);
  }).filter(n => !isNaN(n));
  if (hours.length === 0) return parseInt(startHour, 10);
  return Math.min(...hours);
};

const findLatestHour = (stats: StatData[], endHour: string) => {
  if (!stats || stats.length === 0) return parseInt(endHour, 10);
  const hours = stats.map(s => {
    let hStr = s.time_str;
    if (hStr.includes('시')) hStr = hStr.replace('시', '');
    return parseInt(hStr, 10);
  }).filter(n => !isNaN(n));
  if (hours.length === 0) return parseInt(endHour, 10);
  return Math.max(...hours);
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

export const generateSmartLabels = (
  stats: StatData[], 
  startDate: string, 
  endDate: string, 
  startHour: string, 
  endHour: string
) => {
  const labels: string[] = [];
  const isSingleDay = startDate === endDate;
  
  let start = parseInt(startHour, 10);
  let end = parseInt(endHour, 10);

  if (stats.length > 0) {
      if (start === 0) {
          const earliest = findEarliestHour(stats, startHour);
          if (earliest > start) start = earliest;
      }
      const latest = findLatestHour(stats, endHour);
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