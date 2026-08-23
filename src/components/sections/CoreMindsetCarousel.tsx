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

/** Compute track transform centering slide `index` with dynamic `slideWidth` */
function getTrackTransform(index: number, slideWidth: number): string {
  const initialOffsetPct = 50 - slideWidth / 2;
  return `translateX(calc(${initialOffsetPct}% - ${index * slideWidth}% - ${index * GAP_REM}rem))`;
}

export const CoreMindsetCarousel: React.FC<CoreMindsetCarouselProps> = ({ principles }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const total = principles.length;

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

  const slideWidth = isMobile ? 88 : 42;
  const pawnOffsetRem = isMobile ? 3.0 : 5.75;

  const scrollLockoutUntilRef = useRef<number>(0);

  // Handle scroll progress within the sticky section wrapper (Desktop only)
  useEffect(() => {
    const handleScroll = () => {
      // Ignore scroll events during programmatic scroll transitions (lockout period)
      if (Date.now() < scrollLockoutUntilRef.current) return;

      // Only drive sticky scrolljacking on desktop (≥ 768px)
      if (window.innerWidth < 768) return;

      if (!containerRef.current) return;
      const parent = containerRef.current.closest("section") || containerRef.current.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      const scrollableHeight = rect.height - window.innerHeight;

      if (scrollableHeight <= 0) return;

      // Progress from 0 to 1 as section scrolls past viewport
      const rawProgress = -rect.top / scrollableHeight;
      if (rawProgress < 0 || rawProgress > 1) return;

      // Map progress to nearest slide index (symmetrical with scrollToSlide calculation)
      const calculatedIndex = Math.min(
        total - 1,
        Math.max(0, Math.round(rawProgress * (total - 1)))
      );
      setActiveIndex((prev) => (prev !== calculatedIndex ? calculatedIndex : prev));
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [total]);

  const scrollToSlide = useCallback(
    (index: number) => {
      const targetIndex = Math.max(0, Math.min(total - 1, index));
      setActiveIndex(targetIndex);
      scrollLockoutUntilRef.current = Date.now() + 4000;
    },
    [total]
  );

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const diffX = touchStartXRef.current - e.changedTouches[0].clientX;
    touchStartXRef.current = null;
    if (Math.abs(diffX) > 40) {
      if (diffX > 0) {
        scrollToSlide(activeIndex + 1);
      } else {
        scrollToSlide(activeIndex - 1);
      }
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
          className="flex gap-6 transition-transform duration-500 ease-out"
          style={{
            transform: getTrackTransform(activeIndex, slideWidth),
          }}
        >
          {/* Animated 3D Chess Pawn Companion */}
          <div
            data-testid="mindset-pawn"
            aria-hidden="true"
            className="pointer-events-none absolute -top-4 z-30 h-20 w-16 md:-top-7 md:h-28 md:w-24"
            style={{
              left: `calc(${activeIndex * slideWidth}% + ${activeIndex * GAP_REM}rem + ${slideWidth / 2}% - ${pawnOffsetRem}rem)`,
              transition: prefersReducedMotion
                ? "none"
                : "left 600ms cubic-bezier(0.25, 1, 0.5, 1)",
            }}
          >
            <ThreePawnCanvas
              activeIndex={activeIndex}
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
