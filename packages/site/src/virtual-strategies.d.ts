// The module of the data of the strategies page. The plugin of vite.config.ts makes it from the registry and the committed files at build time.
declare module "virtual:strategies" {
  const data: import("./strategies-data.ts").StrategiesData;
  export default data;
}
