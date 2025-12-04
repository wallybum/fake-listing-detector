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

    # 버전 고정 (GitHub Actions 환경 대응)
    driver = uc.Chrome(options=options, version_main=142)
    
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": """
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        """
    })
    
    try:
        driver.get(f"https://new.land.naver.com/complexes/{COMPLEX_NO}")
        
        try: WebDriverWait(driver, 40).until(EC.presence_of_element_located((By.ID, "complex_article_trad_type_filter_0")))
        except: pass

        # ------------------------------------------------------------------
        # 2. 필터 설정
        # ------------------------------------------------------------------
        print("⚙️ 전세 매물 필터 적용 중...")
        try:
          # [Step 1] 전세(filter_2) 켜기 (가장 먼저!)
            # 전세 체크박스가 체크 안 되어 있다면 -> 클릭해서 켠다
            driver.execute_script("if(!document.querySelector('#complex_article_trad_type_filter_2:checked')) document.querySelector('label[for=\"complex_article_trad_type_filter_2\"]').click();")
            time.sleep(1.0) # 반응 대기

            # [Step 2] 매매(filter_1) 끄기
            # 매매 체크박스가 체크 되어 있다면 -> 클릭해서 끈다
            driver.execute_script("if(document.querySelector('#complex_article_trad_type_filter_1:checked')) document.querySelector('label[for=\"complex_article_trad_type_filter_1\"]').click();")
            time.sleep(0.5)
            
            group_input = driver.find_element(By.ID, "address_group2")
            if not group_input.is_selected():
                driver.execute_script("arguments[0].click();", driver.find_element(By.CSS_SELECTOR, "label[for='address_group2']"))
                time.sleep(1)
            
            driver.find_element(By.CSS_SELECTOR, "a.sorting_type[data-nclk='TAA.price']").click()
            
            print("   ⏳ 목록 갱신 대기 (5초)...")
            time.sleep(5)

        except Exception as e:
            print(f"⚠️ 필터 오류: {e}")
        
        # ------------------------------------------------------------------
        # 3. 스크롤 로직
        # ------------------------------------------------------------------
        print("⬇️ 데이터 로딩 중 (전체 매물 확보)...")
        
        try: list_area = WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "articleListArea")))
        except: list_area = driver.find_element(By.TAG_NAME, "body")

        try: 
            actions = ActionChains(driver)
            actions.move_to_element(list_area).click().perform()
        except: pass

        last_count = 0
        same_count_loop = 0
        
        for _ in range(50):
            items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
            curr_count = len(items)
            
            print(f"   ... 스크롤 중 (현재 {curr_count}개)")
            
            if curr_count > 0:
                last_item = items[-1]
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", last_item)
            
            driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", list_area)
            try: list_area.send_keys(Keys.PAGE_DOWN)
            except: pass

            time.sleep(2.0)
            
            if curr_count == last_count and curr_count > 0:
                same_count_loop += 1
                if same_count_loop >= 5:
                    print(f"   ✅ 전체 목록 로딩 완료 (최종 {curr_count}개 그룹)")
                    break
            else:
                same_count_loop = 0
                
            last_count = curr_count

        # ------------------------------------------------------------------
        # 4. 데이터 추출 (매물번호 로직 추가됨)
        # ------------------------------------------------------------------
        parent_items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
        print(f"📝 총 {len(parent_items)}개 그룹 발견.")

        if len(parent_items) == 0:
            print("❌ 데이터 0건.")
            driver.save_screenshot("debug_zero.png")
            return

        db_data = []
        
        for idx, parent in enumerate(parent_items):
            try:
                p_html = parent.get_attribute('outerHTML')
                soup = BeautifulSoup(p_html, "html.parser")
                try: title = soup.select_one("div.item_title > span.text").get_text(strip=True)
                except: continue
                if title == "제목없음": continue
                
                dong = title.replace("DMC파크뷰자이", "").strip()
                try: spec = soup.select_one("div.info_area .spec").get_text(strip=True)
                except: spec = ""

                # 펼치기 로직
                multi_btn = parent.find_elements(By.CSS_SELECTOR, "span.label--multicp")
                targets = []
                
                if multi_btn:
                    driver.execute_script("arguments[0].click();", multi_btn[0])
                    time.sleep(0.3)
                    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", parent)
                    
                    child_container = parent.find_element(By.CSS_SELECTOR, "div.item.item--child")
                    inners = child_container.find_elements(By.CSS_SELECTOR, "div.item_inner")
                    for inner in inners:
                        if inner.find_elements(By.CSS_SELECTOR, "div.cp_area"): targets.append(inner)
                else:
                    targets.append(parent.find_element(By.CSS_SELECTOR, "div.item_inner"))

                # ----------------------------------------------------------
                # [수정] 매물번호(article_no) 추출 로직 적용
                # ----------------------------------------------------------
                for target in targets:
                    # 1. HTML 파싱 (텍스트 정보용)
                    t_html = target.get_attribute('outerHTML')
                    t_soup = BeautifulSoup(t_html, "html.parser")

                    try: agent = t_soup.select("a.agent_name")[-1].get_text(strip=True)
                    except: agent = "알수없음"
                    
                    try: price = t_soup.select_one("span.price").get_text(strip=True)
                    except: price = ""

                    article_no = "-"

                    # 방법 1: Selenium으로 직접 속성 값 가져오기 (가장 정확함)
                    # 네이버 부동산은 item_inner 태그에 data-article-no="번호" 형태로 값을 숨겨둡니다.
                    try:
                        raw_no = target.get_attribute("data-article-no")
                        if raw_no:
                            article_no = raw_no
                    except: pass


                    # 방법 2: 방법 1 실패 시, HTML 태그 분석 (비상용)
                    if article_no == "-" or not article_no:
                        try:
                            inner_div = t_soup.select_one("div.item_inner")
                            if inner_div and inner_div.has_attr("data-article-no"):
                                article_no = inner_div["data-article-no"]
                        except: pass

                    # 방법 3: 체크박스 값 확인 (구버전 호환)
                    if article_no == "-" or not article_no:
                        try:
                            checkbox = t_soup.select_one("input[name='item_check']")
                            if checkbox and checkbox.has_attr('value'):
                                article_no = checkbox['value']
                        except: pass
                    
                    db_data.append({
                        "agent": agent, "dong": dong, "spec": spec, "price": price,
                        "article_no": article_no,  "trade_type" : "전세","crawl_date": TODAY_STR, "crawl_time": f"{HOUR_STR}시"
                    })


                    # ------------------------------
                    # t_soup = BeautifulSoup(target.get_attribute('outerHTML'), "html.parser")
                    # try: agent = t_soup.select("a.agent_name")[-1].get_text(strip=True)
                    # except: agent = "알수없음"
                    # try: price = t_soup.select_one("span.price").get_text(strip=True)
                    # except: price = ""
                    
                    # [여기 수정됨] 체크박스 value에서 번호 추출
                    # article_no = "-"
                    # try:
                    #     # input 태그 중 name이 'item_check'인 것을 찾음 (네이버 부동산 구조)
                    #     checkbox = t_soup.select_one("input[name='item_check']")
                    #     if checkbox and checkbox.get('value'):
                    #         article_no = checkbox.get('value')
                    # except Exception:
                    #     pass
                    
                    # db_data.append({
                    #     "agent": agent, "dong": dong, "spec": spec, "price": price,
                    #     "article_no": article_no, "crawl_date": TODAY_STR, "crawl_time": f"{HOUR_STR}시"
                    # })
            except: continue
        
        driver.quit()

        # ------------------------------------------------------------------
        # 5. DB 저장
        # ------------------------------------------------------------------
        if db_data:
            try:
                supabase.table('real_estate_logs').insert(db_data).execute()
                print(f"✅ [Log] 총 {len(db_data)}건 저장 완료")
            except Exception as e:
                print(f"❌ [Log] 저장 실패: {e}")

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