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
    },
    async clearAndRestoreAll(playerData, historyData) {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_PLAYER, STORE_HISTORY], 'readwrite');
        const pStore = tx.objectStore(STORE_PLAYER);
        const hStore = tx.objectStore(STORE_HISTORY);

        pStore.clear();
        hStore.clear();

        pStore.put({ key: 'current', data: playerData, updatedAt: Date.now() });
        historyData.forEach(item => {
          delete item.id;
          hStore.add(item);
        });

        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
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

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && isRunning && wakeLockSentinel === null) {
      await acquireWakeLock();
    }
  });

  // --- Web Speech Synthesis Narrative Engine ---
  let isVoiceEnabled = true;

  function speakVoice(text, isUrgent = false) {
    if (!isVoiceEnabled || !('speechSynthesis' in window)) return;
    if (isUrgent) {
      window.speechSynthesis.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'th-TH';
    utterance.rate = 1.05;
    utterance.pitch = 0.95;
    window.speechSynthesis.speak(utterance);
  }

  // --- Boss List Database & Lore ---
  const BOSS_DATABASE = [
    { id: 'boss_1', tier: 'TIER I', name: 'Gargoyle of the Crypt', avatar: '👹', maxHpKm: 1.0, desc: 'อสูรหินเฝ้าประตูสุสาน จงวิ่ง 1.00 กม. เพื่อทำลายมัน!', rewardExp: 1200, rewardGold: 150 },
    { id: 'boss_2', tier: 'TIER II', name: 'Abyssal Blood Knight', avatar: '🤺', maxHpKm: 2.5, desc: 'อัศวินเกราะดำกระหายการต่อสู้ วิ่ง 2.50 กม. เพื่อสยบดาบโลหิต!', rewardExp: 3200, rewardGold: 350 },
    { id: 'boss_3', tier: 'TIER III', name: 'Ancient Bone Dragon', avatar: '🐉', maxHpKm: 5.0, desc: 'มังกรกระดูกบรรพกาล วิ่งสะสม 5.00 กม. เพื่อปิดผนึกลมหายใจมรณะ!', rewardExp: 7500, rewardGold: 800 }
  ];

  function getTitleForLevel(level) {
    if (level >= 25) return 'Shadow Sovereign';
    if (level >= 20) return 'Dread Champion';
    if (level >= 15) return 'Abyssal Dreadnought';
    if (level >= 10) return 'Abyss Stalker';
    if (level >= 5) return 'Crypt Slayer';
    return 'Shadow Initiate';
  }

  function generateDailyQuests() {
    return [
      { id: 'dq_dist', name: 'สำรวจเงามืด: สะสมระยะทาง 1.5 กม.', target: 1.5, current: 0.0, unit: 'กม.', rewardExp: 600, rewardGold: 60, claimed: false },
      { id: 'dq_time', name: 'สมาธินักล่า: วิ่งต่อเนื่อง 12 นาที', target: 720, current: 0, unit: 'วินาที', rewardExp: 700, rewardGold: 70, claimed: false },
      { id: 'dq_cal', name: 'ผลาญพลังเวท: เผาผลาญ 100 kcal', target: 100, current: 0, unit: 'kcal', rewardExp: 500, rewardGold: 50, claimed: false },
      { id: 'dq_boss', name: 'ปราบบอส: โค่นบอส 1 ตัว', target: 1, current: 0, unit: 'ตัว', rewardExp: 900, rewardGold: 100, claimed: false },
      { id: 'dq_crit', name: 'จุดตาย: โจมตีคริติคอล 5 ครั้ง', target: 5, current: 0, unit: 'ครั้ง', rewardExp: 750, rewardGold: 80, claimed: false }
    ];
  }

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
    equipment: { weapon: null, armor: null, boots: null, relic: null },
    inventory: [],
    bestiary: {
      boss_1: { kills: 0, name: 'Gargoyle of the Crypt' },
      boss_2: { kills: 0, name: 'Abyssal Blood Knight' },
      boss_3: { kills: 0, name: 'Ancient Bone Dragon' }
    },
    chestsAvailable: 0,
    streak: { count: 1, lastDate: new Date().toDateString() },
    bossIndex: 0,
    bossHpRemain: 1.0,
    totalDistanceKm: 0.0,
    maxHr: 178, // ค่ามาตรฐาน Max HR (220 - 42)
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
      gameState.equipment = Object.assign({}, defaultState.equipment, saved.equipment || {});
      gameState.inventory = saved.inventory || [];
      gameState.bestiary = Object.assign({}, defaultState.bestiary, saved.bestiary || {});
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
  let currentGpxTrack = [];

  // Heart Rate & Zone Variables (Web Bluetooth API)
  let bluetoothDevice = null;
  let hrCharacteristic = null;
  let currentHeartRate = 0;
  let currentHrZone = 0;
  let previousHrZone = 0;
  let isBleConnected = false;

  // Berserk / Frenzy (Zone 3 Only)
  let isFrenzyActive = false;
  let nextChestKmCheckpoint = 1.0;
  let nextKmAnnounceCheckpoint = 1.0;
  let paceSamples = [];

  // --- Item Generator ---
  const ITEM_NAMES = {
    weapon: ['ดาบสั้นเงา', 'ดาบใหญ่ทมิฬ', 'เคียวมรณะ', 'ดาบโบราณ'],
    armor: ['เสื้อเกราะหนังเงา', 'เกราะเหล็กอสูร', 'ผ้าคลุมวิญญาณ', 'เกราะเพลทอเวจี'],
    boots: ['รองเท้าก้าวมัจจุราช', 'รองเท้าเกราะทมิฬ', 'รองเท้าลมกรดเงา', 'สนับแข้งแห่งสายลม'],
    relic: ['แหวนวิญญาณบาป', 'จี้หยดโลหิต', 'เครื่องรางตาเหยี่ยว', 'หินมนตราโบราณ']
  };

  function rollRandomItem() {
    const types = ['weapon', 'armor', 'boots', 'relic'];
    const type = types[Math.floor(Math.random() * types.length)];
    const roll = Math.random();

    let rarity = 'common';
    let mainStatVal = 5;
    let subStatVal = 0;

    if (roll < 0.05) {
      rarity = 'legendary';
      mainStatVal = 25;
      subStatVal = 10;
    } else if (roll < 0.20) {
      rarity = 'epic';
      mainStatVal = 18;
      subStatVal = 6;
    } else if (roll < 0.50) {
      rarity = 'rare';
      mainStatVal = 12;
      subStatVal = 3;
    } else {
      rarity = 'common';
      mainStatVal = 6;
    }

    const nameList = ITEM_NAMES[type];
    const name = nameList[Math.floor(Math.random() * nameList.length)];
    const icons = { weapon: '🗡️', armor: '🛡️', boots: '🥾', relic: '🧿' };

    return {
      id: `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: `${name} [${rarity.toUpperCase()}]`,
      type,
      rarity,
      mainStatVal,
      subStatVal,
      icon: icons[type],
      goldValue: rarity === 'legendary' ? 400 : rarity === 'epic' ? 180 : rarity === 'rare' ? 80 : 30
    };
  }

  function calculateEquipmentBonuses() {
    let bonusDmg = 0;
    let bonusSta = 0;
    let bonusCrit = 0;
    let bonusGold = 0;

    const eq = gameState.equipment;
    if (eq.weapon) {
      bonusDmg += eq.weapon.mainStatVal;
      if (eq.weapon.subStatVal) bonusCrit += eq.weapon.subStatVal;
    }
    if (eq.armor) {
      bonusSta += eq.armor.mainStatVal;
      if (eq.armor.subStatVal) bonusDmg += eq.armor.subStatVal;
    }
    if (eq.boots) {
      bonusDmg += eq.boots.mainStatVal;
      if (eq.boots.subStatVal) bonusCrit += eq.boots.subStatVal;
    }
    if (eq.relic) {
      bonusGold += eq.relic.mainStatVal;
      if (eq.relic.subStatVal) bonusSta += eq.relic.subStatVal;
    }

    return { bonusDmg, bonusSta, bonusCrit, bonusGold };
  }

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

  // Heart Rate DOM
  const hrBpmEl = document.getElementById('hr-bpm');
  const hrZoneBadgeEl = document.getElementById('hr-zone-badge');
  const btnBleConnect = document.getElementById('btn-ble-connect');
  const voiceToggleBtn = document.getElementById('voice-toggle-btn');

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

  // Equipment & Modal Elements
  const equipSummaryEl = document.getElementById('equip-summary');
  const inventoryGridEl = document.getElementById('inventory-grid');
  const invCountEl = document.getElementById('inv-count');
  const itemModalEl = document.getElementById('item-modal');
  const modalItemIconEl = document.getElementById('modal-item-icon');
  const modalItemNameEl = document.getElementById('modal-item-name');
  const modalItemRarityEl = document.getElementById('modal-item-rarity');
  const modalMainStatEl = document.getElementById('modal-main-stat');
  const modalSubStatEl = document.getElementById('modal-sub-stat');
  const btnModalEquip = document.getElementById('btn-modal-equip');
  const btnModalSalvage = document.getElementById('btn-modal-salvage');
  const btnModalCancel = document.getElementById('btn-modal-cancel');

  const codexListEl = document.getElementById('codex-list');
  const codexCounterEl = document.getElementById('codex-counter');
  const btnExportBackup = document.getElementById('btn-export-backup');
  const inputImportBackup = document.getElementById('input-import-backup');

  let selectedInventoryItem = null;

  // --- Haversine Distance ---
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

  function showToast(msg) {
    gameToastEl.textContent = msg;
    gameToastEl.classList.add('show');
    setTimeout(() => {
      gameToastEl.classList.remove('show');
    }, 2800);
  }

  function getBladePrice() {
    return 300 + (gameState.upgrades.blade * 150);
  }
  function getCharmPrice() {
    return 250 + (gameState.upgrades.charm * 120);
  }
  function getEyePrice() {
    return 350 + (gameState.upgrades.eye * 180);
  }

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
      speakVoice(`เลเวลอัป สู่ระดับ ${gameState.level}`);
    }
    if (leveledUp) {
      gameState.title = getTitleForLevel(gameState.level);
    }
    saveGame();
    renderUI();
  }

  function recordPaceSample(timestamp, distKm) {
    paceSamples.push({ time: timestamp, dist: distKm });
    const cutoff = timestamp - 20000;
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
      return (dTimeSec / 60) / dDist;
    }
    return null;
  }

  // --- Heart Rate Zone Calculator & State Evaluator ---
  function calculateHrZone(bpm, maxHr) {
    if (bpm <= 0) return 0;
    const pct = (bpm / maxHr) * 100;
    if (pct < 60) return 1;       // Zone 1 (<60%)
    if (pct < 70) return 2;       // Zone 2 (60-70%) Shadow Focus
    if (pct < 80) return 3;       // Zone 3 (70-80%) BERSERK FRENZY!
    if (pct < 90) return 4;       // Zone 4 (80-90%) Threshold
    return 5;                     // Zone 5 (>=90%) Danger Alert
  }

  function updateHeartRate(bpm) {
    currentHeartRate = bpm;
    hrBpmEl.textContent = bpm > 0 ? bpm : '--';
    const zone = calculateHrZone(bpm, gameState.maxHr || 178);
    currentHrZone = zone;

    // อัปเดต UI Zone Badge
    hrZoneBadgeEl.className = `hr-zone-badge zone-${zone}`;
    const zoneNames = {
      0: 'ไม่พบสัญญาณ',
      1: 'Zone 1: วอร์มอัป',
      2: 'Zone 2: สมาธิเงา (+EXP)',
      3: 'Zone 3: BERSERK FRENZY! ⚡',
      4: 'Zone 4: เขตพลังสูง',
      5: 'Zone 5: อันตราย! (ผ่อนฝีเท้า)'
    };
    hrZoneBadgeEl.textContent = zoneNames[zone] || `Zone ${zone}`;

    // ตรวจสอบการเปลี่ยนโซนเพื่อส่งเสียงพากย์
    if (zone !== previousHrZone && isRunning) {
      if (zone === 3) {
        speakVoice('เข้าสู่โซนสาม สภาวะเบอร์เซิร์กปะทุ! พลังโจมตีติดคริติคอลร้อยเปอร์เซ็นต์', true);
        showToast('⚡ BERSERK FRENZY: ชีพจร Zone 3 ล็อกเป้า! คริติคอล 100%');
      } else if (zone === 5) {
        speakVoice('คำเตือน! อัตราการเต้นหัวใจสูงเกินพิกัด กรุณาผ่อนฝีเท้าเพื่อความปลอดภัย', true);
        showToast('⚠️ ระวัง! อัตราการเต้นหัวใจแตะ Zone 5 อันตราย');
      } else if (zone === 2) {
        speakVoice('เข้าสู่โซนสอง สมาธิเงาทำงาน ได้รับโบนัสค่าประสบการณ์');
      } else if (previousHrZone === 3 && zone !== 3) {
        speakVoice('หลุดจากโซนสาม สภาวะเบอร์เซิร์กสงบลง');
      }
      previousHrZone = zone;
    }

    // กำหนดสถานะ Frenzy: บังคับให้อยู่แค่ Zone 3 เท่านั้น
    evaluateFrenzyState();
    renderHUD();
  }

  function evaluateFrenzyState() {
    if (isBleConnected) {
      // เมื่อต่อสายวัดหัวใจ: Berserk ทำงานเฉพาะใน Zone 3
      if (currentHrZone === 3) {
        if (!isFrenzyActive) {
          isFrenzyActive = true;
          runHudEl.classList.add('frenzy-active');
          frenzyBannerEl.style.display = 'block';
        }
      } else {
        if (isFrenzyActive) {
          isFrenzyActive = false;
          runHudEl.classList.remove('frenzy-active');
          frenzyBannerEl.style.display = 'none';
        }
      }
    } else {
      // Fallback: ถ้าไม่ได้ต่อสายวัดหัวใจ ใช้เพซแบบ Tempo (Zone 3 เทียบเท่า 5'45" - 6'30"/กม.)
      if (runDistanceKm >= 0.05 && runSeconds > 10) {
        const rollingPace = getRecentRollingPace();
        if (rollingPace !== null && rollingPace <= 6.5 && rollingPace >= 5.5) {
          if (!isFrenzyActive) {
            isFrenzyActive = true;
            runHudEl.classList.add('frenzy-active');
            frenzyBannerEl.style.display = 'block';
            speakVoice('เข้าสู่เพซจำลองโซนสาม สภาวะเบอร์เซิร์กทำงาน!', true);
          }
        } else if (rollingPace !== null && (rollingPace > 6.5 || rollingPace < 5.0)) {
          if (isFrenzyActive) {
            isFrenzyActive = false;
            runHudEl.classList.remove('frenzy-active');
            frenzyBannerEl.style.display = 'none';
          }
        }
      }
    }
  }

  // --- Web Bluetooth Heart Rate Connection ---
  async function connectBluetoothHeartRate() {
    if (!('bluetooth' in navigator)) {
      alert('เบราว์เซอร์นี้ยังไม่รองรับ Web Bluetooth (แนะนำ Google Chrome บน Android หรือ Bluefy บน iOS)');
      return;
    }

    try {
      showToast('กำลังค้นหาอุปกรณ์วัดชีพจร Bluetooth...');
      bluetoothDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }]
      });

      bluetoothDevice.addEventListener('gattserverdisconnected', onBluetoothDisconnected);

      const server = await bluetoothDevice.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      hrCharacteristic = await service.getCharacteristic('heart_rate_measurement');

      await hrCharacteristic.startNotifications();
      hrCharacteristic.addEventListener('characteristicvaluechanged', handleHeartRateNotification);

      isBleConnected = true;
      btnBleConnect.classList.add('connected');
      btnBleConnect.textContent = `เชื่อมต่อแล้ว: ${bluetoothDevice.name || 'สายคาดอก'}`;
      showToast('🔗 เชื่อมต่อเซนเซอร์วัดชีพจรสำเร็จ!');
      speakVoice('เชื่อมต่อสายวัดหัวใจเรียบร้อย ระบบพร้อมตรวจจับโซน');
    } catch (err) {
      console.warn('Bluetooth connection error:', err);
      showToast('ยกเลิกหรือล้มเหลวในการเชื่อมต่อ Bluetooth');
    }
  }

  function handleHeartRateNotification(event) {
    const value = event.target.value;
    const flags = value.getUint8(0);
    const is16Bit = (flags & 0x01) !== 0;
    let hrValue = 0;
    if (is16Bit) {
      hrValue = value.getUint16(1, true);
    } else {
      hrValue = value.getUint8(1);
    }
    updateHeartRate(hrValue);
  }

  function onBluetoothDisconnected() {
    isBleConnected = false;
    currentHeartRate = 0;
    currentHrZone = 0;
    btnBleConnect.classList.remove('connected');
    btnBleConnect.textContent = '🔗 เชื่อมต่อสายคาดอก BLE';
    updateHeartRate(0);
    showToast('⚠️ สัญญาณสายวัดหัวใจ Bluetooth ขาดการเชื่อมต่อ');
    speakVoice('สายวัดหัวใจตัดการเชื่อมต่อ');
  }

  btnBleConnect.addEventListener('click', () => {
    if (isBleConnected && bluetoothDevice && bluetoothDevice.gatt.connected) {
      bluetoothDevice.gatt.disconnect();
    } else {
      connectBluetoothHeartRate();
    }
  });

  // ปุ่มสลับเปิด/ปิดเสียงพากย์
  voiceToggleBtn.addEventListener('click', () => {
    isVoiceEnabled = !isVoiceEnabled;
    voiceToggleBtn.classList.toggle('muted', !isVoiceEnabled);
    voiceToggleBtn.textContent = `🔊 เสียง: ${isVoiceEnabled ? 'เปิด' : 'ปิด'}`;
    if (isVoiceEnabled) {
      speakVoice('เปิดระบบเสียงผู้ช่วยนำทาง');
    } else {
      window.speechSynthesis.cancel();
      showToast('ปิดระบบเสียงบรรยาย');
    }
  });

  // --- Battle Damage Calculation ---
  function applyDistanceDamage(distanceDeltaKm) {
    if (distanceDeltaKm <= 0) return;

    const questDist = gameState.dailyQuests.find(q => q.id === 'dq_dist');
    if (questDist) {
      questDist.current = Math.min(questDist.target, parseFloat((questDist.current + distanceDeltaKm).toFixed(2)));
    }

    if (runDistanceKm >= nextChestKmCheckpoint) {
      nextChestKmCheckpoint += 1.0;
      if (Math.random() < 0.65) {
        gameState.chestsAvailable += 1;
        showToast('📦 สัญชาตญาณเงาตรวจพบ: คุณค้นพบหีบสมบัติดันเจี้ยน!');
        speakVoice('ค้นพบหีบสมบัติใหม่');
      }
    }

    // เสียงรายงานระยะทางทุก 1 กิโลเมตร
    if (runDistanceKm >= nextKmAnnounceCheckpoint) {
      const currentPace = calculatePace(runSeconds, runDistanceKm);
      const boss = BOSS_DATABASE[gameState.bossIndex];
      const bossRemainPct = Math.round((gameState.bossHpRemain / boss.maxHpKm) * 100);
      speakVoice(`ผ่านไปแล้ว ${Math.floor(runDistanceKm)} กิโลเมตร เพซเฉลี่ย ${currentPace} เลือดบอสเหลืออีก ${bossRemainPct} เปอร์เซ็นต์`);
      nextKmAnnounceCheckpoint += 1.0;
    }

    const eqBonus = calculateEquipmentBonuses();

    // ดาเมจ = STR + อัปเกรดดาบ + ไอเทมสวมใส่ + (Berserk Zone 3 มอบ x1.5 ดาเมจ)
    const frenzyDmgBonus = isFrenzyActive ? 1.5 : 1.0;
    const strMultiplier = (1 + Math.max(0, (gameState.stats.str - 10) * 0.05) + (gameState.upgrades.blade * 0.05) + (eqBonus.bonusDmg * 0.01)) * frenzyDmgBonus;

    // คริติคอล: ถ้า Berserk ใน Zone 3 รับประกัน 100% ทันที
    let critChance = Math.min(65, (gameState.stats.agi * 0.5) + (gameState.upgrades.eye * 2) + eqBonus.bonusCrit);
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

    const currentBoss = BOSS_DATABASE[gameState.bossIndex];
    gameState.bossHpRemain = Math.max(0, gameState.bossHpRemain - effectiveDamage);

    if (gameState.bossHpRemain <= 0.001) {
      sessionBossKills += 1;
      gameState.career.totalBossDefeated = (gameState.career.totalBossDefeated || 0) + 1;
      gameState.chestsAvailable += 1;

      if (!gameState.bestiary[currentBoss.id]) {
        gameState.bestiary[currentBoss.id] = { kills: 0, name: currentBoss.name };
      }
      gameState.bestiary[currentBoss.id].kills += 1;

      // โบนัส Zone 2 (Shadow Focus) มอบ EXP เพิ่มอีก 50%
      const zone2ExpBonus = currentHrZone === 2 ? 1.5 : 1.0;

      const staMultiplier = (1 + Math.max(0, (gameState.stats.sta - 10) * 0.02) + (eqBonus.bonusSta * 0.01)) * zone2ExpBonus;
      const charmMultiplier = 1 + (gameState.upgrades.charm * 0.10) + (eqBonus.bonusGold * 0.01);
      const streakMultiplier = 1 + Math.min(0.20, (gameState.streak.count - 1) * 0.02);
      const totalGoldMultiplier = staMultiplier * charmMultiplier * streakMultiplier;

      const rewardExp = Math.floor(currentBoss.rewardExp * staMultiplier);
      const rewardGold = Math.floor(currentBoss.rewardGold * totalGoldMultiplier);

      showToast(`🏆 สยบ ${currentBoss.name}! +${rewardExp} EXP & +${rewardGold} เหรียญ & 📦 1 หีบ`);
      speakVoice(`สยบ ${currentBoss.name} สำเร็จแล้ว ปิดผนึกชัยชนะ!`, true);
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
    if (roll < 0.35 && gameState.inventory.length < 20) {
      const newItem = rollRandomItem();
      gameState.inventory.push(newItem);
      showToast(`🎁 เปิดหีบพบ: [${newItem.rarity.toUpperCase()}] ${newItem.name}!`);
      speakVoice(`ได้รับอุปกรณ์ระดับ ${newItem.rarity}`);
    } else if (roll < 0.70) {
      const goldDrop = Math.floor(120 + Math.random() * 220);
      gameState.gold += goldDrop;
      showToast(`🎁 เปิดหีบสำเร็จ! พบถุงทองโบราณ +${goldDrop} 🪙`);
    } else if (roll < 0.92) {
      const expDrop = Math.floor(800 + Math.random() * 1000);
      showToast(`🎁 เปิดหีบสำเร็จ! ดูดซับผลึกวิญญาณ +${expDrop} EXP`);
      addExp(expDrop);
    } else {
      gameState.statPoints = (gameState.statPoints || 0) + 1;
      showToast(`🌟 JACKPOT! หีบสมบัติมอบ +1 แต้มสเตตัสอิสระ!`);
      speakVoice('แจ็กพอต ได้รับแต้มสเตตัสอิสระ');
    }

    saveGame();
    renderUI();
  }

  btnOpenChest.addEventListener('click', openMysteryChest);

  // --- Equipment & Inventory UI Renderer ---
  function renderEquipmentAndInventory() {
    const eq = gameState.equipment;
    const eqBonus = calculateEquipmentBonuses();
    equipSummaryEl.textContent = `โบนัส: ดาเมจ +${eqBonus.bonusDmg}% | STA +${eqBonus.bonusSta}% | คริ +${eqBonus.bonusCrit}%`;

    const slots = ['weapon', 'armor', 'boots', 'relic'];
    slots.forEach(slotType => {
      const slotBox = document.getElementById(`slot-${slotType}`);
      const iconEl = document.getElementById(`icon-slot-${slotType}`);
      const nameEl = document.getElementById(`name-slot-${slotType}`);
      const equippedItem = eq[slotType];

      if (equippedItem) {
        slotBox.classList.add('equipped');
        iconEl.textContent = equippedItem.icon;
        nameEl.textContent = equippedItem.name;
      } else {
        slotBox.classList.remove('equipped');
        const defaultIcons = { weapon: '🗡️', armor: '🛡️', boots: '🥾', relic: '🧿' };
        iconEl.textContent = defaultIcons[slotType];
        nameEl.textContent = 'ว่างเปล่า';
      }
    });

    invCountEl.textContent = gameState.inventory.length;
    inventoryGridEl.innerHTML = '';
    if (gameState.inventory.length === 0) {
      inventoryGridEl.innerHTML = '<div style="grid-column: span 4; font-size: 0.68rem; color: #71717a; text-align: center; padding: 15px 0;">กระเป๋าว่างเปล่า ออกล่าเพื่อหาไอเทมจากหีบสมบัติ</div>';
    } else {
      gameState.inventory.forEach(item => {
        const card = document.createElement('div');
        card.className = `inv-item-card rarity-${item.rarity}`;
        card.innerHTML = `
          <span class="inv-item-icon">${item.icon}</span>
          <span class="inv-item-name">${item.name}</span>
        `;
        card.addEventListener('click', () => openItemModal(item));
        inventoryGridEl.appendChild(card);
      });
    }
  }

  function openItemModal(item) {
    selectedInventoryItem = item;
    modalItemIconEl.textContent = item.icon;
    modalItemNameEl.textContent = item.name;
    modalItemRarityEl.textContent = `ระดับ: ${item.rarity.toUpperCase()}`;
    modalItemRarityEl.style.color = `var(--rarity-${item.rarity})`;
    modalMainStatEl.textContent = `ค่าพลังหลัก: +${item.mainStatVal}% (ตามประเภทชิ้นส่วน)`;
    modalSubStatEl.textContent = item.subStatVal ? `ออปชันเสริม: +${item.subStatVal}% คริติคอล/ดาเมจ` : 'ไม่มีออปชันเสริม';
    btnModalSalvage.textContent = `ย่อยเป็น +${item.goldValue} 🪙`;

    itemModalEl.style.display = 'flex';
  }

  function closeItemModal() {
    itemModalEl.style.display = 'none';
    selectedInventoryItem = null;
  }

  btnModalCancel.addEventListener('click', closeItemModal);

  btnModalEquip.addEventListener('click', () => {
    if (!selectedInventoryItem) return;
    const type = selectedInventoryItem.type;
    const currentEquipped = gameState.equipment[type];

    gameState.inventory = gameState.inventory.filter(i => i.id !== selectedInventoryItem.id);
    if (currentEquipped) {
      gameState.inventory.push(currentEquipped);
    }
    gameState.equipment[type] = selectedInventoryItem;

    showToast(`⚔️ สวมใส่ ${selectedInventoryItem.name} เรียบร้อย!`);
    closeItemModal();
    saveGame();
    renderUI();
  });

  btnModalSalvage.addEventListener('click', () => {
    if (!selectedInventoryItem) return;
    gameState.inventory = gameState.inventory.filter(i => i.id !== selectedInventoryItem.id);
    gameState.gold += selectedInventoryItem.goldValue;
    showToast(`♻️ ย่อยสลายไอเทม ได้รับ +${selectedInventoryItem.goldValue} 🪙`);
    closeItemModal();
    saveGame();
    renderUI();
  });

  document.querySelectorAll('.slot-box').forEach(slot => {
    slot.addEventListener('click', () => {
      const type = slot.getAttribute('data-slottype');
      const item = gameState.equipment[type];
      if (item) {
        if (gameState.inventory.length >= 20) {
          showToast('กระเป๋าเต็ม ไม่สามารถถอดอุปกรณ์ได้');
          return;
        }
        gameState.inventory.push(item);
        gameState.equipment[type] = null;
        showToast(`ถอด ${item.name} เก็บเข้ากระเป๋า`);
        saveGame();
        renderUI();
      }
    });
  });

  // --- Render Monster Codex ---
  function renderMonsterCodex() {
    codexListEl.innerHTML = '';
    BOSS_DATABASE.forEach(boss => {
      const bInfo = gameState.bestiary[boss.id] || { kills: 0 };
      const card = document.createElement('div');
      card.className = 'codex-item';
      card.innerHTML = `
        <div class="codex-avatar">${boss.avatar}</div>
        <div class="codex-info">
          <div class="codex-name">${boss.name}</div>
          <div class="codex-tier">${boss.tier} | เลือดฐาน ${boss.maxHpKm.toFixed(1)} กม.</div>
        </div>
        <div class="codex-kills">สยบแล้ว: ${bInfo.kills} ตัว</div>
      `;
      codexListEl.appendChild(card);
    });
  }

  // --- Backup & Restore Handlers ---
  btnExportBackup.addEventListener('click', async () => {
    const history = await DB.getAllRunHistory();
    const backupData = {
      app: 'ShadowStrider',
      version: 1,
      exportedAt: new Date().toISOString(),
      playerState: gameState,
      history
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ShadowStrider_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📥 ส่งออกไฟล์สำรอง JSON สำเร็จ');
  });

  inputImportBackup.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (imported.playerState && Array.isArray(imported.history)) {
          await DB.clearAndRestoreAll(imported.playerState, imported.history);
          gameState = imported.playerState;
          showToast('📤 กู้คืนข้อมูลสำเร็จ! กำลังรีเฟรชหน้าจอ...');
          setTimeout(() => location.reload(), 1500);
        } else {
          showToast('❌ ไฟล์สำรองไม่ถูกต้องตามรูปแบบ');
        }
      } catch (err) {
        showToast('❌ เกิดข้อผิดพลาดในการอ่านไฟล์');
      }
    };
    reader.readAsText(file);
  });

  // --- GPX Generator ---
  window.downloadRunGPX = async function (runTimestamp) {
    const history = await DB.getAllRunHistory();
    const run = history.find(r => r.timestamp === runTimestamp);
    if (!run || !run.gpxTrack || run.gpxTrack.length === 0) {
      showToast('⚠️ รอบนี้ไม่มีข้อมูลพิกัด GPS บันทึกไว้');
      return;
    }

    let gpxXml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ShadowStrider Dark Run RPG" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>ShadowStrider Hunt - ${run.displayDate}</name>
    <time>${new Date(run.timestamp).toISOString()}</time>
  </metadata>
  <trk>
    <name>ShadowStrider Hunt (${run.distanceKm.toFixed(2)} km)</name>
    <type>9</type>
    <trkseg>
`;

    run.gpxTrack.forEach(pt => {
      gpxXml += `      <trkpt lat="${pt.lat}" lon="${pt.lon}">
        <time>${new Date(pt.time).toISOString()}</time>
      </trkpt>\n`;
    });

    gpxXml += `    </trkseg>
  </trk>
</gpx>`;

    const blob = new Blob([gpxXml], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ShadowStrider_${run.timestamp}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('🗺️ ส่งออกไฟล์ GPX สำเร็จ! สามารถนำเข้า Strava ได้');
  };

  // --- Render Run History & Sessions ---
  async function renderHistoryAndDailyUI() {
    const history = await DB.getAllRunHistory();
    historyCountEl.textContent = `${history.length} รอบ`;

    historyListEl.innerHTML = '';
    if (history.length === 0) {
      historyListEl.innerHTML = '<div class="history-empty">ยังไม่มีประวัติการล่า จงเริ่มออกวิ่งรอบแรก!</div>';
    } else {
      history.slice(0, 15).forEach(item => {
        const hasGpx = item.gpxTrack && item.gpxTrack.length > 0;
        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
          <div class="history-header">
            <span class="history-date">${item.displayDate}</span>
            <div class="history-header-actions">
              ${hasGpx ? `<button class="btn-gpx-export" onclick="window.downloadRunGPX(${item.timestamp})">GPX 🗺️</button>` : ''}
              ${item.bossKills > 0 ? `<span class="history-boss-tag">โค่นบอส ${item.bossKills} ตัว</span>` : ''}
            </div>
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

  // --- Modular UI Renderers ---
  function renderHUD() {
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

    const eqBonus = calculateEquipmentBonuses();
    const frenzyDmgBonus = isFrenzyActive ? 1.5 : 1.0;
    const currentStrMult = ((1 + Math.max(0, (gameState.stats.str - 10) * 0.05) + (gameState.upgrades.blade * 0.05) + (eqBonus.bonusDmg * 0.01)) * frenzyDmgBonus).toFixed(2);
    strMultEl.textContent = currentStrMult;
    staMultEl.textContent = Math.round(Math.max(0, (gameState.stats.sta - 10) * 2) + eqBonus.bonusSta);
    
    let baseCrit = Math.min(65, (gameState.stats.agi * 0.5) + (gameState.upgrades.eye * 2) + eqBonus.bonusCrit).toFixed(1);
    if (isFrenzyActive) {
      agiCritEl.textContent = '100 (ZONE 3)';
    } else {
      agiCritEl.textContent = baseCrit;
    }

    const boss = BOSS_DATABASE[gameState.bossIndex];
    bossTierEl.textContent = boss.tier;
    bossAvatarEl.textContent = boss.avatar;
    bossNameEl.textContent = boss.name;
    bossDescEl.textContent = boss.desc;
    bossHpMaxEl.textContent = boss.maxHpKm.toFixed(2);
    bossHpRemainEl.textContent = gameState.bossHpRemain.toFixed(2);
    const hpPercent = Math.max(0, Math.min(100, (gameState.bossHpRemain / boss.maxHpKm) * 100));
    bossHpBarEl.style.width = `${hpPercent}%`;

    if (gameState.chestsAvailable > 0) {
      chestCardEl.style.display = 'block';
      chestCountEl.textContent = gameState.chestsAvailable;
    } else {
      chestCardEl.style.display = 'none';
    }

    distanceValEl.textContent = runDistanceKm.toFixed(2);
    const calValue = Math.floor(runDistanceKm * 65);
    calValEl.textContent = `${calValue} kcal`;
    updatePace();

    pocketDistVal.textContent = `${runDistanceKm.toFixed(2)} KM`;
    pocketTimeVal.textContent = timeValEl.textContent;

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
          speakVoice(`เคลมภารกิจสำเร็จ ได้รับ ${q.rewardGold} เหรียญทอง`);
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
          speakVoice('ปลดล็อกรางวัลเกียรติยศแห่งเงา');
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
    renderEquipmentAndInventory();
    renderMonsterCodex();
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
      speakVoice('ดื่มน้ำยาจิตวิญญาณ ได้รับหนึ่งแต้มสเตตัส');
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
      speakVoice(`ตีบวกดาบเงาสำเร็จ เลเวล ${gameState.upgrades.blade}`);
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
      speakVoice(`เสริมพลังเครื่องราง เลเวล ${gameState.upgrades.charm}`);
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
      speakVoice(`เบิกเนตรอเวจี เลเวล ${gameState.upgrades.eye}`);
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

  // --- Pocket Mode Touch Shield Logic ---
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
    cancelUnlockHold();

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

  pocketOverlay.addEventListener('pointerdown', startUnlockHold);
  pocketOverlay.addEventListener('pointerup', cancelUnlockHold);
  pocketOverlay.addEventListener('pointercancel', cancelUnlockHold);
  pocketOverlay.addEventListener('pointerleave', cancelUnlockHold);

  pocketBtn.addEventListener('click', () => {
    cancelUnlockHold();
    pocketOverlay.style.display = 'flex';
    showToast('🔒 เปิดโหมดพักจอ (แตะค้างเพื่อปลดล็อก)');
  });

  // --- Engine Control (Start / Pause / Finish) ---
  async function startRunEngine() {
    isRunning = true;
    btnToggleRun.classList.add('running');
    btnRunText.textContent = 'หยุดชั่วคราว';
    btnFinishRun.removeAttribute('disabled');

    speakVoice('เริ่มการออกล่า จงวิ่งเพื่อกำราบอสูรเงา');
    await acquireWakeLock();

    runTimerInterval = setInterval(() => {
      runSeconds++;
      timeValEl.textContent = formatTime(runSeconds);
      pocketTimeVal.textContent = timeValEl.textContent;
      updatePace();

      const questTime = gameState.dailyQuests.find(q => q.id === 'dq_time');
      if (questTime) {
        questTime.current = Math.min(questTime.target, questTime.current + 1);
      }

      const questCal = gameState.dailyQuests.find(q => q.id === 'dq_cal');
      if (questCal) {
        questCal.current = Math.min(questCal.target, Math.floor(runDistanceKm * 65));
      }

      evaluateFrenzyState();
    }, 1000);

    if (!isSimMode && 'geolocation' in navigator) {
      gpsStatusEl.textContent = 'GPS: กำลังเชื่อมสัญญาณ...';
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          gpsStatusEl.textContent = 'GPS: ล็อกพิกัดแล้ว 🟢';
          const { latitude, longitude, accuracy, altitude } = pos.coords;

          if (accuracy > 25) return;

          const now = Date.now();
          if (!lastCoord) {
            lastCoord = { latitude, longitude, time: now };
            currentGpxTrack.push({ lat: latitude, lon: longitude, ele: altitude || 0, time: now });
            return;
          }

          const deltaKm = calculateDistance(lastCoord.latitude, lastCoord.longitude, latitude, longitude);
          const timeDeltaSec = (now - (lastCoord.time || now)) / 1000;

          if (deltaKm >= 0.003 && timeDeltaSec >= 1) {
            const speedKmh = deltaKm / (timeDeltaSec / 3600);

            if (speedKmh >= 1.5 && speedKmh <= 35) {
              runDistanceKm += deltaKm;
              recordPaceSample(now, runDistanceKm);
              currentGpxTrack.push({ lat: latitude, lon: longitude, ele: altitude || 0, time: now });
              applyDistanceDamage(deltaKm);
              lastCoord = { latitude, longitude, time: now };
            } else if (speedKmh > 35) {
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

    speakVoice('หยุดการล่าชั่วคราว');
    releaseWakeLock();
  }

  async function finishRunSession() {
    if (runDistanceKm < 0.05) {
      const confirmDiscard = confirm('ระยะทางวิ่งน้อยกว่า 0.05 กม. (50 เมตร) คุณต้องการยกเลิกรอบนี้โดยไม่บันทึกประวัติหรือไม่?');
      if (confirmDiscard) {
        pauseRunEngine();
        cancelUnlockHold();
        pocketOverlay.style.display = 'none';
        runDistanceKm = 0.0;
        runSeconds = 0;
        sessionBossKills = 0;
        currentGpxTrack = [];
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
    speakVoice(`จบการออกล่ารอบนี้ สะสมระยะทางได้ ${runDistanceKm.toFixed(2)} กิโลเมตร เก่งมากนักล่าเงา`, true);

    const staMultiplier = 1 + Math.max(0, (gameState.stats.sta - 10) * 0.02);
    const bonusExp = Math.floor(runDistanceKm * 800 * staMultiplier);
    if (bonusExp > 0) {
      addExp(bonusExp);
    }

    gameState.career.totalRuns = (gameState.career.totalRuns || 0) + 1;
    gameState.career.totalDistanceKm = parseFloat(((gameState.career.totalDistanceKm || 0) + runDistanceKm).toFixed(2));
    gameState.career.totalSeconds = (gameState.career.totalSeconds || 0) + runSeconds;
    if (runDistanceKm > (gameState.career.longestRunKm || 0)) {
      gameState.career.longestRunKm = parseFloat(runDistanceKm.toFixed(2));
    }

    const achFirst = gameState.achievements.find(a => a.id === 'ach_first');
    if (achFirst) achFirst.current = Math.min(achFirst.target, achFirst.current + 1);

    const ach10 = gameState.achievements.find(a => a.id === 'ach_dist10');
    if (ach10) ach10.current = Math.min(ach10.target, gameState.career.totalDistanceKm);

    const ach50 = gameState.achievements.find(a => a.id === 'ach_dist50');
    if (ach50) ach50.current = Math.min(ach50.target, gameState.career.totalDistanceKm);

    const historyItem = {
      timestamp: Date.now(),
      displayDate: new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }),
      distanceKm: runDistanceKm,
      durationSeconds: runSeconds,
      formattedTime: formatTime(runSeconds),
      pace: paceValEl.textContent,
      calories: Math.floor(runDistanceKm * 65),
      bossKills: sessionBossKills,
      expGained: bonusExp,
      avgHeartRate: currentHeartRate > 0 ? currentHeartRate : null,
      gpxTrack: [...currentGpxTrack]
    };

    await DB.addRunRecord(historyItem);

    runDistanceKm = 0.0;
    runSeconds = 0;
    sessionBossKills = 0;
    nextChestKmCheckpoint = 1.0;
    nextKmAnnounceCheckpoint = 1.0;
    currentGpxTrack = [];
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
      const now = Date.now();
      recordPaceSample(now, runDistanceKm);
      currentGpxTrack.push({
        lat: 13.7314 + (Math.random() * 0.002),
        lon: 100.5414 + (Math.random() * 0.002),
        ele: 3,
        time: now
      });
      applyDistanceDamage(km);
      renderHUD();
      showToast(`⚡ จำลองวิ่งก้าวหน้า +${(km * 1000).toFixed(0)} เมตร!`);
    }
  };

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
    simToggleBtn.textContent = `จำลอง: ${isSimMode ? 'เปิด' : 'ปิด'}`;
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
