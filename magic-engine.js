// ShadowStrider: Dark Run RPG - Module 3: Mana (STA Scaling), 6 Elemental Spells & Spell Tomes
(function () {
  'use strict';

  const App = window.ShadowStriderApp = window.ShadowStriderApp || {};

  // --- 6 Elemental Magic Spells Database (Balanced Damage & Reduced MP Cost) ---
  App.SPELL_DATABASE = {
    earth: {
      id: 'earth',
      element: 'earth',
      name: 'Earthquake Spike',
      thName: 'หอกศิลาทลายพสุธา',
      icon: '🌍',
      mpCost: 15,
      baseDamageKm: 0.60,
      color: '#d97706',
      borderColor: '#f59e0b',
      effectType: 'shatter',
      desc: 'สร้างดาเมจธาตุดิน และกะเทาะเกราะศิลาบอส (Vulnerable +35 วิ)'
    },
    ice: {
      id: 'ice',
      element: 'ice',
      name: 'Glacial Nova',
      thName: 'ระเบิดเหมันต์เยือกแข็ง',
      icon: '❄️',
      mpCost: 18,
      baseDamageKm: 0.65,
      color: '#0284c7',
      borderColor: '#38bdf8',
      effectType: 'freeze',
      desc: 'สร้างดาเมจธาตุน้ำแข็ง และแช่แข็งหยุดการฮีลเลือดของบอสนาน 30 วิ'
    },
    fire: {
      id: 'fire',
      element: 'fire',
      name: 'Hellfire Meteor',
      thName: 'อุกกาบาตเพลิงนรก',
      icon: '🔥',
      mpCost: 20,
      baseDamageKm: 0.85,
      color: '#dc2626',
      borderColor: '#ef4444',
      effectType: 'burn',
      desc: 'ดาเมจธาตุไฟรุนแรงในบรรดาเวทพื้นฐาน แผดเผาเป้าหมาย'
    },
    lightning: {
      id: 'lightning',
      element: 'lightning',
      name: 'Tempest Chain',
      thName: 'อัสนีบาตฟาดพิภพ',
      icon: '⚡',
      mpCost: 18,
      baseDamageKm: 0.70,
      color: '#ca8a04',
      borderColor: '#eab308',
      effectType: 'charge',
      desc: 'สร้างดาเมจธาตุสายฟ้า และชาร์จเกจไม้ตาย Shadow Slash เพิ่ม +15%'
    },
    light: {
      id: 'light',
      element: 'light',
      name: 'Solar Judgment',
      thName: 'ทัณฑ์แสงพิพากษา',
      icon: '✨',
      mpCost: 22,
      baseDamageKm: 0.80,
      color: '#eab308',
      borderColor: '#fde047',
      effectType: 'pierce',
      desc: 'ลำแสงศักดิ์สิทธิ์ ทะลุเกราะลดดาเมจของบอส 100% (True Damage)'
    },
    dark: {
      id: 'dark',
      element: 'dark',
      name: 'Abyssal Eclipse',
      thName: 'หลุมดำกลืนวิญญาณ',
      icon: '🌑',
      mpCost: 25,
      baseDamageKm: 0.95,
      color: '#7e22ce',
      borderColor: '#a855f7',
      effectType: 'siphon',
      desc: 'หลุมดำกลืนพลัง สร้างดาเมจธาตุมืดสูงสุด + ดูดเหรียญทอง & EXP ทันที'
    }
  };

  let freezeBossSeconds = 0;
  let autoSpellCooldownSec = 0;
  const AUTO_INTERVAL_OPTIONS = [0, 15, 30, 60];

  App.MagicEngine = {
    getMaxMp(gs) {
      if (!gs) return 100;
      const sta = (gs.stats && gs.stats.sta) || 10;
      const eqBonus = App.core?.calculateEquipmentBonuses ? App.core.calculateEquipmentBonuses() : { bonusSta: 0, bonusMp: 0 };
      const effectiveSta = Math.floor(sta * (1 + ((eqBonus.bonusSta || 0) * 0.01)));
      // Base 50 + (Effective STA * 5) + Rune/Equipment MP Bonuses
      return 50 + (effectiveSta * 5) + (eqBonus.bonusMp || 0);
    },

    ensureManaBounds(gs) {
      if (!gs) return;
      const maxMp = this.getMaxMp(gs);
      if (typeof gs.currentMp !== 'number' || isNaN(gs.currentMp)) {
        gs.currentMp = maxMp;
      }
      gs.currentMp = Math.min(maxMp, Math.max(0, gs.currentMp));
    },

    regenerateManaFromDistance(distanceDeltaKm, context = {}) {
      const gs = App.core?.getGameState();
      if (!gs || distanceDeltaKm <= 0) return;

      const maxMp = this.getMaxMp(gs);
      // Base regen: 60 MP per 1.0 km (6.0 MP per 100m)
      let regenRate = 60;
      if (context.isFlowStateActive) regenRate *= 1.5;
      if (context.currentHrZone === 2) regenRate *= 1.35;

      const gained = distanceDeltaKm * regenRate;
      gs.currentMp = Math.min(maxMp, (gs.currentMp || 0) + gained);
    },

    getActiveInterval(gs) {
      if (!gs) return 0;
      const val = typeof gs.autoMagicInterval === 'number' ? gs.autoMagicInterval : (gs.autoMagicMode ? 15 : 0);
      return AUTO_INTERVAL_OPTIONS.includes(val) ? val : 0;
    },

    cycleAutoMagicInterval() {
      const gs = App.core?.getGameState();
      if (!gs) return;

      const curInterval = this.getActiveInterval(gs);
      const nextIdx = (AUTO_INTERVAL_OPTIONS.indexOf(curInterval) + 1) % AUTO_INTERVAL_OPTIONS.length;
      const nextInterval = AUTO_INTERVAL_OPTIONS[nextIdx];

      gs.autoMagicInterval = nextInterval;
      gs.autoMagicMode = nextInterval > 0;

      if (nextInterval === 0) {
        gs.selectedAutoSpell = null;
        autoSpellCooldownSec = 0;
        App.core.saveGame();
        this.renderMagicHUD();
        App.core.showToast('ปิดระบบร่ายเวทอัตโนมัติแล้ว');
        App.core.speakVoice('ปิดระบบร่ายเวทอัตโนมัติ', true);
        return;
      }

      // Auto-assign current boss weakness if no spell is currently selected
      if (!gs.selectedAutoSpell || !App.SPELL_DATABASE[gs.selectedAutoSpell]) {
        const currentBoss = App.BOSS_DATABASE[gs.bossIndex];
        gs.selectedAutoSpell = (currentBoss && currentBoss.weakElement) || 'fire';
      }

      const spell = App.SPELL_DATABASE[gs.selectedAutoSpell];
      const elemInfo = App.ELEMENT_DATABASE[gs.selectedAutoSpell];
      const isRunning = App.core?.isRunning ? App.core.isRunning() : false;

      if (isRunning && curInterval === 0 && gs.currentMp >= spell.mpCost) {
        this.castSpell(gs.selectedAutoSpell, false);
        autoSpellCooldownSec = nextInterval;
      } else {
        autoSpellCooldownSec = Math.min(autoSpellCooldownSec > 0 ? autoSpellCooldownSec : nextInterval, nextInterval);
      }

      App.core.saveGame();
      this.renderMagicHUD();
      App.core.showToast(`🔄 ตั้งออโต้เวทธาตุ${elemInfo.name} (${spell.thName}) ทุก ${nextInterval} วินาที`);
      App.core.speakVoice(`ตั้งค่าออโต้เวทธาตุ${elemInfo.name} ทุก ${nextInterval} วินาที`, true);
    },

    selectAutoSpell(spellKey) {
      const gs = App.core?.getGameState();
      const spell = App.SPELL_DATABASE[spellKey];
      const elemInfo = App.ELEMENT_DATABASE[spellKey];
      if (!gs || !spell || !elemInfo) return;

      const curInterval = this.getActiveInterval(gs);

      // Toggle off if tapping the currently active auto-spell while auto is active
      if (gs.selectedAutoSpell === spellKey && curInterval > 0) {
        gs.selectedAutoSpell = null;
        gs.autoMagicMode = false;
        gs.autoMagicInterval = 0;
        autoSpellCooldownSec = 0;
        App.core.saveGame();
        this.renderMagicHUD();
        App.core.showToast(`ยกเลิกออโต้เวทธาตุ${elemInfo.name}`);
        App.core.speakVoice('ยกเลิกการร่ายเวทอัตโนมัติ', true);
        return;
      }

      // Default to 15s interval if auto-cast was off
      const activeInterval = curInterval > 0 ? curInterval : 15;
      gs.selectedAutoSpell = spellKey;
      gs.autoMagicMode = true;
      gs.autoMagicInterval = activeInterval;

      const isRunning = App.core?.isRunning ? App.core.isRunning() : false;
      this.ensureManaBounds(gs);

      if (isRunning && gs.currentMp >= spell.mpCost) {
        this.castSpell(spellKey, false);
        autoSpellCooldownSec = activeInterval;
      } else {
        autoSpellCooldownSec = 0;
        App.core.showToast(`${spell.icon} ตั้งออโต้เวท: ${spell.thName} (ทุก ${activeInterval} วินาที)`);
        App.core.speakVoice(`ตั้งค่าออโต้เวทธาตุ${elemInfo.name} ทุก ${activeInterval} วินาที`, true);
      }

      App.core.saveGame();
      this.renderMagicHUD();
    },

    tickSecond() {
      if (freezeBossSeconds > 0) {
        freezeBossSeconds--;
        const freezeBanner = document.getElementById('freeze-banner');
        const freezeTimeEl = document.getElementById('freeze-time-left');
        if (freezeBanner && freezeTimeEl) {
          freezeBanner.style.display = freezeBossSeconds > 0 ? 'block' : 'none';
          freezeTimeEl.textContent = freezeBossSeconds;
        }
      }

      // Selected Elemental Spell Auto-Cast by configured interval (15s / 30s / 60s)
      const gs = App.core?.getGameState();
      const isRunning = App.core?.isRunning ? App.core.isRunning() : false;
      const interval = this.getActiveInterval(gs);

      if (isRunning && gs && interval > 0 && gs.selectedAutoSpell) {
        const targetSpell = App.SPELL_DATABASE[gs.selectedAutoSpell];
        if (targetSpell) {
          if (autoSpellCooldownSec > 0) {
            autoSpellCooldownSec--;
          }
          if (autoSpellCooldownSec <= 0) {
            this.ensureManaBounds(gs);
            if ((gs.currentMp || 0) >= targetSpell.mpCost) {
              this.castSpell(targetSpell.id, true);
              autoSpellCooldownSec = interval;
            }
          }
        }
      }
    },

    isBossFrozen() {
      return freezeBossSeconds > 0;
    },

    resetCombatTimers() {
      freezeBossSeconds = 0;
      autoSpellCooldownSec = 0;
      const freezeBanner = document.getElementById('freeze-banner');
      if (freezeBanner) freezeBanner.style.display = 'none';
    },

    getSpellDamageKm(gs, spellKey) {
      const spell = App.SPELL_DATABASE[spellKey];
      if (!spell || !gs) return 0;

      const level = (gs.spellLevels && gs.spellLevels[spellKey]) || 1;
      // Balanced scaling: +25% linear per Tome level combined with gentle 1.06^(level-1) growth
      const tomeMult = (1 + ((level - 1) * 0.25)) * Math.pow(1.06, Math.max(0, level - 1));
      // STA grants +1.5% spell affinity per point above 10
      const staBonus = 1 + Math.max(0, (((gs.stats && gs.stats.sta) || 10) - 10) * 0.015);

      return parseFloat((spell.baseDamageKm * tomeMult * staBonus).toFixed(3));
    },

    getElementalMultiplier(spellElement, targetWeakElement, targetResistElement) {
      if (spellElement === targetWeakElement) {
        return { mult: 2.0, status: 'weak' };
      }
      if (spellElement === targetResistElement) {
        return { mult: 0.5, status: 'resist' };
      }
      return { mult: 1.0, status: 'neutral' };
    },

    castSpell(spellKey, isAuto = false) {
      const gs = App.core?.getGameState();
      const isRunning = App.core?.isRunning ? App.core.isRunning() : false;
      const spell = App.SPELL_DATABASE[spellKey];
      if (!gs || !spell) return;

      if (!isRunning) {
        if (!isAuto) App.core.showToast('กรุณากด "เริ่มออกล่า" ก่อนร่ายเวทมนตร์');
        return;
      }

      this.ensureManaBounds(gs);
      if (gs.currentMp < spell.mpCost) {
        if (!isAuto) App.core.showToast(`💧 มานาไม่เพียงพอ! ต้องการ ${spell.mpCost} MP`);
        return;
      }

      gs.currentMp -= spell.mpCost;
      gs.statsTrack.spellsCastCount = (gs.statsTrack.spellsCastCount || 0) + 1;

      const currentBoss = App.BOSS_DATABASE[gs.bossIndex];
      const baseSpellDmg = this.getSpellDamageKm(gs, spellKey);
      const affinity = this.getElementalMultiplier(spell.element, currentBoss.weakElement, currentBoss.resistElement);

      let finalBossDmg = baseSpellDmg * affinity.mult;
      let extraEffectText = '';

      if (spell.effectType === 'shatter') {
        if (App.CombatEngine && App.CombatEngine.applyBossVulnerable) {
          App.CombatEngine.applyBossVulnerable(35);
          extraEffectText = ' (เกราะบอสเปราะบาง 35 วิ)';
        }
      } else if (spell.effectType === 'freeze') {
        freezeBossSeconds = 30;
        const freezeBanner = document.getElementById('freeze-banner');
        const freezeTimeEl = document.getElementById('freeze-time-left');
        if (freezeBanner && freezeTimeEl) {
          freezeBanner.style.display = 'block';
          freezeTimeEl.textContent = freezeBossSeconds;
        }
        extraEffectText = ' (แช่แข็งหยุดบอสฮีล 30 วิ)';
      } else if (spell.effectType === 'charge') {
        App.core.addUltimateCharge(15);
        extraEffectText = ' (+15% เกจไม้ตาย)';
      } else if (spell.effectType === 'pierce') {
        if (affinity.mult < 1.0) finalBossDmg = baseSpellDmg; // True damage ignores resistance
        extraEffectText = ' (ทะลุเกราะสมบูรณ์)';
      } else if (spell.effectType === 'siphon') {
        const bonusGold = Math.floor(80 + (gs.level * 12));
        const bonusExp = Math.floor(350 + (gs.level * 60));
        gs.gold += bonusGold;
        App.core.addExp(bonusExp);
        extraEffectText = ` (+${bonusGold}🪙 +${bonusExp} EXP)`;
      }

      // Apply elemental damage to active Roaming Field Monster as well
      if (App.MapEngine && App.MapEngine.applyElementalSpellToEncounter) {
        App.MapEngine.applyElementalSpellToEncounter(baseSpellDmg, spell.element);
      }

      gs.bossHpRemain = Math.max(0, gs.bossHpRemain - finalBossDmg);

      const affinityTag = affinity.status === 'weak'
        ? '💥 ชนะทางธาตุ x2.0!'
        : (affinity.status === 'resist' ? '🛡️ บอสต้านทาน x0.5' : '');

      const autoPrefix = isAuto ? '🔄 [Auto] ' : '';
      App.core.showToast(`${autoPrefix}${spell.icon} ${spell.thName}! ดาเมจ ${finalBossDmg.toFixed(2)} กม. ${affinityTag}${extraEffectText}`);
      if (!isAuto) {
        App.core.speakVoice(`ร่ายเวท ${spell.thName}${affinity.status === 'weak' ? ' โจมตีจุดอ่อนรุนแรงสองเท่า' : ''}`, true);
      }

      if (gs.bossHpRemain <= 0.001 && App.CombatEngine) {
        App.CombatEngine.handleBossDefeat(currentBoss, 0);
      }

      App.core.saveGame();
      App.core.renderUI();
    },

    awardSpellTome(elementKey, qty = 1) {
      const gs = App.core?.getGameState();
      const elemInfo = App.ELEMENT_DATABASE[elementKey];
      if (!gs || !elemInfo) return null;

      if (!gs.spellTomes) {
        gs.spellTomes = { earth: 0, ice: 0, fire: 0, lightning: 0, light: 0, dark: 0 };
      }
      gs.spellTomes[elementKey] = (gs.spellTomes[elementKey] || 0) + qty;
      return elemInfo;
    },

    upgradeSpellWithTome(elementKey) {
      const gs = App.core?.getGameState();
      const spell = App.SPELL_DATABASE[elementKey];
      const elemInfo = App.ELEMENT_DATABASE[elementKey];
      if (!gs || !spell || !elemInfo) return;

      const currentLv = (gs.spellLevels && gs.spellLevels[elementKey]) || 1;
      const tomesOwned = (gs.spellTomes && gs.spellTomes[elementKey]) || 0;
      const requiredTomes = currentLv;

      if (tomesOwned < requiredTomes) {
        App.core.showToast(`📕 ต้องการคัมภีร์ธาตุ${elemInfo.name} ${requiredTomes} เล่ม (มี ${tomesOwned} เล่ม)`);
        return;
      }

      gs.spellTomes[elementKey] -= requiredTomes;
      gs.spellLevels[elementKey] = currentLv + 1;

      App.core.showToast(`✨ อัปเกรด ${spell.thName} เป็น Lv.${currentLv + 1}! (พลังเวทพุ่งทะยาน)`);
      App.core.speakVoice(`อัปเกรดคัมภีร์เวท ${spell.thName} เลเวล ${currentLv + 1}`, true);
      App.core.saveGame();
      App.core.renderUI();
    },

    renderMagicHUD() {
      const gs = App.core?.getGameState();
      if (!gs) return;

      this.ensureManaBounds(gs);
      const maxMp = this.getMaxMp(gs);
      const curMp = Math.floor(gs.currentMp);

      const manaTextEl = document.getElementById('mana-val-text');
      const manaFillEl = document.getElementById('mana-bar-fill');
      const autoBtn = document.getElementById('btn-automagic-toggle');
      const autoText = document.getElementById('automagic-status-text');
      const gridEl = document.getElementById('magic-spells-grid');

      if (manaTextEl) manaTextEl.textContent = `${curMp} / ${maxMp}`;
      if (manaFillEl) manaFillEl.style.width = `${Math.min(100, (curMp / maxMp) * 100)}%`;

      const interval = this.getActiveInterval(gs);
      const selectedKey = interval > 0 ? (gs.selectedAutoSpell || null) : null;
      const isRunning = App.core?.isRunning ? App.core.isRunning() : false;

      if (autoBtn && autoText) {
        autoBtn.className = 'btn-automagic-toggle';
        if (interval > 0 && selectedKey && App.SPELL_DATABASE[selectedKey] && App.ELEMENT_DATABASE[selectedKey]) {
          const elInfo = App.ELEMENT_DATABASE[selectedKey];
          autoBtn.classList.add(`active-${interval}`);
          if (!isRunning) {
            autoText.textContent = `ออโต้ ${interval}วิ: ${elInfo.icon}${elInfo.name}`;
          } else if (autoSpellCooldownSec > 0) {
            autoText.textContent = `ออโต้ ${interval}วิ: ${elInfo.icon}${elInfo.name} (${autoSpellCooldownSec}s)`;
          } else {
            autoText.textContent = `ออโต้ ${interval}วิ: ${elInfo.icon}${elInfo.name} (รอ MP)`;
          }
        } else {
          autoText.textContent = 'ออโต้เวท: ปิด (15/30/60วิ)';
        }
      }

      if (!gridEl) return;
      const currentBoss = App.BOSS_DATABASE[gs.bossIndex];

      gridEl.innerHTML = '';
      Object.keys(App.SPELL_DATABASE).forEach(sKey => {
        const sp = App.SPELL_DATABASE[sKey];
        const lv = (gs.spellLevels && gs.spellLevels[sKey]) || 1;
        const dmgKm = this.getSpellDamageKm(gs, sKey);
        const isWeakness = currentBoss && currentBoss.weakElement === sp.element;
        const isSelectedAuto = selectedKey === sKey && interval > 0;
        const hasEnoughMp = curMp >= sp.mpCost;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn-cast-spell ${hasEnoughMp ? 'ready' : ''} ${isWeakness ? 'weakness-match' : ''} ${isSelectedAuto ? 'auto-selected' : ''}`;
        if (isSelectedAuto) {
          btn.style.borderColor = '#38bdf8';
        } else if (hasEnoughMp) {
          btn.style.borderColor = sp.borderColor;
        }
        btn.title = `${sp.thName} (Lv.${lv}): ดาเมจ ${dmgKm.toFixed(2)} กม. • แตะเพื่อตั้ง/สลับ Auto`;

        let statusSubHtml = `⚔️${dmgKm.toFixed(2)} • 💧${sp.mpCost}`;
        if (isSelectedAuto) {
          if (!isRunning) {
            statusSubHtml = `🔄 ${interval}s • 💧${sp.mpCost}`;
          } else if (autoSpellCooldownSec > 0) {
            statusSubHtml = `⏱ ${autoSpellCooldownSec}s • 💧${sp.mpCost}`;
          } else {
            statusSubHtml = `⏳ รอ MP (${sp.mpCost})`;
          }
        }

        btn.innerHTML = `
          ${isSelectedAuto ? `<span class="spell-auto-badge">AUTO ${interval}s</span>` : (isWeakness ? '<span class="spell-weak-badge">แพ้ทาง x2</span>' : '')}
          <div class="spell-btn-top">
            <span>${sp.icon}</span>
            <span>${App.ELEMENT_DATABASE[sp.element].name} Lv.${lv}</span>
          </div>
          <div class="spell-btn-sub">${statusSubHtml}</div>
        `;

        btn.addEventListener('click', () => this.selectAutoSpell(sKey));
        gridEl.appendChild(btn);
      });
    },

    renderTomesGrimoire() {
      const gs = App.core?.getGameState();
      if (!gs) return;

      const maxMp = this.getMaxMp(gs);
      const maxMpBadge = document.getElementById('tomes-max-mp-badge');
      const staMpPreview = document.getElementById('sta-mp-preview');
      if (maxMpBadge) maxMpBadge.textContent = `Max MP: ${maxMp}`;
      if (staMpPreview) staMpPreview.textContent = maxMp;

      const gridEl = document.getElementById('tomes-grid');
      if (!gridEl) return;

      gridEl.innerHTML = '';
      Object.keys(App.SPELL_DATABASE).forEach(sKey => {
        const sp = App.SPELL_DATABASE[sKey];
        const elInfo = App.ELEMENT_DATABASE[sp.element];
        const lv = (gs.spellLevels && gs.spellLevels[sKey]) || 1;
        const tomesOwned = (gs.spellTomes && gs.spellTomes[sKey]) || 0;
        const reqTomes = lv;
        const dmgKm = this.getSpellDamageKm(gs, sKey);
        const canUpgrade = tomesOwned >= reqTomes;

        const card = document.createElement('div');
        card.className = 'tome-card';
        card.style.borderColor = `${elInfo.color}66`;

        card.innerHTML = `
          <div class="tome-card-top">
            <span class="tome-icon">${sp.icon}</span>
            <div class="tome-info">
              <div class="tome-name">${sp.thName}</div>
              <div class="tome-lvl">Lv.${lv} • ดาเมจ ${dmgKm.toFixed(2)} กม. (💧${sp.mpCost} MP)</div>
            </div>
          </div>
          <div class="tome-effect">${sp.desc}</div>
          <div class="tome-footer">
            <span class="tome-count-txt">📕 คัมภีร์: ${tomesOwned}/${reqTomes}</span>
            <button class="btn-upgrade-tome" type="button" ${canUpgrade ? '' : 'disabled'}>อัปเกรด</button>
          </div>
        `;

        const upgBtn = card.querySelector('.btn-upgrade-tome');
        if (upgBtn) {
          upgBtn.addEventListener('click', () => this.upgradeSpellWithTome(sKey));
        }

        gridEl.appendChild(card);
      });
    },

    initControls() {
      const autoBtn = document.getElementById('btn-automagic-toggle');
      if (autoBtn) {
        autoBtn.addEventListener('click', () => this.cycleAutoMagicInterval());
      }
    }
  };
})();
