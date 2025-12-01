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
from datetime import datetime
from supabase import create_client, Client

# ==================================================================
# [설정] 환경변수 (GitHub Secrets에서 가져옴)
# ==================================================================
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
COMPLEX_NO = "108064" # DMC파크뷰자이

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Supabase 설정이 없습니다.")
    exit()

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

NOW = datetime.now()
TODAY_STR = NOW.strftime("%Y-%m-%d")
HOUR_STR = NOW.strftime("%H")

def run_crawler():
    print(f"🚀 [GitHub Actions] {TODAY_STR} {HOUR_STR}시 크롤링 시작...")
    
    # --- Chrome 옵션 (서버용 Headless 설정) ---
    options = uc.ChromeOptions()
    options.add_argument("--headless") 
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")

    driver = uc.Chrome(options=options)
    driver.get(f"https://new.land.naver.com/complexes/{COMPLEX_NO}")
    
    try: WebDriverWait(driver, 20).until(EC.presence_of_element_located((By.ID, "complex_article_trad_type_filter_0")))
    except: pass

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

    # --- 스크롤 로직 (개수 체크 방식) ---
    print("⬇️ 데이터 로딩 중...")
    try: 
        list_area = WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "articleListArea")))
        actions = ActionChains(driver)
        actions.move_to_element(list_area).click().perform()
    except: 
        list_area = driver.find_element(By.TAG_NAME, "body")

    last_count = 0
    same_count_loop = 0
    
    while True:
        driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", list_area)
        try: 
            list_area.send_keys(Keys.END)
            time.sleep(0.5)
            list_area.send_keys(Keys.PAGE_DOWN)
        except: pass
        
        time.sleep(2.0)
        
        items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
        current_count = len(items)
        print(f"   ... 로딩 중 ({current_count}개)")

        if current_count == last_count:
            same_count_loop += 1
            if same_count_loop >= 5: break
        else:
            same_count_loop = 0
        last_count = current_count

    # --- 데이터 추출 ---
    parent_items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
    print(f"📝 총 {len(parent_items)}개 그룹 발견. DB 전송 준비...")
    
    db_data = []

    def get_article_no():
        for _ in range(3):
            try:
                time.sleep(0.3)
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

                cp_btns = target.find_elements(By.CSS_SELECTOR, "a.label.label--cp")
                if cp_btns: driver.execute_script("arguments[0].click();", cp_btns[0])
                else: driver.execute_script("arguments[0].click();", target.find_element(By.CSS_SELECTOR, "a.item_link"))
                
                article_no = get_article_no()
                
                db_data.append({
                    "agent": agent,
                    "dong": dong_name,
                    "spec": raw_spec,
                    "price": price,
                    "article_no": article_no,
                    "crawl_date": TODAY_STR,
                    "crawl_time": f"{HOUR_STR}시"
                })
        except: continue
    
    driver.quit()

    if not db_data:
        print("❌ 수집된 데이터가 없습니다.")
        return

    # ---------------------------------------------------------------
    # [저장 1] 상세 로그 저장 (real_estate_logs)
    # ---------------------------------------------------------------
    try:
        supabase.table('real_estate_logs').insert(db_data).execute()
        print(f"✅ [Log Table] 상세 매물 {len(db_data)}건 저장 완료")
    except Exception as e:
        print(f"❌ [Log Table] 저장 실패: {e}")

    # ---------------------------------------------------------------
    # [저장 2] 통계 데이터 저장 (agent_stats)
    # ---------------------------------------------------------------
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
        print(f"✅ [Stats Table] 중개사 {len(stats_data)}곳 통계 저장 완료")
    except Exception as e:
        print(f"❌ [Stats Table] 저장 실패: {e}")

if __name__ == "__main__":
    run_crawler()