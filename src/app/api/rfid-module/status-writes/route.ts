// Host mount for the RFID module's status-writes handler.
import { createRfidRouteHandlers } from '@/modules/rfid'

const handlers = createRfidRouteHandlers()
export const POST = handlers.statusWritesPOST
