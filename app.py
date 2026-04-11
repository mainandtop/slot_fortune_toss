from flask import Flask, render_template, jsonify, request, send_from_directory
from flask_cors import CORS  # 1. 이 줄을 추가
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
from pathlib import Path
from collections import defaultdict

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

def get_toss_cert():
    cert_path = '/tmp/toss_cert.pem'
    key_path = '/tmp/toss_key.pem'
    
    with open(cert_path, 'w') as f:
        f.write(os.environ.get('TOSS_CERT', ''))
    with open(key_path, 'w') as f:
        f.write(os.environ.get('TOSS_KEY', ''))
        
    return (cert_path, key_path)

ip_request_counts = defaultdict(lambda: {"count": 0, "date": ""})

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("❌ 도사님! API 키가 없어서 신통력을 발휘할 수 없습니다!")
    raise ValueError("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.")

client = genai.Client(api_key=api_key)

# models.list()로 지원 모델 전체를 받아와 출력
for m in client.models.list():
    # 텍스트 생성(generateContent) 가능한 모델만 필터링
    if "generateContent" in m.supported_actions:
        print(m.name)
        print("  → 설명:", m.display_name)

SCORES = {
    "💎": 5000,
    "👑": 3500,
    "💰": 2000,
    "7️⃣": 1000,
    "🍒": 500,
    "🍋": 300
}

CACHE_FILE = Path("fortune_cache.json")

GRADE_ORDER = [
    "🌑 수행자",
    "👣 평민",
    "🏹 숙련자",
    "📜 현자",
    "⚔️ 대장군",
    "💎 보석왕",
    "👑 제왕",
    "🌕 광명성",
    "☀️ 태양신",
    "🌌 우주신"
]

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
    if score >= 150000:
        return {
            "grade": "🌌 우주신",
            "status": "15만 점 돌파! 우주의 주인이 되셨구려!",
            "secrets": 5,
            "next_grade_info": None
        }
    elif score >= 100000:
        return {
            "grade": "☀️ 태양신",
            "status": "온 세상을 밝히는 강렬한 태양의 기운!",
            "secrets": 3,
            "next_grade_info": "🌌 우주신"
        }
    elif score >= 80000:
        return {
            "grade": "🌕 광명성",
            "status": "어둠 속에서도 빛을 발하는 비범한 운명!",
            "secrets": 2,
            "next_grade_info": "☀️ 태양신"
        }
    elif score >= 70000:
        return {
            "grade": "👑 제왕",
            "status": "만인을 발아래 두는 제왕의 격이로다.",
            "secrets": 2,
            "next_grade_info": "🌕 광명성"
        }
    elif score >= 60000:
        return {
            "grade": "💎 보석왕",
            "status": "금은보화가 창고에 쌓이는 형국이로다.",
            "secrets": 2,
            "next_grade_info": "👑 제왕"
        }
    elif score >= 40000:
        return {
            "grade": "⚔️ 대장군",
            "status": "용맹한 기운이 하늘을 찌르는구나!",
            "secrets": 1,
            "next_grade_info": "💎 보석왕"
        }
    elif score >= 30000:
        return {
            "grade": "📜 현자",
            "status": "지혜가 샘솟고 귀인이 길을 안내하리라.",
            "secrets": 1,
            "next_grade_info": "⚔️ 대장군"
        }
    elif score >= 20000:
        return {
            "grade": "🏹 숙련자",
            "status": "기운이 무르익었으니 조금만 더 힘내시오.",
            "secrets": 1,
            "next_grade_info": "📜 현자"
        }
    elif score >= 10000:
        return {
            "grade": "👣 평민",
            "status": "성실함이 복이 되어 돌아오는 날이로다.",
            "secrets": 0,
            "next_grade_info": "🏹 숙련자"
        }
    else:
        return {
            "grade": "🌑 수행자",
            "status": "지금은 씨앗을 심는 시기니 인내하거라.",
            "secrets": 0,
            "next_grade_info": "👣 평민"
        }


def make_daily_fortune_key(name, birth, birth_time, gender, question, today_key):
    raw = f"{today_key}|{name.strip()}|{birth.strip()}|{birth_time.strip()}|{gender.strip()}|{question.strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def call_gemini(prompt: str) -> str:
    import traceback
    max_retries = 2

    for i in range(max_retries):
        try:
            response = client.models.generate_content(
                model="models/gemini-2.5-flash-lite",
                contents=prompt,
                config=types.GenerateContentConfig(
                    safety_settings=safety_settings
                )
            )

            # 1차: 최신 SDK 대응
            if hasattr(response, "text") and response.text:
                return response.text.strip()

            # 2차: 구버전/대체 구조 대응
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


def generate_base_fortune(name, birth, birth_time, gender, question, today_display):
    prompt = f"""
너는 수천 년간 내려온 '사주 명리학'의 빅데이터를 완벽하게 숙지하고 있는 AI 레트로 도사다.
오늘은 {today_display}.

손님 정보:
- 이름: {name}
- 생년월일: {birth}
- 태어난 시간: {birth_time}
- 성별: {gender}
- 고민: {question}

규칙:
- 반드시 오늘 하루 전체를 관통하는 기준 운세만 작성할 것.
- 절대 '오전, 오후, 저녁, 아침, 밤' 등 시간대별 흐름을 나누어 설명하지 말 것.
- 점수나 등급 보너스 내용은 포함 금지
- 짧지만 성의 있게 작성
- 고민에 대한 내용이 있으면 [도사의 조언]을 통해 집중적으로 풀어줄 것
- 아래 형식만 정확히 따를 것

형식:
[오늘의 총운]
[금전운]
[인간관계운]
[건강운]
[조심할 일]
[도사의 조언]

첫 문장:
"애햄! {name} 손님 어서 오게나. 오늘의 천기를 읽어보니..."
"""
    return call_gemini(prompt)


def get_grade_bonus_rules(grade: str, secrets: int) -> str:
    if grade in ["🌑 수행자", "👣 평민"]:
        return "이 등급은 추가 해금 내용 없음."

    if grade in ["🏹 숙련자", "📜 현자"]:
        return f"""
- 길이: 짧거나 중간
- 현실적인 조언 중심
- 반드시 비책 {secrets}개
- 형식:
[🔥 해금된 천기]
[🔥 도사의 특별 비책]
"""

    if grade in ["⚔️ 대장군", "💎 보석왕", "👑 제왕", "🌕 광명성"]:
        return f"""
- 길이: 중간 이상
- 오늘의 기회/주의점이 선명해야 함
- 반드시 비책 {secrets}개
- 형식:
[🔥 해금된 천기]
[🔥 오늘 잡아야 할 기회]
[🔥 오늘 피해야 할 선택]
[🔥 도사의 특별 비책]
"""

    return f"""
- 길이: 풍부하고 확실하게
- 최상위 등급답게 더 선명하고 구체적이어야 함
- 반드시 비책 {secrets}개
- 형식:
[🔥 해금된 천기]
[🔥 오늘 가장 강한 행운 포인트]
[🔥 오늘 반드시 피해야 할 함정]
[🔥 도사의 특별 비책]
"""


def generate_grade_bonus(name, grade, secrets, question, today_display):
    rules = get_grade_bonus_rules(grade, secrets)

    if grade in ["🌑 수행자", "👣 평민"]:
        return ""

    prompt = f"""
너는 천기를 읽는 AI 레트로 도사다.
오늘은 {today_display}.

손님 이름: {name}
현재 등급: {grade}
오늘의 고민: {question}

규칙:
- 기본 운세를 반복하지 말 것.
- 여기서도 '오전/오후/저녁' 등 시간대를 나누는 행위는 절대 금지함.
- 오직 추가 해금 내용만 작성.
- 오늘 하루 기준으로만 작성.
- 오직 추가로 해금된 깊은 정보와 구체적인 행동 지침만 작성할 것.
- 아래 규칙을 반드시 따를 것.

{rules}
"""
    return call_gemini(prompt)


def build_final_fortune(base_fortune: str, bonuses: dict, current_grade: str, next_grade_info: str | None):
    final_parts = [base_fortune]

    # 🌟 수정된 부분: for문으로 과거 등급을 전부 누적하던 코드를 삭제하고,
    # 오직 '현재 달성한 최고 등급(current_grade)'의 비책 딱 1개만 가져오도록 변경합니다!
    if current_grade != "🌑 수행자":
        bonus_text = bonuses.get(current_grade, "").strip()
        if bonus_text:
            final_parts.append(bonus_text)

    if next_grade_info is not None:
        final_parts.append(
            f"자네의 복채 점수가 조금만 더 높아 [{next_grade_info}] 등급이었더라면,\n"
            f"내 더 깊은 천기누설을 내려주었을 텐데 참으로 아쉽구나."
        )

    return "\n\n".join(final_parts)

@app.route('/')
def index():
    # 화면을 그리는 대신, 서버가 살아있다는 신호만 보냅니다.
    return jsonify({
        "status": "online",
        "message": "레트로 도사 API 서버가 정상 동작 중입니다!",
        "version": "1.0.0"
    })

@app.route('/get_fortune', methods=['POST'])
def get_fortune():
    global ip_request_counts
    # [보안 추가] 사용자의 실제 IP 주소 추출
    user_ip = request.headers.get('X-Forwarded-For', request.remote_addr).split(',')[0]
    today_key = datetime.now().strftime("%Y-%m-%d")
    
    # 해당 IP의 오늘 기록 확인 및 초기화
    user_record = ip_request_counts[user_ip]
    if user_record["date"] != today_key:
        user_record["count"] = 0
        user_record["date"] = today_key

    #10회 초과 시 Gemini 호출 전에 즉시 반환 (비용 방어)
    if user_record["count"] >= 10:
        return jsonify({
            "fortune": "🏮 도사님의 경고: '이미 하루의 천기를 똥꼬까지 다 보았네! 내일 다시 오시게.'",
            "grade": "접근 제한", 
            "status": "욕심은 금물이오"
        }), 429
    
    try:
        data = request.get_json(silent=True) or {}
        name = data.get('name', '익명')[:10]             # 최대 10자
        birth = data.get('birth', '알 수 없음')[:8]      # 최대 8자 (숫자 8자리)
        birth_time = data.get('birth_time', '모름')[:20]
        gender = data.get('gender', '미정')[:2]
        score = int(data.get('total_score', 0))
        user_question = data.get('question', '오늘의 전반적인 운세')[:80] # 최대 80자

        print(f"[{datetime.now().strftime('%H:%M:%S')}] 🧧 {name}({gender}/{birth}) | 점수: {score} | 고민: {user_question}")

        today_key = datetime.now().strftime("%Y-%m-%d")
        today_display = datetime.now().strftime("%Y년 %m월 %d일")

        grade_info = get_grade_info(score)
        grade = grade_info["grade"]
        status = grade_info["status"]
        secrets = grade_info["secrets"]
        next_grade_info = grade_info["next_grade_info"]

        fortune_key = make_daily_fortune_key(
            name=name,
            birth=birth,
            birth_time=birth_time,
            gender=gender,
            question=user_question,
            today_key=today_key
        )

        if fortune_key not in fortune_cache:
            fortune_cache[fortune_key] = {
                "base_fortune": generate_base_fortune(
                    name=name,
                    birth=birth,
                    birth_time=birth_time,
                    gender=gender,
                    question=user_question,
                    today_display=today_display
                ),
                "bonuses": {}
            }
            save_cache(fortune_cache)

        if grade not in fortune_cache[fortune_key]["bonuses"]:
            bonus_text = generate_grade_bonus(
                name=name,
                grade=grade,
                secrets=secrets,
                question=user_question,
                today_display=today_display
            )
            fortune_cache[fortune_key]["bonuses"][grade] = bonus_text
            save_cache(fortune_cache)

        final_fortune = build_final_fortune(
            base_fortune=fortune_cache[fortune_key]["base_fortune"],
            bonuses=fortune_cache[fortune_key]["bonuses"],
            current_grade=grade,
            next_grade_info=next_grade_info
        )
        
        user_record["count"] += 1

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
    cert = get_toss_cert()
    # 실제 토스에서 요구하는 API 주소 (문서 확인 후 변경)
    url = "https://apps-in-toss-api.toss.im/v1/user-identity" 
    
    try:
        # cert 인자에 아까 만든 파일 경로를 넣어 신분증을 제시합니다.
        response = requests.post(url, cert=cert, json={"some": "data"})
        return response.json()
    except Exception as e:
        # 에러 발생 시 도사님께 보고합니다.
        return jsonify({"error": str(e)}), 500

@app.route('/story.html')
def story():
    return render_template('story.html') # templates 폴더 안에 파일이 있을 경우

@app.route('/history.html')
def history():
    return render_template('history.html') # templates 폴더 안에 파일이 있을 경우

@app.route('/history_2.html')
def history_2():
    return render_template('history_2.html') # templates 폴더 안에 파일이 있을 경우

@app.route('/history_3.html')
def history_3():
    return render_template('history_3.html') # templates 폴더 안에 파일이 있을 경우

@app.route('/biz.html')
def biz():
    return render_template('biz.html') # templates 폴더 안에 파일이 있을 경우

@app.route('/privacy')
def privacy():
    return render_template('privacy.html')

@app.route('/terms')
def terms():
    return render_template('terms.html')

@app.route('/contact')
def contact():
    return render_template('contact.html')

@app.route('/robots.txt')
@app.route('/sitemap.xml')
@app.route('/ads.txt')
def static_from_root():
    # static 폴더 안에 있는 robots.txt 파일을 루트 경로(/)에서 보여줌
    return send_from_directory(app.static_folder, request.path[1:])

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)
