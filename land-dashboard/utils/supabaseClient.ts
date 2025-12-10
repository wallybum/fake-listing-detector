import { createClient } from '@supabase/supabase-js';

const isLocal = process.env.NODE_ENV === 'development';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;

const createSupabaseClient = () => {
  if (!supabaseUrl || !supabaseKey) {
    if (isLocal) {
      console.warn("⚠️ Supabase 환경변수가 설정되지 않았습니다. .env.local 파일을 확인하세요.");
      // 로컬에서 에러가 나도 화면이 멈추지 않도록 빈 클라이언트를 반환하거나 예외 처리
      // 여기서는 에러를 던져서 명확히 알립니다.
      throw new Error("Missing Supabase Keys in .env.local");
    }
    throw new Error("Missing Supabase Environment Variables");
  }

  return createClient(supabaseUrl, supabaseKey);
};
// 싱글톤으로 export
export const supabase = createSupabaseClient();