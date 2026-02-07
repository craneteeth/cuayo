// app/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "./lib/UserProvider";

const DEFAULT_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e5e7eb"/>
      <stop offset="1" stop-color="#f3f4f6"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="32" fill="url(#g)"/>
  <circle cx="32" cy="26" r="12" fill="#9ca3af"/>
  <path d="M14 56c3.5-12 14-18 18-18s14.5 6 18 18" fill="#9ca3af"/>
</svg>`;

const DEFAULT_AVATAR_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(DEFAULT_AVATAR_SVG)}`;

type TimeOpt = "d" | "w" | "m";
type GroupOpt = "District" | "City" | "State" | "Gender" | "Age";

type Row =
  | {
      kind: "data";
      rank: number;
      name: string;
      metricLabel: string;
      metricValue: number;
      trend: "▲" | "▼" | "•";
      isUser?: boolean;
    }
  | { kind: "ellipsis"; id: string };

type ApiModel = {
  rows: Row[];
  metricLabel: string;
  userSpentRatio: number;
  userRank: number | null;
  numUsers: number;
  topPercent: number | null;
  refTime?: string | null;
};

type HomeApi = {
  userId: string;
  time: TimeOpt;
  group: GroupOpt;
  groupValue: string;
  best: { category: string | null; model: ApiModel | null };
  worst: { category: string | null; model: ApiModel | null };
  error?: string;
};

function QuickCard({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <Link href={href} className="block rounded-2xl border border-neutral-200 bg-white p-4 hover:bg-neutral-50">
      <div className="text-sm font-bold text-neutral-900">{title}</div>
      <div className="mt-1 text-xs text-neutral-500">{desc}</div>
    </Link>
  );
}

/** ===== Fraud demo types/components ===== */
type FraudTx = {
  id: string;
  merchant: string;
  amount: number;
  date: string; // display-ready
  category: string;
  last4: string;
};

function FraudCard({
  hasFraud,
  count,
  onClick,
}: {
  hasFraud: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full rounded-2xl border p-4 text-left transition-colors ${
        hasFraud
          ? "border-red-300 bg-red-50 hover:bg-red-100"
          : "border-neutral-200 bg-white hover:bg-neutral-50"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-bold text-neutral-900">Fraud</div>
        {hasFraud ? (
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-extrabold text-white">ALERT</span>
        ) : (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600">OK</span>
        )}
      </div>

      <div className="mt-1 text-xs text-neutral-500">
        {hasFraud ? `${count} suspicious transaction(s) need review` : "No suspicious transactions"}
      </div>
    </button>
  );
}

function FraudModal({
  open,
  onClose,
  fraudTxs,
  onResolve,
}: {
  open: boolean;
  onClose: () => void;
  fraudTxs: FraudTx[];
  onResolve: (id: string, action: "not_fraud" | "report_fraud") => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full max-w-2xl rounded-3xl border border-neutral-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-extrabold text-neutral-900">Suspicious transactions</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {fraudTxs.length === 0 ? (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm font-semibold text-neutral-700">
              No suspicious transactions.
            </div>
          ) : (
            fraudTxs.map((tx) => (
              <div key={tx.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-extrabold text-neutral-900">{tx.merchant}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {tx.date} · {tx.category} · Card •••• {tx.last4}
                    </div>
                  </div>
                  <div className="text-sm font-extrabold text-neutral-900">${tx.amount.toFixed(2)}</div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onResolve(tx.id, "not_fraud")}
                    className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-extrabold text-neutral-800 hover:bg-neutral-50"
                  >
                    Not fraud
                  </button>
                  <button
                    type="button"
                    onClick={() => onResolve(tx.id, "report_fraud")}
                    className="rounded-xl bg-red-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-red-700"
                  >
                    Report fraud
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Graph helpers =====
function invNorm(p: number) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];

  const plow = 0.02425;
  const phigh = 1 - plow;

  let q: number, r: number;

  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > phigh) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  q = p - 0.5;
  r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function gaussianStd(x: number) {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

function StandardBellCurveSvg({ topPercent, height = 220 }: { topPercent: number | null; height?: number }) {
  const NAVY = "rgb(0, 32, 91)";
  const FILL = "rgba(0, 32, 91, 0.18)";
  const w = 520;
  const h = height;

  const minX = -4;
  const maxX = 4;
  const points = 220;
  const step = (maxX - minX) / (points - 1);

  const data = Array.from({ length: points }, (_, i) => {
    const x = minX + step * i;
    return { x, y: gaussianStd(x) };
  });

  const maxY = Math.max(...data.map((d) => d.y));
  const toX = (x: number) => ((x - minX) / (maxX - minX)) * w;
  const toY = (y: number) => h - (y / maxY) * (h * 0.92) - 8;

  const curvePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${toX(d.x).toFixed(2)} ${toY(d.y).toFixed(2)}`)
    .join(" ");

  const baselineY = h - 10;
  const firstX = toX(data[0].x);
  const lastX = toX(data[data.length - 1].x);

  const fillPath = `${curvePath} L ${lastX.toFixed(2)} ${baselineY.toFixed(2)} L ${firstX.toFixed(2)} ${baselineY.toFixed(2)} Z`;

  const showLine = topPercent !== null && topPercent !== undefined;

  let p = showLine ? 1 - topPercent! / 100 : 0.5;
  p = Math.min(0.999999, Math.max(0.000001, p));

  const z = invNorm(p);
  const ux = toX(Math.min(maxX, Math.max(minX, z)));
  const clipId = `clip-left-of-line-${Math.round(ux)}-${Math.round(h)}-${Math.round(w)}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={ux} height={h} />
        </clipPath>
      </defs>
      <path d={fillPath} fill={FILL} stroke="none" clipPath={`url(#${clipId})`} />

      <path d={curvePath} fill="none" stroke={NAVY} strokeWidth="3" />

      {showLine ? (
        <>
          <line x1={ux} x2={ux} y1={8} y2={baselineY} stroke="red" strokeWidth="4" strokeDasharray="10 8" />
          <text x={Math.min(ux + 8, w - 200)} y={20} fontSize="14" fontWeight="800" fill="red">
            {`Top ${topPercent!.toFixed(1)}%`}
          </text>
        </>
      ) : (
        <text x={12} y={20} fontSize="14" fontWeight="800" fill="red">
          No spend in this category/timeframe
        </text>
      )}
    </svg>
  );
}

function buildRankingsHref(args: { time: TimeOpt; group: GroupOpt; groupValue: string; category: string | null }) {
  const sp = new URLSearchParams();
  sp.set("time", args.time);
  sp.set("group", args.group);
  if (args.groupValue) sp.set("groupValue", args.groupValue);
  if (args.category) sp.set("category", args.category);
  return `/rankings?${sp.toString()}`;
}

function ensureEllipsesRows(rows: Row[]): Row[] {
  if (rows.some((r) => r.kind === "ellipsis")) return rows;

  const dataRows = rows.filter((r): r is Extract<Row, { kind: "data" }> => r.kind === "data");
  if (dataRows.length <= 1) return rows;

  const out: Row[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const cur = dataRows[i];
    out.push(cur);

    const next = dataRows[i + 1];
    if (!next) break;

    if (Number.isFinite(cur.rank) && Number.isFinite(next.rank) && next.rank - cur.rank > 1) {
      out.push({ kind: "ellipsis", id: `auto-ellipsis-${cur.rank}-${next.rank}` });
    }
  }
  return out;
}

function Panel({
  title,
  variant,
  category,
  model,
  href,
}: {
  title: string;
  variant: "best" | "worst";
  category: string | null;
  model: ApiModel | null;
  href: string;
}) {
  const router = useRouter();
  const userId = "EuLe21";
  const { user } = useUser();

  const userRowStyle = useMemo(
    () => ({
      backgroundColor: "rgba(0, 32, 91, 0.22)",
    }),
    []
  );

  const isBadValue = (v: unknown) =>
    v === null ||
    v === undefined ||
    (typeof v === "number" && !Number.isFinite(v)) ||
    (typeof v === "string" && v.trim().toLowerCase() === "nan");

  const cardBg = variant === "best" ? "rgba(0, 32, 91, 0.08)" : "rgba(220, 38, 38, 0.08)";

  const spentRatioPct = `${((model?.userSpentRatio ?? 0) * 100).toFixed(2)}%`;
  const topLabel = model?.topPercent == null ? "—" : `Top ${model.topPercent.toFixed(1)}%`;

  return (
    <div className="rounded-2xl border border-neutral-200 p-4" style={{ backgroundColor: cardBg }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-bold text-neutral-900">{title}</div>
          <div className="mt-1 text-xs text-neutral-500">category: {category ?? "—"}</div>
        </div>
        <button
          type="button"
          className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold text-neutral-800 hover:bg-neutral-50"
          onClick={() => router.push(href)}
        >
          Open Rankings →
        </button>
      </div>

      <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-2">
        {model ? <StandardBellCurveSvg topPercent={model.topPercent} /> : <div className="p-4 text-[13px] text-neutral-600">No data</div>}
      </div>

      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="text-xs font-semibold text-neutral-600">Your standing</div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className="text-[22px] font-black text-neutral-900">{topLabel}</div>
          <div className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-bold text-neutral-700">
            #{model?.userRank ?? "—"} / {model?.numUsers ?? "—"}
          </div>
        </div>
        <div className="mt-2 text-xs text-neutral-500">
          spent_ratio: <b>{spentRatioPct}</b>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-[13px] font-bold text-neutral-900">Leaderboard</div>
        <div className="mt-3 max-h-[20rem] overflow-auto rounded-xl border border-neutral-200 bg-white">
          {!model ? (
            <div className="p-4 text-[13px] text-neutral-600">No data</div>
          ) : model.rows.length === 0 ? (
            <div className="p-4 text-[13px] text-neutral-600">No rows.</div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-xs text-neutral-500">
                  <th className="px-3 py-2">Rank</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">{model.metricLabel}</th>
                  <th className="px-3 py-2">Trend</th>
                </tr>
              </thead>
              <tbody>
                {ensureEllipsesRows(model.rows).map((r) => {
                  if (r.kind === "ellipsis") {
                    return (
                      <tr key={r.id} className="border-t border-neutral-200">
                        <td className="px-3 py-2 text-neutral-400 font-semibold">…</td>
                        <td className="px-3 py-2 text-neutral-400 font-semibold">…</td>
                        <td className="px-3 py-2 text-neutral-400 font-semibold">…</td>
                        <td className="px-3 py-2 text-neutral-400 font-semibold">…</td>
                      </tr>
                    );
                  }

                  const badRow = isBadValue(r.rank) || isBadValue(r.name) || isBadValue(r.metricValue);

                  const isUser =
                    r.isUser === true ||
                    r.name === userId ||
                    r.name === user?.id ||
                    r.name === user?.name ||
                    r.name === "EuLe21";

                  // ✅ 원본 방식 그대로: user.anonymousMode
                  const displayName = isUser ? (user.anonymousMode ? user.nickname : user.name) : r.name;

                  const displayImgSrc = isUser
                    ? user.anonymousMode
                      ? DEFAULT_AVATAR_SRC
                      : user.profileImage || DEFAULT_AVATAR_SRC
                    : DEFAULT_AVATAR_SRC;

                  return (
                    <tr
                      key={`${String(r.rank)}-${String(r.name)}`}
                      className="border-t border-neutral-200"
                      style={!badRow && isUser ? userRowStyle : undefined}
                    >
                      <td className={`px-3 py-2 ${!badRow && isUser ? "font-extrabold text-[rgb(0,32,91)]" : "font-semibold"}`}>
                        {badRow ? <span className="text-neutral-400 font-semibold">...</span> : r.rank}
                      </td>

                      <td className={`px-3 py-2 ${!badRow && isUser ? "font-extrabold text-[rgb(0,32,91)]" : "font-semibold"}`}>
                        {badRow ? (
                          <span className="text-neutral-400 font-semibold">...</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <img
                              src={displayImgSrc}
                              alt=""
                              className={`h-6 w-6 rounded-full ${isUser ? "ring-2 ring-[rgb(0,32,91)]" : "ring-1 ring-neutral-200"}`}
                              draggable={false}
                            />
                            <span>{displayName}</span>
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-2">
                        {badRow ? <span className="text-neutral-400 font-semibold">...</span> : `${(Number(r.metricValue) * 100).toFixed(2)}%`}
                      </td>

                      <td className="px-3 py-2">
                        {badRow ? <span className="text-neutral-400 font-semibold">...</span> : r.trend}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<HomeApi | null>(null);

  // ✅ Fraud demo state (fake data)
  const [fraudTxs, setFraudTxs] = useState<FraudTx[]>([
    {
      id: "ftx_001",
      merchant: "N0RTHEAST*ELECTR0NICS",
      amount: 482.19,
      date: "2026-02-06 11:42 PM",
      category: "Electronics",
      last4: "1842",
    },
    {
      id: "ftx_002",
      merchant: "RideNow · Unknown City",
      amount: 76.4,
      date: "2026-02-07 02:18 AM",
      category: "Transport",
      last4: "1842",
    },
  ]);
  const [fraudOpen, setFraudOpen] = useState(false);

  const hasFraud = fraudTxs.length > 0;

  function resolveFraud(id: string, _action: "not_fraud" | "report_fraud") {
    setFraudTxs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) setFraudOpen(false);
      return next;
    });
  }

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError("");

    fetch("/api/home", { signal: ac.signal })
      .then(async (r) => {
        const ct = r.headers.get("content-type") || "";
        const text = await r.text();
        if (!r.ok) throw new Error(text.slice(0, 300));
        if (!ct.includes("application/json")) throw new Error(`Expected JSON, got ${ct}`);
        return JSON.parse(text) as HomeApi;
      })
      .then((j) => {
        if ((j as any)?.error) throw new Error((j as any).error);
        setData(j);
      })
      .catch((e: any) => {
        if (e?.name === "AbortError") return;
        setError(String(e?.message || e));
        setData(null);
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, []);

  const time = data?.time ?? "w";
  const group = data?.group ?? "City";
  const groupValue = data?.groupValue ?? "";

  const bestHref = useMemo(
    () =>
      buildRankingsHref({
        time,
        group,
        groupValue,
        category: data?.best.category ?? null,
      }),
    [time, group, groupValue, data?.best.category]
  );

  const worstHref = useMemo(
    () =>
      buildRankingsHref({
        time,
        group,
        groupValue,
        category: data?.worst.category ?? null,
      }),
    [time, group, groupValue, data?.worst.category]
  );

  return (
    <div className="w-full max-w-6xl rounded-3xl bg-white p-8">
      <FraudModal open={fraudOpen} onClose={() => setFraudOpen(false)} fraudTxs={fraudTxs} onResolve={resolveFraud} />

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 md:col-span-8">
          {loading ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">Loading…</div>
          ) : error ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm font-bold text-red-600">{error}</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Panel title="Best ranking" variant="best" category={data?.best.category ?? null} model={data?.best.model ?? null} href={bestHref} />
              <Panel title="Worst ranking" variant="worst" category={data?.worst.category ?? null} model={data?.worst.model ?? null} href={worstHref} />
            </div>
          )}
        </section>

        <aside className="col-span-12 md:col-span-4">
          <div className="space-y-3">
            <QuickCard title="Rankings" desc="Distribution + Leaderboard" href="/rankings" />
            <QuickCard title="Analytics" desc="Personalized AI Financial Coaching" href="/analytics" />
            <QuickCard title="History" desc="Ranking History + Recent Transactions" href="/history" />

            {/* ✅ Added Fraud card */}
            <FraudCard hasFraud={hasFraud} count={fraudTxs.length} onClick={() => setFraudOpen(true)} />
          </div>
        </aside>
      </div>
    </div>
  );
}
