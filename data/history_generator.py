# Desktop/cuayo/data/history_generator.py
import json
import sys
import datetime
import argparse
import random

REF_TIME = datetime.datetime(2019, 2, 15)


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
    """
    rank_generator.search_df 시그니처:
    search_df(user_id, category, time, ref_time, state=None)
    """
    state = None
    if (group or "").lower() == "state" and (group_value or "").strip():
        state = group_value.strip()
    return search_df(user_id, category, timeframe, ref_time, state=state)


def _normalize_num_users(x):
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
    if isinstance(snap, dict):
        user_rank = snap.get("userRank", snap.get("user_rank"))
        user_ratio = snap.get("userSpentRatio", snap.get("user_spent_ratio"))
        num_users = snap.get("numUsers", snap.get("num_users"))
        top_percent = snap.get("topPercent", snap.get("top_percent"))
        num_users = _normalize_num_users(num_users)

        if top_percent is None and user_rank is not None and num_users:
            try:
                top_percent = (float(user_rank) / float(num_users)) * 100.0
            except Exception:
                top_percent = None

        return user_rank, user_ratio, num_users, top_percent

    if isinstance(snap, (list, tuple)):
        if len(snap) >= 3:
            user_ratio = snap[0]
            user_rank = snap[1]
            num_users = _normalize_num_users(snap[2])

            if user_rank is not None and num_users:
                try:
                    top_percent = (float(user_rank) / float(num_users)) * 100.0
                except Exception:
                    top_percent = None

        return user_rank, user_ratio, num_users, top_percent

    return None, None, None, None


def _mock_transaction_history(
    user_id: str,
    timeframe: str,
    ref_time: datetime.datetime,
    category =  None,
    limit: int = 12,
):
    categories = [
        "food_dining", "grocery", "gas_transport", "shopping",
        "entertainment", "home", "health_fitness", "misc"
    ]
    if category:
        cats = [category]
    else:
        cats = categories

    merchants = [
        "Star Coffee", "QuickMart", "City Gas", "Online Shop",
        "Movie House", "Green Pharmacy", "Home Supplies", "Sushi Place"
    ]
    states = ["CA", "NY", "TX", "WA", "FL", "IL"]

    if timeframe == "d":
        max_back = 24 * 60 * 60
    elif timeframe == "w":
        max_back = 7 * 24 * 60 * 60
    else:
        max_back = 30 * 24 * 60 * 60

    rng = random.Random(hash((user_id, timeframe, ref_time.isoformat(), category)) & 0xFFFFFFFF)

    txs = []
    for i in range(max(0, int(limit))):
        back = rng.randint(0, max_back)
        t = ref_time - datetime.timedelta(seconds=back)

        amt = round(rng.uniform(3.5, 120.0), 2)
        cat = rng.choice(cats)
        merchant = rng.choice(merchants)
        state = rng.choice(states)

        txs.append({
            "id": f"mock_{int(ref_time.timestamp())}_{i}",
            "t": t.isoformat(),
            "userId": user_id,
            "category": cat,
            "merchant": merchant,
            "state": state,
            "amount": amt,
            "currency": "USD",
        })

    txs.sort(key=lambda x: x["t"], reverse=True)
    return txs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--user_id", default="EuLe21")
    ap.add_argument("--category", default="food_dining")
    ap.add_argument("--time", default="m", choices=["d", "w", "m"])
    ap.add_argument("--group", default="State")
    ap.add_argument("--group_value", default="")
    ap.add_argument("--points", type=int, default=12)
    ap.add_argument("--tx_limit", type=int, default=12)
    args = ap.parse_args()

    user_id = args.user_id or "EuLe21"
    category = args.category
    timeframe = args.time or "m"
    group = args.group or "State"
    group_value = args.group_value or ""
    points = max(5, min(90, int(args.points)))
    tx_limit = max(0, min(50, int(args.tx_limit)))

    try:
        from rank_generator import search_df
    except Exception as e:
        sys.stdout.write(json.dumps({"ok": False, "error": f"Failed to import rank_generator.search_df: {e}"}, ensure_ascii=False))
        return

    history = []
    last_ref_time = None
    last_snapshot = None

    try:
        for i in range(points - 1, -1, -1):
            t = _shift_time(REF_TIME, timeframe, i)
            snap = _call_search_df(search_df, user_id, category, timeframe, t, group, group_value)

            user_rank, user_ratio, num_users, top_percent = _parse_snapshot(snap)

            last_ref_time = t
            last_snapshot = snap

            history.append({
                "t": t.isoformat(),
                "userRank": None if user_rank is None else int(user_rank),
                "userSpentRatio": None if user_ratio is None else float(user_ratio),
                "numUsers": None if num_users is None else int(num_users),
                "topPercent": None if top_percent is None else float(top_percent),
            })

        transactions = _mock_transaction_history(
            user_id=user_id,
            timeframe=timeframe,
            ref_time=last_ref_time or REF_TIME,
            category=None, 
            limit=tx_limit,
        )

        out = {"ok": True, "history": history, "transactions": transactions, "snapshot": last_snapshot}
        sys.stdout.write(json.dumps(out, ensure_ascii=False))

    except Exception as e:
        sys.stdout.write(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
