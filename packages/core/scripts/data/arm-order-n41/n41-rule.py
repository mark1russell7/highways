"""The sentinel rule of the narrow read, stated before the run. Arguments: before folder, now folder, then the sentinel ids."""
import glob
import json
import math
import statistics as st
import sys

before, now = sys.argv[1], sys.argv[2]
ids = sys.argv[3:]


def reports(root):
    return [json.load(open(p, encoding="utf-8")) for p in sorted(glob.glob(root + "/**/paired-job*.json", recursive=True))]


B = reports(before)
N = reports(now)
model = lambda r: r["env"]["cpu"]
print("before jobs", [model(r) for r in B])
print("now jobs", [model(r) for r in N])
base = {}
for r in B:
    for i in r["inputs"]:
        if i["id"] in ids:
            base.setdefault((model(r), i["id"]), []).append(st.median(i["ms"]["old"]))
counted = 0
ok = 0
for r in N:
    m = model(r)
    known = any(k[0] == m for k in base)
    print("job", r["env"].get("runner"), m, "in before run" if known else "OUTSIDE the before run: does not count")
    if not known:
        continue
    counted += 1
    logs = []
    aa = []
    for sid in ids:
        i = next(x for x in r["inputs"] if x["id"] == sid)
        ref = st.mean(base[(m, sid)])
        logs.append(abs(math.log(st.median(i["ms"]["old"]) / ref)))
        pairs = [math.log(b / a) for a, b in zip(i["ms"]["old"], i["ms"]["old~aa"])]
        aa.append(abs(st.median(pairs)))
    med = st.median(logs)
    good = med <= 0.05 and max(logs) <= 0.12 and max(aa) <= 0.16
    ok += good
    print("  median", round(med, 4), "(limit .05) largest", round(max(logs), 4), "(limit .12) largest A/A", round(max(aa), 4), "(limit .16)", "HOLDS" if good else "FAILS", [round(x, 3) for x in logs])
print("counted", counted, "of", len(N), "hold", ok, "| fewer than 3 counted is no read")
print("inputs in each report", [len(r["inputs"]) for r in N], "rounds", [len(N[0]["inputs"][0]["ms"]["old"])])
