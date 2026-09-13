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

  // --- Equipment Set System Database ---
  const SET_DATABASE = {
    shadowstalker: {
      id: 'shadowstalker',
      name: 'เซ็ตเงามัจจุราช',
      fullName: 'Shadowstalker Armor',
      icon: '🌑',
      color: '#c084fc',
      bonuses: {
        2: 'คริติคอล +10% & เกจไม้ตายชาร์จไวขึ้น 25%',
        4: 'ท่าไม้ตาย Shadow Slash แรงขึ้น 50% & เกราะศิลาแตกนานขึ้นเป็น 90 วินาที'
      }
    },
    bloodknight: {
      id: 'bloodknight',
      name: 'เซ็ตอัศวินโลหิต',
      fullName: 'Bloodknight Battlegear',
      icon: '🩸',
      color: '#f87171',
      bonuses: {
        2: 'ค่าความอึด STA +25% & ได้รับทองคำเพิ่มขึ้น +20%',
        4: 'ขณะอยู่ใน Heart Rate Zone 2-3 จะได้รับโบนัส EXP เพิ่มขึ้น +40%'
      }
    },
    voidwalker: {
      id: 'voidwalker',
      name: 'เซ็ตผู้ท่องมิติ',
      fullName: 'Void Walker Raiment',
      icon: '🌌',
      color: '#38bdf8',
      bonuses: {
        2: 'เข้าสู่ Flow State ง่ายขึ้น 50% (คุมเพซเพียง 200 เมตร)',
        4: 'เมื่ออยู่ใน Flow State การโจมตีจะทะลุเกราะบอส 100% (True Damage)'
      }
    }
  };

  // --- Boss List Database (7 Tiers พร้อมบอสใหม่ Ignis-Vorax) ---
  const BOSS_DATABASE = [
    {
      id: 'boss_1',
      tier: 'TIER I',
      name: 'Gargoyle of the Crypt',
      avatar: '👹',
      maxHpKm: 1.0,
      desc: 'อสูรหินเฝ้าประตูสุสาน จงวิ่ง 1.00 กม. เพื่อทำลายมัน!',
      rewardExp: 1200,
      rewardGold: 150,
      gimmick: 'none'
    },
    {
      id: 'boss_2',
      tier: 'TIER II',
      name: 'Abyssal Blood Knight',
      avatar: '🤺',
      maxHpKm: 2.5,
      desc: 'อัศวินเกราะดำกระหายการต่อสู้ วิ่ง 2.50 กม. เพื่อสยบดาบโลหิต!',
      rewardExp: 3200,
      rewardGold: 350,
      gimmick: 'none'
    },
    {
      id: 'boss_3',
      tier: 'TIER III',
      name: 'Ancient Bone Dragon',
      avatar: '🐉',
      maxHpKm: 5.0,
      desc: 'มังกรกระดูกบรรพกาล วิ่งสะสม 5.00 กม. เพื่อปิดผนึกลมหายใจมรณะ!',
      rewardExp: 7500,
      rewardGold: 800,
      gimmick: 'none'
    },
    {
      id: 'boss_4',
      tier: 'TIER IV',
      name: 'Shadow Lich: Malakor',
      avatar: '🧙‍♂️',
      maxHpKm: 7.5,
      desc: 'จอมเวทอเวจีโบราณ เมื่อเลือดต่ำกว่า 60% หมอกคำสาปจะสูบเลือดคืนหากเพซวิ่งช้ากว่า 7:30!',
      rewardExp: 13000,
      rewardGold: 1600,
      gimmick: 'mist'
    },
    {
      id: 'boss_5',
      tier: 'TIER V',
      name: 'Void Behemoth: Titan of Ruin',
      avatar: '🗿',
      maxHpKm: 10.0,
      desc: 'ไททันศิลาแห่งความว่างเปล่า เกราะหนาลดดาเมจ 30% ทลายเกราะด้วยคริติคอลหรือท่าไม้ตาย Shadow Slash!',
      rewardExp: 22000,
      rewardGold: 2800,
      gimmick: 'carapace'
    },
    {
      id: 'boss_6',
      tier: 'TIER VI',
      name: 'Abyssal Empress: Nyxaria',
      avatar: '👑',
      maxHpKm: 15.0,
      desc: 'จักรพรรดินีเงาราตรี 3 เฟส: ร่างเงาหลอก (ทลายด้วย Flow State), สนามเรโซแนนซ์ และจันทรคราสทมิฬ!',
      rewardExp: 38000,
      rewardGold: 5000,
      gimmick: 'empress'
    },
    {
      id: 'boss_7',
      tier: 'TIER VII',
      name: 'Eclipse Harbinger: Ignis-Vorax',
      avatar: '☄️',
      maxHpKm: 21.0,
      desc: 'เทพอสูรเพลิงสุริยคราส เลือด 21 กม. ครึ่งแรกคลื่นความร้อนแผดเผา ครึ่งหลังระเบิดซูเปอร์โนวา ชาร์จไม้ตายไว x2!',
      rewardExp: 55000,
      rewardGold: 8500,
      gimmick: 'supernova'
    }
  ];

  function getTitleForLevel(level) {
    if (level >= 45) return 'Eclipse God Slayer';
    if (level >= 35) return 'Abyssal Sovereign Emperor';
    if (level >= 30) return 'Void Overlord';
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
      { id: 'ach_boss_dragon', name: 'Dragon Bane (ผู้สยบมังกร)', desc: 'โค่นมังกรกระดูก Ancient Bone Dragon (Tier III)', target: 1, current: 0, unit: 'ตัว', rewardExp: 6000, rewardGold: 1200, claimed: false },
      { id: 'ach_boss_malakor', name: 'Lich Bane (ผู้สยบจอมเวท)', desc: 'โค่นจอมเวทอเวจี Shadow Lich: Malakor (Tier IV)', target: 1, current: 0, unit: 'ตัว', rewardExp: 10000, rewardGold: 2000, claimed: false },
      { id: 'ach_boss_titan', name: 'Titan Breaker (ผู้กะเทาะศิลาไททัน)', desc: 'โค่น Void Behemoth: Titan of Ruin (Tier V)', target: 1, current: 0, unit: 'ตัว', rewardExp: 16000, rewardGold: 3500, claimed: false },
      { id: 'ach_boss_empress', name: 'Eclipse Sovereign (ผู้สยบจักรพรรดินี)', desc: 'โค่น Abyssal Empress: Nyxaria (Tier VI)', target: 1, current: 0, unit: 'ตัว', rewardExp: 28000, rewardGold: 6000, claimed: false },
      { id: 'ach_boss_ignis', name: 'Harbinger Extinguisher (ผู้ดับสุริยคราส)', desc: 'โค่น Eclipse Harbinger: Ignis-Vorax (Tier VII)', target: 1, current: 0, unit: 'ตัว', rewardExp: 45000, rewardGold: 10000, claimed: false }
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
    ultimateCharge: 0,
    stats: { str: 10, sta: 10, agi: 10 },
    upgrades: { blade: 0, charm: 0, eye: 0 },
    equipment: { weapon: null, armor: null, boots: null, relic: null },
    inventory: [],
    bestiary: {
      boss_1: { kills: 0, name: 'Gargoyle of the Crypt' },
      boss_2: { kills: 0, name: 'Abyssal Blood Knight' },
      boss_3: { kills: 0, name: 'Ancient Bone Dragon' },
      boss_4: { kills: 0, name: 'Shadow Lich: Malakor' },
      boss_5: { kills: 0, name: 'Void Behemoth: Titan of Ruin' },
      boss_6: { kills: 0, name: 'Abyssal Empress: Nyxaria' },
      boss_7: { kills: 0, name: 'Eclipse Harbinger: Ignis-Vorax' }
    },
    chestsAvailable: 0,
    streak: { count: 1, lastDate: new Date().toDateString() },
    bossIndex: 0,
    bossHpRemain: 1.0,
    totalDistanceKm: 0.0,
    maxHr: 178,
    lastBleDeviceName: null,
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
  let currentInvFilter = 'all';

  // --- Boss Gimmick State Runtime Variables ---
  let bossVulnerableTimer = 0;
  let mistHealingTick = 0;
  let gimmickAnnounced = {};

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
      gameState.ultimateCharge = typeof saved.ultimateCharge === 'number' ? saved.ultimateCharge : 0;
    } else {
      gameState = defaultState;
    }

    // ประสานบอสทั้งหมด 7 ตัวเข้ากับ Bestiary เสมอ
    BOSS_DATABASE.forEach(b => {
      if (!gameState.bestiary[b.id]) {
        gameState.bestiary[b.id] = { kills: 0, name: b.name };
      }
    });

    // ประสานความสำเร็จใหม่เข้ากับบันทึกเดิม
    const defaultAchs = generateAchievements();
    defaultAchs.forEach(defAch => {
      if (!gameState.achievements.find(a => a.id === defAch.id)) {
        gameState.achievements.push(defAch);
      }
    });

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

  // Ultimate & Flow State Variables
  let isOverdriveActive = false;
  let overdriveSecondsRemaining = 0;
  let isFlowStateActive = false;
  let rhythmBaselinePace = null;
  let rhythmConsistentDistance = 0.0;

  // --- Item Generator with Set Affinity ---
  const ITEM_NAMES = {
    weapon: ['ดาบสั้น', 'ดาบใหญ่ทมิฬ', 'เคียวมรณะ', 'ดาบโบราณ'],
    armor: ['เสื้อเกราะหนัง', 'เกราะเหล็กอสูร', 'ผ้าคลุมวิญญาณ', 'เกราะเพลทอเวจี'],
    boots: ['รองเท้าก้าวเงา', 'รองเท้าเกราะทมิฬ', 'รองเท้าลมกรด', 'สนับแข้งสายลม'],
    relic: ['แหวนวิญญาณ', 'จี้หยดโลหิต', 'เครื่องรางตาเหยี่ยว', 'หินมนตราโบราณ']
  };

  function rollRandomItem() {
    const types = ['weapon', 'armor', 'boots', 'relic'];
    const type = types[Math.floor(Math.random() * types.length)];
    const roll = Math.random();

    let rarity = 'common';
    let mainStatVal = 6;
    let subStatVal = 0;

    if (roll < 0.06) {
      rarity = 'legendary';
      mainStatVal = 25;
      subStatVal = 10;
    } else if (roll < 0.22) {
      rarity = 'epic';
      mainStatVal = 18;
      subStatVal = 6;
    } else if (roll < 0.52) {
      rarity = 'rare';
      mainStatVal = 12;
      subStatVal = 3;
    } else {
      rarity = 'common';
      mainStatVal = 6;
    }

    // สุ่มสังกัด 1 ใน 3 เซ็ตโบราณ
    const setKeys = Object.keys(SET_DATABASE);
    const setId = setKeys[Math.floor(Math.random() * setKeys.length)];
    const setInfo = SET_DATABASE[setId];

    const nameList = ITEM_NAMES[type];
    const baseName = nameList[Math.floor(Math.random() * nameList.length)];
    const icons = { weapon: '🗡️', armor: '🛡️', boots: '🥾', relic: '🧿' };

    return {
      id: `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: `${baseName}แห่ง${setInfo.name.replace('เซ็ต', '')}`,
      type,
      rarity,
      setId,
      mainStatVal,
      subStatVal,
      icon: icons[type],
      goldValue: rarity === 'legendary' ? 400 : rarity === 'epic' ? 180 : rarity === 'rare' ? 80 : 30
    };
  }

  // คำนวณจำนวนชิ้นของแต่ละเซ็ตที่สวมใส่อยู่
  function getActiveEquippedSets() {
    const counts = { shadowstalker: 0, bloodknight: 0, voidwalker: 0 };
    const eq = gameState.equipment;
    ['weapon', 'armor', 'boots', 'relic'].forEach(slot => {
      const item = eq[slot];
      if (item && item.setId && counts[item.setId] !== undefined) {
        counts[item.setId]++;
      }
    });
    return counts;
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

    // คำนวณบัฟจาก Set Bonuses
    const setCounts = getActiveEquippedSets();
    if (setCounts.shadowstalker >= 2) {
      bonusCrit += 10;
    }
    if (setCounts.bloodknight >= 2) {
      bonusSta += 25;
      bonusGold += 20;
    }

    return { bonusDmg, bonusSta, bonusCrit, bonusGold, setCounts };
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

  const bossCardEl = document.getElementById('boss-card');
  const bossTierEl = document.getElementById('boss-tier');
  const bossAvatarEl = document.getElementById('boss-avatar');
  const bossNameEl = document.getElementById('boss-name');
  const bossDescEl = document.getElementById('boss-desc');
  const bossHpBarEl = document.getElementById('boss-hp-bar');
  const bossHpRemainEl = document.getElementById('boss-hp-remain');
  const bossHpMaxEl = document.getElementById('boss-hp-max');
  const bossGimmickBannerEl = document.getElementById('boss-gimmick-banner');
  const bossGimmickTagEl = document.getElementById('boss-gimmick-tag');
  const bossGimmickTextEl = document.getElementById('boss-gimmick-text');

  const chestCardEl = document.getElementById('chest-card');
  const chestCountEl = document.getElementById('chest-count');
  const btnOpenChest = document.getElementById('btn-open-chest');

  const runHudEl = document.getElementById('run-hud');
  const frenzyBannerEl = document.getElementById('frenzy-banner');
  const overdriveBannerEl = document.getElementById('overdrive-banner');
  const overdriveTimeLeftEl = document.getElementById('overdrive-time-left');
  const distanceValEl = document.getElementById('distance-val');
  const timeValEl = document.getElementById('time-val');
  const paceValEl = document.getElementById('pace-val');
  const flowBadgeEl = document.getElementById('flow-badge');
  const calValEl = document.getElementById('cal-val');
  const gpsStatusEl = document.getElementById('gps-status');

  // Ultimate Skill Elements
  const ultPctValEl = document.getElementById('ult-pct-val');
  const ultBarFillEl = document.getElementById('ult-bar-fill');
  const btnCastUltimate = document.getElementById('btn-cast-ultimate');

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

  // Equipment, Sets & Modal Elements
  const equipSummaryEl = document.getElementById('equip-summary');
  const setBonusesContainerEl = document.getElementById('set-bonuses-container');
  const inventoryGridEl = document.getElementById('inventory-grid');
  const invCountEl = document.getElementById('inv-count');
  const itemModalEl = document.getElementById('item-modal');
  const modalItemIconEl = document.getElementById('modal-item-icon');
  const modalItemNameEl = document.getElementById('modal-item-name');
  const modalItemRarityEl = document.getElementById('modal-item-rarity');
  const modalItemSetEl = document.getElementById('modal-item-set');
  const modalMainStatEl = document.getElementById('modal-main-stat');
  const modalSubStatEl = document.getElementById('modal-sub-stat');
  const modalSetBonus2El = document.getElementById('modal-set-bonus-2');
  const modalSetBonus4El = document.getElementById('modal-set-bonus-4');
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
      showToast(`⭐ เลเวลอัป! สู่ระดับ LV. ${gameState.level} (+3 แต้มสเตตัส)`);
      speakVoice(`เลเวลอัป สู่ระดับ ${gameState.level}`);
    }
    if (leveledUp) {
      gameState.title = getTitleForLevel(gameState.level);
    }
    saveGame();
    renderUI();
  }

  function addUltimateCharge(amount) {
    const setCounts = getActiveEquippedSets();
    let finalAmount = amount;
    // โบนัสเซ็ตเงามัจจุราช 2 ชิ้น: ชาร์จไม้ตายไวขึ้น 25%
    if (setCounts.shadowstalker >= 2) {
      finalAmount *= 1.25;
    }

    const prevCharge = gameState.ultimateCharge;
    gameState.ultimateCharge = Math.min(100, Math.max(0, gameState.ultimateCharge + finalAmount));
    if (prevCharge < 100 && gameState.ultimateCharge >= 100) {
      speakVoice('เกจท่าไม้ตายเต็มเปี่ยม ปลดปล่อยคมดาบอเวจีได้แล้ว!', true);
      showToast('⚡ ท่าไม้ตายพร้อมใช้งาน! กด SHADOW SLASH เพื่อสังหาร');
    }
    renderHUD();
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
    if (pct < 60) return 1;
    if (pct < 70) return 2;
    if (pct < 80) return 3;
    if (pct < 90) return 4;
    return 5;
  }

  function updateHeartRate(bpm) {
    currentHeartRate = bpm;
    hrBpmEl.textContent = bpm > 0 ? bpm : '--';
    const zone = calculateHrZone(bpm, gameState.maxHr || 178);
    currentHrZone = zone;

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

    evaluateFrenzyState();
    renderHUD();
  }

  function evaluateFrenzyState() {
    if (isBleConnected) {
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

  // --- Web Bluetooth Engine with Targeted Filter & Auto-Reconnect ---
  async function setupGattConnection(device) {
    bluetoothDevice = device;
    bluetoothDevice.addEventListener('gattserverdisconnected', onBluetoothDisconnected);

    const server = await bluetoothDevice.gatt.connect();
    const service = await server.getPrimaryService('heart_rate');
    hrCharacteristic = await service.getCharacteristic('heart_rate_measurement');

    await hrCharacteristic.startNotifications();
    hrCharacteristic.addEventListener('characteristicvaluechanged', handleHeartRateNotification);

    isBleConnected = true;
    const devName = bluetoothDevice.name || 'อุปกรณ์วัดชีพจร';
    gameState.lastBleDeviceName = devName;
    saveGame();

    btnBleConnect.classList.add('connected');
    btnBleConnect.textContent = `เชื่อมต่อแล้ว: ${devName}`;
    showToast(`🔗 เชื่อมต่อ ${devName} สำเร็จ!`);
    speakVoice('เชื่อมต่อสายวัดหัวใจเรียบร้อย ระบบพร้อมตรวจจับโซน');
  }

  async function connectBluetoothHeartRate(forceNew = false) {
    if (!('bluetooth' in navigator)) {
      alert('เบราว์เซอร์นี้ยังไม่รองรับ Web Bluetooth (แนะนำ Google Chrome บน Android หรือ Bluefy บน iOS)');
      return;
    }

    if (isBleConnected && bluetoothDevice && bluetoothDevice.gatt.connected) {
      bluetoothDevice.gatt.disconnect();
      return;
    }

    try {
      if (!forceNew && 'getDevices' in navigator.bluetooth) {
        const pairedDevices = await navigator.bluetooth.getDevices();
        if (pairedDevices.length > 0) {
          const matchedDevice = pairedDevices.find(d => d.name === gameState.lastBleDeviceName) || pairedDevices[0];
          if (matchedDevice) {
            showToast(`⚡ กำลังเชื่อมต่อด่วนกับ ${matchedDevice.name || 'อุปกรณ์ที่เคยผูกไว้'}...`);
            try {
              await setupGattConnection(matchedDevice);
              return;
            } catch (reconnectErr) {
              console.warn('เชื่อมต่อตัวเดิมไม่สำเร็จ จะเปิดหน้าต่างค้นหาใหม่:', reconnectErr);
            }
          }
        }
      }

      showToast('กำลังค้นหา Smartwatch & สายวัดชีพจร...');
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: ['heart_rate'] },
          { namePrefix: 'HUAWEI' },
          { namePrefix: 'Huawei' },
          { namePrefix: 'Watch' },
          { namePrefix: 'Band' },
          { namePrefix: 'Garmin' },
          { namePrefix: 'Polar' },
          { namePrefix: 'Magene' },
          { namePrefix: 'CooSpo' },
          { namePrefix: 'Coros' }
        ],
        optionalServices: ['heart_rate']
      });

      await setupGattConnection(device);
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
    const labelName = gameState.lastBleDeviceName ? `🔗 เชื่อมต่อ: ${gameState.lastBleDeviceName}` : '🔗 เชื่อมต่อสายคาดอก BLE';
    btnBleConnect.textContent = labelName;
    updateHeartRate(0);
    showToast('⚠️ สัญญาณสายวัดหัวใจ Bluetooth ขาดการเชื่อมต่อ');
    speakVoice('สายวัดหัวใจตัดการเชื่อมต่อ');
  }

  btnBleConnect.addEventListener('click', () => {
    connectBluetoothHeartRate(false);
  });

  btnBleConnect.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (confirm('คุณต้องการค้นหาและจับคู่กับอุปกรณ์บลูทูธตัวใหม่หรือไม่?')) {
      connectBluetoothHeartRate(true);
    }
  });

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

  // --- Battle Damage Calculation with Boss Gimmick & Set Logic ---
  function applyDistanceDamage(distanceDeltaKm) {
    if (distanceDeltaKm <= 0) return;

    const currentBoss = BOSS_DATABASE[gameState.bossIndex];
    const bossHpPct = gameState.bossHpRemain / currentBoss.maxHpKm;
    const eqBonus = calculateEquipmentBonuses();
    const setCounts = eqBonus.setCounts;

    // 1. เพิ่มเกจไม้ตายตามระยะทาง (+2% ต่อ 100 เมตร, และ x2 เมื่ออยู่ใน Flow State)
    let ultChargeBonusMult = isFlowStateActive ? 2 : 1;
    
    // บอส Tier VI Phase 2 (Vacuum Resonance) ชาร์จไม้ตายไว x3 ใน HR Zone 2 - 3
    if (currentBoss.gimmick === 'empress' && bossHpPct <= 0.65 && bossHpPct > 0.25) {
      if (currentHrZone === 2 || currentHrZone === 3 || isFrenzyActive) {
        ultChargeBonusMult *= 3;
      }
    }

    // บอส Tier VII Supernova Phase: เมื่อเลือดต่ำกว่า 50% ชาร์จไม้ตายไว x2
    if (currentBoss.gimmick === 'supernova' && bossHpPct <= 0.50) {
      ultChargeBonusMult *= 2;
    }

    addUltimateCharge((distanceDeltaKm / 0.1) * 2 * ultChargeBonusMult);

    // 2. ตรวจสอบ Pace Rhythm Combo / Flow State
    // โบนัสเซ็ตผู้ท่องมิติ 2 ชิ้น: เข้าสู่ Flow State ง่ายขึ้น (ต้องการ 0.20 กม. แทน 0.40 กม.)
    const flowThresholdKm = setCounts.voidwalker >= 2 ? 0.20 : 0.40;
    const rollingPace = getRecentRollingPace();

    if (rollingPace !== null) {
      if (rhythmBaselinePace === null) {
        rhythmBaselinePace = rollingPace;
        rhythmConsistentDistance = 0.0;
      } else {
        const paceDiff = Math.abs(rollingPace - rhythmBaselinePace);
        if (paceDiff <= 0.25) {
          rhythmConsistentDistance += distanceDeltaKm;
          if (rhythmConsistentDistance >= flowThresholdKm && !isFlowStateActive) {
            isFlowStateActive = true;
            showToast('🌊 เข้าสู่สภาวะ FLOW STATE! โบนัส EXP +50% & เกจไม้ตายชาร์จไว x2');
            speakVoice('เข้าสู่สภาวะโฟลว์สเตท คุมจังหวะยอดเยี่ยม');
          }
        } else {
          rhythmBaselinePace = rollingPace;
          rhythmConsistentDistance = 0.0;
          if (isFlowStateActive) {
            isFlowStateActive = false;
            showToast('หลุดจากสภาวะ Flow State');
          }
        }
      }
    }

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

    if (runDistanceKm >= nextKmAnnounceCheckpoint) {
      const currentPace = calculatePace(runSeconds, runDistanceKm);
      const bossRemainPct = Math.round((gameState.bossHpRemain / currentBoss.maxHpKm) * 100);
      speakVoice(`ผ่านไปแล้ว ${Math.floor(runDistanceKm)} กิโลเมตร เพซเฉลี่ย ${currentPace} เลือดบอสเหลืออีก ${bossRemainPct} เปอร์เซ็นต์`);
      nextKmAnnounceCheckpoint += 1.0;
    }

    const frenzyDmgBonus = isFrenzyActive ? 1.5 : 1.0;
    const strMultiplier = (1 + Math.max(0, (gameState.stats.str - 10) * 0.05) + (gameState.upgrades.blade * 0.05) + (eqBonus.bonusDmg * 0.01)) * frenzyDmgBonus;

    let critChance = Math.min(75, (gameState.stats.agi * 0.5) + (gameState.upgrades.eye * 2) + eqBonus.bonusCrit);
    if (isFrenzyActive) {
      critChance = 100;
    }

    // --- BOSS GIMMICK MODIFIERS ---
    let bossDamageMultiplier = 1.0;

    // TIER IV: Malakor (หมอกคำสาปสูบวิญญาณ)
    if (currentBoss.gimmick === 'mist' && bossHpPct <= 0.60) {
      if (rollingPace === null || rollingPace > 7.5) {
        bossDamageMultiplier *= 0.5;
        if (!gimmickAnnounced.mistWarn) {
          gimmickAnnounced.mistWarn = true;
          speakVoice('หมอกคำสาปสูบวิญญาณทำงาน! เร่งฝีเท้าให้เร็วกว่าเพซ 7 นาทีครึ่งเพื่อสลายหมอก');
          showToast('🌫️ หมอกคำสาปทำงาน: วิ่งช้ากว่า 7:30/กม. ดาเมจลด 50% และบอสจะฮีล!');
        }
      } else {
        if (gimmickAnnounced.mistWarn && !gimmickAnnounced.mistClear) {
          gimmickAnnounced.mistClear = true;
          showToast('💨 วิ่งฉีกหมอกคำสาปสำเร็จ! ดาเมจกลับคืนเต็มอัตรา');
        }
      }
    }

    // TIER V: Titan of Ruin (เกราะศิลาดึกดำบรรพ์ & Enrage)
    if (currentBoss.gimmick === 'carapace') {
      if (bossVulnerableTimer > 0) {
        bossDamageMultiplier *= 2.0;
      } else {
        bossDamageMultiplier *= 0.70;
      }

      if (bossHpPct <= 0.30) {
        if (!gimmickAnnounced.titanEnrage) {
          gimmickAnnounced.titanEnrage = true;
          speakVoice('ไททันศิลาคำรามคลุ้มคลั่ง! เร่งชีพจรแตะโซนสามเพื่อเคาน์เตอร์ดาเมจ', true);
          showToast('🗿 ไททันคลุ้มคลั่ง: ดันชีพจรเข้า Zone 3 เพื่อทำลายจังหวะทุบแผ่นดิน!');
        }
        if (isFrenzyActive || currentHrZone === 3) {
          bossDamageMultiplier *= 1.5;
        }
      }
    }

    // TIER VI: Nyxaria (จักรพรรดินีเงาราตรี 3 เฟส)
    if (currentBoss.gimmick === 'empress') {
      if (bossHpPct > 0.65) {
        if (isFlowStateActive) {
          critChance = Math.min(100, critChance + 20);
          bossDamageMultiplier *= 1.2;
        } else {
          bossDamageMultiplier *= 0.60;
          if (!gimmickAnnounced.empressP1) {
            gimmickAnnounced.empressP1 = true;
            speakVoice('จักรพรรดินีแยกร่างเงาหลอก วิ่งคุมเพซสม่ำเสมอเพื่อเข้าสู่โฟลว์สเตท');
            showToast('👑 ร่างเงาลวง: ดาเมจลด 40% (เข้าสู่ Flow State เพื่อทลายร่างแยก)');
          }
        }
      } else if (bossHpPct <= 0.65 && bossHpPct > 0.25) {
        if (!gimmickAnnounced.empressP2) {
          gimmickAnnounced.empressP2 = true;
          speakVoice('เข้าสู่เฟสสอง สนามเรโซแนนซ์ ชาร์จไม้ตายไวสามเท่าในโซนสองและสาม');
          showToast('⚡ เฟส 2 เรโซแนนซ์: วิ่ง Zone 2 หรือ 3 ชาร์จท่าไม้ตายไวขึ้น 300%!');
        }
      } else {
        if (!gimmickAnnounced.empressP3) {
          gimmickAnnounced.empressP3 = true;
          speakVoice('เข้าสู่จันทรคราสทมิฬขั้นสุดท้าย! ปลดปล่อยพลังทั้งหมดเพื่อปิดฉาก', true);
          showToast('🌑 จันทรคราสทมิฬ: พลังโจมตีและคริติคอลพุ่งทะยาน เร่งสปีดสังหาร!');
        }
        bossDamageMultiplier *= 1.40;
        critChance = Math.min(100, critChance + 25);
      }
    }

    // TIER VII: Ignis-Vorax (เทพอสูรเพลิงสุริยคราส)
    if (currentBoss.gimmick === 'supernova') {
      if (bossHpPct > 0.50) {
        if (!gimmickAnnounced.ignisSolar) {
          gimmickAnnounced.ignisSolar = true;
          speakVoice('เทพอสูรเพลิงสุริยคราสปลดปล่อยคลื่นความร้อน สะสมระยะทางฝ่าเปลวเพลิง');
          showToast('☄️ คลื่นสุริยคราส: วิ่งรักษาระยะทางอย่างมั่นคงเพื่อทลายเกราะสุริยะ');
        }
      } else {
        if (!gimmickAnnounced.ignisSupernova) {
          gimmickAnnounced.ignisSupernova = true;
          speakVoice('คำเตือนระดับสูงสุด! อสูรเพลิงเข้าสู่สภาวะซูเปอร์โนวา ปลดปล่อยท่าไม้ตายรัวๆ เพื่อปิดฉาก', true);
          showToast('💥 SOLAR SUPERNOVA! เกจไม้ตายชาร์จไว x2 ปลดปล่อยคมดาบอเวจีสกัดกั้น');
        }
        bossDamageMultiplier *= 1.35;
        critChance = Math.min(100, critChance + 20);
      }
    }

    // โบนัสเซ็ตผู้ท่องมิติ 4 ชิ้น: เมื่ออยู่ใน Flow State โจมตีทะลุเกราะบอส 100% (True Damage)
    if (setCounts.voidwalker >= 4 && isFlowStateActive) {
      if (bossDamageMultiplier < 1.0) {
        bossDamageMultiplier = 1.0;
      }
    }

    const isCrit = (Math.random() * 100) < critChance;

    // ติดคริติคอลทะลุเกราะหิน
    if (currentBoss.gimmick === 'carapace' && bossVulnerableTimer <= 0 && isCrit) {
      bossDamageMultiplier = (bossDamageMultiplier / 0.70);
    }

    const effectiveDamage = distanceDeltaKm * strMultiplier * (isCrit ? 1.8 : 1.0) * bossDamageMultiplier;

    if (isCrit) {
      addUltimateCharge(3);
      const questCrit = gameState.dailyQuests.find(q => q.id === 'dq_crit');
      if (questCrit) questCrit.current = Math.min(questCrit.target, questCrit.current + 1);
      showToast(`💥 CRITICAL! ดาเมจทะลวง x1.8`);
    }

    gameState.bossHpRemain = Math.max(0, gameState.bossHpRemain - effectiveDamage);

    if (gameState.bossHpRemain <= 0.001) {
      sessionBossKills += 1;
      gameState.career.totalBossDefeated = (gameState.career.totalBossDefeated || 0) + 1;
      gameState.chestsAvailable += 1;

      if (!gameState.bestiary[currentBoss.id]) {
        gameState.bestiary[currentBoss.id] = { kills: 0, name: currentBoss.name };
      }
      gameState.bestiary[currentBoss.id].kills += 1;

      // โบนัสเซ็ตอัศวินโลหิต 4 ชิ้น: โบนัส EXP +40% ขณะอยู่ใน Zone 2 หรือ 3
      let setExpBonus = 1.0;
      if (setCounts.bloodknight >= 4 && (currentHrZone === 2 || currentHrZone === 3 || isFrenzyActive)) {
        setExpBonus = 1.4;
      }

      const zone2ExpBonus = currentHrZone === 2 ? 1.5 : 1.0;
      const flowExpBonus = isFlowStateActive ? 1.5 : 1.0;

      const staMultiplier = (1 + Math.max(0, (gameState.stats.sta - 10) * 0.02) + (eqBonus.bonusSta * 0.01)) * zone2ExpBonus * flowExpBonus * setExpBonus;
      const charmMultiplier = 1 + (gameState.upgrades.charm * 0.10) + (eqBonus.bonusGold * 0.01);
      const streakMultiplier = 1 + Math.min(0.20, (gameState.streak.count - 1) * 0.02);
      const overdriveGoldMult = isOverdriveActive ? 2.0 : 1.0;
      const totalGoldMultiplier = staMultiplier * charmMultiplier * streakMultiplier * overdriveGoldMult;

      const rewardExp = Math.floor(currentBoss.rewardExp * staMultiplier);
      const rewardGold = Math.floor(currentBoss.rewardGold * totalGoldMultiplier);

      showToast(`🏆 สยบ ${currentBoss.name}! +${rewardExp} EXP & +${rewardGold} ทอง & 📦 1 หีบ`);
      speakVoice(`สยบ ${currentBoss.name} สำเร็จแล้ว ปิดผนึกชัยชนะ!`, true);
      addExp(rewardExp);
      gameState.gold += rewardGold;

      const questBoss = gameState.dailyQuests.find(q => q.id === 'dq_boss');
      if (questBoss) questBoss.current = Math.min(questBoss.target, questBoss.current + 1);

      // Achievements Checks
      if (currentBoss.tier === 'TIER III') {
        const ach = gameState.achievements.find(a => a.id === 'ach_boss_dragon');
        if (ach) ach.current = Math.min(ach.target, ach.current + 1);
      } else if (currentBoss.tier === 'TIER IV') {
        const ach = gameState.achievements.find(a => a.id === 'ach_boss_malakor');
        if (ach) ach.current = Math.min(ach.target, ach.current + 1);
      } else if (currentBoss.tier === 'TIER V') {
        const ach = gameState.achievements.find(a => a.id === 'ach_boss_titan');
        if (ach) ach.current = Math.min(ach.target, ach.current + 1);
      } else if (currentBoss.tier === 'TIER VI') {
        const ach = gameState.achievements.find(a => a.id === 'ach_boss_empress');
        if (ach) ach.current = Math.min(ach.target, ach.current + 1);
      } else if (currentBoss.tier === 'TIER VII') {
        const ach = gameState.achievements.find(a => a.id === 'ach_boss_ignis');
        if (ach) ach.current = Math.min(ach.target, ach.current + 1);
      }

      bossVulnerableTimer = 0;
      gimmickAnnounced = {};

      gameState.bossIndex = (gameState.bossIndex + 1) % BOSS_DATABASE.length;
      const nextBoss = BOSS_DATABASE[gameState.bossIndex];
      gameState.bossHpRemain = nextBoss.maxHpKm;
    }

    saveGame();
    renderHUD();
  }

  // --- Ultimate Skill Execution: Shadow Slash ---
  function activateUltimateSkill() {
    if (gameState.ultimateCharge < 100 || !isRunning) {
      if (!isRunning) showToast('กรุณากดเริ่มออกล่าก่อนใช้ท่าไม้ตาย');
      return;
    }

    gameState.ultimateCharge = 0;
    const eqBonus = calculateEquipmentBonuses();
    const setCounts = eqBonus.setCounts;
    const strMultiplier = 1 + Math.max(0, (gameState.stats.str - 10) * 0.05) + (gameState.upgrades.blade * 0.05) + (eqBonus.bonusDmg * 0.01);
    
    // โบนัสเซ็ตเงามัจจุราช 4 ชิ้น: ท่าไม้ตาย Shadow Slash แรงขึ้น 50%
    const shadowSetDmgMult = setCounts.shadowstalker >= 4 ? 1.5 : 1.0;
    const burstDamageKm = 0.40 * strMultiplier * shadowSetDmgMult;
    const currentBoss = BOSS_DATABASE[gameState.bossIndex];

    if (currentBoss.gimmick === 'carapace') {
      // โบนัสเซ็ตเงามัจจุราช 4 ชิ้น: ยืดเวลาเกราะแตกเป็น 90 วินาที
      bossVulnerableTimer = setCounts.shadowstalker >= 4 ? 90 : 60;
      showToast(`💥 SHADOW SLASH กะเทาะเกราะศิลาแตกสะบั้น! บอสเปราะบาง x2 (${bossVulnerableTimer} วิ)`);
      speakVoice('คมดาบผ่าเกราะศิลาแตกสะบั้น ไททันติดสถานะเปราะบาง', true);
    } else {
      showToast(`🗡️ SHADOW SLASH! คมดาบอเวจีเฉือนบอส ${burstDamageKm.toFixed(2)} กม.!`);
      speakVoice('ปลดปล่อยคมดาบอเวจี! เข้าสู่สภาวะโอเวอร์ไดรฟ์', true);
    }

    gameState.bossHpRemain = Math.max(0, gameState.bossHpRemain - burstDamageKm);

    isOverdriveActive = true;
    overdriveSecondsRemaining = 45;
    runHudEl.classList.add('overdrive-active');
    overdriveBannerEl.style.display = 'block';
    overdriveTimeLeftEl.textContent = overdriveSecondsRemaining;

    if (gameState.bossHpRemain <= 0.001) {
      sessionBossKills += 1;
      gameState.career.totalBossDefeated = (gameState.career.totalBossDefeated || 0) + 1;
      gameState.chestsAvailable += 1;

      if (!gameState.bestiary[currentBoss.id]) {
        gameState.bestiary[currentBoss.id] = { kills: 0, name: currentBoss.name };
      }
      gameState.bestiary[currentBoss.id].kills += 1;

      const rewardExp = Math.floor(currentBoss.rewardExp * 1.5);
      const rewardGold = Math.floor(currentBoss.rewardGold * 2.0);

      showToast(`🏆 ฟันสังหาร ${currentBoss.name}! +${rewardExp} EXP & +${rewardGold} เหรียญ`);
      addExp(rewardExp);
      gameState.gold += rewardGold;

      if (currentBoss.tier === 'TIER III') {
        const ach = gameState.achievements.find(a => a.id === 'ach_boss_dragon');
        if (ach) ach.current = Math.min(ach.target, ach.current + 1);
      } else if (currentBoss.tier === 'TIER IV') {
        const ach = gameState.achievements.find(a => a.id === 'ach_boss_malakor');
        if (ach) ach.current = Math.min(ach.target, ach.current + 1);
      } else if (currentBoss.tier === 'TIER V') {
        const ach = gameState.achievements.find(a => a.id === 'ach_boss_titan');
        if (ach) ach.current = Math.min(ach.target, ach.current + 1);
      } else if (currentBoss.tier === 'TIER VI') {
        const ach = gameState.achievements.find(a => a.id === 'ach_boss_empress');
        if (ach) ach.current = Math.min(ach.target, ach.current + 1);
      } else if (currentBoss.tier === 'TIER VII') {
        const ach = gameState.achievements.find(a => a.id === 'ach_boss_ignis');
        if (ach) ach.current = Math.min(ach.target, ach.current + 1);
      }

      bossVulnerableTimer = 0;
      gimmickAnnounced = {};

      gameState.bossIndex = (gameState.bossIndex + 1) % BOSS_DATABASE.length;
      const nextBoss = BOSS_DATABASE[gameState.bossIndex];
      gameState.bossHpRemain = nextBoss.maxHpKm;
    }

    saveGame();
    renderUI();
  }

  btnCastUltimate.addEventListener('click', activateUltimateSkill);

  // --- Open Mystery Chest Logic ---
  function openMysteryChest() {
    if (gameState.chestsAvailable <= 0) return;
    gameState.chestsAvailable -= 1;

    const roll = Math.random();
    if (roll < 0.40 && gameState.inventory.length < 20) {
      const newItem = rollRandomItem();
      gameState.inventory.push(newItem);
      const setLabel = SET_DATABASE[newItem.setId] ? ` [${SET_DATABASE[newItem.setId].name}]` : '';
      showToast(`🎁 พบอุปกรณ์: [${newItem.rarity.toUpperCase()}] ${newItem.name}${setLabel}!`);
      speakVoice(`ได้รับอุปกรณ์ระดับ ${newItem.rarity}`);
    } else if (roll < 0.70) {
      const goldDrop = Math.floor(120 + Math.random() * 220);
      gameState.gold += goldDrop;
      showToast(`🎁 พบถุงทองโบราณ +${goldDrop} 🪙`);
    } else if (roll < 0.92) {
      const expDrop = Math.floor(800 + Math.random() * 1000);
      showToast(`🎁 ดูดซับผลึกวิญญาณ +${expDrop} EXP`);
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
    equipSummaryEl.textContent = `ดาเมจ +${eqBonus.bonusDmg}% | STA +${eqBonus.bonusSta}% | คริ +${eqBonus.bonusCrit}%`;

    const slots = ['weapon', 'armor', 'boots', 'relic'];
    slots.forEach(slotType => {
      const slotBox = document.getElementById(`slot-${slotType}`);
      const iconEl = document.getElementById(`icon-slot-${slotType}`);
      const nameEl = document.getElementById(`name-slot-${slotType}`);
      const setTagEl = document.getElementById(`set-slot-${slotType}`);
      const equippedItem = eq[slotType];

      if (equippedItem) {
        slotBox.classList.add('equipped');
        iconEl.textContent = equippedItem.icon;
        nameEl.textContent = equippedItem.name;

        if (equippedItem.setId && SET_DATABASE[equippedItem.setId]) {
          const s = SET_DATABASE[equippedItem.setId];
          slotBox.classList.add('has-set');
          setTagEl.textContent = s.name.replace('เซ็ต', '');
          setTagEl.style.backgroundColor = `${s.color}22`;
          setTagEl.style.color = s.color;
          setTagEl.style.borderColor = s.color;
        } else {
          slotBox.classList.remove('has-set');
        }
      } else {
        slotBox.classList.remove('equipped', 'has-set');
        const defaultIcons = { weapon: '🗡️', armor: '🛡️', boots: '🥾', relic: '🧿' };
        iconEl.textContent = defaultIcons[slotType];
        nameEl.textContent = 'ว่างเปล่า';
      }
    });

    // Render Active Set Bonuses Banner
    setBonusesContainerEl.innerHTML = '';
    const setCounts = eqBonus.setCounts;
    let hasAnySet = false;

    Object.keys(SET_DATABASE).forEach(sId => {
      const count = setCounts[sId];
      if (count >= 2) {
        hasAnySet = true;
        const s = SET_DATABASE[sId];
        const card = document.createElement('div');
        card.className = 'set-bonus-badge';
        card.style.borderColor = `${s.color}55`;
        card.innerHTML = `
          <div class="set-bonus-header" style="color: ${s.color};">
            <span>${s.icon} ${s.name} (${count}/4 ชิ้น)</span>
            <span>${count >= 4 ? '✨ ปลดล็อกครบ 4 ชิ้น' : '⚡ ปลดล็อก 2 ชิ้น'}</span>
          </div>
          <div class="set-bonus-text ${count >= 2 ? 'active' : ''}">• (2 ชิ้น): ${s.bonuses[2]}</div>
          <div class="set-bonus-text ${count >= 4 ? 'active' : ''}">• (4 ชิ้น): ${s.bonuses[4]}</div>
        `;
        setBonusesContainerEl.appendChild(card);
      }
    });

    if (!hasAnySet) {
      setBonusesContainerEl.innerHTML = `
        <div style="font-size: 0.62rem; color: #71717a; text-align: center; padding: 4px;">
          สวมใส่อุปกรณ์ในเซ็ตเดียวกัน 2 หรือ 4 ชิ้น เพื่อปลดล็อกพลังเซ็ตโบราณ
        </div>
      `;
    }

    invCountEl.textContent = gameState.inventory.length;
    inventoryGridEl.innerHTML = '';

    const filteredItems = currentInvFilter === 'all'
      ? gameState.inventory
      : gameState.inventory.filter(i => i.type === currentInvFilter);

    if (filteredItems.length === 0) {
      inventoryGridEl.innerHTML = '<div style="grid-column: span 4; font-size: 0.66rem; color: #71717a; text-align: center; padding: 18px 0;">ไม่มีไอเทมในหมวดหมู่นี้</div>';
    } else {
      filteredItems.forEach(item => {
        const card = document.createElement('div');
        card.className = `inv-item-card rarity-${item.rarity}`;
        
        let setDotHtml = '';
        if (item.setId && SET_DATABASE[item.setId]) {
          setDotHtml = `<div class="inv-item-set-dot" style="background: ${SET_DATABASE[item.setId].color};" title="${SET_DATABASE[item.setId].name}"></div>`;
        }

        card.innerHTML = `
          ${setDotHtml}
          <span class="inv-item-icon">${item.icon}</span>
          <span class="inv-item-name">${item.name}</span>
        `;
        card.addEventListener('click', () => openItemModal(item));
        inventoryGridEl.appendChild(card);
      });
    }
  }

  // Inventory Filter Tabs Listener
  document.querySelectorAll('.inv-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.inv-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentInvFilter = btn.getAttribute('data-filter');
      renderEquipmentAndInventory();
    });
  });

  function openItemModal(item) {
    selectedInventoryItem = item;
    modalItemIconEl.textContent = item.icon;
    modalItemNameEl.textContent = item.name;
    modalItemRarityEl.textContent = `ระดับ: ${item.rarity.toUpperCase()}`;
    modalItemRarityEl.style.color = `var(--rarity-${item.rarity})`;

    if (item.setId && SET_DATABASE[item.setId]) {
      const s = SET_DATABASE[item.setId];
      modalItemSetEl.style.display = 'inline-block';
      modalItemSetEl.textContent = `${s.icon} ${s.name}`;
      modalItemSetEl.style.color = s.color;
      modalItemSetEl.style.borderColor = `${s.color}66`;
      modalItemSetEl.style.backgroundColor = `${s.color}15`;
      modalSetBonus2El.textContent = `(2 ชิ้น) ${s.bonuses[2]}`;
      modalSetBonus4El.textContent = `(4 ชิ้น) ${s.bonuses[4]}`;
      document.getElementById('modal-set-desc-box').style.display = 'flex';
    } else {
      modalItemSetEl.style.display = 'none';
      document.getElementById('modal-set-desc-box').style.display = 'none';
    }

    modalMainStatEl.textContent = `ค่าพลังหลัก: +${item.mainStatVal}% (ตามชิ้นส่วน)`;
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

  // --- Render Monster Codex (ครบ 7 บอส) ---
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
    codexCounterEl.textContent = `บันทึก ${BOSS_DATABASE.length} อสูร`;
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
          showToast('📤 กู้คืนข้อมูลสำเร็จ! กำลังรีเฟรช...');
          setTimeout(() => location.reload(), 1500);
        } else {
          showToast('❌ รูปแบบไฟล์สำรองไม่ถูกต้อง');
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
    showToast('🗺️ ส่งออกไฟล์ GPX สำเร็จ! นำเข้า Strava ได้');
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
    
    let baseCrit = Math.min(75, (gameState.stats.agi * 0.5) + (gameState.upgrades.eye * 2) + eqBonus.bonusCrit).toFixed(1);
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

    // Dynamic Boss Gimmick Banner Rendering
    const bossHpPct = gameState.bossHpRemain / boss.maxHpKm;
    bossGimmickBannerEl.className = 'boss-gimmick-banner';
    bossCardEl.classList.remove('eclipse-active', 'supernova-active');

    if (boss.gimmick === 'mist') {
      bossGimmickBannerEl.style.display = 'flex';
      if (bossHpPct <= 0.60) {
        bossGimmickBannerEl.classList.add('active-mist');
        bossGimmickTagEl.textContent = '🌫️ หมอกสูบวิญญาณ';
        bossGimmickTextEl.textContent = 'คุมเพซให้เร็วกว่า 7:30/กม. มิฉะนั้นดาเมจลด 50% และบอสจะฮีล';
      } else {
        bossGimmickTagEl.textContent = '⏳ ผนึกหมอก';
        bossGimmickTextEl.textContent = 'หมอกคำสาปจะปะทุเมื่อเลือดบอสต่ำกว่า 60%';
      }
    } else if (boss.gimmick === 'carapace') {
      bossGimmickBannerEl.style.display = 'flex';
      if (bossVulnerableTimer > 0) {
        bossGimmickBannerEl.classList.add('active-vulnerable');
        bossGimmickTagEl.textContent = '🛡️ เกราะแตกสะบั้น!';
        bossGimmickTextEl.textContent = `บอสเปราะบาง รับดาเมจ x2 นานอีก ${bossVulnerableTimer} วิ`;
      } else if (bossHpPct <= 0.30) {
        bossGimmickBannerEl.classList.add('active-carapace');
        bossGimmickTagEl.textContent = '⚡ คลุ้มคลั่ง!';
        bossGimmickTextEl.textContent = 'ดันชีพจรแตะ Zone 3 เพื่อเคาน์เตอร์ดาเมจสวนกลับ x1.5';
      } else {
        bossGimmickBannerEl.classList.add('active-carapace');
        bossGimmickTagEl.textContent = '🗿 เกราะศิลา';
        bossGimmickTextEl.textContent = 'ลดดาเมจ 30% (กะเทาะเกราะด้วยคริติคอล หรือ Shadow Slash)';
      }
    } else if (boss.gimmick === 'empress') {
      bossGimmickBannerEl.style.display = 'flex';
      if (bossHpPct > 0.65) {
        bossGimmickTagEl.textContent = '👑 เฟส 1: ร่างเงาหลอก';
        bossGimmickTextEl.textContent = isFlowStateActive ? '🌊 Flow State ทลายร่างลวงตาแล้ว!' : 'วิ่งคุมเพซเพื่อเข้าสู่ Flow State ไม่เช่นนั้นดาเมจลด 40%';
      } else if (bossHpPct > 0.25) {
        bossGimmickBannerEl.classList.add('active-vulnerable');
        bossGimmickTagEl.textContent = '⚡ เฟส 2: เรโซแนนซ์';
        bossGimmickTextEl.textContent = 'วิ่ง Zone 2-3 ชาร์จไม้ตาย Shadow Slash ไวขึ้น 3 เท่า!';
      } else {
        bossGimmickBannerEl.classList.add('active-eclipse');
        bossCardEl.classList.add('eclipse-active');
        bossGimmickTagEl.textContent = '🌑 เฟส 3: จันทรคราส';
        bossGimmickTextEl.textContent = 'จันทรคราสปะทุ! ดาเมจ +40% และคริติคอล +25% สปรินต์เผด็จศึก!';
      }
    } else if (boss.gimmick === 'supernova') {
      bossGimmickBannerEl.style.display = 'flex';
      if (bossHpPct > 0.50) {
        bossGimmickBannerEl.classList.add('active-carapace');
        bossGimmickTagEl.textContent = '☄️ สุริยะเพลิง';
        bossGimmickTextEl.textContent = 'สะสมระยะทางฝ่าเปลวเพลิงสุริยะเพื่อบุกทะลวงครึ่งแรก';
      } else {
        bossGimmickBannerEl.classList.add('active-supernova');
        bossCardEl.classList.add('supernova-active');
        bossGimmickTagEl.textContent = '💥 SUPERNOVA';
        bossGimmickTextEl.textContent = 'สภาวะซูเปอร์โนวา! เกจไม้ตายชาร์จไว x2 ปลดปล่อย Shadow Slash สังหาร!';
      }
    } else {
      bossGimmickBannerEl.style.display = 'none';
    }

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

    // Ultimate Gauge UI update
    const ultPercent = Math.min(100, Math.floor(gameState.ultimateCharge));
    ultPctValEl.textContent = `${ultPercent}%`;
    ultBarFillEl.style.width = `${ultPercent}%`;

    if (ultPercent >= 100 && isRunning) {
      btnCastUltimate.removeAttribute('disabled');
      btnCastUltimate.classList.add('ready');
      btnCastUltimate.textContent = '🗡️ ปลดปล่อยคมดาบอเวจี (READY)';
    } else {
      btnCastUltimate.setAttribute('disabled', 'true');
      btnCastUltimate.classList.remove('ready');
      btnCastUltimate.textContent = ultPercent >= 100 ? '🗡️ ท่าไม้ตายพร้อม (รอออกล่า)' : '🗡️ ปลดปล่อยคมดาบอเวจี (กำลังชาร์จ)';
    }

    flowBadgeEl.style.display = isFlowStateActive ? 'inline-block' : 'none';

    pocketDistVal.textContent = `${runDistanceKm.toFixed(2)} KM`;
    pocketTimeVal.textContent = timeValEl.textContent;

    if (!isBleConnected) {
      btnBleConnect.textContent = gameState.lastBleDeviceName ? `🔗 เชื่อมต่อ: ${gameState.lastBleDeviceName}` : '🔗 เชื่อมต่อสายคาดอก BLE';
    }

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

      if (isFrenzyActive || currentHrZone === 3) {
        const ultTimeRate = isFlowStateActive ? 1.0 : 0.5;
        addUltimateCharge(ultTimeRate);
      }

      if (isOverdriveActive) {
        overdriveSecondsRemaining--;
        overdriveTimeLeftEl.textContent = overdriveSecondsRemaining;
        if (overdriveSecondsRemaining <= 0) {
          isOverdriveActive = false;
          runHudEl.classList.remove('overdrive-active');
          overdriveBannerEl.style.display = 'none';
          speakVoice('สถานะโอเวอร์ไดรฟ์หมดเวลาลงแล้ว');
          showToast('สถานะ Overdrive สิ้นสุดลง');
        }
      }

      if (bossVulnerableTimer > 0) {
        bossVulnerableTimer--;
      }

      const currentBoss = BOSS_DATABASE[gameState.bossIndex];
      const bossHpPct = gameState.bossHpRemain / currentBoss.maxHpKm;
      if (currentBoss.gimmick === 'mist' && bossHpPct <= 0.60) {
        const rollingPace = getRecentRollingPace();
        if (rollingPace === null || rollingPace > 7.5) {
          mistHealingTick++;
          if (mistHealingTick >= 20) {
            mistHealingTick = 0;
            gameState.bossHpRemain = Math.min(currentBoss.maxHpKm, gameState.bossHpRemain + 0.02);
            showToast('🌫️ หมอกคำสาปสูบพลัง! บอสฟื้นฟูเลือด +0.02 กม.');
          }
        } else {
          mistHealingTick = 0;
        }
      }

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

    isFlowStateActive = false;
    rhythmBaselinePace = null;
    rhythmConsistentDistance = 0.0;
    flowBadgeEl.style.display = 'none';

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
