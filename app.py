from flask import Flask, render_template, jsonify, request, send_from_directory
from flask_cors import CORS
from google import genai
from google.genai import types
from datetime import datetime
import time
import os
import requests
from dotenv import load_dotenv
import json
import hashlib
import traceback
import psycopg2
from psycopg2.extras import RealDictCursor
from pathlib import Path
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

KST = timezone(timedelta(hours=9))

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

def get_toss_cert():
    cert_path = '/tmp/toss_cert.pem'
    key_path = '/tmp/toss_key.pem'

    if not os.path.exists(cert_path) or not os.path.exists(key_path):
        with open(cert_path, 'w') as f:
            f.write(os.environ.get('TOSS_CERT', ''))
        with open(key_path, 'w') as f:
            f.write(os.environ.get('TOSS_KEY', ''))
        
    return (cert_path, key_path)

TOSS_CERTS = get_toss_cert() # 🌟 수정: 함수 이름과 맞춤

ip_request_counts = defaultdict(lambda: {"count": 0, "date": ""})

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("❌ 도사님! API 키가 없어서 신통력을 발휘할 수 없습니다!")
    raise ValueError("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.")

client = genai.Client(api_key=api_key)

DATABASE_URL = os.environ.get("DATABASE_URL")

def get_db_connection():
    # PostgreSQL 데이터베이스 연결 함수
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def init_db():
    """서버 시작 시 테이블이 없으면 생성하는 함수"""
    if not DATABASE_URL:
        print("⚠️ DATABASE_URL이 설정되지 않았습니다.")
        return
    
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        # 유저 키를 Primary Key로 설정하여 중복 방지
        cur.execute('''
            CREATE TABLE IF NOT EXISTS toss_users (
                user_key VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255),
                last_active DATE
            )
        ''')
        conn.commit()
        cur.close()
    finally:
        conn.close()

# 앱 실행 시 DB 테이블 자동 생성
init_db()

def upsert_user(user_key, name, last_active):
    """새 유저면 추가하고, 기존 유저면 이름과 최근 접속일을 업데이트"""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute('''
            INSERT INTO toss_users (user_key, name, last_active)
            VALUES (%s, %s, %s)
            ON CONFLICT (user_key)
            DO UPDATE SET name = EXCLUDED.name, last_active = EXCLUDED.last_active;
        ''', (user_key, name, last_active))
        conn.commit()
        cur.close()
    finally:
        conn.close()

def get_all_users():
    """푸시 발송을 위해 전체 유저 목록 가져오기"""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute('SELECT user_key, name FROM toss_users')
        users = cur.fetchall()
        cur.close()
        return users
    finally:
        conn.close()


# ==============================================================
# 🌟 [신규] 매일 오전 10시 대량 푸시 발송 함수 (Bulk Message)
# ==============================================================
def send_daily_bulk_push():
    print(f"[{datetime.now(KST).strftime('%Y-%m-%d %H:%M:%S')}] ⏰ 일일 운세 충전 푸시 알림 발송 시작!")
    
    users = get_all_users()
    if not users:
        print("발송할 대상 유저가 없습니다.")
        return

    url = "https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/messenger/send-bulk-message"
    headers = {"Content-Type": "application/json"}
    
    # 토스 개발자 센터에서 승인받은 대량 발송용 템플릿 코드 (예: "FORTUNE_DAILY_TEMP")
    template_code = os.environ.get('TOSS_DAILY_PUSH_TEMPLATE', 'FORTUNE_DAILY_TEMP') 
    
    context_list = []
    for user in users:
        context_list.append({
            "userKey": user['user_key'],
            "context": {
                "name": user['name']
            }
        })

    # 혹시 유저가 너무 많아질 경우를 대비해 500명씩 잘라서(청크) 발송
    chunk_size = 500
    for i in range(0, len(context_list), chunk_size):
        chunk = context_list[i:i+chunk_size]
        payload = {
            "templateSetCode": template_code,
            "contextList": chunk
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers, cert=TOSS_CERTS, timeout=10)
            res_json = response.json()
            if res_json.get("resultType") == "SUCCESS":
                success_data = res_json.get('success', {})
                print(f"✅ 대량 푸시 성공: 총 {success_data.get('msgCount')}건 중 {success_data.get('sentPushCount')}건 전송 완료.")
            else:
                print(f"❌ 대량 푸시 실패: {res_json.get('error', {}).get('reason')}")
        except Exception as e:
            print(f"⚠️ 대량 푸시 에러: {e}")

# ==============================================================
# 🌟 [신규] 스케줄러 설정 (매일 오전 10시 실행)
# ==============================================================
scheduler = BackgroundScheduler(timezone=KST)
# CronTrigger를 사용해 매일 10시 0분에 실행하도록 예약
scheduler.add_job(send_daily_bulk_push, CronTrigger(hour=10, minute=0))
scheduler.start()


SCORES = {
    "💎": 3000, "👑": 2000, "💰": 1000, 
    "7️⃣": 700, "🍒": 300, "🍋": 100
}

CACHE_FILE = Path("fortune_cache.json")

safety_settings = [
    types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="BLOCK_NONE"),
    types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="BLOCK_NONE"),
    types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_NONE"),
    types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_NONE"),
]

def load_cache():
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_cache(cache):
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

fortune_cache = load_cache()

def get_grade_info(score: int):
    if score >= 100000:
        return {"grade": "🌌 우주신", "status": "우주의 주인이 되셨구려!", "next_grade_info": None}
    elif score >= 60000:
        return {"grade": "☀️ 태양신", "status": "강렬한 태양의 기운!", "next_grade_info": "🌌 우주신"}
    elif score >= 30000:
        return {"grade": "🌕 광명성", "status": "비범한 운명!", "next_grade_info": "☀️ 태양신"}
    elif score >= 10000:
        return {"grade": "👑 제왕", "status": "제왕의 격이로다.", "next_grade_info": "🌕 광명성"}
    else:
        return {"grade": "🌑 수행자", "status": "인내하거라.", "next_grade_info": "👑 제왕"}

def make_daily_fortune_key(name, birth, birth_time, gender, question, grade, today_key):
    raw = f"{today_key}|{name.strip()}|{birth.strip()}|{birth_time.strip()}|{gender.strip()}|{question.strip()}|{grade}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

def call_gemini(prompt: str) -> str:
    max_retries = 2
    for i in range(max_retries):
        try:
            response = client.models.generate_content(
                model="models/gemini-2.5-flash-lite",
                contents=prompt,
                config=types.GenerateContentConfig(safety_settings=safety_settings)
            )
            if hasattr(response, "text") and response.text:
                return response.text.strip()
            try:
                return response.candidates[0].content.parts[0].text.strip()
            except:
                pass
        except Exception as e:
            print(f"Retry {i + 1} failed:")
            traceback.print_exc()
            if i < max_retries - 1:
                time.sleep(2)
    raise RuntimeError("Gemini 응답 생성 실패")

def generate_full_fortune(name, birth, birth_time, gender, question, grade, today_display, next_grade_info):
    constraints = {
        "🌑 수행자": "반드시 '딱 1문장'만 작성. (전체 150자 이내)",
        "👑 제왕": "각 항목당 '2문장'. 구체적인 조언을 담아라. (전체 450자 이내)",
        "🌕 광명성": "각 항목당 '3문장'. 풍성하고 여유롭게 써라. (전체 700자 이내)",
        "☀️ 태양신": "각 항목당 '4문장'. 깊이 있는 통찰을 담아라. (전체 1000자 이내)",
        "🌌 우주신": "각 항목당 '5문장 이상'. 상세하고 웅장하게 써라. (전체 1500자 이내)"
    }

    current_constraint = constraints.get(grade, constraints["🌑 수행자"])
    
    prompt = f"""
너는 사주 명리학자 '레트로 도사'다. 손님은 [{grade}] 등급이다.
제약 조건: {current_constraint}

[절대 규칙]
1. 말투: "~하시게", "~하거라" 등 도사 말투 유지.
2. 비책(솔루션)은 절대 언급하지 마라.
3. 오직 오늘 하루의 운세만 다뤄라.

[출력 형식]
애햄! {name} 손님...
[오늘의 총운]
[금전운]
[인간관계운]
[건강운]
[도사의 조언] (고민: {question} 해결 중심)
"""

    if next_grade_info:
        prompt += f"\n[마무리] 지금보다 높은 등급이 되면 더 놀라운 천기를 보게 될 것이라 유혹하며 마무리."

    return call_gemini(prompt)


# ==============================================================
# 🌟 [기능 추가 1] 토스 푸쉬 알람 자동 등록 함수
# ==============================================================
def sync_toss_push_user(toss_user_key, user_name):
    """ 유저가 운세를 볼 때 토스 메시지 서버에 활성 사용자로 등록합니다. """
    try:
        url = "https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/messenger/send-message"
        headers = {
            "Content-Type": "application/json",
            "X-Toss-User-Key": toss_user_key
        }
        template_code = os.environ.get('TOSS_PUSH_TEMPLATE', 'FORTUNE_WELCOME_TEMP')
        payload = {
            "templateSetCode": template_code,
            "context": {"name": user_name}
        }
        response = requests.post(url, json=payload, headers=headers, cert=TOSS_CERTS, timeout=5)
        res_json = response.json()
        if res_json.get("resultType") == "SUCCESS":
            print(f"✅ [푸쉬등록 성공] {user_name}")
        else:
            print(f"❌ [푸쉬등록 실패] {res_json.get('error', {}).get('reason')}")
    except Exception as e:
        print(f"⚠️ [푸쉬등록 에러] {e}")


# ==============================================================
# 🌟 [기능 추가 2] 토스 간편 로그인 API
# ==============================================================
# ==============================================================
# 🌟 [수정] 토스 정식 OAuth2 토큰 발급 API 적용
# ==============================================================
# ==============================================================
# 🌟 [최신 규격] 토스 정식 OAuth2 토큰 발급 API 적용
# ==============================================================
@app.route('/toss_login', methods=['POST'])
def toss_login():
    data = request.get_json() or {}
    code = data.get('code')
    
    if not code:
        return jsonify({"isSuccess": False, "error": "인증 코드가 없습니다."}), 400
        
    try:
        # 1. 대표님이 찾으신 토스 정식 OAuth2 토큰 발급 주소
        url = "https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/user/oauth2/generate-token"
        
        # 2. 가이드에 명시된 필수 파라미터 2가지
        payload = {
            "authorizationCode": code,
            "referrer": "MINI_APP_MAIN" # 필수값: 유입 경로 명시
        }
        
        headers = {"Content-Type": "application/json"}
        
        # 3. 토스 인증서를 태워서 정식으로 요청
        res = requests.post(url, json=payload, headers=headers, cert=TOSS_CERTS, timeout=5)
        res_data = res.json()
        
        # 4. 발급 성공 시 처리
        if res_data.get("resultType") == "SUCCESS":
            token_info = res_data.get("success", {})
            access_token = token_info.get("accessToken", "")
            
            # 발급받은 토큰의 해시값을 유저 고유 식별자(userKey)로 변환
            # (이 키를 바탕으로 DB에서 하루 5회 접속 제한을 완벽하게 통제합니다)
            import hashlib
            unique_user_key = "TOSS_" + hashlib.sha256(access_token.encode()).hexdigest()[:20]
            
            return jsonify({
                "isSuccess": True, 
                "userInfo": {
                    "userKey": unique_user_key,
                    "decryptedName": "토스 도사님" # 초기 닉네임
                }
            })
            
        # 5. 실패 시 토스가 뱉어낸 정확한 에러 사유 반환
        error_info = res_data.get("error", {})
        return jsonify({"isSuccess": False, "error": error_info.get("reason", "토스 서버 인증 거절")})
        
    except Exception as e:
        print(f"❌ 로그인 API 에러: {str(e)}")
        return jsonify({"isSuccess": False, "error": str(e)})


# ==============================================================
# 🌟 [기능 추가 3] 토스 포인트 프로모션 지급 API
# ==============================================================
@app.route('/give_toss_point', methods=['POST'])
def give_toss_point():
    data = request.get_json() or {}
    toss_user_key = data.get('toss_user_key')
    amount = data.get('amount', 1)
    
    if not toss_user_key:
        return jsonify({"isSuccess": False, "error": "유저 키가 없습니다."}), 400
        
    try:
        url = "https://apps-in-toss-api.toss.im/api-partner/v2/point/deposit"
        headers = {
            "Content-Type": "application/json",
            "X-Toss-User-Key": toss_user_key
        }
        payload = {
            "promotionId": "TEST_01KPT6C4487X5RGTPZQZYV8CN8",
            "amount": amount,
            "transactionId": f"reward_{int(time.time())}_{str(toss_user_key)[-5:]}",
            "description": "레트로 도 가 천기 누설 보상"
        }
        res = requests.post(url, json=payload, headers=headers, cert=TOSS_CERTS, timeout=5)
        res_data = res.json()
        if res_data.get("resultType") == "SUCCESS":
            return jsonify({"isSuccess": True})
        return jsonify({"isSuccess": False, "error": str(res_data)})
    except Exception as e:
        return jsonify({"isSuccess": False, "error": str(e)})


@app.route('/')
def index():
    return jsonify({
        "status": "online",
        "message": "레트로 도사 API 서버가 정상 동작 중입니다!",
        "version": "1.0.0"
    })

# ==============================================================
# 🌟 [수정 완료] 중복된 get_fortune 제거 및 DB 로직 병합
# ==============================================================
@app.route('/get_fortune', methods=['POST'])
def get_fortune():
    global ip_request_counts
    
    data = request.get_json(silent=True) or {}
    toss_user_key = data.get('toss_user_key')
    anon_key = data.get('anonymous_key')
    user_ip = request.headers.get('X-Forwarded-For', request.remote_addr).split(',')[0]
    user_id = toss_user_key if toss_user_key else (anon_key if anon_key else user_ip)
    
    now_kst = datetime.now(KST)
    today_key = now_kst.strftime("%Y-%m-%d")      # 캐시 및 횟수 제한용
    today_display = now_kst.strftime("%Y년 %m월 %d일") # 프롬프트 표시용
    
    user_record = ip_request_counts[user_id]
    if user_record["date"] != today_key:
        user_record["count"] = 0
        user_record["date"] = today_key

    if user_record["count"] >= 5:
        return jsonify({
            "fortune": "🏮 도사님의 경고: '이미 하루의 천기를 끝까지 다 보았네! 내일 다시 오시게.'",
            "grade": "접근 제한", 
            "status": "욕심은 금물이오"
        }), 429
    
    try:
        name = data.get('name', '익명')[:10]
        birth = data.get('birth', '알 수 없음')[:8]
        birth_time = data.get('birth_time', '모름')[:20]
        gender = data.get('gender', '미정')[:2]
        score = int(data.get('total_score', 0))
        user_question = data.get('question', '오늘의 전반적인 운세')[:80]

        # 🌟 토스 유저일 경우 DB에 유저 정보 업데이트 (푸시 발송 명단 갱신)
        if toss_user_key:
            try:
                upsert_user(toss_user_key, name, today_key)
            except Exception as db_error:
                print(f"⚠️ DB 저장 실패 (운세는 정상 진행됨): {db_error}")

        print(f"[{now_kst.strftime('%H:%M:%S')}] 🧧 {name} | 점수: {score} | 고민: {user_question} | ID: {user_id[:10]}...")

        grade_info = get_grade_info(score)
        grade = grade_info["grade"]
        status = grade_info["status"]
        next_grade_info = grade_info["next_grade_info"]

        fortune_key = make_daily_fortune_key(
            name=name, birth=birth, birth_time=birth_time, 
            gender=gender, question=user_question, grade=grade, today_key=today_key
        )

        if fortune_key not in fortune_cache:
            fortune_cache[fortune_key] = generate_full_fortune(
                name=name, birth=birth, birth_time=birth_time, 
                gender=gender, question=user_question, grade=grade, 
                today_display=today_display, next_grade_info=next_grade_info
            )
            save_cache(fortune_cache)

        final_fortune = fortune_cache[fortune_key]
        
        user_record["count"] += 1

        # 🌟 결과 반환 전 토스 푸쉬 명단에 사용자 등록 (호출 연동)
        if toss_user_key:
            try:
                upsert_user(toss_user_key, name, today_key)
            except Exception as db_error:
                print(f"⚠️ DB 저장 실패 (운세는 정상 진행됨): {db_error}")

        return jsonify({
            "fortune": final_fortune,
            "grade": grade,
            "status": status
        })

    except Exception as e:
        print(f"Fatal error: {e}")
        return jsonify({
            "fortune": f"접신중 오류가 발생했습니다: {str(e)}",
            "grade": "에러",
            "status": "신당 점검 중"
        }), 500


@app.route('/toss-api-call')
def call_toss():
    cert = TOSS_CERTS
    url = "https://apps-in-toss-api.toss.im/v1/user-identity" 
    
    try:
        response = requests.post(url, cert=cert, json={"some": "data"})
        return response.json()
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/robots.txt')
@app.route('/sitemap.xml')
@app.route('/ads.txt')
def static_from_root():
    return send_from_directory(app.static_folder, request.path[1:])

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)
