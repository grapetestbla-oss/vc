"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type NewsItem = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  published: boolean;
  pinned: boolean;
  broadcast: boolean;
  broadcastedAt: string | null;
  createdAt: string;
};

export default function NewsEditor({ items }: { items: NewsItem[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/panel/news", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    setBusy(false);
    setMessage(response.ok ? "Готово" : (data.error ?? "Ошибка"));
    if (response.ok) router.refresh();
    return response.ok;
  }

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <h2 className="text-lg font-semibold">Новая публикация</h2>
        <form
          className="mt-4 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            const ok = await call("POST", {
              title: data.get("title"),
              summary: data.get("summary"),
              body: data.get("body"),
              pinned: data.get("pinned") === "on",
              broadcast: data.get("broadcast") === "on",
              published: data.get("published") === "on",
            });
            if (ok) form.reset();
          }}
        >
          <input name="title" className="input" placeholder="Заголовок" required />
          <input
            name="summary"
            className="input"
            placeholder="Короткое описание (если пусто — возьмём начало текста)"
          />
          <textarea name="body" className="input min-h-40" placeholder="Текст новости" required />

          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="published" defaultChecked /> Опубликовать сразу
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="pinned" /> Закрепить сверху
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="broadcast" /> Объявить в игре
            </label>
          </div>

          <button className="btn" disabled={busy}>Опубликовать</button>
          {message && <span className="muted ml-3 text-sm">{message}</span>}
        </form>
      </section>

      <section className="panel p-6">
        <h2 className="text-lg font-semibold">Опубликованные</h2>
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-3 border-t pt-3 text-sm"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="min-w-0 flex-1">
                <a
                  href={`/news/${item.slug}`}
                  className="font-medium hover:text-[var(--gold)]"
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.title}
                </a>
                <div className="muted text-xs">
                  {new Date(item.createdAt).toLocaleString("ru")}
                  {item.pinned && " · закреплена"}
                  {!item.published && " · черновик"}
                  {item.broadcast &&
                    (item.broadcastedAt ? " · объявлена в игре" : " · ждёт объявления")}
                </div>
              </div>

              <button
                className="btn-ghost text-xs"
                disabled={busy}
                onClick={() => call("PATCH", { id: item.id, pinned: !item.pinned })}
              >
                {item.pinned ? "Открепить" : "Закрепить"}
              </button>
              <button
                className="btn-ghost text-xs"
                disabled={busy}
                onClick={() => call("PATCH", { id: item.id, published: !item.published })}
              >
                {item.published ? "Снять" : "Опубликовать"}
              </button>
              <button
                className="btn-ghost text-xs"
                style={{ color: "var(--danger)" }}
                disabled={busy}
                onClick={() => {
                  if (confirm(`Удалить «${item.title}»?`)) call("DELETE", { id: item.id });
                }}
              >
                Удалить
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="muted">Публикаций пока нет.</li>}
        </ul>
      </section>
    </div>
  );
}
