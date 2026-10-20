// Call mutations inside the caller's database transaction.
export const bookingHoldMs = 30 * 60 * 1000;
export const occupiedAppointments =
  "(status IN ('confirmed','completed','no_show') OR (status='pending_payment' AND created>?))";
export function appointmentView(row) {
  return {
    ...row,
    ...(row.status === 'pending_payment'
      ? {
          status: row.created + bookingHoldMs > Date.now() ? 'pending_payment' : 'expired',
          expires: row.created + bookingHoldMs,
        }
      : {}),
  };
}
export async function confirmPaidAppointments(db, packageId) {
  const pending = await db
    .prepare("SELECT * FROM appointments WHERE package_id=? AND status='pending_payment'")
    .all(packageId);
  for (const appointment of pending) {
    const busy = await db
      .prepare(
        `SELECT id FROM appointments WHERE ${occupiedAppointments} AND starts<? AND ends>? AND id<>?`,
      )
      .get(Date.now() - bookingHoldMs, appointment.ends, appointment.starts, appointment.id);
    const block = await db
      .prepare('SELECT id FROM booking_blocks WHERE starts<? AND ends>?')
      .get(appointment.ends, appointment.starts);
    const status =
      busy || block || appointment.starts <= Date.now() ? 'payment_review' : 'confirmed';
    await db.prepare('UPDATE appointments SET status=? WHERE id=?').run(status, appointment.id);
  }
}
