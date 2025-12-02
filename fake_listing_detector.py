import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import time
import os
from datetime import datetime, timedelta, timezone
from supabase import create_client, Client

# [필수] 가상 모니터
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

    # 1. 가상 모니터 켜기
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
        except: print("⚠️ 로딩 시간 초과 (진행 시도)")

        # ------------------------------------------------------------------
        # 2. 필터 설정 (로컬 성공 로직)
        # ------------------------------------------------------------------
        print("⚙️ 필터 적용 중...")
        try:
            driver.execute_script("if(document.querySelector('#complex_article_trad_type_filter_0:checked')) document.querySelector('#complex_article_trad_type_filter_0').click();")
            time.sleep(0.5)
            driver.execute_script("if(!document.querySelector('#complex_article_trad_type_filter_1:checked')) document.querySelector('#complex_article_trad_type_filter_1').click();")
            time.sleep(1)
            
            # [동일매물 묶기] 강제 클릭
            group_btn = driver.find_element(By.CSS_SELECTOR, "label[for='address_group2']")
            driver.execute_script("arguments[0].click();", group_btn)
            time.sleep(1)
            
            # 가격순 정렬
            driver.find_element(By.CSS_SELECTOR, "a.sorting_type[data-nclk='TAA.price']").click()
            
            print("   ⏳ 목록 갱신 대기 (5초)...")
            time.sleep(5)

        except Exception as e:
            print(f"⚠️ 필터 오류(무시): {e}")
        
        # ------------------------------------------------------------------
        # 3. [수정됨] 스크롤 로직: 요소 견인(Tractor) 방식
        # ------------------------------------------------------------------
        print("⬇️ 데이터 로딩 중 (전체 매물 확보)...")
        
        # 리스트 영역 찾기 (없으면 body)
        try: list_area = driver.find_element(By.ID, "articleListArea")
        except: list_area = driver.find_element(By.TAG_NAME, "body")
        
        # 포커스 주기
        try: list_area.click()
        except: pass

        prev_count = 0
        same_count_loop = 0
        
        while True:
            # 1. 현재 로딩된 아이템들 찾기
            items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
            curr_count = len(items)
            
            print(f"   ... 스크롤 중 (현재 {curr_count}개)")
            
            # 2. [핵심] 맨 마지막 아이템을 화면으로 끌어당김 (로딩 트리거)
            if curr_count > 0:
                last_item = items[-1]
                driver.execute_script("arguments[0].scrollIntoView(true);", last_item)
            else:
                # 아이템이 없으면 그냥 스크롤 내림
                driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", list_area)

            time.sleep(2.0) # 로딩 대기
            
            # 3. 개수 변화 체크
            if curr_count == prev_count:
                same_count_loop += 1
                # 5번(10초) 동안 안 늘어나면 끝
                if same_count_loop >= 5:
                    print(f"   ✅ 전체 목록 로딩 완료 (최종 {curr_count}개 그룹)")
                    break
            else:
                same_count_loop = 0
                
            prev_count = curr_count

        # ------------------------------------------------------------------
        # 4. 데이터 추출
        # ------------------------------------------------------------------
        parent_items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
        print(f"📝 총 {len(parent_items)}개 그룹 발견.")

        if len(parent_items) == 0:
            print("❌ 데이터 0건.")
            driver.save_screenshot("debug_zero.png")
            return

        db_data = []
        
        for parent in parent_items:
            try:
                p_soup = BeautifulSoup(parent.get_attribute('outerHTML'), "html.parser")
                try: p_title = p_soup.select_one("div.item_title > span.text").get_text(strip=True)
                except: continue
                if p_title == "제목없음": continue
                
                dong_name = p_title.replace("DMC파크뷰자이", "").strip()
                try: raw_spec = p_soup.select_one("div.info_area .spec").get_text(strip=True)
                except: raw_spec = ""

                # 펼치기 (중요!)
                multi_cp_btn = parent.find_elements(By.CSS_SELECTOR, "span.label--multicp")
                targets = []
                
                if multi_cp_btn:
                    driver.execute_script("arguments[0].click();", multi_cp_btn[0])
                    time.sleep(0.3)
                    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", parent)
                    
                    child_container = parent.find_element(By.CSS_SELECTOR, "div.item.item--child")
                    inners = container.find_elements(By.CSS_SELECTOR, "div.item_inner") # 주의: 여기서 container 변수명이 틀릴 수 있음 -> parent.find... 로 수정 필요
                    # 수정된 부분:
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

                    article_no = "-" 
                    
                    db_data.append({
                        "agent": agent, "dong": dong_name, "spec": raw_spec, "price": price,
                        "article_no": article_no, "crawl_date": TODAY_STR, "crawl_time": f"{HOUR_STR}시"
                    })
            except: continue
        
        driver.quit()

        # [저장]
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
            
            stats_data = []
            for _, row in stats_df.iterrows():
                stats_data.append({
                    "agent": row['agent'],
                    "count": int(row['count']),
                    "crawl_date": TODAY_STR,
                    "crawl_time": f"{HOUR_STR}시"
                })
            
            try:
                supabase.table('agent_stats').insert(stats_data).execute()
                print(f"✅ [Stats] 통계 저장 완료")
            except Exception as e:
                print(f"❌ [Stats] 저장 실패: {e}")

    except Exception as e:
        print(f"❌ 실행 중 오류: {e}")
        driver.save_screenshot("debug_fatal.png")
        driver.quit()
    finally:
        display.stop()

if __name__ == "__main__":
    run_crawler()