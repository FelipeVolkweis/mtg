import { useEffect, useState, type RefObject } from "react";
import type { BoardSelection } from "./board-context";

/** Arrows from attackers to defenders and from blockers to attackers. */
export function CombatLines({
  root,
  anchors,
  observer: observing,
  links,
}: {
  root: RefObject<HTMLDivElement | null>;
  anchors: RefObject<Map<string, HTMLElement>>;
  // Anchors mounted after this effect runs observe themselves through this.
  observer: RefObject<ResizeObserver | null>;
  links: BoardSelection["links"];
}) {
  const [lines, setLines] = useState<
    {
      from: string;
      to: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }[]
  >([]);
  useEffect(() => {
    const update = () => {
      const board = root.current?.getBoundingClientRect();
      if (!board) return;
      const visible = (r: DOMRect) =>
        r.bottom > board.top &&
        r.top < board.bottom &&
        r.right > board.left &&
        r.left < board.right;
      setLines(
        links.flatMap((link) => {
          const a = anchors.current.get(link.from)?.getBoundingClientRect();
          const b = anchors.current.get(link.to)?.getBoundingClientRect();
          return a && b && visible(a) && visible(b)
            ? [
                {
                  ...link,
                  x1: a.left + a.width / 2 - board.left,
                  y1: a.top + a.height / 2 - board.top,
                  x2: b.left + b.width / 2 - board.left,
                  y2: b.top + b.height / 2 - board.top,
                },
              ]
            : [];
        }),
      );
    };
    update();
    const observer = new ResizeObserver(update);
    if (root.current) observer.observe(root.current);
    for (const node of anchors.current.values()) observer.observe(node);
    observing.current = observer;
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      if (observing.current === observer) observing.current = null;
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [links, root, anchors, observing]);
  return (
    <svg className="combat-lines" aria-hidden="true">
      <defs>
        <marker
          id="combat-arrow"
          markerWidth="7"
          markerHeight="7"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L7,3 z" fill="#ffe39b" />
        </marker>
      </defs>
      {lines.map((line, i) => (
        <line
          key={`${line.from}:${line.to}:${i}`}
          {...{ x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 }}
          markerEnd="url(#combat-arrow)"
        />
      ))}
    </svg>
  );
}
