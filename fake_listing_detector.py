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
        except: print("⚠️ 로딩 지연")

        # --- 필터 설정 ---
        print("⚙️ 필터 적용 중...")
        try:
            driver.execute_script("if(document.querySelector('#complex_article_trad_type_filter_0:checked')) document.querySelector('#complex_article_trad_type_filter_0').click();")
            time.sleep(0.5)
            driver.execute_script("if(!document.querySelector('#complex_article_trad_type_filter_1:checked')) document.querySelector('#complex_article_trad_type_filter_1').click();")
            time.sleep(1)
            
            # [동일매물 묶기] 체크 (필수)
            group_input = driver.find_element(By.ID, "address_group2")
            if not group_input.is_selected():
                print("   👉 [동일매물 묶기] 클릭")
                driver.execute_script("arguments[0].click();", driver.find_element(By.CSS_SELECTOR, "label[for='address_group2']"))
                time.sleep(1)
            
            # 가격순 정렬
            driver.find_element(By.CSS_SELECTOR, "a.sorting_type[data-nclk='TAA.price']").click()
            
            print("   ⏳ 목록 갱신 대기 (5초)...")
            time.sleep(5)

        except Exception as e:
            print(f"⚠️ 필터 오류: {e}")
        
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
            print(f"   ... 스크롤 중 (현재 {current_count}개 그룹)")

            if current_count == last_count and current_count > 0:
                same_count_loop += 1
                if same_count_loop >= 5:
                    print("   ✅ 스크롤 완료")
                    break
            else:
                same_count_loop = 0
            last_count = current_count

        # --- 데이터 추출 (핵심 수정) ---
        parent_items = driver.find_elements(By.CSS_SELECTOR, "div.item:not(.item--child)")
        print(f"📝 총 {len(parent_items)}개 그룹 발견. 상세 수집 시작...")
        
        if len(parent_items) == 0:
            print("❌ 데이터 0건.")
            return

        db_data = []
        
        for idx, parent in enumerate(parent_items):
            try:
                # 부모 정보 파싱 (동, 스펙, 가격 범위 등)
                p_html = parent.get_attribute('outerHTML')
                soup = BeautifulSoup(p_html, "html.parser")
                
                try: title = soup.select_one("div.item_title > span.text").get_text(strip=True)
                except: continue
                if title == "제목없음": continue
                
                dong = title.replace("DMC파크뷰자이", "").strip()
                
                try: spec = soup.select_one("div.info_area .spec").get_text(strip=True)
                except: spec = ""

                # ======================================================
                # [핵심] 자식 매물(개별 중개사) 모두 긁어오기 로직
                # ======================================================
                
                # 1. "중개사 N곳" 버튼이 있는지 확인
                multi_btn = parent.find_elements(By.CSS_SELECTOR, "span.label--multicp")
                
                targets = [] # 정보를 추출할 대상 요소들 리스트

                if multi_btn:
                    # 묶음 매물이면 -> 펼치기 버튼 클릭!
                    driver.execute_script("arguments[0].click();", multi_btn[0])
                    time.sleep(0.3) # 펼침 대기
                    
                    # 펼쳐진 자식 컨테이너 찾기
                    # 주의: parent 안에 item--child가 생성됨
                    try:
                        child_container = parent.find_element(By.CSS_SELECTOR, "div.item.item--child")
                        # 그 안의 개별 매물(item_inner)들을 모두 찾음
                        inners = child_container.find_elements(By.CSS_SELECTOR, "div.item_inner")
                        
                        # 로딩바 등 가짜 요소 제외하고 진짜 정보(cp_area) 있는 것만 담기
                        for inner in inners:
                            if inner.find_elements(By.CSS_SELECTOR, "div.cp_area"):
                                targets.append(inner)
                    except:
                        # 펼치기 실패시 부모라도 담음
                        targets.append(parent.find_element(By.CSS_SELECTOR, "div.item_inner"))
                else:
                    # 단독 매물이면 -> 부모 자신을 타겟으로
                    targets.append(parent.find_element(By.CSS_SELECTOR, "div.item_inner"))

                # 2. 확보된 타겟들(개별 중개사 매물) 순회하며 저장
                for target in targets:
                    t_html = target.get_attribute('outerHTML')
                    t_soup = BeautifulSoup(t_html, "html.parser")
                    
                    # 중개사 이름
                    try: agent = t_soup.select("a.agent_name")[-1].get_text(strip=True)
                    except: agent = "알수없음"
                    
                    # 가격 (개별 가격)
                    try: price = t_soup.select_one("span.price").get_text(strip=True)
                    except: 
                        # 개별 가격 없으면 부모의 가격 범위라도 가져옴
                        try: price = soup.select_one("span.price").get_text(strip=True)
                        except: price = "가격없음"
                    
                    # 매물번호 (클릭 안하고 리스트에 노출된 정보가 있다면 좋겠지만, 보통 클릭해야 나옴)
                    # 여기서는 속도를 위해 "-"로 두거나, 필요시 클릭 로직 추가
                    article_no = "-" 
                    
                    # DB 리스트에 추가
                    db_data.append({
                        "agent": agent, 
                        "dong": dong, 
                        "spec": spec, 
                        "price": price,
                        "article_no": article_no, 
                        "crawl_date": TODAY_STR, 
                        "crawl_time": f"{HOUR_STR}시"
                    })

            except Exception as e:
                continue # 특정 매물 에러나도 다음으로 넘어감
        
        driver.quit()

        # ======================================================
        # DB 저장
        # ======================================================
        if db_data:
            # 1. 상세 로그 (real_estate_logs)
            try:
                supabase.table('real_estate_logs').insert(db_data).execute()
                print(f"✅ [Log] 총 {len(db_data)}건 저장 완료")
            except Exception as e:
                print(f"❌ [Log] 저장 실패: {e}")

            # 2. 통계 저장 (agent_stats)
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
            except: pass
        else:
            print("❌ 수집된 데이터 0건")

    except Exception as e:
        print(f"❌ 실행 중 오류: {e}")
        driver.quit()
    finally:
        display.stop()

if __name__ == "__main__":
    run_crawler()