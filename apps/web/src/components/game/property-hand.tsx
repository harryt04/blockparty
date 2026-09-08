import type { GameSnapshotProjection } from "@blockparty/contracts";
import { formatMoney } from "@/components/display-names";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { propertyHandGroups } from "./property-hand-model";

function improvementLabel(level: number): string {
  if (level === 0) return "No Houses or Hotel";
  if (level === 5) return "Hotel";
  return `${level} ${level === 1 ? "House" : "Houses"}`;
}

/**
 * The local, read-only deed hand below the board. Selecting a card only
 * changes inspection; management remains in the server-driven Manage surface.
 * See UX-044, UX-046, and DS-060.
 */
export function PropertyHand({
  snapshot,
  selectedSpaceId,
  onSelect,
}: {
  snapshot: GameSnapshotProjection;
  selectedSpaceId?: string;
  onSelect: (spaceId: string) => void;
}) {
  const groups = propertyHandGroups(snapshot);

  return (
    <section aria-labelledby="property-hand-heading" data-property-hand="local">
      <Card>
        <CardHeader>
          <CardTitle id="property-hand-heading">Your Properties</CardTitle>
          <p className="text-sm text-muted-ink">
            Select a Property to inspect its current rent, improvements, and mortgage state.
          </p>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-ink">
              You do not own any Properties yet. Acquired Properties will appear here by Color Set.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {groups.map((group) => (
                <section
                  key={group.groupId}
                  aria-labelledby={`property-group-${group.groupId}`}
                  data-property-group={group.groupId}
                >
                  <h3 id={`property-group-${group.groupId}`} className="mb-2 font-medium">
                    {group.label}
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {group.deeds.map((deed) => {
                      const selected = deed.spaceId === selectedSpaceId;
                      return (
                        <li key={deed.deedId}>
                          <button
                            type="button"
                            className={`flex min-h-11 w-full flex-col items-start rounded-(--radius-md) border p-3 text-left ${selected ? "border-2 border-selection bg-selection" : "border-line bg-surface-raised"}`}
                            aria-pressed={selected}
                            aria-label={`Inspect ${deed.name}, ${deed.groupName}, ${deed.mortgaged ? "mortgaged" : "not mortgaged"}`}
                            data-deed-id={deed.deedId}
                            onClick={() => onSelect(deed.spaceId)}
                          >
                            <span className="flex w-full min-w-0 items-start justify-between gap-2">
                              <span className="min-w-0 truncate font-medium">{deed.name}</span>
                              <Badge>{deed.categoryLabel}</Badge>
                            </span>
                            <span className="mt-2 grid w-full grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-ink">
                              <span>Rent</span>
                              <span className="tabular">
                                {deed.rentIsVariable
                                  ? "Variable by count or roll"
                                  : formatMoney(deed.rent, "Tabs")}
                              </span>
                              <span>Level</span>
                              <span>{improvementLabel(deed.improvementLevel)}</span>
                              <span>Status</span>
                              <span>{deed.mortgaged ? "Mortgaged" : "Unmortgaged"}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
