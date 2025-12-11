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
              
                # (중개사 N곳 버튼) 버튼이 있을 경우
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
                    # 🌟 [필수] 루프 시작할 때마다 변수 초기화 (이전 값 덮어쓰기 방지)
                    article_no = None
                    agent_name = None
                    price = ""

                    try:
                        # ----------------------------------------------------------
                        # 1. 클릭할 요소 결정 (사용자 요청 로직 반영)
                        # ----------------------------------------------------------
                        click_element = None
                        is_naver_view = False # 디버깅용 플래그

                        # label_area 안의 "네이버에서 보기(label--cp)" 버튼 존재 여부 확인
                        # find_elements(복수형)를 쓰면 없어도 에러가 안 나고 빈 리스트 반환
                        naver_btns = target.find_elements(By.CSS_SELECTOR, "div.label_area a.label--cp")

                        if len(naver_btns) > 0:
                            # [Case A] 버튼이 있음 -> 버튼을 클릭 타겟으로 설정
                            click_element = naver_btns[0]
                            is_naver_view = True
                            # print("   👉 [Button] '네이버에서 보기' 클릭")
                        else:
                            # [Case B] 버튼이 없음 -> 일반 제목 링크를 클릭 타겟으로 설정
                            click_element = target.find_element(By.CSS_SELECTOR, "a.item_link")
                            is_naver_view = False

                        # ----------------------------------------------------------
                        # 2. 클릭 실행 & 상세 패널 로딩
                        # ----------------------------------------------------------
                        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", target)
                        driver.execute_script("arguments[0].click();", click_element)
                        
                        time.sleep(0.6) # 패널 열리는 시간 확보

                        # 우측 상세 패널이 뜰 때까지 대기
                        try:
                            WebDriverWait(driver, 2).until(
                                EC.presence_of_element_located((By.CSS_SELECTOR, "div.detail_contents_inner"))
                            )
                        except:
                            pass 

                        # ----------------------------------------------------------
                        # 3. 상세 패널 파싱 (여기가 메인)
                        # ----------------------------------------------------------
                        full_soup = BeautifulSoup(driver.page_source, "html.parser")
                        detail_area = full_soup.select_one("div.detail_contents_inner")

                        if detail_area:
                            rows = detail_area.select("tr.info_table_item")
                            for row in rows:
                                th = row.select_one("th")
                                # '매물번호'라고 적힌 행을 찾아서 그 옆의 td 값을 가져옴
                                if th and "매물번호" in th.get_text():
                                    td = row.select_one("td")
                                    if td:
                                        article_no = td.get_text(strip=True)
                                        break
                        
                        # [보완] 만약 상세 패널 로딩이 너무 느려서 실패했거나 파싱 못했을 경우
                        # 일반 매물(Case B)이라면 리스트에 있는 data-attribute라도 가져와본다.
                        # (네이버에서 보기 매물은 리스트에 번호가 없는 경우가 많으므로 패널 파싱이 필수)
                        if not article_no and not is_naver_view:
                            try:
                                article_no = click_element.get_attribute("data-article-no")
                            except: pass

                        # ----------------------------------------------------------
                        # 4. 나머지 정보 추출 및 저장
                        # ----------------------------------------------------------
                        t_html = target.get_attribute('outerHTML')
                        t_soup = BeautifulSoup(t_html, "html.parser")

                        try: agent_name = t_soup.select("a.agent_name")[-1].get_text(strip=True)
                        except: agent_name = "알수없음"
                        
                        try: price = t_soup.select_one("span.price").get_text(strip=True)
                        except: price = ""


                        is_landlord = False
                        try:
                            # .icon-badge.type-owner 클래스를 가진 태그 찾기
                            owner_badge = t_soup.select_one(".icon-badge.type-owner")
                            if owner_badge and "집주인" in owner_badge.get_text():
                                is_landlord = True
                        except:
                            pass


                        # 🌟 [검증] 매물번호가 여전히 None이면 저장 건너뛰기
                        if not article_no:
                            print(f"   ❌ 매물번호 추출 실패 (Skip) - {agent_name}")
                            continue

                        print(f"   🚀 [수집] {dong} / {price} / {agent_name} / 번호:{article_no}")

                        db_data.append({
                            "agent": agent_name, "dong": dong, "spec": spec, "price": price,
                            "article_no": article_no, "trade_type": "매매", 
                            "crawl_date": TODAY_STR, "crawl_time": f"{HOUR_STR}시",
                            "is_landlord": is_landlord
                        })

                    except Exception as e:
                        print(f"   ❌ 파싱 에러: {e}")
                        continue
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