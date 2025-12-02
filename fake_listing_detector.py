import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import pandas as pd
import time
import os
import random
from datetime import datetime, timedelta, timezone
from supabase import create_client, Client
from pyvirtualdisplay import Display 

# ==================================================================
# [설정] 환경변수
# ==================================================================
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
COMPLEX_NO = "108064"

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Supabase 설정이 없습니다.")
    exit()

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

KST = timezone(timedelta(hours=9))
NOW = datetime.now(KST)
TODAY_STR = NOW.strftime("%Y-%m-%d")
HOUR_STR = NOW.strftime("%H")

def run_crawler():
    print(f"🚀 [GitHub Actions] {TODAY_STR} {HOUR_STR}시 크롤링 시작...")

    display = Display(visible=0, size=(1920, 1080))
    display.start()
    
    options = uc.ChromeOptions()
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--lang=ko_KR")
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

    driver = uc.Chrome(options=options)
    
    # 봇 탐지 방지
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": """
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        """
    })
    
    try:
        driver.get(f"https://new.land.naver.com/complexes/{COMPLEX_NO}")
        
        try: WebDriverWait(driver, 40).until(EC.presence_of_element_located((By.ID, "complex_article_trad_type_filter_0")))
        except: print("⚠️ 로딩 지연")

        # --- 필터 설정 ---
        print("⚙️ 필터 적용 중...")
        try:
            driver.execute_script("if(document.querySelector('#complex_article_trad_type_filter_0:checked')) document.querySelector('#complex_article_trad_type_filter_0').click();")
            time.sleep(0.5)
            driver.execute_script("if(!document.querySelector('#complex_article_trad_type_filter_1:checked')) document.querySelector('#complex_article_trad_type_filter_1').click();")
            time.sleep(1)
            
            # 동일매물 묶기
            group_input = driver.find_element(By.ID, "address_group2")
            if not group_input.is_selected():
                print("   👉 [동일매물 묶기] 클릭")
                driver.execute_script("arguments[0].click();", driver.find_element(By.CSS_SELECTOR, "label[for='address_group2']"))
                time.sleep(1)
            
            # 가격순 정렬
            driver.find_element(By.CSS_SELECTOR, "a.sorting_type[data-nclk='TAA.price']").click()
            
            print("   ⏳ 목록 갱신 대기 (5초)...")
            time.sleep(5)

        except Exception as e:
            print(f"⚠️ 필터 오류: {e}")

        # ------------------------------------------------------------------
        # [핵심] 목표 개수 확인 및 강제 스크롤
        # ------------------------------------------------------------------
        print("⬇️ 데이터 로딩 시작...")
        
        # 1. 화면에 표시된 '총 매물 수' 확인 (목표치 설정)
        target_count = 0
        try:
            count_text = driver.find_element(By.CSS_SELECTOR, "div.total > span.count").text
            target_count = int(count_text.replace(",", ""))
            print(f"🎯 네이버 표시 총 매물 수: {target_count}건 (이만큼 수집해야 함)")
        except:
            print("⚠️ 총 매물 수 텍스트를 못 찾음. 무한 스크롤 모드로 진행.")
            target_count = 9999 # 못 찾으면 최대한 많이

        # 2. 스크롤 영역 찾기
        try: list_area = WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "articleListArea")))
        except: list_area = driver.find_element(By.TAG_NAME, "body")

        # 3. 반복 스크롤
        prev_len = 0
        same_count_loop = 0
        
        # 최대 100번 시도
        for i in range(100):
            # 현재 로딩된 개수 확인
            items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
            curr_len = len(items)
            
            print(f"   [{i+1}] 스크롤 중... (현재 {curr_len} / 목표 {target_count})")
            
            # 목표 달성 시 종료
            if curr_len >= target_count and target_count > 0:
                print("   ✅ 목표 개수 도달! 스크롤 종료.")
                break

            # --- [3중 강제 스크롤 액션] ---
            
            # Action A: JS로 리스트 영역 바닥으로 내리기
            driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", list_area)
            
            # Action B: 맨 마지막 아이템을 화면 중앙으로 끌어오기 (가장 효과적)
            if items:
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", items[-1])
            
            # Action C: Body에 키보드 입력
            try:
                driver.find_element(By.TAG_NAME, "body").send_keys(Keys.PAGE_DOWN)
            except: pass
            
            # 로딩 대기 (조금 길게)
            time.sleep(2.0)
            
            # 변화 체크
            if curr_len == prev_len:
                same_count_loop += 1
                # 5번 연속(10초) 안 늘어나면, 더 이상 데이터가 없다고 판단
                if same_count_loop >= 5:
                    print(f"   ⚠️ 더 이상 로딩되지 않음. (최종 {curr_len}건)")
                    break
            else:
                same_count_loop = 0 # 늘어났으면 리셋
            
            prev_len = curr_len

        # ------------------------------------------------------------------
        # 5. 데이터 추출
        # ------------------------------------------------------------------
        parent_items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
        print(f"📝 최종 수집 대상: {len(parent_items)}개 그룹")
        
        db_data = []
        
        # 펼치기 및 상세 수집
        for idx, parent in enumerate(parent_items):
            try:
                if idx % 20 == 0: print(f"   Processing {idx+1}/{len(parent_items)}...")

                p_html = parent.get_attribute('outerHTML')
                soup = BeautifulSoup(p_html, "html.parser")
                try: title = soup.select_one("div.item_title > span.text").get_text(strip=True)
                except: continue
                if title == "제목없음": continue
                
                dong = title.replace("DMC파크뷰자이", "").strip()
                try: spec = soup.select_one("div.info_area .spec").get_text(strip=True)
                except: spec = ""

                # 펼치기
                multi_btn = parent.find_elements(By.CSS_SELECTOR, "span.label--multicp")
                targets = []
                
                if multi_btn:
                    driver.execute_script("arguments[0].click();", multi_btn[0])
                    time.sleep(0.2)
                    # 펼친 후 화면 보정
                    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", parent)
                    
                    child_container = parent.find_element(By.CSS_SELECTOR, "div.item.item--child")
                    inners = child_container.find_elements(By.CSS_SELECTOR, "div.item_inner")
                    for inner in inners:
                        if inner.find_elements(By.CSS_SELECTOR, "div.cp_area"): targets.append(inner)
                else:
                    targets.append(parent.find_element(By.CSS_SELECTOR, "div.item_inner"))

                for target in targets:
                    t_soup = BeautifulSoup(target.get_attribute('outerHTML'), "html.parser")
                    try: agent = t_soup.select("a.agent_name")[-1].get_text(strip=True)
                    except: agent = "알수없음"
                    try: price = t_soup.select_one("span.price").get_text(strip=True)
                    except: price = ""
                    
                    db_data.append({
                        "agent": agent, "dong": dong, "spec": spec, "price": price,
                        "article_no": "-",
                        "crawl_date": TODAY_STR, "crawl_time": f"{HOUR_STR}시"
                    })
            except: continue
        
        driver.quit()

        # DB 저장
        if db_data:
            try:
                supabase.table('real_estate_logs').insert(db_data).execute()
                print(f"✅ [Log] {len(db_data)}건 저장 완료")
            except Exception as e:
                print(f"❌ [Log] 저장 실패: {e}")

            # 통계 저장
            df = pd.DataFrame(db_data)
            stats_df = df['agent'].value_counts().reset_index()
            stats_df.columns = ['agent', 'count']
            stats_data = [{"agent": r['agent'], "count": int(r['count']), "crawl_date": TODAY_STR, "crawl_time": f"{HOUR_STR}시"} for _, r in stats_df.iterrows()]
            
            try:
                supabase.table('agent_stats').insert(stats_data).execute()
                print(f"✅ [Stats] 통계 저장 완료")
            except: pass
        else:
            print("❌ 수집된 데이터 0건")
            driver.save_screenshot("debug_no_data.png")

    except Exception as e:
        print(f"❌ 에러 발생: {e}")
        driver.save_screenshot("debug_fatal.png")
        driver.quit()
    finally:
        display.stop()

if __name__ == "__main__":
    run_crawler()