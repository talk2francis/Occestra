"use client";

/**
 * The ONE deliberate 3D element on the whole site: a faceted amethyst above
 * the hero. Real refraction — the environment map is a real keepsake artwork
 * from the store, so the artifact imagery literally lives inside the stone.
 *
 * Budget discipline: lazy chunk, DPR capped at 1.5, render loop fully frozen
 * offscreen, and the SVG prism stands in for reduced-motion, missing WebGL,
 * and the moment before the chunk arrives.
 */
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const AMETHYST = "#6B3FA0";
const PLUM = "#2D1B4E";
const LILAC = "#C8B4FF";

function Gem() {
  const mesh = useRef<THREE.Mesh>(null);
  const press = useRef(1);

  // The real hero collage becomes the light the stone refracts — warm ivory
  // with the amethyst accents, straight from the store.
  const envMap = useLoader(THREE.TextureLoader, "/artifacts/florist-collage.webp");
  const { scene } = useThree();
  useEffect(() => {
    envMap.mapping = THREE.EquirectangularReflectionMapping;
    envMap.colorSpace = THREE.SRGBColorSpace;
    scene.environment = envMap;
    return () => {
      scene.environment = null;
    };
  }, [envMap, scene]);

  // The hero CTA "presses" the stone.
  useEffect(() => {
    const down = () => (press.current = 0.93);
    const up = () => (press.current = 1);
    window.addEventListener("oce-cta-press", down);
    window.addEventListener("oce-cta-release", up);
    return () => {
      window.removeEventListener("oce-cta-press", down);
      window.removeEventListener("oce-cta-release", up);
    };
  }, []);

  useFrame((state, delta) => {
    const gem = mesh.current;
    if (!gem) return;
    // slow idle turn + a breath of vertical drift
    gem.rotation.y += delta * 0.22;
    gem.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.06;
    // subtle lean toward the cursor — a look, not a chase
    const leanX = state.pointer.y * -0.18;
    const leanZ = state.pointer.x * 0.14;
    gem.rotation.x = THREE.MathUtils.lerp(gem.rotation.x, leanX, 0.06);
    gem.rotation.z = THREE.MathUtils.lerp(gem.rotation.z, leanZ, 0.06);
    // the press settles like weight
    const scale = THREE.MathUtils.lerp(gem.scale.x, press.current, 0.12);
    gem.scale.setScalar(scale);
  });

  return (
    <mesh ref={mesh} scale={1}>
      <octahedronGeometry args={[1.05, 0]} />
      <meshPhysicalMaterial
        color="#7B4BB5"
        transmission={0.55}
        thickness={1.1}
        ior={1.8}
        roughness={0.18}
        metalness={0}
        envMapIntensity={1.7}
        flatShading
        attenuationColor={LILAC}
        attenuationDistance={3.2}
      />
    </mesh>
  );
}

export function PrismCanvas() {
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  // Freeze the loop entirely when the hero scrolls away.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), {
      threshold: 0.05,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrap} className="h-32 w-28 sm:h-40 sm:w-36" aria-hidden>
      <Canvas
        dpr={[1, 1.5]}
        frameloop={visible ? "always" : "never"}
        gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
        camera={{ position: [0, 0, 3.4], fov: 38 }}
      >
        {/* scaled so the elongated stone fits the tall frame */}
        <group scale={[0.86, 1.12, 0.86]}>
          <Gem />
        </group>
        <ambientLight intensity={0.85} color="#FAF7F2" />
        <directionalLight position={[2.5, 3, 2]} intensity={2.2} color="#FFF6E8" />
        <directionalLight position={[-3, 1, 3]} intensity={0.9} color={LILAC} />
        <pointLight position={[0, -2, 2]} intensity={0.6} color="#FAF7F2" />
      </Canvas>
    </div>
  );
}

export default PrismCanvas;
