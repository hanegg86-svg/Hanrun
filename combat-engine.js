// ShadowStrider: Dark Run RPG - Module 5: Combat Engine, Boss Gimmicks, Ultimate & Shadow Goblin
(function () {
  'use strict';

  const App = window.ShadowStriderApp = window.ShadowStriderApp || {};

  let bossVulnerableTimer = 0;
  let mistHealingTick = 0;
  let chronoHealingTick = 0;
  let bloodKnightStallTick = 0;
  let superbossSiphonTick = 0;
  let secretbossSiphonTick = 0;
  let gimmickAnnounced = {};

  let isGoblinActive = false;
  let goblinSecondsLeft = 0;
  let goblinTargetPaceDec = null;
  let goblinProgressSec = 0;
  const GOBLIN_REQUIRED_SECONDS = 7;
  let lastGoblinTriggerKm = 0.0;
  let goblinCooldownSeconds = 0;

  App.CombatEngine = {
    resetBossState() {
      bossVulnerableTimer = 0;
      gimmickAnnounced = {};
      mistHealingTick = 0;
      chronoHealingTick = 0;
      bloodKnightStallTick = 0;
      superbossSiphonTick = 0;
      secretbossSiphonTick = 0;
      if (App.MagicEngine && App.MagicEngine.resetCombatTimers) {
        App.MagicEngine.resetCombatTimers();
      }
    },

    resetSessionCombat() {
      this.resetBossState();
      isGoblinActive = false;
      goblinCooldownSeconds = 0;
      lastGoblinTriggerKm = 0.0;
      const goblinBannerEl = document.getElementById('goblin-banner');
      if (goblinBannerEl) goblinBannerEl.style.display = 'none';
    },

    getCombatSnapshot() {
      return {
        bossVulnerableTimer,
        isGoblinActive
      };
    },

    restoreBossVulnerableTimer(val) {
      bossVulnerableTimer = val || 0;
    },

    applyBossVulnerable(seconds) {
      bossVulnerableTimer = Math.max(bossVulnerableTimer, seconds);
    },

    startGoblinChaseEvent() {
      const gs = App.core?.getGameState();
      const isRunning = App.core?.isRunning ? App.core.isRunning() : false;
      if (isGoblinActive || !isRunning || !gs) return;

      const runDist = App.core.getRunDistanceKm();
      const runSecs = App.core.getRunSeconds();
      let baselinePace = App.core.getRecentRollingPace();

      if (baselinePace === null) {
        if (runDist >= 0.05 && runSecs > 10) {
          baselinePace = (runSecs / 60) / runDist;
        } else {
          baselinePace = 7.0;
        }
      }

      goblinTargetPaceDec = Math.max(3.0, baselinePace - 0.5);
      isGoblinActive = true;
      goblinSecondsLeft = 45;
      goblinProgressSec = 0;

      const minPart = Math.floor(goblinTargetPaceDec);
      const secPart = Math.round((goblinTargetPaceDec - minPart) * 60);
      const targetPaceStr = `${minPart}'${secPart.toString().padStart(2, '0')}"`;

      const goblinBannerEl = document.getElementById('goblin-banner');
      const goblinTimerEl = document.getElementById('goblin-timer');
      const goblinTargetPaceEl = document.getElementById('goblin-target-pace');
      const goblinProgressFillEl = document.getElementById('goblin-progress-fill');
      const goblinStatusHintEl = document.getElementById('goblin-status-hint');

      if (goblinTargetPaceEl) goblinTargetPaceEl.textContent = targetPaceStr;
      if (goblinTimerEl) goblinTimerEl.textContent = `${goblinSecondsLeft}s`;
      if (goblinProgressFillEl) goblinProgressFillEl.style.width = '0%';
      if (goblinStatusHintEl) goblinStatusHintEl.textContent = 'รักษาเพซเป้าหมายเพื่อจับกุม!';
      if (goblinBannerEl) goblinBannerEl.style.display = 'flex';

      App.core.speakVoice(`พบโกบลินเงาหลบหนี! เร่งสปีดให้แตะเพซ ${minPart} นาที ${secPart} วินาที เพื่อจับกุม`, true);
      App.core.showToast(`👺 โกบลินเงาปรากฏตัว! เร่งเพซขึ้น 0.5 (${targetPaceStr}) เพื่อสยบ!`);
    },

    completeGoblinChaseSuccess() {
      const gs = App.core?.getGameState();
      if (!gs) return;

      isGoblinActive = false;
      const goblinBannerEl = document.getElementById('goblin-banner');
      if (goblinBannerEl) goblinBannerEl.style.display = 'none';
      goblinCooldownSeconds = 240;

      gs.chestsAvailable += 1;
      const bonusGold = Math.floor(150 + (Math.random() * 200));
      gs.gold += bonusGold;
      App.core.addUltimateCharge(30);

      const droppedRune = App.core.rollRandomRuneDrop(false);
      App.core.showToast(`🎉 สยบโกบลินเงาสำเร็จ! +📦 1 หีบ, +${bonusGold} 🪙, +🪨 ${droppedRune.name} Rune!`);
      App.core.speakVoice(`สยบโกบลินเงาสำเร็จ ได้รับหินรูน ${droppedRune.name}`, true);

      gs.statsTrack.goblinCaughtCount = (gs.statsTrack.goblinCaughtCount || 0) + 1;
      const achGoblin = gs.achievements.find(a => a.id === 'ach_goblin_catch');
      if (achGoblin) achGoblin.current = Math.min(achGoblin.target, gs.statsTrack.goblinCaughtCount);

      const achG25 = gs.achievements.find(a => a.id === 'ach_goblin25');
      if (achG25) achG25.current = Math.min(achG25.target, gs.statsTrack.goblinCaughtCount);

      App.core.saveGame();
      App.core.renderUI();
    },

    failGoblinChase() {
      isGoblinActive = false;
      const goblinBannerEl = document.getElementById('goblin-banner');
      if (goblinBannerEl) goblinBannerEl.style.display = 'none';
      goblinCooldownSeconds = 180;
      App.core.showToast('💨 โกบลินเงาวิ่งหลบหนีหายไปในความมืด!');
      App.core.speakVoice('โกบลินเงาหนีรอดไปได้');
    },

    handleBossDefeat(currentBoss, isUltimateTier = 0) {
      const gs = App.core?.getGameState();
      if (!gs) return;

      App.core.incrementSessionBossKills();
      gs.career.totalBossDefeated = (gs.career.totalBossDefeated || 0) + 1;
      gs.chestsAvailable += 1;

      if (!gs.bestiary[currentBoss.id]) {
        gs.bestiary[currentBoss.id] = { kills: 0, name: currentBoss.name };
      }
      gs.bestiary[currentBoss.id].kills += 1;

      const eqBonus = App.core.calculateEquipmentBonuses();
      const setCounts = eqBonus.setCounts;
      const combatFlags = App.core.getCombatFlags();

      let setExpBonus = 1.0;
      if (setCounts.bloodknight >= 4 && (combatFlags.currentHrZone === 2 || combatFlags.currentHrZone === 3 || combatFlags.isFrenzyActive)) {
        setExpBonus = 1.4;
      }

      const zone2ExpBonus = combatFlags.currentHrZone === 2 ? 1.5 : 1.0;
      const flowExpBonus = combatFlags.isFlowStateActive ? 1.5 : 1.0;
      const loopRewardMult = 1 + ((gs.bossLoopCycle || 0) * 0.20);

      const staMultiplier = (1 + Math.max(0, (gs.stats.sta - 10) * 0.02) + (eqBonus.bonusSta * 0.01)) * zone2ExpBonus * flowExpBonus * setExpBonus;
      const charmMultiplier = 1 + (gs.upgrades.charm * 0.10) + (eqBonus.bonusGold * 0.01);
      const streakMultiplier = 1 + Math.min(0.20, (gs.streak.count - 1) * 0.02);
      const overdriveGoldMult = combatFlags.isOverdriveActive ? 2.0 : 1.0;
      const totalGoldMultiplier = staMultiplier * charmMultiplier * streakMultiplier * overdriveGoldMult;

      const ultBonusMult = isUltimateTier > 0 ? (1 + (isUltimateTier * 0.35)) : 1.0;
      const rewardExp = Math.floor(currentBoss.rewardExp * staMultiplier * loopRewardMult * ultBonusMult);
      const rewardGold = Math.floor(currentBoss.rewardGold * totalGoldMultiplier * loopRewardMult * ultBonusMult);

      const droppedRune = App.core.rollRandomRuneDrop(true);

      App.core.showToast(`🏆 สยบ ${currentBoss.name}! +${rewardExp.toLocaleString()} EXP & +${rewardGold.toLocaleString()} ทอง & +🪨 ${droppedRune.name} Rune!`);
      App.core.speakVoice(`สยบ ${currentBoss.name} สำเร็จแล้ว ปิดผนึกชัยชนะ ได้รับหินรูน ${droppedRune.name}`, true);
      App.core.addExp(rewardExp);
      gs.gold += rewardGold;

      const questBoss = gs.dailyQuests.find(q => q.id === 'dq_boss');
      if (questBoss) questBoss.current = Math.min(questBoss.target, questBoss.current + 1);

      const bossAchMap = {
        'boss_2_major': 'ach_boss_juggernaut',
        'boss_3': 'ach_boss_dragon',
        'boss_4': 'ach_boss_malakor',
        'boss_5': 'ach_boss_titan',
        'boss_6': 'ach_boss_empress',
        'boss_7': 'ach_boss_ignis',
        'boss_8': 'ach_boss_leviathan',
        'boss_9': 'ach_boss_chronos',
        'boss_super': 'ach_superboss',
        'boss_secret': 'ach_secretboss'
      };
      if (bossAchMap[currentBoss.id]) {
        const ach = gs.achievements.find(a => a.id === bossAchMap[currentBoss.id]);
        if (ach) ach.current = Math.min(ach.target, ach.current + 1);
      }

      const achB100 = gs.achievements.find(a => a.id === 'ach_boss100');
      if (achB100) achB100.current = Math.min(achB100.target, gs.career.totalBossDefeated);

      const achLoop = gs.achievements.find(a => a.id === 'ach_loop_master');
      if (achLoop) achLoop.current = Math.min(achLoop.target, gs.bossLoopCycle || 0);

      const achB25 = gs.achievements.find(a => a.id === 'ach_boss25');
      if (achB25) achB25.current = Math.min(achB25.target, gs.career.totalBossDefeated);

      const achB50 = gs.achievements.find(a => a.id === 'ach_boss50');
      if (achB50) achB50.current = Math.min(achB50.target, gs.career.totalBossDefeated);

      this.resetBossState();

      let maxBossIndexForCurrentLoop;
      if ((gs.bossLoopCycle || 0) >= 3) {
        maxBossIndexForCurrentLoop = App.BOSS_DATABASE.length - 1;
      } else if ((gs.bossLoopCycle || 0) >= 1) {
        maxBossIndexForCurrentLoop = App.BOSS_DATABASE.length - 2;
      } else {
        maxBossIndexForCurrentLoop = App.BOSS_DATABASE.length - 3;
      }

      let nextBossIndex;
      if (gs.bossIndex >= maxBossIndexForCurrentLoop) {
        gs.bossLoopCycle = (gs.bossLoopCycle || 0) + 1;
        nextBossIndex = 0;
        App.core.showToast(`🔥 วนลูปสังเวียน AWAKENED LOOP ${gs.bossLoopCycle}! บอสเลือด +${gs.bossLoopCycle * 15}%!`);
        App.core.speakVoice(`พิชิตบอสรอบนี้สำเร็จแล้ว! เข้าสู่สังเวียนอเวจีรอบที่ ${gs.bossLoopCycle}`, true);
      } else {
        nextBossIndex = gs.bossIndex + 1;
        if (nextBossIndex === App.BOSS_DATABASE.length - 2) {
          App.core.showToast('⚠️ ประตูมิติระดับสูงสุดเปิดออก! COSMIC SUPER BOSS ปรากฏกาย!');
          App.core.speakVoice('ประตูมิติระดับสูงสุดเปิดออก เทพอสูรคอสมิก ปรากฏกาย!', true);
        } else if (nextBossIndex === App.BOSS_DATABASE.length - 1) {
          App.core.showToast('🌌 ห้วงอเวจีโบราณแยกออก! มหาอสูรลับ PRIMORDIAL SOVEREIGN ตื่นขึ้นแล้ว!');
          App.core.speakVoice('คำเตือนระดับสูงสุด ประตูมิติมืดมิดเปิดออก เทพอสูรลับ บรรพกาล ปรากฏกาย!', true);
        }
      }

      gs.bossIndex = nextBossIndex;
      gs.bossHpRemain = App.getBossMaxHp(gs.bossIndex, gs.bossLoopCycle || 0);

      App.core.saveGame();
      App.core.renderUI();
    },

    applyDistanceDamage(distanceDeltaKm) {
      const gs = App.core?.getGameState();
      if (!gs || distanceDeltaKm <= 0) return;

      const currentBoss = App.BOSS_DATABASE[gs.bossIndex];
      const bossMaxHp = App.getBossMaxHp(gs.bossIndex, gs.bossLoopCycle || 0);
      const bossHpPct = gs.bossHpRemain / bossMaxHp;
      const eqBonus = App.core.calculateEquipmentBonuses();
      const setCounts = eqBonus.setCounts;
      const isLoop = (gs.bossLoopCycle || 0) >= 1;
      const flags = App.core.getCombatFlags();

      // Regenerate Mana (MP) from distance run
      if (App.MagicEngine && App.MagicEngine.regenerateManaFromDistance) {
        App.MagicEngine.regenerateManaFromDistance(distanceDeltaKm, {
          isFlowStateActive: flags.isFlowStateActive,
          currentHrZone: flags.currentHrZone
        });
      }

      let ultChargeBonusMult = flags.isFlowStateActive ? 1.5 : 1.0;
      if (currentBoss.gimmick === 'empress' && bossHpPct <= 0.65 && bossHpPct > 0.25) {
        if (flags.currentHrZone === 2 || flags.currentHrZone === 3 || flags.isFrenzyActive) {
          ultChargeBonusMult *= 2.0;
        }
      }
      if (currentBoss.gimmick === 'supernova' && bossHpPct <= 0.50) {
        ultChargeBonusMult *= 1.5;
      }

      App.core.addUltimateCharge((distanceDeltaKm * 8) * ultChargeBonusMult);

      let rollingPace = App.core.getRecentRollingPace();
      const runDist = App.core.getRunDistanceKm();
      const runSecs = App.core.getRunSeconds();
      if (rollingPace === null && App.core.isSimMode() && runDist >= 0.05) {
        rollingPace = (runSecs / 60) / runDist;
      }

      App.core.evaluateFlowStateProgress(distanceDeltaKm, rollingPace, setCounts, eqBonus);

      const questDist = gs.dailyQuests.find(q => q.id === 'dq_dist');
      if (questDist) {
        questDist.current = Math.min(questDist.target, parseFloat((questDist.current + distanceDeltaKm).toFixed(2)));
      }

      App.core.checkDistanceCheckpoints(setCounts);

      if (!isGoblinActive && goblinCooldownSeconds <= 0 && (runDist - lastGoblinTriggerKm) >= 1.2) {
        if (Math.random() < 0.35) {
          lastGoblinTriggerKm = runDist;
          this.startGoblinChaseEvent();
        }
      }

      const updatedFlags = App.core.getCombatFlags();
      const frenzyDmgBonus = updatedFlags.isFrenzyActive ? 1.5 : 1.0;
      const strMultiplier = (1 + Math.max(0, (gs.stats.str - 10) * 0.05) + (gs.upgrades.blade * 0.05) + (eqBonus.bonusDmg * 0.01)) * frenzyDmgBonus;

      const critStats = App.core.calculateCritStats();
      let critChance = critStats.effectiveChance;
      let critDmgMultiplier = critStats.critMultiplier;
      let bossDamageMultiplier = 1.0;

      if (isLoop && currentBoss.id === 'boss_1') {
        if (rollingPace === null || rollingPace > 6.75) {
          bossDamageMultiplier *= 0.65;
          if (!gimmickAnnounced.gargoyleTremor) {
            gimmickAnnounced.gargoyleTremor = true;
            App.core.speakVoice('แผ่นดินไหวศิลาทำงาน! เร่งสปีดให้เร็วกว่าเพซ 6:45 มิฉะนั้นดาเมจลด 35%');
            App.core.showToast('🌋 Seismic Tremor: พื้นดินสั่นสะเทือน! เร่งเพซให้ต่ำกว่า 6:45 เพื่อฝ่าดาเมจ');
          }
        }
      }

      if (currentBoss.gimmick === 'juggernaut') {
        if (bossHpPct > 0.50) {
          if (updatedFlags.isFlowStateActive || bossVulnerableTimer > 0) {
            bossDamageMultiplier *= 1.25;
          } else {
            bossDamageMultiplier *= 0.65;
            if (!gimmickAnnounced.juggernautIron) {
              gimmickAnnounced.juggernautIron = true;
              App.core.speakVoice('จอมอสูรเกราะเหล็กเปิดปราการทมิฬ เข้าสู่โฟลว์สเตทเพื่อทลายเกราะ');
              App.core.showToast('🦏 ปราการเหล็กทมิฬ: ดาเมจลด 35% (เข้าสู่ Flow State หรือใช้ท่าไม้ตาย/เวทดินเพื่อทะลวง)');
            }
          }
        } else {
          if (!gimmickAnnounced.juggernautStomp) {
            gimmickAnnounced.juggernautStomp = true;
            App.core.speakVoice('จอมอสูรทุบแผ่นดินเดือด เร่งเพซและชีพจรแตะโซนสามเพื่อเคาน์เตอร์ดาเมจ', true);
            App.core.showToast('💥 คลื่นทุบแผ่นดินเดือด: ดันชีพจร Zone 3 หรือเร่งเพซต่ำกว่า 6:00 ดาเมจทะยาน x1.75!');
          }
          if (updatedFlags.isFrenzyActive || updatedFlags.currentHrZone >= 3 || (rollingPace !== null && rollingPace <= 6.0)) {
            bossDamageMultiplier *= 1.75;
            critChance = Math.min(100, critChance + 25);
          } else if (rollingPace === null || rollingPace > 7.0) {
            bossDamageMultiplier *= 0.60;
          }
        }
      }

      if (isLoop && currentBoss.id === 'boss_3' && bossHpPct <= 0.50 && !gimmickAnnounced.dragonRoar) {
        gimmickAnnounced.dragonRoar = true;
        const siphoned = Math.floor(gs.ultimateCharge * 0.5);
        gs.ultimateCharge = Math.max(0, gs.ultimateCharge - siphoned);
        App.core.showToast(`🐉 NECROTIC ROAR! มังกรคำรามเผาผลาญเกจไม้ตาย -${siphoned}%!`);
        App.core.speakVoice('มังกรกระดูกคำรามสังหาร สลายเกจไม้ตายของคุณไปครึ่งหนึ่ง', true);
      }

      const mistThreshold = isLoop ? 0.85 : 0.75;
      if (currentBoss.gimmick === 'mist' && bossHpPct <= mistThreshold) {
        if (isLoop) critChance = Math.max(0, critChance - 15);
        if (rollingPace === null || rollingPace > 7.5) {
          bossDamageMultiplier *= 0.5;
          if (!gimmickAnnounced.mistWarn) {
            gimmickAnnounced.mistWarn = true;
            App.core.speakVoice('หมอกคำสาปสูบวิญญาณทำงาน! เร่งฝีเท้าให้เร็วกว่าเพซ 7 นาทีครึ่งเพื่อสลายหมอก');
            App.core.showToast('🌫️ หมอกคำสาปทำงาน: วิ่งช้ากว่า 7:30/กม. ดาเมจลด 50% และบอสจะฮีล!');
          }
        } else if (gimmickAnnounced.mistWarn && !gimmickAnnounced.mistClear) {
          gimmickAnnounced.mistClear = true;
          App.core.showToast('💨 วิ่งฉีกหมอกคำสาปสำเร็จ! ดาเมจกลับคืนเต็มอัตรา');
        }
      }

      if (currentBoss.gimmick === 'carapace') {
        const baseCarapaceReduction = isLoop ? 0.40 : 0.55;
        if (bossVulnerableTimer > 0) {
          bossDamageMultiplier *= 2.0;
        } else {
          bossDamageMultiplier *= baseCarapaceReduction;
        }

        if (bossHpPct <= 0.30) {
          if (!gimmickAnnounced.titanEnrage) {
            gimmickAnnounced.titanEnrage = true;
            App.core.speakVoice('ไททันศิลาคำรามคลุ้มคลั่ง! เร่งชีพจรแตะโซนสามเพื่อเคาน์เตอร์ดาเมจ', true);
            App.core.showToast('🗿 ไททันคลุ้มคลั่ง: ดันชีพจรเข้า Zone 3 เพื่อทำลายจังหวะทุบแผ่นดิน!');
          }
          if (updatedFlags.isFrenzyActive || updatedFlags.currentHrZone === 3) {
            bossDamageMultiplier *= 1.5;
          }
        }
      }

      if (currentBoss.gimmick === 'empress') {
        const empressReduction = isLoop ? 0.40 : 0.55;
        if (bossHpPct > 0.65) {
          if (updatedFlags.isFlowStateActive) {
            critChance = Math.min(100, critChance + 20);
            bossDamageMultiplier *= 1.2;
          } else {
            bossDamageMultiplier *= empressReduction;
            if (!gimmickAnnounced.empressP1) {
              gimmickAnnounced.empressP1 = true;
              App.core.speakVoice('จักรพรรดินีแยกร่างเงาหลอก วิ่งคุมเพซสม่ำเสมอเพื่อเข้าสู่โฟลว์สเตท');
              App.core.showToast(`👑 ร่างเงาลวง: ดาเมจลด ${Math.round((1 - empressReduction) * 100)}% (เข้าสู่ Flow State เพื่อทลายร่างแยก)`);
            }
          }
        } else if (bossHpPct <= 0.65 && bossHpPct > 0.25) {
          if (!gimmickAnnounced.empressP2) {
            gimmickAnnounced.empressP2 = true;
            App.core.speakVoice('เข้าสู่เฟสสอง สนามเรโซแนนซ์ ชาร์จไม้ตายไวขึ้นในโซนสองและสาม');
            App.core.showToast('⚡ เฟส 2 เรโซแนนซ์: วิ่ง Zone 2 หรือ 3 ชาร์จท่าไม้ตายไวขึ้น!');
          }
        } else {
          if (!gimmickAnnounced.empressP3) {
            gimmickAnnounced.empressP3 = true;
            App.core.speakVoice('เข้าสู่จันทรคราสทมิฬขั้นสุดท้าย! ปลดปล่อยพลังทั้งหมดเพื่อปิดฉาก', true);
            App.core.showToast('🌑 จันทรคราสทมิฬ: พลังโจมตีและคริติคอลพุ่งทะยาน เร่งสปีดสังหาร!');
          }
          bossDamageMultiplier *= 1.40;
          critChance = Math.min(100, critChance + 25);
        }
      }

      if (currentBoss.gimmick === 'supernova') {
        if (bossHpPct > 0.50) {
          if (!gimmickAnnounced.ignisSolar) {
            gimmickAnnounced.ignisSolar = true;
            App.core.speakVoice('เทพอสูรเพลิงสุริยคราสปลดปล่อยคลื่นความร้อน สะสมระยะทางฝ่าเปลวเพลิง');
            App.core.showToast('☄️ คลื่นสุริยคราส: วิ่งรักษาระยะทางอย่างมั่นคงเพื่อทลายเกราะสุริยะ');
          }
        } else {
          if (!gimmickAnnounced.ignisSupernova) {
            gimmickAnnounced.ignisSupernova = true;
            App.core.speakVoice('คำเตือนระดับสูงสุด! อสูรเพลิงเข้าสู่สภาวะซูเปอร์โนวา ปลดปล่อยท่าไม้ตายรัวๆ เพื่อปิดฉาก', true);
            App.core.showToast('💥 SOLAR SUPERNOVA! เกจไม้ตายชาร์จไว x1.5 ปลดปล่อย Shadow Slash สังหาร');
          }
          bossDamageMultiplier *= 1.35;
          critChance = Math.min(100, critChance + 20);
        }
      }

      if (currentBoss.gimmick === 'singularity') {
        if (bossHpPct > 0.50) {
          if (!gimmickAnnounced.leviathanGrav) {
            gimmickAnnounced.leviathanGrav = true;
            App.core.speakVoice('เลเวียธานบรรพกาลแผ่สนามแรงโน้มถ่วงมิติอเวจี สะสมระยะทางฝ่าความว่างเปล่า');
            App.core.showToast('🌌 สนามแรงโน้มถ่วง: ก้าววิ่งมั่นคงฝ่าแรงดึงดูดมิติอเวจี');
          }
        } else if (bossHpPct <= 0.50 && bossHpPct > 0.20) {
          if (!gimmickAnnounced.leviathanVoid) {
            gimmickAnnounced.leviathanVoid = true;
            App.core.speakVoice('หลุมดำมิติอเวจีเริ่มดูดกลืนพลัง! เกจไม้ตายหยุดชาร์จตามเวลา ต้องอาศัยก้าววิ่งเท่านั้น', true);
            App.core.showToast('🕳️ หลุมดำดูดกลืน: เกจไม้ตายไม่ชาร์จตามเวลา วิ่งเร่งก้าวเพื่อสะสมพลัง!');
          }
        } else {
          if (!gimmickAnnounced.leviathanSingularity) {
            gimmickAnnounced.leviathanSingularity = true;
            App.core.speakVoice('คำเตือนฉุกเฉิน! แกนซิงกูลาริตียุบตัว เร่งสปีดแตะโซนสามหรือทำคริติคอล ดาเมจทวีคูณสองจุดห้าเท่า!', true);
            App.core.showToast('🌀 SINGULARITY COLLAPSE! ชีพจร Zone 3-4 หรือคริติคอล ดาเมจทะลวง x2.5!');
          }
          if (updatedFlags.isFrenzyActive || updatedFlags.currentHrZone >= 3) {
            bossDamageMultiplier *= 2.5;
          }
        }
      }

      if (currentBoss.gimmick === 'chrono') {
        const paceTarget = isLoop ? 6.25 : 6.5;
        const boostMult = isLoop ? 3.5 : 3.0;

        if (rollingPace !== null && rollingPace <= paceTarget) {
          bossDamageMultiplier *= boostMult;
          critChance = Math.min(100, critChance + 30);
          if (!gimmickAnnounced.chronoBreak) {
            gimmickAnnounced.chronoBreak = true;
            gimmickAnnounced.chronoRewind = false;
            App.core.speakVoice('มิติเวลาแตกสลาย! เพซทะลวงมิติดาเมจทวีคูณ', true);
            App.core.showToast(`⏳ TIME SHATTER! เพซเร็วกว่า 6:15 ทะลวงมิติดาเมจ x${boostMult.toFixed(1)}!`);
          }
        } else if (rollingPace === null || rollingPace > 8.0) {
          bossDamageMultiplier *= 0.6;
          if (!gimmickAnnounced.chronoRewind) {
            gimmickAnnounced.chronoRewind = true;
            gimmickAnnounced.chronoBreak = false;
            App.core.speakVoice('มิติเวลาหมุนย้อนกลับ! เพซช้ากว่า 8:00 บอสจะฟื้นฟูเลือด');
            App.core.showToast('⏳ CHRONO REWIND: เพซช้ากว่า 8:00 บอสดูดซับเวลาฟื้นฟูเลือด!');
          }
        }
      }

      if (currentBoss.gimmick === 'superboss') {
        if (bossHpPct > 0.65) {
          if (bossVulnerableTimer > 0) {
            bossDamageMultiplier *= 2.0;
          } else {
            bossDamageMultiplier *= 0.30;
            if (!gimmickAnnounced.superbossP1) {
              gimmickAnnounced.superbossP1 = true;
              App.core.speakVoice('เทพอสูรคอสมิกแผ่เกราะความว่างเปล่าสมบูรณ์ ปลดปล่อยท่าไม้ตายเพื่อทำลายเกราะ', true);
              App.core.showToast('👁️‍🗨️ Void Absolute: เกราะลดดาเมจ 70%! ปลดปล่อย Shadow Slash สลายเกราะ');
            }
          }
        } else if (bossHpPct <= 0.65 && bossHpPct > 0.30) {
          if (!gimmickAnnounced.superbossP2) {
            gimmickAnnounced.superbossP2 = true;
            App.core.speakVoice('เข้าสู่เฟสสอง มิติว่างเปล่าดูดกลืน รักษาเพซให้เร็วกว่า 7:00');
            App.core.showToast('🕳 Singularity Siphon: เพซช้ากว่า 7:00 บอสจะดูดเกจและฮีลเลือด!');
          }
          if (rollingPace === null || rollingPace > 7.0) {
            bossDamageMultiplier *= 0.50;
          }
        } else {
          if (!gimmickAnnounced.superbossP3) {
            gimmickAnnounced.superbossP3 = true;
            App.core.speakVoice('คำเตือนฉุกเฉินระดับสูงสุด! เทพอสูรใกล้ดับสูญ ระเบิดพลังทั้งหมดสังหาร!', true);
            App.core.showToast('🌌 Cosmic Collapse: เข้าสู่ Zone 3-4 หรือ Flow State ดาเมจคริติคอลทะยาน x3.0!');
          }
          if (updatedFlags.isFrenzyActive || updatedFlags.currentHrZone >= 3 || updatedFlags.isFlowStateActive) {
            bossDamageMultiplier *= 1.8;
            critDmgMultiplier *= 1.5;
          }
        }
      }

      if (currentBoss.gimmick === 'secretboss') {
        if (bossHpPct > 0.60) {
          if (bossVulnerableTimer > 0 || updatedFlags.isFlowStateActive) {
            bossDamageMultiplier *= 1.8;
          } else {
            bossDamageMultiplier *= 0.25;
            if (!gimmickAnnounced.secretbossP1) {
              gimmickAnnounced.secretbossP1 = true;
              App.core.speakVoice('มหาอสูรลับแผ่เกราะบิดเบือนมิติ เข้าสู่โฟลว์สเตท หรือปลดปล่อยท่าไม้ตายเพื่อทะลวงเกราะ', true);
              App.core.showToast('🌌 Void Distortion: เกราะลดดาเมจ 75%! เข้าสู่ Flow State หรือใช้ Shadow Slash ทลายเกราะ');
            }
          }
        } else if (bossHpPct <= 0.60 && bossHpPct > 0.30) {
          if (!gimmickAnnounced.secretbossP2) {
            gimmickAnnounced.secretbossP2 = true;
            App.core.speakVoice('เข้าสู่เฟสสอง แรงกดดันมิติอเวจี ดันชีพจรแตะโซนสามและคุมเพซให้เร็วกว่า 7:00 มิฉะนั้นเกจไม้ตายจะถูกดูดกลืน');
            App.core.showToast('🕳️ Event Horizon: ดันชีพจร Zone 3 และวิ่งเร็วกว่า 7:00 มิฉะนั้นบอสจะดูดเกจและฟื้นเลือด!');
          }
          if (rollingPace === null || rollingPace > 7.0 || updatedFlags.currentHrZone < 3) {
            bossDamageMultiplier *= 0.40;
          } else {
            bossDamageMultiplier *= 1.50;
          }
        } else {
          if (!gimmickAnnounced.secretbossP3) {
            gimmickAnnounced.secretbossP3 = true;
            App.core.speakVoice('คำเตือนฉุกเฉินระดับสูงสุด! ห้วงมิติกำลังดับสูญ ระเบิดคริติคอลพลังทำลายล้างสูงสุดเพื่อปิดฉาก!', true);
            App.core.showToast('💥 Omniverse Collapse: มิติกำลังดับสูญ! ดาเมจคริติคอลทะยาน x3.5 สปรินต์เผด็จศึก!');
          }
          bossDamageMultiplier *= 2.2;
          critDmgMultiplier *= 1.8;
        }
      }

      if (eqBonus.bonusArmorPierce > 0 && bossDamageMultiplier < 1.0) {
        bossDamageMultiplier = Math.min(1.0, bossDamageMultiplier + (eqBonus.bonusArmorPierce * 0.01));
      }

      if (setCounts.voidwalker >= 4 && updatedFlags.isFlowStateActive) {
        if (bossDamageMultiplier < 1.0) {
          bossDamageMultiplier = 1.0;
        }
      }

      const isCrit = (Math.random() * 100) < critChance;

      if (currentBoss.gimmick === 'carapace' && bossVulnerableTimer <= 0 && isCrit) {
        bossDamageMultiplier = (bossDamageMultiplier / (isLoop ? 0.40 : 0.55));
      }

      const baseDamageForField = distanceDeltaKm * strMultiplier * (isCrit ? critDmgMultiplier : 1.0);
      const effectiveDamage = baseDamageForField * bossDamageMultiplier;

      if (isCrit) {
        App.core.addUltimateCharge(1);
        const questCrit = gs.dailyQuests.find(q => q.id === 'dq_crit');
        if (questCrit) questCrit.current = Math.min(questCrit.target, questCrit.current + 1);
        App.core.showToast(`💥 CRITICAL! ดาเมจทะลวง x${critDmgMultiplier.toFixed(2)}`);
      }

      if (App.MapEngine) {
        const avgPaceDec = (runDist >= 0.02 && runSecs > 0) ? ((runSecs / 60) / runDist) : null;
        App.MapEngine.applyFieldCombatDamage(baseDamageForField, {
          isCrit,
          isFlowStateActive: updatedFlags.isFlowStateActive,
          isFrenzyActive: updatedFlags.isFrenzyActive,
          currentHrZone: updatedFlags.currentHrZone,
          rollingPace,
          avgPace: avgPaceDec
        });
      }

      gs.bossHpRemain = Math.max(0, gs.bossHpRemain - effectiveDamage);

      if (gs.bossHpRemain <= 0.001) {
        this.handleBossDefeat(currentBoss, 0);
      }

      App.core.saveGame();
      App.core.renderHUD();
    },

    activateUltimateSkill(tier = 1) {
      const gs = App.core?.getGameState();
      const isRunning = App.core?.isRunning ? App.core.isRunning() : false;
      const cost = tier * 100;

      if (!gs || gs.ultimateCharge < cost || !isRunning) {
        if (!isRunning) App.core.showToast('กรุณากดเริ่มออกล่าก่อนใช้ท่าไม้ตาย');
        return;
      }

      gs.ultimateCharge = Math.max(0, gs.ultimateCharge - cost);
      const eqBonus = App.core.calculateEquipmentBonuses();
      const setCounts = eqBonus.setCounts;
      const strMultiplier = 1 + Math.max(0, (gs.stats.str - 10) * 0.05) + (gs.upgrades.blade * 0.05) + (eqBonus.bonusDmg * 0.01);
      const shadowSetDmgMult = setCounts.shadowstalker >= 4 ? 1.5 : 1.0;
      const ringUltDmgMult = 1 + ((eqBonus.bonusUltDmg || 0) * 0.01);

      const tierBaseDamages = { 1: 0.40, 2: 1.00, 3: 2.20 };
      const tierOverdriveSec = { 1: 30, 2: 60, 3: 90 };
      const tierVulnSec = { 1: 60, 2: 90, 3: 120 };

      let burstDamageKm = tierBaseDamages[tier] * strMultiplier * shadowSetDmgMult * ringUltDmgMult;
      const currentBoss = App.BOSS_DATABASE[gs.bossIndex];

      if (setCounts.darktempest >= 4) {
        burstDamageKm += 0.35;
        App.core.setTempestCritBuffSeconds(15);
        App.core.showToast('⚡ TEMPEST WRATH! สายฟ้าฟาด +0.35 กม. และล็อกคริติคอล 100% 15 วิ!');
      }

      if (setCounts.voidannihilator >= 4) {
        const refund = cost * 0.30;
        gs.ultimateCharge = Math.min(300, gs.ultimateCharge + refund);
        App.core.showToast(`⚡ มหาอสูรล้างดารา: รีฟันด์เกจคืน +${refund.toFixed(0)}%!`);
      }

      gs.statsTrack.ultCastCount = (gs.statsTrack.ultCastCount || 0) + 1;
      const achUlt = gs.achievements.find(a => a.id === 'ach_ult_cast');
      if (achUlt) achUlt.current = Math.min(achUlt.target, gs.statsTrack.ultCastCount);

      const achUlt150 = gs.achievements.find(a => a.id === 'ach_ult150');
      if (achUlt150) achUlt150.current = Math.min(achUlt150.target, gs.statsTrack.ultCastCount);

      const questUlt = gs.dailyQuests.find(q => q.id === 'dq_ult');
      if (questUlt) questUlt.current = Math.min(questUlt.target, questUlt.current + 1);

      if (currentBoss.gimmick === 'carapace' || currentBoss.gimmick === 'superboss' || currentBoss.gimmick === 'juggernaut' || currentBoss.gimmick === 'secretboss') {
        const bonusVuln = setCounts.shadowstalker >= 4 ? 30 : 0;
        bossVulnerableTimer = tierVulnSec[tier] + bonusVuln;
        App.core.showToast(`💥 SHADOW SLASH (Lv.${tier}) กะเทาะเกราะแตก! บอสเปราะบาง (${bossVulnerableTimer} วิ)`);
        App.core.speakVoice(`คมดาบระดับ ${tier} ผ่าเกราะแตกสะบั้น บอสติดสถานะเปราะบาง`, true);
      } else {
        App.core.showToast(`🗡️ SHADOW SLASH (Lv.${tier})! เฉือนบอส ${burstDamageKm.toFixed(2)} กม.!`);
        App.core.speakVoice(`ปลดปล่อยคมดาบอเวจีระดับ ${tier}! เข้าสู่สภาวะโอเวอร์ไดรฟ์`, true);
      }

      gs.bossHpRemain = Math.max(0, gs.bossHpRemain - burstDamageKm);

      if (App.MapEngine) {
        App.MapEngine.applyUltimateBurstToEncounter(burstDamageKm);
      }

      const tempestBonusSec = setCounts.darktempest >= 2 ? 20 : 0;
      App.core.triggerOverdriveBuff(tierOverdriveSec[tier] + tempestBonusSec);

      if (gs.bossHpRemain <= 0.001) {
        this.handleBossDefeat(currentBoss, tier);
      }

      App.core.saveGame();
      App.core.renderUI();
    },

    tickSecond() {
      const gs = App.core?.getGameState();
      if (!gs) return;

      if (bossVulnerableTimer > 0) {
        bossVulnerableTimer--;
      }

      if (goblinCooldownSeconds > 0) {
        goblinCooldownSeconds--;
      }

      if (isGoblinActive) {
        goblinSecondsLeft--;
        const goblinTimerEl = document.getElementById('goblin-timer');
        const goblinProgressFillEl = document.getElementById('goblin-progress-fill');
        const goblinStatusHintEl = document.getElementById('goblin-status-hint');

        if (goblinTimerEl) goblinTimerEl.textContent = `${goblinSecondsLeft}s`;

        const rollingPace = App.core.getRecentRollingPace();
        if (rollingPace !== null && goblinTargetPaceDec !== null && rollingPace <= goblinTargetPaceDec) {
          goblinProgressSec++;
          if (goblinStatusHintEl) goblinStatusHintEl.textContent = `⚡ กำลังประชิดตัว! (${goblinProgressSec}/${GOBLIN_REQUIRED_SECONDS}s)`;
        } else {
          if (goblinStatusHintEl) goblinStatusHintEl.textContent = 'เร่งความเร็วให้แตะเพซเป้าหมาย!';
        }

        const pct = Math.min(100, Math.round((goblinProgressSec / GOBLIN_REQUIRED_SECONDS) * 100));
        if (goblinProgressFillEl) goblinProgressFillEl.style.width = `${pct}%`;

        if (goblinProgressSec >= GOBLIN_REQUIRED_SECONDS) {
          this.completeGoblinChaseSuccess();
        } else if (goblinSecondsLeft <= 0) {
          this.failGoblinChase();
        }
      }

      // Skip Boss Healing ticks if Boss is Frozen by Ice Magic (Glacial Nova)!
      const isFrozen = App.MagicEngine && App.MagicEngine.isBossFrozen ? App.MagicEngine.isBossFrozen() : false;
      if (isFrozen) return;

      const currentBoss = App.BOSS_DATABASE[gs.bossIndex];
      const bossMaxHp = App.getBossMaxHp(gs.bossIndex, gs.bossLoopCycle || 0);
      const bossHpPct = gs.bossHpRemain / bossMaxHp;
      const isLoop = (gs.bossLoopCycle || 0) >= 1;
      const flags = App.core.getCombatFlags();

      const mistThresh = isLoop ? 0.85 : 0.75;
      if (currentBoss.gimmick === 'mist' && bossHpPct <= mistThresh) {
        const rollingPace = App.core.getRecentRollingPace();
        if (rollingPace === null || rollingPace > 7.5) {
          mistHealingTick++;
          if (mistHealingTick >= 15) {
            mistHealingTick = 0;
            gs.bossHpRemain = Math.min(bossMaxHp, gs.bossHpRemain + 0.02);
            App.core.showToast('🌫️ หมอกคำสาปสูบพลัง! บอสฟื้นฟูเลือด +0.02 กม.');
          }
        } else {
          mistHealingTick = 0;
        }
      }

      if (isLoop && currentBoss.id === 'boss_2') {
        const rollingPace = App.core.getRecentRollingPace();
        if (rollingPace === null || rollingPace > 8.5) {
          bloodKnightStallTick++;
          if (bloodKnightStallTick >= 12) {
            bloodKnightStallTick = 0;
            const drainHp = parseFloat((bossMaxHp * 0.03).toFixed(2));
            gs.bossHpRemain = Math.min(bossMaxHp, gs.bossHpRemain + drainHp);
            App.core.showToast(`🩸 Vampiric Drain: อัศวินโลหิตสูบเลือดฟื้นฟู +${drainHp} กม.!`);
            App.core.speakVoice('อัศวินโลหิตใช้ท่าสูบพลัง ฟื้นฟูเลือดตนเอง');
          }
        } else {
          bloodKnightStallTick = 0;
        }
      }

      if (currentBoss.gimmick === 'chrono') {
        const rollingPace = App.core.getRecentRollingPace();
        if (rollingPace === null || rollingPace > 8.0) {
          chronoHealingTick++;
          if (chronoHealingTick >= 15) {
            chronoHealingTick = 0;
            gs.bossHpRemain = Math.min(bossMaxHp, gs.bossHpRemain + 0.05);
            App.core.showToast('⏳ นาฬิกาทรายทมิฬหมุนกลับ! บอสฟื้นฟูเลือด +0.05 กม.');
          }
        } else {
          chronoHealingTick = 0;
        }
      }

      if (currentBoss.gimmick === 'superboss' && bossHpPct <= 0.65 && bossHpPct > 0.30) {
        const rollingPace = App.core.getRecentRollingPace();
        if (rollingPace === null || rollingPace > 7.0) {
          superbossSiphonTick++;
          if (superbossSiphonTick >= 10) {
            superbossSiphonTick = 0;
            gs.ultimateCharge = Math.max(0, gs.ultimateCharge - 15);
            gs.bossHpRemain = Math.min(bossMaxHp, gs.bossHpRemain + 0.05);
            App.core.showToast('🕳️ Singularity Siphon: เพซช้า! บอสดูดเกจ -15% และฮีลเลือด +0.05 กม.');
          }
        } else {
          superbossSiphonTick = 0;
        }
      }

      if (currentBoss.gimmick === 'secretboss' && bossHpPct <= 0.60 && bossHpPct > 0.30) {
        const rollingPace = App.core.getRecentRollingPace();
        if (rollingPace === null || rollingPace > 7.0 || (flags.isBleConnected && flags.currentHrZone < 3)) {
          secretbossSiphonTick++;
          if (secretbossSiphonTick >= 8) {
            secretbossSiphonTick = 0;
            gs.ultimateCharge = Math.max(0, gs.ultimateCharge - 20);
            gs.bossHpRemain = Math.min(bossMaxHp, gs.bossHpRemain + 0.08);
            App.core.showToast('🕳️ Event Horizon: แรงกดดันมิติ! บอสดูดเกจ -20% และฮีลเลือด +0.08 กม.');
          }
        } else {
          secretbossSiphonTick = 0;
        }
      }
    }
  };
})();
