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
from pathlib import Path
from collections import defaultdict

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

SCORES = {
    "💎": 5000, "👑": 3500, "💰": 2000, 
    "7️⃣": 1000, "🍒": 500, "🍋": 300
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
    if score >= 150000:
        return {"grade": "🌌 우주신", "status": "15만 점 돌파! 우주의 주인이 되셨구려!", "secrets": 4, "next_grade_info": None}
    elif score >= 100000:
        return {"grade": "☀️ 태양신", "status": "온 세상을 밝히는 강렬한 태양의 기운!", "secrets": 3, "next_grade_info": "🌌 우주신"}
    elif score >= 80000:
        return {"grade": "🌕 광명성", "status": "어둠 속에서도 빛을 발하는 비범한 운명!", "secrets": 2, "next_grade_info": "☀️ 태양신"}
    elif score >= 70000:
        return {"grade": "👑 제왕", "status": "만인을 발아래 두는 제왕의 격이로다.", "secrets": 2, "next_grade_info": "🌕 광명성"}
    elif score >= 60000:
        return {"grade": "💎 보석왕", "status": "금은보화가 창고에 쌓이는 형국이로다.", "secrets": 2, "next_grade_info": "👑 제왕"}
    elif score >= 40000:
        return {"grade": "⚔️ 대장군", "status": "용맹한 기운이 하늘을 찌르는구나!", "secrets": 1, "next_grade_info": "💎 보석왕"}
    elif score >= 30000:
        return {"grade": "📜 현자", "status": "지혜가 샘솟고 귀인이 길을 안내하리라.", "secrets": 1, "next_grade_info": "⚔️ 대장군"}
    elif score >= 20000:
        return {"grade": "🏹 숙련자", "status": "기운이 무르익었으니 조금만 더 힘내시오.", "secrets": 1, "next_grade_info": "📜 현자"}
    elif score >= 10000:
        return {"grade": "👣 평민", "status": "성실함이 복이 되어 돌아오는 날이로다.", "secrets": 0, "next_grade_info": "🏹 숙련자"}
    else:
        return {"grade": "🌑 수행자", "status": "지금은 씨앗을 심는 시기니 인내하거라.", "secrets": 0, "next_grade_info": "👣 평민"}

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

# 🌟 수정: 프롬프트 말투 일관성 강화, 비책 개수 명확화, 섹션 해금 조건 조정
def generate_full_fortune(name, birth, birth_time, gender, question, grade, secrets, today_display, next_grade_info):
    prompt = f"""
너는 수천 년간 사주 명리학과 인간 심리를 통달한 레트로 도사다.
오늘은 {today_display}.

[손님 정보]
이름: {name}
생년월일: {birth}
태어난 시간: {birth_time}
성별: {gender}
고민: {question}
현재 달성한 운세 등급: {grade}

────────────────────

[절대 규칙]
1. 반드시 '오늘 하루 전체 운세'만 다룰 것. (❌ 오전/오후/저녁/시간대 구분 절대 금지)
2. 문체는 처음부터 끝까지 '레트로 도사'의 일관된 말투를 유지할 것:
   - "애햄!", "허허", "그르나", "조심하시게", "명심하거라" 등 사극풍/도사풍 어미 사용
   - 현대적인 단어(스트레스, 멘탈, 투자 등)를 쓰더라도 어미는 반드시 도사 말투로 마무리할 것
   - 절대 "~습니다", "~해요", "~입니다" 등의 평범한 존댓말을 쓰지 말 것
3. 현실적인 공감 + 실제 도움이 되는 조언 필수
4. 고민이 있다면 [도사의 조언]에서 핵심 해결 방향을 제시할 것
5. 절대 등급을 호칭처럼 부르지 말 것 (❌ 우주신님, 태양신님 금지)
6. 등급별 글자 수 및 문장 수 제한 (매우 엄격하게 지킬 것):
   - 🌑 수행자: 각 항목당 딱 1문장. (가장 야박하고 짧게, 전체 150자 이내)
   - 👣 평민: 각 항목당 1~2문장. (건조하고 짧게, 전체 250자 이내)
   - 🏹 숙련자: 각 항목당 2문장. (평범하고 무난한 운세, 전체 350자 이내)
   - 📜 현자: 각 항목당 2~3문장. (조금 더 신경 쓴 조언, 전체 450자 이내)
   - ⚔️ 대장군: 각 항목당 3문장. (힘차고 구체적인 내용, 전체 600자 이내)
   - 💎 보석왕: 각 항목당 3~4문장. (풍성하고 여유로운 조언, 전체 700자 이내)
   - 👑 제왕: 각 항목당 4문장. (제왕의 격에 맞게 매우 상세하고 깊이 있게, 전체 900자 이내)
   - 🌕 광명성: 각 항목당 4~5문장. (숨은 이치까지 통찰하는 긴 분량, 전체 1100자 이내)
   - ☀️ 태양신: 각 항목당 5문장. (압도적인 분량과 긍정적인 기운, 전체 1300자 이내)
   - 🌌 우주신: 각 항목당 5~6문장 이상. (도사가 해줄 수 있는 모든 말을 쏟아낼 것, 전체 2000자 이내로 가장 길게 작성)
7. 반드시 아래 주어진 [출력 형식]의 헤딩(대괄호)들만 사용하여 그 안의 내용을 채울 것.

────────────────────

[출력 형식]

애햄! {name} 손님 어서 오게나. 오늘의 천기를 읽어보니...

[오늘의 총운]
(전체 흐름 요약)

[금전운]
(돈 흐름 / 소비 / 기회)

[인간관계운]
(사람, 갈등, 기회)

[건강운]
(컨디션, 주의점)

[도사의 조언]
(고민 해결 중심, 현실적인 방향. 단, 고민이 없을시 오늘의 운세 기준으로 작성)
"""

    if grade not in ["🌑 수행자", "👣 평민", "🏹 숙련자", "📜 현자"]:
        prompt += f"""
[🔥 해금된 천기]
(오늘 숨겨진 핵심 흐름)
"""

    if grade in ["👑 제왕", "🌕 광명성", "☀️ 태양신", "🌌 우주신"]:
        prompt += """
[🔥 오늘 잡아야 할 기회]
(구체적인 행동)
"""

    if grade in ["🌕 광명성", "☀️ 태양신", "🌌 우주신"]:
        prompt += """
[🔥 오늘 반드시 피해야 할 함정]
(실수 방지 포인트)
"""

    if secrets > 0:
        secret_format = "\n".join([f"{i+1}. (비책 내용)" for i in range(secrets)])
        prompt += f"""
[🔥 도사의 특별 비책]
{secret_format}
(※ 경고: 비책은 반드시 위 번호에 맞춰 정확히 {secrets}개만 작성할 것. 절대 추가하지 말 것.)
"""

    if next_grade_info:
        prompt += f"""
[마무리 인사]
(반드시 마지막 줄에는 "자네가 복채를 조금만 더 모아 [{next_grade_info}] 등급이 되었더라면 더 높은 천기를 알려주었을 텐데 참으로 아쉽구려!"라는 뉘앙스로 아쉬움을 남기며 유혹할 것.)
"""

    return call_gemini(prompt)

@app.route('/')
def index():
    return jsonify({
        "status": "online",
        "message": "레트로 도사 API 서버가 정상 동작 중입니다!",
        "version": "1.0.0"
    })

@app.route('/get_fortune', methods=['POST'])
def get_fortune():
    global ip_request_counts
    
    data = request.get_json(silent=True) or {}
    anon_key = data.get('anonymous_key')
    user_ip = request.headers.get('X-Forwarded-For', request.remote_addr).split(',')[0]
    user_id = anon_key if anon_key else user_ip
    
    today_key = datetime.now().strftime("%Y-%m-%d")
    
    user_record = ip_request_counts[user_id]
    if user_record["date"] != today_key:
        user_record["count"] = 0
        user_record["date"] = today_key

    if user_record["count"] >= 10:
        return jsonify({
            "fortune": "🏮 도사님의 경고: '이미 하루의 천기를 똥꼬까지 다 보았네! 내일 다시 오시게.'",
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

        print(f"[{datetime.now().strftime('%H:%M:%S')}] 🧧 {name} | 점수: {score} | 고민: {user_question} | ID: {user_id[:10]}...")

        today_display = datetime.now().strftime("%Y년 %m월 %d일")

        grade_info = get_grade_info(score)
        grade = grade_info["grade"]
        status = grade_info["status"]
        secrets = grade_info["secrets"]
        next_grade_info = grade_info["next_grade_info"]

        fortune_key = make_daily_fortune_key(
            name=name, birth=birth, birth_time=birth_time, 
            gender=gender, question=user_question, grade=grade, today_key=today_key
        )

        if fortune_key not in fortune_cache:
            fortune_cache[fortune_key] = generate_full_fortune(
                name=name, birth=birth, birth_time=birth_time, 
                gender=gender, question=user_question, grade=grade, 
                secrets=secrets, today_display=today_display, next_grade_info=next_grade_info
            )
            save_cache(fortune_cache)

        final_fortune = fortune_cache[fortune_key]
        
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
