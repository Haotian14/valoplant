import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { point, project, subtract, type MapInfo, type Point } from './catalog.ts';
import { canonicalMarkers, makeAbility, makeAgent, makeUtility, pageIsAttack } from './geometry.ts';
import { newId, type CanvasItem, type Collection, type Page } from './strategy.ts';

export type Placement =
  | { kind: 'agent'; type: string; ally: boolean }
  | { kind: 'ability'; type: string; index: number; ally: boolean }
  | { kind: 'utility'; type: string; ally: boolean }
  | { kind: 'text'; color: number };

export type PlacementPreview = { marker: Placement; screen: Point };
type Drag = { marker: Placement; pointer: number; start: Point; active: boolean };

export function objectForPlacement(placement: Placement, world: Point, map: MapInfo, page: Page, version: number, color: number):
  { collection: Collection; item: CanvasItem } {
  const center = project(world, canonicalMarkers(page, version));
  switch (placement.kind) {
    case 'agent': return { collection: 'agentData', item: makeAgent(placement.type, center, placement.ally) };
    case 'ability': return { collection: 'abilityData', item: makeAbility(placement.type, placement.index, center, placement.ally, map, pageIsAttack(page)) };
    case 'utility': return { collection: 'utilityData', item: makeUtility(placement.type, center, placement.ally, map, color, version) };
    case 'text': return { collection: 'textData', item: {
      id: newId(), position: subtract(center, point(92.5, 20)), text: '', size: 185, fontSize: 16,
      sizeVersion: 1, tagColorValue: placement.color, isDeleted: false,
    } };
  }
}

export function usePlacementDrag(
  onDrop: (marker: Placement, screen: Point) => void,
  onStart: () => void,
) {
  const drag = useRef<Drag | undefined>(undefined);
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<PlacementPreview>();

  function reset() {
    drag.current = undefined;
    setPreview(undefined);
  }

  function bind(marker: Placement, onClick?: (event: MouseEvent<HTMLButtonElement>) => void) {
    return {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (event.button !== 0 || !event.isPrimary) return;
        suppressClick.current = false;
        drag.current = { marker, pointer: event.pointerId, start: point(event.clientX, event.clientY), active: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const current = drag.current;
        if (!current || current.pointer !== event.pointerId) return;
        const screen = point(event.clientX, event.clientY);
        if (!current.active && Math.hypot(screen.dx - current.start.dx, screen.dy - current.start.dy) >= 5) {
          current.active = true;
          suppressClick.current = true;
          onStart();
        }
        if (current.active) setPreview({ marker: current.marker, screen });
      },
      onPointerUp(event: PointerEvent<HTMLButtonElement>) {
        const current = drag.current;
        if (!current || current.pointer !== event.pointerId) return;
        reset();
        if (current.active) onDrop(current.marker, point(event.clientX, event.clientY));
      },
      onPointerCancel: reset,
      onLostPointerCapture: reset,
      onClick(event: MouseEvent<HTMLButtonElement>) {
        if (suppressClick.current && event.detail !== 0) {
          suppressClick.current = false;
          return;
        }
        onClick?.(event);
      },
    };
  }

  return { bind, preview, cancel: reset };
}
