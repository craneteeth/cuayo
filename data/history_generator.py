import json
import sys
import datetime
import argparse

REF_TIME = datetime.datetime(2019, 2, 15)  # ✅ 고정 기준일

def _shift_time(ref: datetime.datetime, timeframe: str, k: int) -> datetime.datetime:
    if timeframe == "d":
        return ref - datetime.timedelta(days=k)
    if timeframe == "w":
        return ref - datetime.timedelta(days=7 * k)
    y, m = ref.year, ref.month - k
    while m <= 0:
        y -= 1
        m += 12
    day = min(ref.day, 28)
    return datetime.datetime(y, m, day)

def _call_search_df(search_df, user_id, category, timeframe, ref_time, group, group_value):
    # 현재 rank_generator 시그니처: search_df(user_id, category, time, ref_time, state=None)
    # group/group_value는 사실상 state에만 의미가 있으므로 State일 때만 state로 넘김
    state = None
    if (group or "").lower() == "state" and (group_value or "").strip():
        state = group_value.strip()

    # 가장 안전한 호출 (현재 네 rank_generator와 일치)
    return search_df(user_id, category, timeframe, ref_time, state=state)

def _normalize_num_users(x):
    # rank_generator가 빈 데이터일 때 num_users를 []로 주는 버그가 있음 → 여기서 방어
    if x is None:
        return None
    if isinstance(x, list):
        return 0
    try:
        return int(x)
    except Exception:
        return None

def _parse_snapshot(snap):
    """
    snap이 dict일 수도, tuple/list일 수도 있어서 둘 다 처리.
    반환: (user_rank, user_ratio, num_users, top_percent)
    """
    user_rank = None
    user_ratio = None
    num_users = None
    top_percent = None

    # 1) dict 형태 (build_category_payload 같은 경우)
    if isinstance(snap, dict):
        user_rank = snap.get("userRank", snap.get("user_rank"))
        user_ratio = snap.get("userSpentRatio", snap.get("user_spent_ratio"))
        num_users = snap.get("numUsers", snap.get("num_users"))
        top_percent = snap.get("topPercent", snap.get("top_percent"))

        num_users = _normalize_num_users(num_users)

        # topPercent가 없으면 계산
        if top_percent is None and user_rank is not None and num_users:
            try:
                top_percent = (float(user_rank) / float(num_users)) * 100.0
            except Exception:
                top_percent = None

        return user_rank, user_ratio, num_users, top_percent

    # 2) tuple/list 형태: (user_spent_ratio, user_rank, num_users, top_users, top_spent_ratios)
    if isinstance(snap, (list, tuple)):
        if len(snap) >= 3:
            user_ratio = snap[0]
            user_rank = snap[1]
            num_users = snap[2]
            num_users = _normalize_num_users(num_users)

            if user_rank is not None and num_users:
                try:
                    top_percent = (float(user_rank) / float(num_users)) * 100.0
                except Exception:
                    top_percent = None

        return user_rank, user_ratio, num_users, top_percent

    return None, None, None, None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--user_id", default="EuLe21")
    ap.add_argument("--category", default="food_dining")
    ap.add_argument("--time", default="m", choices=["d", "w", "m"])
    ap.add_argument("--group", default="State")
    ap.add_argument("--group_value", default="")
    ap.add_argument("--points", type=int, default=12)
    args = ap.parse_args()

    user_id = args.user_id or "EuLe21"
    category = args.category
    timeframe = args.time or "m"
    group = args.group or "State"
    group_value = args.group_value or ""
    points = max(5, min(90, int(args.points)))

    try:
        from rank_generator import search_df
    except Exception as e:
        sys.stdout.write(json.dumps({"ok": False, "error": f"Failed to import rank_generator.search_df: {e}"}, ensure_ascii=False))
        return

    history = []
    last_snapshot = None

    try:
        for i in range(points - 1, -1, -1):
            t = _shift_time(REF_TIME, timeframe, i)
            snap = _call_search_df(search_df, user_id, category, timeframe, t, group, group_value)

            # ✅ dict/tuple 모두 파싱
            user_rank, user_ratio, num_users, top_percent = _parse_snapshot(snap)

            # 마지막 스냅샷 저장 (transactions는 사실 rank_generator에서 안 주니 참고용)
            if snap is not None:
                last_snapshot = snap

            history.append({
                "t": t.isoformat(),
                "userRank": None if user_rank is None else int(user_rank),
                "userSpentRatio": None if user_ratio is None else float(user_ratio),
                "numUsers": None if num_users is None else int(num_users),
                "topPercent": None if top_percent is None else float(top_percent),
            })

        # rank_generator.search_df는 transactions를 주지 않으므로 빈 배열 유지
        out = {"ok": True, "history": history, "transactions": [], "snapshot": last_snapshot}
        sys.stdout.write(json.dumps(out, ensure_ascii=False))
    except Exception as e:
        sys.stdout.write(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))

if __name__ == "__main__":
    main()
