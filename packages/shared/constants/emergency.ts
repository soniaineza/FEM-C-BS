/**
 * Rwanda's emergency short codes, dialled straight from the driver's SOS
 * screen.
 *
 * These are deliberately compiled into the app rather than fetched like the
 * Kimu call-centre number: an SOS has to work when the phone has no data and
 * the API is unreachable, which is exactly when it is most likely to be used.
 */
export const EMERGENCY_NUMBERS = ['112', '6463'] as const;
