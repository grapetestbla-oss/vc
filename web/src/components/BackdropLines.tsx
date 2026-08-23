/**
 * Фоновые кривые. Чистый SVG без изображений: рисуются один раз при загрузке
 * и дальше ничего не считают — на слабых машинах это важнее красоты.
 */
export default function BackdropLines() {
  const paths = [
    "M-100 320 C 260 120, 520 520, 900 260 S 1500 60, 1700 300",
    "M-100 520 C 300 380, 600 760, 1000 460 S 1560 320, 1700 520",
    "M-100 120 C 220 40, 700 300, 1080 90 S 1520 -40, 1700 140",
  ];

  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full opacity-[0.35]"
      viewBox="0 0 1600 800"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="line-gradient" x1="0" x2="1">
          <stop offset="0%" stopColor="rgba(245,196,81,0)" />
          <stop offset="45%" stopColor="rgba(245,196,81,0.5)" />
          <stop offset="70%" stopColor="rgba(61,220,151,0.35)" />
          <stop offset="100%" stopColor="rgba(61,220,151,0)" />
        </linearGradient>
      </defs>
      {paths.map((d, index) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="url(#line-gradient)"
          strokeWidth={index === 1 ? 1.4 : 1}
          className="bg-line"
          style={{ animationDelay: `${index * 350}ms` }}
        />
      ))}
    </svg>
  );
}
