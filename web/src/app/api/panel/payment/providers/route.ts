import { requirePanel } from "@/lib/panel";
import {
  activeProviders,
  freekassaReady,
  getPaymentConfig,
  maskSecret,
  plategaReady,
  savePaymentConfig,
  type ProviderKey,
  type ProviderPatch,
} from "@/lib/payments";

/** Настройки касс видит и меняет только чиф-администратор: там ключи. */
async function view() {
  const config = await getPaymentConfig();
  return {
    freekassa: {
      enabled: config.freekassa.enabled,
      bonusPercent: config.freekassa.bonusPercent,
      merchantId: config.freekassa.merchantId,
      secret1: maskSecret(config.freekassa.secret1),
      secret2: maskSecret(config.freekassa.secret2),
      payUrl: config.freekassa.payUrl,
      currency: config.freekassa.currency,
      ready: freekassaReady(config),
    },
    platega: {
      enabled: config.platega.enabled,
      bonusPercent: config.platega.bonusPercent,
      merchantId: config.platega.merchantId,
      secret: maskSecret(config.platega.secret),
      paymentMethod: config.platega.paymentMethod,
      apiUrl: config.platega.apiUrl,
      currency: config.platega.currency,
      ready: plategaReady(config),
    },
    manual: {
      enabled: config.manual.enabled,
      bonusPercent: config.manual.bonusPercent,
    },
    active: activeProviders(config).map((provider) => provider.key),
  };
}

export type ProvidersView = Awaited<ReturnType<typeof view>>;

export async function GET() {
  const admin = await requirePanel(5, "payments.providers");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json(await view());
}

export async function POST(request: Request) {
  const admin = await requirePanel(5, "payments.providers");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json()) as { provider?: string; patch?: ProviderPatch };
  const provider = body.provider as ProviderKey;
  if (!["freekassa", "platega", "manual"].includes(provider)) {
    return Response.json({ error: "Неизвестная касса" }, { status: 400 });
  }

  await savePaymentConfig({ provider, patch: body.patch ?? {}, adminId: admin.id });
  return Response.json({ ok: true, ...(await view()) });
}
