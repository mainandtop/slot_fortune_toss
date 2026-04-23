import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getTossAppVersion, loadFullScreenAd, showFullScreenAd, TossAds, type TossAdsAttachBannerOptions, appLogin, grantPromotionReward } from '@apps-in-toss/web-framework';
import './App.css';

// 🌟 데이터 구조 (이모지 및 점수 설정)
const SLOT_ITEMS = [
  { symbol: "💎", score: 3000 },
  { symbol: "👑", score: 2000 },
  { symbol: "💰", score: 1000 },
  { symbol: "7️⃣", score: 700 },
  { symbol: "🍒", score: 300 },
  { symbol: "🍋", score: 100 }
];

const GRADE_LIST = [
  { name: "🌌 우주신", score: 100000, desc: "우주의 섭리를 꿰뚫는 예언 (포인트 5)", color: "#ff00ff", reward: 5 },
  { name: "☀️ 태양신", score: 60000, desc: "눈부신 통찰의 신탁 (포인트 4)", color: "#ff00cc", reward: 4 },
  { name: "🌕 광명성", score: 30000, desc: "어둠을 밝히는 지혜 (포인트 3)", color: "#00ffff", reward: 3 },
  { name: "👑 제왕", score: 10000, desc: "한 나라를 다스리는 영험함 (포인트 2)", color: "#00ffcc", reward: 2 },
  { name: "🌑 수행자", score: 0, desc: "단호한 한마디 조언 (포인트 1)", color: "#888", reward: 1 }
];

const WIN_ROUTES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], 
  [0, 3, 6], [1, 4, 7], [2, 5, 8], 
  [0, 4, 8], [2, 4, 6]
];

// 🌟 배너 광고 초기화 및 부착을 위한 커스텀 훅 (공식 가이드 적용)
function useTossBanner() {
  const [isInitialized, setIsInitialized] = useState(false);
  useEffect(() => {
    if (isInitialized) return;
    if (!TossAds.initialize.isSupported || !TossAds.initialize.isSupported()) {
      console.warn('배너 광고 기능을 사용할 수 없습니다.');
      return;
    }
    TossAds.initialize({
      callbacks: {
        onInitialized: () => setIsInitialized(true),
        onInitializationFailed: (error) => {
          console.error('Toss Ads SDK initialization failed:', error);
        },
      },
    });
  }, [isInitialized]);

  const attachBanner = useCallback(
    (adGroupId: string, element: HTMLElement, options?: TossAdsAttachBannerOptions) => {
      if (!isInitialized) return;
      return TossAds.attachBanner(adGroupId, element, options);
    },
    [isInitialized],
  );

  return { isInitialized, attachBanner };
}

export default function App() {
  const [view, setView] = useState<'setup' | 'game' | 'loading' | 'fortune'>('setup');
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
          question: '' 
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
  const [tossVersion, setTossVersion] = useState<string>('');

  const [adViewCount, setAdViewCount] = useState(0); 
  const MAX_AD_VIEWS = 5; 

  const [isRewardedLoaded, setIsRewardedLoaded] = useState(false);
  const [isInterstitialLoaded, setIsInterstitialLoaded] = useState(false);

  // 배너 광고 훅 사용
  const { isInitialized: isBannerInitialized, attachBanner } = useTossBanner();
  const bannerContainerRef = useRef<HTMLDivElement>(null);
  const topBannerContainerRef = useRef<HTMLDivElement>(null);

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

  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);

  useEffect(() => {
    return () => {
      // 화면 이탈 시 돌아가고 있는 모든 타이머 강제 종료
      timeoutsRef.current.forEach(clearTimeout);
      intervalsRef.current.forEach(clearInterval);
    };
  }, []);

  // 🌟 [추가 1] 포인트 지급 함수 (타이핑 종료 시 호출됨)
  // 🌟 [수정] 토스 프론트엔드 SDK 직결 방식으로 포인트 지급 (서버 통신 X, CORS 에러 X)
  const giveRewardPoint = async (amount: number) => {
    try {
      const result = await grantPromotionReward({
        params: {
          promotionCode: '01KPT6C4487X5RGTPZQZYV8CN8', // 발급받은 프로모션 코드
          amount: amount,
        },
      });

      if (!result) {
        setSysAlert({ msg: "토스 앱 버전이 낮아 포인트를 받을 수 없소.\n앱을 업데이트하시게!" });
      } else if (result === 'ERROR') {
        setSysAlert({ msg: "앗! 신당의 기운이 꼬여 포인트 지급에 오류가 났소." });
      } else if ('key' in result) {
        setSysAlert({ msg: `🎉 운세 완료 보상!\n토스 포인트 ${amount}P가 지급되었소!` });
      } else if ('errorCode' in result) {
        setSysAlert({ msg: `포인트 지급 실패!\n(에러: ${result.errorCode} - ${result.message})` });
      }
    } catch (error) {
      console.error("포인트 지급 함수 에러:", error);
      setSysAlert({ msg: "토스 서버와 연결 중 문제가 발생했소." });
    }
  };

  // 🌟 [추가 2] 자동 로그인 로직 (유저 식별 및 푸쉬 명단용 키 확보)
  useEffect(() => {
    const executeAutoLogin = async () => {
      // 🌟 1. 내 폰(기기)에 이미 발급받은 유저 키가 있는지 확인합니다.
      const tossUserKey = localStorage.getItem('tossUserKey');
      // 🌟 2. 이미 키가 있다면? 통신(fetch) 자체를 건너뛰고 바로 함수 종료! (에러 원천 차단)
      if (tossUserKey) {
        console.log("이미 인증된 도사님이오. 로그인 통신 패스!");
        return; 
      }
      
      const isAlreadyLoggedIn = localStorage.getItem('isTossLoggedIn');
      if (isAlreadyLoggedIn === 'true') return;

      try {
        const loginResult = await appLogin();
        if (loginResult && loginResult.authorizationCode) {
          const response = await fetch('https://slotfortunetoss-production.up.railway.app/toss_login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: loginResult.authorizationCode })
          });
          const data = await response.json();
          
          if (data.isSuccess) {
            localStorage.setItem('isTossLoggedIn', 'true');
            const uniqueKey = data.userInfo.userKey || data.userInfo.decryptedPhoneNumber || 'unknown';
            localStorage.setItem('tossUserKey', uniqueKey);
            setUserInfo(prev => ({ ...prev, name: data.userInfo.decryptedName || prev.name }));
            // setSysAlert({ msg: "토스 간편 로그인 완료!" }); // 성공 시 팝업은 귀찮으니 주석 처리
          } else {
            // 🚨 파이썬 서버에서 에러가 났을 때 띄우는 팝업
            setSysAlert({ msg: `토스 로그인 서버 처리 실패!\n이유: ${data.error}` }); 
          }
        } else {
          // 🚨 토스 앱 자체에서 인증 코드를 안 줬을 때
          setSysAlert({ msg: "토스 앱에서 인증 정보를 주지 않았소!" }); 
        }
      } catch (error: any) {
        console.log("로그인 에러:", error);
        
        // 🚨 [수정] 범인을 잡았으니, 팝업 띄우는 코드는 과감하게 지우거나 주석 처리합니다!
        // const errMsg = error.message || JSON.stringify(error) || "알 수 없는 에러";
        // setSysAlert({ msg: `[테스트 환경 에러]\n원인: ${errMsg}` }); 

        // 🌟 [핵심] 로그인이 막혔더라도, 앱을 정상적으로 즐기고 포인트를 받을 수 있도록 임시 출입증을 줍니다.
        if (!localStorage.getItem('tossUserKey')) {
          const guestKey = 'GUEST_' + Math.random().toString(36).substring(2, 11);
          localStorage.setItem('tossUserKey', guestKey);
          console.log("임시 출입증 발급 완료:", guestKey);
        }
      }
    };
    executeAutoLogin();
  }, []);;

  useEffect(() => {
    try {
      const version = getTossAppVersion(); 
      setTossVersion(version);
    } catch (e) {
      console.warn("비토스 환경입니다.");
    }
  }, []);

  const isSupportedVersion = (minVersion: string) => {
    if (!tossVersion) return false;
    const current = tossVersion.split('.').map(Number);
    const target = minVersion.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if (current[i] > target[i]) return true;
      if (current[i] < target[i]) return false;
    }
    return true;
  };

  // 🌟 전면/보상형 광고 미리 로드하기 (Pre-load)
  useEffect(() => {
    if (!loadFullScreenAd.isSupported || !loadFullScreenAd.isSupported()) return;

    const unregisterRewarded = loadFullScreenAd({
      options: { adGroupId: 'ait.v2.live.a3731253d58141cf' },
      onEvent: (event) => { if (event.type === 'loaded') setIsRewardedLoaded(true); },
      onError: (err) => console.error('리워드 로드 실패:', err),
    });

    const unregisterInterstitial = loadFullScreenAd({
      options: { adGroupId: 'ait.v2.live.6aad292def6c4da0' },
      onEvent: (event) => { if (event.type === 'loaded') setIsInterstitialLoaded(true); },
      onError: (err) => console.error('전면 로드 실패:', err),
    });

    return () => {
      unregisterRewarded();
      unregisterInterstitial();
    };
  }, []);

  const loadNextRewardedAd = () => {
    loadFullScreenAd({
      options: { adGroupId: 'ait.v2.live.a3731253d58141cf' },
      onEvent: (e) => { if (e.type === 'loaded') setIsRewardedLoaded(true); },
      onError: console.error
    });
  };

  const loadNextInterstitialAd = () => {
    loadFullScreenAd({
      options: { adGroupId: 'ait.v2.live.6aad292def6c4da0' },
      onEvent: (e) => { if (e.type === 'loaded') setIsInterstitialLoaded(true); },
      onError: console.error
    });
  };

  // 🌟 보상형 광고 (무료 충전)
  const showAd = () => {
    if (!isRewardedLoaded) {
      setSysAlert({ msg: "지금은 천기(광고)를 불러올 수 없소.\n잠시 후 다시 시도해주시게." });
      return;
    }

    showFullScreenAd({
      options: { adGroupId: 'ait.v2.live.a3731253d58141cf' },
      onEvent: (event) => {
        if (event.type === 'userEarnedReward') {
          setMaxSpins(prev => prev + 10);
          setAdViewCount(prev => prev + 1);
          setSysAlert({ msg: `광고 시청 완료!\n슬롯 기회 10번이 추가되었소.\n(오늘 남은 횟수: ${MAX_AD_VIEWS - (adViewCount + 1)}번)` });
        } else if (event.type === 'dismissed') {
          setIsRewardedLoaded(false);
          loadNextRewardedAd();
        }
      },
      onError: (error) => {
        console.error('광고 표시 실패:', error);
        setSysAlert({ msg: "광고를 띄우는데 실패했소." });
      }
    });
  };

  const initGameWithAd = () => {
  if (!isRewardedLoaded) {
    setSysAlert({ msg: "지금은 천기를 불러올 수 없소. 잠시 후 다시 시도해주시게." });
    return;
  }

  showFullScreenAd({
    options: { adGroupId: 'ait.v2.live.a3731253d58141cf' },
    onEvent: (event) => {
      if (event.type === 'userEarnedReward') {
        initGame(); // 기본 게임 초기화 실행
        const adTid = setTimeout(() => {
          setMaxSpins(20); // 광고 시청 보상으로 20회 세팅
          setSysAlert({ msg: "📺 광고 시청 보상! 슬롯 기회 20번으로 시작하겠네." });
        }, 1500);
        timeoutsRef.current.push(adTid);
      } else if (event.type === 'dismissed') {
        setIsRewardedLoaded(false);
        loadNextRewardedAd();
      }
    },
    onError: () => { initGame(); } // 에러 시 기본 10회로 시작
  });
};
  
  // 🌟 고정 배너형 광고 부착 (공식 가이드 적용)
  useEffect(() => {
    if (!isSupportedVersion('5.241.0') || !isBannerInitialized || !bannerContainerRef.current) return;

    const attached = attachBanner('ait.v2.live.a2f854f1d3c04fa5', bannerContainerRef.current, {
      theme: 'auto',
      tone: 'blackAndWhite',
      variant: 'expanded',
      callbacks: {
        onAdRendered: (payload) => console.log('배너 광고 렌더링 완료:', payload.slotId),
        onAdFailedToRender: (payload) => console.error('배너 광고 렌더링 실패:', payload.error?.message),
      },
    });

    return () => {
      attached?.destroy();
    };
  }, [tossVersion, isBannerInitialized, attachBanner]);

  useEffect(() => {
    if (!isSupportedVersion('5.241.0') || !isBannerInitialized || !topBannerContainerRef.current) return;
    
    // 대표님이 주신 상단 전용 배너 ID 적용
    const attachedTop = attachBanner('ait.v2.live.072c9f7cd496494f', topBannerContainerRef.current, {
      theme: 'auto',
      tone: 'blackAndWhite',
      variant: 'expanded',
    });

    return () => {
      attachedTop?.destroy();
    };
  }, [tossVersion, isBannerInitialized, attachBanner]);

  const luckyCode = useMemo(() => {
    if (!userInfo.name) return '';
    const nameHex = btoa(encodeURIComponent(userInfo.name)).slice(0, 4).toUpperCase();
    const birthHex = btoa(userInfo.birth || '0000').slice(-4).toUpperCase();
    const dateHex = new Date().getDate().toString(16).toUpperCase().padStart(2, '0');
    const randomHex = Math.floor(Math.random() * 65535).toString(16).toUpperCase().padStart(4, '0');
    return `0x${dateHex}${nameHex} >_ ${birthHex.slice(0,2)}:${birthHex.slice(2,4)}:${randomHex.slice(0,2)}:${randomHex.slice(2,4)}`;
  }, [userInfo.name, userInfo.birth, scene]);

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
      if (ref.current) {
        ref.current.volume = 0; // 무음 처리
        ref.current.play().then(() => {
          ref.current!.pause(); // 재생되자마자 정지
          ref.current!.currentTime = 0;
          ref.current!.volume = 1; // 볼륨 원상 복구
        }).catch(() => {});
      }
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
        setMaxSpins(10);
        setIsInitializing(false);
      }
    }, 50);
    intervalsRef.current.push(countAnim);
  };

  const buySpin = () => {
    if (totalScore >= 500) {
      setTotalScore(prev => prev - 500); 
      setMaxSpins(prev => prev + 1);     
      playSound(coinSndRef.current);
    } else if (adViewCount < MAX_AD_VIEWS) {
      setSysConfirm({
        msg: `복채가 부족하구려!\n대신 광고를 한 일 보면 기회 10번을 주겠네.\n(오늘 남은 기회: ${MAX_AD_VIEWS - adViewCount}번)`,
        onOk: () => { showAd(); },
        onCancel: () => {}
      });
    } else {
      setSysAlert({ msg: "오늘 볼 수 있는 광고를 모두 보았소!\n이제 천기를 확인하시게나." });
    }
  };

  const spin = () => {
    if (isInitializing || isSpinning || isSpinningRef.current) return;

    if (spinCount >= maxSpins) {
      if (totalScore >= 500) {
        setSysConfirm({
          msg: `모든 기회를 소모했네!\n\n[확인] 기회 1회 추가 (500P 차감)\n[취소] 지금 바로 운세 결과 보기`,
          onOk: () => { buySpin(); },
          onCancel: () => { triggerGetFortune(); }
        });
        return;
      } else if (adViewCount < MAX_AD_VIEWS) {
        setSysConfirm({
          msg: `모든 기회를 소모했고 복채도 부족하네!\n\n[확인] 광고 시청하고 10회 추가하기\n[취소] 지금 바로 운세 결과 보기`,
          onOk: () => { showAd(); },
          onCancel: () => { triggerGetFortune(); }
        });
        return;
      } else {
        setSysAlert({
          msg: "기회를 모두 소진했고, 볼 수 있는 광고도 없구려.\n이제 천기를 확인하러 가세나!",
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
    intervalsRef.current.push(shuffle);

    finalIndices.forEach((itemIdx, i) => {
      const tid = setTimeout(() => {
        stopFlags[i] = true;
        if (slotRefs.current[i]) slotRefs.current[i]!.innerText = SLOT_ITEMS[itemIdx].symbol;
      }, 300 + (i * 150));
      timeoutsRef.current.push(tid);
    });

    const resultTid = setTimeout(() => {
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
        setTimeout(() => setSysAlert({ msg: "🎊 올빙고 보너스 50,000복채 획득! 🎊" }), 100);
      }

      setWinLines([...new Set(newWinLines)]);

      if (feverSpinsLeft === 0 && Math.random() < 0.04) {
        setFeverSpinsLeft(5);
        setScene('fever');
        playSound(feverBgmSndRef.current);
        setFeverToast(true);
        setTimeout(() => setFeverToast(false), 2000);
      }

      const prospectiveTotal = totalScore + s;

      if (prospectiveTotal >= 100000 && totalScore < 100000) {
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
    timeoutsRef.current.push(resultTid);
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
    intervalsRef.current.push(anim);

    const fightTid = setTimeout(() => {
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
    timeoutsRef.current.push(fightTid);
  };

  const stopAndCollect = () => {
    const newTotal = totalScore + currentWin;
    setTotalScore(newTotal);
    
    if (newTotal >= 100000 && totalScore < 100000) {
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

    const finalScore = scoreToUse !== undefined ? scoreToUse : totalScore;

    // [중요] 실제 데이터를 가져오고 화면을 넘기는 로직을 별도 상수로 분리
    const executeFortuneFetch = async () => {
      // 1. 상태 전환: 로딩 화면으로 먼저 보냅니다.
      setView('loading');
      setScene('fortune');

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
            anonymous_key: anonymousKey,
            toss_user_key: localStorage.getItem('tossUserKey') 
          }),
        });

        if (response.status === 429) {
            const data = await response.json();
            setFortuneData(data);
            setView('fortune');
            setScene('fortune'); // [추가] 씬도 확실히 고정
            typeWriterEffect(data.fortune);
            return;
        }

        if (!response.ok) throw new Error('서버 응답 에러');
        const data = await response.json();

        // 2. 결과 데이터 저장 및 뷰 전환
        setFortuneData({ grade: data.grade, status: data.status, fortune: data.fortune });
        setView('fortune');
        setScene('fortune');
        typeWriterEffect(data.fortune, true, finalScore);
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

    // 🌟 [핵심 수정] 전면 광고 실행 로직
    if (isInterstitialLoaded) {
      showFullScreenAd({
        options: { adGroupId: 'ait.v2.live.6aad292def6c4da0' },
        onEvent: (event) => {
          // 광고가 닫혔을 때(dismissed)만 다음으로 넘어가게 설계
          if (event.type === 'dismissed') {
            setIsInterstitialLoaded(false);
            loadNextInterstitialAd();
            executeFortuneFetch(); // 여기서 호출해야 슬롯으로 안 돌아갑니다.
          }
        },
        onError: (err) => {
          console.error("광고 에러:", err);
          executeFortuneFetch(); // 에러 나도 운세는 보여줘야 함
        }
      });
    } else {
      // 광고가 아직 로드 안 됐거나 없는 경우 바로 실행
      executeFortuneFetch();
    }
  };

  // 🌟 [수정] 타이핑 애니메이션 및 등급별 포인트 지급 로직
  const typeWriterEffect = (text: string, shouldReward: boolean = false, score?: number) => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    let idx = 0;
    setTypedText('');
    setIsTypingComplete(false); 
    
    // 만약 서버 에러로 텍스트가 비어있을 경우를 대비한 방어 코드
    const safeText = text || '신당의 기운이 흩어져 글씨가 보이지 않소...';

    if (typeSndRef.current) {
      typeSndRef.current.currentTime = 0;
      typeSndRef.current.play().catch(() => {});
    }

    const type = () => {
      if (idx < safeText.length) {
        setTypedText(safeText.substring(0, ++idx));
        // 타자 속도를 35ms -> 20ms로 약간 높여 답답함 해소
        typingTimeoutRef.current = setTimeout(type, 20); 
      } else {
        if (typeSndRef.current) {
          typeSndRef.current.pause();
          typeSndRef.current.currentTime = 0; // 🌟 소리가 완벽하게 꺼지도록 강제 초기화
        }
        setIsTypingComplete(true); 
        
        // 🌟 타이핑 종료 후 점수(score)에 따라 차등 보상 지급
        if (shouldReward && score !== undefined) {
          const currentGrade = GRADE_LIST.find(g => score >= g.score) || GRADE_LIST[GRADE_LIST.length - 1];
          giveRewardPoint(currentGrade.reward); 
        }
      }
    };
    type();
  };

  const resetGame = () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
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

      {/* 🌟 수정 1: 컨테이너의 하단 패딩에 아이폰 safe-area-inset-bottom 적용 */}
      <div className={`container ${feverSpinsLeft > 0 ? 'fever-mode' : ''}`} style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}>
        
        {/* 🌟 기존 scene-media 클래스를 제거하고, 배너가 비율에 맞게 늘어날 수 있도록 풀어줍니다. */}
        <div style={{ width: '100%', backgroundColor: '#000', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
          <div ref={topBannerContainerRef} style={{ width: '100%' }} />
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
            <textarea rows={3} maxLength={80} placeholder="오늘의 고민을 적어주세요(없으면 생략)" value={userInfo.question} onChange={e => setUserInfo({...userInfo, question: e.target.value})} />
            <div style={{ margin: '15px 0', display: 'flex', gap: '10px' }}>
              <button className={`gender-btn ${userInfo.gender === '남' ? 'active' : ''}`} onClick={() => setUserInfo({...userInfo, gender: '남'})}>남성</button>
              <button className={`gender-btn ${userInfo.gender === '여' ? 'active' : ''}`} onClick={() => setUserInfo({...userInfo, gender: '여'})}>여성</button>
            </div>
        
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>              
            {/* 1. 기본 시작 버튼 (슬롯 10회) */}
              <button onClick={initGame} className="btn">✨ 일반 시작 (슬롯 10회) ✨</button>
            {/* 2. 광고 보고 시작 버튼 (슬롯 20회) */}
               <button 
                  onClick={initGameWithAd} 
                  className="buy-btn" 
                  style={{ 
                  background: 'linear-gradient(45deg, #8a2be2, #4a00e0)', 
                  borderColor: '#ff00ff',
                  fontSize: '1rem'
                 }}
               >
                📺 광고 보고 시작 (슬롯 20회)
               </button>

          </div>
         </div>
        )}

        {view === 'game' && (
          <div id="game-view">
            {/* 🌟 [수정 4] 영상 대신 상단에 배치된 심볼 점수표 */}
            <div style={{ background: '#151515', border: '1px solid #333', borderRadius: '15px', padding: '15px', marginBottom: '20px', textAlign: 'center' }}>
              <h3 style={{ color: 'var(--neon)', fontSize: '15px', margin: '0 0 10px 0' }}>💰 심볼별 복채 점수표</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {SLOT_ITEMS.map((item, i) => (
                  <div key={i} style={{ fontSize: '15px', color: '#fff', fontWeight: 'bold' }}>
                    {item.symbol} <span style={{ color: 'var(--gold)' }}>{item.score.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div style={{ color: 'var(--gold)', fontSize: '11px', marginTop: '10px', fontWeight: 'bold' }}>🌈 9개 칸 올빙고 시 보너스 +50,000복채!</div>
            </div>

            <div className="grid">{slots.map((s, i) => (<div key={i} ref={(el) => { slotRefs.current[i] = el; }} className={`reel ${winLines.includes(i) ? 'win-line' : ''}`}>{s}</div>))}</div>
            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', background: 'rgba(0,0,0,0.85)', border: '2px solid var(--gold)', borderRadius: '15px', padding: '15px 5px', marginBottom: '20px' }}>
              <div style={{ textAlign: 'center', flex: 1 }}><div style={{ fontSize: '0.85em', color: '#bbb' }}>누적 복채</div><div style={{ fontSize: '1.4em', color: 'var(--gold)', fontWeight: '900' }}>{totalScore.toLocaleString()}</div></div>
              <div style={{ width: '1px', height: '40px', background: '#444' }}></div>
              <div style={{ textAlign: 'center', flex: 1.2 }}><div style={{ fontSize: '0.85em', color: '#bbb' }}>현재 등급</div><div style={{ fontSize: '1.3em', color: 'var(--neon)', fontWeight: 'bold' }}>{getGradeName(totalScore)}</div></div>
              <div style={{ width: '1px', height: '40px', background: '#444' }}></div>
              <div style={{ textAlign: 'center', flex: 1 }}><div style={{ fontSize: '0.85em', color: '#bbb' }}>남은 기회</div><div style={{ fontSize: '1.4em', color: '#fff', fontWeight: '900' }}>{isInitializing ? '-' : maxSpins - spinCount}</div></div>
            </div>
            <button className="btn" onClick={spin} disabled={isSpinning || isInitializing || isUniverseEnding}>🎰 슬롯 돌리기!</button>
            
            <button className="buy-btn" onClick={() => buySpin()} disabled={totalScore < 500 || isSpinning || isInitializing} style={{ opacity: totalScore < 500 ? 0.5 : 1, marginBottom: '10px' }}>
              {totalScore >= 500 ? `➕ 기회 1회 추가 (500P 차감)` : "🚫 기회 1회 추가 (500P 필요)"}
            </button>

            <button className="buy-btn" onClick={() => showAd()} disabled={adViewCount >= MAX_AD_VIEWS || isSpinning || isInitializing} style={{ opacity: adViewCount >= MAX_AD_VIEWS ? 0.5 : 1, background: 'linear-gradient(45deg, #8a2be2, #4a00e0)', borderColor: '#ff00ff' }}>
              {adViewCount < MAX_AD_VIEWS ? `📺 무료 광고 보고 10회 충전 (${MAX_AD_VIEWS - adViewCount}/5)` : "🚫 오늘 무료 충전 기회 모두 소진"}
            </button>
          </div>
        )}

        {/* 등급 안내 및 심볼 정보 */}
        {(view === 'setup' || view === 'game') && (
          <div style={{ width: '100%', maxWidth: '600px', margin: '40px auto 40px auto', padding: '20px', background: '#151515', borderRadius: '20px', border: '1px solid #333', boxSizing: 'border-box', textAlign: 'center' }}>
            <h3 style={{ color: 'var(--gold)', fontSize: '18px', marginBottom: '15px' }}>📜 도사의 등급별 신통력</h3>
            <div style={{ fontSize: '13px', color: '#ccc', lineHeight: '1.6', marginBottom: '20px' }}>
              누적된 복채(점수)가 높을수록 도사의 신통력이 상승합니다.<br />
              등급이 높을수록 더욱 날카로운 운세 결과와 함께<br />
              보다 많은 <span style={{ color: 'var(--neon)', fontWeight: 'bold' }}>'포인트'</span>를 획득할 수 있습니다.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {GRADE_LIST.map((g, i) => (
                <div key={i} className="grade-item" style={{ borderLeftColor: g.color, background: 'rgba(255,255,255,0.03)', padding: '10px' }}>
                  <b style={{ color: g.color }}>{g.name} ({g.score.toLocaleString()}~)</b><br />
                  <span style={{ fontSize: '12px', color: '#888' }}>{g.desc}</span>
                </div>
              ))}
            </div>
            {/* 🌟 [수정 5] 중복으로 표시되던 하단 점수표는 삭제 완료 */}
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
                <div style={{ margin: '30px auto', padding: '25px 15px', background: '#050a05', border: '2px solid #00ff00', borderRadius: '4px', boxShadow: '0 0 25px rgba(0, 255, 0, 0.4)', fontFamily: '"Courier New", Courier, monospace', textAlign: 'center', position: 'relative', color: '#00ff00' }}>
                  <div style={{ fontSize: '0.65em', marginBottom: '10px', textAlign: 'left', borderBottom: '1px solid rgba(0,255,0,0.3)', paddingBottom: '5px' }}>
                    SYNC_USER: {userInfo.name.split('').map((c: string) => c.charCodeAt(0).toString(16)).join('').slice(0,8).toUpperCase()}...<br/>
                    SYNC_DATE: {new Date().toISOString().split('T')[0]}<br/>
                    STATUS: ENCRYPTED_DESTINY_KEY_ACTIVE
                  </div>
                  <div style={{ color: '#fff', fontSize: '1.3em', fontWeight: 'bold', letterSpacing: '1px', margin: '10px 0', textShadow: '0 0 10px #fff, 0 0 20px #00ff00' }}>{luckyCode}</div>
                  <div style={{ marginTop: '20px', color: '#00ff00', fontSize: '0.9rem', lineHeight: '1.6', fontWeight: 'bold', padding: '15px 5px', borderTop: '1px solid #00ff00', background: 'rgba(0, 255, 0, 0.05)' }}>"이 코드를 캡쳐해서 가지고 있으면<br/> 오늘 하루 행운이 찾아오거나 액운을 피할 수 있을 것이네."</div>
                </div>
              )}
              <div className="fortune-card-footer">☯️ 슬롯머신 레트로 도사</div>
            </div>
            <button onClick={resetGame} className="btn" style={{ width: '100%', marginTop: '20px' }}>다시 하기</button>
          </div>
        )}
      </div>

      {/* 가위바위보 모달 */}
      {rpsModalOpen && (
        <div className="modal-bg">
          <div className="modal-content" style={{ padding: '20px' }}>
            <h2 style={{ color: 'var(--gold)', margin: '0 0 10px 0' }}>🔥 한판 승부! 🔥</h2>
            <div className={`dosa-hand-style ${rpsEffect}`} style={{ fontSize: '60px', margin: '10px auto', border: '4px solid var(--neon)', borderRadius: '50%', width: '90px', height: '90px', lineHeight: '90px', background: '#000' }}>{dosaHand}</div>
            <p style={{ fontSize: '1.1em', fontWeight: 'bold', color: '#fff', margin: '5px 0' }}>{rpsStatus}</p>
            <p style={{ margin: '5px 0' }}>획득한 복채: <span style={{ color: 'var(--neon)', fontSize: '1.3em', fontWeight: 'bold' }}>{currentWin.toLocaleString()}</span></p>
            <p style={{ color: '#ffd700', fontWeight: 'bold', margin: '5px 0 10px 0' }}>연승: {rpsStreak} | 다음 승리: {(1.9 + (rpsStreak + 1) * 0.1).toFixed(1).replace('.0', '')}배</p>
            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', margin: '10px 0' }}>
              {['✌️', '✊', '✋'].map(h => (<button key={h} onClick={() => finalFight(h)} disabled={handBtnsLocked} style={{ fontSize: '35px', background: 'none', border: '1px solid #444', borderRadius: '15px', padding: '5px 15px' }}>{h}</button>))}
            </div>
            <button id="collect-btn" onClick={stopAndCollect} style={{ marginTop: '5px' }}>💰 복채 챙기기</button>
          </div>
        </div>
      )}

      {/* 도움말 모달 */}
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
            <button className="btn" onClick={() => { if (sysAlert.onClose) sysAlert.onClose(); setSysAlert(null); }}>알겠소!</button>
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

      {/* 🌟 하단 고정 배너 부착 영역 */}
      {isSupportedVersion('5.241.0') && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, width: '100%', zIndex: 9998, display: 'flex', justifyContent: 'center', backgroundColor: '#000', minHeight: '96px', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div ref={bannerContainerRef} style={{ width: '100%', height: '96px' }} />
        </div>
      )}
    </>
  );
}