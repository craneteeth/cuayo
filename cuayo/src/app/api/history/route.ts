// app/api/history/route.ts
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";

export const runtime = "nodejs";

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

type PyHistoryPayload = {
  ok: boolean;
  history: HistoryPoint[];
  transactions: TxRow[];
  snapshot?: any;
  error?: string;
};

function normalizeTime(x: string | null): TimeOpt {
  if (x === "d" || x === "w" || x === "m") return x;
  return "m"; // ✅ default month
}
function normalizeGroup(x: string | null): GroupOpt {
  if (x === "District" || x === "City" || x === "State" || x === "Gender" || x === "Age") return x;
  return "State"; // ✅ default State
}
function normalizeCategory(x: string | null): CategoryOpt {
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
  return "food_dining";
}
function normalizeInt(x: string | null, fallback: number, min: number, max: number) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  const k = Math.floor(n);
  return Math.max(min, Math.min(max, k));
}

// ✅ Desktop/cuayo/data 를 기본으로 찾도록
function resolvePyDir() {
  // 1) env 우선
  if (process.env.PY_DIR && fs.existsSync(process.env.PY_DIR)) return process.env.PY_DIR;

  // 2) 후보들: projectRoot/data, projectRoot/../data
  const cands = [
    path.join(process.cwd(), "data"),
    path.join(process.cwd(), "..", "data"),
  ];
  for (const p of cands) {
    if (fs.existsSync(p)) return p;
  }
  return cands[1]; // 기본은 ../data
}

function resolveHistoryPy(pyDir: string) {
  if (process.env.HISTORY_PY && fs.existsSync(process.env.HISTORY_PY)) return process.env.HISTORY_PY;
  return path.join(pyDir, "history_generator.py");
}

function runHistoryPython(args: {
  userId: string;
  category: CategoryOpt;
  time: TimeOpt;
  group: GroupOpt;
  groupValue: string;
  points: number;
}): Promise<PyHistoryPayload> {
  return new Promise((resolve, reject) => {
    const pyDir = resolvePyDir();
    const pyPath = resolveHistoryPy(pyDir);

    if (!fs.existsSync(pyDir)) {
      reject(new Error(`PY_DIR not found: ${pyDir}`));
      return;
    }
    if (!fs.existsSync(pyPath)) {
      reject(new Error(`history_generator.py not found: ${pyPath}`));
      return;
    }

    // ✅ 레퍼런스 route 스타일: CLI args로 전달
    const scriptArgs = [
      pyPath,
      "--user_id",
      args.userId,
      "--category",
      args.category,
      "--time",
      args.time,
      "--group",
      args.group,
      "--points",
      String(args.points),
    ];
    if (args.groupValue.trim()) {
      scriptArgs.push("--group_value", args.groupValue.trim());
    }

    const isWin = process.platform === "win32";

    // ✅ ENOENT 해결 핵심:
    // - Windows에서 python이 PATH에 없으면 "py -3"로 실행
    // - env로 PYTHON_BIN이 지정되면 그걸 우선 사용
    const pythonBin = process.env.PYTHON_BIN?.trim();
    const usePyLauncher = isWin && (!pythonBin || pythonBin.toLowerCase() === "python");

    const cmd = usePyLauncher ? "py" : (pythonBin || (isWin ? "python" : "python3"));
    const cmdArgs = usePyLauncher ? ["-3", ...scriptArgs] : scriptArgs;

    const child: ChildProcessWithoutNullStreams = spawn(cmd, cmdArgs, {
      cwd: pyDir,
      env: {
        ...process.env,
        PYTHONPATH: pyDir, // rank_generator import 안정화
      },
      stdio: ["pipe", "pipe", "pipe"],
      shell: isWin, // Windows에서 PATH/py 실행 안정화
    });

    let out = "";
    let err = "";

    child.stdout.on("data", (d) => (out += d.toString("utf-8")));
    child.stderr.on("data", (d) => (err += d.toString("utf-8")));

    // ✅ ENOENT/권한 등의 spawn 실패를 반드시 잡아야 uncaughtException이 안 남
    child.on("error", (e: any) => {
      reject(new Error(`spawn failed: ${String(e?.message || e)} (cmd=${cmd})`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err || `python exited with code ${code}`));
        return;
      }
      const raw = (out || "").trim();
      if (!raw) {
        reject(new Error("Python produced empty stdout"));
        return;
      }
      try {
        const parsed = JSON.parse(raw) as PyHistoryPayload;
        // 디버그용 stderr를 필요하면 같이 붙여서 확인 가능
        if (err && (parsed as any) && typeof parsed === "object") (parsed as any)._stderr = err;
        resolve(parsed);
      } catch {
        reject(new Error(`Invalid JSON from python:\n${raw.slice(0, 800)}`));
      }
    });
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    // ✅ 요구사항: 기본 userId=EuLe21 + time=m
    const userId = url.searchParams.get("userId")?.trim() || "EuLe21";
    const time = normalizeTime(url.searchParams.get("time"));
    const category = normalizeCategory(url.searchParams.get("category"));

    // ✅ History 페이지 기본: State
    const group = normalizeGroup(url.searchParams.get("group"));
    const groupValue = url.searchParams.get("groupValue")?.trim() || "";

    const points = normalizeInt(url.searchParams.get("points"), 12, 5, 90);

    const py = await runHistoryPython({ userId, category, time, group, groupValue, points });

    if (!py?.ok) {
      return NextResponse.json({ ok: false, error: py?.error ?? "history_generator failed", detail: py }, { status: 200 });
    }

    return NextResponse.json(py, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 200 });
  }
}
