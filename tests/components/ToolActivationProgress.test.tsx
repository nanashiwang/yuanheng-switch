import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolActivationProgress } from "@/components/desktop/ToolActivationProgress";

describe("ToolActivationProgress", () => {
  it("shows the verified activation chain while waiting for the first request", () => {
    render(
      <ToolActivationProgress
        activation={{
          app: "codex",
          configuredAt: 1,
          configWritten: true,
          routeRequired: true,
          routeReady: true,
          requestReceived: false,
          requestSucceeded: false,
          lastRequestAt: null,
          lastStatusCode: null,
          lastModel: null,
          message: "配置与路由已就绪，等待工具发出第一条请求",
        }}
        preflight={{
          app: "codex",
          model: "gpt-5.6-sol",
          group: "premium",
          status: "ok",
          sourceProtocol: "openai_responses",
          targetProtocol: "openai_responses",
          streamingSupported: true,
          toolCall: "unknown",
          reasoningSupported: true,
          imageInput: "unknown",
          checks: [],
          message: "兼容性预检通过，可以安全配置",
        }}
      />,
    );

    expect(screen.getByText("预检通过")).toBeInTheDocument();
    expect(screen.getByText("配置已写入")).toBeInTheDocument();
    expect(screen.getByText("路由已启动")).toBeInTheDocument();
    expect(screen.getByText("已收到请求")).toBeInTheDocument();
    expect(screen.getByText("模型调用成功")).toBeInTheDocument();
    expect(
      screen.getByText("配置与路由已就绪，等待工具发出第一条请求"),
    ).toBeInTheDocument();
  });

  it("does not claim request success for tools outside the local route", () => {
    render(
      <ToolActivationProgress
        activation={{
          app: "opencode",
          configuredAt: 1,
          configWritten: true,
          routeRequired: false,
          routeReady: true,
          requestReceived: false,
          requestSucceeded: false,
          lastRequestAt: null,
          lastStatusCode: null,
          lastModel: null,
          message: "该工具请求不可观测",
        }}
      />,
    );

    expect(screen.getByText("请求不可观测")).toBeInTheDocument();
  });
});
