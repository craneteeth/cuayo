// app/api/history/route.ts
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

type TimeOpt = "d" | "w" | "m";

function normalizeTime(x: string | null): TimeOpt {
  if (x === "d" || x === "w" || x === "m") return x;
  return "w";
}

function normalizeInt(x: string | null, fallback: number, min: number, max: number): number {
  const n = Number(x ?? "");
  if (!Number.isFinite(n)) return fallback;
  const v = Math.floor(n);
  return Math.max(min, Math.min(max, v));
}

function safeStr(x: string | null, fallback = ""): string {
  return (x ?? fallback).toString();
}

function resolvePyDir(): string {
  const env = process.env.PY_DIR;
  if (env && fs.existsSync(env)) return env;

  const cand1 = path.join(process.cwd(), "data");
  if (fs.existsSync(cand1)) return cand1;

  const cand2 = path.join(process.cwd(), "..", "data");
  if (fs.existsSync(cand2)) return cand2;

  return process.cwd();
}

const PYTHON_BIN = process.env.PYTHON_BIN ?? "python";

function runPythonJSON(args: string[], cwd: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, args, {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
      },
    });

    let out = "";
    let err = "";

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");

    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));

    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      const raw = (out ?? "").trim();
      if (!raw) {
        reject(new Error(`Python produced empty stdout (code=${code}). stderr=${err.slice(0, 1200)}`));
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (err && typeof parsed === "object" && parsed) {
          (parsed as any)._stderr = err.slice(0, 2000);
        }
        resolve(parsed);
      } catch (e) {
        reject(new Error(`Invalid JSON from python (code=${code}). stdout=${raw.slice(0, 800)} stderr=${err.slice(0, 1200)}`));
      }
    });
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const userId = safeStr(url.searchParams.get("userId"), "EuLe21");
  const category = safeStr(url.searchParams.get("category"), "food_dining");
  const timeOpt = normalizeTime(url.searchParams.get("time"));
  const group = safeStr(url.searchParams.get("group"), "State");
  const groupValue = safeStr(url.searchParams.get("groupValue"), "");
  const points = normalizeInt(url.searchParams.get("points"), 12, 5, 90);

  const txLimit = normalizeInt(url.searchParams.get("txLimit"), 12, 0, 50);

  const pyDir = resolvePyDir();
  const pyScript = path.join(pyDir, "history_generator.py");

  if (!fs.existsSync(pyScript)) {
    return NextResponse.json(
      {
        ok: false,
        error: `history_generator.py not found: ${pyScript}`,
        hint: `Set PY_DIR to your data folder (e.g. Desktop/cuayo/data) or place data/history_generator.py under project root.`,
      },
      { status: 200 }
    );
  }

  const pyArgs = [
    pyScript,
    "--user_id",
    userId,
    "--category",
    category,
    "--time",
    timeOpt,
    "--group",
    group,
    "--group_value",
    groupValue,
    "--points",
    String(points),
    "--tx_limit",
    String(txLimit),
  ];

  try {
    const parsed = await runPythonJSON(pyArgs, pyDir);
    return NextResponse.json(parsed, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: String(e?.message ?? e),
        debug: {
          PYTHON_BIN,
          pyDir,
          pyScript,
          pyArgs,
        },
      },
      { status: 200 }
    );
  }
}
