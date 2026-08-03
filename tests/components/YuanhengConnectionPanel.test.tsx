import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { YuanhengConnectionPanel } from "@/components/desktop/YuanhengConnectionPanel";

const renderPanel = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <YuanhengConnectionPanel />
    </QueryClientProvider>,
  );
};

describe("YuanhengConnectionPanel", () => {
  it("登录允许输入超过 20 位的已有用户名", async () => {
    renderPanel();

    const username = "account-name-longer-than-twenty-characters";
    const usernameInput = await screen.findByLabelText("用户名");
    fireEvent.change(usernameInput, { target: { value: username } });
    expect(usernameInput).toHaveValue(username);

    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "password123" },
    });
    const loginButtons = screen.getAllByRole("button", { name: "登录" });
    fireEvent.click(loginButtons[loginButtons.length - 1]);

    expect(
      await screen.findByText("元衡账号已登录 · 本机工具凭据已就绪"),
    ).toBeInTheDocument();
  });

  it("使用账号密码注册并自动登录", async () => {
    renderPanel();

    expect(await screen.findByLabelText("用户名")).toBeInTheDocument();
    expect(screen.queryByText("用户 ID")).not.toBeInTheDocument();
    expect(screen.queryByText("访问令牌")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "注册" }));
    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "new-user" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("确认密码"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册并登录" }));

    expect(
      await screen.findByText("元衡账号已登录 · 本机工具凭据已就绪"),
    ).toBeInTheDocument();
  });

  it("账号开启两步验证时进入验证码步骤", async () => {
    renderPanel();

    fireEvent.change(await screen.findByLabelText("用户名"), {
      target: { value: "twofactor" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "password123" },
    });
    const loginButtons = screen.getAllByRole("button", { name: "登录" });
    fireEvent.click(loginButtons[loginButtons.length - 1]);

    expect(
      await screen.findByRole("heading", { name: "完成两步验证" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("两步验证码"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));

    await waitFor(() =>
      expect(
        screen.getByText("元衡账号已登录 · 本机工具凭据已就绪"),
      ).toBeInTheDocument(),
    );
  });
});
