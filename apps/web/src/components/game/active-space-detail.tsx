/**
 * Active-space detail: name, type, owner or status, and value or rule summary.
 * See UX-030.
 */
import type { BoardSpaceProjection, SeatProjection } from "@blockparty/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DEED_CATEGORY_DISPLAY,
  SPACE_CATEGORY_DISPLAY,
  formatMoney,
} from "@/components/display-names";

export function ActiveSpaceDetail({
  space,
  seats,
  currencyLabel = "Tabs",
  districtName,
  canManage,
  onManage,
}: {
  space?: BoardSpaceProjection;
  seats: readonly SeatProjection[];
  currencyLabel?: string;
  districtName?: string;
  canManage?: boolean;
  onManage?: () => void;
}) {
  if (space === undefined) {
    return (
      <Card id="active-space-detail">
        <CardHeader>
          <CardTitle>No stop selected</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-ink">
            Select a stop on the board or in the board list to inspect it.
          </p>
        </CardContent>
      </Card>
    );
  }

  const category = SPACE_CATEGORY_DISPLAY[space.category];
  const deedCategory =
    space.deedCategory === undefined ? undefined : DEED_CATEGORY_DISPLAY[space.deedCategory];
  const owner = seats.find((seat) => seat.seatId === space.ownerSeatId);

  return (
    <Card id="active-space-detail">
      <CardHeader>
        <CardTitle>{space.name}</CardTitle>
        <div className="flex flex-wrap gap-1">
          <Badge>{deedCategory?.label ?? category.label}</Badge>
          {districtName === undefined ? null : <Badge variant="info">{districtName}</Badge>}
          <span className="tabular text-sm text-muted-ink">Stop {space.routeIndex}</span>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-ink">Owner</dt>
          <dd>{owner?.name ?? "Nobody yet"}</dd>
          {space.price !== undefined ? (
            <>
              <dt className="text-muted-ink">Price</dt>
              <dd className="tabular">{formatMoney(space.price, currencyLabel)}</dd>
            </>
          ) : null}
          <dt className="text-muted-ink">Here now</dt>
          <dd>
            {space.occupantSeatIds.length === 0
              ? "Nobody"
              : space.occupantSeatIds.length.toString()}
          </dd>
        </dl>
      </CardContent>
      {canManage && onManage !== undefined ? (
        <CardFooter>
          <Button onClick={onManage} className="w-full sm:w-auto">
            Manage this Address
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
