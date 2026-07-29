export type InteractionMode = "auto" | "interactive" | "hidden";

export interface InteractionState {
  ctrlHeld: boolean;
  shiftHeld: boolean;
  mouseOver: boolean;
}

export function computeInteractionMode(state: InteractionState): InteractionMode {
  const { ctrlHeld, shiftHeld, mouseOver } = state;
  if (shiftHeld && mouseOver) return "hidden";
  if (ctrlHeld && mouseOver) return "interactive";
  return "auto";
}

export interface InteractionAction {
  opacity: number;
  clickThrough: boolean;
}

export function getInteractionAction(mode: InteractionMode): InteractionAction {
  switch (mode) {
    case "hidden":
      return { opacity: 0.0, clickThrough: true };
    case "interactive":
      return { opacity: 1.0, clickThrough: false };
    case "auto":
      return { opacity: 0.5, clickThrough: true };
  }
}
