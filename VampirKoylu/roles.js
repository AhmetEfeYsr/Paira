// roles.js
// Vampir Köylü Role Definitions

const ROLES = {
    KOYLU: { icon: '🧑‍🌾', name: 'Köylü', team: 'KOY', hasNightAction: false, hasDayAction: false, desc: 'Sıradan bir köylüsün. Tartışarak vampirleri bulmaya çalış.' },
    DOKTOR: { icon: '⚕️', name: 'Doktor', team: 'KOY', hasNightAction: true, hasDayAction: false, desc: 'Her gece birini iyileştirip korursun. Aynı kişiyi arka arkaya koruyamazsın. Kendini yalnızca 1 kez koruyabilirsin.' },
    INTIKAMCI: { icon: '🗡️', name: 'İntikamcı', team: 'KOY', hasNightAction: false, hasDayAction: true, desc: 'İlk gün birini intikam hedefi seçersin. Eğer asılırsan, hedefin de seninle birlikte ölür.' },
    UYURGEZER: { icon: '🚶‍♂️', name: 'Uyurgezer', team: 'KOY', hasNightAction: true, hasDayAction: false, desc: 'Her gece birinin evine gidersin. Bir vampirin evine gidersen ölürsün.' },
    GOZCU: { icon: '👁️', name: 'Gözcü', team: 'KOY', hasNightAction: true, hasDayAction: false, desc: 'Her gece birinin evini izlersin. O gece eve kim geldiyse öğrenirsin.' },
    DEDEKTIF: { icon: '🔍', name: 'Dedektif', team: 'KOY', hasNightAction: true, hasDayAction: false, desc: 'Her gece 2 kişi seçersin. Bu iki kişinin aynı takımda olup olmadığını öğrenirsin.' },
    SERIF: { icon: '🤠', name: 'Şerif', team: 'KOY', hasNightAction: false, hasDayAction: true, maxUses: 1, desc: 'Gündüz birini vurabilirsin (1 kullanım). Masum birini vurursan vicdan azabından ölürsün.' },
    TUZAKCI: { icon: '🪤', name: 'Tuzakçı', team: 'KOY', hasNightAction: true, hasDayAction: false, desc: 'Her gece birinin evine tuzak kurarsın. O eve gelen herkesin aksiyonu iptal olur.' },
    POLIS: { icon: '👮', name: 'Polis', team: 'KOY', hasNightAction: true, hasDayAction: false, desc: 'Her gece birini takip eder ve bloklar. Bloklanmış kişinin gece aksiyonu iptal olur.' },
    IZCI: { icon: '🐾', name: 'İzci', team: 'KOY', hasNightAction: true, hasDayAction: false, desc: 'Her gece birinin rolünü öğrenirsin.' },
    DELI: { icon: '🤪', name: 'Deli', team: 'KOY', hasNightAction: true, hasDayAction: false, desc: 'Gözcü, İzci veya Dedektif gibi davranırsın ama aldığın bilgiler tamamen rastgeledir.' },
    
    VAMPIR: { icon: '🧛‍♂️', name: 'Sıradan Vampir', team: 'VAMPIR', hasNightAction: true, hasDayAction: false, desc: 'Her gece diğer vampirlerle birlikte bir kurban seçersin.' },
    DRACULA: { icon: '🦇', name: 'Dracula', team: 'VAMPIR', hasNightAction: true, hasDayAction: false, desc: 'Vampirsin ama İzci ve Dedektif seni köylü olarak görür.' },
    VAMPIR_IZCISI: { icon: '🐺', name: 'Vampir İzcisi', team: 'VAMPIR', hasNightAction: true, hasDayAction: false, desc: 'Vampirsin. Tuzaklara ve polis bloğuna bağışıksın.' },
    PROFESYONEL: { icon: '🎯', name: 'Profesyonel', team: 'VAMPIR', hasNightAction: true, hasDayAction: false, maxUses: 1, desc: 'Vampirsin. Hedefin doktor korumasını bile deler (1 kullanım).' },
    ZEHIRLI: { icon: '🧪', name: 'Zehirli', team: 'VAMPIR', hasNightAction: true, hasDayAction: false, maxUses: 1, desc: 'Vampirsin. Bir kişiyi zehirlersin; ertesi gece tedavi edilmezse ölür (1 kullanım).' },
    
    SOYTARI: { icon: '🤡', name: 'Soytarı', team: 'TARAFSIZ', hasNightAction: false, hasDayAction: false, desc: 'Tek amacın oylamada asılmak. Asılırsan kazanırsın!' },
    HIRSIZ: { icon: '🦹', name: 'Hırsız', team: 'TARAFSIZ', hasNightAction: true, hasDayAction: false, desc: 'İlk gece birini seçersin. Hedefin ölürse, onun rolünü ve takımını devralırsın.' },
    KUNDAKCI: { icon: '🔥', name: 'Kundakçı', team: 'TARAFSIZ', hasNightAction: true, hasDayAction: false, desc: 'Her gece birini benzinle ıslat. Kendini seçersen ıslatılmış herkes yanar.' },
    SERI_KATIL: { icon: '🔪', name: 'Seri Katil', team: 'TARAFSIZ', hasNightAction: true, hasDayAction: false, desc: 'Her gece birini öldürürsün. Polis seni bloklamaya çalışırsa başarısız olur. Son hayatta kalan ol.' },

    // Rastgele Roller (Sadece lobi aşamasında görünürler, oyun başlarken gerçek rollere dönüşürler)
    RASTGELE_HERHANGI: { icon: '🎲', name: 'Rastgele Rol', team: 'RASTGELE', isRandom: true, desc: 'Tüm roller arasından rastgele bir rol atanır.' },
    RASTGELE_IYI: { icon: '🎲', name: 'Rastgele İyi Rol', team: 'RASTGELE', isRandom: true, desc: 'Sıradan Köylü HARİÇ tüm Köylü rolleri arasından rastgele bir rol atanır.', uiColor: 'var(--success)' },
    RASTGELE_KOTU: { icon: '🎲', name: 'Rastgele Kötü Rol', team: 'RASTGELE', isRandom: true, desc: 'Tüm Vampir rolleri arasından rastgele bir rol atanır.', uiColor: 'var(--danger)' },
    RASTGELE_NOTR: { icon: '🎲', name: 'Rastgele Nötr Rol', team: 'RASTGELE', isRandom: true, desc: 'Tüm Tarafsız roller arasından rastgele bir rol atanır.', uiColor: '#3b82f6' }
};
