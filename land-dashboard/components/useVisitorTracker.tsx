"use client";

import { useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import UAParser from "ua-parser-js";
import { supabase } from "../utils/supabaseClient";

// [수정] 함수 이름은 그대로 두거나 VisitorTracker로 바꿔도 됩니다.
// 핵심은 return null; 을 추가해서 '컴포넌트'로 만드는 것입니다.
export default function VisitorTracker() {
  useEffect(() => {
    const trackVisitor = async () => {
      if (typeof window === "undefined") return;

      try {
        let visitorId = localStorage.getItem("site_visitor_id");
        if (!visitorId) {
          visitorId = uuidv4();
          localStorage.setItem("site_visitor_id", visitorId);
        }

        const today = new Date().toISOString().split("T")[0];
        const lastVisitDate = localStorage.getItem("last_visit_date");

        if (lastVisitDate === today) return;

        const parser = new UAParser();
        const result = parser.getResult();

        const deviceType = result.device.type || "desktop";
        const browserName = result.browser.name;
        const osName = result.os.name;
        const osVersion = result.os.version;

        const { error } = await supabase.from("visit_logs").insert({
          visitor_id: visitorId,
          device_type: deviceType,
          browser_name: browserName,
          os_name: osName,
          os_version: osVersion,
        });

        if (!error) {
          localStorage.setItem("last_visit_date", today);
          console.log("📈 방문자 집계 완료");
        }
      } catch (err) {
        console.error(err);
      }
    };

    trackVisitor();
  }, []);

  // ★ 핵심: 화면에 그릴 건 없으니 null을 반환합니다.
  return null;
}