// The module of the data of the atlas page. The plugin of vite.config.ts makes it from the committed records at build time.
declare module "virtual:atlas" {
  const data: import("./atlas-data.ts").AtlasPage;
  export default data;
}
