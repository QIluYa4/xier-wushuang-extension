
function disableAllEquip(target) {
    const cards = target.getCards("e");
    if (cards && cards.length) {
        target.discard(cards);
    }

    // 保存原有装备栏状态：1.11.6 中这是对象，不能调用 slice()
    const orig = { ...(target.disabledSlots || {}) };
    target.storage.装填_废装备栏_原状 = orig;

    // 废除全部五个装备栏
    target.disableEquip({
        slots: ["equip1", "equip2", "equip3", "equip4", "equip5"],
        all: true,
    });

    target.storage.装填_废装备栏_轮次 = 3;
    target.addSkill("装填_废装备栏");
    target.markSkill("装填_废装备栏");
}
