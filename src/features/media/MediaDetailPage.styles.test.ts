import { describe, expect, it } from "vitest";
import appSource from "../../App.vue?raw";

describe("MediaDetailPage 背景样式", () => {
  it("播放态应让页面背景透明，避免遮挡原生 libmpv 视频层", () => {
    const playbackBodyRule = appSource.match(/body\.body--playback\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

    expect(appSource).toContain("document.body.classList.toggle(\"body--playback\"");
    expect(playbackBodyRule).toContain("background: transparent");
  });

  it("详情页虚化海报背景应保持可见，不应被整体低透明度和重遮罩盖住", () => {
    const backdropRule = appSource.match(/\.detail-backdrop\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const overlayRule = appSource.match(/\.detail-backdrop::after\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const blurSize = Number(backdropRule.match(/blur\((?<size>\d+)px\)/)?.groups?.size);

    expect(backdropRule).toContain("opacity: 1");
    expect(blurSize).toBeLessThanOrEqual(12);
    expect(overlayRule).not.toContain("72%");
    expect(overlayRule).not.toContain("82%");
  });
});

describe("媒体列表布局样式", () => {
  it("列表顶部栏固定时不使用底部外边距制造列表空隙", () => {
    const topbarRule = appSource.match(/\.media-browser-topbar\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

    expect(topbarRule).toContain("position: sticky");
    expect(topbarRule).not.toContain("margin-bottom");
  });

  it("列表顶部栏横向覆盖内容区内边距并压在列表上方", () => {
    const topbarRule = appSource.match(/\.media-browser-topbar\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

    expect(topbarRule).toContain("margin-inline: -34px");
    expect(topbarRule).toContain("padding: 28px 34px 18px");
    expect(topbarRule).toContain("z-index: 12");
  });

  it("列表顶部栏背景透明度应比旧版更高", () => {
    const topbarRule = appSource.match(/\.media-browser-topbar\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const opaquePercent = Number(topbarRule.match(/var\(--app-bg\)\s+(?<percent>\d+)%/)?.groups?.percent);

    expect(opaquePercent).toBeLessThanOrEqual(76);
  });

  it("回到顶部按钮图标使用块级居中布局", () => {
    const iconRule = appSource.match(/\.back-to-top-button svg\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

    expect(iconRule).toContain("display: block");
    expect(iconRule).toContain("margin: auto");
  });

  it("设置关闭按钮贴近右上角且上下左右边距一致", () => {
    const dialogRule = appSource.match(/\.settings-dialog\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const closeRule = appSource.match(/\.settings-close\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

    expect(dialogRule).toContain("position: relative");
    expect(closeRule).toContain("position: absolute");
    expect(closeRule).toContain("top: 14px");
    expect(closeRule).toContain("right: 14px");
  });

  it("白色主题下侧边栏滚动条使用浅色主题样式，避免滚动时出现黑柱", () => {
    const lightThemeRule = appSource.match(/:root\[data-theme="light"\]\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const sidebarRule = appSource.match(/\.media-sidebar\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const scrollbarRule = appSource.match(/\.media-sidebar::-webkit-scrollbar-thumb\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

    expect(lightThemeRule).toContain("--scrollbar-track");
    expect(lightThemeRule).toContain("--scrollbar-thumb");
    expect(sidebarRule).toContain("scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track)");
    expect(scrollbarRule).toContain("background: var(--scrollbar-thumb)");
    expect(scrollbarRule).toContain("background-clip: content-box");
  });

  it("列表内容区自身承载滚动条并覆盖滚动条轨道背景", () => {
    const contentRule = appSource.match(/\.media-browser-content\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const scrollbarTrackRule =
      appSource.match(/\.media-browser-content::-webkit-scrollbar-track\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const scrollbarThumbRule =
      appSource.match(/\.media-browser-content::-webkit-scrollbar-thumb\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

    expect(contentRule).toContain("height: 100vh");
    expect(contentRule).toContain("overflow-y: auto");
    expect(contentRule).toContain("scrollbar-gutter: stable");
    expect(contentRule).toContain("background: var(--app-bg)");
    expect(contentRule).toContain("scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track)");
    expect(scrollbarTrackRule).toContain("background: var(--scrollbar-track)");
    expect(scrollbarThumbRule).toContain("background: var(--scrollbar-thumb)");
  });
});

describe("加载状态样式", () => {
  it("加载状态区域无边框且在列表内容区居中显示", () => {
    const stateBlockRule = appSource.match(/\.state-block\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

    expect(stateBlockRule).toContain("place-content: center");
    expect(stateBlockRule).toContain("justify-items: center");
    expect(stateBlockRule).toContain("border: 0");
    expect(stateBlockRule).toContain("background: transparent");
    expect(stateBlockRule).toContain("min-height: calc(100vh - 220px)");
  });

  it("加载状态文案居中显示在动画下方", () => {
    const stateBlockRule = appSource.match(/\.state-block\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const titleRule = appSource.match(/\.state-block strong\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

    expect(stateBlockRule).toContain("text-align: center");
    expect(titleRule).toContain("display: block");
  });
});

describe("列表顶部栏控件样式", () => {
  it("顶部栏工具区使用居中对齐和统一间距", () => {
    const toolbarRule = appSource.match(/\.toolbar\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

    expect(toolbarRule).toContain("align-items: center");
    expect(toolbarRule).toContain("gap: 12px");
  });

  it("顶部栏搜索框和排序选择器使用统一的精致控件样式", () => {
    const controlRule = appSource.match(
      /\.local-library-search-input,\s*\n\.toolbar select\s*\{(?<body>[^}]+)\}/,
    )?.groups?.body ?? "";
    const selectRule = [...appSource.matchAll(/\.toolbar select\s*\{(?<body>[^}]+)\}/g)]
      .map((match) => match.groups?.body ?? "")
      .join("\n");
    const hoverRule = appSource.match(
      /\.local-library-search-input:hover,\s*\n\.toolbar select:hover\s*\{(?<body>[^}]+)\}/,
    )?.groups?.body ?? "";

    expect(controlRule).toContain("min-height: 42px");
    expect(controlRule).toContain("border-radius: 12px");
    expect(controlRule).toContain("background: color-mix");
    expect(controlRule).toContain("box-shadow: inset 0 1px 0");
    expect(selectRule).toContain("appearance: none");
    expect(selectRule).toContain("-webkit-appearance: none");
    expect(selectRule).not.toContain("linear-gradient");
    expect(selectRule).toContain("padding-right: 36px");
    expect(hoverRule).toContain("border-color: color-mix");
  });
});

describe("媒体卡片悬停动画样式", () => {
  it("列表海报不再定义播放按钮覆盖层", () => {
    expect(appSource).not.toContain(".poster-play-indicator");
    expect(appSource).not.toContain("poster-play");
  });
});

describe("视频详情信息样式", () => {
  it("详情页播放信息不再使用卡片式组件框", () => {
    expect(appSource).not.toContain(".playback-facts");

    const tagRule = appSource.match(/\.detail-resolution-tag\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const sizeRule = appSource.match(/\.detail-video-size\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const dolbyRule = appSource.match(/\.dolby-badge\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

    expect(tagRule).toContain("border-radius: 999px");
    expect(tagRule).toContain("var(--accent");
    expect(sizeRule).toContain("color: var(--text-muted)");
    expect(sizeRule).toContain("margin: 18px 0 0");
    expect(dolbyRule).toContain("display: inline-flex");
    expect(dolbyRule).toContain("#f4c542");
  });
});
