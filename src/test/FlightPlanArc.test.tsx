import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FlightPlanArc } from "@/components/mission/FlightPlanArc";
import type { Milestone } from "@/lib/flightPlan";

const milestones: Milestone[] = [
  { id: "start", day: 0, label: "Mission start", kind: "milestone", status: "done" },
  { id: "g2", day: 18, label: "Go for build", kind: "gate", status: "done" },
  { id: "quiz", day: 34, label: "Daily quiz feature", kind: "milestone", status: "upcoming" },
  { id: "g3", day: 42, label: "Go for launch", kind: "gate", status: "upcoming" },
  { id: "g4", day: 80, label: "Go for growth", kind: "gate", status: "upcoming" },
];

const setup = () => {
  const onSelect = vi.fn();
  render(
    <FlightPlanArc
      milestones={milestones}
      nowDay={30}
      seed="c1"
      phase="Build"
      onSelectMilestone={onSelect}
    />,
  );
  return onSelect;
};

describe("FlightPlanArc", () => {
  it("summarises the plan for screen readers and lists every milestone", () => {
    setup();
    expect(
      screen.getByRole("group", {
        name: "Flight plan: Build phase, day 30. Next: Daily quiz feature in 4 days. Go for launch in 12 days.",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(milestones.length);
  });

  it("pans with Earlier, Later and Now", () => {
    setup();
    expect(screen.getByText("Mission elapsed · Go for launch in 12 days")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Later/ }));
    expect(screen.getByText("Viewing day 52 · press Now to return")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Now" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Now" }));
    expect(screen.getByText("Mission elapsed · Go for launch in 12 days")).toBeInTheDocument();
  });

  it("stops at the first and last milestones", () => {
    setup();
    const earlier = screen.getByRole("button", { name: /Earlier/ });
    for (let i = 0; i < 5; i++) fireEvent.click(earlier);
    expect(earlier).toBeDisabled();
    expect(screen.getByText("Viewing day 0 · press Now to return")).toBeInTheDocument();
  });

  it("opens a milestone's evidence from its marker", () => {
    const onSelect = setup();
    fireEvent.click(screen.getByRole("button", { name: "Go for launch (gate): day 42, in 12 days" }));
    expect(onSelect).toHaveBeenCalledWith("g3");
  });

  it("takes markers out of reach while they're off the arc", () => {
    setup();
    expect(screen.getByRole("button", { name: /^Go for growth/ })).toBeDisabled();
  });

  it("pans on a swipe longer than 40px, but not on a short drag", () => {
    setup();
    const arc = screen.getByRole("group", { name: /^Flight plan:/ });
    fireEvent.pointerDown(arc, { clientX: 300 });
    fireEvent.pointerUp(arc, { clientX: 280 });
    expect(screen.getByText(/^Mission elapsed/)).toBeInTheDocument();
    fireEvent.pointerDown(arc, { clientX: 300 });
    fireEvent.pointerUp(arc, { clientX: 200 });
    expect(screen.getByText("Viewing day 52 · press Now to return")).toBeInTheDocument();
  });
});
