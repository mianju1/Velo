import { describe, expect, it } from "vitest";
import { buildServerUrl } from "./server-url";

describe("服务器地址输入", () => {
  it("根据端口为无协议域名补全协议", () => {
    expect(buildServerUrl("emby.example.test", "80")).toBe("http://emby.example.test:80");
    expect(buildServerUrl("emby.example.test", "443")).toBe("https://emby.example.test:443");
    expect(buildServerUrl("emby.example.test", "8096")).toBe("http://emby.example.test:8096");
  });

  it("保留用户手动输入的协议", () => {
    expect(buildServerUrl("https://emby.example.test", "443")).toBe("https://emby.example.test:443");
    expect(buildServerUrl("http://emby.example.test", "")).toBe("http://emby.example.test");
  });
});
