/** Store planning estimates using India Post surface parcels as a reference, not a selected carrier.
 * Rationale and sources: docs/implementation/bag-delivery/delivery-estimate.md.
 */
export const DELIVERY_ORIGIN = { name: 'Sector 27, Noida', pincode: '201301', state: 'Uttar Pradesh' } as const;
export const DELIVERY_REFERENCE = 'India Post surface parcel timings';

export interface PostalDestination {
  pincode: string;
  district: string;
  state: string;
  branchOfficePossible: boolean;
}

export interface DeliveryEstimate {
  bookingDate: string;
  bookingMoved: boolean;
  earliestDate: string;
  latestDate: string;
  transitDays: readonly [number, number];
}

export function isIndianPincode(value: string): boolean {
  return /^[1-9]\d{5}$/.test(value);
}

const normalise = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** The lookup only identifies the destination; it does not establish service coverage. */
export function parsePostalDestination(data: unknown, pincode: string): PostalDestination | null {
  if (!isIndianPincode(pincode) || !Array.isArray(data) || !record(data[0]) || data[0].Status !== 'Success' || !Array.isArray(data[0].PostOffice)) return null;
  const offices = data[0].PostOffice.filter((office: unknown): office is Record<string, unknown> =>
    record(office) && office.Pincode === pincode && nonEmptyString(office.District) && nonEmptyString(office.State)
    && (!office.Country || office.Country === 'India'));
  if (!offices.length) return null;
  const first = offices[0];
  if (offices.some(office => normalise(office.State as string) !== normalise(first.State as string))) return null;
  const deliveryOffices = offices.filter(office => office.DeliveryStatus === 'Delivery');
  const possibleOffices = deliveryOffices.length ? deliveryOffices : offices;
  return {
    pincode,
    district: (first.District as string).trim(),
    state: (first.State as string).trim(),
    // Unknown delivery-office data gets the same conservative upper-bound allowance.
    branchOfficePossible: !deliveryOffices.length || possibleOffices.some(office =>
      !nonEmptyString(office.BranchType) || !['head post office', 'sub post office'].includes(normalise(office.BranchType))),
  };
}

const DAY_MS = 86_400_000;
const NATIONAL_HOLIDAYS = new Set(['01-26', '08-15', '10-02']);
const civilDate = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
function indiaCalendarDay(now: Date): number {
  if (!Number.isFinite(now.getTime())) throw new RangeError('A valid estimate date is required');
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => Number(parts.find(item => item.type === type)?.value);
  return Date.UTC(part('year'), part('month') - 1, part('day')) / DAY_MS;
}
function isPostalDay(day: number): boolean {
  return new Date(day * DAY_MS).getUTCDay() !== 0 && !NATIONAL_HOLIDAYS.has(civilDate(day).slice(5));
}
function addPostalDays(day: number, count: number): number {
  while (count > 0) {
    day += 1;
    if (isPostalDay(day)) count -= 1;
  }
  return day;
}

export function estimateDelivery(destination: PostalDestination, now: Date): DeliveryEstimate {
  if (!isIndianPincode(destination.pincode) || !destination.state.trim()) throw new RangeError('A valid destination is required');
  const nextDay = indiaCalendarDay(now) + 1;
  let bookingDay = nextDay;
  while (!isPostalDay(bookingDay)) bookingDay += 1;
  const sameState = normalise(destination.state) === normalise(DELIVERY_ORIGIN.state);
  // Matching district or a Delhi/NCR PIN is not sufficient to call a route local.
  const range = destination.pincode === DELIVERY_ORIGIN.pincode && sameState ? [3, 5] : sameState ? [4, 7] : [7, 10];
  const transitDays = [range[0], range[1] + (destination.branchOfficePossible ? 1 : 0)] as const;
  return {
    bookingDate: civilDate(bookingDay),
    bookingMoved: bookingDay !== nextDay,
    // End-of-day booking may miss the dispatch cutoff, so the booking day never counts.
    earliestDate: civilDate(addPostalDays(bookingDay, transitDays[0])),
    latestDate: civilDate(addPostalDays(bookingDay, transitDays[1])),
    transitDays,
  };
}

export function formatDeliveryRange(estimate: DeliveryEstimate): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).formatRange(
    new Date(`${estimate.earliestDate}T00:00:00Z`), new Date(`${estimate.latestDate}T00:00:00Z`));
}
