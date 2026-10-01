import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StructureCanvas } from "../components/mcmods-exporter/StructureCanvas";
import { BlockModelCanvas } from "../components/mcmods-exporter/BlockModelCanvas";
import { SkinViewerCanvas } from "../components/minecraft-skin/SkinViewerCanvas";
import type { AssetSource } from "../lib/mcmods-exporter/renderer";
vi.mock("../app/_lib/i18n-provider", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("three", async (original) => ({ ...await original<typeof import("three")>(), WebGLRenderer: class { constructor() { throw new Error("WebGL unavailable"); } } }));
vi.mock("../lib/mcmods-exporter/renderer", async (original) => ({ ...await original<typeof import("../lib/mcmods-exporter/renderer")>(), StructureRenderer: class { constructor() { throw new Error("WebGL unavailable"); } } }));
afterEach(cleanup);
const assetSource = {} as AssetSource;
describe("unsupported browser graphics recovery", () => {
  it("keeps structure pages usable when graphics initialization fails", async () => {
    render(<StructureCanvas assetSource={assetSource} source={{ key: "isolated", name: "test.nbt", load: vi.fn() }} />);
    expect(await screen.findByText("WebGL unavailable")).toBeTruthy();
  });
  it("keeps catalog entry pages usable when graphics initialization fails", async () => {
    render(<BlockModelCanvas assetSource={assetSource} blockId="minecraft:stone" />);
    expect(await screen.findByText("WebGL unavailable")).toBeTruthy();
  });
  it("keeps skin pages usable when graphics initialization fails", async () => {
    render(<SkinViewerCanvas />);
    expect(await screen.findByText("WebGL unavailable")).toBeTruthy();
  });
});
