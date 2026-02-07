import numpy as np
import pandas as pd
import datetime
import os


def search_df(user_id, category, time, ref_time, state=None):
    """
    :param user_id: user_id of the user we want to find the rank and spent ratio for
    :param category: category of transactions to consider
        Possible categories:
        {'food_dining', 'travel', 'entertainment', 'personal_care', 'grocery', 
        'health_fitness', 'kids_pets', 'misc', 'gas_transport', 'home', 'shopping'}
    :param time: time window to consider, either daily (d), weekly (w), or monthly (m)
    :param ref_time: reference time in datetime format
    :param state: state to create rank
    :return:
    user_spent_ratio: the spent ratio of the user_id in the given category, time window and state
    user_rank: the rank of the user_id in the given category, time window and state
    num_users: the number of user_ids with nonzero spent_ratio in the given category, time window and state
    top_users: the list of user_ids of top 3 ranked users and the user of rank 
               right before me and after me, and the list of spent_ratio of those users
    top_spent_ratios: the list of spent_ratio of top 3 ranked users and the user of rank
                     right before me and after me

    Note that user_spent_ratio = 0 and user_rank = None 
            if the user hasn't spent money on category over time frame
    Note that top_users = top_spent_ratios = [] 
            if there are no transactions in category at all over time frame
    """
    df = pd.read_csv(os.path.join(os.path.dirname(__file__), "credit_card_transaction.csv"))
    # Check if user_id is in df
    if user_id not in df['user_id'].values:
        raise ValueError("user_id not found in dataset. Please check the user_id and try again.")
    #print(df.head())
    # Category: filter by category
    df = df[df['category'] == category]
    # State: if not none, filter by state
    if state is not None:
        df = df[df['state'] == state]
    # Time: time is either daily (d), weekly (w), or monthly (m)
    # ref time is ref time in datetime format
    # convert ref time to unix time
    ref_time_unix = int(ref_time.timestamp())
    # filter by time
    if time == 'd':
        df = df[(df['unix_time'] >= ref_time_unix - 86400) & (df['unix_time'] <= ref_time_unix)]
    elif time == 'w':
        df = df[(df['unix_time'] >= ref_time_unix - 7*86400) & (df['unix_time'] <= ref_time_unix)]
    elif time == 'm':
        df = df[(df['unix_time'] >= ref_time_unix - 30*86400) & (df['unix_time'] <= ref_time_unix)]

    # Aggregate by amt
    amt_spent_user = df.groupby('user_id')['amt'].sum().reset_index()
    #print(amt_spent_user.head())
    # If there is no data for all users
    if amt_spent_user.empty:
        return 0, None, [], []
    #print(df.head())

    # Make a new column spent_ratio = amt / (salary/12) if m, salary/52 if w, salary/365 if d
    salary_ratio = 12 if time == 'm' else 52 if time == 'w' else 365
    amt_spent_user = amt_spent_user.merge(df[['user_id', 'salary', 'name']].drop_duplicates(), on='user_id', how='left')
    # Round to 4 digits after decimal
    amt_spent_user['spent_ratio'] = (amt_spent_user['amt'] / (amt_spent_user['salary'] / salary_ratio)).round(4)

    # Rank by spent_ratio
    amt_spent_user['rank'] = amt_spent_user['spent_ratio'].rank(ascending=True, method='min')
    ranked_df = amt_spent_user.sort_values(by='rank')
    #print(ranked_df[ranked_df['user_id'] == user_id])

    # Return the spent_ratio of user_id, rank of user_id, number of user_ids with nonzero values and the list of names of top 3 ranked users and the user of rank right before me and after me, and the list of spent_ratio of those users
    if user_id in ranked_df['user_id'].values:
        user_row = ranked_df[ranked_df['user_id'] == user_id].iloc[0]
        user_spent_ratio = user_row['spent_ratio']
        user_rank = int(user_row['rank'])
        user_name = user_row['name'] if 'name' in user_row.index else None
        if user_rank <= 3:
            # User is in top 3, return only first 3 rows but ensure user's name appears (replace if tied)
            top_3_df = ranked_df[ranked_df['rank'] <= 3].head(3).copy()
            top_3_df = top_3_df[top_3_df['user_id'] != user_id]
            top_3_df = pd.concat([top_3_df, user_row.to_frame().T], ignore_index=True)
            top_3_df = top_3_df.sort_values(by='rank').head(3)
            top_users = top_3_df['name'].tolist()
            top_spent_ratios = top_3_df['spent_ratio'].tolist()
            return user_spent_ratio, user_rank, len(ranked_df[ranked_df['spent_ratio'] > 0]), top_users, top_spent_ratios
        else:
            # User rank is greater than 3, so return top 3 names and one name before and after user
            top_3_df = ranked_df[ranked_df['rank'] <= 3].head(3).copy()
            top_users = top_3_df['name'].tolist()
            top_spent_ratios = top_3_df['spent_ratio'].tolist()

            # Get one user with rank < user_rank (right before)
            before_user_df = ranked_df[ranked_df['rank'] < user_rank].tail(1)
            # Get one user with rank > user_rank (right after)
            after_user_df = ranked_df[ranked_df['rank'] > user_rank].head(1)

            final_users = top_users.copy()
            final_spent_ratios = top_spent_ratios.copy()

            # Add before user if exists and not already in top 3
            if not before_user_df.empty:
                before_name = before_user_df.iloc[0]['name']
                before_spent = before_user_df.iloc[0]['spent_ratio']
                if before_name not in final_users:
                    final_users.append(before_name)
                    final_spent_ratios.append(before_spent)

            # Add user's name
            if user_name not in final_users:
                final_users.append(user_name)
                final_spent_ratios.append(user_spent_ratio)

            # Add after user if exists and not already in top 3
            if not after_user_df.empty:
                after_name = after_user_df.iloc[0]['name']
                after_spent = after_user_df.iloc[0]['spent_ratio']
                if after_name not in final_users:
                    final_users.append(after_name)
                    final_spent_ratios.append(after_spent)

            return user_spent_ratio, user_rank, len(ranked_df[ranked_df['spent_ratio'] > 0]), final_users, final_spent_ratios
    else:
        # Return 0, None, top 3 user names
        top_3_df = ranked_df[ranked_df['rank'] <= 3].head(3)
        top_users = top_3_df['name'].tolist()
        top_spent_ratios = top_3_df['spent_ratio'].tolist()
        return 0, None, len(ranked_df[ranked_df['spent_ratio'] > 0]), top_users, top_spent_ratios

def update_df(user_id, category, time, amt, state):
    """
    Docstring for update_df
    
    :param user_id: user_id of the user who made the transaction
    :param category: category of the transaction
    :param time: time the transaction was made in datetime format
    :param amt: amount of the transaction
    :param state: state where the transaction was made
    """ 
    df = pd.read_csv(os.path.join(os.path.dirname(__file__), "credit_card_transaction.csv"))
    # Get salary of user_id
    if user_id in df['user_id'].values:
        salary = df[df['user_id'] == user_id]['salary'].values[0]
    else:
        raise ValueError("user_id not found in dataset. Please check the user_id and try again.")
    # Create a new row with the transaction data and append to df
    new_row = {'user_id': user_id, 'category': category, 'unix_time': int(time.timestamp()), 'amt': amt, 'state': state, 'salary': salary}
    df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
    # Write the updated df to csv
    df.to_csv(os.path.join(os.path.dirname(__file__), "credit_card_transaction.csv"), index=False)

def user_best_worst(user_id, time, ref_time):
    """
    Docstring for user_best_worst
    
    :param user_id: user_id of the user we want to find the best and worst category for
    :param time: time window to consider, either daily (d), weekly (w), or monthly (m)
    :param ref_time: reference time in datetime format
    :return: best_category, worst_category
    best_category is the category with highest rank for the user_id in the given time window
    worst_category is the category with lowest nonzero rank for the user_id in the given time window
    If there are multiple categories tied for best or worst, return any one of them
    If there are no transactions for the user_id in the given time window, return None, None
    Return in json format: {"best_category": best_category, "worst_category": worst_category, "best_rank": best_rank, "worst_rank": worst_rank}
    """
    df = pd.read_csv(os.path.join(os.path.dirname(__file__), "credit_card_transaction.csv"))
    # Check if user_id is in df
    if user_id not in df['user_id'].values:
        raise ValueError("user_id not found in dataset. Please check the user_id and try again.")
    categories = df['category'].unique()
    best_category = None
    worst_category = None
    best_rank = float('inf')
    worst_rank = float('-inf')
    for category in categories:
        user_spent_ratio, user_rank, num_users, top_users, top_spent_ratios = search_df(user_id, category, time, ref_time)
        if user_rank is not None:
            if user_rank < best_rank:
                best_rank = user_rank
                best_category = category
            if user_rank > worst_rank:
                worst_rank = user_rank
                worst_category = category
    if best_category is None:
        return {"best_category": None, "worst_category": None, "best_rank": None, "worst_rank": None}
    return {"best_category": best_category, "worst_category": worst_category, "best_rank": best_rank, "worst_rank": worst_rank}

def search_user(user_id, timeframe, ref_time):
    """
    Docstring for search_user
    
    :param user_id: user_id of the user we want to search for
    :param timeframe: time window to consider, either daily (d), weekly (w), or monthly (m)
    :return: a json style output of the user's transactions in the given time window, with the 
    total amount spent in each category and the total amount spent overall
    """
    df = pd.read_csv(os.path.join(os.path.dirname(__file__), "credit_card_transaction.csv"))
    # Check if user_id is in df
    if user_id not in df['user_id'].values:
        raise ValueError("user_id not found in dataset. Please check the user_id and try again.")
    # Filter by user_id and timeframe
    df = df[df['user_id'] == user_id]
    # Get salary of user_id
    salary = df['salary'].values[0]
    df = df[df['unix_time'] <= ref_time.timestamp()]
    if timeframe == 'd':
        df = df[df['unix_time'] >= ref_time.timestamp() - 86400]
    elif timeframe == 'w':
        df = df[df['unix_time'] >= ref_time.timestamp() - 604800]
    elif timeframe == 'm':
        df = df[df['unix_time'] >= ref_time.timestamp() - 2592000]
    #print(df)
    # Group by category and sum the amounts
    category_totals = df.groupby('category')['amt'].sum()
    # Get total amount spent
    total_spent = df['amt'].sum()
    budget = salary / 12 if timeframe == 'm' else salary / 52 if timeframe == 'w' else salary / 365
    #print(salary)
    #print(budget)
    # Return json style output
    # One line per each category
    output = {}
    for category, total in category_totals.items():
        """_, user_rank, num_users, _, _ = search_df(user_id, category, timeframe, ref_time)
        # Calculate percentile rank of user is user_rank is not None, else 0
        output[category] = (round(total, 2), round(user_rank/num_users if user_rank else 0, 4)"""
        output[category] = round(total, 2)
    output['total'] = round(total_spent, 2)
    output['budget'] = round(budget,2)
    return output

def _build_display_entries(user_rank, top_users, top_spent_ratios):
    display_entries = []

    n = min(len(top_users), len(top_spent_ratios))
    names = list(top_users)[:n]
    ratios = [float(x) for x in list(top_spent_ratios)[:n]]

    if user_rank is None:
        for i in range(n):
            display_entries.append({"name": names[i], "rank": i + 1, "spent_ratio": ratios[i]})
        return display_entries

    if user_rank <= 3:
        for i in range(n):
            display_entries.append({"name": names[i], "rank": i + 1, "spent_ratio": ratios[i]})
        return display_entries

    # user_rank > 3
    if n >= 1:
        display_entries.append({"name": names[0], "rank": 1, "spent_ratio": ratios[0]})
    if n >= 2:
        display_entries.append({"name": names[1], "rank": 2, "spent_ratio": ratios[1]})
    if n >= 3:
        display_entries.append({"name": names[2], "rank": 3, "spent_ratio": ratios[2]})
    if n >= 4:
        display_entries.append({"name": names[3], "rank": int(user_rank) - 1, "spent_ratio": ratios[3]})
    if n >= 5:
        display_entries.append({"name": names[4], "rank": int(user_rank), "spent_ratio": ratios[4]})
    if n >= 6:
        display_entries.append({"name": names[5], "rank": int(user_rank) + 1, "spent_ratio": ratios[5]})

    return display_entries


def _to_rows(display_entries):
    rows = []
    # display_entries: [{name, rank, spent_ratio}, ...]
    for e in display_entries:
        rows.append({
            "kind": "data",
            "rank": int(e["rank"]),
            "name": str(e["name"]),
            "metricLabel": "Spent Ratio",
            "metricValue": float(e["spent_ratio"]),
            "trend": "•"
        })
    return rows


def build_category_payload(user_id, category, time, ref_dt, state=None):
    user_spent_ratio, user_rank, num_users, top_users, top_spent_ratios = search_df(
        user_id, category, time, ref_dt, state=state
    )

    top_percent = None
    if user_rank is not None and num_users:
        top_percent = (user_rank / num_users) * 100

    display_entries = _build_display_entries(user_rank, top_users, top_spent_ratios)

    rows = _to_rows(display_entries)

    return {
        "metricLabel": "Spent Ratio",
        "rows": rows,
        "displayEntries": display_entries,
        "userSpentRatio": float(user_spent_ratio),
        "userRank": None if user_rank is None else int(user_rank),
        "numUsers": 0 if num_users == [] else int(num_users),
        "topPercent": None if top_percent is None else float(top_percent),
        "refTime": ref_dt.isoformat(),
    }



def user_best_worst_payload(user_id, time, ref_dt):
    bw = user_best_worst(user_id, time, ref_dt)
    best_cat = bw.get("best_category")
    worst_cat = bw.get("worst_category")

    best_model = None
    worst_model = None

    if best_cat is not None:
        best_model = build_category_payload(user_id, best_cat, time, ref_dt, state=None)

    if worst_cat is not None:
        worst_model = build_category_payload(user_id, worst_cat, time, ref_dt, state=None)

    return {
        "userId": user_id,
        "time": time,
        "group": "State",
        "groupValue": "",
        "best": {"category": best_cat, "model": best_model},
        "worst": {"category": worst_cat, "model": worst_model},
        "refTime": ref_dt.isoformat(),
    }


if __name__ == "__main__":
    import argparse
    import json
    import sys

    parser = argparse.ArgumentParser()
    parser.add_argument("--user_id", type=str, required=True)
    parser.add_argument("--time", type=str, required=True)  # d / w / m
    parser.add_argument("--category", type=str, required=False)
    parser.add_argument("--state", type=str, default=None)

    parser.add_argument("--home_best_worst", action="store_true")

    args = parser.parse_args()

    ref_dt = datetime.datetime(2019, 2, 15)

    if args.home_best_worst:
        payload = user_best_worst_payload(args.user_id, args.time, ref_dt)
        print(json.dumps(payload))
        sys.stdout.flush()
        raise SystemExit(0)

    if not args.category:
        raise ValueError("Missing --category (required when not using --home_best_worst)")

    payload = build_category_payload(args.user_id, args.category, args.time, ref_dt, state=args.state)
    print(json.dumps(payload))
    sys.stdout.flush()