import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="panel p-8">
        <h1 className="text-3xl font-bold">Ванилла без приватов</h1>
        <p className="muted mt-3 max-w-2xl">
          Чистое выживание: никаких китов за донат, никаких приватов. Порядок держится
          на быстрой реакции администрации и деморгане — исправительных работах вместо
          бана за мелкие нарушения.
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/register" className="btn">Начать играть</Link>
          <Link href="/rules" className="btn-ghost">Правила</Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="panel p-5">
          <h2 className="font-semibold">Деморган вместо бана</h2>
          <p className="muted mt-2 text-sm">
            За мелкое нарушение вы не теряете прогресс — отрабатываете срок в шахте.
            Время идёт 1 к 10 и только пока вы онлайн.
          </p>
        </div>
        <div className="panel p-5">
          <h2 className="font-semibold">VanillaCoins</h2>
          <p className="muted mt-2 text-sm">
            Валюта тратится только на косметику и кейсы. Купить преимущество в игре
            нельзя — сервер остаётся ванильным.
          </p>
        </div>
        <div className="panel p-5">
          <h2 className="font-semibold">Честные шансы</h2>
          <p className="muted mt-2 text-sm">
            Кейсы и мини-игры работают на provably fair: хэш серверного сида известен
            заранее, любую свою игру можно пересчитать.
          </p>
        </div>
      </section>
    </div>
  );
}
