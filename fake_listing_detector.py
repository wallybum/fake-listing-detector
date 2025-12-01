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
    
    # 봇 탐지 방지 스크립트
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": """
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        """
    })
    
    try:
        driver.get(f"https://new.land.naver.com/complexes/{COMPLEX_NO}")
        
        # 로딩 대기
        try: 
            WebDriverWait(driver, 60).until(
                EC.presence_of_element_located((By.ID, "complex_article_trad_type_filter_0"))
            )
        except: 
            print("⚠️ 로딩 시간 초과 (진행 시도)")

        # ------------------------------------------------------------------
        # 3. [수정됨] 독한 필터링 (될 때까지 누른다)
        # ------------------------------------------------------------------
        print("⚙️ 필터 적용 시작...")
        
        # (1) 전체 선택 해제
        try:
            all_btn = driver.find_element(By.CSS_SELECTOR, "label[for='complex_article_trad_type_filter_0']")
            driver.execute_script("arguments[0].click();", all_btn)
            time.sleep(0.5)
        except: pass

        # (2) 매매 선택
        try:
            sale_btn = driver.find_element(By.CSS_SELECTOR, "label[for='complex_article_trad_type_filter_1']")
            driver.execute_script("arguments[0].click();", sale_btn)
            time.sleep(1)
        except: pass
        
        # (3) [핵심] 동일매물 묶기 (확인 사살 로직)
        print("   👉 [동일매물 묶기] 체크 시도...")
        max_retries = 5
        for i in range(max_retries):
            try:
                chk_box = driver.find_element(By.ID, "address_group2")
                
                # 이미 체크되어 있으면 통과
                if chk_box.is_selected():
                    print("      ✅ 체크 확인됨!")
                    break
                
                # 체크 안 되어 있으면 클릭 (JS 강제 클릭)
                label = driver.find_element(By.CSS_SELECTOR, "label[for='address_group2']")
                driver.execute_script("arguments[0].click();", label)
                time.sleep(1.5) # 반응 대기
                
                # 다시 확인
                if chk_box.is_selected():
                    print("      ✅ 체크 성공!")
                    break
                else:
                    print(f"      ⚠️ 체크 실패 ({i+1}/{max_retries})... 재시도")
            except Exception as e:
                print(f"      ❌ 에러 발생: {e}")
                time.sleep(1)
        
        # (4) 가격순 정렬
        try:
            sort_btn = driver.find_element(By.CSS_SELECTOR, "a.sorting_type[data-nclk='TAA.price']")
            driver.execute_script("arguments[0].click();", sort_btn)
        except: pass
        
        print("   ⏳ 목록 갱신 대기 (5초)...")
        time.sleep(5)

        # ------------------------------------------------------------------
        # 4. 스크롤 로직
        # ------------------------------------------------------------------
        print("⬇️ 데이터 로딩 중...")
        try: list_area = WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "articleListArea")))
        except: list_area = driver.find_element(By.TAG_NAME, "body")

        try:
            actions = ActionChains(driver)
            actions.move_to_element(list_area).click().perform()
        except: pass

        last_count = 0
        same_count = 0
        
        for _ in range(40):
            driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", list_area)
            try: 
                list_area.send_keys(Keys.END)
                time.sleep(0.2)
                list_area.send_keys(Keys.PAGE_DOWN)
            except: pass
            
            time.sleep(1.5)
            
            # 자식 요소 제외하고 부모 그룹만 카운트
            items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
            curr = len(items)
            print(f"   ... 로딩 중 ({curr}개)")

            if curr == last_count and curr > 0:
                same_count += 1
                if same_count >= 5: break
            else: same_count = 0
            last_count = curr

        # 5. 데이터 추출
        parent_items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
        print(f"📝 총 {len(parent_items)}개 그룹 발견.")

        # [디버깅] 만약 또 100개가 넘어가면 스크린샷 찍어서 확인
        if len(parent_items) > 100:
            print("⚠️ 그룹 수가 너무 많습니다. 필터 실패 의심. 스크린샷 저장.")
            driver.save_screenshot("debug_too_many.png")

        if len(parent_items) == 0:
            print("❌ 데이터 0건.")
            driver.save_screenshot("debug_zero.png")
            return

        db_data = []
        
        for parent in parent_items:
            try:
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
                    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", parent)
                    
                    container = parent.find_element(By.CSS_SELECTOR, "div.item.item--child")
                    inners = container.find_elements(By.CSS_SELECTOR, "div.item_inner")
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

        if db_data:
            try:
                supabase.table('real_estate_logs').insert(db_data).execute()
                print(f"✅ [Log] {len(db_data)}건 저장 완료")
            except Exception as e:
                print(f"❌ [Log] 저장 실패: {e}")

            # 통계 저장
            import pandas as pd
            df = pd.DataFrame(db_data)
            stats_df = df['agent'].value_counts().reset_index()
            stats_df.columns = ['agent', 'count']
            stats_data = [{"agent": r['agent'], "count": int(r['count']), "crawl_date": TODAY_STR, "crawl_time": f"{HOUR_STR}시"} for _, r in stats.iterrows()]
            
            try:
                supabase.table('agent_stats').insert(stats_data).execute()
                print(f"✅ [Stats] 통계 저장 완료")
            except: pass

    except Exception as e:
        print(f"❌ 에러: {e}")
        driver.save_screenshot("debug_fatal.png")
        driver.quit()
    finally:
        display.stop() 

if __name__ == "__main__":
    run_crawler()