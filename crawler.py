import os
import json
import time
import sys
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
env_path = os.path.join(current_dir, 'land-dashboard/.env.local') 

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
    
    for item in raw_data_list:
        # 가격 정보
        price_str = item.get('dealOrWarrantPrc', '')
        
        area_name = item.get('areaName', '')   # 110E-2
        area_ex = item.get('area2', '')        # 84 (전용면적)
        floor = item.get('floorInfo', '')      # 저/22층
        direction = item.get('direction', '')  # 남서향
        formatted_spec = f"{area_name}/{area_ex}m², {floor}, {direction}"

        refined_item = {
             "crawl_date": fixed_date,
             "crawl_time": fixed_time,
             "article_no": item.get('articleNo', ''),  # 매물 번호 (PK)
             "trade_type": trade_type,                 # 매매/전세
             "price": price_str,                       # 가격
             "dong": item.get('buildingName'),         # 동
             "spec": formatted_spec,
             "agent": item.get('realtorName'),         # 중개업소
             "provider": item.get('cpName'),           # 제공 업체
             "confirm_date": item.get('articleConfirmYmd',''), # 확인날짜
             "is_owner": item.get('verificationTypeCode') == 'OWNER' # 집주인 인증여부
        }
        refined_list.append(refined_item)
    
    return refined_list

def save_to_supabase(data_list):
    """
    Supabase DB에 매물 데이터 저장 (Upsert)
    """
    if not data_list or not SUPABASE_URL:
        print("⚠️ 저장할 데이터가 없거나 DB 설정이 누락되었습니다.")
        return

    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        table_name = "real_estate_logs" 

        response = supabase.table(table_name).upsert(data_list).execute()
        
        print(f"✅ DB 저장 완료! (총 {len(data_list)}건 처리)")
        
    except Exception as e:
        print(f"❌ DB 저장 중 오류 발생: {e}")

# [추가됨] 이력 기록 함수
def save_crawl_history(date, time_str, status, count=0, error_msg=""):
    """
    crawl_history 테이블에 성공/실패 여부를 기록합니다.
    """
    if not SUPABASE_URL: return

    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        
        history_data = {
            "crawl_date": date,
            "crawl_time": time_str,
            "status": status,          # 'SUCCESS' 또는 'FAIL'
            "collected_count": count,  # 수집된 개수
            "error_message": str(error_msg)[:1000] # 에러 메시지 길이 제한
        }
        
        supabase.table("crawl_history").insert(history_data).execute()
        print(f"📝 [History] 이력 기록 완료: {status} ({count}건)")
        
    except Exception as e:
        print(f"❌ 이력 기록 실패: {e}")


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
        options.add_argument("--headless=new") 
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
        # 드라이버가 존재하고 살아있을 때만 종료 시도
        if hasattr(self, 'driver') and self.driver:
            try:
                print("\n👋 크롤러 종료 (브라우저 닫기)")
                self.driver.quit()
            except Exception:
                pass # 이미 닫혀있으면 패스

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

    # 수정 
    # def _reset_and_apply_filters(self, target_type):
        print(f"   ⚙️ 필터 적용 중: {target_type}")
    
        # [수정] 요소가 로드될 때까지 명시적으로 기다림
        wait = WebDriverWait(self.driver, 15)
        try:
            # 필터 영역 자체가 나타날 때까지 대기
            wait.until(EC.presence_of_element_located((By.ID, "complex_article_trad_type_filter_0")))
            
            # 1. 전체 거래방식 해제 (요소가 있을 때만 실행하도록 JS 보강)
            self.driver.execute_script("""
                var allBtn = document.querySelector('#complex_article_trad_type_filter_0');
                if(allBtn && allBtn.checked) { allBtn.click(); }
            """)
            time.sleep(0.8)

            # 2. 타겟 타입 설정 (매매/전세)
            if target_type == "매매":
                self.driver.execute_script("""
                    var maeBtn = document.querySelector('#complex_article_trad_type_filter_1');
                    var jeonBtn = document.querySelector('#complex_article_trad_type_filter_2');
                    if(maeBtn && !maeBtn.checked) { maeBtn.click(); }
                    if(jeonBtn && jeonBtn.checked) { jeonBtn.click(); }
                """)
            elif target_type == "전세":
                self.driver.execute_script("""
                    var maeBtn = document.querySelector('#complex_article_trad_type_filter_1');
                    var jeonBtn = document.querySelector('#complex_article_trad_type_filter_2');
                    if(maeBtn && maeBtn.checked) { maeBtn.click(); }
                    if(jeonBtn && !jeonBtn.checked) { jeonBtn.click(); }
                """)
            
            time.sleep(1.5) # 필터 적용 후 데이터 갱신 대기

            # 3. 묶기 해제 (라벨 클릭 방식이 더 안정적임)
            self.driver.execute_script("""
                var groupChk = document.querySelector('#address_group2');
                var groupLabel = document.querySelector("label[for='address_group2']");
                if(groupChk && groupChk.checked && groupLabel) { groupLabel.click(); }
            """)

        except Exception as e:
            print(f"   ⚠️ 필터 적용 중 오류 발생 (무시하고 진행): {e}")

    def _scroll_and_collect_packets(self, target_type):
    #     try:
    #         list_area = self.driver.find_element(By.ID, "articleListArea")
    #     except:
    #         list_area = self.driver.find_element(By.TAG_NAME, "body")
            
    #     try:
    #         ActionChains(self.driver).move_to_element(list_area).click().perform()
    #     except:
    #         pass

    #     collected_data_map = {}
    #     last_count = 0
    #     same_loop = 0
        
    #     for i in range(50): # 최대 50회 스크롤
    #         items = self.driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
    #         curr_count = len(items)
    #         if (curr_count > 0):
    #             self.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", items[-1])
    #         self.driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", list_area)
            
    #         time.sleep(1.5)

    #         logs = self.driver.get_log("performance")
    #         for entry in logs:
    #             try:
    #                 log_json = json.loads(entry["message"])
    #                 message = log_json["message"]
                    
    #                 if (message["method"] == "Network.responseReceived"):
    #                     resp_url = message["params"]["response"]["url"]
                        
    #                     if ("api/articles/complex" in resp_url and "realEstateType" in resp_url):
    #                         request_id = message["params"]["requestId"]
    #                         try:
    #                             response_body = self.driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": request_id})
    #                             data = json.loads(response_body['body'])
    #                             articles = data.get('articleList', [])
                                
    #                             for item in articles:
    #                                 if (item.get("tradeTypeName") != target_type): continue
    #                                 if (item.get("tradeCompleteYN") == "Y"): continue
    #                                 if (item.get("articleStatus") != "R0"): continue
                                    
    #                                 article_no = item.get('articleNo')
    #                                 if (article_no):
    #                                     collected_data_map[article_no] = item
    #                         except:
    #                             pass
    #             except:
    #                 pass
            
    #         if (curr_count == last_count and curr_count > 0):
    #             same_loop += 1
    #             if (same_loop >= 5):
    #                 break
    #         else:
    #             same_loop = 0
            
    #         last_count = curr_count

    #     print(f"   ✅ [{target_type}] 1차 수집 완료: {len(collected_data_map)}건 (중복제거됨)")
    #     return collected_data_map

    # def _scroll_and_collect_packets(self, target_type):
    #     print(f"   🖱️ 스크롤 및 데이터 패킷 수집 시작 ({target_type})")
        
    #     # 1. 목록 영역이 나타날 때까지 확실히 대기
    #     try:
    #         wait = WebDriverWait(self.driver, 20)
    #         # articleListArea가 메모리에 로드될 때까지 기다림
    #         list_area = wait.until(EC.presence_of_element_located((By.ID, "articleListArea")))
            
    #         # 목록 영역에 확실히 포커스를 주기 위해 JS로 클릭 및 스크롤 위치 초기화
    #         self.driver.execute_script("arguments[0].focus();", list_area)
    #         ActionChains(self.driver).move_to_element(list_area).click().perform()
    #     except Exception as e:
    #         print(f"   ⚠️ 목록 영역 로딩 실패: {e}")
    #         # 영역을 못 찾으면 바디라도 잡지만, 수집 확률이 낮아짐
    #         try:
    #             list_area = self.driver.find_element(By.TAG_NAME, "body")
    #         except:
    #             return {}

    #     collected_data_map = {}
    #     last_count = 0
    #     same_loop = 0
        
    #     for i in range(50): # 최대 50회 스크롤
    #         # 현재 로드된 매물 아이템들 확인
    #         items = self.driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
    #         curr_count = len(items)
            
    #         if curr_count > 0:
    #             # [개선] 마지막 아이템으로 스크롤하여 다음 데이터 로딩 유도
    #             try:
    #                 self.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", items[-1])
    #             except:
    #                 pass
    #         else:
    #             # 아이템이 아예 없으면 영역 전체를 아래로 강제 스크롤
    #             self.driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", list_area)
            
    #         # 네이버 API 응답 시간을 위해 대기 시간을 2초로 소폭 증가
    #         time.sleep(2.0)

    #         # --- 네트워크 패킷 분석 로직 ---
    #         logs = self.driver.get_log("performance")
    #         for entry in logs:
    #             try:
    #                 log_json = json.loads(entry["message"])
    #                 message = log_json["message"]
                    
    #                 if (message["method"] == "Network.responseReceived"):
    #                     resp_url = message["params"]["response"]["url"]
                        
    #                     # 실제 매물 데이터 API 주소인지 확인
    #                     if ("api/articles/complex" in resp_url and "realEstateType" in resp_url):
    #                         request_id = message["params"]["requestId"]
    #                         try:
    #                             response_body = self.driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": request_id})
    #                             data = json.loads(response_body['body'])
    #                             articles = data.get('articleList', [])
                                
    #                             for item in articles:
    #                                 # 필터링 조건 (타입 일치, 완료 제외, 정상 매물만)
    #                                 if (item.get("tradeTypeName") != target_type): continue
    #                                 if (item.get("tradeCompleteYN") == "Y"): continue
    #                                 if (item.get("articleStatus") != "R0"): continue
                                    
    #                                 article_no = item.get('articleNo')
    #                                 if (article_no):
    #                                     collected_data_map[article_no] = item
    #                         except:
    #                             continue
    #             except:
    #                 continue
            
    #         # 스크롤을 해도 더 이상 매물이 늘어나지 않으면 루프 탈출
    #         if (curr_count == last_count and curr_count > 0):
    #             same_loop += 1
    #             if (same_loop >= 5): # 5회 연속 변화 없으면 끝까지 온 것으로 간주
    #                 break
    #         else:
    #             same_loop = 0
            
    #         last_count = curr_count
            
    #         # 진행 상황 출력 (너무 자주 찍히지 않게 5회마다)
    #         if i % 5 == 0:
    #             print(f"   ... 스크롤 중 ({i}/50), 현재 수집: {len(collected_data_map)}건")

    #     print(f"   ✅ [{target_type}] 수집 완료: {len(collected_data_map)}건")
    #     return collected_data_map

    # def _scroll_and_collect_packets(self, target_type):
        print(f"   🖱️ 스크롤 및 데이터 패킷 수집 시작 ({target_type})")
        
        try:
            list_area = self.driver.find_element(By.ID, "articleListArea")
        except:
            return {}

        collected_data_map = {}
        last_count = 0
        no_change_intervals = 0  # 데이터가 안 늘어나는 횟수
        
        # 1. 픽셀 단위로 조금씩 내리며 브라우저가 '스크롤'을 인식하게 함
        scroll_y = 0
        max_scroll_attempts = 60 # 최대 시도 횟수 늘림

        for i in range(max_scroll_attempts):
            # 조금씩 아래로 이동 (트리거 유도)
            scroll_y += 1000 
            self.driver.execute_script(f"arguments[0].scrollTop = {scroll_y}", list_area)
            
            # API 응답이 오기까지 충분히 대기 (매우 중요)
            time.sleep(2.0) 

            # 네트워크 로그 확인
            logs = self.driver.get_log("performance")
            for entry in logs:
                try:
                    log_json = json.loads(entry["message"])
                    message = log_json["message"]
                    if message["method"] == "Network.responseReceived":
                        resp_url = message["params"]["response"]["url"]
                        if "api/articles/complex" in resp_url:
                            request_id = message["params"]["requestId"]
                            try:
                                response_body = self.driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": request_id})
                                data = json.loads(response_body['body'])
                                for item in data.get('articleList', []):
                                    if item.get("tradeTypeName") == target_type:
                                        collected_data_map[item.get('articleNo')] = item
                            except: pass
                except: pass

            curr_count = len(collected_data_map)
            
            # 데이터 변화 체크
            if curr_count > last_count:
                print(f"   ... 데이터 수집 중: {curr_count}건")
                no_change_intervals = 0 # 데이터가 늘어나면 카운트 리셋
            else:
                no_change_intervals += 1
            
            # [핵심] 데이터가 20건 이상인데도 5번 연속 변화가 없다면 정말 끝인 것으로 간주
            # 하지만 20건 미만이라면(첫 페이지 실패 상황) 더 끈질기게 기다림
            if curr_count >= 20 and no_change_intervals >= 5:
                break
            
            # 만약 20건에서 계속 멈춰있다면 스크롤 위치를 강제로 위아래로 흔들어 트리거 재발생
            if curr_count == 20 and no_change_intervals == 3:
                self.driver.execute_script(f"arguments[0].scrollTop = {scroll_y - 500}", list_area)
                time.sleep(0.5)

            last_count = curr_count

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
# 메인 실행 블록 (재시도 + 이력 기록 통합)
# ==================================================================
def main():
    max_retries = 3  # 최대 재시도 횟수
    
    # [중요] 시작 시간을 고정합니다. (재시도하더라도 첫 시도 시간을 기록해야 함)
    start_now = datetime.now()
    FIXED_DATE = start_now.strftime("%Y-%m-%d")
    FIXED_TIME = start_now.strftime("%H:%M")
    
    final_status = "FAIL" # 기본값은 실패로 시작
    final_count = 0
    last_error_msg = ""
    
    print(f"\n🕒 작업 기준 시간: {FIXED_DATE} {FIXED_TIME}")

    for attempt in range(max_retries):
        crawler = None 
        try:
            print(f"\n🚀 크롤링 시도 ({attempt + 1}/{max_retries})")
            
            # --- 여기서 에러가 나면 except로 점프합니다 ---
            crawler = NaverLandCrawler()
            
            # 1. 크롤링 수행
            sale_map = crawler.collect("매매")
            jeonse_map = crawler.collect("전세")
            
            print(f"   📊 수집 결과: 매매 {len(sale_map)}건, 전세 {len(jeonse_map)}건")
            
            # 2. 데이터 정제 (고정된 시간 FIXED_TIME 사용)
            clean_sale = refine_data(list(sale_map.values()), "매매", FIXED_DATE, FIXED_TIME)
            clean_jeonse = refine_data(list(jeonse_map.values()), "전세", FIXED_DATE, FIXED_TIME)
            
            # 3. 데이터 통합
            final_db_data = clean_sale + clean_jeonse
            final_count = len(final_db_data)
            
            # 4. DB 저장
            if final_db_data:
                print(f"💾 총 {final_count}건의 데이터를 DB에 저장합니다...")
                save_to_supabase(final_db_data)
            else:
                print("⚠️ 저장할 데이터가 0건입니다.")

            # 여기까지 오면 성공
            final_status = "SUCCESS"
            last_error_msg = "" # 성공 시 에러 메시지 초기화
            
            print("✨ 크롤링 및 저장이 완료되었습니다.")
            break # 성공했으니 루프 탈출

        except Exception as e:
            print(f"\n❌ 오류 발생 (시도 {attempt + 1}): {e}")
            last_error_msg = str(e) # 에러 메시지 보관
            
            # 브라우저 정리
            if crawler:
                try: crawler.close()
                except: pass

            # 마지막 시도가 아니면 대기 후 재시도
            if attempt < max_retries - 1:
                print("🔄 10초 후 재시도합니다...")
                time.sleep(10)
            else:
                print("💀 최대 재시도 횟수를 초과했습니다.")

    # [핵심] 성공/실패 여부에 상관없이 이력을 기록함
    print("\n" + "="*50)
    save_crawl_history(FIXED_DATE, FIXED_TIME, final_status, final_count, last_error_msg)
    print("="*50)

    # 마지막으로 브라우저 정리
    if crawler:
        try: crawler.close()
        except: pass

    # 최종 상태가 FAIL이면 시스템 종료 코드 1 반환 (Crontab 등에서 에러 인식용)
    if final_status == "FAIL":
        sys.exit(1)

if __name__ == "__main__":
    main()