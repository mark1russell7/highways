"""The classes of the shift read, by arm and vector set. Arguments: the files of A, B and C."""
import collections
import json
import sys

names = ["A", "B", "C"]
data = {n: json.load(open(p)) for n, p in zip(names, sys.argv[1:])}
for n, rows in data.items():
    for group, test in (("record", lambda r: r["vector"].startswith("shift")), ("hand", lambda r: r["vector"].startswith("hand"))):
        part = [r for r in rows if test(r)]
        graph = sum(r["edges"] for r in part if r["countsDiffer"])
        same = [r for r in part if not r["countsDiffer"]]
        print(n, group, "moves", sum(r["edges"] for r in part), "graph", graph, "search", sum(r["rawMoved"] for r in same), "other", sum(r["edges"] - r["rawMoved"] for r in same), "| rows with counts that differ", sum(1 for r in part if r["countsDiffer"]), "of", len(part), "raw moved in graph rows", sum(r["rawMoved"] for r in part if r["countsDiffer"]))
        by = collections.Counter()
        for r in part:
            by[r["board"]] += r["edges"]
        print("   boards", dict(by.most_common(12)))
print("per row, B against A, record vectors: rows in both, edges")
a = {(r["vector"], r["board"]): r for r in data["A"]}
b = {(r["vector"], r["board"]): r for r in data["B"]}
for k in sorted(set(a) | set(b)):
    if not k[0].startswith("shift"):
        continue
    x, y = a.get(k), b.get(k)
    print(k, "A", x and (x["edges"], x["countsDiffer"], x["rawMoved"]), "B", y and (y["edges"], y["countsDiffer"], y["rawMoved"]))
