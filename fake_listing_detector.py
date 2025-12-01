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

# [필수] 가상 모니터 (서버에서 0건 뜨는 문제 해결용)
from pyvirtualdisplay import Display 

# ==================================================================
# [설정] 환경변수
# ==================================================================
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
COMPLEX_NO = "108064" # DMC파크뷰자이

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Supabase 설정이 없습니다.")
    exit()

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 한국 시간 설정
KST = timezone(timedelta(hours=9))
NOW = datetime.now(KST)
TODAY_STR = NOW.strftime("%Y-%m-%d")
HOUR_STR = NOW.strftime("%H")

def run_crawler():
    print(f"🚀 [GitHub Actions] {TODAY_STR} {HOUR_STR}시 크롤링 시작...")

    # 1. 가상 모니터 켜기 (서버에서도 화면이 있는 척 속임 -> 봇 차단 회피 핵심)
    display = Display(visible=0, size=(1920, 1080))
    display.start()
    
    options = uc.ChromeOptions()
    # [중요] --headless 옵션 제거! (가상 화면을 쓰므로 화면 있는 모드로 실행)
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    # 봇 탐지 방지
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

    driver = uc.Chrome(options=options)
    
    try:
        # 2. 접속
        driver.get(f"https://new.land.naver.com/complexes/{COMPLEX_NO}")
        
        try: WebDriverWait(driver, 20).until(EC.presence_of_element_located((By.ID, "complex_article_trad_type_filter_0")))
        except: pass

        # ------------------------------------------------------------------
        # 3. 필터 설정 (로컬에서 성공한 로직 그대로 적용)
        # ------------------------------------------------------------------
        print("⚙️ 필터 적용 중...")
        try:
            # 전체 해제
            driver.execute_script("if(document.querySelector('#complex_article_trad_type_filter_0:checked')) document.querySelector('#complex_article_trad_type_filter_0').click();")
            time.sleep(0.5)
            # 매매 선택
            driver.execute_script("if(!document.querySelector('#complex_article_trad_type_filter_1:checked')) document.querySelector('#complex_article_trad_type_filter_1').click();")
            time.sleep(1)
            # [핵심] 동일매물 묶기 (로컬 성공 코드)
            driver.execute_script("""var cb = document.getElementById("address_group2"); if (cb && !cb.checked) document.querySelector("label[for='address_group2']").click();""")
            time.sleep(1)
            # 가격순 정렬
            driver.find_element(By.CSS_SELECTOR, "a.sorting_type[data-nclk='TAA.price']").click()
        except: pass
        
        time.sleep(3) # 필터 적용 대기

        # ------------------------------------------------------------------
        # 4. 스크롤 로직 (로컬에서 성공한 '강력 모드' 적용)
        # ------------------------------------------------------------------
        print("⬇️ 데이터 로딩 중 (전체 매물 확보)...")
        try: 
            list_area = WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "articleListArea")))
            actions = ActionChains(driver)
            actions.move_to_element(list_area).click().perform()
        except: 
            list_area = driver.find_element(By.TAG_NAME, "body")

        last_count = 0
        same_count_loop = 0
        
        while True:
            # JS 스크롤
            driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", list_area)
            
            # 키보드 입력 (END + PAGE_DOWN 콤보)
            try: 
                list_area.send_keys(Keys.END)
                time.sleep(0.5)
                list_area.send_keys(Keys.PAGE_DOWN)
            except: pass
            
            time.sleep(2.0) # 충분한 대기
            
            # 부모 그룹 개수 확인
            items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
            current_count = len(items)
            
            print(f"   ... 스크롤 중 (현재 {current_count}개 그룹 로딩됨)")

            if current_count == last_count:
                same_count_loop += 1
                # 5번 연속 변화 없으면 종료
                if same_count_loop >= 5:
                    print("   ✅ 전체 목록 로딩 완료.")
                    break
            else:
                same_count_loop = 0
                
            last_count = current_count

        # ------------------------------------------------------------------
        # 5. 데이터 추출 (로컬 성공 로직: 펼치기 포함)
        # ------------------------------------------------------------------
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

                # 펼치기 (중요!)
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

                    # 상세 페이지 클릭 (매물번호 확보용)
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

        # ------------------------------------------------------------------
        # 6. DB 저장 (엑셀 없이 Supabase로 직행)
        # ------------------------------------------------------------------
        if not db_data:
            print("❌ 수집된 데이터가 없습니다.")
            driver.save_screenshot("debug_no_data.png")
            return

        # [저장 1] 상세 로그
        try:
            supabase.table('real_estate_logs').insert(db_data).execute()
            print(f"✅ [Log Table] 상세 매물 {len(db_data)}건 저장 완료")
        except Exception as e:
            print(f"❌ [Log Table] 저장 실패: {e}")

        # [저장 2] 통계 데이터
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

    except Exception as e:
        print(f"❌ 실행 중 오류 발생: {e}")
        driver.save_screenshot("debug_error.png")
        
    finally:
        driver.quit()
        display.stop() # 가상 모니터 종료

if __name__ == "__main__":
    run_crawler()