import React, { useEffect, useRef } from "react";
import * as THREE from "three";

interface ThreePawnCanvasProps {
  activeIndex?: number;
  className?: string;
  prefersReducedMotion?: boolean;
}

/**
 * ThreePawnCanvas
 *
 * 3D Turned-Wood Chess Pawn rendered via WebGL (Three.js),
 * featuring realistic player move physics:
 * - Anticipation crouch, upward arc hop, directional pitch tilt during movement
 * - Landing impact squash upon settling into active card
 * - Ground contact shadow + 135° Back-Right Directional Cast Shadow
 */
export const ThreePawnCanvas: React.FC<ThreePawnCanvasProps> = ({
  activeIndex = 0,
  className = "",
  prefersReducedMotion = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(activeIndex);
  const prevIndexRef = useRef(activeIndex);
  const jumpTriggerRef = useRef<{ startTime: number; direction: number } | null>(null);
  const hopCountRef = useRef(0);

  // Trigger physics jump whenever the settled active index changes
  useEffect(() => {
    if (activeIndex !== activeIndexRef.current) {
      const dir = activeIndex > activeIndexRef.current ? 1 : -1;
      prevIndexRef.current = activeIndexRef.current;
      activeIndexRef.current = activeIndex;
      jumpTriggerRef.current = {
        startTime: performance.now(),
        direction: dir,
      };
      hopCountRef.current += 1;
      containerRef.current?.setAttribute("data-hop-count", String(hopCountRef.current));
    }
  }, [activeIndex]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationFrameId: number;

    // 1. Scene Setup
    const scene = new THREE.Scene();

    // 2. Camera Setup (tabletop perspective with ample vertical headroom so the
    // hop apex stays fully inside the frame)
    const width = container.clientWidth || 100;
    const height = container.clientHeight || 100;
    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 1000);
    camera.position.set(0, 3.5, 3.85);
    camera.lookAt(0, 0.85, 0);

    // 3. WebGL Renderer Setup
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);
    } catch (err) {
      console.warn("WebGL renderer creation failed, skipping 3D pawn canvas:", err);
      return;
    }

    // 4a. Turned Wood Procedural Texture Generator
    const createWoodTexture = (): THREE.CanvasTexture => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 512, 512);
        grad.addColorStop(0, "#f4e6d2");
        grad.addColorStop(0.5, "#dcb98e");
        grad.addColorStop(1, "#946f4e");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 512);

        ctx.strokeStyle = "rgba(74, 53, 37, 0.14)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 50; i++) {
          ctx.beginPath();
          ctx.arc(256, 256, 12 + i * 9, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      return texture;
    };

    // 4b. Procedural Soft Contact Shadow Texture Generator
    const createContactShadowTexture = (): THREE.CanvasTexture => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 120);
        grad.addColorStop(0, "rgba(24, 18, 15, 0.50)");
        grad.addColorStop(0.4, "rgba(24, 18, 15, 0.25)");
        grad.addColorStop(0.7, "rgba(24, 18, 15, 0.08)");
        grad.addColorStop(1, "rgba(24, 18, 15, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);
      }

      return new THREE.CanvasTexture(canvas);
    };

    // 4c. 135° Back-Right Directional Cast Shadow Texture Generator (~135% angle falloff)
    const createCastShadow135Texture = (): THREE.CanvasTexture => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        // Linear-radial gradient angled towards top-right (maps to 135° back-right in 3D space)
        const grad = ctx.createRadialGradient(85, 170, 8, 175, 80, 125);
        grad.addColorStop(0, "rgba(20, 14, 10, 0.58)");
        grad.addColorStop(0.3, "rgba(20, 14, 10, 0.35)");
        grad.addColorStop(0.65, "rgba(20, 14, 10, 0.12)");
        grad.addColorStop(1, "rgba(20, 14, 10, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);
      }

      return new THREE.CanvasTexture(canvas);
    };

    const woodTexture = createWoodTexture();
    const contactShadowTexture = createContactShadowTexture();
    const castShadowTexture = createCastShadow135Texture();

    // 5. Studio 3-Point Lighting (Key Light from front-left to project 135° shadow back-right)
    const ambientLight = new THREE.AmbientLight(0xfff5ea, 1.5);
    scene.add(ambientLight);

    // Key Light positioned front-left (X: -6, Y: 9, Z: 6) -> Projects cast shadow towards +X, -Z (Back-Right 135°)
    const keyLight = new THREE.DirectionalLight(0xfffaed, 2.8);
    keyLight.position.set(-6, 9, 6);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xc9a982, 0.8);
    fillLight.position.set(5, -1, 3);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xd4af37, 1.4);
    rimLight.position.set(4, 5, -4);
    scene.add(rimLight);

    // 6. Turned Wood Pawn Mesh Group
    const pawnGroup = new THREE.Group();
    scene.add(pawnGroup);

    // Lathe Profile for turned wood 3D Pawn
    const pawnLathePoints: THREE.Vector2[] = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.58, 0),
      new THREE.Vector2(0.6, 0.08),
      new THREE.Vector2(0.5, 0.16),
      new THREE.Vector2(0.42, 0.22),
      new THREE.Vector2(0.3, 0.44),
      new THREE.Vector2(0.22, 0.72),
      new THREE.Vector2(0.2, 0.86),
      new THREE.Vector2(0.34, 0.94),
      new THREE.Vector2(0.3, 1.02),
      new THREE.Vector2(0.24, 1.08),
      new THREE.Vector2(0.38, 1.34),
      new THREE.Vector2(0.34, 1.54),
      new THREE.Vector2(0.2, 1.66),
      new THREE.Vector2(0, 1.7),
    ];

    const pawnGeo = new THREE.LatheGeometry(pawnLathePoints, 36);
    const woodMaterial = new THREE.MeshStandardMaterial({
      map: woodTexture,
      color: 0xf4ebdc,
      roughness: 0.34,
      metalness: 0.05,
    });

    const bodyMesh = new THREE.Mesh(pawnGeo, woodMaterial);
    pawnGroup.add(bodyMesh);

    // 7a. Ground Contact Shadow Plane (Directly under base)
    const contactShadowGeo = new THREE.PlaneGeometry(1.6, 1.6);
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: contactShadowTexture,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const contactShadowMesh = new THREE.Mesh(contactShadowGeo, contactShadowMat);
    contactShadowMesh.rotation.x = -Math.PI / 2;
    contactShadowMesh.position.y = 0.008;
    scene.add(contactShadowMesh);

    // 7b. 135° Back-Right Directional Cast Shadow Plane (~135% angle)
    const castShadowGeo = new THREE.PlaneGeometry(2.4, 2.4);
    const castShadowMat = new THREE.MeshBasicMaterial({
      map: castShadowTexture,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    const castShadowMesh = new THREE.Mesh(castShadowGeo, castShadowMat);
    castShadowMesh.rotation.x = -Math.PI / 2;
    castShadowMesh.rotation.z = -Math.PI / 4; // 135° Back-Right angle offset
    castShadowMesh.position.set(0.48, 0.005, -0.48); // Positioned back-right
    scene.add(castShadowMesh);

    // Initial orientation
    pawnGroup.rotation.y = 0.2;

    // Handle resize
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 100;
      const h = container.clientHeight || 100;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener("resize", handleResize);

    // 8. IntersectionObserver to pause render loop when off-screen
    let isIntersecting = true;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const wasIntersecting = isIntersecting;
        isIntersecting = entry.isIntersecting;
        // Resume animation loop when scrolling back into viewport
        if (isIntersecting && !wasIntersecting) {
          animate();
        }
      },
      { threshold: 0.05 }
    );

    observer.observe(container);

    // 9. 60 FPS Player Move Physics Loop (Paused when off-screen)
    const animate = () => {
      if (!isIntersecting) return;

      animationFrameId = requestAnimationFrame(animate);

      let jumpY = 0;
      let scaleY = 1.0;
      let scaleXZ = 1.0;
      let tiltZ = 0;
      let tiltX = 0;

      if (jumpTriggerRef.current) {
        if (prefersReducedMotion) {
          // Bypass 3D hop physics arc for prefers-reduced-motion accessibility
          jumpTriggerRef.current = null;
        } else {
          const elapsed = performance.now() - jumpTriggerRef.current.startTime;
          const duration = 580; // ms duration for physical hop arc
          const dir = jumpTriggerRef.current.direction;

          if (elapsed < duration) {
            const t = elapsed / duration;

            if (t < 0.15) {
              // Phase 1: Anticipation crouch
              const crouch = Math.sin((t / 0.15) * (Math.PI / 2));
              scaleY = 1.0 - 0.14 * crouch;
              scaleXZ = 1.0 + 0.1 * crouch;
              jumpY = -0.05 * crouch;
            } else if (t < 0.78) {
              // Phase 2: Upward Arc Hop & Directional Pitch Tilt
              const arcT = (t - 0.15) / 0.63;
              const arcSin = Math.sin(arcT * Math.PI);
              jumpY = arcSin * 0.66; // Player lift hop height
              scaleY = 1.0 + 0.12 * arcSin;
              scaleXZ = 1.0 - 0.07 * arcSin;

              // Tilt in direction of movement (leaning right when moving right, leaning left when moving left)
              tiltZ = -dir * arcSin * 0.32;
              tiltX = arcSin * 0.1;
            } else {
              // Phase 3: Landing impact squash upon touching down
              const impactT = (t - 0.78) / 0.22;
              const squash = Math.sin(impactT * Math.PI);
              scaleY = 1.0 - 0.16 * squash;
              scaleXZ = 1.0 + 0.12 * squash;
              jumpY = -0.05 * squash;
            }
          } else {
            // Move animation complete
            jumpTriggerRef.current = null;
          }
        }
      }

      // Apply physical transforms directly to Pawn Mesh Group
      pawnGroup.position.set(0, Math.max(-0.05, jumpY), 0);
      pawnGroup.scale.set(scaleXZ, scaleY, scaleXZ);
      pawnGroup.rotation.z = tiltZ;
      pawnGroup.rotation.x = tiltX;

      // Modulate Contact Shadow during airborne hop
      const contactScale = 1.0 + jumpY * 0.5;
      contactShadowMesh.scale.set(contactScale, contactScale, contactScale);
      contactShadowMat.opacity = Math.max(0.08, 0.45 / (1.0 + jumpY * 3.2));

      // Modulate 135° Back-Right Cast Shadow during airborne hop
      const castScaleX = 1.0 + jumpY * 0.6;
      const castScaleY = 1.0 + jumpY * 0.9;
      castShadowMesh.scale.set(castScaleX, castScaleY, 1.0);
      castShadowMesh.position.set(0.48 + jumpY * 0.25, 0.005, -0.48 - jumpY * 0.25);
      castShadowMat.opacity = Math.max(0.06, 0.38 / (1.0 + jumpY * 2.6));

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
      if (renderer) {
        if (renderer.domElement && container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
        renderer.dispose();
      }
      pawnGeo?.dispose();
      woodMaterial?.dispose();
      contactShadowGeo?.dispose();
      contactShadowMat?.dispose();
      castShadowGeo?.dispose();
      castShadowMat?.dispose();
      woodTexture?.dispose();
      contactShadowTexture?.dispose();
      castShadowTexture?.dispose();
    };
  }, []);

  return (
    <div ref={containerRef} data-hop-count={0} className={`relative h-full w-full ${className}`} />
  );
};
