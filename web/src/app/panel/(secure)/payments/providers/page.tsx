import Link from "next/link";
import { requirePanel } from "@/lib/panel";
import { CONFIG } from "@/lib/config";
import {
  activeProviders,
  freekassaReady,
  getPaymentConfig,
  maskSecret,
  plategaReady,
} from "@/lib/payments";
import PaymentProviders, { type ProviderState } from "@/components/PaymentProviders";

export const dynamic = "force-dynamic";

export default async function PanelProvidersPage() {
  const admin = await requirePanel(5);
  if (!admin) return null;

  const config = await getPaymentConfig();
  const active = activeProviders(config);

  const providers: ProviderState[] = [
    {
      key: "freekassa",
      title: "FreeKassa",
      hint: "Карты, СБП, кошельки, крипта. Подпись — секретные слова №1 и №2.",
      enabled: config.freekassa.enabled,
      bonusPercent: config.freekassa.bonusPercent,
      ready: freekassaReady(config),
      callbackUrl: "https://vanillacraft.click/api/payments/freekassa",
      fields: [
        { name: "merchantId", label: "ID магазина" },
        { name: "secret1", label: "Секретное слово №1", secret: true, hint: "Подписывает форму оплаты" },
        { name: "secret2", label: "Секретное слово №2", secret: true, hint: "Проверяет уведомление об оплате" },
        { name: "payUrl", label: "Адрес формы", hint: "По умолчанию https://pay.fk.money/" },
      ],
      values: {
        merchantId: config.freekassa.merchantId,
        secret1: maskSecret(config.freekassa.secret1),
        secret2: maskSecret(config.freekassa.secret2),
        payUrl: config.freekassa.payUrl,
      },
    },
    {
      key: "platega",
      title: "Платега",
      hint: "СБП, карты, крипта. Ключи — X-MerchantId и X-Secret из кабинета.",
      enabled: config.platega.enabled,
      bonusPercent: config.platega.bonusPercent,
      ready: plategaReady(config),
      callbackUrl: "https://vanillacraft.click/api/payments/platega",
      fields: [
        { name: "merchantId", label: "Merchant ID", hint: "Заголовок X-MerchantId" },
        { name: "secret", label: "Секретный ключ", secret: true, hint: "Заголовок X-Secret" },
        {
          name: "paymentMethod",
          label: "Метод оплаты",
          hint: "0 — игрок выбирает сам; 2 — СБП, 11 — карты, 13 — крипта",
        },
        { name: "apiUrl", label: "Адрес API", hint: "По умолчанию https://app.platega.io" },
      ],
      values: {
        merchantId: config.platega.merchantId,
        secret: maskSecret(config.platega.secret),
        paymentMethod: String(config.platega.paymentMethod),
        apiUrl: config.platega.apiUrl,
      },
    },
    {
      key: "manual",
      title: "Перевод вручную",
      hint: "Игрок оставляет заявку, вы сверяете перевод и одобряете её здесь же.",
      enabled: config.manual.enabled,
      bonusPercent: config.manual.bonusPercent,
      ready: active.some((provider) => provider.key === "manual"),
      fields: [],
      values: {},
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Только чиф-администратор</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Платёжные системы</h1>
        <p className="muted mt-2 max-w-2xl text-sm">
          Ключи хранятся в базе и применяются сразу, без пересборки сайта. Бонус — надбавка к VC
          за оплату через эту кассу: при курсе 1 ₽ = {CONFIG.vcPerRub} VC и бонусе 14% за 1000 ₽
          игрок получит 2280 VC. Ручной приём показывается сам, пока не подключена ни одна касса.
        </p>
        <p className="muted mt-2 text-sm">
          Сейчас игрокам доступно:{" "}
          <b>{active.length ? active.map((provider) => provider.title).join(", ") : "ничего"}</b>.{" "}
          <Link href="/panel/payments" className="underline hover:text-white">
            Заявки на пополнение →
          </Link>
        </p>
      </div>

      <PaymentProviders providers={providers} vcPerRub={CONFIG.vcPerRub} />
    </div>
  );
}
