import test from 'node:test';
import assert from 'node:assert/strict';
import { DELIVERY_ORIGIN, DELIVERY_REFERENCE, estimateDelivery, formatDeliveryRange, isIndianPincode, parsePostalDestination, type PostalDestination } from '../../src/lib/delivery-estimate';

const destination = (pincode = '201301', state = 'Uttar Pradesh', branchOfficePossible = false): PostalDestination => ({ pincode, state, district: 'Test district', branchOfficePossible });
const office = (extra: Record<string, unknown> = {}) => ({ Pincode: '201301', District: 'Gautam Buddha Nagar', State: 'Uttar Pradesh', Country: 'India', DeliveryStatus: 'Delivery', BranchType: 'Head Post Office', ...extra });
const payload = (...offices: Record<string, unknown>[]) => [{ Status: 'Success', PostOffice: offices }];

test('origin and estimates use surface parcel reference ranges, without selecting a delivery service', () => {
  assert.equal(DELIVERY_ORIGIN.pincode, '201301');
  assert.equal(DELIVERY_REFERENCE, 'India Post surface parcel timings');
  const now = new Date('2026-10-26T08:00:00Z');
  assert.deepEqual(estimateDelivery(destination(), now), { bookingDate: '2026-10-27', bookingMoved: false, earliestDate: '2026-10-30', latestDate: '2026-11-02', transitDays: [3, 5] });
  assert.deepEqual(estimateDelivery(destination('226001'), now).transitDays, [4, 7]);
  assert.deepEqual(estimateDelivery(destination('110001', 'Delhi'), now).transitDays, [7, 10]);
  assert.deepEqual(estimateDelivery(destination('400001', 'Maharashtra'), now).transitDays, [7, 10]);
  assert.deepEqual(estimateDelivery(destination('201301', 'Delhi'), now).transitDays, [7, 10]);
});

test('the date rolls over at India midnight, independent of visitor timezone', () => {
  const before = estimateDelivery(destination(), new Date('2026-10-26T18:29:59Z'));
  const after = estimateDelivery(destination(), new Date('2026-10-26T18:30:00Z'));
  assert.equal(before.bookingDate, '2026-10-27');
  assert.equal(after.bookingDate, '2026-10-28');
});

test('Sunday booking shifts to Monday and Saturday counts as a postal day', () => {
  const friday = estimateDelivery(destination(), new Date('2026-10-30T09:00:00Z'));
  assert.equal(friday.bookingDate, '2026-10-31');
  assert.equal(friday.earliestDate, '2026-11-04');
  const saturday = estimateDelivery(destination(), new Date('2026-10-31T09:00:00Z'));
  assert.equal(saturday.bookingDate, '2026-11-02');
  assert.equal(saturday.bookingMoved, true);
  assert.equal(saturday.earliestDate, '2026-11-05');
});

test('national holidays are excluded from booking and transit', () => {
  assert.equal(estimateDelivery(destination(), new Date('2026-01-25T09:00:00Z')).bookingDate, '2026-01-27');
  assert.equal(estimateDelivery(destination(), new Date('2026-08-14T09:00:00Z')).bookingDate, '2026-08-17');
  const estimate = estimateDelivery(destination(), new Date('2026-09-30T09:00:00Z'));
  assert.equal(estimate.bookingDate, '2026-10-01');
  assert.equal(estimate.earliestDate, '2026-10-06');
  assert.equal(estimate.latestDate, '2026-10-08');
});

test('month, leap day and year boundaries use calendar days', () => {
  assert.equal(estimateDelivery(destination(), new Date('2028-02-28T09:00:00Z')).bookingDate, '2028-02-29');
  const estimate = estimateDelivery(destination(), new Date('2026-12-28T09:00:00Z'));
  assert.equal(estimate.earliestDate, '2027-01-01');
  assert.equal(estimate.latestDate, '2027-01-04');
  const yearRange = estimateDelivery(destination(), new Date('2026-12-26T09:00:00Z'));
  assert.match(formatDeliveryRange(yearRange), /2026/);
  assert.match(formatDeliveryRange(yearRange), /2027/);
});

test('possible branch-office delivery extends the upper bound by a postal day', () => {
  const estimate = estimateDelivery(destination('400001', 'Maharashtra', true), new Date('2026-10-26T09:00:00Z'));
  assert.deepEqual(estimate.transitDays, [7, 11]);
  assert.equal(estimate.earliestDate, '2026-11-04');
  assert.equal(estimate.latestDate, '2026-11-09');
});

test('postal parsing accepts matching structured offices and tolerates surrounding state whitespace', () => {
  const result = parsePostalDestination(payload(office({ State: ' Uttar Pradesh ' })), '201301');
  assert.ok(result);
  assert.equal(result.branchOfficePossible, false);
  assert.equal(result.state, 'Uttar Pradesh');
  assert.deepEqual(estimateDelivery(result, new Date('2026-10-26T09:00:00Z')).transitDays, [3, 5]);
});

test('branch-office allowance is conservative for mixed and missing delivery-office metadata', () => {
  assert.equal(parsePostalDestination(payload(office(), office({ BranchType: 'Branch Post Office' })), '201301')?.branchOfficePossible, true);
  assert.equal(parsePostalDestination(payload(office({ BranchType: null })), '201301')?.branchOfficePossible, true);
  assert.equal(parsePostalDestination(payload(office({ DeliveryStatus: 'Non-Delivery' })), '201301')?.branchOfficePossible, true);
  assert.equal(parsePostalDestination(payload(office(), office({ DeliveryStatus: 'Non-Delivery', BranchType: 'Branch Post Office' })), '201301')?.branchOfficePossible, false);
});

test('unmatched, malformed, empty and inconsistent API responses do not produce an estimate', () => {
  for (const data of [null, {}, [], [{ Status: 'Error', PostOffice: null }], payload(), payload(office({ Pincode: '110001' })), payload(office({ District: '' })), payload(office({ State: null })), payload(office({ Country: 'Other' })), payload(office(), office({ State: 'Delhi' }))]) {
    assert.equal(parsePostalDestination(data, '201301'), null);
  }
});

test('invalid PINs and dates are rejected before estimation', () => {
  for (const pincode of ['', '12345', '1234567', '012345', '12a456', '201301 ']) {
    assert.equal(isIndianPincode(pincode), false);
    assert.equal(parsePostalDestination(payload(office()), pincode), null);
  }
  assert.throws(() => estimateDelivery(destination(), new Date('invalid')), RangeError);
  assert.throws(() => estimateDelivery(destination('000000'), new Date()), RangeError);
});
