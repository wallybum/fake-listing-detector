"use client";

import { useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import UAParser from "ua-parser-js";
import { supabase } from "../utils/supabaseClient";

export default function VisitorTracker() {
  const hasRun = useRef(false);

  /**
   * [추가] 한국 시간(KST) 날짜 문자열 생성 함수
   * 오전 9시 전에도 오늘 날짜를 정확히 인식하게 합니다.
   */
  const getKSTDate = () => {
    const now = new Date();
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Seoul",
    })
      .format(now)
      .replace(/\. /g, "-")
      .replace(/\./g, "");
  };

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const trackVisitor = async () => {
      if (typeof window === "undefined") return;

      try {
        let visitorId = localStorage.getItem("site_visitor_id");
        if (!visitorId) {
          visitorId = uuidv4();
          localStorage.setItem("site_visitor_id", visitorId);
        }

        // [수정] ISOString 대신 한국 시간 함수 사용
        const today = getKSTDate(); 
        const lastVisitDate = localStorage.getItem("last_visit_date");

        // 오늘 이미 방문 도장을 찍었다면 종료
        if (lastVisitDate === today) return;

        const parser = new UAParser();
        const result = parser.getResult();

        const deviceType = result.device.type || "desktop";
        const browserName = result.browser.name;
        const osName = result.os.name;
        const osVersion = result.os.version;

        // DB 저장 (visited_at은 DB 설정에 따라 자동 생성됨)
        const { error } = await supabase.from("visit_logs").insert({
          visitor_id: visitorId,
          device_type: deviceType,
          browser_name: browserName,
          os_name: osName,
          os_version: osVersion,
        });

        if (!error) {
          // [수정] 성공 시 로컬 스토리지에 한국 날짜로 저장
          localStorage.setItem("last_visit_date", today);
          console.log("📈 방문자 집계 완료 (KST 기준)");
        }
      } catch (err) {
        console.error(err);
      }
    };

    trackVisitor();
  }, []);

  return null;
}