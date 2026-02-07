"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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

type HistoryPoint = {
  t: string;
  userRank: number | null;
  userSpentRatio: number | null;
  numUsers: number | null;
  topPercent: number | null;
};

type TxRow = {
  id?: string;
  time?: string;
  merchant?: string;
  category?: string;
  amount?: number;
  note?: string;
};

type ApiResp = {
  ok: boolean;
  history: HistoryPoint[];
  transactions: TxRow[];
  snapshot?: any;
  error?: string;
};

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

function fmtDateLabel(iso: string, time: TimeOpt) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (time === "d" || time === "w") return d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  return d.toLocaleDateString(undefined, { year: "2-digit", month: "short" });
}
function fmtPct(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(2)}%`;
}
function fmtMoney(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function safeDateOnly(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export default function HistoryPage() {
  const userId = "EuLe21";
  const router = useRouter();
  const searchParams = useSearchParams();
  const didInitFromUrl = useRef(false);

  // ✅ default: month + State
  const [time, setTime] = useState<TimeOpt>("m");
  const [category, setCategory] = useState<CategoryOpt>("food_dining");
  const [group, setGroup] = useState<GroupOpt>("State");
  const [groupValue, setGroupValue] = useState<string>("");
  const [points, setPoints] = useState<number>(12);

  const [filtersReady, setFiltersReady] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [model, setModel] = useState<ApiResp | null>(null);

  const [chartMode, setChartMode] = useState<"rank" | "ratio">("rank");

  // tx filters
  const [txQuery, setTxQuery] = useState("");
  const [txCat, setTxCat] = useState("all");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");

  useEffect(() => {
    if (didInitFromUrl.current) return;

    const t = normalizeTime(searchParams.get("time"));
    const g = normalizeGroup(searchParams.get("group"));
    const gv = searchParams.get("groupValue");
    const c = normalizeCategory(searchParams.get("category"));
    const p = Number(searchParams.get("points"));

    if (t) setTime(t);
    if (g) setGroup(g);
    if (typeof gv === "string" && gv.trim()) setGroupValue(gv.trim());
    if (c) setCategory(c);
    if (Number.isFinite(p) && p >= 5 && p <= 90) setPoints(Math.floor(p));

    didInitFromUrl.current = true;
    setFiltersReady(true);
  }, [searchParams]);

  useEffect(() => {
    if (!filtersReady) return;

    const sp = new URLSearchParams();
    sp.set("time", time);
    sp.set("group", group);
    if (groupValue.trim()) sp.set("groupValue", groupValue.trim());
    sp.set("category", category);
    sp.set("points", String(points));

    router.replace(`/history?${sp.toString()}`);
  }, [filtersReady, time, group, groupValue, category, points, router]);

  useEffect(() => {
    if (!filtersReady) return;

    const ac = new AbortController();
    const params = new URLSearchParams();

    params.set("userId", userId);
    params.set("time", time);
    params.set("category", category);
    params.set("group", group);
    if (groupValue.trim()) params.set("groupValue", groupValue.trim());
    params.set("points", String(points));

    setLoading(true);
    setError("");

    fetch(`/api/history?${params.toString()}`, { signal: ac.signal, cache: "no-store" })
      .then(async (r) => {
        const text = await r.text();
        if (!r.ok) throw new Error(text || `HTTP ${r.status}`);
        if (!text.trim()) throw new Error("Empty response body from /api/history");
        try {
          return JSON.parse(text) as ApiResp;
        } catch {
          throw new Error(`Invalid JSON from /api/history:\n${text.slice(0, 400)}`);
        }
      })
      .then((m) => {
        if ((m as any)?.error) throw new Error((m as any).error);
        setModel({
          ok: Boolean(m.ok),
          history: Array.isArray(m.history) ? m.history : [],
          transactions: Array.isArray(m.transactions) ? m.transactions : [],
          snapshot: (m as any).snapshot,
        });
      })
      .catch((e: any) => {
        if (e?.name === "AbortError") return;
        setError(String(e?.message || e));
        setModel(null);
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [filtersReady, userId, time, category, group, groupValue, points]);

  const history = model?.history ?? [];
  const txAll = model?.transactions ?? [];

  const chartData = useMemo(() => {
    return history.map((h) => ({
      ...h,
      label: fmtDateLabel(h.t, time),
      rank: typeof h.userRank === "number" && Number.isFinite(h.userRank) ? h.userRank : null,
      ratio: typeof h.userSpentRatio === "number" && Number.isFinite(h.userSpentRatio) ? h.userSpentRatio : null,
    }));
  }, [history, time]);

  const latest = history.length ? history[history.length - 1] : null;

  const txCategories = useMemo(() => {
    const set = new Set<string>();
    for (const r of txAll) if (r?.category) set.add(r.category);
    return ["all", ...Array.from(set).sort()];
  }, [txAll]);

  const txFiltered = useMemo(() => {
    const q = txQuery.trim().toLowerCase();
    const min = minAmt.trim() ? Number(minAmt) : null;
    const max = maxAmt.trim() ? Number(maxAmt) : null;

    return txAll.filter((r) => {
      const catOk = txCat === "all" ? true : (r.category ?? "") === txCat;
      const text = `${r.merchant ?? ""} ${r.note ?? ""} ${r.category ?? ""}`.toLowerCase();
      const qOk = !q ? true : text.includes(q);

      const amt = typeof r.amount === "number" ? r.amount : Number(r.amount);
      const minOk = min == null || !Number.isFinite(min) ? true : amt >= min;
      const maxOk = max == null || !Number.isFinite(max) ? true : amt <= max;

      return catOk && qOk && minOk && maxOk;
    });
  }, [txAll, txQuery, txCat, minAmt, maxAmt]);

  return (
    <div className="w-full max-w-[1200px] mx-auto">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-[28px] font-black text-neutral-900">History</h1>
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

            <div>
              <div className="mb-1 text-xs font-semibold text-neutral-500">Points</div>
              <input
                type="number"
                min={5}
                max={90}
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px]"
                value={points}
                onChange={(e) => setPoints(Math.max(5, Math.min(90, Math.floor(Number(e.target.value) || 12))))}
              />
            </div>
          </div>
        </div>

        {/* Right side */}
        <div className="col-span-12 md:col-span-9 space-y-6">
          {/* Ranking History */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-bold text-neutral-900">Ranking History</div>

              <div className="flex gap-2">
                <button
                  className={`rounded-full border px-3 py-1 text-xs font-bold ${
                    chartMode === "rank"
                      ? "border-[rgb(0,32,91)] text-[rgb(0,32,91)]"
                      : "border-neutral-200 text-neutral-700"
                  }`}
                  onClick={() => setChartMode("rank")}
                >
                  Rank
                </button>
                <button
                  className={`rounded-full border px-3 py-1 text-xs font-bold ${
                    chartMode === "ratio"
                      ? "border-[rgb(0,32,91)] text-[rgb(0,32,91)]"
                      : "border-neutral-200 text-neutral-700"
                  }`}
                  onClick={() => setChartMode("ratio")}
                >
                  Spent Ratio
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="text-xs font-semibold text-neutral-600">Latest Rank</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <div className="text-[22px] font-black text-neutral-900">{latest?.userRank != null ? `#${latest.userRank}` : "—"}</div>
                  <div className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-bold text-neutral-700">
                    / {latest?.numUsers ?? "—"}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="text-xs font-semibold text-neutral-600">Latest spent_ratio</div>
                <div className="mt-1 text-[22px] font-black text-neutral-900">{fmtPct(latest?.userSpentRatio)}</div>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-2">
              {loading ? (
                <div className="p-4 text-[13px] text-neutral-600">Loading…</div>
              ) : error ? (
                <div className="p-4 text-[13px] font-semibold text-red-600">{error}</div>
              ) : !model ? (
                <div className="p-4 text-[13px] text-neutral-600">No data</div>
              ) : (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer>
                    <LineChart data={chartData} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      {chartMode === "rank" ? (
                        <YAxis reversed tick={{ fontSize: 12 }} allowDecimals={false} domain={["auto", "auto"]} />
                      ) : (
                        <YAxis tick={{ fontSize: 12 }} domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                      )}
                      <Tooltip
                        formatter={(value: any, name: any) => {
                          if (name === "rank") return [value == null ? "—" : `#${value}`, "Rank"];
                          if (name === "ratio") return [value == null ? "—" : `${(value * 100).toFixed(2)}%`, "Spent Ratio"];
                          return [value, name];
                        }}
                      />

                      {chartMode === "rank" ? (
                        <Line type="monotone" dataKey="rank" stroke="rgb(0, 32, 91)" strokeWidth={3} dot={false} isAnimationActive={false} />
                      ) : (
                        <Line type="monotone" dataKey="ratio" stroke="rgb(0, 32, 91)" strokeWidth={3} dot={false} isAnimationActive={false} />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-bold text-neutral-900">Recent Transactions</div>
              <div className="text-xs font-semibold text-neutral-500">
                showing {txFiltered.length} / {txAll.length}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-5">
                <div className="mb-1 text-xs font-semibold text-neutral-500">Search</div>
                <input
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px]"
                  value={txQuery}
                  onChange={(e) => setTxQuery(e.target.value)}
                  placeholder="merchant / note / category"
                />
              </div>

              <div className="col-span-12 md:col-span-3">
                <div className="mb-1 text-xs font-semibold text-neutral-500">Category</div>
                <select
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px]"
                  value={txCat}
                  onChange={(e) => setTxCat(e.target.value)}
                >
                  {txCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-6 md:col-span-2">
                <div className="mb-1 text-xs font-semibold text-neutral-500">Min $</div>
                <input className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px]" value={minAmt} onChange={(e) => setMinAmt(e.target.value)} placeholder="0" />
              </div>

              <div className="col-span-6 md:col-span-2">
                <div className="mb-1 text-xs font-semibold text-neutral-500">Max $</div>
                <input className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px]" value={maxAmt} onChange={(e) => setMaxAmt(e.target.value)} placeholder="999" />
              </div>
            </div>

            <div className="mt-3 max-h-[26rem] overflow-auto rounded-xl border border-neutral-200">
              {loading ? (
                <div className="p-4 text-[13px] text-neutral-600">Loading…</div>
              ) : error ? (
                <div className="p-4 text-[13px] font-semibold text-red-600">{error}</div>
              ) : !model ? (
                <div className="p-4 text-[13px] text-neutral-600">No data</div>
              ) : txAll.length === 0 ? (
                <div className="p-4 text-[13px] text-neutral-600">No transactions returned.</div>
              ) : (
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-xs text-neutral-500">
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2">Merchant / Note</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txFiltered.slice(0, 60).map((r, idx) => (
                      <tr key={r.id ?? `${idx}`} className="border-t border-neutral-200">
                        <td className="px-3 py-2 text-neutral-700">{safeDateOnly(r.time)}</td>
                        <td className="px-3 py-2 font-semibold text-neutral-900">
                          {r.merchant ?? "—"}
                          {r.note ? <span className="ml-2 font-normal text-neutral-500">· {r.note}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-neutral-700">{r.category ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-bold text-neutral-900">{fmtMoney(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
