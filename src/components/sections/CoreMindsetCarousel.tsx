import React, { useState, useEffect, useRef, useCallback } from "react";
import { ThreePawnCanvas } from "./ThreePawnCanvas";

export interface MindsetPrinciple {
  id: string;
  number: string;
  badge: string;
  title: string;
  summary: string;
  description: string;
}

interface CoreMindsetCarouselProps {
  principles: MindsetPrinciple[];
}

const GAP_REM = 1.5;
const PAWN_ANCHOR_HYSTERESIS = 0.55;
const PAWN_WALK_EASE = 6;

/** Compute track transform centering fractional slide position `position` with dynamic `slideWidth` */
function getTrackTransform(position: number, slideWidth: number): string {
  const initialOffsetPct = 50 - slideWidth / 2;
  return `translateX(calc(${initialOffsetPct}% - ${position * slideWidth}% - ${position * GAP_REM}rem))`;
}

/** Compute pawn wrapper `left` for a fractional slide position */
function getPawnLeft(position: number, slideWidth: number, pawnOffsetRem: number): string {
  return `calc(${position * slideWidth}% + ${position * GAP_REM}rem + ${slideWidth / 2}% - ${pawnOffsetRem}rem)`;
}

export const CoreMindsetCarousel: React.FC<CoreMindsetCarouselProps> = ({ principles }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [settledIndex, setSettledIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pawnWrapperRef = useRef<HTMLDivElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const targetProgressRef = useRef(0);
  const smoothedProgressRef = useRef(0);
  const lastTargetRef = useRef(0);
  const settleSinceRef = useRef(0);
  const settledIndexRef = useRef(0);
  const pawnAnchorRef = useRef(0);
  const pawnLocalRef = useRef(0);
  const total = principles.length;
  const slideWidth = isMobile ? 88 : 42;
  const pawnOffsetRem = isMobile ? 3.0 : 5.75;

  // Track responsive screen width for dynamic slide scaling
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Track prefers-reduced-motion preference for accessibility
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Scroll measurement: map page scroll within the sticky section to target progress [0, 1]
  useEffect(() => {
    const measureScrollProgress = () => {
      const container = containerRef.current;
      if (!container) return;
      const parent = container.closest("section") || container.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      const scrollableHeight = rect.height - window.innerHeight;

      if (scrollableHeight <= 0) return;

      targetProgressRef.current = Math.min(1, Math.max(0, -rect.top / scrollableHeight));
    };

    measureScrollProgress();
    window.addEventListener("scroll", measureScrollProgress, { passive: true });
    window.addEventListener("resize", measureScrollProgress);

    return () => {
      window.removeEventListener("scroll", measureScrollProgress);
      window.removeEventListener("resize", measureScrollProgress);
    };
  }, []);

  // rAF loop: critically damp smoothed progress toward scroll-mapped target and write styles
  useEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    const pawn = pawnWrapperRef.current;
    if (!container || !track || !pawn) return;

    let rafId = 0;
    let lastTime = performance.now();
    let isVisible = true;

    const tick = (now: number) => {
      if (!isVisible) return;
      rafId = requestAnimationFrame(tick);

      const dt = Math.min(Math.max((now - lastTime) / 1000, 0), 0.1);
      lastTime = now;

      const target = targetProgressRef.current;
      if (prefersReducedMotion) {
        smoothedProgressRef.current = target;
      } else {
        smoothedProgressRef.current += (target - smoothedProgressRef.current) * Math.min(1, dt * 8);
      }

      const position = smoothedProgressRef.current * (total - 1);
      const nextIndex = Math.min(total - 1, Math.max(0, Math.round(position)));
      setActiveIndex((prev) => (prev === nextIndex ? prev : nextIndex));

      // Settle detection: fire the pawn hop once per gesture, only after the
      // eased scrub rests near the target and the target has held steady.
      if (target !== lastTargetRef.current) {
        lastTargetRef.current = target;
        settleSinceRef.current = now;
      } else if (
        Math.abs(target - smoothedProgressRef.current) < 0.004 &&
        (prefersReducedMotion || now - settleSinceRef.current >= 180)
      ) {
        settleSinceRef.current = now;
        if (settledIndexRef.current !== nextIndex) {
          settledIndexRef.current = nextIndex;
          setSettledIndex(nextIndex);
        }
      }

      track.style.transform = getTrackTransform(position, slideWidth);

      // Travelator model: the pawn owns a card (anchor) and rides 1:1 with it
      // while the track scrubs beneath; ownership hands off to the neighbor
      // card once it drifts past midpoint + hysteresis, easing a visible walk.
      const H = PAWN_ANCHOR_HYSTERESIS;
      const maxIndex = total - 1;
      if (position > pawnAnchorRef.current + H) {
        pawnAnchorRef.current = Math.min(pawnAnchorRef.current + 1, maxIndex);
      } else if (position < pawnAnchorRef.current - H) {
        pawnAnchorRef.current = Math.max(pawnAnchorRef.current - 1, 0);
      }

      if (prefersReducedMotion) {
        pawnLocalRef.current = Math.min(maxIndex, Math.max(0, Math.round(position)));
      } else {
        pawnLocalRef.current +=
          (pawnAnchorRef.current - pawnLocalRef.current) * Math.min(1, dt * PAWN_WALK_EASE);
      }
      pawn.style.left = getPawnLeft(pawnLocalRef.current, slideWidth, pawnOffsetRem);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        const wasVisible = isVisible;
        isVisible = entry.isIntersecting;
        if (isVisible && !wasVisible) {
          cancelAnimationFrame(rafId);
          lastTime = performance.now();
          settleSinceRef.current = lastTime;
          rafId = requestAnimationFrame(tick);
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(container);

    rafId = requestAnimationFrame(tick);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [total, slideWidth, pawnOffsetRem, prefersReducedMotion]);

  // Smooth-scroll the page to the position that maps to the requested slide
  const scrollToSlide = useCallback(
    (index: number) => {
      const targetIndex = Math.min(total - 1, Math.max(0, index));
      const container = containerRef.current;
      if (!container) return;
      const parent = container.closest("section") || container.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      const scrollableHeight = rect.height - window.innerHeight;
      if (scrollableHeight <= 0) return;

      const top = rect.top + window.scrollY + (targetIndex / (total - 1)) * scrollableHeight;
      window.scrollTo({
        top,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    },
    [total, prefersReducedMotion]
  );

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const diffX = touchStartXRef.current - e.changedTouches[0].clientX;
    touchStartXRef.current = null;
    if (Math.abs(diffX) > 40) {
      const baseIndex = Math.round(smoothedProgressRef.current * (total - 1));
      scrollToSlide(diffX > 0 ? baseIndex + 1 : baseIndex - 1);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-clip py-4"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div role="region" aria-label="Core Mindset Principles" className="relative w-full">
        {/* Track container */}
        <div
          ref={trackRef}
          data-testid="mindset-track"
          className="flex gap-6"
          style={{
            transform: getTrackTransform(activeIndex, slideWidth),
          }}
        >
          {/* Animated 3D Chess Pawn Companion */}
          <div
            ref={pawnWrapperRef}
            data-testid="mindset-pawn"
            aria-hidden="true"
            className="pointer-events-none absolute -top-4 z-30 h-20 w-16 md:-top-7 md:h-28 md:w-24"
            style={{
              left: getPawnLeft(activeIndex, slideWidth, pawnOffsetRem),
            }}
          >
            <ThreePawnCanvas
              activeIndex={settledIndex}
              prefersReducedMotion={prefersReducedMotion}
            />
          </div>

          {principles.map((p, i) => {
            const isActive = i === activeIndex;
            return (
              <article
                key={p.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`Slide ${i + 1} of ${total}: ${p.title}`}
                aria-current={isActive}
                tabIndex={0}
                onClick={() => scrollToSlide(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    scrollToSlide(i);
                  } else if (e.key === "ArrowRight" || e.key === "Right") {
                    e.preventDefault();
                    scrollToSlide(i + 1);
                  } else if (e.key === "ArrowLeft" || e.key === "Left") {
                    e.preventDefault();
                    scrollToSlide(i - 1);
                  }
                }}
                className="group bg-surface border-border-custom/80 focus-visible:ring-focus focus-visible:ring-offset-bg relative flex shrink-0 cursor-pointer flex-col justify-between rounded-3xl border p-5 transition-all duration-500 ease-out outline-none focus-visible:ring-2 focus-visible:ring-offset-2 md:min-h-[340px] md:p-8"
                style={{
                  width: `${slideWidth}%`,
                  boxShadow: isActive
                    ? "0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)"
                    : "0 4px 6px -1px rgba(0, 0, 0, 0.03)",
                  opacity: isActive ? 1 : 0.85,
                  transform: prefersReducedMotion ? "none" : isActive ? "scale(1)" : "scale(0.96)",
                  transition: prefersReducedMotion ? "none" : "all 500ms ease-out",
                }}
              >
                <div className="space-y-4">
                  {/* Category / Badge Header */}
                  <div className="flex items-center justify-between pr-12 md:pr-18">
                    <span className="text-text-muted truncate font-mono text-[11px] font-semibold tracking-wide uppercase md:text-xs">
                      {p.badge}
                    </span>
                    <span className="bg-primary/15 border-primary/30 text-text shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold">
                      {p.number}
                    </span>
                  </div>

                  {/* Title & Body */}
                  <div className="space-y-2.5 pt-2">
                    <h3 className="font-display text-text text-xl font-bold tracking-tight md:text-2xl">
                      {p.title}
                    </h3>
                    <p className="text-text font-sans text-xs leading-relaxed font-semibold md:text-sm">
                      {p.summary}
                    </p>
                    <p className="text-text-muted font-sans text-xs leading-relaxed md:text-sm">
                      {p.description}
                    </p>
                  </div>
                </div>

                <div className="bg-primary/20 group-hover:bg-primary mt-6 h-1 w-full rounded-full transition-colors" />
              </article>
            );
          })}
        </div>
      </div>

      {/* Pagination Bar: Square Connected Track */}
      <div className="mt-8 flex flex-col items-center justify-center">
        <div
          className="relative flex items-center justify-center gap-4 py-2"
          role="tablist"
          aria-label="Slide navigation"
        >
          {/* Horizontal Track Connecting Line */}
          <div className="bg-border-custom/80 pointer-events-none absolute top-1/2 right-2 left-2 h-[2px] -translate-y-1/2" />

          {/* Square Pagination Indicators with Accessible 44px Minimum Touch Target */}
          {principles.map((p, i) => {
            const isActive = i === activeIndex;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`Go to slide ${i + 1}: ${p.title}`}
                onClick={() => scrollToSlide(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    scrollToSlide(i);
                  } else if (e.key === "ArrowRight" || e.key === "Right") {
                    e.preventDefault();
                    scrollToSlide(i + 1);
                  } else if (e.key === "ArrowLeft" || e.key === "Left") {
                    e.preventDefault();
                    scrollToSlide(i - 1);
                  }
                }}
                className="focus-visible:ring-focus focus-visible:ring-offset-bg relative z-10 flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <span
                  className={`flex items-center justify-center transition-all duration-300 ${
                    isActive
                      ? "border-primary bg-primary ring-primary/40 size-4 rounded-xs shadow-sm ring-2"
                      : "bg-surface border-border-custom hover:border-primary/60 hover:bg-surface-subtle size-3 rounded-xs border"
                  }`}
                >
                  {isActive && <span className="rounded-2xs size-1.5 bg-white" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
