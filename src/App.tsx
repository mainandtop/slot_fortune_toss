import { useState, useEffect, useRef, useMemo } from 'react';
import './App.css';

// 🌟 데이터 구조 (이모지 및 점수 설정)
const SLOT_ITEMS = [
  { symbol: "💎", score: 5000 },
  { symbol: "👑", score: 3500 },
  { symbol: "💰", score: 2000 },
  { symbol: "7️⃣", score: 1000 },
  { symbol: "🍒", score: 500 },
  { symbol: "🍋", score: 300 }
];

const GRADE_LIST = [
  { name: "🌌 우주신", score: 150000, desc: "우주의 섭리를 꿰뚫는 예언 (비책 4개+액운 방지 코드)", color: "#ff00ff" },
  { name: "☀️ 태양신", score: 100000, desc: "눈부신 통찰의 신탁 (비책 3개)", color: "#ff00cc" },
  { name: "🌕 광명성", score: 80000, desc: "어둠을 밝히는 지혜 (비책 2개)", color: "#00ffff" },
  { name: "👑 제왕", score: 70000, desc: "한 나라를 다스리는 영험함 (비책 2개)", color: "#00ffcc" },
  { name: "💎 보석왕", score: 60000, desc: "찬란하게 빛나는 운명의 길 (비책 2개)", color: "var(--gold)" },
  { name: "⚔️ 대장군", score: 40000, desc: "거침없는 결단과 승리의 기운 (비책 1개)", color: "#ff4d4d" },
  { name: "📜 현자", score: 30000, desc: "깊은 사색을 통한 조언 (비책 1개)", color: "#ccff00" },
  { name: "🏹 숙련자", score: 20000, desc: "날카롭고 현실적인 통찰 (비책 1개)", color: "#eee" },
  { name: "👣 평민", score: 10000, desc: "가벼운 일상의 훈수 (비책 없음)", color: "#bbb" },
  { name: "🌑 수행자", score: 0, desc: "단호한 한마디 조언 (비책 없음)", color: "#888" }
];

const WIN_ROUTES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], 
  [0, 3, 6], [1, 4, 7], [2, 5, 8], 
  [0, 4, 8], [2, 4, 6]
];

export default function App() {
  const [view, setView] = useState<'setup' | 'game' | 'loading' | 'fortune' | 'blog'>('setup');
  const [manualOpen, setManualOpen] = useState(false);
  const [scene, setScene] = useState<'welcome' | 'slot' | 'fever' | 'fortune'>('welcome');
  const [userInfo, setUserInfo] = useState(() => {
    const savedInfo = localStorage.getItem('retroDosaUserInfo');
    if (savedInfo) {
      try {
        const parsed = JSON.parse(savedInfo);
        return {
          name: parsed.name || '',
          birth: parsed.birth || '',
          birthTime: parsed.birthTime || '모름',
          gender: parsed.gender || '',
          question: '' // 고민은 매번 다르므로 저장된 것이 있어도 비워둡니다.
        };
      } catch (e) {
        console.error("데이터 불러오기 실패:", e);
      }
    }
    return { name: '', birth: '', birthTime: '모름', gender: '', question: '' };
  });
  const [totalScore, setTotalScore] = useState(0);
  const [anonymousKey, setAnonymousKey] = useState<string>('');
  const [spinCount, setSpinCount] = useState(0);
  const [maxSpins, setMaxSpins] = useState(0);
  const [currentWin, setCurrentWin] = useState(0);
  const [rpsStreak, setRpsStreak] = useState(0);
  const [feverSpinsLeft, setFeverSpinsLeft] = useState(0);
  const [slots, setSlots] = useState<string[]>(Array(9).fill('?'));
  const [winLines, setWinLines] = useState<number[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [rpsModalOpen, setRpsModalOpen] = useState(false);
  const [dosaHand, setDosaHand] = useState('✊');
  const [rpsStatus, setRpsStatus] = useState('자신없으면 그냥 복채부터 챙기시게!');
  const [rpsEffect, setRpsEffect] = useState('');
  const [handBtnsLocked, setHandBtnsLocked] = useState(false);
  const [fortuneData, setFortuneData] = useState({ grade: '', status: '', fortune: '' });
  const [typedText, setTypedText] = useState('');
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const [showUniverse, setShowUniverse] = useState(false);
  const [feverToast, setFeverToast] = useState(false);
  const [isUniverseEnding, setIsUniverseEnding] = useState(false);

  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const slotVideoRef = useRef<HTMLVideoElement>(null);
  const feverVideoRef = useRef<HTMLVideoElement>(null);
  const spinSndRef = useRef<HTMLAudioElement>(null);
  const winSndRef = useRef<HTMLAudioElement>(null);
  const typeSndRef = useRef<HTMLAudioElement>(null);
  const rpsWinSndRef = useRef<HTMLAudioElement>(null);
  const rpsLoseSndRef = useRef<HTMLAudioElement>(null);
  const rpsDrawSndRef = useRef<HTMLAudioElement>(null);
  const feverBgmSndRef = useRef<HTMLAudioElement>(null);
  const universeSndRef = useRef<HTMLAudioElement>(null);
  const coinSndRef = useRef<HTMLAudioElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sysAlert, setSysAlert] = useState<{msg: string, onClose?: () => void} | null>(null);
  const [sysConfirm, setSysConfirm] = useState<{msg: string, onOk: () => void, onCancel: () => void} | null>(null);
  const isFetchingRef = useRef(false);
  const isSpinningRef = useRef(false);

  // ✅ [버그 수정 2] 리렌더링 시 코드가 바뀌지 않도록 useMemo만 남기고 기존 generateLuckyCode 함수 삭제
  const luckyCode = useMemo(() => {
    if (!userInfo.name) return '';
    const nameHex = btoa(encodeURIComponent(userInfo.name)).slice(0, 4).toUpperCase();
    const birthHex = btoa(userInfo.birth || '0000').slice(-4).toUpperCase();
    const dateHex = new Date().getDate().toString(16).toUpperCase().padStart(2, '0');
    const randomHex = Math.floor(Math.random() * 65535).toString(16).toUpperCase().padStart(4, '0');
    return `0x${dateHex}${nameHex} >_ ${birthHex.slice(0,2)}:${birthHex.slice(2,4)}:${randomHex.slice(0,2)}:${randomHex.slice(2,4)}`;
  }, [userInfo.name, userInfo.birth, scene]);

 // 🌟 [추가] 이름, 생년월일, 시간, 성별이 변경될 때마다 기기에 자동 저장합니다.
  useEffect(() => {
    const infoToSave = {
      name: userInfo.name,
      birth: userInfo.birth,
      birthTime: userInfo.birthTime,
      gender: userInfo.gender
    };
    localStorage.setItem('retroDosaUserInfo', JSON.stringify(infoToSave));
  }, [userInfo.name, userInfo.birth, userInfo.birthTime, userInfo.gender]);

  useEffect(() => {
    if (scene === 'slot') {
      slotVideoRef.current?.play().catch(() => {});
      feverVideoRef.current?.pause();
    } else if (scene === 'fever') {
      feverVideoRef.current?.play().catch(() => {});
      slotVideoRef.current?.pause();
    } else {
      slotVideoRef.current?.pause();
      feverVideoRef.current?.pause();
    }
  }, [scene]);

  useEffect(() => {
    async function fetchKey() {
      try {
        const key = await (window as any).toss?.getAnonymousKey(); 
        if (key) setAnonymousKey(key);
      } catch (e) {
        console.error("익명 키 발급 실패:", e);
      }
    }
    fetchKey();
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        feverBgmSndRef.current?.pause();
        spinSndRef.current?.pause();
        typeSndRef.current?.pause();
        universeSndRef.current?.pause();
      } else {
        if (scene === 'fever' && feverSpinsLeft > 0) {
          feverBgmSndRef.current?.play().catch(() => {});
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [scene, feverSpinsLeft]);
  
  const unlockAudio = () => {
     [spinSndRef, winSndRef, typeSndRef, rpsWinSndRef, rpsLoseSndRef, rpsDrawSndRef, feverBgmSndRef, universeSndRef, coinSndRef].forEach(ref => {
       if (ref.current) ref.current.load();
     });
   };

  const playSound = (audioEl: HTMLAudioElement | null) => {
    if (audioEl) {
      audioEl.currentTime = 0;
      audioEl.play().catch(() => {});
    }
  };

  const getGradeName = (score: number) => {
    const grade = GRADE_LIST.find(g => score >= g.score);
    return grade ? grade.name : "🌑 수행자";
  };

  const initGame = () => {
    if (!userInfo.name) return setSysAlert({ msg: "이름을 입력해주세요!" });
    if (!userInfo.gender) return setSysAlert({ msg: "성별(남성/여성)을 선택해주세요!" });
    try { unlockAudio(); } catch (err) { console.warn("오디오 사전 로딩 무시됨", err); }
    setScene('slot');
    setView('game');
    setIsInitializing(true);
    setSpinCount(0);
    setMaxSpins(0);
    playSound(spinSndRef.current);

    let tempCounter = 0;
    const countAnim = setInterval(() => {
      setMaxSpins(Math.floor(Math.random() * 50) + 1);
      if (++tempCounter > 20) {
        clearInterval(countAnim);
        if (spinSndRef.current) spinSndRef.current.pause();
        playSound(winSndRef.current);
        setMaxSpins(25);
        setIsInitializing(false);
      }
    }, 50);
  };

  const buySpin = () => {
    if (totalScore >= 500) {
      setTotalScore(prev => prev - 500); 
      setMaxSpins(prev => prev + 1);     
      playSound(coinSndRef.current);
    } else {
      setSysAlert({ msg: "복채가 부족하구려! (500P 필요)" });
    }
  };

  const spin = () => {
    if (isInitializing || isSpinning || isSpinningRef.current) return;

    if (spinCount >= maxSpins) {
      if (totalScore >= 500) {
        setSysConfirm({
          msg: `모든 기회를 소모했네!\n\n[확인] 기회 1회 추가 (500P 차감)\n[취소] 지금 바로 운세 결과 보기`,
          // ✅ [버그 수정 3] buySpin(true)에 남아있던 true 파라미터 삭제
          onOk: () => { buySpin(); },
          onCancel: () => { triggerGetFortune(); }
        });
        return;
      } else {
        setSysAlert({
          msg: "기회를 모두 소진했고, 추가할 복채도 부족하구려.\n이제 천기를 확인하러 가세나!",
          onClose: () => { triggerGetFortune(); }
        });
        return;
      }
    }

    isSpinningRef.current = true;
    playSound(spinSndRef.current);
    setIsSpinning(true);
    setWinLines([]);

    let finalIndices: number[] = [];
    if (feverSpinsLeft > 0) {
      finalIndices = Array(9).fill(-1);
      const luckyRoute = WIN_ROUTES[Math.floor(Math.random() * WIN_ROUTES.length)];
      const luckySymbolIdx = Math.floor(Math.random() * SLOT_ITEMS.length);
      luckyRoute.forEach(slotIdx => { finalIndices[slotIdx] = luckySymbolIdx; });
      for(let i=0; i<9; i++) {
        if(finalIndices[i] === -1) finalIndices[i] = Math.floor(Math.random() * SLOT_ITEMS.length);
      }
    } else {
      const isJackpot = Math.random() < 0.001;
      const luckyIdx = Math.floor(Math.random() * SLOT_ITEMS.length);
      finalIndices = Array.from({ length: 9 }, () => isJackpot ? luckyIdx : Math.floor(Math.random() * SLOT_ITEMS.length));
    }

    const stopFlags = Array(9).fill(false);
    const shuffle = setInterval(() => {
      slotRefs.current.forEach((el, i) => {
        if (el && !stopFlags[i]) el.innerText = SLOT_ITEMS[Math.floor(Math.random() * SLOT_ITEMS.length)].symbol;
      });
    }, 60);

    finalIndices.forEach((itemIdx, i) => {
      setTimeout(() => {
        stopFlags[i] = true;
        if (slotRefs.current[i]) slotRefs.current[i]!.innerText = SLOT_ITEMS[itemIdx].symbol;
      }, 300 + (i * 150));
    });

    setTimeout(() => {
      clearInterval(shuffle);
      if (spinSndRef.current) spinSndRef.current.pause();
      setSlots(finalIndices.map(idx => SLOT_ITEMS[idx].symbol));
      
      let s = 0;
      const newWinLines: number[] = [];
      WIN_ROUTES.forEach(l => {
        if (finalIndices[l[0]] === finalIndices[l[1]] && finalIndices[l[1]] === finalIndices[l[2]]) {
          s += SLOT_ITEMS[finalIndices[l[0]]].score;
          newWinLines.push(...l);
        }
      });

      if (finalIndices.every(val => val === finalIndices[0])) {
        s += 50000;
        newWinLines.push(0,1,2,3,4,5,6,7,8);
        setTimeout(() => setSysAlert({ msg: "🎊 올빙고 보너스 50,000P 획득! 🎊" }), 100);
      }

      setWinLines([...new Set(newWinLines)]);

      if (feverSpinsLeft === 0 && Math.random() < 0.05) {
        setFeverSpinsLeft(5);
        setScene('fever');
        playSound(feverBgmSndRef.current);
        setFeverToast(true);
        setTimeout(() => setFeverToast(false), 2000);
      }

      const prospectiveTotal = totalScore + s;

      if (prospectiveTotal >= 150000 && totalScore < 150000) {
        setTotalScore(prospectiveTotal);
        setCurrentWin(0);
        setRpsStreak(0);
        triggerUniverseEndingAnimation(prospectiveTotal);
      } else if (s > 0) {
        playSound(winSndRef.current);
        setCurrentWin(s);
        setDosaHand('✊');
        setRpsStatus('자신없으면 그냥 복채부터 챙기시게!');
        setRpsEffect('');
        setRpsModalOpen(true);
        setHandBtnsLocked(false);
      } else {
        processNextTurn();
      }
      isSpinningRef.current = false;
      setIsSpinning(false);
    }, 300 + (8 * 150) + 100);
  };

  const processNextTurn = () => {
    setSpinCount(prev => prev + 1);
    if (feverSpinsLeft > 0) {
      setFeverSpinsLeft(prev => {
        if (prev - 1 === 0) {
          setScene('slot');
          if (feverBgmSndRef.current) feverBgmSndRef.current.pause();
        }
        return prev - 1;
      });
    }
  };

  const finalFight = (userHand: string) => {
    if (handBtnsLocked) return;
    setHandBtnsLocked(true);
    setRpsEffect('');
    setRpsStatus("도사가 패를 섞는 중...");
    const hands = ['✌️', '✊', '✋'];
    let spinIdx = 0;
    const anim = setInterval(() => setDosaHand(hands[spinIdx++ % 3]), 80);

    setTimeout(() => {
      clearInterval(anim);
      const ai = hands[Math.floor(Math.random() * 3)];
      setDosaHand(ai);
      if (userHand === ai) {
        setRpsStatus(`⚖️ 무승부!`);
        setRpsEffect('rps-draw-effect');
        playSound(rpsDrawSndRef.current);
        setHandBtnsLocked(false);
      } else if ((userHand === '✌️' && ai === '✋') || (userHand === '✊' && ai === '✌️') || (userHand === '✋' && ai === '✊')) {
        setRpsStreak(prev => prev + 1);
        setCurrentWin(prev => Math.floor(prev * (1.9 + (rpsStreak + 1) * 0.1)));
        setRpsStatus(`🎉 승리!`);
        setRpsEffect('rps-win-effect');
        playSound(rpsWinSndRef.current);
        setHandBtnsLocked(false);
      } else {
        setRpsStreak(0);
        setCurrentWin(0);
        setRpsStatus(`💀 패배!`);
        setRpsEffect('rps-lose-effect');
        playSound(rpsLoseSndRef.current);
        setTimeout(() => { setRpsModalOpen(false); processNextTurn(); }, 1000);
      }
    }, 1000);
  };

  const stopAndCollect = () => {
    const newTotal = totalScore + currentWin;
    setTotalScore(newTotal);
    
    if (newTotal >= 150000 && totalScore < 150000) {
      setRpsModalOpen(false);
      setCurrentWin(0);
      setRpsStreak(0);
      triggerUniverseEndingAnimation(newTotal); 
    } else {
      setCurrentWin(0);
      setRpsStreak(0);
      setRpsModalOpen(false);
      processNextTurn();
    }
  };

  const triggerUniverseEndingAnimation = (finalScore: number) => {
    setIsUniverseEnding(true); 
    if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 1000]);

    if (universeSndRef.current) {
      universeSndRef.current.currentTime = 0;
      universeSndRef.current.play().catch(() => {});
    }
    setShowUniverse(true);
    setTimeout(() => {
      setShowUniverse(false);
      triggerGetFortune(finalScore);
    }, 5000);
  };

  const triggerGetFortune = async (scoreToUse?: number) => {
     if (isFetchingRef.current) return;
     isFetchingRef.current = true;
     
    setFeverSpinsLeft(0); 
    if (feverBgmSndRef.current) {
        feverBgmSndRef.current.pause();
        feverBgmSndRef.current.currentTime = 0;
    }
    setScene('fortune');

    setView('loading');
    const finalScore = scoreToUse !== undefined ? scoreToUse : totalScore;
    try {
      const response = await fetch('https://slotfortunetoss-production.up.railway.app/get_fortune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: userInfo.name,
          birth: userInfo.birth,
          birth_time: userInfo.birthTime,
          gender: userInfo.gender,
          total_score: finalScore,
          question: userInfo.question,
          anonymous_key: anonymousKey
        }),
      });

      if (response.status === 429) {
          const data = await response.json();
          setFortuneData(data);
          setView('fortune');
          setScene('fortune');
          typeWriterEffect(data.fortune);
          return;
      }

      if (!response.ok) throw new Error('서버 응답 에러');
      const data = await response.json();

      setFortuneData({ grade: data.grade, status: data.status, fortune: data.fortune });
      setView('fortune');
      setScene('fortune');
      typeWriterEffect(data.fortune);

    } catch (error) {
      console.error("통신 에러:", error);
      const fallbackGrade = GRADE_LIST.find(g => (scoreToUse || totalScore) >= g.score) || GRADE_LIST[GRADE_LIST.length - 1];
      const msg = `[ ${userInfo.name} 님의 운명 기록 ]\n\n지금 신당 기운이 불안정하네. 서버 확인 요망!`;
      setFortuneData({ grade: fallbackGrade.name, status: '접신 실패', fortune: msg });
      setView('fortune');
      setScene('fortune');
      typeWriterEffect(msg);
    } finally {
      isFetchingRef.current = false;
    }
  };

  const typeWriterEffect = (text: string) => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    let idx = 0;
    setTypedText('');
    setIsTypingComplete(false); 
    playSound(typeSndRef.current);
    const type = () => {
      if (idx < text.length) {
        setTypedText(text.substring(0, ++idx));
        typingTimeoutRef.current = setTimeout(type, 35);
      } else {
        if (typeSndRef.current) typeSndRef.current.pause();
        setIsTypingComplete(true); 
      }
    };
    type();
  };

  const resetGame = () => {
    setView('setup');
    setScene('welcome');
    setTotalScore(0);
    setSpinCount(0);
    setMaxSpins(0);
    setCurrentWin(0);
    setRpsStreak(0);
    setFeverSpinsLeft(0);
    setSlots(Array(9).fill('?'));
    setWinLines([]);
    setFortuneData({ grade: '', status: '', fortune: '' });
    setTypedText('');
    setIsTypingComplete(false);
    setSysAlert(null);
    setSysConfirm(null);
    setShowUniverse(false);
    setIsUniverseEnding(false);

    setUserInfo(prev => ({ ...prev, question: '' }));

    [spinSndRef, winSndRef, typeSndRef, rpsWinSndRef, rpsLoseSndRef, rpsDrawSndRef, feverBgmSndRef, universeSndRef, coinSndRef].forEach(ref => {
      if (ref.current) {
        ref.current.pause();
        ref.current.currentTime = 0;
      }
    });
  };
  
  return (
    <>
      <div style={{ display: 'none' }}>
        <audio ref={spinSndRef} src="/static/sounds/spin.mp3" preload="auto" loop />
        <audio ref={winSndRef} src="/static/sounds/win.mp3" preload="auto" />
        <audio ref={coinSndRef} src="/static/sounds/coin.mp3" preload="auto" />
        <audio ref={typeSndRef} src="/static/sounds/typing.mp3" preload="auto" loop />
        <audio ref={rpsWinSndRef} src="/static/sounds/rps-win.mp3" preload="auto" />
        <audio ref={rpsLoseSndRef} src="/static/sounds/rps-lose.mp3" preload="auto" />
        <audio ref={rpsDrawSndRef} src="/static/sounds/rps-draw.mp3" preload="auto" />
        <audio ref={feverBgmSndRef} src="/static/sounds/fever-bgm.mp3" preload="auto" loop />
        <audio ref={universeSndRef} src="/static/sounds/universe-ending.mp3" preload="auto" />
      </div>

      <div className={`container ${feverSpinsLeft > 0 ? 'fever-mode' : ''}`}>
        <div className="scene-media">
          <img src="/static/images/scene_welcome.jpg" alt="장면" className={scene === 'welcome' || scene === 'fortune' ? 'active' : ''} />
          <video src="/static/videos/scene_slot.mp4" muted playsInline loop className={scene === 'slot' ? 'active' : ''} ref={slotVideoRef}></video>
          <video src="/static/videos/fever_dosa.mp4" muted playsInline loop className={scene === 'fever' ? 'active' : ''} ref={feverVideoRef}></video>
        </div>

        {view === 'setup' && (
          <div id="setup-view">
            <input type="text" maxLength={10} placeholder="이름을 입력하세요" value={userInfo.name} onChange={e => setUserInfo({...userInfo, name: e.target.value})} />
            <input type="number" placeholder="생년월일 8자리" value={userInfo.birth} onChange={e => setUserInfo({...userInfo, birth: e.target.value.slice(0,8)})} />
            <select value={userInfo.birthTime} onChange={e => setUserInfo({...userInfo, birthTime: e.target.value})}>
                <option value="모름">태어난 시간 (모름/평시)</option>
                <option value="자시 (23:30~01:29)">자시 (23:30~01:29)</option>
                <option value="축시 (01:30~03:29)">축시 (01:30~03:29)</option>
                <option value="인시 (03:30~05:29)">인시 (03:30~05:29)</option>
                <option value="묘시 (05:30~07:29)">묘시 (05:30~07:29)</option>
                <option value="진시 (07:30~09:29)">진시 (07:30~09:29)</option>
                <option value="사시 (09:30~11:29)">사시 (09:30~11:29)</option>
                <option value="오시 (11:30~13:29)">오시 (11:30~13:29)</option>
                <option value="미시 (13:30~15:29)">미시 (13:30~15:29)</option>
                <option value="신시 (15:30~17:29)">신시 (15:30~17:29)</option>
                <option value="유시 (17:30~19:29)">유시 (17:30~19:29)</option>
                <option value="술시 (19:30~21:29)">술시 (19:30~21:29)</option>
                <option value="해시 (21:30~23:29)">해시 (21:30~23:29)</option>
            </select>
            <textarea rows={3} maxLength={80} placeholder="오늘의 고민을 적어주세요" value={userInfo.question} onChange={e => setUserInfo({...userInfo, question: e.target.value})} />
            <div style={{ margin: '15px 0', display: 'flex', gap: '10px' }}>
              <button className={`gender-btn ${userInfo.gender === '남' ? 'active' : ''}`} onClick={() => setUserInfo({...userInfo, gender: '남'})}>남성</button>
              <button className={`gender-btn ${userInfo.gender === '여' ? 'active' : ''}`} onClick={() => setUserInfo({...userInfo, gender: '여'})}>여성</button>
            </div>
            <button onClick={initGame} className="btn">✨ 운세 돌리기 ✨</button>
          </div>
        )}

        {view === 'game' && (
          <div id="game-view">
            <div className="grid">{slots.map((s, i) => (<div key={i} ref={(el) => { slotRefs.current[i] = el; }} className={`reel ${winLines.includes(i) ? 'win-line' : ''}`}>{s}</div>))}</div>
            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', background: 'rgba(0,0,0,0.85)', border: '2px solid var(--gold)', borderRadius: '15px', padding: '15px 5px', marginBottom: '20px' }}>
              <div style={{ textAlign: 'center', flex: 1 }}><div style={{ fontSize: '0.85em', color: '#bbb' }}>누적 복채</div><div style={{ fontSize: '1.4em', color: 'var(--gold)', fontWeight: '900' }}>{totalScore.toLocaleString()}</div></div>
              <div style={{ width: '1px', height: '40px', background: '#444' }}></div>
              <div style={{ textAlign: 'center', flex: 1.2 }}><div style={{ fontSize: '0.85em', color: '#bbb' }}>현재 등급</div><div style={{ fontSize: '1.3em', color: 'var(--neon)', fontWeight: 'bold' }}>{getGradeName(totalScore)}</div></div>
              <div style={{ width: '1px', height: '40px', background: '#444' }}></div>
              <div style={{ textAlign: 'center', flex: 1 }}><div style={{ fontSize: '0.85em', color: '#bbb' }}>남은 기회</div><div style={{ fontSize: '1.4em', color: '#fff', fontWeight: '900' }}>{isInitializing ? '-' : maxSpins - spinCount}</div></div>
            </div>
            <button className="btn" onClick={spin} disabled={isSpinning || isInitializing || isUniverseEnding}>🎰 슬롯 돌리기!</button>
            <button 
               className="buy-btn" 
               onClick={() => buySpin()}
               disabled={totalScore < 500}
               style={{ opacity: totalScore < 500 ? 0.5 : 1 }}
             >
               {totalScore >= 1000 
               ? `➕ 기회 1회 추가 (1000P)` 
               : "🚫 기회 1회 추가 (100P 필요)"}
             </button>
          </div>
        )}

        {(view === 'setup' || view === 'game') && (
          <div style={{ width: '100%', maxWidth: '600px', margin: '40px auto 40px auto', padding: '20px', background: '#151515', borderRadius: '20px', border: '1px solid #333', boxSizing: 'border-box', textAlign: 'center' }}>
            <h3 style={{ color: 'var(--gold)', fontSize: '18px', marginBottom: '15px' }}>📜 도사의 등급별 신통력</h3>
            <div style={{ fontSize: '13px', color: '#ccc', lineHeight: '1.6', marginBottom: '20px' }}>
              누적된 복채(점수)가 높을수록 도사의 신통력이 상승합니다.<br />
              등급이 높을수록 더욱 날카로운 예언 능력과 함께<br />
              운명을 바꿀 수도 있는 <span style={{ color: 'var(--neon)', fontWeight: 'bold' }}>'비책(솔루션)'</span>을 전수받을 수 있습니다.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {GRADE_LIST.map((g, i) => (
                <div key={i} className="grade-item" style={{ borderLeftColor: g.color, background: 'rgba(255,255,255,0.03)', padding: '10px' }}>
                  <b style={{ color: g.color }}>{g.name} ({g.score.toLocaleString()}~)</b><br />
                  <span style={{ fontSize: '12px', color: '#888' }}>{g.desc}</span>
                </div>
              ))}
            </div>
            <h3 style={{ color: 'var(--neon)', fontSize: '16px', marginTop: '30px', marginBottom: '15px' }}>💰 심볼별 복채 점수</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '12px' }}>
              {SLOT_ITEMS.map((item, i) => (
                <div key={i} style={{ fontSize: '15px', color: '#fff', fontWeight: 'bold' }}>
                  {item.symbol} <span style={{ color: 'var(--gold)' }}>{item.score.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <p style={{ color: 'var(--gold)', fontSize: '12px', marginTop: '15px', fontWeight: 'bold' }}>🌈 9개 칸 올빙고 시 보너스 +50,000P!</p>
          </div>
        )}

        {view === 'loading' && <div id="loading-view" style={{ padding: '40px' }}><div style={{ fontSize: '50px', animation: 'rotate 2s linear infinite' }}>🔮</div><h2 style={{ color: 'var(--gold)' }}>천기를 읽는 중...</h2></div>}

        {view === 'fortune' && (
          <div id="fortune-res" style={{ textAlign: 'left', marginTop: '20px' }}>
            <div id="fortune-card" className="fortune-card-capture" style={{ border: `4px solid ${fortuneData.grade.includes("우주") ? "#ff00ff" : "var(--gold)"}` }}>
              <h2 style={{ color: "var(--gold)", textAlign: "center" }}>🔮 예언: [{fortuneData.grade}]</h2>
              <div style={{ textAlign: "center", color: "#ffd700", fontWeight: "bold" }}>{fortuneData.status}</div>
              <p style={{ color: "#efefef", whiteSpace: "pre-line", lineHeight: '1.8' }}>{typedText}</p>

              {fortuneData.grade.includes("우주") && isTypingComplete && (
                <div style={{ 
                  margin: '30px auto', 
                  padding: '25px 15px', 
                  background: '#050a05', 
                  border: '2px solid #00ff00', 
                  borderRadius: '4px',
                  boxShadow: '0 0 25px rgba(0, 255, 0, 0.4)', 
                  fontFamily: '"Courier New", Courier, monospace', 
                  textAlign: 'center',
                  position: 'relative',
                  color: '#00ff00'
                }}>
                  <div style={{ fontSize: '0.65em', marginBottom: '10px', textAlign: 'left', borderBottom: '1px solid rgba(0,255,0,0.3)', paddingBottom: '5px' }}>
                    SYNC_USER: {userInfo.name.split('').map((c: string) => c.charCodeAt(0).toString(16)).join('').slice(0,8).toUpperCase()}...<br/>
                    SYNC_DATE: {new Date().toISOString().split('T')[0]}<br/>
                    STATUS: ENCRYPTED_DESTINY_KEY_ACTIVE
                  </div>

                  <div style={{ 
                    color: '#fff', 
                    fontSize: '1.3em', 
                    fontWeight: 'bold', 
                    letterSpacing: '1px',
                    margin: '10px 0',
                    textShadow: '0 0 10px #fff, 0 0 20px #00ff00'
                  }}>
                    {/* ✅ [버그 수정 2] 올바른 변수 호출 */}
                    {luckyCode}
                  </div>

                  <div style={{ 
                    marginTop: '20px', 
                    color: '#00ff00', 
                    fontSize: '0.9rem', 
                    lineHeight: '1.6', 
                    fontWeight: 'bold',
                    padding: '15px 5px',
                    borderTop: '1px solid #00ff00',
                    background: 'rgba(0, 255, 0, 0.05)'
                  }}>
                    "이 코드를 캡쳐해서 가지고 있으면<br/>
                     오늘 하루 행운이 찾아오거나 액운을 피할 수 있을 것이네."
                  </div>
                </div>
              )}
                
              <div className="fortune-card-footer">☯️ 슬롯머신 레트로 도사</div>
            </div>
            <button onClick={resetGame} className="btn" style={{ width: '100%', marginTop: '20px' }}>다시 하기</button>
          </div>
        )}
      </div>

      {rpsModalOpen && (
        <div className="modal-bg">
          <div className="modal-content" style={{ padding: '30px' }}>
            <h2 style={{ color: 'var(--gold)' }}>🔥 한판 승부! 🔥</h2>
            <div className={`dosa-hand-style ${rpsEffect}`} style={{ fontSize: '80px', margin: '20px auto', border: '4px solid var(--neon)', borderRadius: '50%', width: '120px', height: '120px', lineHeight: '120px', background: '#000' }}>{dosaHand}</div>
            <p style={{ fontSize: '1.1em', fontWeight: 'bold', color: '#fff' }}>{rpsStatus}</p>
            <p>획득한 복채: <span style={{ color: 'var(--neon)', fontSize: '1.3em', fontWeight: 'bold' }}>{currentWin.toLocaleString()}</span></p>
            <p style={{ color: '#ffd700', fontWeight: 'bold', margin: '15px 0' }}>연승: {rpsStreak} | 다음 승리: {(1.9 + (rpsStreak + 1) * 0.1).toFixed(1).replace('.0', '')}배</p>
            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', margin: '20px 0' }}>
              {['✌️', '✊', '✋'].map(h => (<button key={h} onClick={() => finalFight(h)} disabled={handBtnsLocked} style={{ fontSize: '40px', background: 'none', border: '1px solid #444', borderRadius: '15px', padding: '10px' }}>{h}</button>))}
            </div>
            <button id="collect-btn" onClick={stopAndCollect}>💰 복채 챙기기</button>
          </div>
        </div>
      )}

      {manualOpen && (
        <div className="modal-bg" onClick={() => setManualOpen(false)}>
          <div className="modal-content">
            <button className="close-btn-modal" onClick={() => setManualOpen(false)}>&times;</button>
            <h2>🔮 이용법</h2>
            <p>1. 슬롯을 돌려 복채(점수)를 모으고 등급을 올리게나!</p>
            <p>2. 초반에는 무리하게 도전하기 보다는 기본 복채만 차곡차곡 모으는 것도 방법이네.</p>
            <p>3. 점수에 따라 운세 내용도 달라지니 높은 등급을 목표로 하시게.</p>
            <button className="ok-btn" onClick={() => setManualOpen(false)}>알겠소 도사!</button>
          </div>
        </div>
      )}

      {showUniverse && <div className="universe-overlay"><div className="universe-text">🌌 우주신 강림 🌌</div></div>}

      {feverToast && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#ff00ff', fontSize: '2.5rem', fontWeight: 'bold', textShadow: '0 0 20px #fff, 0 0 30px #ff00ff', zIndex: 9999, pointerEvents: 'none', textAlign: 'center', lineHeight: 1.2, animation: 'fadeOutUpToast 2s forwards', whiteSpace: 'nowrap' }}>
          <style>{`@keyframes fadeOutUpToast { 0% { opacity: 0; transform: translate(-50%, -30%); } 20% { opacity: 1; transform: translate(-50%, -50%); } 80% { opacity: 1; transform: translate(-50%, -50%); } 100% { opacity: 0; transform: translate(-50%, -70%); } }`}</style>
          🔥 피버 타임 강림 🔥<br/><span style={{ fontSize: '1.5rem', color: '#00ffff', textShadow: '0 0 15px #00ffff' }}>하늘이 감동하여 무조건 당첨됩니다!</span>
        </div>
      )}

      {sysAlert && (
        <div className="modal-bg" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ padding: '30px', border: '2px solid var(--gold)', maxWidth: '400px' }}>
            <p style={{ whiteSpace: 'pre-line', fontSize: '1.2em', marginBottom: '25px', color: '#fff', fontWeight: 'bold' }}>{sysAlert.msg}</p>
            <button className="btn" onClick={() => {
              if (sysAlert.onClose) sysAlert.onClose();
              setSysAlert(null); 
            }}>알겠소!</button>
          </div>
        </div>
      )}

      {sysConfirm && (
        <div className="modal-bg" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ padding: '30px', border: '2px solid var(--neon)', maxWidth: '400px' }}>
            <p style={{ whiteSpace: 'pre-line', fontSize: '1.2em', marginBottom: '25px', color: '#fff', fontWeight: 'bold' }}>{sysConfirm.msg}</p>
            <div style={{ display: 'flex', gap: '15px' }}>
              <button className="buy-btn" onClick={() => { sysConfirm.onOk(); setSysConfirm(null); }} style={{ flex: 1 }}>확인</button>
              <button className="btn" onClick={() => { sysConfirm.onCancel(); setSysConfirm(null); }} style={{ flex: 1, background: '#444', border: '1px solid #666' }}>취소</button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}