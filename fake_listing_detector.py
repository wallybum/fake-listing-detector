import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import time
import os
import random
from datetime import datetime, timedelta, timezone
from supabase import create_client, Client

# ▼▼▼ [추가] 가상 디스플레이 라이브러리 ▼▼▼
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
   # options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    
    # [중요] 언어 설정 (한국어) - 봇 탐지 회피용
    options.add_argument("--lang=ko_KR")
    
    # User-Agent (일반 윈도우 크롬으로 위장)
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

    driver = uc.Chrome(options=options)

    # [핵심] CDP 명령어로 'webdriver' 속성 숨기기 (봇 탐지 방지)
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": """
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            })
        """
    })
    
    try:
        # -------------------------------------------------------
        # [쿠키 워밍] 메인 페이지부터 천천히 진입 (사람인 척)
        # -------------------------------------------------------
        print("1. 네이버 메인 접속...")
        driver.get("https://www.naver.com")
        time.sleep(random.uniform(2, 4))

        print("2. 부동산 메인으로 이동...")
        driver.get("https://land.naver.com/")
        time.sleep(random.uniform(2, 4))
        
        print(f"3. 목표 단지({COMPLEX_NO})로 이동...")
        driver.get(f"https://new.land.naver.com/complexes/{COMPLEX_NO}")
        
        # 로딩 대기 (최대 60초)
        try: 
            WebDriverWait(driver, 60).until(
                EC.presence_of_element_located((By.ID, "complex_article_trad_type_filter_0"))
            )
            print("✅ 페이지 로딩 성공!")
        except: 
            print("⚠️ 로딩 시간 초과 or 차단됨")
            driver.save_screenshot("debug_fail.png")

        # --- 필터 설정 ---
        try:
            driver.execute_script("if(document.querySelector('#complex_article_trad_type_filter_0:checked')) document.querySelector('#complex_article_trad_type_filter_0').click();")
            time.sleep(0.5)
            driver.execute_script("if(!document.querySelector('#complex_article_trad_type_filter_1:checked')) document.querySelector('#complex_article_trad_type_filter_1').click();")
            time.sleep(1)
            driver.execute_script("""var cb = document.getElementById("address_group2"); if (cb && !cb.checked) document.querySelector("label[for='address_group2']").click();""")
            time.sleep(1)
            driver.find_element(By.CSS_SELECTOR, "a.sorting_type[data-nclk='TAA.price']").click()
        except: pass
        
        time.sleep(3)

        # --- 스크롤 로직 ---
        print("⬇️ 데이터 로딩 중...")
        try: 
            list_area = WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "articleListArea")))
            actions = ActionChains(driver)
            actions.move_to_element(list_area).click().perform()
        except: 
            list_area = driver.find_element(By.TAG_NAME, "body")

        last_count = 0
        same_count_loop = 0
        
        # 최대 50번 스크롤
        for _ in range(50):
            driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", list_area)
            try: 
                list_area.send_keys(Keys.END)
                time.sleep(0.3)
                list_area.send_keys(Keys.PAGE_DOWN)
            except: pass
            
            time.sleep(1.5)
            
            items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
            current_count = len(items)
            print(f"   ... 로딩 중 ({current_count}개)")

            if current_count == last_count and current_count > 0:
                same_count_loop += 1
                if same_count_loop >= 5: break
            else:
                same_count_loop = 0
            last_count = current_count

        # --- 데이터 추출 ---
        parent_items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
        print(f"📝 총 {len(parent_items)}개 그룹 발견.")

        if len(parent_items) == 0:
            print("❌ 데이터 0건. 차단되었을 가능성이 높습니다.")
            driver.save_screenshot("debug_zero.png")
            driver.quit()
            display.stop() # [핵심] 가상 모니터 끄기
            return

        db_data = []
        # ... (파싱 로직) ...
        for parent in parent_items:
            try:
                p_soup = BeautifulSoup(parent.get_attribute('outerHTML'), "html.parser")
                try: p_title = p_soup.select_one("div.item_title > span.text").get_text(strip=True)
                except: continue
                if p_title == "제목없음": continue
                
                dong_name = p_title.replace("DMC파크뷰자이", "").strip()
                try: raw_spec = p_soup.select_one("div.info_area .spec").get_text(strip=True)
                except: raw_spec = ""

                # 펼치기 (상세 정보 수집)
                multi_cp_btn = parent.find_elements(By.CSS_SELECTOR, "span.label--multicp")
                targets = []
                if multi_cp_btn:
                    driver.execute_script("arguments[0].click();", multi_cp_btn[0])
                    time.sleep(0.2)
                    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", parent)
                    child_container = parent.find_element(By.CSS_SELECTOR, "div.item.item--child")
                    children = child_container.find_elements(By.CSS_SELECTOR, "div.item_inner")
                    for child in children:
                        if child.find_elements(By.CSS_SELECTOR, "div.cp_area"): targets.append(child)
                else:
                    targets.append(parent.find_element(By.CSS_SELECTOR, "div.item_inner"))

                for target in targets:
                    t_soup = BeautifulSoup(target.get_attribute('outerHTML'), "html.parser")
                    try: agent = t_soup.select("a.agent_name")[-1].get_text(strip=True)
                    except: agent = "알수없음"
                    try: price = t_soup.select_one("span.price").get_text(strip=True)
                    except: price = ""
                    
                    article_no = "-" # 클릭 생략 (속도 및 차단 방지)
                    
                    db_data.append({
                        "agent": agent, "dong": dong_name, "spec": raw_spec, "price": price,
                        "article_no": article_no, "crawl_date": TODAY_STR, "crawl_time": f"{HOUR_STR}시"
                    })
            except: continue
        
        driver.quit()

        # DB 저장
        if db_data:
            try:
                supabase.table('real_estate_logs').insert(db_data).execute()
                print(f"✅ [Log] {len(db_data)}건 저장 성공")
            except Exception as e:
                print(f"❌ [Log] 저장 실패: {e}")

            # 통계 저장
            import pandas as pd
            df = pd.DataFrame(db_data)
            stats_df = df['agent'].value_counts().reset_index()
            stats_df.columns = ['agent', 'count']
            stats_data = []
            for _, row in stats_df.iterrows():
                stats_data.append({
                    "agent": row['agent'], "count": int(row['count']),
                    "crawl_date": TODAY_STR, "crawl_time": f"{HOUR_STR}시"
                })
            try:
                supabase.table('agent_stats').insert(stats_data).execute()
                print(f"✅ [Stats] 통계 저장 성공")
            except: pass

    except Exception as e:
        print(f"❌ 에러 발생: {e}")
        driver.save_screenshot("debug_fatal.png")
        driver.quit()

if __name__ == "__main__":
    run_crawler()
