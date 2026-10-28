// The module of the data of the results page. The plugin of vite.config.ts makes it from the committed files at build time.
declare module "virtual:results" {
  const data: import("./results-data.ts").ResultsData;
  export default data;
}
