"use client";

import { ExternalLink } from 'lucide-react';
import { RealEstateLog } from '../utils/types';

interface Props {
    logs: RealEstateLog[];
}
/* 하단 리스트 (최신 200개만 표시) */
export default function RecentLogsList({ logs }: Props) {
  return (
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
  );
}