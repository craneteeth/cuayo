"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "../lib/UserProvider";

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

type CategoryOpt =
  | "food_dining"
  | "travel"
  | "entertainment"
  | "personal_care"
  | "grocery"
  | "health_fitness"
  | "kids_pets"
  | "misc"
  | "gas_transport"
  | "home"
  | "shopping";

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

  userSpentRatio: number; // 0~1
  userRank: number | null;
  numUsers: number;
  topPercent: number | null;

  error?: string;
};

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


function normalizeTime(x: string | null): TimeOpt | null {
  if (x === "d" || x === "w" || x === "m") return x;
  return null;
}

function normalizeGroup(x: string | null): GroupOpt | null {
  if (x === "District" || x === "City" || x === "State" || x === "Gender" || x === "Age") return x;
  return null;
}

function normalizeCategory(x: string | null): CategoryOpt | null {
  const all: CategoryOpt[] = [
    "food_dining",
    "travel",
    "entertainment",
    "personal_care",
    "grocery",
    "health_fitness",
    "kids_pets",
    "misc",
    "gas_transport",
    "home",
    "shopping",
  ];
  if (x && (all as string[]).includes(x)) return x as CategoryOpt;
  return null;
}

export default function RankingsPage() {
  const userId = "EuLe21";
  const { user } = useUser();

  const router = useRouter();
  const searchParams = useSearchParams();
  const didInitFromUrl = useRef(false);

  const [time, setTime] = useState<TimeOpt>("w");
  const [category, setCategory] = useState<CategoryOpt>("food_dining");
  const [group, setGroup] = useState<GroupOpt>("City");
  const [groupValue, setGroupValue] = useState<string>("");

  const [filtersReady, setFiltersReady] = useState(false);

  const [model, setModel] = useState<ApiModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (didInitFromUrl.current) return;

    const t = normalizeTime(searchParams.get("time"));
    const g = normalizeGroup(searchParams.get("group"));
    const gv = searchParams.get("groupValue");
    const c = normalizeCategory(searchParams.get("category"));

    if (t) setTime(t);
    if (g) setGroup(g);
    if (typeof gv === "string" && gv.trim()) setGroupValue(gv.trim());
    if (c) setCategory(c);

    didInitFromUrl.current = true;
    setFiltersReady(true);
  }, [searchParams]);

  useEffect(() => {
    if (!filtersReady) return;

    const sp = new URLSearchParams();
    sp.set("time", time);
    sp.set("group", group);
    if (groupValue.trim()) sp.set("groupValue", groupValue.trim());
    if (category) sp.set("category", category);

    router.replace(`/rankings?${sp.toString()}`);
  }, [filtersReady, time, group, groupValue, category, router]);

  useEffect(() => {
    if (!filtersReady) return;

    const ac = new AbortController();
    const params = new URLSearchParams();

    params.set("userId", userId);
    params.set("time", time);
    params.set("category", category);
    params.set("group", group);
    if (groupValue.trim()) params.set("groupValue", groupValue.trim());

    setLoading(true);
    setError("");

    fetch(`/api/rankings?${params.toString()}`, { signal: ac.signal, cache: "no-store" })
      .then(async (r) => {
        const text = await r.text();
        if (!r.ok) throw new Error(text || `HTTP ${r.status}`);
        if (!text.trim()) throw new Error("Empty response body from /api/rankings");
        try {
          return JSON.parse(text) as ApiModel;
        } catch {
          throw new Error(`Invalid JSON from /api/rankings:\n${text.slice(0, 400)}`);
        }
      })
      .then((m) => {
        if ((m as any)?.error) throw new Error((m as any).error);
        setModel(m);
      })
      .catch((e: any) => {
        if (e?.name === "AbortError") return;
        setError(String(e?.message || e));
        setModel(null);
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [filtersReady, userId, time, category, group, groupValue]);

  const topLabel = useMemo(() => {
    if (model?.topPercent == null) return "—";
    return `Top ${model.topPercent.toFixed(1)}%`;
  }, [model]);

  const spentRatioPct = useMemo(() => {
    const v = model?.userSpentRatio ?? 0;
    return `${(v * 100).toFixed(2)}%`;
  }, [model]);

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

  return (
    <div className="w-full max-w-[1200px] mx-auto">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-[28px] font-black text-neutral-900">Rankings</h1>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Filters */}
        <div className="col-span-12 md:col-span-3 rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="text-[13px] font-bold text-neutral-900">Filters</div>

          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-1 text-xs font-semibold text-neutral-500">Time</div>
              <select
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px]"
                value={time}
                onChange={(e) => setTime(e.target.value as TimeOpt)}
              >
                <option value="d">daily (d)</option>
                <option value="w">weekly (w)</option>
                <option value="m">monthly (m)</option>
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold text-neutral-500">Category</div>
              <select
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px]"
                value={category}
                onChange={(e) => setCategory(e.target.value as CategoryOpt)}
              >
                <option value="food_dining">food_dining</option>
                <option value="travel">travel</option>
                <option value="entertainment">entertainment</option>
                <option value="personal_care">personal_care</option>
                <option value="grocery">grocery</option>
                <option value="health_fitness">health_fitness</option>
                <option value="kids_pets">kids_pets</option>
                <option value="misc">misc</option>
                <option value="gas_transport">gas_transport</option>
                <option value="home">home</option>
                <option value="shopping">shopping</option>
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold text-neutral-500">Group</div>
              <select
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px]"
                value={group}
                onChange={(e) => setGroup(e.target.value as GroupOpt)}
              >
                <option value="District">District</option>
                <option value="City">City</option>
                <option value="State">State</option>
                <option value="Gender">Gender</option>
                <option value="Age">Age</option>
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold text-neutral-500">Group value</div>
              <input
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px]"
                value={groupValue}
                onChange={(e) => setGroupValue(e.target.value)}
                placeholder={group === "State" ? "PA" : ""}
              />
            </div>
          </div>
        </div>

        {/* Distribution */}
        <div className="col-span-12 md:col-span-5 rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-bold text-neutral-900">Distribution</div>
          </div>

          <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-2">
            {loading ? (
              <div className="p-4 text-[13px] text-neutral-600">Loading…</div>
            ) : error ? (
              <div className="p-4 text-[13px] font-semibold text-red-600">{error}</div>
            ) : model ? (
              <StandardBellCurveSvg topPercent={model.topPercent} />
            ) : (
              <div className="p-4 text-[13px] text-neutral-600">No data</div>
            )}
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
        </div>

        {/* Leaderboard */}
        <div className="col-span-12 md:col-span-4 rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="text-[13px] font-bold text-neutral-900">Leaderboard</div>

          <div className="mt-3 max-h-[26rem] overflow-auto rounded-xl border border-neutral-200">
            {loading ? (
              <div className="p-4 text-[13px] text-neutral-600">Loading…</div>
            ) : error ? (
              <div className="p-4 text-[13px] font-semibold text-red-600">{error}</div>
            ) : !model ? (
              <div className="p-4 text-[13px] text-neutral-600">No data</div>
            ) : model.rows.length === 0 ? (
              <div className="p-4 text-[13px] text-neutral-600">No transactions in this category/timeframe.</div>
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
                  {model.rows.map((r) => {
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
                      r.isUser === true || r.name === userId || r.name === user?.id || r.name === user?.name || r.name === "EuLe21";

                    const displayName = isUser
                      ? user.anonymousMode
                        ? user.nickname
                        : user.name
                      : r.name;

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

                        <td className="px-3 py-2">{badRow ? <span className="text-neutral-400 font-semibold">...</span> : r.trend}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
