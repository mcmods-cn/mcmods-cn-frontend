"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  buildMinecraftBlockModel,
  disposeStructureGroup,
  type AssetSource,
  type ExportedBlockEntityModel,
} from "@/lib/mcmods-exporter/renderer";
import { useI18n } from "@/app/_lib/i18n-provider";

type Props = {
  assetSource: AssetSource;
  blockId: string;
  blockEntityModel?: ExportedBlockEntityModel;
  blockState?: Record<string, unknown>;
  className?: string;
};

export function BlockModelCanvas({ assetSource, blockId, blockEntityModel, blockState, className }: Props) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let frame = 0;
    let model: THREE.Group | undefined;
    setLoading(true);
    setError("");

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x18211d, 1);
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x52605a, 2.4));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(4, 7, 5);
    scene.add(keyLight);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const normalizedState = Object.fromEntries(
      Object.entries(blockState ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
    void buildMinecraftBlockModel(assetSource, blockId, normalizedState, blockEntityModel).then((built) => {
      if (cancelled) {
        disposeStructureGroup(built);
        return;
      }
      model = built;
      const bounds = new THREE.Box3().setFromObject(built);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      built.position.sub(center);
      scene.add(built);
      const radius = Math.max(size.x, size.y, size.z, 1);
      camera.position.set(radius * 1.35, radius * 1.05, radius * 1.55);
      camera.near = Math.max(0.01, radius / 100);
      camera.far = radius * 100;
      camera.updateProjectionMatrix();
      camera.lookAt(0, 0, 0);
      controls.update();
      renderer.render(scene, camera);
      setLoading(false);
    }).catch((reason: unknown) => {
      if (!cancelled) {
        setLoading(false);
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    });

    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      if (model) disposeStructureGroup(model);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [assetSource, blockId, blockEntityModel, blockState]);

  return <div className={className} style={{ minHeight: 320, position: "relative", overflow: "hidden" }}>
    <div ref={hostRef} className="absolute inset-0" />
    {loading ? <div className="absolute inset-0 grid place-items-center bg-[var(--panel-subtle)] font-bold text-[var(--muted)]">{t("mods.exportImport.entry.loadingModel")}</div> : null}
    {error ? <div className="absolute inset-0 grid place-items-center bg-[var(--panel-subtle)] p-5 text-center text-sm font-bold text-[var(--red)]">{error}</div> : null}
  </div>;
}
