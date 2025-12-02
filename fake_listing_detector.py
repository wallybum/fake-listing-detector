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
        # 필터 설정
        # ------------------------------------------------------------------
        print("⚙️ 필터 적용 중...")
        try:
            driver.execute_script("if(document.querySelector('#complex_article_trad_type_filter_0:checked')) document.querySelector('#complex_article_trad_type_filter_0').click();")
            time.sleep(0.5)
            driver.execute_script("if(!document.querySelector('#complex_article_trad_type_filter_1:checked')) document.querySelector('#complex_article_trad_type_filter_1').click();")
            time.sleep(1)
            
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
        # 스크롤 로직 (성공했던 방식)
        # ------------------------------------------------------------------
        print("⬇️ 데이터 로딩 중...")
        try: list_area = WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "articleListArea")))
        except: list_area = driver.find_element(By.TAG_NAME, "body")

        try:
            actions = ActionChains(driver)
            actions.move_to_element(list_area).click().perform()
        except: pass

        last_count = 0
        same_count_loop = 0
        
        while True:
            driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", list_area)
            try: 
                list_area.send_keys(Keys.END)
                time.sleep(0.3)
                list_area.send_keys(Keys.PAGE_DOWN)
            except: pass
            
            time.sleep(2.0)
            
            items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
            current_count = len(items)
            print(f"   ... 스크롤 중 (현재 {current_count}개)")

            if current_count == last_count and current_count > 0:
                same_count_loop += 1
                if same_count_loop >= 5:
                    print("   ✅ 스크롤 완료")
                    break
            else:
                same_count_loop = 0
            last_count = current_count

        # ------------------------------------------------------------------
        # 데이터 추출 (매물번호 수집 기능 추가됨)
        # ------------------------------------------------------------------
        parent_items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
        print(f"📝 총 {len(parent_items)}개 그룹 발견. 상세 수집 시작...")
        
        if len(parent_items) == 0:
            print("❌ 데이터 0건.")
            driver.save_screenshot("debug_zero.png")
            return

        db_data = []
        
        # [함수] 상세 화면에서 매물번호 추출
        def get_article_no():
            try:
                time.sleep(0.2) # 상세 로딩 대기
                soup = BeautifulSoup(driver.page_source, "html.parser")
                # '매물번호' 텍스트가 있는 th 태그 찾기
                target_th = soup.find("th", string=lambda t: t and "매물번호" in t)
                if target_th:
                    return target_th.find_next_sibling("td").get_text(strip=True)
            except: pass
            return "-"

        for idx, parent in enumerate(parent_items):
            try:
                # 진행 상황 로그
                if idx % 10 == 0: print(f"   Processing {idx+1}/{len(parent_items)}...")

                p_html = parent.get_attribute('outerHTML')
                soup = BeautifulSoup(p_html, "html.parser")
                try: title = soup.select_one("div.item_title > span.text").get_text(strip=True)
                except: title = "제목없음"
                
                if title == "제목없음": continue
                
                dong = title.replace("DMC파크뷰자이", "").strip()
                try: spec = soup.select_one("div.info_area .spec").get_text(strip=True)
                except: spec = ""

                # 펼치기 및 타겟 확보
                multi_btn = parent.find_elements(By.CSS_SELECTOR, "span.label--multicp")
                targets = []
                
                if multi_btn:
                    try:
                        driver.execute_script("arguments[0].click();", multi_btn[0])
                        time.sleep(0.3)
                        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", parent)
                        
                        child_container = parent.find_element(By.CSS_SELECTOR, "div.item.item--child")
                        inners = child_container.find_elements(By.CSS_SELECTOR, "div.item_inner")
                        for inner in inners:
                            if inner.find_elements(By.CSS_SELECTOR, "div.cp_area"): targets.append(inner)
                    except:
                        targets.append(parent.find_element(By.CSS_SELECTOR, "div.item_inner"))
                else:
                    targets.append(parent.find_element(By.CSS_SELECTOR, "div.item_inner"))

                # 개별 매물 순회
                for target in targets:
                    t_soup = BeautifulSoup(target.get_attribute('outerHTML'), "html.parser")
                    try: agent = t_soup.select("a.agent_name")[-1].get_text(strip=True)
                    except: agent = "알수없음"
                    try: price = t_soup.select_one("span.price").get_text(strip=True)
                    except: price = ""

                    # [추가된 부분] 클릭하여 매물번호 수집
                    try:
                        # '네이버에서 보기' 버튼이 있으면 우선 클릭, 없으면 일반 링크 클릭
                        cp_btns = target.find_elements(By.CSS_SELECTOR, "a.label.label--cp")
                        if cp_btns:
                            driver.execute_script("arguments[0].click();", cp_btns[0])
                        else:
                            link = target.find_element(By.CSS_SELECTOR, "a.item_link")
                            driver.execute_script("arguments[0].click();", link)
                        
                        article_no = get_article_no()
                    except:
                        article_no = "-"
                    
                    db_data.append({
                        "agent": agent, "dong": dong, "spec": spec, "price": price,
                        "article_no": article_no, 
                        "crawl_date": TODAY_STR, "crawl_time": f"{HOUR_STR}시"
                    })
            except: continue
        
        driver.quit()

        # ------------------------------------------------------------------
        # DB 저장
        # ------------------------------------------------------------------
        if db_data:
            # 1. 상세 로그 저장
            try:
                supabase.table('real_estate_logs').insert(db_data).execute()
                print(f"✅ [Log] 총 {len(db_data)}건 저장 완료")
            except Exception as e:
                print(f"❌ [Log] 저장 실패: {e}")

            # 2. 통계 저장
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
        else:
            print("❌ 수집된 데이터 0건")

    except Exception as e:
        print(f"❌ 실행 중 오류: {e}")
        driver.quit()
    finally:
        display.stop()

if __name__ == "__main__":
    run_crawler()