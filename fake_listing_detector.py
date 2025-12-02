import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import pandas as pd
from bs4 import BeautifulSoup
import time
import os
import random
from datetime import datetime, timedelta, timezone
from supabase import create_client, Client

# ▼▼▼ [필수] 가상 모니터 라이브러리 (이게 있어야 서버에서 0건이 안 뜸) ▼▼▼
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

# 한국 시간 설정
KST = timezone(timedelta(hours=9))
NOW = datetime.now(KST)
TODAY_STR = NOW.strftime("%Y-%m-%d")
HOUR_STR = NOW.strftime("%H")

def run_crawler():
    print(f"🚀 [GitHub Actions + 가상화면] {TODAY_STR} {HOUR_STR}시 크롤링 시작...")

    # 1. 가상 모니터 켜기 (서버에서도 화면이 있는 척 속임)
    display = Display(visible=0, size=(1920, 1080))
    display.start()
    
    options = uc.ChromeOptions()
    # [중요] --headless 옵션 삭제! (가상 화면을 쓰므로 필요 없음)
    
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--lang=ko_KR")
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

    driver = uc.Chrome(options=options)

    # 봇 탐지 속성 제거
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": """
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        """
    })
    
    try:
        # 2. 페이지 접속
        driver.get(f"https://new.land.naver.com/complexes/{COMPLEX_NO}")
        
        # 로딩 대기 (최대 60초)
        try: 
            WebDriverWait(driver, 60).until(
                EC.presence_of_element_located((By.ID, "complex_article_trad_type_filter_0"))
            )
        except: 
            print("⚠️ 로딩 시간 초과 or 차단됨")
            driver.save_screenshot("debug_loading_fail.png")

        # 3. [필터 설정] 74건을 맞추기 위한 정밀 로직
        print("⚙️ 필터 적용 중...")
        try:
            # (1) 전체 선택 해제
            driver.execute_script("if(document.querySelector('#complex_article_trad_type_filter_0:checked')) document.querySelector('#complex_article_trad_type_filter_0').click();")
            time.sleep(0.5)
            
            # (2) 매매 선택
            driver.execute_script("if(!document.querySelector('#complex_article_trad_type_filter_1:checked')) document.querySelector('#complex_article_trad_type_filter_1').click();")
            time.sleep(1)
            
            # (3) 동일매물 묶기 (체크 안 되어 있으면 클릭)
            # 서버에서는 JS로 강제 클릭하는 것이 더 확실함
            driver.execute_script("""
                var chk = document.getElementById("address_group2");
                if (!chk.checked) {
                    document.querySelector("label[for='address_group2']").click();
                }
            """)
            time.sleep(1)
            
            # (4) 가격순 정렬
            driver.find_element(By.CSS_SELECTOR, "a.sorting_type[data-nclk='TAA.price']").click()
            
            # [중요] 필터 적용 후 목록이 바뀔 때까지 충분히 대기 (5초)
            print("   ⏳ 목록 갱신 대기...")
            time.sleep(5)

        except Exception as e:
            print(f"⚠️ 필터 오류(무시): {e}")
        
        # 4. 스크롤 로직 (개수 체크 + 강제 스크롤)
        print("⬇️ 데이터 로딩 중...")
        try: list_area = WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "articleListArea")))
        except: list_area = driver.find_element(By.TAG_NAME, "body")

        # 포커스
        try:
            actions = ActionChains(driver)
            actions.move_to_element(list_area).click().perform()
        except: pass

        last_count = 0
        same_count = 0
        
        for _ in range(40): # 최대 40번 시도
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
                if same_count >= 5: 
                    print("   ✅ 스크롤 완료")
                    break
            else: same_count = 0
            last_count = curr

        # 5. 데이터 추출
        parent_items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
        print(f"📝 총 {len(parent_items)}개 그룹 발견.")

        if len(parent_items) == 0:
            print("❌ 데이터 0건. 차단되었을 가능성이 높습니다.")
            driver.save_screenshot("debug_zero_result.png")
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

                # 펼치기 (상세 정보)
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
                        "article_no": "-", # 클릭 생략
                        "crawl_date": TODAY_STR, "crawl_time": f"{HOUR_STR}시"
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
            stats = df['agent'].value_counts().reset_index()
            stats.columns = ['agent', 'count']
            stats_data = [{"agent": r['agent'], "count": int(r['count']), "crawl_date": TODAY_STR, "crawl_time": f"{HOUR_STR}시"} for _, r in stats.iterrows()]
            
            try:
                supabase.table('agent_stats').insert(stats_data).execute()
                print(f"✅ [Stats] 통계 저장 성공")
            except: pass

    except Exception as e:
        print(f"❌ 실행 중 오류: {e}")
        driver.save_screenshot("debug_fatal.png")
        driver.quit()
    finally:
        display.stop() # 가상 모니터 종료

if __name__ == "__main__":
    run_crawler