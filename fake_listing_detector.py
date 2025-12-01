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
from datetime import datetime, timedelta, timezone
from supabase import create_client, Client

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

# [수정 1] 한국 시간(KST) 적용을 확실하게!
KST = timezone(timedelta(hours=9))
NOW = datetime.now(KST) 
TODAY_STR = NOW.strftime("%Y-%m-%d")
HOUR_STR = NOW.strftime("%H")

def run_crawler():
    print(f"🚀 [GitHub Actions] {TODAY_STR} {HOUR_STR}시 크롤링 시작...")
    
    # [수정 2] 탐지 회피 옵션 강화
    options = uc.ChromeOptions()
    options.add_argument("--headless=new") # 최신 헤드리스
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--disable-extensions")
    options.add_argument("user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

    driver = uc.Chrome(options=options)
    
    try:
        driver.get(f"https://new.land.naver.com/complexes/{COMPLEX_NO}")
        
        # 로딩 대기 (30초)
        try: WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.ID, "complex_article_trad_type_filter_0")))
        except: print("⚠️ 로딩 시간 초과 (계속 진행)")

        # 필터
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

        # 스크롤
        print("⬇️ 데이터 로딩 중...")
        try: 
            list_area = WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "articleListArea")))
            actions = ActionChains(driver)
            actions.move_to_element(list_area).click().perform()
        except: 
            list_area = driver.find_element(By.TAG_NAME, "body")

        last_count = 0
        same_count_loop = 0
        
        # 최대 60초 동안 시도
        for _ in range(30):
            driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", list_area)
            try: list_area.send_keys(Keys.END)
            except: pass
            time.sleep(2.0)
            
            items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
            current_count = len(items)
            print(f"   ... 로딩 중 ({current_count}개)")

            if current_count == last_count and current_count > 0:
                same_count_loop += 1
                if same_count_loop >= 3: break
            else:
                same_count_loop = 0
            last_count = current_count

        # 데이터 추출
        parent_items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
        print(f"📝 총 {len(parent_items)}개 그룹 발견.")

        # [수정 3] 데이터가 0개면 스크린샷 찍기 (디버깅 핵심)
        if len(parent_items) == 0:
            print("❌ 데이터가 없습니다. 현재 화면을 캡처합니다.")
            driver.save_screenshot("debug_screenshot.png")
            
            # HTML 소스도 일부 저장 (차단 문구 확인용)
            with open("debug_source.html", "w", encoding="utf-8") as f:
                f.write(driver.page_source)
            
            driver.quit()
            return

        db_data = []
        # ... (기존 파싱 로직 동일) ...
        
        def get_article_no():
            for _ in range(3):
                try:
                    time.sleep(0.2)
                    soup = BeautifulSoup(driver.page_source, "html.parser")
                    target_th = soup.find("th", string=lambda t: t and "매물번호" in t)
                    if target_th: return target_th.find_next_sibling("td").get_text(strip=True)
                except: pass
            return "-"

        for parent in parent_items:
            try:
                p_soup = BeautifulSoup(parent.get_attribute('outerHTML'), "html.parser")
                try: p_title = p_soup.select_one("div.item_title > span.text").get_text(strip=True)
                except: continue
                if p_title == "제목없음": continue
                dong_name = p_title.replace("DMC파크뷰자이", "").strip()
                
                try: raw_spec = p_soup.select_one("div.info_area .spec").get_text(strip=True)
                except: raw_spec = ""

                multi_cp_btn = parent.find_elements(By.CSS_SELECTOR, "span.label--multicp")
                targets = []
                if multi_cp_btn:
                    driver.execute_script("arguments[0].click();", multi_cp_btn[0])
                    time.sleep(0.3)
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
                    
                    article_no = "-" # 속도를 위해 일단 생략하거나, 필요하면 클릭 로직 추가
                    
                    db_data.append({
                        "agent": agent, "dong": dong_name, "spec": raw_spec, "price": price,
                        "article_no": article_no, "crawl_date": TODAY_STR, "crawl_time": f"{HOUR_STR}시"
                    })
            except: continue

        driver.quit()

        if db_data:
            try:
                supabase.table('real_estate_logs').insert(db_data).execute()
                print(f"✅ [Log Table] {len(db_data)}건 저장 완료")
            except Exception as e:
                print(f"❌ [Log Table] 실패: {e}")

            # 통계 저장
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
                print(f"✅ [Stats Table] 통계 저장 완료")
            except: pass
    
    except Exception as e:
        print(f"❌ 전체 오류: {e}")
        driver.quit()

if __name__ == "__main__":
    run_crawler()