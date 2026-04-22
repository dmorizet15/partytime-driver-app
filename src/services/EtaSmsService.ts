const SMS_API_BASE = "https://partytime-sms.vercel.app";

export type SmsStatus =
  | "eta_sent"
  | "customer_ready"
  | "awaiting_instructions"
  | "instructions_received"
  | "opted_out"
  | null;

export interface StopSmsStatus {
  sms_status:               SmsStatus;
  customer_ready:           boolean;
  customer_ready_at:        string | null;
  awaiting_instructions:    boolean;
  customer_instructions:    string | null;
  instructions_received_at: string | null;
  eta_range:                string | null;
  customer_name:            string | null;
  order_id:                 string | null;
  pod_photo_url:            string | null;
}

export interface SendEtaParams {
  stopId:        string;
  stopType:      "delivery" | "pickup";
  customerPhone: string;
  customerName:  string;
  orderId:       string;
  driverLat:     number;
  driverLng:     number;
  destination:   string;
}

export interface SendEtaResult {
  success:   boolean;
  etaRange?: string;
  error?:    string;
}

export async function sendEtaSms(params: SendEtaParams): Promise<SendEtaResult> {
  try {
    const response = await fetch(`${SMS_API_BASE}/api/send-eta`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(params),
    });
    const data = await response.json();
    if (response.ok && data.success) return { success: true, etaRange: data.etaRange };
    return { success: false, error: data.error ?? "Unknown error from SMS API" };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function getStopSmsStatus(stopId: string): Promise<StopSmsStatus | null> {
  try {
    const response = await fetch(`${SMS_API_BASE}/api/stop-status?stopId=${encodeURIComponent(stopId)}`);
    if (!response.ok) return null;
    return response.json();
  } catch { return null; }
}

export function getDriverLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 6000, maximumAge: 30000 }
    );
  });
}
