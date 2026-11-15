// ShadowStrider: Dark Run RPG - Module 1: Databases, Constants & Level Scaling Formulas
(function () {
  'use strict';

  const App = window.ShadowStriderApp = window.ShadowStriderApp || {};

  // --- Equipment Set System Database ---
  App.SET_DATABASE = {
    shadowstalker: {
      id: 'shadowstalker',
      name: 'เซ็ตเงามัจจุราช',
      fullName: 'Shadowstalker Armor',
      icon: '🌑',
      color: '#c084fc',
      bonuses: {
        2: 'คริติคอล +10% & เกจไม้ตายชาร์จไวขึ้น 25%',
        4: 'ท่าไม้ตาย Shadow Slash แรงขึ้น 50% & เกราะศิลาแตกนานขึ้น'
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
        2: 'เข้าสู่ Flow State ง่ายขึ้น 50% (คุมเพซเพียง 150 เมตร)',
        4: 'เมื่ออยู่ใน Flow State การโจมตีจะทะลุเกราะบอส 100% (True Damage)'
      }
    },
    voidannihilator: {
      id: 'voidannihilator',
      name: 'เซ็ตมหาอสูรล้างดารา',
      fullName: 'Void Annihilator Regalia',
      icon: '⚡',
      color: '#a855f7',
      bonuses: {
        2: 'เกจไม้ตายชาร์จไวขึ้น +45% จากทุกแหล่ง',
        4: 'Shadow Slash แรงขึ้น +80% และรีฟันด์เกจคืน 30% ทันทีที่ร่าย'
      }
    },
    darktempest: {
      id: 'darktempest',
      name: 'เซ็ตพายุอัสนีอเวจี',
      fullName: 'Dark Tempest Battlegear',
      icon: '⚡',
      color: '#f59e0b',
      bonuses: {
        2: 'ยืดเวลา Overdrive +20 วิ & ดาเมจ +20% เมื่ออยู่ใน Zone 3 ขึ้นไป',
        4: 'Shadow Slash เรียกสายฟ้าทัณฑ์อัสนี +0.35 กม. และล็อกคริ 100% นาน 15 วิ'
      }
    }
  };

  // --- Rune Database (El #1 to Fal #19) ---
  App.RUNE_DATABASE = {
    el: { id: 'el', name: 'El', number: 1, icon: '🪨', statDesc: 'ดาเมจ +5%', statType: 'dmg', statVal: 5 },
    eld: { id: 'eld', name: 'Eld', number: 2, icon: '🪨', statDesc: 'ความอึด STA +5%', statType: 'sta', statVal: 5 },
    tir: { id: 'tir', name: 'Tir', number: 3, icon: '🪨', statDesc: 'เกจไม้ตายชาร์จไว +8%', statType: 'ultCharge', statVal: 8 },
    nef: { id: 'nef', name: 'Nef', number: 4, icon: '🪨', statDesc: 'ความอึด STA +8%', statType: 'sta', statVal: 8 },
    eth: { id: 'eth', name: 'Eth', number: 5, icon: '🪨', statDesc: 'เจาะเกราะบอส +8%', statType: 'pierce', statVal: 8 },
    ith: { id: 'ith', name: 'Ith', number: 6, icon: '🪨', statDesc: 'ดาเมจ +8%', statType: 'dmg', statVal: 8 },
    tal: { id: 'tal', name: 'Tal', number: 7, icon: '🪨', statDesc: 'ดาเมจพิษ +12%', statType: 'dmg', statVal: 12 },
    ral: { id: 'ral', name: 'Ral', number: 8, icon: '🪨', statDesc: 'ดาเมจเพลิง +15%', statType: 'dmg', statVal: 15 },
    ort: { id: 'ort', name: 'Ort', number: 9, icon: '🪨', statDesc: 'เกจไม้ตายไวขึ้น +15%', statType: 'ultCharge', statVal: 15 },
    thul: { id: 'thul', name: 'Thul', number: 10, icon: '🪨', statDesc: 'คริติคอล +5%', statType: 'crit', statVal: 5 },
    amn: { id: 'amn', name: 'Amn', number: 11, icon: '🪨', statDesc: 'โบนัส EXP +15%', statType: 'exp', statVal: 15 },
    sol: { id: 'sol', name: 'Sol', number: 12, icon: '🪨', statDesc: 'ดาเมจสุทธิ +14%', statType: 'dmg', statVal: 14 },
    shael: { id: 'shael', name: 'Shael', number: 13, icon: '🪨', statDesc: 'เข้าสู่ Flow State ไวขึ้น 25%', statType: 'flow', statVal: 25 },
    dol: { id: 'dol', name: 'Dol', number: 14, icon: '🪨', statDesc: 'โบนัสเหรียญทอง +20%', statType: 'gold', statVal: 20 },
    hel: { id: 'hel', name: 'Hel', number: 15, icon: '🪨', statDesc: 'หินล้างช่องรูน', statType: 'cleanse', statVal: 0 },
    io: { id: 'io', name: 'Io', number: 16, icon: '🪨', statDesc: 'ความอึด STA +15%', statType: 'sta', statVal: 15 },
    lum: { id: 'lum', name: 'Lum', number: 17, icon: '🪨', statDesc: 'STA +15% & โบนัสทอง +15%', statType: 'lum', statVal: 15 },
    ko: { id: 'ko', name: 'Ko', number: 18, icon: '🪨', statDesc: 'คริติคอล +8% & คริแรง +20%', statType: 'critPlus', statVal: 8 },
    fal: { id: 'fal', name: 'Fal', number: 19, icon: '🪨', statDesc: 'ดาเมจพลังกาย +25%', statType: 'dmg', statVal: 25 }
  };

  // --- Runewords Database (Original 4 Sets + 5 New Weapon/Speed Sets = 9 Sets Total) ---
  App.RUNEWORD_DATABASE = [
    {
      id: 'steel',
      name: 'Steel (คมเหล็กสังหาร)',
      runes: ['tir', 'el'],
      types: ['weapon'],
      typeLabels: 'อาวุธ (2 ช่อง)',
      desc: 'ดาเมจพื้นฐาน +25%, คริติคอล +10%, ชาร์จเกจไม้ตายไวขึ้น +20%',
      bonusDmg: 25,
      bonusCrit: 10,
      bonusUltCharge: 20
    },
    {
      id: 'zephyr',
      name: 'Zephyr (คมศรสายลมกรด)',
      runes: ['ort', 'eth'],
      types: ['weapon', 'boots'],
      typeLabels: 'อาวุธ / รองเท้า (2 ช่อง)',
      desc: 'ดาเมจ +30%, เจาะเกราะบอส +20%, ชาร์จไม้ตายไว +25%, เข้าสู่ Flow State ไวขึ้น +30%',
      bonusDmg: 30,
      bonusPierce: 20,
      bonusUltCharge: 25,
      bonusFlow: 30
    },
    {
      id: 'malice',
      name: 'Malice (อาฆาตโลหิต)',
      runes: ['ith', 'el', 'eth'],
      types: ['weapon'],
      typeLabels: 'อาวุธ (3 ช่อง)',
      desc: 'ดาเมจ +35%, เจาะเกราะบอส +30% (ทลายเกราะบอสและด้วงเหล็ก), คริติคอล +12%',
      bonusDmg: 35,
      bonusPierce: 30,
      bonusCrit: 12
    },
    {
      id: 'edge',
      name: 'Edge (คมดาบล่ารางวัล)',
      runes: ['tir', 'tal', 'amn'],
      types: ['weapon'],
      typeLabels: 'อาวุธ (3 ช่อง)',
      desc: 'ดาเมจ +30%, โบนัส EXP +35%, โบนัสเหรียญทอง +30%, ชาร์จไม้ตายไว +15%',
      bonusDmg: 30,
      bonusExp: 35,
      bonusGold: 30,
      bonusUltCharge: 15
    },
    {
      id: 'black',
      name: 'Black (ทมิฬพิฆาตอสูร)',
      runes: ['thul', 'io', 'nef'],
      types: ['weapon'],
      typeLabels: 'อาวุธ (3 ช่อง)',
      desc: 'ดาเมจ +45%, คริติคอลดาเมจ (Crit DMG) +40%, ความอึด STA +20%',
      bonusDmg: 45,
      bonusCritDmg: 0.40,
      bonusSta: 20
    },
    {
      id: 'stealth',
      name: 'Stealth (ก้าวเงาล่องหน)',
      runes: ['tal', 'eth'],
      types: ['armor'],
      typeLabels: 'เกราะอก (2 ช่อง)',
      desc: 'เข้าสู่ Flow State ไวขึ้น 50%, ชาร์จไม้ตายไวขึ้น +25%, เจาะเกราะบอส +15%',
      bonusDmg: 15,
      bonusUltCharge: 25,
      bonusPierce: 15,
      bonusFlow: 50
    },
    {
      id: 'lore',
      name: 'Lore (เนตรพหูสูต)',
      runes: ['ort', 'sol'],
      types: ['relic', 'ring'],
      typeLabels: 'เครื่องราง / แหวน (2 ช่อง)',
      desc: 'ดูดซับ EXP เพิ่มขึ้น +35%, ดาเมจ +15%, เกจไม้ตายแรงขึ้น +20%',
      bonusExp: 35,
      bonusDmg: 15,
      bonusUltDmg: 20
    },
    {
      id: 'ancients_pledge',
      name: "Ancient's Pledge (พันธสัญญาบรรพกาล)",
      runes: ['ral', 'ort', 'tal'],
      types: ['armor', 'relic'],
      typeLabels: 'เกราะอก / เครื่องราง (3 ช่อง)',
      desc: 'ปราการทมิฬ! ป้องกันคำสาปหมอกสูบเลือด, ป้องกันการสูบเกจ, ความอึด STA +35%',
      bonusSta: 35,
      bonusDmg: 15
    },
    {
      id: 'lionheart',
      name: 'Lionheart (หัวใจราชสีห์)',
      runes: ['hel', 'lum', 'fal'],
      types: ['armor'],
      typeLabels: 'เกราะอก (3 ช่อง)',
      desc: 'พลังแห่งราชสีห์คำราม! ดาเมจสุทธิ +40%, ความอึด STA +35%, คริติคอล +15%',
      bonusDmg: 40,
      bonusSta: 35,
      bonusCrit: 15
    }
  ];

  // --- Boss List Database (12 Dungeon Bosses) ---
  App.BOSS_DATABASE = [
    {
      id: 'boss_1',
      tier: 'TIER I',
      name: 'Gargoyle of the Crypt',
      avatar: '👹',
      maxHpKm: 2.00,
      desc: 'อสูรหินเฝ้าประตูสุสาน จงวิ่ง 2.00 กม. เพื่อทำลายมัน!',
      rewardExp: 2200,
      rewardGold: 260,
      gimmick: 'none'
    },
    {
      id: 'boss_2',
      tier: 'TIER II',
      name: 'Abyssal Blood Knight',
      avatar: '🤺',
      maxHpKm: 4.50,
      desc: 'อัศวินเกราะดำกระหายการต่อสู้ วิ่ง 4.50 กม. เพื่อสยบดาบโลหิต!',
      rewardExp: 5500,
      rewardGold: 600,
      gimmick: 'none'
    },
    {
      id: 'boss_2_major',
      tier: 'TIER II (MAJOR)',
      name: 'Abyssal Juggernaut: Gorgoroth',
      avatar: '🦏',
      maxHpKm: 6.50,
      desc: 'บอสใหญ่แห่งเทียร์สอง จอมพลังเกราะหนาทมิฬ ทลายเกราะเหล็กด้วย Flow State หรือ Shadow Slash!',
      rewardExp: 8500,
      rewardGold: 1200,
      gimmick: 'juggernaut'
    },
    {
      id: 'boss_3',
      tier: 'TIER III',
      name: 'Ancient Bone Dragon',
      avatar: '🐉',
      maxHpKm: 8.00,
      desc: 'มังกรกระดูกบรรพกาล วิ่งสะสม 8.00 กม. เพื่อปิดผนึกลมหายใจมรณะ!',
      rewardExp: 12000,
      rewardGold: 1300,
      gimmick: 'none'
    },
    {
      id: 'boss_4',
      tier: 'TIER IV',
      name: 'Shadow Lich: Malakor',
      avatar: '🧙‍♂️',
      maxHpKm: 12.50,
      desc: 'จอมเวทอเวจีโบราณ เมื่อเลือดต่ำกว่า 75% หมอกคำสาปจะสูบเลือดคืนหากเพซวิ่งช้ากว่า 7:30!',
      rewardExp: 21000,
      rewardGold: 2600,
      gimmick: 'mist'
    },
    {
      id: 'boss_5',
      tier: 'TIER V',
      name: 'Void Behemoth: Titan of Ruin',
      avatar: '🗿',
      maxHpKm: 18.00,
      desc: 'ไททันศิลาแห่งความว่างเปล่า เกราะหนาลดดาเมจ 45% ทลายเกราะด้วยคริติคอลหรือท่าไม้ตาย Shadow Slash!',
      rewardExp: 38000,
      rewardGold: 4800,
      gimmick: 'carapace'
    },
    {
      id: 'boss_6',
      tier: 'TIER VI',
      name: 'Abyssal Empress: Nyxaria',
      avatar: '👑',
      maxHpKm: 25.00,
      desc: 'จักรพรรดินีเงาราตรี 3 เฟส: ร่างเงาหลอก (ทลายด้วย Flow State), สนามเรโซแนนซ์ และจันทรคราสทมิฬ!',
      rewardExp: 62000,
      rewardGold: 8500,
      gimmick: 'empress'
    },
    {
      id: 'boss_7',
      tier: 'TIER VII',
      name: 'Eclipse Harbinger: Ignis-Vorax',
      avatar: '☄',
      maxHpKm: 36.00,
      desc: 'เทพอสูรเพลิงสุริยคราส เลือด 36 กม. ครึ่งแรกคลื่นความร้อนแผดเผา ครึ่งหลังระเบิดซูเปอร์โนวา ชาร์จไม้ตายไว x2!',
      rewardExp: 95000,
      rewardGold: 15000,
      gimmick: 'supernova'
    },
    {
      id: 'boss_8',
      tier: 'TIER VIII',
      name: 'Primordial Void Leviathan: Nihil-Khaos',
      avatar: '🌌',
      maxHpKm: 50.00,
      desc: 'เลเวียธานมิติอเวจีบรรพกาล เลือด 50 กม. ต่ำกว่า 50% หลุมดำดูดกลืนเกจ ต่ำกว่า 20% ซิงกูลาริตียุบตัว ดาเมจ x2.5 ในโซนสูง!',
      rewardExp: 145000,
      rewardGold: 26000,
      gimmick: 'singularity'
    },
    {
      id: 'boss_9',
      tier: 'TIER IX',
      name: 'Chrono-Abyss Overlord: Chronos-Nox',
      avatar: '⏳',
      maxHpKm: 70.00,
      desc: 'เทพอสูรบิดผันกาลเวลา เลือด 70 กม. วิ่งเพซเร็วกว่า 6:30 ทะลวงมิติดาเมจ x3! แต่หากช้ากว่า 8:00 มิติเวลาจะหมุนกลับสูบเลือดฟื้นฟู!',
      rewardExp: 220000,
      rewardGold: 40000,
      gimmick: 'chrono'
    },
    {
      id: 'boss_super',
      tier: 'TIER X',
      name: 'Cosmic Dread: Azathoth-Nox',
      avatar: '👁️‍🗨️',
      maxHpKm: 90.00,
      desc: 'เทพอสูรความว่างเปล่าบรรพกาล เลือด 90 กม.! เกราะหนาลดดาเมจ 70% สลายด้วย Shadow Slash และสูบเกจหากเพซช้ากว่า 7:00!',
      rewardExp: 350000,
      rewardGold: 70000,
      gimmick: 'superboss'
    },
    {
      id: 'boss_secret',
      tier: 'TIER EX (SECRET)',
      name: 'Primordial Void Sovereign: Ouroboros-Null',
      avatar: '🌌',
      maxHpKm: 120.00,
      desc: 'ผู้กลืนกินมิติบรรพกาล ปรากฏเฉพาะผู้พิชิตจบลูป 3 ขึ้นไป! ทลายเกราะด้วย Flow State หรือไม้ตาย และเร่งชีพจร Zone 3 เพื่อสยบการดูดกลืนพลัง!',
      rewardExp: 500000,
      rewardGold: 100000,
      gimmick: 'secretboss'
    }
  ];

  // --- 10 Special Roaming Monsters Database (Spawn <= 1 km, Engage <= 10 m, Scales with Player Level) ---
  App.ROAMING_MONSTER_DATABASE = [
    {
      id: 'rm_wisp',
      name: 'Shadow Wisp',
      thName: 'ภูตวิญญาณเร่ร่อน',
      avatar: '👻',
      mapIcon: '👻',
      rarityLabel: 'ทั่วไป',
      weight: 16,
      baseHpKm: 0.05,
      baseExp: 450,
      baseGold: 90,
      gimmick: 'wisp',
      gimmickDesc: 'วิญญาณเปราะบาง วิ่งผ่านระยะสั้นๆ สลายทันที ฟื้นเกจไม้ตาย +25%',
      rewardHint: 'เกจไม้ตาย +25% & EXP'
    },
    {
      id: 'rm_hound',
      name: 'Crypt Hound',
      thName: 'สุนัขล่าเนื้อสุสาน',
      avatar: '🐺',
      mapIcon: '🐺',
      rarityLabel: 'ทั่วไป',
      weight: 15,
      baseHpKm: 0.08,
      baseExp: 650,
      baseGold: 180,
      gimmick: 'hound',
      gimmickDesc: 'เร่งเพซเร็วกว่าเพซเฉลี่ย 0.3 นาที/กม. รับดาเมจพุ่งทะยาน x2.5!',
      rewardHint: 'เหรียญทองสูง'
    },
    {
      id: 'rm_scarab',
      name: 'Ironclad Scarab',
      thName: 'ด้วงเกราะเหล็กทมิฬ',
      avatar: '🪲',
      mapIcon: '🪲',
      rarityLabel: 'เกราะหนา',
      weight: 13,
      baseHpKm: 0.10,
      baseExp: 850,
      baseGold: 150,
      gimmick: 'scarab',
      gimmickDesc: 'เกราะเหล็กทนทานลดดาเมจ 70% แพ้ทาง Critical Hit หรือ Shadow Slash',
      rewardHint: 'การันตีหินรูน (El–Ith)'
    },
    {
      id: 'rm_leech',
      name: 'Blood Leech',
      thName: 'ปลิงดูดโลหิตอเวจี',
      avatar: '🩸',
      mapIcon: '🩸',
      rarityLabel: 'ก่อกวน',
      weight: 12,
      baseHpKm: 0.12,
      baseExp: 900,
      baseGold: 260,
      gimmick: 'leech',
      gimmickDesc: 'หากวิ่งช้ากว่าเพซ 8:00 จะดูดเกจไม้ตายคืน ต้องวิ่งต่อเนื่องเพื่อกำจัด',
      rewardHint: 'โบนัสทองคำ +150%'
    },
    {
      id: 'rm_banshee',
      name: 'Banshee of the Mist',
      thName: 'นางพรายหมอกอาถรรพ์',
      avatar: '🌫️',
      mapIcon: '🌫️',
      rarityLabel: 'คุมจังหวะ',
      weight: 11,
      baseHpKm: 0.15,
      baseExp: 1400,
      baseGold: 210,
      gimmick: 'banshee',
      gimmickDesc: 'แพ้ทางสภาวะ Flow State (โดนดาเมจ x3 เมื่อคุมเพซนิ่งสม่ำเสมอ)',
      rewardHint: 'EXP สูงพิเศษ'
    },
    {
      id: 'rm_mimic',
      name: 'Abyssal Mimic',
      thName: 'หีบปีศาจจำแลง',
      avatar: '📦',
      mapIcon: '📦',
      rarityLabel: 'กับดักสมบัติ',
      weight: 10,
      baseHpKm: 0.15,
      baseExp: 1200,
      baseGold: 320,
      gimmick: 'mimic',
      gimmickDesc: 'พรางตัวเป็นหีบสมบัติบนแผนที่! สยบได้การันตีหีบสมบัติ + อุปกรณ์',
      rewardHint: 'การันตีหีบสมบัติ +1'
    },
    {
      id: 'rm_berserker',
      name: 'Infernal Berserker',
      thName: 'นักรบคลั่งเพลิงนรก',
      avatar: '🔥',
      mapIcon: '🔥',
      rarityLabel: 'สายชีพจร',
      weight: 9,
      baseHpKm: 0.18,
      baseExp: 1600,
      baseGold: 380,
      gimmick: 'berserker',
      gimmickDesc: 'แพ้ทางชีพจร HR Zone 3–4 (ติดคริติคอล 100% ทันทีเมื่อชีพจรถึงโซน)',
      rewardHint: 'ทองก้อนโต / ลุ้นแต้มสเตตัส'
    },
    {
      id: 'rm_stalker',
      name: 'Void Stalker',
      thName: 'นักล่าเงาต่างมิติ',
      avatar: '👤',
      mapIcon: '👤',
      rarityLabel: 'ล่องหน',
      weight: 7,
      baseHpKm: 0.20,
      baseExp: 2000,
      baseGold: 420,
      gimmick: 'stalker',
      gimmickDesc: 'จะวาร์ปหนีหากปราบไม่ทันภายใน 40 วินาที ต้องเร่งสปรินต์ปิดฉาก!',
      rewardHint: 'หินรูนหายาก (Shael–Hel)'
    },
    {
      id: 'rm_golem',
      name: 'Cursed Totem Golem',
      thName: 'โกเล็มเสาอาถรรพ์',
      avatar: '🗿',
      mapIcon: '🗿',
      rarityLabel: 'มินิบอส',
      weight: 5,
      baseHpKm: 0.30,
      baseExp: 2800,
      baseGold: 550,
      gimmick: 'golem',
      gimmickDesc: 'เฝ้าจุดยุทธศาสตร์ โค่นสำเร็จเปิดบัฟ Overdrive (ทอง x2) ทันที 60 วิ!',
      rewardHint: 'บัฟ Overdrive 60 วิ + หินรูน'
    },
    {
      id: 'rm_archdemon',
      name: 'Arch-Demon Harbinger',
      thName: 'จอมมารผู้ส่งสาร',
      avatar: '😈',
      mapIcon: '😈',
      rarityLabel: 'หายากสุด',
      weight: 2,
      baseHpKm: 0.50,
      baseExp: 5000,
      baseGold: 1200,
      gimmick: 'archdemon',
      gimmickDesc: 'มีเกราะมิติลดดาเมจ 50% ทลายด้วย Shadow Slash หรือความเร็วสูง!',
      rewardHint: 'การันตีอุปกรณ์ Epic–Mythic & รูนสูง'
    }
  ];

  // --- Level Scaling Helpers for Roaming Monsters ---
  App.getRoamingMonsterScaledStats = function (template, playerLevel) {
    const lv = Math.max(1, playerLevel || 1);
    const hpMult = 1 + ((lv - 1) * 0.12);
    const rewardMult = 1 + ((lv - 1) * 0.18);
    const maxHpKm = parseFloat((template.baseHpKm * hpMult).toFixed(3));
    const rewardExp = Math.floor(template.baseExp * rewardMult);
    const rewardGold = Math.floor(template.baseGold * rewardMult);
    return { level: lv, maxHpKm, rewardExp, rewardGold };
  };

  App.getBossMaxHp = function (bossIndex, loopCycle = 0) {
    const base = App.BOSS_DATABASE[bossIndex].maxHpKm;
    return parseFloat((base * (1 + (loopCycle * 0.15))).toFixed(2));
  };

  App.getTitleForLevel = function (level) {
    if (level >= 80) return 'Ouroboros God Sovereign';
    if (level >= 75) return 'Cosmic Void Exterminator';
    if (level >= 60) return 'Eternal Sovereign of Time & Void';
    if (level >= 50) return 'Lord of the Primordial Void';
    if (level >= 45) return 'Eclipse God Slayer';
    if (level >= 35) return 'Abyssal Sovereign Emperor';
    if (level >= 30) return 'Void Overlord';
    if (level >= 25) return 'Shadow Sovereign';
    if (level >= 20) return 'Dread Champion';
    if (level >= 15) return 'Abyssal Dreadnought';
    if (level >= 10) return 'Abyss Stalker';
    if (level >= 5) return 'Crypt Slayer';
    return 'Shadow Initiate';
  };

  App.generateDailyQuests = function () {
    return [
      { id: 'dq_dist', name: 'สำรวจอเวจีลึก: สะสมระยะทาง 8.0 กม.', target: 8.0, current: 0.0, unit: 'กม.', rewardExp: 320000, rewardGold: 35000, claimed: false },
      { id: 'dq_time', name: 'สมาธิจิตนักล่า: วิ่งสะสมเวลา 45 นาที', target: 2700, current: 0, unit: 'วินาที', rewardExp: 380000, rewardGold: 40000, claimed: false },
      { id: 'dq_cal', name: 'ผลาญพลังเวท: เผาผลาญ 550 kcal', target: 550, current: 0, unit: 'kcal', rewardExp: 300000, rewardGold: 32000, claimed: false },
      { id: 'dq_boss', name: 'ล่าสังหารห้าชีพ: โค่นบอส 5 ตัว', target: 5, current: 0, unit: 'ตัว', rewardExp: 500000, rewardGold: 65000, claimed: false },
      { id: 'dq_crit', name: 'สังหารจุดตาย: โจมตีคริติคอล 60 ครั้ง', target: 60, current: 0, unit: 'ครั้ง', rewardExp: 420000, rewardGold: 45000, claimed: false },
      { id: 'dq_frenzy', name: 'คลั่งศึกอเวจี: รักษาสภาวะ Berserk/Zone 3 นาน 10 นาที', target: 600, current: 0, unit: 'วินาที', rewardExp: 450000, rewardGold: 48000, claimed: false },
      { id: 'dq_ult', name: 'เพลงดาบเงาปลิดชีพ: ร่าย Shadow Slash 10 ครั้ง', target: 10, current: 0, unit: 'ครั้ง', rewardExp: 360000, rewardGold: 38000, claimed: false }
    ];
  };

  App.generateAchievements = function () {
    return [
      { id: 'ach_first', name: 'First Blood (การล่าครั้งแรก)', desc: 'จบเซสชันการล่าสำเร็จ 1 รอบ', target: 1, current: 0, unit: 'รอบ', rewardExp: 1000, rewardGold: 200, claimed: false },
      { id: 'ach_dist10', name: 'Shadow Nomad (เส้นทาง 10K)', desc: 'สะสมระยะทางรวมแตะ 10.0 กม.', target: 10.0, current: 0.0, unit: 'กม.', rewardExp: 3500, rewardGold: 600, claimed: false },
      { id: 'ach_dist50', name: 'Abyssal Walker (นักเดินทาง 50K)', desc: 'สะสมระยะทางรวมแตะ 50.0 กม.', target: 50.0, current: 0.0, unit: 'กม.', rewardExp: 12000, rewardGold: 2500, claimed: false },
      { id: 'ach_boss_juggernaut', name: 'Juggernaut Crusher (ผู้สยบจอมอสูรเกราะเหล็ก)', desc: 'โค่น Abyssal Juggernaut: Gorgoroth (Tier II Major)', target: 1, current: 0, unit: 'ตัว', rewardExp: 5000, rewardGold: 1000, claimed: false },
      { id: 'ach_boss_dragon', name: 'Dragon Bane (ผู้สยบมังกร)', desc: 'โค่นมังกรกระดูก Ancient Bone Dragon (Tier III)', target: 1, current: 0, unit: 'ตัว', rewardExp: 6000, rewardGold: 1200, claimed: false },
      { id: 'ach_boss_malakor', name: 'Lich Bane (ผู้สยบจอมเวท)', desc: 'โค่นจอมเวทอเวจี Shadow Lich: Malakor (Tier IV)', target: 1, current: 0, unit: 'ตัว', rewardExp: 10000, rewardGold: 2000, claimed: false },
      { id: 'ach_boss_titan', name: 'Titan Breaker (ผู้กะเทาะศิลาไททัน)', desc: 'โค่น Void Behemoth: Titan of Ruin (Tier V)', target: 1, current: 0, unit: 'ตัว', rewardExp: 16000, rewardGold: 3500, claimed: false },
      { id: 'ach_boss_empress', name: 'Eclipse Sovereign (ผู้สยบจักรพรรดินี)', desc: 'โค่น Abyssal Empress: Nyxaria (Tier VI)', target: 1, current: 0, unit: 'ตัว', rewardExp: 28000, rewardGold: 6000, claimed: false },
      { id: 'ach_boss_ignis', name: 'Harbinger Extinguisher (ผู้ดับสุริยคราส)', desc: 'โค่น Eclipse Harbinger: Ignis-Vorax (Tier VII)', target: 1, current: 0, unit: 'ตัว', rewardExp: 45000, rewardGold: 10000, claimed: false },
      { id: 'ach_boss_leviathan', name: 'Void Leviathan Slayer (ผู้ดับชีพเลเวียธาน)', desc: 'โค่น Primordial Void Leviathan: Nihil-Khaos (Tier VIII)', target: 1, current: 0, unit: 'ตัว', rewardExp: 60000, rewardGold: 15000, claimed: false },
      { id: 'ach_boss_chronos', name: 'Chrono Overlord Slayer (ผู้ดับมิติเวลา)', desc: 'โค่น Chrono-Abyss Overlord: Chronos-Nox (Tier IX)', target: 1, current: 0, unit: 'ตัว', rewardExp: 100000, rewardGold: 25000, claimed: false },
      { id: 'ach_dist100', name: 'Century Stalker (นักล่าร้อยกิโล)', desc: 'สะสมระยะทางรวมแตะ 100.0 กม.', target: 100.0, current: 0.0, unit: 'กม.', rewardExp: 35000, rewardGold: 7000, claimed: false },
      { id: 'ach_dist250', name: 'Abyssal Ultramarathon (เส้นทางอเวจี 250K)', desc: 'สะสมระยะทางรวมแตะ 250.0 กม.', target: 250.0, current: 0.0, unit: 'กม.', rewardExp: 90000, rewardGold: 20000, claimed: false },
      { id: 'ach_boss25', name: 'Grand Demon Slayer (ผู้พิชิตบอส 25 ตน)', desc: 'โค่นบอสรวมสะสม 25 ตัว', target: 25, current: 0, unit: 'ตัว', rewardExp: 40000, rewardGold: 8000, claimed: false },
      { id: 'ach_boss50', name: 'Scourge of the Void (มหาอสูรพิฆาต 50 ตน)', desc: 'โค่นบอสรวมสะสม 50 ตัว', target: 50, current: 0, unit: 'ตัว', rewardExp: 100000, rewardGold: 25000, claimed: false },
      { id: 'ach_berserk_time', name: 'Berserk Master (นักรบคลั่งผู้ช่ำชอง)', desc: 'รักษาสภาวะ Berserk Frenzy รวม 30 นาที (1,800 วิ)', target: 1800, current: 0, unit: 'วินาที', rewardExp: 30000, rewardGold: 6000, claimed: false },
      { id: 'ach_ult_cast', name: 'Blade Tempest (พายุคมดาบเงา)', desc: 'ปลดปล่อยท่าไม้ตาย Shadow Slash ครบ 40 ครั้ง', target: 40, current: 0, unit: 'ครั้ง', rewardExp: 45000, rewardGold: 9000, claimed: false },
      { id: 'ach_goblin_catch', name: 'Goblin Executioner (ผู้ล้างบางก็อบลิน)', desc: 'สยบโกบลินเงาหลบหนีสำเร็จ 8 ครั้ง', target: 8, current: 0, unit: 'ครั้ง', rewardExp: 32000, rewardGold: 6500, claimed: false },
      { id: 'ach_flow_count', name: 'Transcendental Flow (สมาธิไร้ขอบเขต)', desc: 'เข้าสู่สถานะ Flow State สะสม 20 ครั้ง', target: 20, current: 0, unit: 'ครั้ง', rewardExp: 30000, rewardGold: 6000, claimed: false },
      { id: 'ach_single_long', name: 'Single-Run Behemoth (การล่าทรหด)', desc: 'จบการวิ่งในรอบเดียวได้ระยะทางมากกว่า 15.0 กม.', target: 15.0, current: 0.0, unit: 'กม.', rewardExp: 55000, rewardGold: 12000, claimed: false },
      { id: 'ach_superboss', name: 'Super Boss Annihilator (ผู้สยบเทพอสูรบรรพกาล)', desc: 'โค่น Cosmic Dread: Azathoth-Nox (Super Boss) สำเร็จ', target: 1, current: 0, unit: 'ตัว', rewardExp: 250000, rewardGold: 60000, claimed: false },
      { id: 'ach_secretboss', name: 'Primordial Void Conqueror (ผู้พิชิตมหาอสูรลับบรรพกาล)', desc: 'โค่น Primordial Void Sovereign: Ouroboros-Null (Tier EX Secret Boss)', target: 1, current: 0, unit: 'ตัว', rewardExp: 600000, rewardGold: 150000, claimed: false },
      { id: 'ach_dist500', name: 'Abyssal Half-Marathon Legend (ตำนาน 500K อเวจี)', desc: 'สะสมระยะทางรวมตลอดกาลแตะ 500.0 กม.', target: 500.0, current: 0.0, unit: 'กม.', rewardExp: 200000, rewardGold: 50000, claimed: false },
      { id: 'ach_dist1000', name: 'Titan of the Thousand Leagues (จอมคนพันกิโลเมตร)', desc: 'สะสมระยะทางรวมตลอดกาลแตะ 1,000.0 กม.', target: 1000.0, current: 0.0, unit: 'กม.', rewardExp: 500000, rewardGold: 120000, claimed: false },
      { id: 'ach_boss100', name: 'Centurion Slayer (มหาผู้พิชิตร้อยอสูร)', desc: 'โค่นบอสรวมสะสม 100 ตัว', target: 100, current: 0, unit: 'ตัว', rewardExp: 250000, rewardGold: 60000, claimed: false },
      { id: 'ach_single_halfmarathon', name: 'Half Marathon Ascendant (สัจธรรมฮาล์ฟมาราธอน)', desc: 'จบการวิ่งในรอบเดียวได้ระยะทาง 21.1 กม. ขึ้นไป', target: 21.1, current: 0.0, unit: 'กม.', rewardExp: 150000, rewardGold: 35000, claimed: false },
      { id: 'ach_single_marathon', name: 'Full Marathon Conqueror (ผู้พิชิตฟูลมาราธอน)', desc: 'จบการวิ่งในรอบเดียวได้ระยะทาง 42.195 กม. ขึ้นไป', target: 42.195, current: 0.0, unit: 'กม.', rewardExp: 350000, rewardGold: 85000, claimed: false },
      { id: 'ach_loop_master', name: 'Loop Dimension Master (จอมวนลูปอเวจี)', desc: 'เข้าสู่สังเวียน Awakened Loop 3 ขึ้นไป', target: 3, current: 0, unit: 'ลูป', rewardExp: 180000, rewardGold: 45000, claimed: false },
      { id: 'ach_streak14', name: 'Iron Will Discipline (วินัยเหล็กกล้า 14 วัน)', desc: 'ทำสถิติออกล่าต่อเนื่อง Streak ครบ 14 วัน', target: 14, current: 0, unit: 'วัน', rewardExp: 120000, rewardGold: 30000, claimed: false },
      { id: 'ach_ult150', name: 'Shadow Sword Deity (เทพดาบเงาพันเล่ม)', desc: 'ปลดปล่อยท่าไม้ตาย Shadow Slash รวม 150 ครั้ง', target: 150, current: 0, unit: 'ครั้ง', rewardExp: 160000, rewardGold: 40000, claimed: false },
      { id: 'ach_goblin25', name: "Goblin's Worst Nightmare (ฝันร้ายแห่งเผ่าโกบลิน)", desc: 'สยบโกบลินเงาหลบหนีสำเร็จ 25 ครั้ง', target: 25, current: 0, unit: 'ครั้ง', rewardExp: 140000, rewardGold: 35000, claimed: false },
      { id: 'ach_flow60', name: 'Zenith Flow Master (มหาผู้ตรัสรู้โฟลว์สเตท)', desc: 'เข้าสู่สภาวะ Flow State สะสม 60 ครั้ง', target: 60, current: 0, unit: 'ครั้ง', rewardExp: 130000, rewardGold: 32000, claimed: false }
    ];
  };

  App.ITEM_NAMES = {
    weapon: ['ดาบสั้น', 'ดาบใหญ่ทมิฬ', 'เคียวมรณะ', 'ดาบโบราณ', 'หอกพิฆาตมิติ'],
    armor: ['เสื้อเกราะหนัง', 'เกราะเหล็กอสูร', 'ผ้าคลุมวิญญาณ', 'เกราะเพลทอเวจี', 'เกราะมหาอสูร'],
    boots: ['รองเท้าก้าวเงา', 'รองเท้าเกราะทมิฬ', 'รองเท้าลมกรด', 'สนับแข้งสายลม', 'รองเท้าล่องหน'],
    relic: ['แหวนวิญญาณ', 'จี้หยดโลหิต', 'เครื่องรางตาเหยี่ยว', 'หินมนตราโบราณ', 'ดวงใจมิติอเวจี'],
    ring: ['แหวนเพลิงอเวจี', 'วงแหวนเงาบรรพกาล', 'แหวนวิญญาณสูบดวงดาว', 'ธำมรงค์มิติว่างเปล่า', 'แหวนราชาไร้นาม'],
    bracelet: ['กำไลทมิฬ', 'กำไลผลึกวิญญาณ', 'กำไลอัสนีบาต', 'กำไลสายฟ้าราตรี', 'กำไลมิติว่างเปล่า']
  };

  App.createDefaultState = function () {
    const bestiaryInit = {};
    App.BOSS_DATABASE.forEach(b => {
      bestiaryInit[b.id] = { kills: 0, name: b.name };
    });
    App.ROAMING_MONSTER_DATABASE.forEach(rm => {
      bestiaryInit[rm.id] = { kills: 0, name: rm.name };
    });

    return {
      playerName: 'Abyss Stalker',
      level: 1,
      title: 'Shadow Initiate',
      currentExp: 0,
      nextExp: 1000,
      gold: 0,
      statPoints: 0,
      ultimateCharge: 0,
      stats: { str: 10, sta: 10, agi: 10 },
      upgrades: { blade: 0, charm: 0, eye: 0, elixir: 0, bag: 0 },
      upgradeFailStreak: { blade: 0, charm: 0, eye: 0 },
      equipment: { weapon: null, armor: null, boots: null, relic: null, ring: null, bracelet: null },
      inventory: [],
      runeStash: {
        el: 0, eld: 0, tir: 0, nef: 0, eth: 0, ith: 0, tal: 0, ral: 0, ort: 0, thul: 0,
        amn: 0, sol: 0, shael: 0, dol: 0, hel: 0, io: 0, lum: 0, ko: 0, fal: 0
      },
      bestiary: bestiaryInit,
      roamingMonsters: [],
      chestsAvailable: 0,
      streak: { count: 1, lastDate: new Date().toDateString() },
      bossIndex: 0,
      bossHpRemain: 2.00,
      bossLoopCycle: 0,
      totalDistanceKm: 0.0,
      maxHr: 178,
      lastBleDeviceName: null,
      lastDailyDate: new Date().toDateString(),
      isHistoryCollapsed: false,
      hideCompletedAchievements: false,
      isClaimedAchAccordionOpen: false,
      autoCastMode: 'off',
      statsTrack: {
        berserkSeconds: 0,
        ultCastCount: 0,
        goblinCaughtCount: 0,
        flowStateCount: 0,
        roamingKills: 0
      },
      career: {
        totalRuns: 0,
        totalDistanceKm: 0.0,
        totalSeconds: 0,
        totalBossDefeated: 0,
        longestRunKm: 0.0
      },
      dailyQuests: App.generateDailyQuests(),
      achievements: App.generateAchievements()
    };
  };
})();
