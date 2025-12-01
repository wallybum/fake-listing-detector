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
    
    options = uc.ChromeOptions()
    options.add_argument("--headless=new") 
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

    driver = uc.Chrome(options=options)
    
    try:
        driver.get(f"https://new.land.naver.com/complexes/{COMPLEX_NO}")
        
        # 로딩 대기 (30초)
        try: WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.ID, "complex_article_trad_type_filter_0")))
        except: print("⚠️ 로딩 시간 초과 (계속 진행)")

        # -----------------------------------------------------------
        # [수정됨] 필터 설정 강화 (JS 강제 클릭 + 대기 시간 증가)
        # -----------------------------------------------------------
        print("⚙️ 필터 적용 중...")
        try:
            # 1. 전체 거래방식 해제
            btn_all = driver.find_element(By.CSS_SELECTOR, "label[for='complex_article_trad_type_filter_0']")
            driver.execute_script("arguments[0].click();", btn_all)
            time.sleep(0.5)

            # 2. 매매 선택
            btn_sale = driver.find_element(By.CSS_SELECTOR, "label[for='complex_article_trad_type_filter_1']")
            driver.execute_script("arguments[0].click();", btn_sale)
            time.sleep(1)

            # 3. [핵심] 동일매물 묶기 (확인 사살 로직)
            # 체크박스 상태 확인
            group_input = driver.find_element(By.ID, "address_group2")
            group_label = driver.find_element(By.CSS_SELECTOR, "label[for='address_group2']")
            
            if not group_input.is_selected():
                print("   👉 [동일매물 묶기] 클릭")
                driver.execute_script("arguments[0].click();", group_label)
                time.sleep(1)
            
            # 혹시 몰라서 한번 더 확인 (토글이므로 안되어있을때만)
            if not group_input.is_selected():
                print("   👉 [재시도] 동일매물 묶기 다시 클릭")
                driver.execute_script("arguments[0].click();", group_label)

            # 4. 낮은 가격순 정렬
            btn_sort = driver.find_element(By.CSS_SELECTOR, "a.sorting_type[data-nclk='TAA.price']")
            driver.execute_script("arguments[0].click();", btn_sort)
            
            # [중요] 필터 적용 후 목록이 갱신될 때까지 충분히 대기 (5초)
            print("   ⏳ 목록 갱신 대기 (5초)...")
            time.sleep(5)

        except Exception as e:
            print(f"⚠️ 필터 설정 중 오류 (무시 가능): {e}")
        
        # -----------------------------------------------------------
        # 스크롤 로직 (기존 유지)
        # -----------------------------------------------------------
        print("⬇️ 데이터 로딩 중...")
        try: 
            list_area = WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "articleListArea")))
            actions = ActionChains(driver)
            actions.move_to_element(list_area).click().perform()
        except: 
            list_area = driver.find_element(By.TAG_NAME, "body")

        last_count = 0
        same_count_loop = 0
        
        # 최대 30번 스크롤
        for _ in range(30):
            driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", list_area)
            try: 
                list_area.send_keys(Keys.END)
                time.sleep(0.2)
                list_area.send_keys(Keys.PAGE_DOWN)
            except: pass
            
            time.sleep(1.5)
            
            items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
            current_count = len(items)
            print(f"   ... 로딩 중 ({current_count}개)")

            if current_count == last_count and current_count > 0:
                same_count_loop += 1
                # 5번 연속 변화 없으면 종료
                if same_count_loop >= 5: 
                    print("   ✅ 스크롤 완료")
                    break
            else:
                same_count_loop = 0
            last_count = current_count

        # --- 데이터 추출 ---
        parent_items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
        print(f"📝 총 {len(parent_items)}개 그룹 발견.")

        if len(parent_items) == 0:
            print("❌ 데이터가 없습니다. (차단 또는 로딩 실패)")
            driver.save_screenshot("debug_zero.png")
            driver.quit()
            return

        db_data = []
        
        def get_article_no():
            # 클릭 없이 목록 내 정보만으로 빠르게 수집
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

                # 펼치기 로직
                multi_cp_btn = parent.find_elements(By.CSS_SELECTOR, "span.label--multicp")
                targets = []
                
                if multi_cp_btn:
                    # 묶여있는 매물 펼치기
                    driver.execute_script("arguments[0].click();", multi_cp_btn[0])
                    time.sleep(0.3)
                    # 스크롤 보정
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
                    
                    article_no = "-" 
                    
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
                print(f"✅ [Log Table] {len(db_data)}건 저장 완료")
            except Exception as e:
                print(f"❌ [Log Table] 실패: {e}")

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
                print(f"✅ [Stats Table] 통계 저장 완료")
            except: pass
    
    except Exception as e:
        print(f"❌ 전체 오류: {e}")
        driver.save_screenshot("debug_fatal.png")
        driver.quit()

if __name__ == "__main__":
    run_crawler()