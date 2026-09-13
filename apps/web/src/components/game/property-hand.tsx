import type { GameSnapshotProjection } from "@blockparty/contracts";
import type { ManagementDecisionContext } from "./game-model";
import { formatMoney } from "@/components/display-names";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { propertyHandGroups } from "./property-hand-model";

/**
 * The local deed hand below the board. Inspection is projection-backed;
 * management entry points are still gated by server-advertised actions.
 * See UX-044, UX-046, and DS-060.
 */
export function PropertyHand({
  snapshot,
  selectedSpaceId,
  onSelect,
  management,
  canManage = false,
  onManage,
  onTrade,
}: {
  snapshot: GameSnapshotProjection;
  selectedSpaceId?: string;
  onSelect: (spaceId: string) => void;
  management?: ManagementDecisionContext;
  canManage?: boolean;
  onManage?: (spaceId: string) => void;
  onTrade?: (spaceId: string) => void;
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
                    Color Set: {group.label}
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {group.deeds.map((deed) => {
                      const selected = deed.spaceId === selectedSpaceId;
                      const managementDeed = management?.deeds.find(
                        (candidate) => candidate.deedId === deed.deedId,
                      );
                      return (
                        <li key={deed.deedId}>
                          <div
                            className={`rounded-(--radius-md) border p-3 ${selected ? "border-2 border-selection bg-selection" : "border-line bg-surface-raised"}`}
                          >
                            <button
                              type="button"
                              className="min-h-11 w-full text-left"
                              aria-pressed={selected}
                              aria-label={`Inspect ${deed.name}, ${deed.groupName}, ${deed.mortgaged ? "mortgaged" : "not mortgaged"}`}
                              data-deed-id={deed.deedId}
                              onClick={() => onSelect(deed.spaceId)}
                            >
                              <span className="flex w-full min-w-0 items-start justify-between gap-2">
                                <span className="min-w-0 truncate font-medium">{deed.name}</span>
                                <Badge>{deed.categoryLabel}</Badge>
                              </span>
                              <span className="mt-2 grid w-full grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                                <span className="text-muted-ink">Rent</span>
                                <span className="tabular">
                                  {deed.rentIsVariable
                                    ? `${deed.rent} × roll`
                                    : formatMoney(deed.rent, "Tabs")}
                                </span>
                                <span className="text-muted-ink">Houses / Hotel</span>
                                <span>{deed.rentLevel}</span>
                                <span className="text-muted-ink">Mortgage</span>
                                <span>{deed.mortgaged ? "Mortgaged" : "Not mortgaged"}</span>
                                {deed.buildCost === undefined ? null : (
                                  <>
                                    <span className="text-muted-ink">Build cost</span>
                                    <span>{formatMoney(deed.buildCost, "Tabs")}</span>
                                  </>
                                )}
                              </span>
                            </button>
                            {managementDeed?.blockedReasons[0] !== undefined ? (
                              <p className="mt-2 text-xs text-muted-ink">
                                Blocked: {managementDeed.blockedReasons[0]}
                              </p>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              {canManage &&
                              onManage !== undefined &&
                              managementDeed !== undefined &&
                              (managementDeed.actions.length > 0 ||
                                managementDeed.blockedReasons.length > 0) ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => onManage(deed.spaceId)}
                                >
                                  Manage
                                </Button>
                              ) : null}
                              {management?.tradeAction !== undefined && onTrade !== undefined ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => onTrade(deed.spaceId)}
                                >
                                  Open Trade
                                </Button>
                              ) : null}
                            </div>
                          </div>
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
