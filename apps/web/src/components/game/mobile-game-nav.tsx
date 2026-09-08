"use client";

import { Button } from "@/components/ui/button";

export const MOBILE_GAME_SECTIONS = [
  { id: "board-section", label: "Board" },
  { id: "properties-section", label: "Properties" },
  { id: "trade-section", label: "Trade" },
  { id: "history-section", label: "History" },
] as const;

export type MobileGameSection = (typeof MOBILE_GAME_SECTIONS)[number]["id"];

export function MobileGameNav({
  currentSection,
  onNavigate,
}: {
  currentSection: MobileGameSection;
  onNavigate: (section: MobileGameSection) => void;
}) {
  return (
    <nav className="game-mobile-nav" aria-label="Game sections">
      {MOBILE_GAME_SECTIONS.map((section) => (
        <Button
          key={section.id}
          variant={currentSection === section.id ? "primary" : "secondary"}
          className="min-w-0 px-2 text-xs"
          aria-current={currentSection === section.id ? "page" : undefined}
          onClick={() => onNavigate(section.id)}
        >
          {section.label}
        </Button>
      ))}
    </nav>
  );
}
