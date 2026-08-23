/** Требования к новым медиа-партнёрам. Показываются на странице заявки. */
export const PARTNER_PLATFORMS = [
  { key: "youtube", label: "YouTube", requirement: "50+ средних просмотров" },
  {
    key: "shorts",
    label: "YouTube Shorts",
    requirement: "3000+ просмотров за 7 дней в аналитике канала, тематика Minecraft",
  },
  { key: "twitch", label: "Twitch", requirement: "15+ средних зрителей в месяц" },
  {
    key: "tiktok",
    label: "TikTok",
    requirement: "3000+ просмотров за 7 дней в аналитике канала, тематика Minecraft",
  },
  { key: "discord", label: "Discord", requirement: "500+ участников" },
  { key: "trovo", label: "Trovo", requirement: "10+ средних зрителей за месяц" },
  {
    key: "other",
    label: "RuTube, VK Клипы, Telegram, группы ВКонтакте",
    requirement: "критерии рассматриваются индивидуально",
  },
] as const;

export const PLATFORM_LABEL: Record<string, string> = Object.fromEntries(
  PARTNER_PLATFORMS.map((platform) => [platform.key, platform.label]),
);

export const STATUS_LABEL: Record<string, string> = {
  PENDING: "На рассмотрении",
  APPROVED: "Одобрена",
  REJECTED: "Отклонена",
};
