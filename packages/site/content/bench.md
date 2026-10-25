The core has a benchmark. It routes each fixture with each router, checks the hard rules and measures the quality of the result.

At each deploy, the Pages workflow races the routers on the fixtures to 1 000 nodes. This table shows that race. Lower is better in each column. The best value of each column is green.

The workflow [`Bench`](https://github.com/mark1russell7/highways/actions/workflows/bench.yml) races the routers on all the fixtures, to 100 000 nodes. Its summary has the full table.
