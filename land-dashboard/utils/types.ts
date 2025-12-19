export interface RealEstateLog {
  id: number;
  agent: string;
  dong: string;
  spec: string;
  price: string;
  article_no: string;
  trade_type: string;
  crawl_time: string;
  crawl_date: string;
  provider: string;
}

export interface StatData {
  agent?: string;
  dong?: string;
  day_str: string;
  time_str: string;
  count: number;
}