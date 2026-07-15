"use client";

/**
 * The one deliberate 3D object on Occestra: a small amethyst geode flower.
 *
 * Seven independently cut stones share one centre. The scene is an enhancement:
 * it is intent-loaded by hero-enhancements.tsx, capped at DPR 1.5, and its
 * render loop is stopped completely when the hero leaves the viewport. The SVG
 * cluster remains the permanent reduced-motion / no-WebGL face.
 */
import { Float, Sparkles } from "@react-three/drei";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { EffectComposer, SelectiveBloom } from "@react-three/postprocessing";
import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import type { Theme } from "@/components/ui/theme";

const LILAC = "#C8B4FF";
const WARM = "#FFD0A8";

type CrystalSpec = {
  position: [number, number, number];
  rotation: [number, number, number];
  radius: number;
  length: number;
  phase: number;
  color: string;
  accent?: boolean;
};

const CRYSTALS: readonly CrystalSpec[] = [
  { position: [0, -0.52, 0], rotation: [0.02, 0, -0.03], radius: 0.34, length: 1.76, phase: 0.2, color: "#7648A8" },
  { position: [-0.26, -0.46, 0.04], rotation: [0.08, -0.08, 0.55], radius: 0.27, length: 1.38, phase: 1.4, color: "#8D5CC2", accent: true },
  { position: [0.28, -0.48, 0.06], rotation: [-0.08, 0.1, -0.58], radius: 0.3, length: 1.48, phase: 2.5, color: "#683B98" },
  { position: [-0.4, -0.43, -0.08], rotation: [0.2, -0.14, 0.96], radius: 0.22, length: 1.08, phase: 3.2, color: "#A06DD0" },
  { position: [0.43, -0.42, -0.06], rotation: [-0.18, 0.12, -1.02], radius: 0.23, length: 1.13, phase: 4.3, color: "#8250B6", accent: true },
  { position: [-0.13, -0.5, -0.24], rotation: [0.42, -0.14, 0.3], radius: 0.22, length: 1.16, phase: 5.1, color: "#5B347F" },
  { position: [0.16, -0.49, -0.25], rotation: [0.4, 0.16, -0.34], radius: 0.2, length: 1.02, phase: 5.9, color: "#B07BDA" },
] as const;

function useThemeMode(): Theme {
  const [theme, setTheme] = useState<Theme>("daylight");
  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "nocturne" ? "nocturne" : "daylight");
    const change = (event: Event) => setTheme((event as CustomEvent<Theme>).detail);
    window.addEventListener("oce-themechange", change);
    return () => window.removeEventListener("oce-themechange", change);
  }, []);
  return theme;
}

function Crystal({
  spec,
  theme,
  accentTip,
}: {
  spec: CrystalSpec;
  theme: Theme;
  accentTip?: RefObject<THREE.Mesh | null>;
}) {
  const group = useRef<THREE.Group>(null);
  const tipHeight = Math.max(0.22, spec.radius * 1.18);
  const bodyLength = spec.length - tipHeight;

  useFrame((state) => {
    if (!group.current) return;
    const micro = Math.sin(state.clock.elapsedTime * 0.34 + spec.phase) * 0.025;
    group.current.rotation.y = spec.rotation[1] + micro;
  });

  const emissive = theme === "nocturne" && spec.accent ? "#B05AE8" : "#1B0928";
  const emissiveIntensity = theme === "nocturne" ? (spec.accent ? 1.9 : 0.16) : 0;
  const sharedMaterial = {
    color: spec.color,
    transmission: theme === "nocturne" ? 0.34 : 0.68,
    thickness: 0.82,
    ior: 1.72,
    roughness: theme === "nocturne" ? 0.16 : 0.1,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    iridescence: 0.62,
    iridescenceIOR: 1.36,
    envMapIntensity: theme === "nocturne" ? 1.25 : 2.1,
    attenuationColor: spec.accent ? WARM : LILAC,
    attenuationDistance: 2.6,
    emissive,
    emissiveIntensity,
    flatShading: true,
  } as const;

  return (
    <group ref={group} position={spec.position} rotation={spec.rotation}>
      <mesh position={[0, bodyLength / 2, 0]} castShadow={false} receiveShadow={false}>
        <cylinderGeometry args={[spec.radius * 0.82, spec.radius, bodyLength, 6, 1, false]} />
        <meshPhysicalMaterial {...sharedMaterial} />
      </mesh>
      <mesh ref={accentTip} position={[0, bodyLength + tipHeight / 2, 0]} castShadow={false} receiveShadow={false}>
        <coneGeometry args={[spec.radius * 0.82, tipHeight, 6, 1, false]} />
        <meshPhysicalMaterial {...sharedMaterial} />
      </mesh>
    </group>
  );
}

function ClusterScene() {
  const root = useRef<THREE.Group>(null);
  const glint = useRef<THREE.PointLight>(null);
  const bloomLight = useRef<THREE.PointLight>(null);
  const accentOne = useRef<THREE.Mesh>(null);
  const accentTwo = useRef<THREE.Mesh>(null);
  const press = useRef(1);
  const [ready, setReady] = useState(false);
  const theme = useThemeMode();

  const envMap = useLoader(THREE.TextureLoader, "/artifacts/florist-collage.webp");
  const { scene } = useThree();
  useEffect(() => {
    envMap.mapping = THREE.EquirectangularReflectionMapping;
    envMap.colorSpace = THREE.SRGBColorSpace;
    scene.environment = envMap;
    setReady(true);
    return () => {
      scene.environment = null;
    };
  }, [envMap, scene]);

  useEffect(() => {
    const down = () => (press.current = 0.94);
    const up = () => (press.current = 1);
    window.addEventListener("oce-cta-press", down);
    window.addEventListener("oce-cta-release", up);
    return () => {
      window.removeEventListener("oce-cta-press", down);
      window.removeEventListener("oce-cta-release", up);
    };
  }, []);

  useFrame((state, delta) => {
    const cluster = root.current;
    if (!cluster) return;
    cluster.rotation.y += delta * 0.075;
    cluster.rotation.x = THREE.MathUtils.lerp(cluster.rotation.x, state.pointer.y * -0.08, 0.035);
    cluster.rotation.z = THREE.MathUtils.lerp(cluster.rotation.z, state.pointer.x * 0.07, 0.035);
    const nextScale = THREE.MathUtils.lerp(cluster.scale.x, press.current, 0.11);
    cluster.scale.setScalar(nextScale);

    // A narrow specular light crosses the front facets once every seven seconds.
    if (glint.current) {
      const sweep = (state.clock.elapsedTime % 7) / 7;
      const active = sweep < 0.18;
      const t = Math.min(1, sweep / 0.18);
      glint.current.position.set(THREE.MathUtils.lerp(-1.7, 1.7, t), 1.15 - Math.abs(t - 0.5) * 0.45, 1.8);
      glint.current.intensity = active ? Math.sin(t * Math.PI) * (theme === "nocturne" ? 4.2 : 3.2) : 0;
    }
  });

  const accents = [accentOne.current, accentTwo.current].filter((value): value is THREE.Mesh => Boolean(value));
  const lights = bloomLight.current ? [bloomLight.current] : [];

  return (
    <>
      <Float speed={0.65} rotationIntensity={0.08} floatIntensity={0.14} floatingRange={[-0.04, 0.05]}>
        <group ref={root} position={[0, -0.08, 0]} rotation={[0.04, -0.18, 0]}>
          {CRYSTALS.map((spec, index) => {
            const accentTip = index === 1 ? accentOne : index === 4 ? accentTwo : undefined;
            return <Crystal key={index} spec={spec} theme={theme} {...(accentTip ? { accentTip } : {})} />;
          })}
          <mesh position={[0, -0.48, -0.02]} scale={[0.82, 0.32, 0.68]}>
            <dodecahedronGeometry args={[0.62, 0]} />
            <meshPhysicalMaterial
              color={theme === "nocturne" ? "#4B2868" : "#9A74B6"}
              roughness={0.42}
              clearcoat={0.72}
              clearcoatRoughness={0.28}
              flatShading
            />
          </mesh>
        </group>
      </Float>

      <Sparkles count={14} scale={[2.4, 2.05, 1.45]} size={1.25} speed={0.12} noise={0.42} color={theme === "nocturne" ? LILAC : "#8C62B4"} opacity={0.48} />
      <ambientLight intensity={theme === "nocturne" ? 0.45 : 0.92} color={theme === "nocturne" ? "#5B3975" : "#FFF8EF"} />
      <directionalLight position={[2.8, 3.4, 2.2]} intensity={theme === "nocturne" ? 1.25 : 2.7} color="#FFF0DC" />
      <directionalLight position={[-3, 1.1, 3]} intensity={theme === "nocturne" ? 1.6 : 0.9} color={LILAC} />
      <pointLight ref={bloomLight} position={[0, 0.25, 0.8]} intensity={theme === "nocturne" ? 3.2 : 0} distance={4} color="#D16EFF" />
      <pointLight ref={glint} position={[-1.7, 1.1, 1.8]} intensity={0} distance={4} color="#FFF4DD" />

      {theme === "nocturne" && ready && accents.length === 2 && lights.length === 1 ? (
        <EffectComposer multisampling={0} resolutionScale={0.65}>
          <SelectiveBloom
            selection={accents}
            lights={lights}
            intensity={0.72}
            luminanceThreshold={0.72}
            luminanceSmoothing={0.18}
            width={256}
            height={256}
          />
        </EffectComposer>
      ) : null}
    </>
  );
}

export function PrismCanvas({ onPerformanceFail }: { onPerformanceFail: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), {
      threshold: 0.05,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The FPS budget is enforced on the visitor's actual device. After the lazy
  // chunk and texture have settled, sample two seconds of real frame cadence;
  // an animated scene is allowed to remain only when it clears 55fps.
  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    let cancelled = false;
    const settle = window.setTimeout(() => {
      let first = 0;
      let frames = 0;
      const sample = (at: number) => {
        if (cancelled) return;
        if (!first) first = at;
        frames += 1;
        const elapsed = at - first;
        if (elapsed < 2_000) {
          frame = requestAnimationFrame(sample);
          return;
        }
        const fps = ((frames - 1) * 1_000) / elapsed;
        if (fps < 55) onPerformanceFail();
      };
      frame = requestAnimationFrame(sample);
    }, 1_000);
    return () => {
      cancelled = true;
      window.clearTimeout(settle);
      cancelAnimationFrame(frame);
    };
  }, [visible, onPerformanceFail]);

  return (
    <div ref={wrap} className="h-36 w-36 sm:h-44 sm:w-44" aria-hidden>
      <Canvas
        dpr={[1, 1.5]}
        frameloop={visible ? "always" : "never"}
        gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
        camera={{ position: [0, 0.42, 4.15], fov: 36 }}
      >
        <ClusterScene />
      </Canvas>
    </div>
  );
}

export default PrismCanvas;
