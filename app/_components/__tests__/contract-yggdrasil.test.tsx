import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminYggdrasilPanel, defaultAdminYggdrasilConfig } from "../admin-yggdrasil-panel";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../../_lib/api", () => ({ apiRequest: mocks.api }));
vi.mock("../../_lib/i18n-provider", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);
beforeEach(() => { vi.resetAllMocks(); mocks.api.mockResolvedValue(defaultAdminYggdrasilConfig); });

it("sends only the strict backend write DTO and retains runtime status locally", async () => {
  render(<AdminYggdrasilPanel token="cookie-session" initialConfig={{
    ...defaultAdminYggdrasilConfig,
    hasPrivateKey: true,
    persistentPrivateKey: true,
    available: true,
    disabledReason: "Synthetic runtime status",
  }} />);
  fireEvent.change(screen.getByRole("textbox", { name: "admin.yggdrasil.serverName" }), { target: { value: "Edited synthetic server" } });
  fireEvent.click(screen.getByRole("button", { name: "common.save" }));
  await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
  const [endpoint, options, token] = mocks.api.mock.calls[0];
  expect(endpoint).toBe("/api/v1/admin/config/yggdrasil");
  expect(options.method).toBe("PUT");
  expect(token).toBe("cookie-session");
  const request = JSON.parse(options.body);
  expect(Object.keys(request).sort()).toEqual([
    "enabled", "joinTtlSeconds", "maxTokens", "privateKeyBase64", "publicBaseUrl",
    "rotatePrivateKey", "serverName", "textureBaseUrl", "textureMaxBytes",
    "tokenTtlHours", "trustedProxyCidrs",
  ].sort());
  expect(request.serverName).toBe("Edited synthetic server");
  expect(request.privateKeyBase64).toBe("");
  expect(request.rotatePrivateKey).toBe(false);
  expect(await screen.findByText("admin.yggdrasil.saved")).toBeTruthy();
});

it("retains the explicit signing-key rotation option in the write DTO", async () => {
  render(<AdminYggdrasilPanel token="cookie-session" initialConfig={defaultAdminYggdrasilConfig} />);
  fireEvent.click(screen.getByRole("checkbox", { name: /admin.yggdrasil.rotateKey/ }));
  fireEvent.click(screen.getByRole("button", { name: "common.save" }));
  await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
  expect(JSON.parse(mocks.api.mock.calls[0][1].body).rotatePrivateKey).toBe(true);
});
