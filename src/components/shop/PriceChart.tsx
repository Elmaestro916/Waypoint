import type { HistoryPoint } from "@/lib/shop/product";
import { formatMoney } from "@/lib/shop/fx";

/** Price history as a plain SVG line with the low and the latest price labelled. */
export default function PriceChart({ points, currency, locale }: { points: HistoryPoint[]; currency: string; locale: string }) {
  if (points.length < 2) {
    return <p className="text-sm text-road-mute">Price history appears here after we have recorded this product on at least two days.</p>;
  }
  const W = 640, H = 140, P = 8;
  const ys = points.map((p) => p.price);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const span = hi - lo || 1;
  const x = (i: number) => P + (i / (points.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - lo) / span) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.price).toFixed(1)}`).join(" ");
  const iLo = ys.indexOf(lo);
  const last = points[points.length - 1];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Price history from ${formatMoney(points[0].price, currency, locale)} to ${formatMoney(last.price, currency, locale)}, lowest ${formatMoney(lo, currency, locale)}`}>
        <path d={d} fill="none" stroke="#14171f" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(iLo)} cy={y(lo)} r="5" fill="#ffd23f" stroke="#14171f" strokeWidth="2" />
        <circle cx={x(points.length - 1)} cy={y(last.price)} r="4" fill="#14171f" />
      </svg>
      <figcaption className="mt-1 flex flex-wrap justify-between gap-2 text-sm text-road-mute">
        <span>{points[0].day} to {last.day}</span>
        <span>Lowest {formatMoney(lo, currency, locale)} on {points[iLo].day}, now {formatMoney(last.price, currency, locale)}</span>
      </figcaption>
    </figure>
  );
}
