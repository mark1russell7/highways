"""By job: the sign of the sentinel move, and the A/A and head reads of router n41-64. Arguments: before folder, now folder."""
import glob
import json
import math
import statistics as st
import sys

S = "router:uniform-100-s0 router:clustered-100-s0 router:hubs-100-s0 router:fanout-100-s0 setup:uniform-100-s0 setup:fanout-100-s0".split()


def reports(root):
    return [json.load(open(p, encoding="utf-8")) for p in sorted(glob.glob(root + "/**/paired-job*.json", recursive=True))]


B, N = reports(sys.argv[1]), reports(sys.argv[2])
base = {}
for r in B:
    for i in r["inputs"]:
        base.setdefault((r["env"]["cpu"][9:13], i["id"]), []).append(st.median(i["ms"]["old"]))


def read(rows, arm):
    vals = []
    for r in rows:
        for i in r["inputs"]:
            if i["group"] == "router n41-64":
                vals.append((i["id"], st.median(math.log(b / a) for a, b in zip(i["ms"]["old"], i["ms"][arm]))))
    return vals


for k, r in enumerate(N):
    m = r["env"]["cpu"][9:13]
    signed = [math.log(st.median(next(x for x in r["inputs"] if x["id"] == s)["ms"]["old"]) / st.mean(base[(m, s)])) for s in S]
    aa = [v for _, v in read([r], "old~aa")]
    head = [v for _, v in read([r], "workspace")]
    now = [st.median(i["ms"]["old"]) for i in r["inputs"] if i["group"] == "router n41-64"]
    was = [st.mean(base[(m, i["id"])]) for i in r["inputs"] if i["group"] == "router n41-64"]
    print("job", k + 1, m, "sentinel log median", round(st.median(signed), 4), "n41-64 old arm log", round(st.median(math.log(a / b) for a, b in zip(now, was)), 4), "A/A median", round(st.median(aa), 5), "largest |A/A|", round(max(map(abs, aa)), 4), "head median", round(st.median(head), 5))
print("9V74 before reference, one job" if sum(1 for r in B if "9V74" in r["env"]["cpu"]) == 1 else "more jobs")


def join(rows, arm):
    by = {}
    for i, v in read(rows, arm):
        by.setdefault(i, []).append(v)
    meds = [st.median(v) for v in by.values()]
    return round(st.median(meds), 5), round(max(map(abs, meds)), 4)


print("all 5: A/A median, largest", join(N, "old~aa"), "head", join(N, "workspace"))
keep = [N[1], N[2], N[3]]
print("jobs 2, 3, 4 (the sentinels hold): A/A median, largest", join(keep, "old~aa"), "head", join(keep, "workspace"))
