The core has a benchmark. It routes each fixture with each router, checks the hard rules and measures the quality of the result.

This table shows the committed snapshot of one run of the workflow `Bench`, in `docs/research/bench/`. The Pages build does not start a race. Lower is better in each column. The best value of each column is green.

The column "Time ÷ shared" divides the time of the router by the time of `shared`. The two routers route the fixture in turn on the same CPU, so the ratio does not change with the speed of the runner. Only a snapshot with the paired arm has this column.

The workflow [`Bench`](https://github.com/mark1russell7/highways/actions/workflows/bench.yml) races the routers on all the fixtures, to 100 000 nodes. Its summary has the full table.
