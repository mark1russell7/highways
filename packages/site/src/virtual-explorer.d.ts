// The module of the data of the explorer page. The plugin of vite.config.ts makes it from the committed sweep records at build time.
declare module "virtual:explorer" {
  const data: import("./explorer-data.ts").ExplorerPage;
  export default data;
}
