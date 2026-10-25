import { lib, game, ui, get, ai, _status } from "noname";

const BULLET_NAMES = {
    heart: "爆炸弹",
    spade: "空尖弹",
    diamond: "凝滞弹",
    club: "麻醉弹",
};

const BULLET_SUITS = ["heart", "spade", "diamond", "club"];

function ensureBulletStorage(player) {
    if (!player.storage.弹头_存量) {
        player.storage.弹头_存量 = {
            heart: 0,
            spade: 0,
            diamond: 0,
            club: 0,
        };
    }
    if (!player.storage.装填_记录) {
        player.storage.装填_记录 = {
            heart: 0,
            spade: 0,
            diamond: 0,
            club: 0,
        };
    }
}

function hasAnyBullet(player) {
    ensureBulletStorage(player);
    return BULLET_SUITS.some(
        suit => player.storage.弹头_存量[suit] > 0
    );
}

function refreshBulletMark(player) {
    ensureBulletStorage(player);
    if (!player.hasSkill("装填_标记")) {
        player.addSkill("装填_标记");
    }
    player.markSkill("装填_标记");
}

function bulletCountText(player) {
    ensureBulletStorage(player);
    const bullets = player.storage.弹头_存量;
    const records = player.storage.装填_记录;

    return BULLET_SUITS.map(suit => {
        return `${BULLET_NAMES[suit]}：${bullets[suit]}/1（记录${records[suit]}/2）`;
    }).join("\n");
}

function disableAllEquip(target) {
    const cards = target.getCards("e");
    if (cards && cards.length) {
        target.discard(cards);
    }

    const orig = (target.disabledSlots || []).slice();
    target.storage.装填_废装备栏_原状 = orig;

    target.disableEquip(1, 2, 3, 4, 5);
    target.storage.装填_废装备栏_轮次 = 3;

    target.addSkill("装填_废装备栏");
    target.markSkill("装填_废装备栏");
}

function addBulletTarget(target, card) {
    target.addSkill("装填_弹头命中");
}

function clearBulletTargets(card) {
    if (!card || !card._装填_目标列表) return;

    for (const target of card._装填_目标列表) {
        if (!target) continue;
        target.removeSkill("装填_弹头命中");
    }

    delete card._装填_目标列表;
}

export const type = "extension";

export default function () {
    return {
        name: "汐儿武将包",
        editable: true,
        connect: false,

        arenaReady: function () {},
        content: function (config, pack) {},
        prepare: function () {},
        precontent: function (config) {},
        help: {},
        config: {},

        package: {
            character: {
                character: {
                    "小萝": [
                        "female",
                        "shen",
                        3,
                        ["天工", "装填", "上膛", "备战"],
                        [],
                    ],
                },
                translate: {
                    "小萝": "小萝",
                    "汐儿武将包": "汐儿武将包",
                },
            },

            card: {
                card: {},
                translate: {},
                list: [],
            },

            skill: {
                skill: {
                    /* ==================== 天工 ==================== */
                    "天工": {
                        charlotte: true,
                        persevereSkill: true,

                        trigger: {
                            source: "damageAfter",
                        },

                        forced: true,
                        locked: true,
                        priority: 100,

                        filter: function (event, player) {
                            return (
                                event.num > 0 &&
                                event.player &&
                                event.player.isAlive() &&
                                !event._天工_trigger
                            );
                        },

                        content: async function (event, trigger, player) {
                            const target = trigger.player;
                            const num = trigger.num;

                            if (!target || !target.isAlive()) return;

                            trigger._天工_trigger = true;

                            await target.damage(
                                num,
                                "nosource",
                                trigger.nature
                            );

                            if (target.isAlive()) {
                                if (!target.hasSkill("天工_封技")) {
                                    target.addTempSkill(
                                        "天工_封技",
                                        { player: "phaseEnd" }
                                    );
                                }

                                target.markSkill("天工_封技");
                            }

                            player.popup(
                                `天工：追加${num}点无来源伤害`
                            );
                        },

                        intro: {
                            content:
                                "持恒技，你造成伤害后，对受伤角色造成等量无来源伤害；其非锁定技失效直到其回合结束。",
                        },
                    },

                    "天工_封技": {
                        charlotte: true,
                        mark: true,
                        marktext: "封",

                        init: function (player, skill) {
                            player.addSkillBlocker(skill);
                        },

                        onremove: function (player, skill) {
                            player.removeSkillBlocker(skill);
                        },

                        skillBlocker: function (skill, player) {
                            const info = get.info(skill);
                            if (!info) return false;

                            return (
                                !info.persevereSkill &&
                                !info.charlotte &&
                                !get.is.locked(skill, player)
                            );
                        },

                        intro: {
                            content: "非锁定技失效。",
                        },

                        sub: true,
                        sourceSkill: "天工",
                    },

                    /* ==================== 装填 ==================== */
                    "装填": {
                        charlotte: true,

                        trigger: {
                            global: ["loseAsyncAfter"],
                        },

                        forced: true,
                        locked: true,
                        priority: 100,

                        filter: function (event, player) {
                            const evt = event.getl(player);
                            return !!(evt && evt.hs && evt.hs.length);
                        },

                        content: async function (event, trigger, player) {
                            ensureBulletStorage(player);

                            const evt = trigger.getl(player);
                            const lostHandCards = evt.hs || [];

                            for (const card of lostHandCards) {
                                const suit = get.suit(card);

                                if (!BULLET_SUITS.includes(suit)) {
                                    continue;
                                }

                                if (
                                    player.storage.弹头_存量[suit] >= 1
                                ) {
                                    continue;
                                }

                                player.storage.装填_记录[suit]++;

                                if (
                                    player.storage.装填_记录[suit] >= 2
                                ) {
                                    player.storage.装填_记录[suit] = 0;
                                    player.storage.弹头_存量[suit] = 1;

                                    player.popup(
                                        `装填：获得${BULLET_NAMES[suit]}`
                                    );
                                }
                            }

                            refreshBulletMark(player);
                        },

                        intro: {
                            content:
                                "当你以任意方式失去手牌时，记录失去牌的花色。每凑够2张同花色，获得1枚对应弹药，每种最多储存1枚。红桃：爆炸弹；黑桃：空尖弹；方片：凝滞弹；梅花：麻醉弹。",
                        },
                    },

                    "装填_标记": {
                        charlotte: true,
                        mark: true,
                        marktext: "弹",

                        intro: {
                            content: function (storage, player) {
                                return bulletCountText(player);
                            },
                        },

                        sub: true,
                        sourceSkill: "装填",
                    },

                    /* ==================== 上膛 ==================== */
                    "上膛": {
                        trigger: {
                            player: "useCard",
                        },

                        forced: false,
                        priority: 100,

                        filter: function (event, player) {
                            return (
                                event.card &&
                                event.card.name === "sha" &&
                                hasAnyBullet(player) &&
                                event.targets &&
                                event.targets.length > 0
                            );
                        },

                        content: async function (event, trigger, player) {
                            ensureBulletStorage(player);

                            const bullets = player.storage.弹头_存量;
                            const options = [];

                            if (bullets.heart > 0) {
                                options.push("爆炸弹");
                            }
                            if (bullets.spade > 0) {
                                options.push("空尖弹");
                            }
                            if (bullets.diamond > 0) {
                                options.push("凝滞弹");
                            }
                            if (bullets.club > 0) {
                                options.push("麻醉弹");
                            }

                            if (!options.length) return;

                            options.push("取消");

                            const result = await player
                                .chooseControl(options)
                                .set(
                                    "prompt",
                                    "【上膛】：选择消耗一枚弹药强化此【杀】"
                                )
                                .forResult();

                            if (
                                !result.control ||
                                result.control === "取消"
                            ) {
                                return;
                            }

                            const choice = result.control;
                            const card = trigger.card;
                            const targets = (trigger.targets || []).slice();

                            let suit = null;

                            if (choice === "爆炸弹") suit = "heart";
                            if (choice === "空尖弹") suit = "spade";
                            if (choice === "凝滞弹") suit = "diamond";
                            if (choice === "麻醉弹") suit = "club";

                            if (!suit || bullets[suit] <= 0) return;

                            // 消耗弹药。
                            bullets[suit] = 0;
                            player.storage.装填_记录[suit] = 0;

                            // 记录当前强化杀的弹头类型和目标。
                            card._装填_弹药类型 = choice;
                            card._装填_已结算目标 = [];
                            card._装填_目标列表 = targets;

                            // 为目标添加临时结算监听。
                            for (const target of targets) {
                                if (target && target.isAlive()) {
                                    addBulletTarget(target, card);
                                }
                            }

                            player.addSkill("装填_清理弹头");

                            refreshBulletMark(player);
                            player.popup(`上膛：${choice}`);
                        },

                        intro: {
                            content:
                                "当你使用【杀】时，可消耗1枚储存的弹药强化此【杀】。爆炸弹：造成伤害后废除目标装备区三回合；空尖弹：此【杀】造成伤害后，目标体力上限-1；凝滞弹：造成伤害后，目标本轮不能使用牌且不能响应牌；麻醉弹：造成伤害后，目标翻面。",
                        },
                    },

                    /* ==================== 弹药命中结算 ==================== */
                    "装填_弹头命中": {
                        charlotte: true,

                        trigger: {
                            player: "damageEnd",
                        },

                        forced: true,
                        priority: 100,

                        filter: function (event, player) {
                            const card = event.card;

                            if (!card || !card._装填_弹药类型) {
                                return false;
                            }

                            if (!card._装填_目标列表) return false;

                            if (!card._装填_目标列表.includes(player)) {
                                return false;
                            }

                            if (event.num <= 0) return false;

                            const done = card._装填_已结算目标 || [];

                            return !done.includes(player.playerid);
                        },

                        content: async function (event, trigger, player) {
                            const card = trigger.card;
                            if (!card) return;

                            if (!card._装填_已结算目标) {
                                card._装填_已结算目标 = [];
                            }

                            if (
                                card._装填_已结算目标.includes(
                                    player.playerid
                                )
                            ) {
                                return;
                            }

                            card._装填_已结算目标.push(player.playerid);

                            const type = card._装填_弹药类型;

                            if (type === "爆炸弹") {
                                disableAllEquip(player);
                                player.popup("爆炸弹：装备区废除三回合");
                            }

                            if (type === "空尖弹") {
                                if (player.isAlive()) {
                                    await player.loseMaxHp(1);
                                }

                                player.popup("空尖弹：体力上限-1");
                            }

                            if (type === "凝滞弹") {
                                player.addTempSkill(
                                    "装填_凝滞",
                                    { global: "roundStart" }
                                );

                                player.popup(
                                    "凝滞弹：本轮无法使用牌或响应"
                                );
                            }

                            if (type === "麻醉弹") {
                                player.turnOver();
                                player.popup("麻醉弹：翻面");
                            }
                        },

                        intro: {
                            content:
                                "强化后的【杀】实际造成伤害时，结算对应弹药效果。",
                        },

                        sub: true,
                        sourceSkill: "上膛",
                    },

                    /* 凝滞弹：本轮不能使用牌，也不能响应牌 */
                    "装填_凝滞": {
                        charlotte: true,
                        mark: true,
                        marktext: "凝",

                        mod: {
                            cardEnabled: function (card, player) {
                                return false;
                            },

                            cardRespondable: function (card, player) {
                                return false;
                            },

                            cardEnabled2: function (card, player) {
                                return false;
                            },
                        },

                        intro: {
                            content: "本轮不能使用牌，也不能响应牌。",
                        },

                        sub: true,
                        sourceSkill: "上膛",
                    },

                    /* 爆炸弹：装备区废除三回合 */
                    "装填_废装备栏": {
                        charlotte: true,
                        mark: true,
                        marktext: "废",

                        trigger: {
                            player: "phaseBegin",
                        },

                        forced: true,
                        priority: 100,

                        content: async function (event, trigger, player) {
                            let round =
                                player.storage.装填_废装备栏_轮次 || 0;

                            round--;

                            if (round <= 0) {
                                player.removeSkill("装填_废装备栏");
                                player.popup("爆炸弹：装备栏恢复");
                            } else {
                                player.storage.装填_废装备栏_轮次 = round;
                            }
                        },

                        intro: {
                            content: function (storage, player) {
                                return `装备区废除，剩余${player.storage.装填_废装备栏_轮次 || 0}回合。`;
                            },
                        },

                        onremove: function (player) {
                            const orig =
                                player.storage.装填_废装备栏_原状 || [];

                            for (let i = 1; i <= 5; i++) {
                                if (!orig.includes(i)) {
                                    player.enableEquip(i);
                                }
                            }

                            delete player.storage.装填_废装备栏_原状;
                            delete player.storage.装填_废装备栏_轮次;
                        },

                        sub: true,
                        sourceSkill: "上膛",
                    },

                    /* 使用强化杀后，清理临时命中监听 */
                    "装填_清理弹头": {
                        charlotte: true,

                        trigger: {
                            player: "useCardAfter",
                        },

                        forced: true,
                        popup: false,

                        filter: function (event, player) {
                            return !!(
                                event.card &&
                                event.card._装填_弹药类型
                            );
                        },

                        content: async function (event, trigger, player) {
                            const card = trigger.card;

                            clearBulletTargets(card);

                            delete card._装填_弹药类型;
                            delete card._装填_已结算目标;
                        },

                        sub: true,
                        sourceSkill: "上膛",
                    },

                    /* ==================== 备战 ==================== */
                    "备战": {
                        trigger: {
                            player: "phaseBegin",
                        },

                        filter: function (event, player) {
                            return player.isAlive() && !player.isOut();
                        },

                        priority: 100,

                        content: async function (event, trigger, player) {
                            const result = await player
                                .chooseBool("是否发动【备战】？")
                                .set(
                                    "prompt",
                                    "发动后跳过摸牌、出牌、弃牌阶段，回复1点体力，摸3张牌，并补满所有弹药。"
                                )
                                .forResult();

                            if (!result.bool) {
                                player.removeSkill("备战_避险");
                                player.removeSkill("备战_移出");

                                if (player.isOut()) {
                                    player.in(true);
                                    player.classList.remove("out");
                                }

                                player.popup("取消备战");
                                return;
                            }

                            player.removeSkill("备战_避险");
                            player.removeSkill("备战_移出");

                            if (player.isOut()) {
                                player.in(true);
                                player.classList.remove("out");
                            }

                            player.skip("phaseDraw");
                            player.skip("phaseUse");
                            player.skip("phaseDiscard");

                            if (player.hp < player.maxHp) {
                                await player.recover(1);
                            }

                            await player.draw(3);

                            ensureBulletStorage(player);

                            player.storage.弹头_存量 = {
                                heart: 1,
                                spade: 1,
                                diamond: 1,
                                club: 1,
                            };

                            player.storage.装填_记录 = {
                                heart: 0,
                                spade: 0,
                                diamond: 0,
                                club: 0,
                            };

                            refreshBulletMark(player);

                            player.addSkill("备战_避险");

                            player.popup(
                                "备战：跳过阶段、回复体力、摸3张牌、补满弹药"
                            );
                        },

                        intro: {
                            content:
                                "回合开始时，你可以发动：跳过本回合摸牌、出牌、弃牌阶段，回复1点体力，摸3张牌，并将所有弹药补满至1枚。进入备战状态后，首次受到伤害时防止该伤害并暂时移出游戏，直到自己的回合开始时返回。",
                        },
                    },

                    /* ==================== 备战避险 ==================== */
                    "备战_避险": {
                        charlotte: true,
                        mark: true,
                        marktext: "备",

                        trigger: {
                            player: "damageBefore",
                        },

                        forced: true,
                        forceOut: true,
                        priority: 100,

                        filter: function (event, player) {
                            return event.num > 0 && !event._备战_防;
                        },

                        content: async function (event, trigger, player) {
                            if (player.isOut()) return;

                            trigger._备战_防 = true;
                            trigger.cancel();

                            player.removeSkill("备战_避险");

                            player.addSkill("备战_移出");

                            player.out(true);

                            player.popup(
                                "紧急避险：防止伤害，暂时移出游戏"
                            );
                        },

                        intro: {
                            content:
                                "备战状态：首次受到伤害时防止该伤害，并暂时移出游戏，直到自己的回合开始时返回。",
                        },

                        sub: true,
                        sourceSkill: "备战",
                    },

                    /* ==================== 备战移出与返回 ==================== */
                    "备战_移出": {
                        charlotte: true,
                        mark: true,
                        marktext: "离",
                        forceOut: true,

                        trigger: {
                            global: "phaseOver",
                        },

                        forced: true,
                        priority: 100,

                        filter: function (event, player) {
                            return !!event.player &&
                                event.player !== player &&
                                event.player.next === player;
                        },

                        content: async function (event, trigger, player) {
                            player.in(true);
                            player.classList.remove("out");

                            player.removeSkill("备战_移出");

                            player.popup("紧急避险结束，回归游戏");
                        },

                        onremove: function (player) {},

                        intro: {
                            content:
                                "紧急避险期间暂时移出游戏，直到下回合开始时返回。",
                        },

                        sub: true,
                        sourceSkill: "备战",
                    },
                },

                translate: {
                    "天工": "天工",
                    "天工_info":
                        "持恒技，你造成伤害后，对受伤角色造成等量无来源伤害；其非锁定技失效直到其回合结束。",
                    "天工_封技": "封",

                    "装填": "装填",
                    "装填_info":
                        "当你以任意方式失去手牌时，记录失去牌的花色。每凑够2张同花色，获得1枚对应弹药，每种最多储存1枚。红桃：爆炸弹；黑桃：空尖弹；方片：凝滞弹；梅花：麻醉弹。",
                    "装填_标记": "弹",
                    "装填_标记_info": "显示弹药存量及装填记录。",

                    "上膛": "上膛",
                    "上膛_info":
                        "当你使用【杀】时，可消耗1枚储存的弹药强化此【杀】。爆炸弹：造成伤害后废除装备区三回合；空尖弹：此【杀】造成伤害后，目标体力上限-1；凝滞弹：造成伤害后本轮不能使用牌且不能响应牌；麻醉弹：造成伤害后翻面。",

                    "装填_弹头命中": "弹头结算",
                    "装填_凝滞": "凝滞",
                    "装填_废装备栏": "废",
                    "装填_清理弹头": "弹头清理",

                    "备战": "备战",
                    "备战_info":
                        "回合开始时，你可以发动：跳过本回合摸牌、出牌、弃牌阶段，回复1点体力，摸3张牌，并将每种弹药补充至至少1枚。进入备战状态后，第一次受到伤害时防止该伤害并暂时移出游戏，直到自己的回合开始时返回。",
                    "备战_避险": "备",
                    "备战_移出": "离",
                },
            },

            intro: "",
            author: "无名玩家",
            diskURL: "",
            forumURL: "",
            version: "1.2-test",
        },

        files: {
            character: ["小萝.jpg"],
            card: [],
            skill: [],
            audio: [],
        },
    };
}
