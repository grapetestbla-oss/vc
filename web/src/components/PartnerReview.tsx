"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Application = {
  id: string;
  login: string;
  platform: string;
  channelUrl: string;
  audience: string;
  contact: string;
  comment: string | null;
  desiredCode: string | null;
  createdAt: string;
};

export default function PartnerReview({
  application,
  platformLabel,
}: {
  application: Application;
  platformLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [code, setCode] = useState(application.desiredCode ?? application.login.toUpperCase());
  const [note, setNote] = useState("");

  async function decide(approve: boolean) {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/panel/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: application.id, approve, code, note }),
    });
    const data = await response.json();
    setBusy(false);
    setMessage(response.ok ? (approve ? `Одобрено, код ${data.code}` : "Отклонено") : (data.error ?? "Ошибка"));
    if (response.ok) router.refresh();
  }

  return (
    <div className="panel p-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h3 className="text-lg font-semibold">{application.login}</h3>
        <span className="muted text-sm">{platformLabel}</span>
        <span className="muted ml-auto text-xs">
          {new Date(application.createdAt).toLocaleString("ru")}
        </span>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex gap-3">
          <dt className="muted w-28 shrink-0">Канал</dt>
          <dd className="min-w-0 break-all">
            <a
              href={application.channelUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="underline hover:text-[var(--gold)]"
            >
              {application.channelUrl}
            </a>
          </dd>
        </div>
        <div className="flex gap-3">
          <dt className="muted w-28 shrink-0">Охваты</dt>
          <dd className="whitespace-pre-wrap">{application.audience}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="muted w-28 shrink-0">Контакт</dt>
          <dd>{application.contact}</dd>
        </div>
        {application.comment && (
          <div className="flex gap-3">
            <dt className="muted w-28 shrink-0">Комментарий</dt>
            <dd className="whitespace-pre-wrap">{application.comment}</dd>
          </div>
        )}
      </dl>

      <div className="mt-5 flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="muted text-xs">Промокод</span>
          <input
            className="input w-44 font-mono uppercase"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </label>
        <label className="min-w-56 flex-1 space-y-1">
          <span className="muted text-xs">Комментарий к решению</span>
          <input className="input" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <button className="btn" disabled={busy} onClick={() => decide(true)}>
          Одобрить
        </button>
        <button
          className="btn-ghost"
          style={{ color: "var(--danger)" }}
          disabled={busy}
          onClick={() => decide(false)}
        >
          Отклонить
        </button>
      </div>

      {message && <p className="muted mt-3 text-sm">{message}</p>}
    </div>
  );
}
