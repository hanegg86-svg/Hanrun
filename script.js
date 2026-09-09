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
          // จัดเรียงล่าสุดขึ้นก่อน
          list.sort((a, b) => b.id - a.id);
          resolve(list);
        };
        req.onerror = () => resolve([]);
      });
    }
  };

  // --- Web Audio Synthesizer (เสียงประกอบ RPG ในตัว ไม่ง้อไฟล์นอก) ---
  const AudioEngine = {
    ctx: null,
    init() {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    },
    playTone(freq, type, duration, delay = 0) {
      if (!this.ctx) return;
      setTimeout(() => {
        try {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
          gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start();
          osc.stop(this.ctx.currentTime + duration);
        } catch (e) {
          console.warn('Audio play error', e);
        }
      }, delay);
    },
    sfxStart() {
      this.init();
      this.playTone(220, 'triangle', 0.15, 0);
      this.playTone(440, 'triangle', 0.25, 120);
    },
    sfxAttack() {
      this.init();
      this.playTone(180, 'sawtooth', 0.1, 0);
      this.playTone(90, 'sawtooth', 0.15, 60);
    },
    sfxCrit() {
      this.init();
      this.playTone(587.3, 'sawtooth', 0.08, 0);
      this.playTone(880.0, 'sawtooth', 0.15, 60);
    },
    sfxBossDefeat() {
      this.init();
      this.playTone(330, 'square', 0.15, 0);
      this.playTone(440, 'square', 0.2, 120);
      this.playTone(660, 'square', 0.35, 260);
    },
    sfxLevelUp() {
      this.init();
      this.playTone(261.6, 'sine', 0.1, 0);
      this.playTone(329.6, 'sine', 0.1, 80);
      this.playTone(392.0, 'sine', 0.1, 160);
      this.playTone(523.2, 'sine', 0.35, 240);
    }
  };

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

  // --- Game State Object ---
  const defaultState = {
    level: 1,
    title: 'Shadow Initiate',
    currentExp: 0,
    nextExp: 1000,
    gold: 0,
    statPoints: 0,
    stats: { str: 10, sta: 10, agi: 10 },
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
    dailyQuests: [
      { id: 'q1', name: 'วอร์มอัพผจญภัย: สะสมระยะทาง 1.0 กม.', target: 1.0, current: 0.0, unit: 'กม.', rewardExp: 500, rewardGold: 50, claimed: false },
      { id: 'q2', name: 'จู่โจมเงียบ: วิ่งต่อเนื่อง 10 นาที', target: 600, current: 0, unit: 'วินาที', rewardExp: 600, rewardGold: 80, claimed: false },
      { id: 'q3', name: 'จอมพลัง: โค่นบอส 1 ตัว', target: 1, current: 0, unit: 'ตัว', rewardExp: 800, rewardGold: 120, claimed: false }
    ]
  };

  let gameState = defaultState;

  // --- State Migration & Persistence ---
  async function loadGameState() {
    let saved = await DB.getPlayerState();
    if (!saved) {
      // ตรวจสอบข้อมูลเก่าจาก localStorage เพื่อย้ายเข้าสู่ IndexedDB
      const legacySave = localStorage.getItem('shadow_strider_save');
      if (legacySave) {
        try {
          saved = JSON.parse(legacySave);
          localStorage.removeItem('shadow_strider_save');
          console.log('ย้ายข้อมูลผู้เล่นเดิมจาก localStorage เข้าสู่ IndexedDB สำเร็จ');
        } catch (e) {
          console.warn('โหลด save เดิมไม่สำเร็จ', e);
        }
      }
    }

    if (saved) {
      gameState = Object.assign({}, defaultState, saved);
      gameState.stats = Object.assign({}, defaultState.stats, saved.stats || {});
      gameState.career = Object.assign({}, defaultState.career, saved.career || {});
      gameState.dailyQuests = saved.dailyQuests || defaultState.dailyQuests;
    } else {
      gameState = defaultState;
    }
    await DB.savePlayerState(gameState);
  }

  function saveGame() {
    DB.savePlayerState(gameState).catch(err => console.error('Save error', err));
  }

  // --- Daily Quest Reset Check ---
  function verifyDailyReset() {
    const today = new Date().toDateString();
    if (gameState.lastDailyDate !== today) {
      gameState.lastDailyDate = today;
      gameState.dailyQuests = [
        { id: 'q1', name: 'วอร์มอัพผจญภัย: สะสมระยะทาง 1.0 กม.', target: 1.0, current: 0.0, unit: 'กม.', rewardExp: 500, rewardGold: 50, claimed: false },
        { id: 'q2', name: 'จู่โจมเงียบ: วิ่งต่อเนื่อง 10 นาที', target: 600, current: 0, unit: 'วินาที', rewardExp: 600, rewardGold: 80, claimed: false },
        { id: 'q3', name: 'จอมพลัง: โค่นบอส 1 ตัว', target: 1, current: 0, unit: 'ตัว', rewardExp: 800, rewardGold: 120, claimed: false }
      ];
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

  // --- DOM Elements ---
  const playerTitleEl = document.getElementById('player-title');
  const playerLevelEl = document.getElementById('player-level');
  const expBarFillEl = document.getElementById('exp-bar-fill');
  const expCurrentEl = document.getElementById('exp-current');
  const expNextEl = document.getElementById('exp-next');
  const goldValueEl = document.getElementById('gold-value');

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
  const gameToastEl = document.getElementById('game-toast');

  const careerDistanceEl = document.getElementById('career-distance');
  const careerTimeEl = document.getElementById('career-time');
  const careerBossesEl = document.getElementById('career-bosses');
  const careerLongestEl = document.getElementById('career-longest');
  const historyListEl = document.getElementById('history-list');
  const historyCountEl = document.getElementById('history-count');

  // --- Haversine Distance (กิโลเมตร) ---
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // รัศมีโลกเป็นกิโลเมตร
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
    if (navigator.vibrate) navigator.vibrate(80);
    setTimeout(() => {
      gameToastEl.classList.remove('show');
    }, 2800);
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
      AudioEngine.sfxLevelUp();
      showToast(`⭐ เลเวลอัป! ก้าวสู่อันดับ LV. ${gameState.level} (ได้รับ +3 แต้มสเตตัส)`);
    }
    if (leveledUp) {
      gameState.title = getTitleForLevel(gameState.level);
    }
    saveGame();
    renderUI();
  }

  function applyDistanceDamage(distanceDeltaKm) {
    if (distanceDeltaKm <= 0) return;

    // เควสต์ระยะทาง
    gameState.dailyQuests[0].current = Math.min(
      gameState.dailyQuests[0].target,
      parseFloat((gameState.dailyQuests[0].current + distanceDeltaKm).toFixed(2))
    );

    // คำนวณ STR Bonus: 1 STR เหนือ 10 เพิ่มดาเมจ +5%
    const strMultiplier = 1 + Math.max(0, (gameState.stats.str - 10) * 0.05);

    // คำนวณ AGI Bonus: โอกาสคริติคอล AGI * 0.5% (สูงสุด 50%) สร้างความเสียหาย x1.8
    const critChance = Math.min(50, gameState.stats.agi * 0.5);
    const isCrit = (Math.random() * 100) < critChance;
    const effectiveDamage = distanceDeltaKm * strMultiplier * (isCrit ? 1.8 : 1.0);

    if (isCrit) {
      AudioEngine.sfxCrit();
      showToast(`💥 CRITICAL! โจมตีทะลวง x1.8 เท่า`);
    } else {
      AudioEngine.sfxAttack();
    }

    // หักเลือดบอส
    const currentBoss = BOSS_DATABASE[gameState.bossIndex];
    gameState.bossHpRemain = Math.max(0, gameState.bossHpRemain - effectiveDamage);

    if (gameState.bossHpRemain <= 0.001) {
      // โค่นบอสสำเร็จ
      AudioEngine.sfxBossDefeat();
      sessionBossKills += 1;
      gameState.career.totalBossDefeated = (gameState.career.totalBossDefeated || 0) + 1;

      // คำนวณ STA Bonus: 1 STA เหนือ 10 มอบโบนัสทองและ EXP +2%
      const staMultiplier = 1 + Math.max(0, (gameState.stats.sta - 10) * 0.02);
      const rewardExp = Math.floor(currentBoss.rewardExp * staMultiplier);
      const rewardGold = Math.floor(currentBoss.rewardGold * staMultiplier);

      showToast(`🏆 สยบ ${currentBoss.name}! ได้รับ +${rewardExp} EXP & +${rewardGold} เหรียญ`);
      addExp(rewardExp);
      gameState.gold += rewardGold;

      // อัปเดตเควสต์โค่นบอส
      gameState.dailyQuests[2].current = Math.min(gameState.dailyQuests[2].target, gameState.dailyQuests[2].current + 1);

      // หมุนเวียนบอสตัวถัดไป
      gameState.bossIndex = (gameState.bossIndex + 1) % BOSS_DATABASE.length;
      const nextBoss = BOSS_DATABASE[gameState.bossIndex];
      gameState.bossHpRemain = nextBoss.maxHpKm;
    }

    saveGame();
    renderUI();
  }

  // --- UI Renderer ---
  function renderUI() {
    // ผู้เล่น
    playerTitleEl.textContent = gameState.title || getTitleForLevel(gameState.level);
    playerLevelEl.textContent = `LV. ${gameState.level}`;
    const expPercent = Math.min(100, Math.round((gameState.currentExp / gameState.nextExp) * 100));
    expBarFillEl.style.width = `${expPercent}%`;
    expCurrentEl.textContent = gameState.currentExp;
    expNextEl.textContent = gameState.nextExp;
    goldValueEl.textContent = gameState.gold;

    // แต้มสเตตัสและการอัปเกรด
    const hasPoints = (gameState.statPoints || 0) > 0;
    statPointsBarEl.style.display = hasPoints ? 'block' : 'none';
    statPointsValEl.textContent = gameState.statPoints || 0;

    [btnAddStr, btnAddSta, btnAddAgi].forEach(btn => {
      btn.classList.toggle('active', hasPoints);
    });

    statStrEl.textContent = gameState.stats.str;
    statStaEl.textContent = gameState.stats.sta;
    statAgiEl.textContent = gameState.stats.agi;

    strMultEl.textContent = (1 + Math.max(0, (gameState.stats.str - 10) * 0.05)).toFixed(1);
    staMultEl.textContent = Math.round(Math.max(0, (gameState.stats.sta - 10) * 2));
    agiCritEl.textContent = Math.min(50, gameState.stats.agi * 0.5).toFixed(1);

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

    // ตัววัดการวิ่ง
    distanceValEl.textContent = runDistanceKm.toFixed(2);
    calValEl.textContent = `${Math.floor(runDistanceKm * 65)} kcal`;

    // สถิติสะสม (Career Stats)
    careerDistanceEl.textContent = `${(gameState.career.totalDistanceKm || 0).toFixed(2)} กม.`;
    careerTimeEl.textContent = formatTime(gameState.career.totalSeconds || 0);
    careerBossesEl.textContent = `${gameState.career.totalBossDefeated || 0} ตัว`;
    careerLongestEl.textContent = `${(gameState.career.longestRunKm || 0).toFixed(2)} กม.`;

    // เควสต์ประจำวัน
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

    // ปุ่มรับรางวัลเควสต์
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

  // --- Render Run History from IndexedDB ---
  async function renderHistoryUI() {
    const history = await DB.getAllRunHistory();
    historyCountEl.textContent = `${history.length} บันทึก`;
    historyListEl.innerHTML = '';

    if (history.length === 0) {
      historyListEl.innerHTML = '<div class="history-empty">ยังไม่มีประวัติการล่า จงเริ่มออกวิ่งรอบแรก!</div>';
      return;
    }

    history.slice(0, 10).forEach(item => {
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
            <span class="h-val">${item.distanceKm.toFixed(2)} k</span>
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

  // --- Run Timers & Pace ---
  function formatTime(totalSecs) {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function updatePace() {
    if (runDistanceKm > 0.05 && runSeconds > 0) {
      const paceDec = (runSeconds / 60) / runDistanceKm;
      const paceMin = Math.floor(paceDec);
      const paceSec = Math.round((paceDec - paceMin) * 60);
      paceValEl.textContent = `${paceMin}'${paceSec.toString().padStart(2, '0')}"`;
    } else {
      paceValEl.textContent = `--'--"`;
    }
  }

  function startRunEngine() {
    AudioEngine.sfxStart();
    isRunning = true;
    btnToggleRun.classList.add('running');
    btnRunText.textContent = 'หยุดชั่วคราว';
    btnFinishRun.removeAttribute('disabled');

    // Timer
    runTimerInterval = setInterval(() => {
      runSeconds++;
      timeValEl.textContent = formatTime(runSeconds);
      updatePace();

      // เควสต์จับเวลาวิ่ง
      gameState.dailyQuests[1].current = Math.min(
        gameState.dailyQuests[1].target,
        gameState.dailyQuests[1].current + 1
      );
    }, 1000);

    // Geolocation Watch
    if (!isSimMode && 'geolocation' in navigator) {
      gpsStatusEl.textContent = 'GPS: กำลังเชื่อมสัญญาณ...';
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          gpsStatusEl.textContent = 'GPS: ล็อกพิกัดแล้ว 🟢';
          const { latitude, longitude, accuracy } = pos.coords;

          if (accuracy > 30) return; // กรองสัญญาณกระตุก

          if (lastCoord) {
            const deltaKm = calculateDistance(lastCoord.latitude, lastCoord.longitude, latitude, longitude);
            // กรองสปีดกระโดดที่เกินจริง (> 35 km/h)
            if (deltaKm > 0.005 && deltaKm < 0.2) {
              runDistanceKm += deltaKm;
              applyDistanceDamage(deltaKm);
            }
          }
          lastCoord = { latitude, longitude };
          renderUI();
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
  }

  async function finishRunSession() {
    pauseRunEngine();
    showToast(`🏁 จบการออกล่า! สะสมระยะทางได้ ${runDistanceKm.toFixed(2)} กม.`);

    // EXP เพิ่มเติมจากการวิ่ง (STA มีผลคูณโบนัส)
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

    // บันทึกประวัติรอบนี้เข้าสู่ IndexedDB
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
    timeValEl.textContent = '00:00:00';
    paceValEl.textContent = `--'--"`;
    btnRunText.textContent = 'เริ่มออกล่า';
    btnFinishRun.setAttribute('disabled', 'true');

    saveGame();
    renderUI();
    await renderHistoryUI();
  }

  // --- Stat Allocation Handlers ---
  function upgradeStat(statKey) {
    if ((gameState.statPoints || 0) > 0) {
      gameState.statPoints -= 1;
      gameState.stats[statKey] += 1;
      AudioEngine.sfxStart();
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
      applyDistanceDamage(km);
      renderUI();
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
    if (confirm('คุณต้องการจบเซสชันการวิ่งและบันทึกประวัติการล่าหรือไม่?')) {
      finishRunSession();
    }
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
  verifyDailyReset();
  renderUI();
  await renderHistoryUI();
})();
