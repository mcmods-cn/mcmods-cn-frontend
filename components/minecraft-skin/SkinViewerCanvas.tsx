"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useI18n } from "@/app/_lib/i18n-provider";
import { SkinModel } from "@/app/_lib/skin-api";

type Props = {
  skinUrl?: string;
  capeUrl?: string;
  model?: SkinModel;
  autoRotate?: boolean;
  showOuterLayer?: boolean;
  className?: string;
};

export function SkinViewerCanvas({
  skinUrl = "",
  capeUrl = "",
  model = "default",
  autoRotate = true,
  showOuterLayer = true,
  className = "",
}: Props) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const autoRotateRef = useRef(autoRotate);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let frame = 0;
    let avatar: THREE.Group | undefined;
    const loadedTextures = new Set<THREE.Texture>();
    setLoading(true);
    setError("");

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 300);
    camera.position.set(33, 18, 52);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 34;
    controls.maxDistance = 90;
    controls.target.set(0, -1, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(18, 28, 22);
    scene.add(keyLight);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(13, 48),
      new THREE.MeshBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.13, depthWrite: false }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -16.2;
    scene.add(ground);

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

    Promise.all([loadTexture(skinUrl), loadTexture(capeUrl)])
      .then(([skinTexture, capeTexture]) => {
        if (skinTexture) loadedTextures.add(skinTexture);
        if (capeTexture) loadedTextures.add(capeTexture);
        if (cancelled) {
          skinTexture?.dispose();
          capeTexture?.dispose();
          return;
        }
        avatar = buildAvatar(skinTexture, capeTexture, model, showOuterLayer);
        avatar.rotation.y = -0.34;
        scene.add(avatar);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setLoading(false);
          setError(reason instanceof Error ? reason.message : t("skins.previewLoadFailed"));
        }
      });

    const clock = new THREE.Clock();
    const render = () => {
      const delta = Math.min(clock.getDelta(), 0.1);
      if (avatar && autoRotateRef.current) avatar.rotation.y += delta * 0.18;
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
      if (avatar) disposeGroup(avatar);
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      loadedTextures.forEach((texture) => texture.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [capeUrl, model, showOuterLayer, skinUrl, t]);

  return (
    <div className={`relative min-h-80 overflow-hidden ${className}`}>
      <div ref={hostRef} className="absolute inset-0" />
      {loading ? <div className="absolute inset-0 grid place-items-center text-sm font-bold text-[var(--muted)]">{t("common.loading")}</div> : null}
      {error ? <div className="absolute inset-0 grid place-items-center p-5 text-center text-sm font-bold text-[var(--red)]">{error}</div> : null}
    </div>
  );
}

async function loadTexture(url: string) {
  if (!url) return null;
  const texture = await new THREE.TextureLoader().loadAsync(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  // TextureLoader uploads DOM images bottom-up by default. The UV rectangles
  // below use Minecraft's top-left atlas coordinates and therefore need the
  // normal Three.js Y flip. Disabling it made every face sample a vertically
  // mirrored part of the atlas (often an empty outer-layer area).
  texture.flipY = true;
  texture.needsUpdate = true;
  return texture;
}

function buildAvatar(skin: THREE.Texture | null, cape: THREE.Texture | null, model: SkinModel, showOuterLayer: boolean) {
  const group = new THREE.Group();
  const armWidth = model === "slim" ? 3 : 4;
  const legacy = skin ? textureHeight(skin) * 2 <= textureWidth(skin) : false;

  if (skin) {
    group.add(texturedBox(skin, 8, 8, 8, cubeUV(0, 0, 8, 8, 8), [0, 12, 0]));
    group.add(texturedBox(skin, 8, 12, 4, cubeUV(16, 16, 8, 12, 4), [0, 2, 0]));
    group.add(texturedBox(skin, armWidth, 12, 4, cubeUV(40, 16, armWidth, 12, 4), [-(4 + armWidth / 2), 2, 0]));
    group.add(texturedBox(skin, armWidth, 12, 4, cubeUV(legacy ? 40 : 32, legacy ? 16 : 48, armWidth, 12, 4), [4 + armWidth / 2, 2, 0], legacy));
    group.add(texturedBox(skin, 4, 12, 4, cubeUV(0, 16, 4, 12, 4), [-2, -10, 0]));
    group.add(texturedBox(skin, 4, 12, 4, cubeUV(legacy ? 0 : 16, legacy ? 16 : 48, 4, 12, 4), [2, -10, 0], legacy));

    if (showOuterLayer) {
      group.add(texturedBox(skin, 8.6, 8.6, 8.6, cubeUV(32, 0, 8, 8, 8), [0, 12, 0], false, true));
      if (!legacy) {
        group.add(texturedBox(skin, 8.5, 12.5, 4.5, cubeUV(16, 32, 8, 12, 4), [0, 2, 0], false, true));
        group.add(texturedBox(skin, armWidth + 0.5, 12.5, 4.5, cubeUV(40, 32, armWidth, 12, 4), [-(4 + armWidth / 2), 2, 0], false, true));
        group.add(texturedBox(skin, armWidth + 0.5, 12.5, 4.5, cubeUV(48, 48, armWidth, 12, 4), [4 + armWidth / 2, 2, 0], false, true));
        group.add(texturedBox(skin, 4.5, 12.5, 4.5, cubeUV(0, 32, 4, 12, 4), [-2, -10, 0], false, true));
        group.add(texturedBox(skin, 4.5, 12.5, 4.5, cubeUV(0, 48, 4, 12, 4), [2, -10, 0], false, true));
      }
    }
  } else {
    const material = new THREE.MeshStandardMaterial({ color: 0x8fa3b8, roughness: 0.82, metalness: 0.02 });
    group.add(solidBox(8, 8, 8, [0, 12, 0], material));
    group.add(solidBox(8, 12, 4, [0, 2, 0], material));
    group.add(solidBox(armWidth, 12, 4, [-(4 + armWidth / 2), 2, 0], material));
    group.add(solidBox(armWidth, 12, 4, [4 + armWidth / 2, 2, 0], material));
    group.add(solidBox(4, 12, 4, [-2, -10, 0], material));
    group.add(solidBox(4, 12, 4, [2, -10, 0], material));
  }

  if (cape) {
    const capeMesh = texturedBox(cape, 10, 16, 1, cubeUV(0, 0, 10, 16, 1), [0, 2, -2.8], false, true, capeAtlasScale(cape));
    capeMesh.rotation.x = -0.12;
    group.add(capeMesh);
  }
  return group;
}

function texturedBox(
  texture: THREE.Texture,
  width: number,
  height: number,
  depth: number,
  faces: UVRect[],
  position: [number, number, number],
  mirror = false,
  overlay = false,
  atlasScale = textureWidth(texture) / 64,
) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  applyFaceUVs(geometry, faces, textureWidth(texture), textureHeight(texture), mirror, atlasScale);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.01,
    depthWrite: true,
    side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geometry, Array.from({ length: 6 }, () => material));
  mesh.position.set(...position);
  mesh.renderOrder = overlay ? 2 : 1;
  return mesh;
}

function solidBox(width: number, height: number, depth: number, position: [number, number, number], material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(...position);
  return mesh;
}

function cubeUV(u: number, v: number, width: number, height: number, depth: number): UVRect[] {
  return [
    { x: u, y: v + depth, width: depth, height },
    { x: u + depth + width, y: v + depth, width: depth, height },
    { x: u + depth, y: v, width, height: depth },
    { x: u + depth + width, y: v, width, height: depth },
    { x: u + depth, y: v + depth, width, height },
    { x: u + depth * 2 + width, y: v + depth, width, height },
  ];
}

function applyFaceUVs(geometry: THREE.BoxGeometry, faces: UVRect[], atlasWidth: number, atlasHeight: number, mirror: boolean, atlasScale: number) {
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  for (let face = 0; face < 6; face += 1) {
    const sourceFace = mirror && face === 0 ? 1 : mirror && face === 1 ? 0 : face;
    const rect = faces[sourceFace];
    const left = rect.x * atlasScale / atlasWidth;
    const right = (rect.x + rect.width) * atlasScale / atlasWidth;
    const top = 1 - rect.y * atlasScale / atlasHeight;
    const bottom = 1 - (rect.y + rect.height) * atlasScale / atlasHeight;
    const u0 = mirror ? right : left;
    const u1 = mirror ? left : right;
    const offset = face * 4;
    uv.setXY(offset, u0, top);
    uv.setXY(offset + 1, u1, top);
    uv.setXY(offset + 2, u0, bottom);
    uv.setXY(offset + 3, u1, bottom);
  }
  uv.needsUpdate = true;
}

function capeAtlasScale(texture: THREE.Texture) {
  const width = textureWidth(texture);
  const height = textureHeight(texture);
  // Both the modern 64x32 cape atlas and the legacy 22x17 atlas use the
  // same 10x16x1 cuboid layout, but their scaling bases differ.
  return width / height < 1.6 ? width / 22 : width / 64;
}

function textureWidth(texture: THREE.Texture) {
  const image = texture.image as { naturalWidth?: number; width?: number } | undefined;
  return Math.max(1, image?.naturalWidth || image?.width || 64);
}

function textureHeight(texture: THREE.Texture) {
  const image = texture.image as { naturalHeight?: number; height?: number } | undefined;
  return Math.max(1, image?.naturalHeight || image?.height || 64);
}

function disposeGroup(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const value = object.material;
    if (Array.isArray(value)) value.forEach((material) => materials.add(material));
    else materials.add(value);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

type UVRect = { x: number; y: number; width: number; height: number };
