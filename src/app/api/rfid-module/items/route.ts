// Host mount for the RFID module's items handler (module boundary: the module
// exports web-standard handlers; Next requires the route file to live here).
import { createRfidRouteHandlers } from '@/modules/rfid'

const handlers = createRfidRouteHandlers()
export const GET = handlers.itemsGET
