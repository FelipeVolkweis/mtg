export const TABLE_WIDTH = 1000;
export const TABLE_HEIGHT = 600;

export interface TablePoint {
  x: number;
  y: number;
}
export interface PlayerArea extends TablePoint {
  width: number;
  height: number;
  seat: number;
}

export function playerAreas(count: number, viewerSeat: number): PlayerArea[] {
  const order = Array.from(
    { length: count },
    (_, index) => (viewerSeat + index) % count,
  );
  if (count === 1)
    return [{ seat: order[0], x: 0, y: 0, width: 1000, height: 600 }];
  if (count === 2)
    return [
      { seat: order[1], x: 0, y: 0, width: 1000, height: 300 },
      { seat: order[0], x: 0, y: 300, width: 1000, height: 300 },
    ];
  if (count === 3)
    return [
      { seat: order[1], x: 0, y: 0, width: 500, height: 300 },
      { seat: order[2], x: 500, y: 0, width: 500, height: 300 },
      { seat: order[0], x: 0, y: 300, width: 1000, height: 300 },
    ];
  return [
    { seat: order[1], x: 0, y: 0, width: 500, height: 300 },
    { seat: order[2], x: 500, y: 0, width: 500, height: 300 },
    { seat: order[0], x: 0, y: 300, width: 500, height: 300 },
    { seat: order[3], x: 500, y: 300, width: 500, height: 300 },
  ];
}

function areaAt(point: TablePoint, areas: PlayerArea[]) {
  const x = Math.max(0, Math.min(TABLE_WIDTH - 1, point.x));
  const y = Math.max(0, Math.min(TABLE_HEIGHT - 1, point.y));
  return areas.find(
    (area) =>
      x >= area.x &&
      x < area.x + area.width &&
      y >= area.y &&
      y < area.y + area.height,
  )!;
}

export function projectPosition(
  point: TablePoint,
  count: number,
  viewerSeat: number,
): TablePoint {
  // Older spatial layouts used viewport pixels; keep every persisted card on the table.
  const visible = {
    x: Math.max(0, Math.min(TABLE_WIDTH - 1, point.x)),
    y: Math.max(0, Math.min(TABLE_HEIGHT - 1, point.y)),
  };
  const source = areaAt(visible, playerAreas(count, 0));
  const target = playerAreas(count, viewerSeat).find(
    (area) => area.seat === source.seat,
  )!;
  return {
    x: Math.min(
      TABLE_WIDTH - 96,
      target.x + ((visible.x - source.x) / source.width) * target.width,
    ),
    y: Math.min(
      TABLE_HEIGHT - 132,
      target.y + ((visible.y - source.y) / source.height) * target.height,
    ),
  };
}

export function unprojectPosition(
  point: TablePoint,
  count: number,
  viewerSeat: number,
): TablePoint {
  const source = areaAt(point, playerAreas(count, viewerSeat));
  const target = playerAreas(count, 0).find(
    (area) => area.seat === source.seat,
  )!;
  return {
    x: Math.max(
      0,
      Math.min(
        TABLE_WIDTH,
        target.x + ((point.x - source.x) / source.width) * target.width,
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        TABLE_HEIGHT,
        target.y + ((point.y - source.y) / source.height) * target.height,
      ),
    ),
  };
}

export function initialPosition(
  count: number,
  seat: number,
  index = 0,
): TablePoint {
  const area = playerAreas(count, 0).find((entry) => entry.seat === seat)!;
  const availableX = Math.max(1, area.width - 120);
  const availableY = Math.max(1, area.height - 244);
  return {
    x: area.x + 24 + ((index * 107) % availableX),
    y: area.y + 112 + ((index * 61) % availableY),
  };
}
