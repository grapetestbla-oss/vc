/**
 * Каталог магазина за VanillaCoins. Здесь только то, что даёт возможность,
 * а не внешний вид: косметика живёт в кейсах и в каталоге catalogue.mjs.
 * Ничего из этого не даёт преимущества в бою и не ломает ваниллу.
 */
export const SHOP_ITEMS = [
  {
    key: "tp_pack",
    title: "Телепорт к игроку ×5",
    description:
      "Команда /tpa <ник>: игрок получает запрос и сам решает, пускать вас или нет. Заряд тратится только при согласии.",
    category: "teleport",
    priceVc: 500,
    kind: "CHARGES",
    charges: 5,
    payload: { feature: "tp" },
    sort: 10,
  },
  {
    key: "back_pack",
    title: "Возврат на место смерти ×5",
    description: "Команда /back вернёт в точку последней смерти в течение 15 минут после неё.",
    category: "teleport",
    priceVc: 400,
    kind: "CHARGES",
    charges: 5,
    payload: { feature: "back" },
    sort: 20,
  },
  {
    key: "home_point",
    title: "Точка дома",
    description:
      "Навсегда. /sethome отмечает базу, /home возвращает к ней. Между телепортами 30 минут, в бою и в деморгане не работает. Каждые 5 уровней аккаунта открывают ещё одну точку — её докупают отдельно.",
    category: "teleport",
    priceVc: 1500,
    kind: "PERMANENT",
    charges: 0,
    payload: { feature: "home", cooldownSeconds: 1800 },
    requiredLevel: 2,
    sort: 30,
  },
  {
    key: "ender_pack",
    title: "Карманный эндер-сундук ×10",
    description: "Команда /ec открывает ваш эндер-сундук где угодно, кроме деморгана.",
    category: "utility",
    priceVc: 300,
    kind: "CHARGES",
    charges: 10,
    payload: { feature: "enderchest" },
    sort: 40,
  },
  {
    key: "craft_pack",
    title: "Верстак с собой ×10",
    description: "Команда /craft открывает верстак прямо в поле — не надо тащить его в шахту.",
    category: "utility",
    priceVc: 150,
    kind: "CHARGES",
    charges: 10,
    payload: { feature: "craft" },
    sort: 50,
  },
  {
    key: "keepinv_token",
    title: "Страховка инвентаря ×1",
    description:
      "Сгорает автоматически при следующей смерти и сохраняет вещи и опыт. В деморгане не действует.",
    category: "insurance",
    priceVc: 900,
    kind: "CHARGES",
    charges: 1,
    payload: { feature: "keepinv" },
    sort: 60,
  },
];
