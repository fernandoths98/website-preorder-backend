const DAY = 86400_000;
const WEEK = 7 * DAY;
const WIB = 7 * 3600_000;

export interface DeliverySchedule {
  opensAt: Date;
  closesAt: Date;
  deliveryDate: string;
}

export function jakartaDate(now: Date): string {
  return new Date(now.getTime() + WIB).toISOString().slice(0, 10);
}

/** Preserve the existing delivery weekday and cutoff; roll forward by weeks. */
export function nextDeliverySchedule(template: DeliverySchedule, now: Date): DeliverySchedule {
  let opensAt = new Date(template.opensAt);
  let closesAt = new Date(template.closesAt);
  let delivery = new Date(`${template.deliveryDate}T00:00:00Z`);
  if (![opensAt, closesAt, delivery, now].every(d => Number.isFinite(d.getTime()))) {
    throw new Error('Jadwal pengiriman tidak valid');
  }
  const today = jakartaDate(now);
  while (closesAt.getTime() <= now.getTime() || delivery.toISOString().slice(0, 10) < today) {
    opensAt = new Date(opensAt.getTime() + WEEK);
    closesAt = new Date(closesAt.getTime() + WEEK);
    delivery = new Date(delivery.getTime() + WEEK);
  }
  return { opensAt, closesAt, deliveryDate: delivery.toISOString().slice(0, 10) };
}

/** Only for an installation without a configured dated schedule yet. */
export function defaultDeliverySchedule(now: Date): DeliverySchedule {
  const local = new Date(`${jakartaDate(now)}T00:00:00Z`);
  const monday = new Date(local.getTime() - ((local.getUTCDay() + 6) % 7) * DAY);
  const date = (offset: number) => new Date(monday.getTime() + offset * DAY).toISOString().slice(0, 10);
  return nextDeliverySchedule({
    opensAt: new Date(`${date(0)}T00:00:00+07:00`),
    closesAt: new Date(`${date(2)}T23:59:59+07:00`),
    deliveryDate: date(5),
  }, now);
}
