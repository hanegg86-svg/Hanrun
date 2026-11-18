// ShadowStrider: Dark Run RPG - Module 2: Dark Fantasy Map, Offline Radar & 40m Persistent Combat
(function () {
  'use strict';

  const App = window.ShadowStriderApp = window.ShadowStriderApp || {};

  const SPAWN_RADIUS_KM = 0.50;      // 500 meters spawn radius
  const ENGAGE_RADIUS_KM = 0.040;    // 40 meters engage radius
  const RADAR_WARN_RADIUS_KM = 0.080; // 80 meters radar alert radius
  const MAX_ACTIVE_MONSTERS = 5;

  let leafletMap = null;
  let playerMarker = null;
  let engageCircle = null;
  let spawnPerimeterCircle = null;
  let monsterMarkersLayer = null;
  let pursuitLine = null;
  let forceRadarMode = false;

  let playerLat = 13.7314;
  let playerLon = 100.5414;
  let hasRealGpsFix = false;

  let activeEncounterId = null;
  let lastRadarWarnId = null;

  function pickWeightedRoamingTemplate() {
    const pool = App.ROAMING_MONSTER_DATABASE;
    const totalWeight = pool.reduce((sum, item) => sum + (item.weight || 10), 0);
    let r = Math.random() * totalWeight;
    for (const item of pool) {
      r -= (item.weight || 10);
      if (r <= 0) return item;
    }
    return pool[0];
  }

  function generateRandomCoordWithinRadius(centerLat, centerLon, minKm, maxKm) {
    // Uniform area distribution within [minKm, maxKm]
    const minSq = minKm * minKm;
    const maxSq = maxKm * maxKm;
    const distKm = Math.sqrt(minSq + Math.random() * (maxSq - minSq));
    const bearing = Math.random() * 2 * Math.PI;

    const dLat = (distKm * Math.cos(bearing)) / 111.32;
    const dLon = (distKm * Math.sin(bearing)) / (111.32 * Math.cos(centerLat * Math.PI / 180));

    return {
      lat: centerLat + dLat,
      lon: centerLon + dLon
    };
  }

  function createRoamingMonsterInstance(centerLat, centerLon, playerLevel) {
    const template = pickWeightedRoamingTemplate();
    const scaled = App.getRoamingMonsterScaledStats(template, playerLevel);
    // Spawn between 45m and 460m so enemies appear outside the immediate 40m engage zone
    const coord = generateRandomCoordWithinRadius(centerLat, centerLon, 0.045, SPAWN_RADIUS_KM * 0.92);

    return {
      uid: `rm_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      templateId: template.id,
      name: template.name,
      thName: template.thName,
      avatar: template.avatar,
      mapIcon: template.gimmick === 'mimic' ? '📦' : template.mapIcon,
      gimmick: template.gimmick,
      gimmickDesc: template.gimmickDesc,
      level: scaled.level,
      maxHpKm: scaled.maxHpKm,
      hpRemainKm: scaled.maxHpKm,
      rewardExp: scaled.rewardExp,
      rewardGold: scaled.rewardGold,
      lat: coord.lat,
      lon: coord.lon,
      engaged: false,
      timerLeft: template.gimmick === 'stalker' ? 40 : null,
      spawnedAt: Date.now()
    };
  }

  App.MapEngine = {
    init() {
      const btnCenter = document.getElementById('btn-center-map');
      const btnToggleRadar = document.getElementById('btn-toggle-radar-mode');
      const hudRadarBox = document.getElementById('hud-radar-box');

      if (btnCenter) {
        btnCenter.addEventListener('click', () => {
          if (leafletMap) {
            leafletMap.setView([playerLat, playerLon], 16);
          }
          App.core?.showToast('🎯 จัดกึ่งกลางตำแหน่งผู้เล่นแล้ว');
        });
      }

      if (btnToggleRadar) {
        btnToggleRadar.addEventListener('click', () => {
          forceRadarMode = !forceRadarMode;
          btnToggleRadar.classList.toggle('active', forceRadarMode);
          btnToggleRadar.textContent = forceRadarMode ? '🗺️ แผนที่' : '📡 เรดาร์';
          this.renderMapAndRadar();
        });
      }

      if (hudRadarBox) {
        hudRadarBox.addEventListener('click', () => {
          if (App.core?.switchTab) {
            App.core.switchTab('tab-map');
          }
        });
      }

      // Initialize default coordinates via browser geolocation if available
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            playerLat = pos.coords.latitude;
            playerLon = pos.coords.longitude;
            hasRealGpsFix = true;
            this.ensureMonstersSpawned();
            this.evaluateProximity();
            this.renderMapAndRadar();
          },
          () => {
            this.ensureMonstersSpawned();
            this.evaluateProximity();
            this.renderMapAndRadar();
          },
          { enableHighAccuracy: true, timeout: 6000 }
        );
      } else {
        this.ensureMonstersSpawned();
        this.evaluateProximity();
        this.renderMapAndRadar();
      }
    },

    onTabOpened() {
      setTimeout(() => {
        if (leafletMap) {
          leafletMap.invalidateSize();
          leafletMap.setView([playerLat, playerLon], leafletMap.getZoom() || 16);
        }
        this.renderMapAndRadar();
      }, 80);
    },

    getPlayerCoords() {
      return { lat: playerLat, lon: playerLon, hasRealGpsFix };
    },

    ensureMonstersSpawned() {
      const gs = App.core?.getGameState();
      if (!gs) return;
      if (!Array.isArray(gs.roamingMonsters)) {
        gs.roamingMonsters = [];
      }

      // Restore activeEncounterId if an engaged monster exists in saved state
      if (!activeEncounterId) {
        const alreadyEngaged = gs.roamingMonsters.find(m => m.engaged);
        if (alreadyEngaged) {
          activeEncounterId = alreadyEngaged.uid;
        }
      } else if (!gs.roamingMonsters.some(m => m.uid === activeEncounterId)) {
        activeEncounterId = null;
      }

      let changed = false;
      // 1. Keep monsters within 500m OR any monster already engaged in persistent combat
      const kept = [];
      for (const m of gs.roamingMonsters) {
        const distKm = App.core.calculateDistance(playerLat, playerLon, m.lat, m.lon);
        const isLockedCombat = m.engaged || activeEncounterId === m.uid;
        if (distKm > SPAWN_RADIUS_KM && !isLockedCombat) {
          changed = true;
        } else {
          kept.push(m);
        }
      }
      gs.roamingMonsters = kept;

      // 2. Spawn new fixed-position monsters up to MAX_ACTIVE_MONSTERS inside <= 500m radius
      while (gs.roamingMonsters.length < MAX_ACTIVE_MONSTERS) {
        const inst = createRoamingMonsterInstance(playerLat, playerLon, gs.level || 1);
        gs.roamingMonsters.push(inst);
        changed = true;
      }

      if (changed && App.core?.saveGame) {
        App.core.saveGame();
      }
    },

    updatePlayerPosition(lat, lon, isReal = true) {
      playerLat = lat;
      playerLon = lon;
      if (isReal) hasRealGpsFix = true;

      this.ensureMonstersSpawned();
      this.evaluateProximity();
      this.renderMapAndRadar();
    },

    tickSecond() {
      const gs = App.core?.getGameState();
      if (!gs || !Array.isArray(gs.roamingMonsters)) return;

      if (activeEncounterId) {
        const m = gs.roamingMonsters.find(item => item.uid === activeEncounterId);
        if (m && m.gimmick === 'stalker' && typeof m.timerLeft === 'number') {
          m.timerLeft--;
          if (m.timerLeft <= 0) {
            // Void Stalker warps away if not defeated in 40s
            gs.roamingMonsters = gs.roamingMonsters.filter(item => item.uid !== m.uid);
            activeEncounterId = null;
            App.core.showToast('💨 Void Stalker วาร์ปหนีหายไปในมิติมืด!');
            App.core.speakVoice('นักล่าเงาต่างมิติวาร์ปหนีไปแล้ว');
            this.ensureMonstersSpawned();
            this.renderMapAndRadar();
            App.core.saveGame();
          }
          this.renderEncounterCard();
        }
      }
    },

    evaluateProximity() {
      const gs = App.core?.getGameState();
      if (!gs || !Array.isArray(gs.roamingMonsters)) return;

      // Validate existing locked encounter; once engaged within 40m, it persists even if player leaves radius
      let lockedMonster = null;
      if (activeEncounterId) {
        lockedMonster = gs.roamingMonsters.find(m => m.uid === activeEncounterId) || null;
        if (!lockedMonster) {
          activeEncounterId = null;
        }
      }
      if (!lockedMonster) {
        lockedMonster = gs.roamingMonsters.find(m => m.engaged) || null;
        if (lockedMonster) {
          activeEncounterId = lockedMonster.uid;
        }
      }

      let nearest = null;
      let nearestDistKm = Infinity;

      for (const m of gs.roamingMonsters) {
        const dKm = App.core.calculateDistance(playerLat, playerLon, m.lat, m.lon);
        m._currentDistKm = dKm;
        if (dKm < nearestDistKm) {
          nearestDistKm = dKm;
          nearest = m;
        }
      }

      const nearestHudEl = document.getElementById('nearest-monster-val');
      const badgeMapEl = document.getElementById('badge-map');

      // If not yet locked into combat, check if any monster is within 40m engage radius
      if (!lockedMonster && nearest && nearestDistKm <= ENGAGE_RADIUS_KM) {
        activeEncounterId = nearest.uid;
        nearest.engaged = true;
        lockedMonster = nearest;

        if (nearest.gimmick === 'mimic') {
          nearest.mapIcon = '👹';
          App.core.showToast(`📦 กับดัก! หีบสมบัติกลายร่างเป็น ${nearest.name} (LV.${nearest.level}) ไล่ล่าคุณแล้ว!`);
          App.core.speakVoice(`ระวังกับดัก หีบสมบัติกลายร่างเป็นปีศาจจำแลง เลเวล ${nearest.level} เข้าปะทะแล้ว`, true);
        } else {
          App.core.showToast(`⚔️ ปะทะ ${nearest.name} (LV.${nearest.level}) ในรัศมี 40 เมตร! ศัตรูจะสู้ต่อเนื่องจนกว่าจะจบศึก`);
          App.core.speakVoice(`พบอสูรพิเศษ ${nearest.thName} เลเวล ${nearest.level} ศัตรูเข้าโจมตีแล้ว`, true);
        }
        App.core.saveGame();
      }

      const displayTarget = lockedMonster || nearest;
      if (displayTarget) {
        const displayDistKm = lockedMonster
          ? App.core.calculateDistance(playerLat, playerLon, lockedMonster.lat, lockedMonster.lon)
          : nearestDistKm;
        const distMeters = Math.round(displayDistKm * 1000);

        if (nearestHudEl) {
          if (lockedMonster) {
            nearestHudEl.textContent = `⚔️ ${distMeters} ม.`;
            nearestHudEl.style.color = '#4ade80';
          } else {
            nearestHudEl.textContent = distMeters >= 1000 ? `${displayDistKm.toFixed(2)} กม.` : `${distMeters} ม.`;
            nearestHudEl.style.color = distMeters <= 40 ? '#4ade80' : (distMeters <= 80 ? '#38bdf8' : '#c084fc');
          }
        }

        if (lockedMonster) {
          if (badgeMapEl) badgeMapEl.style.display = 'flex';
        } else {
          if (nearestDistKm <= RADAR_WARN_RADIUS_KM && lastRadarWarnId !== nearest.uid) {
            lastRadarWarnId = nearest.uid;
            App.core.showToast(`📡 เรดาร์ตรวจพบ ${nearest.name} ห่างออกไป ${distMeters} เมตร!`);
            App.core.speakVoice(`ตรวจพบอสูรพิเศษในระยะ ${distMeters} เมตร`);
          }
          if (badgeMapEl) badgeMapEl.style.display = nearestDistKm <= RADAR_WARN_RADIUS_KM ? 'flex' : 'none';
        }
      } else {
        if (nearestHudEl) nearestHudEl.textContent = '-- ม.';
        if (badgeMapEl) badgeMapEl.style.display = 'none';
      }

      this.renderEncounterCard();
    },

    applyFieldCombatDamage(baseDamageKm, context) {
      const gs = App.core?.getGameState();
      if (!gs || !activeEncounterId) return;

      const m = gs.roamingMonsters.find(item => item.uid === activeEncounterId);
      if (!m) {
        activeEncounterId = null;
        this.renderEncounterCard();
        return;
      }

      let mult = 1.0;
      const { isCrit, isFlowStateActive, isFrenzyActive, currentHrZone, rollingPace, avgPace } = context;

      if (m.gimmick === 'hound') {
        if (rollingPace !== null && avgPace !== null && rollingPace <= (avgPace - 0.3)) {
          mult *= 2.5;
        }
      } else if (m.gimmick === 'scarab') {
        if (isCrit) {
          mult *= 2.0; // Critical shatters beetle armor
        } else {
          mult *= 0.30; // 70% armor reduction
        }
      } else if (m.gimmick === 'leech') {
        if (rollingPace === null || rollingPace > 8.0) {
          gs.ultimateCharge = Math.max(0, (gs.ultimateCharge || 0) - 2);
          mult *= 0.6;
        }
      } else if (m.gimmick === 'banshee') {
        if (isFlowStateActive) {
          mult *= 3.0;
        }
      } else if (m.gimmick === 'berserker') {
        if (isFrenzyActive || currentHrZone === 3 || currentHrZone === 4) {
          mult *= 2.2;
        }
      } else if (m.gimmick === 'archdemon') {
        mult *= (isCrit || isFlowStateActive) ? 1.5 : 0.5;
      }

      const finalDamage = baseDamageKm * mult;
      m.hpRemainKm = Math.max(0, parseFloat((m.hpRemainKm - finalDamage).toFixed(4)));

      if (m.hpRemainKm <= 0.0005) {
        this.handleRoamingMonsterDefeat(m);
      } else {
        App.core.saveGame();
        this.renderEncounterCard();
      }
    },

    applyUltimateBurstToEncounter(burstDamageKm) {
      const gs = App.core?.getGameState();
      if (!gs || !activeEncounterId) return;
      const m = gs.roamingMonsters.find(item => item.uid === activeEncounterId);
      if (!m) return;

      m.hpRemainKm = Math.max(0, parseFloat((m.hpRemainKm - burstDamageKm).toFixed(4)));
      if (m.hpRemainKm <= 0.0005) {
        this.handleRoamingMonsterDefeat(m);
      } else {
        App.core.saveGame();
        this.renderEncounterCard();
      }
    },

    handleRoamingMonsterDefeat(monster) {
      const gs = App.core?.getGameState();
      if (!gs) return;

      gs.roamingMonsters = gs.roamingMonsters.filter(item => item.uid !== monster.uid);
      activeEncounterId = null;

      // Update Bestiary & Stats
      if (!gs.bestiary[monster.templateId]) {
        gs.bestiary[monster.templateId] = { kills: 0, name: monster.name };
      }
      gs.bestiary[monster.templateId].kills += 1;
      gs.statsTrack.roamingKills = (gs.statsTrack.roamingKills || 0) + 1;

      let expGain = monster.rewardExp;
      let goldGain = monster.rewardGold;
      let extraMsg = '';

      if (monster.gimmick === 'wisp') {
        App.core.addUltimateCharge(25);
        extraMsg = ' +25% เกจไม้ตาย';
      } else if (monster.gimmick === 'scarab') {
        const rune = App.core.rollRandomRuneDrop(false);
        extraMsg = ` +🪨 ${rune.name} Rune`;
      } else if (monster.gimmick === 'leech') {
        goldGain = Math.floor(goldGain * 2.5);
      } else if (monster.gimmick === 'mimic') {
        gs.chestsAvailable = (gs.chestsAvailable || 0) + 1;
        extraMsg = ' +📦 1 หีบสมบัติ';
      } else if (monster.gimmick === 'berserker') {
        if (Math.random() < 0.25) {
          gs.statPoints = (gs.statPoints || 0) + 1;
          extraMsg = ' +1 แต้มสเตตัส!';
        }
      } else if (monster.gimmick === 'stalker') {
        const rareRunes = ['shael', 'dol', 'hel', 'io', 'lum'];
        const chosen = rareRunes[Math.floor(Math.random() * rareRunes.length)];
        gs.runeStash[chosen] = (gs.runeStash[chosen] || 0) + 1;
        extraMsg = ` +🪨 ${App.RUNE_DATABASE[chosen].name} Rune`;
      } else if (monster.gimmick === 'golem') {
        const rune = App.core.rollRandomRuneDrop(true);
        if (App.core.triggerOverdriveBuff) {
          App.core.triggerOverdriveBuff(60);
        }
        extraMsg = ` +🔥 Overdrive 60วิ & 🪨 ${rune.name} Rune`;
      } else if (monster.gimmick === 'archdemon') {
        const rune = App.core.rollRandomRuneDrop(true);
        gs.chestsAvailable = (gs.chestsAvailable || 0) + 1;
        extraMsg = ` +📦 หีบสมบัติ & 🪨 ${rune.name} Rune`;
      }

      gs.gold += goldGain;
      App.core.addExp(expGain);

      App.core.showToast(`⚔️ สยบ ${monster.name} (LV.${monster.level})! +${expGain.toLocaleString()} EXP, +${goldGain.toLocaleString()} 🪙${extraMsg}`);
      App.core.speakVoice(`กำจัด ${monster.thName} สำเร็จแล้ว`, true);

      // Spawn replacement inside 500m radius
      this.ensureMonstersSpawned();
      this.evaluateProximity();
      this.renderMapAndRadar();
      App.core.saveGame();
      App.core.renderUI();
    },

    renderEncounterCard() {
      const card = document.getElementById('encounter-card');
      if (!card) return;
      const gs = App.core?.getGameState();
      if (!gs || !Array.isArray(gs.roamingMonsters)) {
        card.style.display = 'none';
        return;
      }

      // Show locked persistent combat monster OR 80m proximity radar preview
      let target = null;
      let isCombat = false;

      if (activeEncounterId) {
        target = gs.roamingMonsters.find(m => m.uid === activeEncounterId);
        isCombat = !!target;
      }

      if (!target) {
        let bestDist = RADAR_WARN_RADIUS_KM;
        for (const m of gs.roamingMonsters) {
          const d = App.core.calculateDistance(playerLat, playerLon, m.lat, m.lon);
          if (d <= bestDist) {
            bestDist = d;
            target = m;
          }
        }
      }

      if (!target) {
        card.style.display = 'none';
        return;
      }

      const distMeters = Math.round(App.core.calculateDistance(playerLat, playerLon, target.lat, target.lon) * 1000);
      card.style.display = 'block';
      card.classList.toggle('radar-warn', !isCombat);

      if (isCombat) {
        document.getElementById('encounter-tag').textContent = distMeters <= 40
          ? '⚔️ ปะทะอสูรพิเศษในรัศมี 40 เมตร!'
          : '⚔️ อสูรไล่ล่าต่อเนื่อง! (ล็อกเป้าการต่อสู้แล้ว)';
      } else {
        document.getElementById('encounter-tag').textContent = '📡 เรดาร์ตรวจพบอสูรใกล้เคียง (เข้าใกล้ 40 ม. เพื่อปะทะ)';
      }

      document.getElementById('encounter-lvl').textContent = `LV. ${target.level}`;
      document.getElementById('encounter-avatar').textContent = target.mapIcon || target.avatar;
      document.getElementById('encounter-name').textContent = `${target.name} (${target.thName})`;
      document.getElementById('encounter-dist').textContent = isCombat && distMeters > 40
        ? `ห่าง ${distMeters} ม. • ติดตามสู้`
        : `ห่าง ${distMeters} ม.`;
      document.getElementById('encounter-gimmick').textContent = target.gimmickDesc;

      const hpPct = Math.max(0, Math.min(100, (target.hpRemainKm / target.maxHpKm) * 100));
      document.getElementById('encounter-hp-fill').style.width = `${hpPct}%`;
      document.getElementById('encounter-hp-remain').textContent = target.hpRemainKm.toFixed(3);
      document.getElementById('encounter-hp-max').textContent = target.maxHpKm.toFixed(3);

      const timerEl = document.getElementById('encounter-timer-text');
      if (timerEl) {
        timerEl.textContent = (target.gimmick === 'stalker' && typeof target.timerLeft === 'number')
          ? `⏳ เหลือเวลา ${target.timerLeft}s`
          : '';
      }
    },

    renderMapAndRadar() {
      const gs = App.core?.getGameState();
      if (!gs) return;

      const mapDiv = document.getElementById('dungeon-map');
      const radarCanvas = document.getElementById('offline-radar-canvas');
      const canUseLeaflet = (typeof window.L !== 'undefined') && navigator.onLine && !forceRadarMode;

      if (canUseLeaflet && mapDiv && radarCanvas) {
        mapDiv.style.display = 'block';
        radarCanvas.style.display = 'none';
        this.renderLeafletMap(gs);
      } else if (mapDiv && radarCanvas) {
        mapDiv.style.display = 'none';
        radarCanvas.style.display = 'block';
        this.renderOfflineRadar(gs, radarCanvas);
      }

      this.renderRoamingList(gs);
    },

    renderLeafletMap(gs) {
      const L = window.L;
      if (!L) return;

      if (!leafletMap) {
        leafletMap = L.map('dungeon-map', {
          center: [playerLat, playerLon],
          zoom: 16,
          zoomControl: false,
          attributionControl: false
        });

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          crossOrigin: true
        }).addTo(leafletMap);

        spawnPerimeterCircle = L.circle([playerLat, playerLon], {
          radius: 500,
          color: '#a855f7',
          weight: 1.5,
          dashArray: '6, 6',
          fillColor: '#a855f7',
          fillOpacity: 0.04
        }).addTo(leafletMap);

        engageCircle = L.circle([playerLat, playerLon], {
          radius: 40,
          color: '#38bdf8',
          weight: 2,
          fillColor: '#38bdf8',
          fillOpacity: 0.22
        }).addTo(leafletMap);

        const pIcon = L.divIcon({
          className: 'dark-player-pin',
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });
        playerMarker = L.marker([playerLat, playerLon], { icon: pIcon }).addTo(leafletMap);
        monsterMarkersLayer = L.layerGroup().addTo(leafletMap);
      } else {
        playerMarker.setLatLng([playerLat, playerLon]);
        engageCircle.setLatLng([playerLat, playerLon]);
        spawnPerimeterCircle.setLatLng([playerLat, playerLon]);
      }

      monsterMarkersLayer.clearLayers();
      pursuitLine = null;

      (gs.roamingMonsters || []).forEach(m => {
        const distM = Math.round(App.core.calculateDistance(playerLat, playerLon, m.lat, m.lon) * 1000);
        const isEngaged = m.engaged || m.uid === activeEncounterId;

        if (isEngaged) {
          pursuitLine = L.polyline([[playerLat, playerLon], [m.lat, m.lon]], {
            color: '#ef4444',
            weight: 2.5,
            dashArray: '5, 6',
            opacity: 0.85
          }).addTo(monsterMarkersLayer);
        }

        const mIcon = L.divIcon({
          className: `dark-monster-pin ${isEngaged ? 'engaged-pin' : ''}`,
          html: `<span>${m.mapIcon || m.avatar}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        });
        const marker = L.marker([m.lat, m.lon], { icon: mIcon });
        const statusLine = isEngaged ? '<br><span style="color:#4ade80;">⚔️ กำลังต่อสู้ต่อเนื่อง!</span>' : '';
        marker.bindPopup(`<strong>${m.name} (LV.${m.level})</strong><br>ระยะห่าง: ${distM} ม.<br>HP: ${m.hpRemainKm.toFixed(2)} กม.${statusLine}`);
        monsterMarkersLayer.addLayer(marker);
      });
    },

    renderOfflineRadar(gs, canvas) {
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(cx, cy) - 18;

      ctx.clearRect(0, 0, w, h);

      // Draw radar rings (125m, 250m, 375m, 500m)
      [0.25, 0.5, 0.75, 1.0].forEach((ratio, idx) => {
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * ratio, 0, Math.PI * 2);
        ctx.strokeStyle = idx === 3 ? 'rgba(168, 85, 247, 0.65)' : 'rgba(212, 175, 55, 0.2)';
        ctx.lineWidth = idx === 3 ? 1.5 : 1;
        ctx.stroke();
      });

      // Draw 40m engage perimeter ring
      const engageR = Math.max(10, (ENGAGE_RADIUS_KM / SPAWN_RADIUS_KM) * maxR);
      ctx.beginPath();
      ctx.arc(cx, cy, engageR, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Crosshairs
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy);
      ctx.lineTo(cx + maxR, cy);
      ctx.moveTo(cx, cy - maxR);
      ctx.lineTo(cx, cy + maxR);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.stroke();

      // Player dot at center
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();

      // Plot monsters within 500m (clamp engaged monsters chasing outside 500m to edge)
      (gs.roamingMonsters || []).forEach(m => {
        const dLatKm = (m.lat - playerLat) * 111.32;
        const dLonKm = (m.lon - playerLon) * (111.32 * Math.cos(playerLat * Math.PI / 180));
        let offsetX = (dLonKm / SPAWN_RADIUS_KM) * maxR;
        let offsetY = -(dLatKm / SPAWN_RADIUS_KM) * maxR;

        const distPx = Math.hypot(offsetX, offsetY);
        if (distPx > maxR) {
          offsetX = (offsetX / distPx) * maxR;
          offsetY = (offsetY / distPx) * maxR;
        }

        const px = cx + offsetX;
        const py = cy + offsetY;

        if (m.engaged || m.uid === activeEncounterId) {
          ctx.save();
          ctx.beginPath();
          ctx.setLineDash([4, 4]);
          ctx.moveTo(cx, cy);
          ctx.lineTo(px, py);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }

        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.mapIcon || m.avatar, px, py);
      });
    },

    renderRoamingList(gs) {
      const listEl = document.getElementById('roaming-monsters-list');
      const countEl = document.getElementById('roaming-count');
      const scaleEl = document.getElementById('roaming-scale-badge');
      if (!listEl) return;

      const list = gs.roamingMonsters || [];
      if (countEl) countEl.textContent = list.length;
      if (scaleEl) scaleEl.textContent = `สเกลพลัง: LV.${gs.level || 1}`;

      const sorted = [...list].sort((a, b) => {
        const da = App.core.calculateDistance(playerLat, playerLon, a.lat, a.lon);
        const db = App.core.calculateDistance(playerLat, playerLon, b.lat, b.lon);
        return da - db;
      });

      listEl.innerHTML = '';
      sorted.forEach(m => {
        const dKm = App.core.calculateDistance(playerLat, playerLon, m.lat, m.lon);
        const distM = Math.round(dKm * 1000);
        const isEngaged = m.engaged || m.uid === activeEncounterId;
        const inRange = distM <= 40 || isEngaged;
        const isSim = App.core?.isSimMode ? App.core.isSimMode() : false;

        const statusLabel = isEngaged
          ? (distM <= 40 ? '⚔️ กำลังปะทะ!' : `⚔️ ไล่ล่า (${distM} ม.)`)
          : `ห่าง ${distM} ม.`;

        const card = document.createElement('div');
        card.className = `roaming-card ${inRange ? 'in-range' : ''}`;
        card.innerHTML = `
          <div class="roaming-card-icon">${m.mapIcon || m.avatar}</div>
          <div class="roaming-card-info">
            <div class="roaming-card-top">
              <span class="roaming-card-name">${m.name} (LV.${m.level})</span>
              <span class="roaming-card-dist">${statusLabel}</span>
            </div>
            <div class="roaming-card-sub">HP: ${m.hpRemainKm.toFixed(2)}/${m.maxHpKm.toFixed(2)} กม. • ${m.thName}</div>
          </div>
          ${isSim ? `<button class="btn-sim-engage-target" type="button">🎯 ประชิด</button>` : ''}
        `;

        if (isSim) {
          const btn = card.querySelector('.btn-sim-engage-target');
          if (btn) {
            btn.addEventListener('click', () => {
              this.simulateMoveToMonster(m.uid);
            });
          }
        }

        listEl.appendChild(card);
      });
    },

    simulateMoveToMonster(uid) {
      const gs = App.core?.getGameState();
      if (!gs) return;
      const target = (gs.roamingMonsters || []).find(m => m.uid === uid);
      if (!target) return;

      // Move player within ~15 meters of the pinned monster (inside 40m engage radius)
      const offsetLat = 0.00012;
      this.updatePlayerPosition(target.lat + offsetLat, target.lon, false);
      if (leafletMap) {
        leafletMap.setView([playerLat, playerLon], 17);
      }
      if (App.core?.switchTab) {
        App.core.switchTab('tab-hunt');
      }
    },

    simulateApproachNearest() {
      const gs = App.core?.getGameState();
      if (!gs || !gs.roamingMonsters || gs.roamingMonsters.length === 0) {
        this.ensureMonstersSpawned();
      }
      const list = gs.roamingMonsters || [];
      if (list.length === 0) return;

      let nearest = list[0];
      let bestDist = Infinity;
      for (const m of list) {
        const d = App.core.calculateDistance(playerLat, playerLon, m.lat, m.lon);
        if (d < bestDist) {
          bestDist = d;
          nearest = m;
        }
      }
      this.simulateMoveToMonster(nearest.uid);
    }
  };
})();
