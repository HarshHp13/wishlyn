"use client";

import { useEffect, useRef } from "react";

/** Decorative geometry loads after the storefront; the CSS halo is the fallback. */
export default function GoldOrbit() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let cleanup = () => {};

    void import("three")
      .then((THREE) => {
        if (disposed) return;
        let renderer: InstanceType<typeof THREE.WebGLRenderer>;
        try {
          renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            powerPreference: "low-power",
          });
        } catch {
          return;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setClearColor(0x000000, 0);
        element.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 20);
        camera.position.z = 5.7;
        scene.add(new THREE.AmbientLight(0xfff8ec, 2));
        const key = new THREE.DirectionalLight(0xfff1d5, 5);
        key.position.set(-3, 4, 5);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xffffff, 3);
        rim.position.set(4, -1, 2);
        scene.add(rim);
        const material = new THREE.MeshStandardMaterial({
          color: 0xc6a46a,
          metalness: 0.78,
          roughness: 0.25,
        });
        const ringGeometry = new THREE.TorusGeometry(1.53, 0.042, 16, 120);
        const accentGeometry = new THREE.TorusGeometry(1.32, 0.012, 12, 100);
        const group = new THREE.Group();
        group.add(
          new THREE.Mesh(ringGeometry, material),
          new THREE.Mesh(accentGeometry, material),
        );
        group.rotation.set(0.38, -0.4, -0.35);
        scene.add(group);
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        let visible = false;
        let frame = 0;
        const render = (time: number) => {
          frame = 0;
          if (disposed) return;
          if (!media.matches) {
            group.rotation.y = -0.4 + Math.sin(time * 0.00025) * 0.24;
            group.rotation.x = 0.38 + Math.sin(time * 0.0002) * 0.08;
          }
          renderer.render(scene, camera);
          if (visible && !document.hidden && !media.matches)
            frame = requestAnimationFrame(render);
        };
        const update = () => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(render);
        };
        const resize = new ResizeObserver(() => {
          const { width, height } = element.getBoundingClientRect();
          renderer.setSize(width, height);
          camera.aspect = width / Math.max(height, 1);
          camera.updateProjectionMatrix();
          update();
        });
        resize.observe(element);
        const observer = new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          update();
        });
        observer.observe(element);
        media.addEventListener("change", update);
        document.addEventListener("visibilitychange", update);
        cleanup = () => {
          cancelAnimationFrame(frame);
          resize.disconnect();
          observer.disconnect();
          media.removeEventListener("change", update);
          document.removeEventListener("visibilitychange", update);
          ringGeometry.dispose();
          accentGeometry.dispose();
          material.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      })
      .catch(() => {
        /* The decorative fallback remains visible without WebGL. */
      });
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <div
      ref={host}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    />
  );
}
