import os
import json
import time
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from dotenv import load_dotenv
from supabase import create_client, Client

# ==================================================================
# [설정] 환경변수 및 상수 정의
# ==================================================================
COMPLEX_NO = "108064"
KST = timezone(timedelta(hours=9))

# 1. 현재 파일 위치 기준 .env.local 로드
current_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(current_dir, 'land-dashboard/.env.local') # 경로 확인 필요

load_result = load_dotenv(dotenv_path=env_path)
print(f"📂 경로: {env_path}")
print(f"🔄 로드 결과: {load_result}")

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_KEY")

if SUPABASE_URL:
    print(f"✅ URL 로드 성공: {SUPABASE_URL[:10]}...")
else:
    print("❌ URL 로드 실패 (DB 저장 불가)")


# ==================================================================
# [함수] 데이터 정제 및 DB 저장
# ==================================================================
def refine_data(raw_data_list, trade_type, fixed_date, fixed_time):
    """
    네이버 원본 데이터 리스트를 DB 스키마에 맞게 변환
    """
    refined_list = []
    
    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    hour_str = f"{now.strftime('%H')}시"

    for item in raw_data_list:

        
        # 네이버 API 응답 키(Key) 매핑
        # (실제 응답에 따라 키 이름은 달라질 수 있으니 .get으로 안전하게 처리)
        
        
        # 가격 정보 (dealOrWarrantPrc: "15억 5,000" 형태)
        price_str = item.get('dealOrWarrantPrc', '')
        
        area_name = item.get('areaName', '')   # 110E-2
        area_ex = item.get('area2', '')        # 84 (전용면적)
        floor = item.get('floorInfo', '')      # 저/22층 (API 키는 보통 floorInfo 입니다)
        direction = item.get('direction', '')  # 남서향
        formatted_spec = f"{area_name}/{area_ex}m², {floor}, {direction}"

        refined_item = {
             "crawl_date": fixed_date,
             "crawl_time": fixed_time,
             "article_no": item.get('articleNo', ''),  # 매물 번호 (PK)
             "trade_type": trade_type,                 # 매매/전세
             "price": price_str,                       # 가격 (문자열 그대로 저장)
             "dong": item.get('buildingName'),         # 동
             "spec": formatted_spec,
             "agent": item.get('realtorName'),   # 중개업소
             "provider": item.get('cpName'),            # 제공 업체(ex. 매경 부동산, 아실 등)
             "confirm_date": item.get('articleConfirmYmd',''), # 확인날짜
             "is_owner": item.get('verificationTypeCode') == 'OWNER' # 집주인 인증여부
        }
        # refined_item = {
         #   "article_no": item.get('articleNo', ''),                # 매물 번호 (PK)
          #  "trade_type": trade_type,                               # 매매/전세
           # "price": price_str,                                     # 가격 (문자열 그대로 저장)
           # "dong": item.get('dongName', ''),                       # 동 이름
        #   "floor": item.get('floorInfo', ''),                     # 층수 (예: 5/15)
            # "spec": item.get('areaName', ''),                       # 면적 (예: 84A)
            # "direction": item.get('direction', ''),                 # 향 (남향 등)
            # "agent": item.get('realtorName', item.get('cpName', '')), # 중개사명
            # "description": item.get('articleFeatureDesc', ''),      # 특징 설명
            # "is_landlord": True if item.get('directTradYn') == 'Y' else False, # 직거래/집주인 여부
            # "verification_date": item.get('articleConfirmYmd', ''), # 확인 일자
            # "crawl_date": today_str,
            # "crawl_time": hour_str
        # }
        refined_list.append(refined_item)
    
    return refined_list

def save_to_supabase(data_list):
    """
    Supabase DB에 데이터 저장 (Upsert)
    """
    if not data_list or not SUPABASE_URL:
        print("⚠️ 저장할 데이터가 없거나 DB 설정이 누락되었습니다.")
        return

    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        table_name = "real_estate_logs"  # ⚠️ 실제 사용하는 테이블명으로 변경 필수!

        # upsert: article_no(PK)가 같으면 업데이트, 없으면 추가
        response = supabase.table(table_name).upsert(data_list).execute()
        
        print(f"✅ DB 저장 완료! (총 {len(data_list)}건 처리)")
        
    except Exception as e:
        print(f"❌ DB 저장 중 오류 발생: {e}")


# ==================================================================
# [클래스] 크롤러 정의
# ==================================================================
class NaverLandCrawler:
    
    def __init__(self):
        """생성자: 드라이버 초기화"""
        self.driver = self._init_driver()

    def _init_driver(self):
        """드라이버 옵션 설정"""
        options = uc.ChromeOptions()
        options.add_argument("--headless=new") # 테스트할 땐 주석 처리 추천 (화면 보게)
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--lang=ko_KR")
        options.add_argument("--disable-blink-features=AutomationControlled")
        
        prefs = {"profile.managed_default_content_settings.images": 2}
        options.add_experimental_option("prefs", prefs)
        options.set_capability("goog:loggingPrefs", {"performance": "ALL"})

        # 정식 버전 사용 권장 (버전 명시)
        driver = uc.Chrome(options=options, version_main=142) 
        
        ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        driver.execute_cdp_cmd("Network.setUserAgentOverride", {
            "userAgent": ua,
            "acceptLanguage": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "platform": "MacIntel"
        })
        driver.execute_cdp_cmd("Network.setExtraHTTPHeaders", {
            "headers": {
                "Referer": "https://new.land.naver.com/",
                "Origin": "https://new.land.naver.com"
            }
        })
        
        return driver

    def close(self):
        if (self.driver):
            print("\n👋 크롤러 종료 (브라우저 닫기)")
            self.driver.quit()

    def _wait_for_loading(self):
        try:
            WebDriverWait(self.driver, 20).until(EC.presence_of_element_located((By.ID, "articleListArea")))
        except Exception as e:
            print(f"   ⚠️ 로딩 대기 실패: {e}")

    def _reset_and_apply_filters(self, target_type):
        print(f"   ⚙️ 필터 적용 중: {target_type}")
        
        # 1. 전체 거래방식 해제
        self.driver.execute_script("if(document.querySelector('#complex_article_trad_type_filter_0:checked')) { document.querySelector('#complex_article_trad_type_filter_0').click(); }")
        time.sleep(0.5)

        # 2. 타겟 타입 설정
        if (target_type == "매매"):
            self.driver.execute_script("if(!document.querySelector('#complex_article_trad_type_filter_1:checked')) { document.querySelector('#complex_article_trad_type_filter_1').click(); }")
            self.driver.execute_script("if(document.querySelector('#complex_article_trad_type_filter_2:checked')) { document.querySelector('#complex_article_trad_type_filter_2').click(); }")
        
        elif (target_type == "전세"):
            self.driver.execute_script("if(document.querySelector('#complex_article_trad_type_filter_1:checked')) { document.querySelector('#complex_article_trad_type_filter_1').click(); }")
            self.driver.execute_script("if(!document.querySelector('#complex_article_trad_type_filter_2:checked')) { document.querySelector('#complex_article_trad_type_filter_2').click(); }")

        time.sleep(1)

        # 3. 묶기 해제
        try:
            group_chk = self.driver.find_element(By.ID, "address_group2")
            if (group_chk.is_selected()):
                self.driver.execute_script("arguments[0].click();", self.driver.find_element(By.CSS_SELECTOR, "label[for='address_group2']"))
        except:
            pass

        # 4. 가격순 정렬
        try:
            self.driver.find_element(By.CSS_SELECTOR, "a.sorting_type[data-nclk='TAA.price']").click()
        except:
            pass
        
        time.sleep(3)

    def _scroll_and_collect_packets(self, target_type):
        try:
            list_area = self.driver.find_element(By.ID, "articleListArea")
        except:
            list_area = self.driver.find_element(By.TAG_NAME, "body")
            
        try:
            ActionChains(self.driver).move_to_element(list_area).click().perform()
        except:
            pass

        collected_data_map = {}
        last_count = 0
        same_loop = 0
        
        for i in range(50): # 최대 50회 스크롤
            items = self.driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
            curr_count = len(items)
            if (curr_count > 0):
                self.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", items[-1])
            self.driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", list_area)
            
            time.sleep(1.5)

            logs = self.driver.get_log("performance")
            for entry in logs:
                try:
                    log_json = json.loads(entry["message"])
                    message = log_json["message"]
                    
                    if (message["method"] == "Network.responseReceived"):
                        resp_url = message["params"]["response"]["url"]
                        
                        if ("api/articles/complex" in resp_url and "realEstateType" in resp_url):
                            request_id = message["params"]["requestId"]
                            try:
                                response_body = self.driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": request_id})
                                data = json.loads(response_body['body'])
                                articles = data.get('articleList', [])
                                
                                for item in articles:
                                    if (item.get("tradeTypeName") != target_type): continue
                                    if (item.get("tradeCompleteYN") == "Y"): continue
                                    if (item.get("articleStatus") != "R0"): continue
                                    
                                    article_no = item.get('articleNo')
                                    if (article_no):
                                        collected_data_map[article_no] = item
                            except:
                                pass
                except:
                    pass
            
            if (curr_count == last_count and curr_count > 0):
                same_loop += 1
                if (same_loop >= 5):
                    break
            else:
                same_loop = 0
            
            last_count = curr_count

        print(f"   ✅ [{target_type}] 1차 수집 완료: {len(collected_data_map)}건 (중복제거됨)")
        return collected_data_map

    def collect(self, target_type):
        print(f"\n🔎 [{target_type}] 프로세스 시작...")
        
        print(f"   🌏 페이지 접속: {COMPLEX_NO}")
        self.driver.get(f"https://new.land.naver.com/complexes/{COMPLEX_NO}")
        self._wait_for_loading()
        
        self._reset_and_apply_filters(target_type)
        
        data_map = self._scroll_and_collect_packets(target_type)
        
        print("   " + "-"*30)
        return data_map

# ==================================================================
# 메인 실행 블록
# ==================================================================
def main():
    crawler = NaverLandCrawler()
    
    start_now = datetime.now()
    FIXED_DATE = start_now.strftime("%Y-%m-%d")
    FIXED_TIME = start_now.strftime("%H:%M") # 분 단위까지 기록 (예: 14:00, 14:20)
    
    try:
        # 1. 크롤링 수행 (Map 형태로 반환됨)
        sale_map = crawler.collect("매매")
        jeonse_map = crawler.collect("전세")
        
        print("\n" + "="*60)
        print(f"📝 수집 결과: 매매 {len(sale_map)}건, 전세 {len(jeonse_map)}건")
        
        # 2. 데이터 정제 (Map -> List 변환 후 함수 호출)
        # .values()를 사용하여 딕셔너리의 값(데이터 객체)들만 리스트로 뽑아냅니다.
        clean_sale = refine_data(list(sale_map.values()), "매매", FIXED_DATE, FIXED_TIME)
        clean_jeonse = refine_data(list(jeonse_map.values()), "전세",FIXED_DATE, FIXED_TIME)
        
        # 3. 데이터 통합
        final_db_data = clean_sale + clean_jeonse
        
        # 4. DB 저장
        if final_db_data:
            print(f"💾 총 {len(final_db_data)}건의 데이터를 DB에 저장합니다...")
            save_to_supabase(final_db_data)
        else:
            print("⚠️ 저장할 데이터가 없습니다.")

        print("="*60)

    except Exception as e:
        print(f"❌ 메인 실행 중 오류: {e}")
    finally:
        crawler.close()

if __name__ == "__main__":
    main()