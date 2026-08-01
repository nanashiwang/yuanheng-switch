import tauriConfig from "../../src-tauri/tauri.conf.json";

const githubReleaseManifest =
  "https://github.com/nanashiwang/yuanheng-switch/releases/latest/download/latest.json";

describe("desktop updater config", () => {
  it("uses a JSON release manifest as the primary endpoint", () => {
    expect(tauriConfig.plugins.updater.endpoints[0]).toBe(
      githubReleaseManifest,
    );
  });

  it("does not include the YuanHeng SPA fallback route", () => {
    expect(tauriConfig.plugins.updater.endpoints).not.toContain(
      "https://cn.meta-api.vip/desktop/update/latest.json",
    );
  });
});
