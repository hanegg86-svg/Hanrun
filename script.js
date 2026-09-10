// ShadowStrider: Dark Run RPG Core Engine
(async function () {
  'use strict';

  // --- IndexedDB Database Layer (จัดเก็บข้อมูลไม่จำกัดขนาด) ---
  const DB_NAME = 'ShadowStriderDB';
  const DB_VERSION = 1;
  const STORE_PLAYER = 'player_state';
  const STORE_HISTORY = 'run_history';

  const DB = {
    db: null,
    async init() {
      if (this.db) return this.db;
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_PLAYER)) {
            db.createObjectStore(STORE_PLAYER, { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains(STORE_HISTORY)) {
            const histStore = db.createObjectStore(STORE_HISTORY, { keyPath: 'id', autoIncrement: true });
            histStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
        req.onsuccess = (e) => {
          this.db = e.target.result;
          // ขอสิทธิ์ Persistent Storage เพื่อป้องกัน OS เคลียร์ข้อมูลทิ้ง
          if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().catch(() => {});
          }
          resolve(this.db);
        };
        req.onerror = (e) => reject(e.target.error);
      });
    },
    async getPlayerState() {
      const db = await this.init();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_PLAYER, 'readonly');
        const store = tx.objectStore(STORE_PLAYER);
        const req = store.get('current');
        req.onsuccess = () => resolve(req.result ? req.result.data : null);
        req.onerror = () => resolve(null);
      });
    },
    async savePlayerState(state) {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PLAYER, 'readwrite');
        const store = tx.objectStore(STORE_PLAYER);
        const req = store.put({ key: 'current', data: state, updatedAt: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
      });
    },
    async addRunRecord(record) {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_HISTORY, 'readwrite');
        const store = tx.objectStore(STORE_HISTORY);
        const req = store.add(record);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
      });
    },
    async getAllRunHistory() {
      const db = await this.init();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_HISTORY, 'readonly');
        const store = tx.objectStore(STORE_HISTORY);
        const req = store.getAll();
        req.onsuccess = () => {
          const list = req.result || [];
          list.sort((a, b) => b.timestamp - a.timestamp);
          resolve(list);
        };
        req.onerror = () => resolve([]);
      });
    }
  };

  // --- Screen Wake Lock API Manager ---
  let wakeLockSentinel = null;

  async function acquireWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        wakeLockSentinel.addEventListener('release', () => {
          wakeLockSentinel = null;
        });
      } catch (err) {
        console.warn('Wake Lock request failed:', err);
      }
    }
  }

  function releaseWakeLock() {
    if (wakeLockSentinel !== null) {
      wakeLockSentinel.release().catch(() => {});
      wakeLockSentinel = null;
    }
  }

  // คืนสิทธิ์ Wake Lock เมื่อสลับกลับเข้ามาในแอปขณะกำลังวิ่ง
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && isRunning && wakeLockSentinel === null) {
      await acquireWakeLock();
    }
  });

  // --- Boss List Database ---
  const BOSS_DATABASE = [
    { tier: 'TIER I', name: 'Gargoyle of the Crypt', avatar: '👹', maxHpKm: 1.0, desc: 'อสูรหินเฝ้าประตูสุสาน จงวิ่ง 1.00 กม. เพื่อทำลายมัน!', rewardExp: 1200, rewardGold: 150 },
    { tier: 'TIER II', name: 'Abyssal Blood Knight', avatar: '🤺', maxHpKm: 2.5, desc: 'อัศวินเกราะดำกระหายการต่อสู้ วิ่ง 2.50 กม. เพื่อสยบดาบโลหิต!', rewardExp: 3200, rewardGold: 350 },
    { tier: 'TIER III', name: 'Ancient Bone Dragon', avatar: '🐉', maxHpKm: 5.0, desc: 'มังกรกระดูกบรรพกาล วิ่งสะสม 5.00 กม. เพื่อปิดผนึกลมหายใจมรณะ!', rewardExp: 7500, rewardGold: 800 }
  ];

  // --- Dynamic Title System ---
  function getTitleForLevel(level) {
    if (level >= 25) return 'Shadow Sovereign';
    if (level >= 20) return 'Dread Champion';
    if (level >= 15) return 'Abyssal Dreadnought';
    if (level >= 10) return 'Abyss Stalker';
    if (level >= 5) return 'Crypt Slayer';
    return 'Shadow Initiate';
  }

  // --- Initial Daily Quests Generator ---
  function generateDailyQuests() {
    return [
      { id: 'dq_dist', name: 'สำรวจเงามืด: สะสมระยะทาง 1.5 กม.', target: 1.5, current: 0.0, unit: 'กม.', rewardExp: 600, rewardGold: 60, claimed: false },
      { id: 'dq_time', name: 'สมาธินักล่า: วิ่งต่อเนื่อง 12 นาที', target: 720, current: 0, unit: 'วินาที', rewardExp: 700, rewardGold: 70, claimed: false },
      { id: 'dq_cal', name: 'ผลาญพลังเวท: เผาผลาญ 100 kcal', target: 100, current: 0, unit: 'kcal', rewardExp: 500, rewardGold: 50, claimed: false },
      { id: 'dq_boss', name: 'ปราบบอส: โค่นบอส 1 ตัว', target: 1, current: 0, unit: 'ตัว', rewardExp: 900, rewardGold: 100, claimed: false },
      { id: 'dq_crit', name: 'จุดตาย: โจมตีคริติคอล 5 ครั้ง', target: 5, current: 0, unit: 'ครั้ง', rewardExp: 750, rewardGold: 80, claimed: false }
    ];
  }

  // --- Initial Achievements Generator ---
  function generateAchievements() {
    return [
      { id: 'ach_first', name: 'First Blood (การล่าครั้งแรก)', desc: 'จบเซสชันการล่าสำเร็จ 1 รอบ', target: 1, current: 0, unit: 'รอบ', rewardExp: 1000, rewardGold: 200, claimed: false },
      { id: 'ach_dist10', name: 'Shadow Nomad (เส้นทาง 10K)', desc: 'สะสมระยะทางรวมแตะ 10.0 กม.', target: 10.0, current: 0.0, unit: 'กม.', rewardExp: 3500, rewardGold: 600, claimed: false },
      { id: 'ach_dist50', name: 'Abyssal Walker (นักเดินทาง 50K)', desc: 'สะสมระยะทางรวมแตะ 50.0 กม.', target: 50.0, current: 0.0, unit: 'กม.', rewardExp: 12000, rewardGold: 2500, claimed: false },
      { id: 'ach_boss_dragon', name: 'Dragon Bane (ผู้สยบมังกร)', desc: 'โค่นมังกรกระดูก Ancient Bone Dragon (Tier III)', target: 1, current: 0, unit: 'ตัว', rewardExp: 6000, rewardGold: 1200, claimed: false }
    ];
  }

  // --- Game State Object ---
  const defaultState = {
    level: 1,
    title: 'Shadow Initiate',
    currentExp: 0,
    nextExp: 1000,
    gold: 0,
    statPoints: 0,
    stats: { str: 10, sta: 10, agi: 10 },
    upgrades: { blade: 0, charm: 0, eye: 0 },
    chestsAvailable: 0,
    streak: { count: 1, lastDate: new Date().toDateString() },
    bossIndex: 0,
    bossHpRemain: 1.0,
    totalDistanceKm: 0.0,
    lastDailyDate: new Date().toDateString(),
    career: {
      totalRuns: 0,
      totalDistanceKm: 0.0,
      totalSeconds: 0,
      totalBossDefeated: 0,
      longestRunKm: 0.0
    },
    dailyQuests: generateDailyQuests(),
    achievements: generateAchievements()
  };

  let gameState = defaultState;

  // --- State Migration & Persistence ---
  async function loadGameState() {
    let saved = await DB.getPlayerState();
    if (!saved) {
      const legacySave = localStorage.getItem('shadow_strider_save');
      if (legacySave) {
        try {
          saved = JSON.parse(legacySave);
          localStorage.removeItem('shadow_strider_save');
        } catch (e) {
          console.warn('โหลด save เดิมไม่สำเร็จ', e);
        }
      }
    }

    if (saved) {
      gameState = Object.assign({}, defaultState, saved);
      gameState.stats = Object.assign({}, defaultState.stats, saved.stats || {});
      gameState.upgrades = Object.assign({}, defaultState.upgrades, saved.upgrades || {});
      gameState.streak = Object.assign({}, defaultState.streak, saved.streak || {});
      gameState.career = Object.assign({}, defaultState.career, saved.career || {});
      gameState.dailyQuests = saved.dailyQuests || generateDailyQuests();
      gameState.achievements = saved.achievements || generateAchievements();
    } else {
      gameState = defaultState;
    }

    verifyDailyAndStreakReset();
    await DB.savePlayerState(gameState);
  }

  function saveGame() {
    DB.savePlayerState(gameState).catch(err => console.error('Save error', err));
  }

  // --- Daily Quest & Streak Reset Check ---
  function verifyDailyAndStreakReset() {
    const today = new Date().toDateString();
    if (gameState.lastDailyDate !== today) {
      const lastDateObj = new Date(gameState.streak.lastDate);
      const todayDateObj = new Date(today);
      const diffTime = Math.abs(todayDateObj - lastDateObj);
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        gameState.streak.count += 1;
        showToast(`🔥 วันล่าต่อเนื่องวันที่ ${gameState.streak.count}! ได้รับโบนัสทองคำเพิ่ม`);
      } else if (diffDays > 1) {
        gameState.streak.count = 1;
      }
      gameState.streak.lastDate = today;

      gameState.lastDailyDate = today;
      gameState.dailyQuests = generateDailyQuests();
      saveGame();
    }
  }

  // --- Run Tracking Variables ---
  let isRunning = false;
  let isSimMode = false;
  let runDistanceKm = 0.0;
  let runSeconds = 0;
  let runTimerInterval = null;
  let watchId = null;
  let lastCoord = null;
  let sessionBossKills = 0;

  // Berserk / Frenzy rolling samples
  let isFrenzyActive = false;
  let frenzyPaceStreakSec = 0;
  let nextChestKmCheckpoint = 1.0;
  let paceSamples = []; // [{ time: number, dist: number }]

  // --- DOM Elements ---
  const playerTitleEl = document.getElementById('player-title');
  const playerLevelEl = document.getElementById('player-level');
  const expBarFillEl = document.getElementById('exp-bar-fill');
  const expCurrentEl = document.getElementById('exp-current');
  const expNextEl = document.getElementById('exp-next');
  const goldValueEl = document.getElementById('gold-value');
  const streakValEl = document.getElementById('streak-val');

  const statPointsBarEl = document.getElementById('stat-points-bar');
  const statPointsValEl = document.getElementById('stat-points-val');
  const statStrEl = document.getElementById('stat-str');
  const statStaEl = document.getElementById('stat-sta');
  const statAgiEl = document.getElementById('stat-agi');
  const strMultEl = document.getElementById('str-mult');
  const staMultEl = document.getElementById('sta-mult');
  const agiCritEl = document.getElementById('agi-crit');
  const btnAddStr = document.getElementById('btn-add-str');
  const btnAddSta = document.getElementById('btn-add-sta');
  const btnAddAgi = document.getElementById('btn-add-agi');

  const bossTierEl = document.getElementById('boss-tier');
  const bossAvatarEl = document.getElementById('boss-avatar');
  const bossNameEl = document.getElementById('boss-name');
  const bossDescEl = document.getElementById('boss-desc');
  const bossHpBarEl = document.getElementById('boss-hp-bar');
  const bossHpRemainEl = document.getElementById('boss-hp-remain');
  const bossHpMaxEl = document.getElementById('boss-hp-max');

  const chestCardEl = document.getElementById('chest-card');
  const chestCountEl = document.getElementById('chest-count');
  const btnOpenChest = document.getElementById('btn-open-chest');

  const runHudEl = document.getElementById('run-hud');
  const frenzyBannerEl = document.getElementById('frenzy-banner');
  const distanceValEl = document.getElementById('distance-val');
  const timeValEl = document.getElementById('time-val');
  const paceValEl = document.getElementById('pace-val');
  const calValEl = document.getElementById('cal-val');
  const gpsStatusEl = document.getElementById('gps-status');

  const btnToggleRun = document.getElementById('btn-toggle-run');
  const btnRunText = document.getElementById('btn-run-text');
  const btnFinishRun = document.getElementById('btn-finish-run');
  const simToggleBtn = document.getElementById('sim-toggle-btn');
  const simControls = document.getElementById('sim-controls');
  const questsListEl = document.getElementById('quests-list');
  const achievementsListEl = document.getElementById('achievements-list');
  const achievementsCounterEl = document.getElementById('achievements-counter');
  const gameToastEl = document.getElementById('game-toast');

  // Shop Elements
  const priceElixirEl = document.getElementById('price-elixir');
  const btnBuyElixir = document.getElementById('btn-buy-elixir');
  const lvlBladeEl = document.getElementById('lvl-blade');
  const bladeBonusEl = document.getElementById('blade-bonus');
  const priceBladeEl = document.getElementById('price-blade');
  const btnBuyBlade = document.getElementById('btn-buy-blade');
  const lvlCharmEl = document.getElementById('lvl-charm');
  const charmBonusEl = document.getElementById('charm-bonus');
  const priceCharmEl = document.getElementById('price-charm');
  const btnBuyCharm = document.getElementById('btn-buy-charm');
  const lvlEyeEl = document.getElementById('lvl-eye');
  const eyeBonusEl = document.getElementById('eye-bonus');
  const priceEyeEl = document.getElementById('price-eye');
  const btnBuyEye = document.getElementById('btn-buy-eye');

  const careerDistanceEl = document.getElementById('career-distance');
  const careerTimeEl = document.getElementById('career-time');
  const careerBossesEl = document.getElementById('career-bosses');
  const careerLongestEl = document.getElementById('career-longest');

  const historyListEl = document.getElementById('history-list');
  const dailyListEl = document.getElementById('daily-list');
  const historyCountEl = document.getElementById('history-count');
  const tabBtnDaily = document.getElementById('tab-btn-daily');
  const tabBtnSessions = document.getElementById('tab-btn-sessions');
  const viewDaily = document.getElementById('view-daily');
  const viewSessions = document.getElementById('view-sessions');

  const pocketBtn = document.getElementById('pocket-btn');
  const pocketOverlay = document.getElementById('pocket-overlay');
  const pocketDistVal = document.getElementById('pocket-dist-val');
  const pocketTimeVal = document.getElementById('pocket-time-val');
  const pocketUnlockBar = document.getElementById('pocket-unlock-bar');

  // --- Haversine Distance (กิโลเมตร) ---
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // --- Toast แจ้งเตือน ---
  function showToast(msg) {
    gameToastEl.textContent = msg;
    gameToastEl.classList.add('show');
    setTimeout(() => {
      gameToastEl.classList.remove('show');
    }, 2800);
  }

  // --- Shop Price Formulas ---
  function getBladePrice() {
    return 300 + (gameState.upgrades.blade * 150);
  }
  function getCharmPrice() {
    return 250 + (gameState.upgrades.charm * 120);
  }
  function getEyePrice() {
    return 350 + (gameState.upgrades.eye * 180);
  }

  // --- Player Progression ---
  function addExp(amount) {
    gameState.currentExp += amount;
    let leveledUp = false;
    while (gameState.currentExp >= gameState.nextExp) {
      gameState.currentExp -= gameState.nextExp;
      gameState.level += 1;
      gameState.nextExp = Math.floor(gameState.nextExp * 1.35);
      gameState.statPoints = (gameState.statPoints || 0) + 3;
      leveledUp = true;
      showToast(`⭐ เลเวลอัป! สู่ระดับ LV. ${gameState.level} (ได้รับ +3 แต้มสเตตัส)`);
    }
    if (leveledUp) {
      gameState.title = getTitleForLevel(gameState.level);
    }
    saveGame();
    renderUI();
  }

  // --- Rolling Pace Calculations for Frenzy ---
  function recordPaceSample(timestamp, distKm) {
    paceSamples.push({ time: timestamp, dist: distKm });
    const cutoff = timestamp - 20000; // เก็บเฉพาะ 20 วินาทีล่าสุด
    paceSamples = paceSamples.filter(s => s.time >= cutoff);
  }

  function getRecentRollingPace() {
    const now = Date.now();
    const cutoff = now - 20000;
    paceSamples = paceSamples.filter(s => s.time >= cutoff);
    if (paceSamples.length < 2) return null;

    const oldest = paceSamples[0];
    const newest = paceSamples[paceSamples.length - 1];
    const dDist = newest.dist - oldest.dist;
    const dTimeSec = (newest.time - oldest.time) / 1000;

    if (dDist >= 0.015 && dTimeSec >= 5) {
      return (dTimeSec / 60) / dDist; // Pace in minutes per km
    }
    return null;
  }

  // --- Damage & Battle Calculations ---
  function applyDistanceDamage(distanceDeltaKm) {
    if (distanceDeltaKm <= 0) return;

    // เควสต์ระยะทาง
    const questDist = gameState.dailyQuests.find(q => q.id === 'dq_dist');
    if (questDist) {
      questDist.current = Math.min(questDist.target, parseFloat((questDist.current + distanceDeltaKm).toFixed(2)));
    }

    // หีบสมบัติสุ่มดรอปทุกๆ 1.0 กม.
    if (runDistanceKm >= nextChestKmCheckpoint) {
      nextChestKmCheckpoint += 1.0;
      if (Math.random() < 0.6) {
        gameState.chestsAvailable += 1;
        showToast('📦 สัญชาตญาณเงาตรวจพบ: คุณค้นพบหีบสมบัติดันเจี้ยน!');
      }
    }

    // คำนวณ STR Bonus + อาวุธจากร้านค้า
    const strMultiplier = 1 + Math.max(0, (gameState.stats.str - 10) * 0.05) + (gameState.upgrades.blade * 0.05);

    // คำนวณ AGI Bonus + เนตรอเวจีจากร้านค้า + โหมด Berserk Frenzy
    let critChance = Math.min(50, (gameState.stats.agi * 0.5) + (gameState.upgrades.eye * 2));
    if (isFrenzyActive) {
      critChance = 100;
    }

    const isCrit = (Math.random() * 100) < critChance;
    const effectiveDamage = distanceDeltaKm * strMultiplier * (isCrit ? 1.8 : 1.0);

    if (isCrit) {
      const questCrit = gameState.dailyQuests.find(q => q.id === 'dq_crit');
      if (questCrit) questCrit.current = Math.min(questCrit.target, questCrit.current + 1);
      showToast(`💥 CRITICAL! ปลดปล่อยดาเมจ x1.8 เท่า`);
    }

    // หักเลือดบอส
    const currentBoss = BOSS_DATABASE[gameState.bossIndex];
    gameState.bossHpRemain = Math.max(0, gameState.bossHpRemain - effectiveDamage);

    if (gameState.bossHpRemain <= 0.001) {
      sessionBossKills += 1;
      gameState.career.totalBossDefeated = (gameState.career.totalBossDefeated || 0) + 1;
      gameState.chestsAvailable += 1;

      const staMultiplier = 1 + Math.max(0, (gameState.stats.sta - 10) * 0.02);
      const charmMultiplier = 1 + (gameState.upgrades.charm * 0.10);
      const streakMultiplier = 1 + Math.min(0.20, (gameState.streak.count - 1) * 0.02);
      const totalGoldMultiplier = staMultiplier * charmMultiplier * streakMultiplier;

      const rewardExp = Math.floor(currentBoss.rewardExp * staMultiplier);
      const rewardGold = Math.floor(currentBoss.rewardGold * totalGoldMultiplier);

      showToast(`🏆 สยบ ${currentBoss.name}! ได้รับ +${rewardExp} EXP & +${rewardGold} เหรียญ & 📦 1 หีบ`);
      addExp(rewardExp);
      gameState.gold += rewardGold;

      const questBoss = gameState.dailyQuests.find(q => q.id === 'dq_boss');
      if (questBoss) questBoss.current = Math.min(questBoss.target, questBoss.current + 1);

      if (currentBoss.tier === 'TIER III') {
        const achDragon = gameState.achievements.find(a => a.id === 'ach_boss_dragon');
        if (achDragon) achDragon.current = Math.min(achDragon.target, achDragon.current + 1);
      }

      gameState.bossIndex = (gameState.bossIndex + 1) % BOSS_DATABASE.length;
      const nextBoss = BOSS_DATABASE[gameState.bossIndex];
      gameState.bossHpRemain = nextBoss.maxHpKm;
    }

    saveGame();
    renderHUD();
  }

  // --- Open Mystery Chest Logic ---
  function openMysteryChest() {
    if (gameState.chestsAvailable <= 0) return;
    gameState.chestsAvailable -= 1;

    const roll = Math.random();
    if (roll < 0.45) {
      const goldDrop = Math.floor(100 + Math.random() * 200);
      gameState.gold += goldDrop;
      showToast(`🎁 เปิดหีบสำเร็จ! พบถุงทองโบราณ +${goldDrop} 🪙`);
    } else if (roll < 0.85) {
      const expDrop = Math.floor(800 + Math.random() * 1000);
      showToast(`🎁 เปิดหีบสำเร็จ! ดูดซับผลึกวิญญาณ +${expDrop} EXP`);
      addExp(expDrop);
    } else {
      gameState.statPoints = (gameState.statPoints || 0) + 1;
      showToast(`🌟 JACKPOT! หีบสมบัติมอบ +1 แต้มสเตตัสอิสระ!`);
    }

    saveGame();
    renderUI();
  }

  btnOpenChest.addEventListener('click', openMysteryChest);

  // --- Modular UI Renderers (แก้ปัญหา DOM Thrashing & แบตไหล) ---
  function renderHUD() {
    // ผู้เล่น & สเตตัส
    playerTitleEl.textContent = gameState.title || getTitleForLevel(gameState.level);
    playerLevelEl.textContent = `LV. ${gameState.level}`;
    const expPercent = Math.min(100, Math.round((gameState.currentExp / gameState.nextExp) * 100));
    expBarFillEl.style.width = `${expPercent}%`;
    expCurrentEl.textContent = gameState.currentExp;
    expNextEl.textContent = gameState.nextExp;
    goldValueEl.textContent = gameState.gold;
    streakValEl.textContent = gameState.streak.count || 1;

    const hasPoints = (gameState.statPoints || 0) > 0;
    statPointsBarEl.style.display = hasPoints ? 'block' : 'none';
    statPointsValEl.textContent = gameState.statPoints || 0;

    [btnAddStr, btnAddSta, btnAddAgi].forEach(btn => {
      btn.classList.toggle('active', hasPoints);
    });

    statStrEl.textContent = gameState.stats.str;
    statStaEl.textContent = gameState.stats.sta;
    statAgiEl.textContent = gameState.stats.agi;

    const currentStrMult = (1 + Math.max(0, (gameState.stats.str - 10) * 0.05) + (gameState.upgrades.blade * 0.05)).toFixed(2);
    strMultEl.textContent = currentStrMult;
    staMultEl.textContent = Math.round(Math.max(0, (gameState.stats.sta - 10) * 2));
    
    let baseCrit = Math.min(50, (gameState.stats.agi * 0.5) + (gameState.upgrades.eye * 2)).toFixed(1);
    if (isFrenzyActive) {
      agiCritEl.textContent = '100 (FRENZY)';
    } else {
      agiCritEl.textContent = baseCrit;
    }

    // บอส
    const boss = BOSS_DATABASE[gameState.bossIndex];
    bossTierEl.textContent = boss.tier;
    bossAvatarEl.textContent = boss.avatar;
    bossNameEl.textContent = boss.name;
    bossDescEl.textContent = boss.desc;
    bossHpMaxEl.textContent = boss.maxHpKm.toFixed(2);
    bossHpRemainEl.textContent = gameState.bossHpRemain.toFixed(2);
    const hpPercent = Math.max(0, Math.min(100, (gameState.bossHpRemain / boss.maxHpKm) * 100));
    bossHpBarEl.style.width = `${hpPercent}%`;

    // หีบสมบัติ
    if (gameState.chestsAvailable > 0) {
      chestCardEl.style.display = 'block';
      chestCountEl.textContent = gameState.chestsAvailable;
    } else {
      chestCardEl.style.display = 'none';
    }

    // ตัววัดการวิ่ง
    distanceValEl.textContent = runDistanceKm.toFixed(2);
    const calValue = Math.floor(runDistanceKm * 65);
    calValEl.textContent = `${calValue} kcal`;
    updatePace();

    // อัปเดต Pocket Overlay
    pocketDistVal.textContent = `${runDistanceKm.toFixed(2)} KM`;
    pocketTimeVal.textContent = timeValEl.textContent;

    // ตรวจสอบสถานะปุ่มซื้อในร้าน
    btnBuyBlade.disabled = gameState.gold < getBladePrice();
    btnBuyCharm.disabled = gameState.gold < getCharmPrice();
    btnBuyEye.disabled = gameState.gold < getEyePrice();
    btnBuyElixir.disabled = gameState.gold < 150;
  }

  function renderShop() {
    lvlBladeEl.textContent = gameState.upgrades.blade;
    bladeBonusEl.textContent = gameState.upgrades.blade * 5;
    priceBladeEl.textContent = getBladePrice();

    lvlCharmEl.textContent = gameState.upgrades.charm;
    charmBonusEl.textContent = gameState.upgrades.charm * 10;
    priceCharmEl.textContent = getCharmPrice();

    lvlEyeEl.textContent = gameState.upgrades.eye;
    eyeBonusEl.textContent = gameState.upgrades.eye * 2;
    priceEyeEl.textContent = getEyePrice();
  }

  function renderQuestsList() {
    questsListEl.innerHTML = '';
    gameState.dailyQuests.forEach((quest) => {
      const isDone = quest.current >= quest.target;
      const pct = Math.min(100, Math.round((quest.current / quest.target) * 100));

      const card = document.createElement('div');
      card.className = `quest-card ${isDone ? 'completed' : ''}`;
      card.innerHTML = `
        <div class="quest-title-row">
          <span class="quest-name">${quest.name}</span>
          <span class="quest-reward">+${quest.rewardExp} EXP / +${quest.rewardGold}G</span>
        </div>
        <div class="quest-progress-bar">
          <div class="quest-progress-fill" style="width: ${pct}%;"></div>
        </div>
        <div class="quest-footer">
          <span>ความคืบหน้า: ${quest.current}/${quest.target} ${quest.unit}</span>
          ${isDone && !quest.claimed
            ? `<button class="btn-claim-quest" data-qid="${quest.id}">รับรางวัล</button>`
            : quest.claimed ? `<span>✓ สำเร็จแล้ว</span>` : `<span>ยังไม่เสร็จ</span>`}
        </div>
      `;
      questsListEl.appendChild(card);
    });

    document.querySelectorAll('.btn-claim-quest').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const qid = e.target.getAttribute('data-qid');
        const q = gameState.dailyQuests.find(item => item.id === qid);
        if (q && !q.claimed) {
          q.claimed = true;
          gameState.gold += q.rewardGold;
          addExp(q.rewardExp);
          showToast(`🎁 เคลมภารกิจสำเร็จ! +${q.rewardGold} ทอง`);
          saveGame();
          renderUI();
        }
      });
    });
  }

  function renderAchievementsList() {
    let claimedAchCount = 0;
    achievementsListEl.innerHTML = '';
    gameState.achievements.forEach(ach => {
      if (ach.claimed) claimedAchCount++;
      const isDone = ach.current >= ach.target;
      const pct = Math.min(100, Math.round((ach.current / ach.target) * 100));

      const card = document.createElement('div');
      card.className = `achievement-card ${isDone ? 'completed' : ''}`;
      card.innerHTML = `
        <div class="quest-title-row">
          <div>
            <span class="quest-name">🏅 ${ach.name}</span>
            <div style="font-size: 0.65rem; color: #a1a1aa; margin-top: 2px;">${ach.desc}</div>
          </div>
          <span class="quest-reward">+${ach.rewardExp} EXP / +${ach.rewardGold}G</span>
        </div>
        <div class="quest-progress-bar">
          <div class="quest-progress-fill" style="width: ${pct}%;"></div>
        </div>
        <div class="quest-footer">
          <span>ความคืบหน้า: ${ach.current}/${ach.target} ${ach.unit}</span>
          ${isDone && !ach.claimed
            ? `<button class="btn-claim-ach" data-aid="${ach.id}">รับรางวัลเกียรติยศ</button>`
            : ach.claimed ? `<span>✓ ปลดล็อกแล้ว</span>` : `<span>ยังไม่ปลดล็อก</span>`}
        </div>
      `;
      achievementsListEl.appendChild(card);
    });
    achievementsCounterEl.textContent = `${claimedAchCount}/${gameState.achievements.length} สำเร็จ`;

    document.querySelectorAll('.btn-claim-ach').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const aid = e.target.getAttribute('data-aid');
        const a = gameState.achievements.find(item => item.id === aid);
        if (a && !a.claimed) {
          a.claimed = true;
          gameState.gold += a.rewardGold;
          addExp(a.rewardExp);
          showToast(`🏆 ปลดล็อกเกียรติยศ! +${a.rewardGold} ทอง & EXP`);
          saveGame();
          renderUI();
        }
      });
    });
  }

  function renderCareerUI() {
    careerDistanceEl.textContent = `${(gameState.career.totalDistanceKm || 0).toFixed(2)} กม.`;
    careerTimeEl.textContent = formatTime(gameState.career.totalSeconds || 0);
    careerBossesEl.textContent = `${gameState.career.totalBossDefeated || 0} ตัว`;
    careerLongestEl.textContent = `${(gameState.career.longestRunKm || 0).toFixed(2)} กม.`;
  }

  function renderUI() {
    renderHUD();
    renderShop();
    renderQuestsList();
    renderAchievementsList();
    renderCareerUI();
  }

  // --- Shop Purchase Handlers ---
  btnBuyElixir.addEventListener('click', () => {
    if (gameState.gold >= 150) {
      gameState.gold -= 150;
      gameState.statPoints = (gameState.statPoints || 0) + 1;
      showToast('🧪 ดื่มน้ำยาจิตวิญญาณ: ได้รับ +1 แต้มสเตตัส!');
      saveGame();
      renderUI();
    }
  });

  btnBuyBlade.addEventListener('click', () => {
    const cost = getBladePrice();
    if (gameState.gold >= cost) {
      gameState.gold -= cost;
      gameState.upgrades.blade += 1;
      showToast(`🗡️ ตีบวกดาบเงาเป็น Lv.${gameState.upgrades.blade} (+${gameState.upgrades.blade * 5}% ดาเมจ)!`);
      saveGame();
      renderUI();
    }
  });

  btnBuyCharm.addEventListener('click', () => {
    const cost = getCharmPrice();
    if (gameState.gold >= cost) {
      gameState.gold -= cost;
      gameState.upgrades.charm += 1;
      showToast(`🧿 เสริมพลังเครื่องรางเป็น Lv.${gameState.upgrades.charm} (+${gameState.upgrades.charm * 10}% ทอง)!`);
      saveGame();
      renderUI();
    }
  });

  btnBuyEye.addEventListener('click', () => {
    const cost = getEyePrice();
    if (gameState.gold >= cost) {
      gameState.gold -= cost;
      gameState.upgrades.eye += 1;
      showToast(`👁️ เบิกเนตรอเวจีเป็น Lv.${gameState.upgrades.eye} (+${gameState.upgrades.eye * 2}% คริติคอล)!`);
      saveGame();
      renderUI();
    }
  });

  // --- Timers & Pace Helpers ---
  function formatTime(totalSecs) {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function calculatePace(totalSecs, distanceKm) {
    const displayDist = Math.round(distanceKm * 100) / 100;
    if (displayDist >= 0.02 && totalSecs > 0) {
      const paceDec = (totalSecs / 60) / distanceKm;
      if (paceDec > 30 || paceDec < 2) {
        return `--'--"`;
      }
      const paceMin = Math.floor(paceDec);
      let paceSec = Math.round((paceDec - paceMin) * 60);
      if (paceSec === 60) {
        return `${paceMin + 1}'00"`;
      }
      return `${paceMin}'${paceSec.toString().padStart(2, '0')}"`;
    }
    return `--'--"`;
  }

  function updatePace() {
    paceValEl.textContent = calculatePace(runSeconds, runDistanceKm);
  }

  // --- Render Run History & Daily Statistics from IndexedDB ---
  async function renderHistoryAndDailyUI() {
    const history = await DB.getAllRunHistory();
    historyCountEl.textContent = `${history.length} รอบ`;

    // 1. Sessions History List
    historyListEl.innerHTML = '';
    if (history.length === 0) {
      historyListEl.innerHTML = '<div class="history-empty">ยังไม่มีประวัติการล่า จงเริ่มออกวิ่งรอบแรก!</div>';
    } else {
      history.slice(0, 15).forEach(item => {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
          <div class="history-header">
            <span class="history-date">${item.displayDate}</span>
            ${item.bossKills > 0 ? `<span class="history-boss-tag">โค่นบอส ${item.bossKills} ตัว</span>` : ''}
          </div>
          <div class="history-metrics">
            <div class="history-metric-item">
              <span class="h-lbl">ระยะทาง</span>
              <span class="h-val">${item.distanceKm.toFixed(2)} กม.</span>
            </div>
            <div class="history-metric-item">
              <span class="h-lbl">เวลา</span>
              <span class="h-val">${item.formattedTime}</span>
            </div>
            <div class="history-metric-item">
              <span class="h-lbl">เพซ</span>
              <span class="h-val">${item.pace}</span>
            </div>
            <div class="history-metric-item">
              <span class="h-lbl">แคลอรี</span>
              <span class="h-val">${item.calories}</span>
            </div>
          </div>
        `;
        historyListEl.appendChild(card);
      });
    }

    // 2. Daily Statistics
    dailyListEl.innerHTML = '';
    if (history.length === 0) {
      dailyListEl.innerHTML = '<div class="history-empty">ยังไม่มีสถิติรายวัน เริ่มออกล่าเพื่อเก็บสถิติ!</div>';
      return;
    }

    const dailyMap = new Map();
    history.forEach(item => {
      const dateObj = new Date(item.timestamp);
      const dateKey = dateObj.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        weekday: 'short'
      });

      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, {
          dateStr: dateKey,
          totalDistance: 0.0,
          totalSeconds: 0,
          totalCalories: 0,
          totalBossKills: 0,
          runsCount: 0,
          latestTimestamp: item.timestamp
        });
      }

      const dayRecord = dailyMap.get(dateKey);
      dayRecord.totalDistance += item.distanceKm;
      dayRecord.totalSeconds += item.durationSeconds;
      dayRecord.totalCalories += item.calories;
      dayRecord.totalBossKills += (item.bossKills || 0);
      dayRecord.runsCount += 1;
    });

    const sortedDays = Array.from(dailyMap.values()).sort((a, b) => b.latestTimestamp - a.latestTimestamp);

    sortedDays.forEach(day => {
      const avgPace = calculatePace(day.totalSeconds, day.totalDistance);
      const card = document.createElement('div');
      card.className = 'daily-card';
      card.innerHTML = `
        <div class="daily-card-header">
          <span class="daily-date-title">📅 ${day.dateStr}</span>
          <span class="daily-runs-tag">${day.runsCount} รอบวิ่ง</span>
        </div>
        <div class="daily-summary-row">
          <div>
            <span class="daily-distance-big">${day.totalDistance.toFixed(2)}</span>
            <span class="daily-distance-unit">กิโลเมตร</span>
          </div>
          ${day.totalBossKills > 0 ? `<span class="daily-bosses-badge">🏆 พิชิตบอส ${day.totalBossKills} ตัว</span>` : ''}
        </div>
        <div class="daily-sub-grid">
          <div class="daily-grid-col">
            <span class="dg-lbl">เวลารวม</span>
            <span class="dg-val">${formatTime(day.totalSeconds)}</span>
          </div>
          <div class="daily-grid-col">
            <span class="dg-lbl">เพซเฉลี่ย</span>
            <span class="dg-val">${avgPace}</span>
          </div>
          <div class="daily-grid-col">
            <span class="dg-lbl">แคลอรีรวม</span>
            <span class="dg-val">${day.totalCalories} kcal</span>
          </div>
        </div>
      `;
      dailyListEl.appendChild(card);
    });
  }

  // --- Tab Control Switcher ---
  tabBtnDaily.addEventListener('click', () => {
    tabBtnDaily.classList.add('active');
    tabBtnSessions.classList.remove('active');
    viewDaily.style.display = 'block';
    viewSessions.style.display = 'none';
  });

  tabBtnSessions.addEventListener('click', () => {
    tabBtnSessions.classList.add('active');
    tabBtnDaily.classList.remove('active');
    viewSessions.style.display = 'block';
    viewDaily.style.display = 'none';
  });

  // --- Pocket Mode Touch Shield Logic (แก้ไข Bug Zombie Interval & Lock Stalling) ---
  let unlockProgress = 0;
  let unlockInterval = null;

  function cancelUnlockHold() {
    if (unlockInterval !== null) {
      clearInterval(unlockInterval);
      unlockInterval = null;
    }
    unlockProgress = 0;
    pocketUnlockBar.style.width = '0%';
  }

  function startUnlockHold(e) {
    if (e) e.preventDefault();
    cancelUnlockHold(); // เคลียร์ Interval และความคืบหน้าเดิมทิ้งก่อนเสมอ ป้องกัน Zombie Interval

    unlockInterval = setInterval(() => {
      unlockProgress += 10;
      pocketUnlockBar.style.width = `${Math.min(100, unlockProgress)}%`;
      if (unlockProgress >= 100) {
        cancelUnlockHold();
        pocketOverlay.style.display = 'none';
        showToast('🔓 ปลดล็อกหน้าจอเรียบร้อย');
      }
    }, 150);
  }

  // ใช้ Pointer Events ชุดเดียว รองรับทั้งสัมผัสและเมาส์โดยไม่ยิง Event ชนกัน
  pocketOverlay.addEventListener('pointerdown', startUnlockHold);
  pocketOverlay.addEventListener('pointerup', cancelUnlockHold);
  pocketOverlay.addEventListener('pointercancel', cancelUnlockHold);
  pocketOverlay.addEventListener('pointerleave', cancelUnlockHold);

  pocketBtn.addEventListener('click', () => {
    cancelUnlockHold(); // ล้าง Timer และ Reset หลอดปลดล็อกให้หมดจด
    pocketOverlay.style.display = 'flex';
    showToast('🔒 เปิดโหมดพักจอ (แตะค้างเพื่อปลดล็อก)');
  });

  // --- Engine Control (Start / Pause / Finish) ---
  async function startRunEngine() {
    isRunning = true;
    btnToggleRun.classList.add('running');
    btnRunText.textContent = 'หยุดชั่วคราว';
    btnFinishRun.removeAttribute('disabled');

    await acquireWakeLock();

    runTimerInterval = setInterval(() => {
      runSeconds++;
      timeValEl.textContent = formatTime(runSeconds);
      pocketTimeVal.textContent = timeValEl.textContent;
      updatePace();

      // เควสต์เวลา
      const questTime = gameState.dailyQuests.find(q => q.id === 'dq_time');
      if (questTime) {
        questTime.current = Math.min(questTime.target, questTime.current + 1);
      }

      // เควสต์แคลอรี
      const questCal = gameState.dailyQuests.find(q => q.id === 'dq_cal');
      if (questCal) {
        questCal.current = Math.min(questCal.target, Math.floor(runDistanceKm * 65));
      }

      // คำนวณสถานะ Berserk / Shadow Frenzy ด้วย Recent Rolling Pace (20 วิ ล่าสุด)
      if (runDistanceKm >= 0.05 && runSeconds > 10) {
        const rollingPace = getRecentRollingPace();
        if (rollingPace !== null && rollingPace <= 6.5 && rollingPace >= 2.0) {
          frenzyPaceStreakSec++;
          if (frenzyPaceStreakSec >= 10 && !isFrenzyActive) {
            isFrenzyActive = true;
            runHudEl.classList.add('frenzy-active');
            frenzyBannerEl.style.display = 'block';
            showToast('⚡ SHADOW FRENZY ปะทุ! พลังโจมตีติดคริติคอล 100%');
          }
        } else if (rollingPace !== null && rollingPace > 6.5) {
          frenzyPaceStreakSec = 0;
          if (isFrenzyActive) {
            isFrenzyActive = false;
            runHudEl.classList.remove('frenzy-active');
            frenzyBannerEl.style.display = 'none';
          }
        }
      }
    }, 1000);

    // Geolocation Watch
    if (!isSimMode && 'geolocation' in navigator) {
      gpsStatusEl.textContent = 'GPS: กำลังเชื่อมสัญญาณ...';
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          gpsStatusEl.textContent = 'GPS: ล็อกพิกัดแล้ว 🟢';
          const { latitude, longitude, accuracy } = pos.coords;

          // กรองพิกัดที่ความแม่นยำต่ำ
          if (accuracy > 25) return;

          const now = Date.now();
          if (!lastCoord) {
            lastCoord = { latitude, longitude, time: now };
            return;
          }

          const deltaKm = calculateDistance(lastCoord.latitude, lastCoord.longitude, latitude, longitude);
          const timeDeltaSec = (now - (lastCoord.time || now)) / 1000;

          // กรอง GPS Drift: ต้องเคลื่อนที่มากกว่า 3 เมตร และเวลาห่างเกิน 1 วินาที
          if (deltaKm >= 0.003 && timeDeltaSec >= 1) {
            const speedKmh = deltaKm / (timeDeltaSec / 3600);

            // กรองความเร็วให้อยู่ในสปีดการวิ่งจริง (1.5 - 35 กม./ชม.)
            if (speedKmh >= 1.5 && speedKmh <= 35) {
              runDistanceKm += deltaKm;
              recordPaceSample(now, runDistanceKm);
              applyDistanceDamage(deltaKm);
              lastCoord = { latitude, longitude, time: now };
            } else if (speedKmh > 35) {
              // ความเร็วเกิน (เช่น นั่งรถ) รีเซ็ตพิกัดโดยไม่นับระยะ
              lastCoord = { latitude, longitude, time: now };
            }
          }

          renderHUD();
        },
        (err) => {
          gpsStatusEl.textContent = 'GPS: ไม่พบสัญญาณ ⚠️';
          console.warn('GPS Error', err);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
      );
    } else if (isSimMode) {
      gpsStatusEl.textContent = 'โหมด: จำลองระยะทาง 🏃';
    }
  }

  function pauseRunEngine() {
    isRunning = false;
    btnToggleRun.classList.remove('running');
    btnRunText.textContent = 'ออกล่าต่อ';
    clearInterval(runTimerInterval);
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    lastCoord = null;
    gpsStatusEl.textContent = 'GPS: หยุดชั่วคราว';

    isFrenzyActive = false;
    runHudEl.classList.remove('frenzy-active');
    frenzyBannerEl.style.display = 'none';

    releaseWakeLock();
  }

  async function finishRunSession() {
    // ป้องกันการบันทึก Empty Session (ระยะทางน้อยกว่า 50 เมตร)
    if (runDistanceKm < 0.05) {
      const confirmDiscard = confirm('ระยะทางวิ่งน้อยกว่า 0.05 กม. (50 เมตร) คุณต้องการยกเลิกรอบนี้โดยไม่บันทึกประวัติหรือไม่?');
      if (confirmDiscard) {
        pauseRunEngine();
        cancelUnlockHold();
        pocketOverlay.style.display = 'none';
        runDistanceKm = 0.0;
        runSeconds = 0;
        sessionBossKills = 0;
        paceSamples = [];
        timeValEl.textContent = '00:00:00';
        paceValEl.textContent = `--'--"`;
        btnRunText.textContent = 'เริ่มออกล่า';
        btnFinishRun.setAttribute('disabled', 'true');
        renderUI();
        showToast('ยกเลิกรอบการล่าเรียบร้อย');
      }
      return;
    }

    pauseRunEngine();
    cancelUnlockHold();
    pocketOverlay.style.display = 'none';
    showToast(`🏁 จบการออกล่า! สะสมระยะทางได้ ${runDistanceKm.toFixed(2)} กม.`);

    // EXP โบนัสจากการวิ่ง
    const staMultiplier = 1 + Math.max(0, (gameState.stats.sta - 10) * 0.02);
    const bonusExp = Math.floor(runDistanceKm * 800 * staMultiplier);
    if (bonusExp > 0) {
      addExp(bonusExp);
    }

    // อัปเดต Career Stats สะสม
    gameState.career.totalRuns = (gameState.career.totalRuns || 0) + 1;
    gameState.career.totalDistanceKm = parseFloat(((gameState.career.totalDistanceKm || 0) + runDistanceKm).toFixed(2));
    gameState.career.totalSeconds = (gameState.career.totalSeconds || 0) + runSeconds;
    if (runDistanceKm > (gameState.career.longestRunKm || 0)) {
      gameState.career.longestRunKm = parseFloat(runDistanceKm.toFixed(2));
    }

    // อัปเดต Achievement
    const achFirst = gameState.achievements.find(a => a.id === 'ach_first');
    if (achFirst) achFirst.current = Math.min(achFirst.target, achFirst.current + 1);

    const ach10 = gameState.achievements.find(a => a.id === 'ach_dist10');
    if (ach10) ach10.current = Math.min(ach10.target, gameState.career.totalDistanceKm);

    const ach50 = gameState.achievements.find(a => a.id === 'ach_dist50');
    if (ach50) ach50.current = Math.min(ach50.target, gameState.career.totalDistanceKm);

    // บันทึกประวัติเข้าสู่ IndexedDB
    const historyItem = {
      timestamp: Date.now(),
      displayDate: new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }),
      distanceKm: runDistanceKm,
      durationSeconds: runSeconds,
      formattedTime: formatTime(runSeconds),
      pace: paceValEl.textContent,
      calories: Math.floor(runDistanceKm * 65),
      bossKills: sessionBossKills,
      expGained: bonusExp
    };

    await DB.addRunRecord(historyItem);

    // รีเซ็ตตัวแปรเซสชัน
    runDistanceKm = 0.0;
    runSeconds = 0;
    sessionBossKills = 0;
    nextChestKmCheckpoint = 1.0;
    frenzyPaceStreakSec = 0;
    paceSamples = [];
    timeValEl.textContent = '00:00:00';
    paceValEl.textContent = `--'--"`;
    btnRunText.textContent = 'เริ่มออกล่า';
    btnFinishRun.setAttribute('disabled', 'true');

    saveGame();
    renderUI();
    await renderHistoryAndDailyUI();
  }

  // --- Stat Allocation Handlers ---
  function upgradeStat(statKey) {
    if ((gameState.statPoints || 0) > 0) {
      gameState.statPoints -= 1;
      gameState.stats[statKey] += 1;
      showToast(`💪 เสริมพลัง ${statKey.toUpperCase()} เป็น ${gameState.stats[statKey]}!`);
      saveGame();
      renderUI();
    }
  }

  btnAddStr.addEventListener('click', () => upgradeStat('str'));
  btnAddSta.addEventListener('click', () => upgradeStat('sta'));
  btnAddAgi.addEventListener('click', () => upgradeStat('agi'));

  // --- Simulator Mode Handlers ---
  window.shadowStrider = {
    simulateStep(km) {
      if (!isRunning) {
        showToast('กรุณากด "เริ่มออกล่า" ก่อนเพื่อบันทึกระยะ');
        return;
      }
      runDistanceKm += km;
      recordPaceSample(Date.now(), runDistanceKm);
      applyDistanceDamage(km);
      renderHUD();
      showToast(`⚡ จำลองวิ่งก้าวหน้า +${(km * 1000).toFixed(0)} เมตร!`);
    }
  };

  // --- Event Listeners ---
  btnToggleRun.addEventListener('click', () => {
    if (!isRunning) {
      startRunEngine();
    } else {
      pauseRunEngine();
    }
  });

  btnFinishRun.addEventListener('click', () => {
    finishRunSession();
  });

  simToggleBtn.addEventListener('click', () => {
    isSimMode = !isSimMode;
    simToggleBtn.classList.toggle('active', isSimMode);
    simToggleBtn.textContent = `โหมดจำลองวิ่ง: ${isSimMode ? 'เปิด' : 'ปิด'}`;
    simControls.style.display = isSimMode ? 'flex' : 'none';
    showToast(isSimMode ? 'เปิดโหมดจำลองวิ่ง (เทสต์ในห้องได้)' : 'ปิดโหมดจำลอง กลับสู่ระบบ GPS จริง');
  });

  // Service Worker Registration
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(err => {
        console.log('SW registration failed:', err);
      });
    });
  }

  // --- Initialize Application ---
  await loadGameState();
  renderUI();
  await renderHistoryAndDailyUI();
})();
