import { CEP_Config } from "vite-cep-plugin";
import { version } from "./package.json";

// CEP manifests only accept numeric major.minor.patch versions
const manifestVersion = version.replace(/-.*$/, "");

const config: CEP_Config = {
  version: manifestVersion,
  id: "com.pendulum.cep",
  displayName: "Pendulum",
  symlink: "local",
  port: 3000,
  servePort: 5000,
  startingDebugPort: 8860,
  extensionManifestVersion: 6.0,
  requiredRuntimeVersion: 9.0,
  hosts: [
    { name: "AEFT", version: "[0.0,99.9]" },
  ],

  type: "Panel",
  iconDarkNormal: "./src/assets/light-icon.png",
  iconNormal: "./src/assets/dark-icon.png",
  iconDarkNormalRollOver: "./src/assets/light-icon.png",
  iconNormalRollOver: "./src/assets/dark-icon.png",
  parameters: ["--v=0", "--enable-nodejs", "--mixed-context"],
  width: 300,
  height: 500,

  panels: [
    {
      mainPath: "./main/index.html",
      name: "main",
      panelDisplayName: "Pendulum",
      autoVisible: true,
      width: 300,
      height: 500,
    },
  ],
  build: {
    jsxBin: "off",
    sourceMap: true,
  },
  zxp: {
    country: "US",
    province: "CA",
    org: "Company",
    password: "password",
    tsa: [
      "http://timestamp.digicert.com/", // Windows Only
      "http://timestamp.apple.com/ts01", // MacOS Only
    ],
    allowSkipTSA: false,
    sourceMap: false,
    jsxBin: "off",
  },
  installModules: [],
  copyAssets: ["scripts"],
  copyZipAssets: [],
};
export default config;
