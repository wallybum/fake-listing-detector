"use client";

import { useState, useMemo } from 'react';
import { 
  ExternalLink, ArrowDownRight, ArrowUpRight, Clock, Tag, Search, 
  History, ChevronDown, ChevronUp, Activity, RefreshCcw, 
  MinusCircle, Crown, CheckCircle2, Filter, X
} from 'lucide-react';
import { RealEstateLog } from '../utils/types';

interface Props {
  logs: RealEstateLog[];
}

interface TimelineItem {
  full_key: string;
  date: string;
  time: string;
  status: 'collected' | 'missing';
  price?: string;
  agent?: string;
  dong?: string;
}

interface AnalyzedListing {
  article_no: string;
  dong: string;
  spec: string;
  agent: string;
  current_price: string;
  initial_price: string;
  
  is_landlord: boolean;        
  verification_date?: string;  

  has_history_change: boolean;   
  is_relisted: boolean;          
  price_direction: 'up' | 'down' | 'same' | 'fluctuated'; 
  
  first_seen: string;
  last_seen: string;
  status: 'active' | 'deleted' | 'new';
  display_timeline: TimelineItem[]; 
}

export default function ListingLifecycleAnalysis({ logs }: Props) {
  const [mainTab, setMainTab] = useState<'active' | 'analysis' | 'deleted'>('active');
  const [filterIssue, setFilterIssue] = useState<'all' | 'price' | 'relist'>('all');
  const [filterOwner, setFilterOwner] = useState<'all' | 'landlord' | 'agent'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedItems);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedItems(newSet);
  };

  const analyzedData = useMemo(() => {
    if (logs.length === 0) return [];

    const uniqueSnapshots = Array.from(new Set(logs.map(l => `${l.crawl_date}|${l.crawl_time}`)));
    uniqueSnapshots.sort((a, b) => {
        const [dateA, timeA] = a.split('|');
        const [dateB, timeB] = b.split('|');
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        const numA = parseInt(timeA.replace(/[^0-9]/g, ''), 10);
        const numB = parseInt(timeB.replace(/[^0-9]/g, ''), 10);
        return numB - numA;
    });

    const latestSnapshotKey = uniqueSnapshots[0];
    const groups: Record<string, RealEstateLog[]> = {};
    logs.forEach(log => {
      if (!log.article_no || log.article_no === '-') return;
      if (!groups[log.article_no]) groups[log.article_no] = [];
      groups[log.article_no].push(log);
    });

    const analyzed: AnalyzedListing[] = Object.keys(groups).map(key => {
      const items = groups[key];
      items.sort((a, b) => {
          if (a.crawl_date !== b.crawl_date) return a.crawl_date.localeCompare(b.crawl_date);
          const tA = parseInt(a.crawl_time.replace(/[^0-9]/g, ''), 10);
          const tB = parseInt(b.crawl_time.replace(/[^0-9]/g, ''), 10);
          return tA - tB;
      });

      const firstItem = items[0];
      const lastItem = items[items.length - 1]; 
      const lastItemKey = `${lastItem.crawl_date}|${lastItem.crawl_time}`;

      const normalizePrice = (p: string) => p.replace(/\s+/g, '').replace(/,/g, '').trim();
      const allPrices = items.map(i => normalizePrice(i.price));
      const distinctPrices = new Set(allPrices);
      const has_history_change = distinctPrices.size > 1;

      const initialPriceVal = parseInt(firstItem.price.replace(/[^0-9]/g, ''));
      const currentPriceVal = parseInt(lastItem.price.replace(/[^0-9]/g, ''));
      
      let priceDir: 'up' | 'down' | 'same' | 'fluctuated' = 'same';
      if (currentPriceVal > initialPriceVal) priceDir = 'up';
      else if (currentPriceVal < initialPriceVal) priceDir = 'down';
      else if (has_history_change) priceDir = 'fluctuated';

      let status: 'active' | 'deleted' | 'new' = 'active';
      if (lastItemKey !== latestSnapshotKey) status = 'deleted'; 
      else if (items.length === 1 && uniqueSnapshots.length > 1) status = 'new';

      const full_timeline: TimelineItem[] = uniqueSnapshots.map(snapshotKey => {
        const [sDate, sTime] = snapshotKey.split('|');
        const log = items.find(i => i.crawl_date === sDate && i.crawl_time === sTime);
        if (log) {
          return { full_key: snapshotKey, date: sDate, time: sTime, status: 'collected', price: log.price, agent: log.agent, dong: log.dong };
        } else {
            return { full_key: snapshotKey, date: sDate, time: sTime, status: 'missing' };
        }
      });

      let validTimeline = full_timeline;
      let is_relisted = false;
      const reversed = [...full_timeline].reverse(); 
      const firstCollectedIdx = reversed.findIndex(t => t.status === 'collected');
      
      if (firstCollectedIdx !== -1) {
          const validRaw = reversed.slice(firstCollectedIdx);
          const hasGap = validRaw.some((t, idx) => {
             if (t.status === 'missing' && idx < validRaw.length - 1) {
                 const future = validRaw.slice(idx + 1);
                 return future.some(f => f.status === 'collected');
             }
             return false;
          });
          if (hasGap) is_relisted = true;

          const changesOnly = validRaw.filter((item, idx) => {
             if (idx === 0) return true; 
             const prevItem = validRaw[idx - 1];
             if (item.status !== prevItem.status) return true;
             if (item.status === 'collected' && prevItem.status === 'collected') {
                 const p1 = normalizePrice(item.price || '');
                 const p2 = normalizePrice(prevItem.price || '');
                 return p1 !== p2;
             }
             return false;
          });
          validTimeline = changesOnly.reverse();
      } else {
          validTimeline = [];
      }

      return {
        article_no: key, dong: lastItem.dong, spec: lastItem.spec, agent: lastItem.agent,
        current_price: lastItem.price, initial_price: firstItem.price,
        is_landlord: (lastItem as any).is_landlord || false,
        verification_date: (lastItem as any).verification_date || null,
        has_history_change, is_relisted, price_direction: priceDir,
        first_seen: `${firstItem.crawl_date} ${firstItem.crawl_time}`,
        last_seen: `${lastItem.crawl_date} ${lastItem.crawl_time}`,
        status, 
        display_timeline: validTimeline
      };
    });

    return analyzed.sort((a, b) => b.last_seen.localeCompare(a.last_seen));
  }, [logs]);

  const filteredData = useMemo(() => {
    return analyzedData.filter(item => {
      const matchSearch = item.dong.includes(searchTerm) || item.agent.includes(searchTerm) || item.article_no.includes(searchTerm);
      if (!matchSearch) return false;

      if (mainTab === 'active') return item.status === 'active' || item.status === 'new';
      if (mainTab === 'deleted') return item.status === 'deleted';
      
      if (mainTab === 'analysis') {
          const hasIssue = item.has_history_change || item.is_relisted;
          if (!hasIssue) return false;
          if (filterIssue === 'price' && !item.has_history_change) return false;
          if (filterIssue === 'relist' && !item.is_relisted) return false;
          if (filterOwner === 'landlord' && !item.is_landlord) return false;
          if (filterOwner === 'agent' && item.is_landlord) return false;
          return true;
      }
      return true;
    });
  }, [analyzedData, mainTab, filterIssue, filterOwner, searchTerm]);

  const counts = useMemo(() => {
    const analysisBase = analyzedData.filter(d => d.has_history_change || d.is_relisted);
    return {
        active: analyzedData.filter(d => d.status === 'active' || d.status === 'new').length,
        deleted: analyzedData.filter(d => d.status === 'deleted').length,
        analysisTotal: analysisBase.length,
        cntPrice: analysisBase.filter(d => d.has_history_change).length,
        cntRelist: analysisBase.filter(d => d.is_relisted).length,
        cntLandlord: analysisBase.filter(d => d.is_landlord).length,
        cntAgent: analysisBase.filter(d => !d.is_landlord).length,
    };
  }, [analyzedData]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[650px]">
      <div className="bg-gray-50 border-b border-gray-200">
          <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <History className="w-5 h-5 text-gray-600"/>
                매물 생애주기 분석
            </h2>
            <div className="relative w-full md:w-64">
                <input type="text" placeholder="동, 부동산, 번호 검색" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-gray-300 rounded-lg outline-none focus:border-blue-500"
                    autoComplete="off" autoCorrect="off" spellCheck="false" name="search_field_prevention" id="search_field_prevention"
                />
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"/>
            </div>
          </div>
          <div className="flex px-4 gap-1 overflow-x-auto no-scrollbar">
            <button onClick={() => setMainTab('active')} className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${mainTab === 'active' ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>🏠 현재 등록 매물 ({counts.active})</button>
            <button onClick={() => setMainTab('analysis')} className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${mainTab === 'analysis' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>📊 변동 분석 ({counts.analysisTotal})</button>
            <button onClick={() => setMainTab('deleted')} className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${mainTab === 'deleted' ? 'border-gray-500 text-gray-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>🗑️ 삭제된 매물 ({counts.deleted})</button>
          </div>
      </div>

      {mainTab === 'analysis' && (
          <div className="px-4 py-3 bg-blue-50/50 border-b border-blue-100 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wide">유형</span>
                  <div className="flex bg-white rounded-lg p-0.5 border border-blue-200">
                      <button onClick={() => setFilterIssue('all')} className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${filterIssue === 'all' ? 'bg-blue-100 text-blue-700 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}>전체</button>
                      <button onClick={() => setFilterIssue('price')} className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${filterIssue === 'price' ? 'bg-blue-100 text-blue-700 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}>💰 가격변동 ({counts.cntPrice})</button>
                      <button onClick={() => setFilterIssue('relist')} className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${filterIssue === 'relist' ? 'bg-blue-100 text-blue-700 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}>♻️ 재등록 ({counts.cntRelist})</button>
                  </div>
              </div>
              <div className="w-px h-6 bg-blue-200 hidden sm:block"></div>
              <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wide">소유자</span>
                  <div className="flex bg-white rounded-lg p-0.5 border border-indigo-200">
                      <button onClick={() => setFilterOwner('all')} className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${filterOwner === 'all' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}>전체</button>
                      <button onClick={() => setFilterOwner('landlord')} className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${filterOwner === 'landlord' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}>👑 집주인 ({counts.cntLandlord})</button>
                      <button onClick={() => setFilterOwner('agent')} className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${filterOwner === 'agent' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}>🏢 일반 ({counts.cntAgent})</button>
                  </div>
              </div>
              {(filterIssue !== 'all' || filterOwner !== 'all') && (
                  <button onClick={() => { setFilterIssue('all'); setFilterOwner('all'); }} className="ml-auto text-[10px] flex items-center gap-1 text-gray-500 hover:text-red-500 transition-colors">
                      <X className="w-3 h-3"/> 초기화
                  </button>
              )}
          </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-gray-50">
        {filteredData.map((item, index) => {
            const isExpanded = expandedItems.has(item.article_no);
            const isDead = item.status === 'deleted';

            return (
                <div key={item.article_no} className={`bg-white rounded-lg border shadow-sm overflow-hidden group ${isDead ? 'border-gray-200 opacity-90' : 'border-gray-200'}`}>
                    <div className="p-4 cursor-pointer hover:bg-gray-50 transition-colors relative" onClick={() => toggleExpand(item.article_no)}>
                        
                        {/* 1. [상단] 상태 태그 라인 (동 이름 위쪽으로 이동됨) */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                            {/* 집주인 태그 */}
                            {item.is_landlord && (
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded border border-indigo-200 flex items-center gap-1">
                                    <Crown className="w-3 h-3"/> 집주인
                                </span>
                            )}
                            {/* 가격 변동 태그 */}
                            {item.has_history_change && (
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-700 rounded border border-purple-200 flex items-center gap-1">
                                    <Activity className="w-3 h-3"/> 가격변동
                                </span>
                            )}
                            {/* 재등록 태그 */}
                            {item.is_relisted && (
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-700 rounded border border-orange-200 flex items-center gap-1">
                                    <RefreshCcw className="w-3 h-3"/> 재등록
                                </span>
                            )}
                            {/* 신규 태그 */}
                            {!item.has_history_change && !item.is_relisted && !item.is_landlord && item.status === 'new' && (
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-green-500 text-white rounded">
                                    NEW
                                </span>
                            )}
                            {/* 삭제됨 태그 */}
                            {item.status === 'deleted' && (
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-500 text-white rounded flex items-center gap-1">
                                    <MinusCircle className="w-3 h-3"/> 삭제됨
                                </span>
                            )}
                        </div>

                        {/* 2. 메인 컨텐츠 영역 */}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    {/* 순번 표시 */}
                                    <span className="text-lg font-black text-blue-600 mr-1">{index + 1}.</span>
                                    
                                    {/* 동 이름 */}
                                    <span className={`text-lg font-bold ${isDead ? 'text-gray-500 line-through decoration-2 decoration-gray-300' : 'text-gray-800'}`}>{item.dong}</span>
                                    <span className="text-xs text-gray-400 bg-gray-100 px-1.5 rounded border border-gray-200">No.{item.article_no}</span>
                                </div>
                                <div className="text-sm text-gray-600 mb-2">{item.spec}</div>
                                
                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="text-xs text-blue-600 font-bold flex items-center gap-1">
                                        <Tag className="w-3 h-3"/> {item.agent}
                                    </div>
                                    
                                    {/* 확인매물 날짜 */}
                                    {item.verification_date && (
                                        <div className="text-[10px] text-gray-500 flex items-center gap-1 bg-gray-100 px-1.5 rounded border border-gray-200">
                                            <CheckCircle2 className="w-3 h-3 text-green-600"/> 
                                            확인: {item.verification_date}
                                        </div>
                                    )}

                                    <span className="text-gray-300 text-[10px] font-normal flex items-center gap-0.5 cursor-pointer hover:text-gray-500">
                                        {isExpanded ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}
                                        {isExpanded ? '접기' : '이력'}
                                    </span>
                                </div>
                            </div>
                            <div className="sm:text-right min-w-[120px]">
                                <div className="text-xs text-gray-500 mb-1">{isDead ? '마지막 호가' : '현재 호가'}</div>
                                <div className={`text-xl font-bold flex items-center sm:justify-end gap-1 ${isDead ? 'text-gray-500' : 'text-gray-900'}`}>
                                    {item.current_price}
                                    {!isDead && item.price_direction === 'up' && <ArrowUpRight className="w-5 h-5 text-red-500"/>}
                                    {!isDead && item.price_direction === 'down' && <ArrowDownRight className="w-5 h-5 text-blue-500"/>}
                                   {!isDead && item.price_direction === 'fluctuated' && (
                                        <span title="변동 후 복귀" className="cursor-help">
                                            <Activity className="w-5 h-5 text-purple-500"/>
                                        </span>
                                    )}
                                </div>
                                {item.has_history_change && <div className="text-xs text-purple-600 font-medium bg-purple-50 px-1 rounded inline-block mt-1">최초: {item.initial_price}</div>}
                            </div>
                        </div>
                    </div>

                    {isExpanded && (
                        <div className="bg-gray-50 border-t border-gray-100 p-4 animate-in slide-in-from-top-2 duration-200">
                            <h4 className="text-xs font-bold text-gray-600 mb-3 flex items-center gap-1">
                                <Clock className="w-3 h-3"/> 상세 수집 이력
                            </h4>
                            <div className="space-y-0 relative">
                                <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-gray-200"></div>
                                {item.display_timeline.map((log, idx) => {
                                    const p1 = (log.price || '').replace(/\s+/g, '').replace(/,/g, '').trim();
                                    const pStart = (item.initial_price || '').replace(/\s+/g, '').replace(/,/g, '').trim();
                                    const isPriceChanged = p1 !== pStart;

                                    return (
                                        <div key={idx} className="relative pl-8 pb-3 last:pb-0 flex items-start gap-3 group/item">
                                            <div className={`absolute left-0 w-10 h-10 flex items-start justify-center z-10`}>
                                                {log.status === 'collected' ? (
                                                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ring-4 ring-white ${isPriceChanged ? 'bg-purple-500' : 'bg-blue-500'}`}></div>
                                                ) : (
                                                    <div className="w-2.5 h-2.5 rounded-full bg-orange-400 mt-1.5 ring-4 ring-white"></div>
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                                    <span className="text-xs font-bold text-gray-500 bg-white border px-1.5 py-0.5 rounded">{log.date}</span>
                                                    <span className="text-sm font-bold text-gray-800">{log.time}</span>
                                                    {log.status === 'collected' ? (
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${isPriceChanged ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-white text-gray-600 border-gray-200'}`}>
                                                            {isPriceChanged ? '⚡ 가격변경' : '수집됨'}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold border border-orange-200 flex items-center gap-1"><MinusCircle className="w-3 h-3"/> 수집 안됨</span>
                                                    )}
                                                </div>
                                                {log.status === 'collected' && (
                                                    <div className={`text-xs border p-2 rounded shadow-sm flex justify-between items-center bg-white ${isPriceChanged ? 'border-purple-300' : 'border-gray-200'}`}>
                                                        <span className="font-bold">{log.price}</span>
                                                        <span className="text-[10px] opacity-70">{log.agent}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            <div className="mt-4 pt-3 border-t border-gray-200 flex justify-end">
                                <a href={`https://new.land.naver.com/complexes/108064?articleNo=${item.article_no}`} target="_blank" rel="noopener noreferrer" className="text-xs flex items-center gap-1 text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded font-bold transition-colors">네이버 부동산 확인 <ExternalLink className="w-3 h-3"/></a>
                            </div>
                        </div>
                    )}
                </div>
            );
        })}
      </div>
    </div>
  );
}