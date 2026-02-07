// app/api/home-rankings/route.ts
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

export const runtime = "nodejs"; // 안정적으로 python 실행

function resolvePyPath() {
  const candidates = [
    path.join(process.cwd(), "data", "rank_generator.py"),
    path.join(process.cwd(), "..", "data", "rank_generator.py"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return candidates[0];
}

function runPythonHome(): Promise<any> {
  return new Promise((resolve, reject) => {
    const pyPath = resolvePyPath();

    const pyArgs: string[] = [
      pyPath,
      "--user_id",
      "EuLe21",
      "--time",
      "w",
      "--home_best_worst",
    ];

    const child = spawn("python", pyArgs, { cwd: process.cwd() });

    let out = "";
    let err = "";

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err || `python exited with code ${code}`));
        return;
      }
      if (!out.trim()) {
        reject(new Error("Python produced empty output"));
        return;
      }
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error(`Invalid JSON from python:\n${out.slice(0, 500)}`));
      }
    });
  });
}

export async function GET() {
  try {
    const payload = await runPythonHome();
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
